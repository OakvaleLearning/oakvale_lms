import type { Metadata } from "next";
import { CheckCircle2 } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { getUnlockedCourseIds } from "@/lib/lms/access";
import { cn, formatNaira } from "@/lib/utils";
import { ButtonLink } from "@/components/ui/Button";
import { isPrelaunch } from "@/lib/launch";
import { EnrollButton } from "./EnrollButton";

export const metadata: Metadata = { title: "Enrol" };

/**
 * Programme + tier picker. The marketing site links here as
 * /enroll?track=<program-slug>&tier=<tier-slug>.
 */
export default async function EnrollPage({ searchParams }: PageProps<"/enroll">) {
  const params = await searchParams;
  const track = typeof params.track === "string" ? params.track : undefined;
  const selectedTier = typeof params.tier === "string" ? params.tier : undefined;

  const session = await getSession();
  const programs = await prisma.program.findMany({
    where: { published: true, ...(track ? { slug: track } : {}) },
    orderBy: { order: "asc" },
    include: {
      tiers: {
        where: { published: true },
        orderBy: { order: "asc" },
        include: {
          courses: { include: { course: { select: { title: true, published: true } } } },
        },
      },
    },
  });

  // A tier whose courses the learner can already open (e.g. bought "Full")
  // has nothing left to sell them.
  const unlocked = session ? await getUnlockedCourseIds(session.userId) : new Set<string>();

  const here = `/enroll${track ? `?track=${encodeURIComponent(track)}${selectedTier ? `&tier=${encodeURIComponent(selectedTier)}` : ""}` : ""}`;

  return (
    <div className="mx-auto max-w-5xl px-5 py-10 sm:px-8 sm:py-14">
      {isPrelaunch() && (
        <div className="mb-10 rounded-3xl bg-primary-50 px-6 py-5 text-center text-sm text-primary-900">
          <span className="font-bold">Early enrolment is open.</span> Secure your place now — our learning platform
          opens soon, and we&apos;ll email you the moment your courses are ready.
        </div>
      )}
      {programs.length === 0 && (
        <p className="rounded-3xl border border-ink-100 bg-white p-10 text-center text-ink-500">
          This programme isn&apos;t open for enrolment right now.
        </p>
      )}
      {programs.map((program) => (
        <section key={program.id} className="mb-14">
          <h1 className="text-2xl font-bold tracking-tight text-ink-900 sm:text-3xl">{program.title}</h1>
          {program.description && <p className="mt-2 max-w-2xl text-ink-500">{program.description}</p>}

          <div className="mt-8 grid gap-5 md:grid-cols-3">
            {program.tiers.map((tier) => {
              const enrolled =
                tier.courses.length > 0 && tier.courses.every((tc) => unlocked.has(tc.courseId));
              const highlighted = tier.slug === selectedTier;
              return (
                <div
                  key={tier.id}
                  className={cn(
                    "flex flex-col rounded-3xl border bg-white p-6",
                    highlighted ? "border-primary-500 ring-2 ring-primary-200" : "border-ink-100"
                  )}
                >
                  <h2 className="text-lg font-bold text-ink-900">{tier.name}</h2>
                  <div className="mt-2 text-3xl font-black tracking-tight text-ink-900">
                    {formatNaira(tier.price)}
                  </div>
                  {tier.description && <p className="mt-3 text-sm text-ink-500">{tier.description}</p>}
                  <ul className="mt-5 flex-1 space-y-2">
                    {tier.courses
                      .filter((tc) => tc.course.published)
                      .map((tc) => (
                        <li key={tc.courseId} className="flex gap-2 text-sm text-ink-700">
                          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary-600" />
                          {tc.course.title}
                        </li>
                      ))}
                  </ul>
                  <div className="mt-6">
                    {enrolled ? (
                      <ButtonLink href="/learn" variant="outline" className="w-full">
                        {isPrelaunch() ? "You're enrolled" : "Included — go to courses"}
                      </ButtonLink>
                    ) : session ? (
                      <EnrollButton tierId={tier.id} label={`Pay ${formatNaira(tier.price)}`} />
                    ) : (
                      <ButtonLink
                        href={`/signup?next=${encodeURIComponent(here)}`}
                        variant={highlighted ? "primary" : "outline"}
                        className="w-full"
                      >
                        Create account to enrol
                      </ButtonLink>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}
      {!session && (
        <p className="text-center text-sm text-ink-500">
          Already have an account?{" "}
          <a href={`/login?next=${encodeURIComponent(here)}`} className="font-semibold text-primary-600">
            Log in
          </a>
        </p>
      )}
    </div>
  );
}
