import "server-only";
import { randomInt } from "node:crypto";
import bwipjs from "bwip-js/node";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { appUrl } from "@/lib/email-templates";
import { sendCertificateEmail } from "@/lib/emails";
import { DEFAULT_DESIGN, toDesign, type TemplateDesign } from "@/lib/certificate-design";
import { getUnlockedModuleIds } from "./access";

/**
 * Programme certificates. A learner earns one when they have completed every
 * published module their active tiers unlock in a programme, and the average
 * of their best quiz scores across those modules reaches the programme's pass
 * mark. The modules covered are the certificate's scope: a learner who upgrades
 * (e.g. Foundation, then Professional) and finishes the new modules earns a new
 * certificate covering both. Programmes with CPD also queue a CPD request, which
 * the admin sends to the issuing body; that body emails its certificate to the
 * learner.
 *
 * Certificates issued per module before November 2026 (moduleId set, scope
 * null) stay valid; no new ones are issued.
 */

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const block = () => Array.from({ length: 4 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
const newSerial = () => `OAK-${block()}-${block()}`;

export const verifyUrl = (serial: string) => `${appUrl()}/verify/${serial}`;

/** QR code (links to the verify page) and Code 128 barcode (the ID), as SVG markup. */
export function certificateCodes(serial: string) {
  return {
    qrSvg: bwipjs.toSVG({ bcid: "qrcode", text: verifyUrl(serial), scale: 3 }),
    barcodeSvg: bwipjs.toSVG({ bcid: "code128", text: serial, height: 9, scale: 2, includetext: false }),
  };
}

/** A template's design, falling back to the default template, then the built-in one. */
export async function getDesign(templateId: string | null | undefined): Promise<TemplateDesign> {
  const template =
    (templateId && (await prisma.certificateTemplate.findUnique({ where: { id: templateId } }))) ||
    (await prisma.certificateTemplate.findFirst({ where: { isDefault: true } })) ||
    (await prisma.certificateTemplate.findFirst({ orderBy: { createdAt: "asc" } }));
  return template ? toDesign(template) : DEFAULT_DESIGN;
}

export interface CertificateModuleProgress {
  id: string;
  slug: string;
  title: string;
  lessonsDone: number;
  lessonsTotal: number;
}

export interface CertificateProgress {
  enabled: boolean;
  /** The modules the certificate covers: published modules the learner's tiers unlock that have lessons. */
  modules: CertificateModuleProgress[];
  /** Sorted, comma-joined module IDs (Certificate.scope). */
  scope: string;
  lessonsDone: number;
  lessonsTotal: number;
  /** Quizzes in those modules and how many the learner has attempted. */
  quizzes: number;
  quizzesTaken: number;
  /** Average of best quiz scores, counting untaken quizzes as 0; null without quizzes. */
  score: number | null;
  passMark: number;
  eligible: boolean;
}

const scopeOf = (moduleIds: string[]) => [...moduleIds].sort().join(",");

/** "A", "A and B", "A, B and C". */
function joinTitles(titles: string[]): string {
  return titles.length <= 1 ? (titles[0] ?? "") : `${titles.slice(0, -1).join(", ")} and ${titles[titles.length - 1]}`;
}

/** Where a learner stands against a programme's certificate requirements. */
export async function getCertificateProgress(userId: string, programId: string): Promise<CertificateProgress | null> {
  const [program, unlocked] = await Promise.all([
    prisma.program.findUnique({
      where: { id: programId },
      select: { certificateEnabled: true, certificatePassMark: true },
    }),
    getUnlockedModuleIds(userId),
  ]);
  if (!program) return null;

  const mods = await prisma.module.findMany({
    where: { programId, published: true, id: { in: [...unlocked] } },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      slug: true,
      title: true,
      topics: {
        select: {
          lessons: {
            where: { published: true },
            select: {
              quiz: { select: { _count: { select: { questions: true } } } },
              progress: { where: { userId }, select: { status: true, score: true } },
            },
          },
        },
      },
    },
  });

  const modules: CertificateModuleProgress[] = [];
  const lessons: (typeof mods)[number]["topics"][number]["lessons"] = [];
  for (const mod of mods) {
    const own = mod.topics.flatMap((t) => t.lessons);
    // A module with no lessons yet can't be completed, so it isn't required.
    if (own.length === 0) continue;
    lessons.push(...own);
    modules.push({
      id: mod.id,
      slug: mod.slug,
      title: mod.title,
      lessonsDone: own.filter((l) => l.progress[0]?.status === "COMPLETED").length,
      lessonsTotal: own.length,
    });
  }

  // A quiz with no questions can't be taken, so it doesn't count. (A lesson's score is its quiz's score.)
  const quizzes = lessons.filter((l) => (l.quiz?._count.questions ?? 0) > 0);
  const lessonsDone = modules.reduce((n, m) => n + m.lessonsDone, 0);
  const score = quizzes.length
    ? Math.round(quizzes.reduce((sum, l) => sum + (l.progress[0]?.score ?? 0), 0) / quizzes.length)
    : null;

  return {
    enabled: program.certificateEnabled,
    modules,
    scope: scopeOf(modules.map((m) => m.id)),
    lessonsDone,
    lessonsTotal: lessons.length,
    quizzes: quizzes.length,
    quizzesTaken: quizzes.filter((l) => l.progress[0]?.score !== null && l.progress[0]?.score !== undefined).length,
    score,
    passMark: program.certificatePassMark,
    eligible:
      program.certificateEnabled &&
      lessons.length > 0 &&
      lessonsDone === lessons.length &&
      (score === null || score >= program.certificatePassMark),
  };
}

/** The learner's programme certificate that already covers every module in `scope`, if any. */
export async function findCoveringCertificate(userId: string, programId: string, scope: string) {
  const wanted = scope.split(",").filter(Boolean);
  const certificates = await prisma.certificate.findMany({
    where: { userId, programId, scope: { not: null } },
    orderBy: { issuedAt: "desc" },
  });
  return certificates.find((c) => {
    const covered = new Set(c.scope!.split(","));
    return wanted.every((id) => covered.has(id));
  }) ?? null;
}

/** Issue the programme certificate if the learner qualifies and doesn't have one covering the same modules. */
export async function issueCertificateIfEligible(userId: string, programId: string) {
  const progress = await getCertificateProgress(userId, programId);
  if (!progress?.eligible) return null;

  const existing = await findCoveringCertificate(userId, programId, progress.scope);
  if (existing) return existing;

  const [user, program] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { name: true, email: true, role: true } }),
    prisma.program.findUniqueOrThrow({
      where: { id: programId },
      select: { title: true, certificateTemplateId: true, cpdEnabled: true, cpdProvider: true, cpdHours: true },
    }),
  ]);
  // Admins previewing a programme don't earn certificates.
  if (user.role === "ADMIN") return null;

  const templateId =
    program.certificateTemplateId ??
    (await prisma.certificateTemplate.findFirst({ where: { isDefault: true }, select: { id: true } }))?.id ??
    null;

  let certificate = null;
  for (let attempt = 0; !certificate && attempt < 5; attempt++) {
    try {
      certificate = await prisma.certificate.create({
        data: {
          serial: newSerial(),
          userId,
          programId,
          scope: progress.scope,
          templateId,
          recipientName: user.name,
          moduleTitle: joinTitles(progress.modules.map((m) => m.title)),
          programTitle: program.title,
          score: progress.score,
          ...(program.cpdEnabled
            ? { cpdStatus: "PENDING", cpdProvider: program.cpdProvider || null, cpdHours: program.cpdHours, cpdUpdatedAt: new Date() }
            : {}),
        },
      });
    } catch (err) {
      if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")) throw err;
      // Either the serial collided (try another) or a parallel request already issued it.
      const raced = await prisma.certificate.findUnique({
        where: { userId_programId_scope: { userId, programId, scope: progress.scope } },
      });
      if (raced) return raced;
    }
  }
  if (!certificate) throw new Error("Could not allocate a certificate ID.");

  if (await sendCertificateEmail(user, { ...certificate, link: `${appUrl()}/certificates/${certificate.serial}` })) {
    await prisma.certificate.update({ where: { id: certificate.id }, data: { emailSentAt: new Date() } });
  }
  return certificate;
}

