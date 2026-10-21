import type { Metadata } from "next";
import { Check } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { getUnlockedCourseIds } from "@/lib/lms/access";
import { cn, formatNaira } from "@/lib/utils";
import { ButtonLink } from "@/components/ui/Button";
import { isPrelaunch } from "@/lib/launch";
import { Stagger, StaggerItem } from "@/components/motion";
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
    <div className="mx-auto max-w-5xl px-5 py-12 sm:px-8 sm:py-16">
      {isPrelaunch() && (
        <div className="mb-12 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 rounded-xl border border-primary-100 bg-primary-50/60 px-6 py-4 text-center text-sm text-primary-950">
          <span className="font-semibold">Early enrolment is open.</span>
          <span className="text-primary-900/75">
            Secure your place now — we&apos;ll email you the moment your courses are ready.
          </span>
        </div>
      )}
      {programs.length === 0 && (
        <p className="card p-10 text-center text-ink-500">
          This programme isn&apos;t open for enrolment right now.
        </p>
      )}
      {programs.map((program) => (
        <section key={program.id} className="mb-16 last:mb-10">
          <div className="max-w-2xl">
            <div className="eyebrow">Enrol</div>
            <h1 className="mt-2 font-display text-3xl leading-tight text-ink-950 sm:text-4xl">
              {program.title}
            </h1>
            {program.description && (
              <p className="mt-4 text-[15px] leading-relaxed text-ink-500">{program.description}</p>
            )}
          </div>

          <Stagger className="mt-10 grid gap-4 md:grid-cols-3">
            {program.tiers.map((tier) => {
              const enrolled =
                tier.courses.length > 0 && tier.courses.every((tc) => unlocked.has(tc.courseId));
              const highlighted = tier.slug === selectedTier;
              return (
                <StaggerItem
                  key={tier.id}
                  className={cn(
                    "flex flex-col rounded-2xl border p-7",
                    highlighted
                      ? "border-primary-950 bg-primary-950 text-white shadow-raised"
                      : "border-line bg-white shadow-card"
                  )}
                >
                  <div className="flex items-center justify-between gap-3">
                    <h2 className={cn("text-[15px] font-semibold", highlighted ? "text-white" : "text-ink-950")}>
                      {tier.name}
                    </h2>
                    {highlighted && (
                      <span className="rounded-md bg-white/10 px-2 py-0.5 text-[11px] font-medium text-primary-100">
                        Selected
                      </span>
                    )}
                  </div>
                  <div
                    className={cn(
                      "mt-5 font-display text-4xl leading-none tabular-nums",
                      highlighted ? "text-white" : "text-ink-950"
                    )}
                  >
                    {formatNaira(tier.price)}
                  </div>
                  {tier.description && (
                    <p className={cn("mt-4 text-sm leading-relaxed", highlighted ? "text-white/65" : "text-ink-500")}>
                      {tier.description}
                    </p>
                  )}
                  <ul
                    className={cn(
                      "mt-6 flex-1 space-y-2.5 border-t pt-6",
                      highlighted ? "border-white/10" : "border-line"
                    )}
                  >
                    {tier.courses
                      .filter((tc) => tc.course.published)
                      .map((tc) => (
                        <li
                          key={tc.courseId}
                          className={cn("flex gap-2.5 text-sm", highlighted ? "text-white/85" : "text-ink-700")}
                        >
                          <Check
                            className={cn("mt-0.5 size-4 shrink-0", highlighted ? "text-primary-300" : "text-primary-600")}
                          />
                          {tc.course.title}
                        </li>
                      ))}
                  </ul>
                  <div className="mt-8">
                    {enrolled ? (
                      <ButtonLink href="/learn" variant={highlighted ? "white" : "outline"} className="w-full">
                        {isPrelaunch() ? "You're enrolled" : "Included — go to courses"}
                      </ButtonLink>
                    ) : session ? (
                      <EnrollButton
                        tierId={tier.id}
                        label={`Pay ${formatNaira(tier.price)}`}
                        variant={highlighted ? "white" : "primary"}
                      />
                    ) : (
                      <ButtonLink
                        href={`/signup?next=${encodeURIComponent(here)}`}
                        variant={highlighted ? "white" : "outline"}
                        className="w-full"
                      >
                        Create account to enrol
                      </ButtonLink>
                    )}
                  </div>
                </StaggerItem>
              );
            })}
          </Stagger>
        </section>
      ))}
      {!session && (
        <p className="text-center text-sm text-ink-500">
          Already have an account?{" "}
          <a
            href={`/login?next=${encodeURIComponent(here)}`}
            className="font-medium text-primary-600 hover:text-primary-800"
          >
            Log in
          </a>
        </p>
      )}
    </div>
  );
}
