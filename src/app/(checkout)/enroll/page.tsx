import type { Metadata } from "next";
import Link from "next/link";
import { Award, BellRing, Info, Laptop, MailWarning, ShieldCheck } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { getSession, isEmailVerified } from "@/lib/auth";
import { getProgramOffers } from "@/lib/lms/offerings";
import { cn } from "@/lib/utils";
import { ButtonLink } from "@/components/ui/Button";
import { EmptyState } from "@/components/dashboard/ui";
import { isPrelaunch } from "@/lib/launch";
import { SITE } from "@/content/site";
import { Reveal, Stagger, StaggerItem } from "@/components/motion";
import { TierCard } from "@/components/enroll/TierCard";

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
  const programs = await getProgramOffers(session?.userId ?? null);
  const program = track ? programs.find((p) => p.slug === track) : programs[0];

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

  const featuredId = program.tiers.find((t) => t.slug === selectedTier)?.id ?? program.recommendedTierId;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-8 sm:py-14">
      {isPrelaunch() && (
        <div className="mb-8 flex items-start gap-3 rounded-xl border border-primary-100 bg-primary-50 px-4 py-3 text-sm text-primary-950">
          <BellRing className="mt-0.5 size-4 shrink-0 text-primary-600" />
          <p>
            <span className="font-semibold">Early enrolment is open.</span>{" "}
            <span className="text-primary-900/75">
              Secure your place now and we&apos;ll email you the moment your modules are ready.
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
          program.tiers.length >= 3 ? "lg:grid-cols-3" : program.tiers.length === 2 ? "max-w-3xl md:grid-cols-2" : "max-w-md"
        )}
      >
        {program.tiers.map((tier) => (
          <StaggerItem key={tier.id} className="flex">
            <TierCard
              program={program}
              tier={tier}
              featured={featuredId === tier.id}
              featuredLabel={tier.slug === selectedTier ? "Your selection" : "Recommended"}
              signedIn={Boolean(session)}
              verified={verified}
              here={here}
              className="w-full"
            />
          </StaggerItem>
        ))}
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