/** After a lesson is completed: issue its programme's certificate if that finished the programme. */
export async function checkCertificateAfterLesson(userId: string, lessonId: string) {
  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    select: { topic: { select: { module: { select: { programId: true } } } } },
  });
  if (!lesson) return;
  try {
    await issueCertificateIfEligible(userId, lesson.topic.module.programId);
  } catch (err) {
    console.error("[certificates] issue failed:", err);
  }
}

/** Issue any certificates a learner qualifies for but is missing (e.g. after an admin turned them on). */
export async function syncCertificates(userId: string) {
  const moduleIds = await getUnlockedModuleIds(userId);
  const programs = await prisma.program.findMany({
    where: { certificateEnabled: true, modules: { some: { id: { in: [...moduleIds] } } } },
    select: { id: true },
  });
  for (const p of programs) {
    try {
      await issueCertificateIfEligible(userId, p.id);
    } catch (err) {
      console.error("[certificates] sync failed:", err);
    }
  }
}

/** Admin: issue to everyone who has already met a programme's requirements. */
export async function issueEligibleForProgram(programId: string): Promise<number> {
  const learners = await prisma.enrollment.findMany({
    where: { status: "ACTIVE", tier: { programId } },
    distinct: ["userId"],
    select: { userId: true },
  });
  let issued = 0;
  for (const { userId } of learners) {
    const before = await prisma.certificate.count({ where: { userId, programId } });
    await issueCertificateIfEligible(userId, programId);
    if ((await prisma.certificate.count({ where: { userId, programId } })) > before) issued++;
  }
  return issued;
}
