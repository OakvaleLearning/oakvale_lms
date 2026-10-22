import type { Metadata } from "next";
import Link from "next/link";
import { Award, Check, CheckCircle2, Info, Laptop, MailWarning, ShieldCheck, Sparkles } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getSession, isEmailVerified } from "@/lib/auth";
import { getUnlockedCourseIds } from "@/lib/lms/access";
import { cn, formatNaira } from "@/lib/utils";
import { ButtonLink } from "@/components/ui/Button";
import { EmptyState } from "@/components/dashboard/ui";
import { isPrelaunch } from "@/lib/launch";
import { SITE } from "@/content/site";
import { Reveal, Stagger, StaggerItem } from "@/components/motion";
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
  const verified = session ? await isEmailVerified(session.userId) : false;
  const programs = await prisma.program.findMany({
    where: { published: true },
    orderBy: { order: "asc" },
    include: {
      tiers: {
        where: { published: true },
        orderBy: { order: "asc" },
        include: {
          courses: {
            include: {
              course: {
                select: {
                  title: true,
                  published: true,
                  order: true,
                  prerequisiteId: true,
                  prerequisite: { select: { title: true } },
                  certificateEnabled: true,
                  cpdEnabled: true,
                  cpdHours: true,
                  modules: { select: { _count: { select: { lessons: { where: { published: true } } } } } },
                },
              },
            },
          },
        },
      },
    },
  });
  const program = track ? programs.find((p) => p.slug === track) : programs[0];

  // A tier whose courses the learner can already open (e.g. bought "Full")
  // has nothing left to sell them.
  const unlocked = session ? await getUnlockedCourseIds(session.userId) : new Set<string>();

  const here = `/enroll${program ? `?track=${encodeURIComponent(program.slug)}${selectedTier ? `&tier=${encodeURIComponent(selectedTier)}` : ""}` : ""}`;

  if (!program) {
    return (
      <div className="px-4 py-16 sm:px-8">
        <EmptyState
          icon={Info}
          title="Not open for enrolment"
          action={
            <ButtonLink href={SITE.marketingUrl} variant="outline">
              Back to the main site
            </ButtonLink>
          }
        >
          This programme isn&apos;t open for enrolment right now. Please check back soon.
        </EmptyState>
      </div>
    );
  }

  const shortTitle = (title: string) =>
    title.startsWith(program.title) ? title.slice(program.title.length).replace(/^\s*[:\-–—|]\s*/, "") || title : title;

  // What each course costs bought on its own (the cheapest single-course tier),
  // so bundles can show their saving.
  const singlePrice = new Map<string, number>();
  for (const t of program.tiers) {
    if (t.courses.length !== 1) continue;
    const id = t.courses[0].courseId;
    singlePrice.set(id, Math.min(singlePrice.get(id) ?? Infinity, t.price));
  }

  const tiers = program.tiers.map((tier) => {
    const courses = tier.courses
      .filter((tc) => tc.course.published)
      .sort((a, b) => a.course.order - b.course.order);
    const ids = new Set(courses.map((tc) => tc.courseId));
    const separate = courses.reduce((sum, tc) => sum + (singlePrice.get(tc.courseId) ?? NaN), 0);
    const saving = courses.length > 1 && separate > tier.price ? separate - tier.price : 0;
    const needs = courses.find((tc) => tc.course.prerequisiteId && !ids.has(tc.course.prerequisiteId))?.course.prerequisite;
    const tagline =
      tier.description ||
      (courses.length > 1
        ? "Every course in the programme"
        : needs
          ? `The next step after ${shortTitle(needs.title)}`
          : "The place to start your training");
    return {
      tier,
      courses,
      saving,
      needs,
      tagline,
      enrolled: tier.courses.length > 0 && tier.courses.every((tc) => unlocked.has(tc.courseId)),
    };
  });

  const biggest = tiers.reduce((best, t) => (t.courses.length > (best?.courses.length ?? 1) ? t : best), null as (typeof tiers)[number] | null);
  const featured = tiers.find((t) => t.tier.slug === selectedTier) ?? biggest;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-8 sm:py-14">
      {isPrelaunch() && (
        <div className="mb-8 flex items-start gap-3 rounded-xl border border-primary-100 bg-primary-50 px-4 py-3 text-sm text-primary-950">
          <Sparkles className="mt-0.5 size-4 shrink-0 text-primary-600" />
          <p>
            <span className="font-semibold">Early enrolment is open.</span>{" "}
            <span className="text-primary-900/75">
              Secure your place now and we&apos;ll email you the moment your courses are ready.
            </span>
          </p>
        </div>
      )}

      {session && !verified && (
        <div className="mb-8 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <MailWarning className="size-4 shrink-0 text-amber-600" />
          <p className="min-w-0 flex-1">
            <span className="font-semibold">Confirm your email to enrol.</span> We sent a link to {session.email}.
          </p>
          <Link href={`/verify-email?next=${encodeURIComponent(here)}`} className="font-medium text-amber-900 underline underline-offset-2">
            Resend or change
          </Link>
        </div>
      )}

      {programs.length > 1 && (
        <nav aria-label="Programmes" className="mb-10 flex justify-center">
          <div className="inline-flex max-w-full overflow-x-auto rounded-xl [scrollbar-width:none] border border-line bg-white p-1 shadow-card">
            {programs.map((p) => (
              <Link
                key={p.id}
                href={`/enroll?track=${encodeURIComponent(p.slug)}`}
                aria-current={p.id === program.id ? "page" : undefined}
                className={cn(
                  "rounded-lg px-4 py-2 text-sm whitespace-nowrap transition-colors",
                  p.id === program.id ? "bg-primary-600 font-medium text-white" : "text-ink-600 hover:bg-ink-50 hover:text-ink-900"
                )}
              >
                {p.title}
              </Link>
            ))}
          </div>
        </nav>
      )}

      <header className="mx-auto max-w-2xl text-center">
        <div className="eyebrow">Step 1 · Choose your plan</div>
        <h1 className="mt-3 font-display text-3xl leading-tight text-balance text-ink-950 sm:text-[2.6rem]">{program.title}</h1>
        {program.description && (
          <p className="mt-4 text-[15px] leading-relaxed text-pretty text-ink-500">{program.description}</p>
        )}
      </header>

      <Stagger
        key={program.id}
        className={cn(
          "mx-auto mt-12 grid items-stretch gap-5",
          tiers.length >= 3 ? "lg:grid-cols-3" : tiers.length === 2 ? "max-w-3xl md:grid-cols-2" : "max-w-md"
        )}
      >
        {tiers.map(({ tier, courses, saving, needs, tagline, enrolled }) => {
          const isFeatured = featured?.tier.id === tier.id;
          return (
            <StaggerItem
              key={tier.id}
              className={cn(
                "relative flex flex-col rounded-2xl bg-white p-6 sm:p-7",
                isFeatured ? "border-2 border-primary-600 shadow-raised" : "border border-line shadow-card"
              )}
            >
              {isFeatured && (
                <span className="absolute -top-3 left-6 inline-flex h-6 items-center rounded-full bg-primary-600 px-3 text-[11px] font-semibold tracking-wide text-white uppercase">
                  {tier.slug === selectedTier ? "Your selection" : "Recommended"}
                </span>
              )}

              <div className="flex items-start justify-between gap-3">
                <h2 className="text-lg font-semibold tracking-tight text-ink-950">{tier.name}</h2>
                {enrolled ? (
                  <span className="inline-flex h-6 shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2.5 text-xs font-medium text-emerald-700">
                    <CheckCircle2 className="size-3" /> Enrolled
                  </span>
                ) : saving > 0 ? (
                  <span className="inline-flex h-6 shrink-0 items-center rounded-full bg-emerald-50 px-2.5 text-xs font-medium text-emerald-700">
                    Save {formatNaira(saving)}
                  </span>
                ) : null}
              </div>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-500">{tagline}</p>

              <div className="mt-6 flex items-baseline gap-2">
                <span className="font-display text-[2.6rem] leading-none tracking-tight text-ink-950 tabular-nums">
                  {formatNaira(tier.price)}
                </span>
              </div>
              <p className="mt-2 text-xs text-ink-500">
                One-time payment
                {saving > 0 && (
                  <>
                    {" · "}
                    <span className="line-through">{formatNaira(tier.price + saving)}</span> separately
                  </>
                )}
              </p>

              <div className="mt-6">
                {enrolled ? (
                  <ButtonLink href="/learn" variant="outline" size="lg" className="w-full">
                    {isPrelaunch() ? "You're enrolled" : "Go to my courses"}
                  </ButtonLink>
                ) : session && !verified ? (
                  <ButtonLink
                    href={`/verify-email?next=${encodeURIComponent(here)}`}
                    variant={isFeatured ? "primary" : "outline"}
                    size="lg"
                    className="w-full"
                  >
                    Confirm your email to enrol
                  </ButtonLink>
                ) : session ? (
                  <EnrollButton
                    tierId={tier.id}
                    label={`Pay ${formatNaira(tier.price)}`}
                    variant={isFeatured ? "primary" : "dark"}
                  />
                ) : (
                  <ButtonLink
                    href={`/signup?next=${encodeURIComponent(here)}`}
                    variant={isFeatured ? "primary" : "outline"}
                    size="lg"
                    className="w-full"
                  >
                    Create account to enrol
                  </ButtonLink>
                )}
              </div>

              <div className="mt-7 border-t border-line pt-6">
                <p className="text-xs font-semibold tracking-wide text-ink-500 uppercase">What&apos;s included</p>
                <ul className="mt-4 space-y-3.5">
                  {courses.map((tc) => {
                    const lessons = tc.course.modules.reduce((n, m) => n + m._count.lessons, 0);
                    const facts = [
                      lessons > 0 && `${lessons} ${lessons === 1 ? "lesson" : "lessons"}`,
                      tc.course.certificateEnabled && "Certificate",
                      tc.course.cpdEnabled && (tc.course.cpdHours ? `CPD · ${tc.course.cpdHours} hrs` : "CPD certificate"),
                    ].filter(Boolean);
                    return (
                      <li key={tc.courseId} className="flex gap-3">
                        <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-primary-50 text-primary-600">
                          <Check className="size-3" strokeWidth={3} />
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-ink-900">{shortTitle(tc.course.title)}</p>
                          {facts.length > 0 && <p className="mt-0.5 text-xs text-ink-500">{facts.join(" · ")}</p>}
                        </div>
                      </li>
                    );
                  })}
                </ul>
                {needs && (
                  <p className="mt-5 flex items-start gap-2 rounded-lg bg-canvas px-3 py-2.5 text-xs leading-relaxed text-ink-600">
                    <Info className="mt-px size-3.5 shrink-0 text-ink-400" />
                    Requires {shortTitle(needs.title)} to be completed first.
                  </p>
                )}
              </div>
            </StaggerItem>
          );
        })}
      </Stagger>

      {!session && (
        <p className="mt-8 text-center text-sm text-ink-500">
          Already have an account?{" "}
          <Link href={`/login?next=${encodeURIComponent(here)}`} className="font-medium text-primary-600 hover:text-primary-800">
            Log in
          </Link>
        </p>
      )}

      <Reveal delay={0.15} className="mx-auto mt-14 grid max-w-4xl gap-3 sm:grid-cols-3">
        <Assurance icon={ShieldCheck} title="Secure payment">
          Your payment is processed by Paystack.
        </Assurance>
        <Assurance icon={Award} title="Verifiable certificates">
          Employers can check yours <Link href="/verify" className="underline decoration-ink-300 underline-offset-2 hover:text-ink-900">online</Link>.
        </Assurance>
        <Assurance icon={Laptop} title="Learn at your pace">
          Study on any device, whenever suits you.
        </Assurance>
      </Reveal>
    </div>
  );
}

function Assurance({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-line bg-white px-4 py-3.5">
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-canvas text-primary-600">
        <Icon className="size-4" />
      </span>
      <div className="text-sm">
        <p className="font-medium text-ink-900">{title}</p>
        <p className="mt-0.5 leading-relaxed text-ink-500">{children}</p>
      </div>
    </div>
  );
}
