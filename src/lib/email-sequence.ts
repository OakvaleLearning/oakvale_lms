import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { EMAIL_BATCH_SIZE, sendEmailBatch } from "@/lib/email";
import { isPrelaunch, launchDate } from "@/lib/launch";
import {
  careFutureEmail,
  launchEveEmail,
  toolkitEmail,
  type LearnerEmailData,
  type RenderedEmail,
} from "@/lib/email-templates";

/**
 * The scheduled part of the pre-launch email sequence. Email 1 goes out
 * straight after payment (see payments.ts); these run from a daily cron:
 *
 *   prelaunch-care     ~2 days after enrolling          (Email 2)
 *   prelaunch-toolkit  ~4 days after, ≥2 days after #2   (Email 3)
 *   launch-eve         the day before launch, to all    (Email 4)
 *
 * Emails 2 and 3 stop once launch eve arrives; learners who enrol late skip
 * straight to Email 4.
 */

export const SEQUENCE_KEYS = ["prelaunch-care", "prelaunch-toolkit", "launch-eve"] as const;
export type SequenceKey = (typeof SEQUENCE_KEYS)[number];

const DAY = 24 * 60 * 60 * 1000;
const pause = () => new Promise((r) => setTimeout(r, 600)); // Resend: 2 requests/second

export const TEMPLATES: Record<SequenceKey, (learner: LearnerEmailData) => RenderedEmail> = {
  "prelaunch-care": careFutureEmail,
  "prelaunch-toolkit": toolkitEmail,
  "launch-eve": launchEveEmail,
};

/** Learners with an active enrolment, with what the templates and timing rules need. */
async function loadLearners(take?: number) {
  const users = await prisma.user.findMany({
    where: { role: "LEARNER", enrollments: { some: { status: "ACTIVE" } } },
    orderBy: { createdAt: "asc" },
    take,
    select: {
      id: true,
      name: true,
      email: true,
      emailDeliveries: { select: { key: true, sentAt: true } },
      enrollments: {
        where: { status: "ACTIVE" },
        orderBy: { createdAt: "asc" },
        select: {
          activatedAt: true,
          createdAt: true,
          tier: {
            select: {
              name: true,
              program: { select: { slug: true, title: true } },
              courses: {
                select: {
                  course: {
                    select: {
                      title: true,
                      order: true,
                      published: true,
                      modules: { orderBy: [{ order: "asc" }, { createdAt: "asc" }], take: 1, select: { title: true } },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  return users.map((u) => {
    const enrolments = u.enrollments.map((e) => {
      const course = e.tier.courses
        .map((tc) => tc.course)
        .filter((c) => c.published)
        .sort((a, b) => a.order - b.order)[0];
      return {
        programSlug: e.tier.program.slug,
        programTitle: e.tier.program.title,
        tierName: e.tier.name,
        firstCourseTitle: course?.title,
        firstModuleTitle: course?.modules[0]?.title,
      };
    });
    const enrolledAt = new Date(Math.min(...u.enrollments.map((e) => (e.activatedAt ?? e.createdAt).getTime())));
    const sent = new Map(u.emailDeliveries.map((d) => [d.key, d.sentAt]));
    return { id: u.id, data: { name: u.name, email: u.email, enrolments }, enrolledAt, sent };
  });
}

type Learner = Awaited<ReturnType<typeof loadLearners>>[number];

/** The one sequence email (if any) this learner should get now. */
function dueKey(learner: Learner, now: Date): SequenceKey | null {
  const launch = launchDate();
  const eve = new Date(launch.getTime() - DAY);
  const { enrolledAt, sent } = learner;

  if (now >= eve) {
    return now < launch && !sent.has("launch-eve") ? "launch-eve" : null;
  }
  if (!isPrelaunch()) return null;

  if (!sent.has("prelaunch-care")) {
    return now.getTime() >= enrolledAt.getTime() + 2 * DAY ? "prelaunch-care" : null;
  }
  if (!sent.has("prelaunch-toolkit")) {
    const careAt = sent.get("prelaunch-care")!.getTime();
    const due = Math.max(enrolledAt.getTime() + 4 * DAY, careAt + 2 * DAY);
    return now.getTime() >= due ? "prelaunch-toolkit" : null;
  }
  return null;
}

/** Claim a delivery row; false if someone else already sent (or is sending) it. */
async function claim(userId: string, key: SequenceKey): Promise<boolean> {
  try {
    await prisma.emailDelivery.create({ data: { userId, key } });
    return true;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return false;
    throw err;
  }
}

export interface SequenceRunResult {
  sent: Record<SequenceKey, number>;
  failed: number;
  remaining: number;
}

/**
 * Send every email that's due, in batches of 100. Each learner's row is
 * claimed first so overlapping runs never double-send; a failed batch is
 * released and retried on the next run. Stops early when out of time.
 */
export async function runEmailSequence({
  now = new Date(),
  timeBudgetMs = 240_000,
}: { now?: Date; timeBudgetMs?: number } = {}): Promise<SequenceRunResult> {
  const started = Date.now();
  const learners = await loadLearners();
  const due = learners.flatMap((l) => {
    const key = dueKey(l, now);
    return key ? [{ learner: l, key }] : [];
  });

  const sent: Record<SequenceKey, number> = { "prelaunch-care": 0, "prelaunch-toolkit": 0, "launch-eve": 0 };
  let failed = 0;
  let processed = 0;

  for (let i = 0; i < due.length; i += EMAIL_BATCH_SIZE) {
    if (Date.now() - started > timeBudgetMs) break;
    const chunk = due.slice(i, i + EMAIL_BATCH_SIZE);
    processed += chunk.length;

    const claimed: typeof chunk = [];
    for (const item of chunk) if (await claim(item.learner.id, item.key)) claimed.push(item);
    if (claimed.length === 0) continue;

    const ok = await sendEmailBatch(
      claimed.map(({ learner, key }) => ({ to: learner.data.email, ...TEMPLATES[key](learner.data) }))
    );
    if (ok) {
      for (const { key } of claimed) sent[key]++;
    } else {
      failed += claimed.length;
      await prisma.emailDelivery.deleteMany({
        where: { OR: claimed.map(({ learner, key }) => ({ userId: learner.id, key })) },
      });
    }
    await pause();
  }

  return { sent, failed, remaining: due.length - processed };
}

/** Sample data for previews: a real learner if one exists, otherwise placeholders. */
export async function previewLearner(fallback: { name: string; email: string }): Promise<LearnerEmailData> {
  const [learner] = await loadLearners(1);
  if (learner) return { ...learner.data, name: fallback.name, email: fallback.email };

  const tier = await prisma.tier.findFirst({
    orderBy: [{ program: { order: "asc" } }, { order: "asc" }],
    select: { name: true, program: { select: { slug: true, title: true } } },
  });
  return {
    ...fallback,
    enrolments: [
      {
        programSlug: tier?.program.slug ?? "adult-care",
        programTitle: tier?.program.title ?? "Adult & Elderly Care",
        tierName: tier?.name ?? "Foundation",
      },
    ],
  };
}

/** How many learners have received each scheduled email. */
export async function sequenceStats(): Promise<Record<SequenceKey, number>> {
  const rows = await prisma.emailDelivery.groupBy({
    by: ["key"],
    where: { key: { in: [...SEQUENCE_KEYS] } },
    _count: true,
  });
  return Object.fromEntries(SEQUENCE_KEYS.map((k) => [k, rows.find((r) => r.key === k)?._count ?? 0])) as Record<
    SequenceKey,
    number
  >;
}
