import type { Metadata } from "next";
import { BookOpen, CheckCircle2, ChevronDown } from "lucide-react";
import { getSession, isEmailVerified } from "@/lib/auth";
import { getProgramOffers, type ProgramOffer } from "@/lib/lms/offerings";
import { formatNaira } from "@/lib/utils";
import { EmptyState, PageHeader } from "@/components/dashboard/ui";
import { TierCard } from "@/components/enroll/TierCard";

export const metadata: Metadata = { title: "Programmes" };

/**
 * Landing page for learners: every programme Oakvale offers. Opening a programme reveals its plans
 * (with the enrol step for each). `?program=<slug>` opens one on arrival, e.g. after logging in.
 */
export default async function ProgrammesPage({ searchParams }: PageProps<"/programmes">) {
  const params = await searchParams;
  const openSlug = typeof params.program === "string" ? params.program : undefined;

  const session = await getSession();
  const verified = session ? await isEmailVerified(session.userId) : false;
  const programs = await getProgramOffers(session?.userId ?? null);

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <PageHeader
        eyebrow="Programmes"
        title="Courses and programmes"
        description="Explore what Oakvale offers. Open a programme to compare its plans and enrol."
      />

      {programs.length === 0 ? (
        <EmptyState icon={BookOpen} title="No programmes open yet">
          New programmes will appear here when they open for enrolment.
        </EmptyState>
      ) : (
        <div className="space-y-4">
          {programs.map((program) => (
            <ProgrammeRow
              key={program.id}
              program={program}
              open={program.slug === openSlug}
              selectedTier={typeof params.tier === "string" ? params.tier : undefined}
              signedIn={Boolean(session)}
              verified={verified}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ProgrammeRow({
  program,
  open,
  selectedTier,
  signedIn,
  verified,
}: {
  program: ProgramOffer;
  open: boolean;
  selectedTier?: string;
  signedIn: boolean;
  verified: boolean;
}) {
  const { tiers } = program;
  const enrolled = tiers.some((t) => t.enrolled);
  const featuredId = tiers.find((t) => t.slug === selectedTier)?.id ?? program.recommendedTierId;
  const here = `/programmes?program=${encodeURIComponent(program.slug)}${selectedTier ? `&tier=${encodeURIComponent(selectedTier)}` : ""}`;

  return (
    <details open={open} className="group card overflow-hidden">
      <summary className="flex cursor-pointer list-none items-center gap-5 p-5 transition-colors hover:bg-ink-50/60 sm:p-6 [&::-webkit-details-marker]:hidden">
        <div className="hidden size-20 shrink-0 place-items-center overflow-hidden rounded-xl bg-primary-50 text-primary-600 sm:grid">
          {program.coverImage ? (
            <img src={program.coverImage} alt="" className="size-full object-cover" />
          ) : (
            <BookOpen className="size-7" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-xl leading-tight text-ink-950">{program.title}</h2>
            {enrolled && (
              <span className="inline-flex h-6 items-center gap-1 rounded-full bg-emerald-50 px-2.5 text-xs font-medium text-emerald-700">
                <CheckCircle2 className="size-3" /> Enrolled
              </span>
            )}
          </div>
          {program.description && <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-ink-500">{program.description}</p>}
          <p className="mt-2 text-xs text-ink-500">
            {tiers.length > 0
              ? `${tiers.length} ${tiers.length === 1 ? "plan" : "plans"} · From ${formatNaira(program.fromPrice ?? 0)}`
              : "Plans coming soon"}
          </p>
        </div>

        <span className="hidden shrink-0 text-sm font-medium text-primary-700 group-open:hidden md:inline">View plans</span>
        <span className="hidden shrink-0 text-sm font-medium text-primary-700 group-open:md:inline">Hide plans</span>
        <ChevronDown className="size-5 shrink-0 text-ink-400 transition-transform group-open:rotate-180" />
      </summary>

      <div className="border-t border-line bg-canvas/60 p-5 sm:p-6">
        {tiers.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-500">Plans for this programme will be available soon.</p>
        ) : (
          <div
            className={
              tiers.length >= 3 ? "grid items-stretch gap-5 lg:grid-cols-3" : tiers.length === 2 ? "grid items-stretch gap-5 md:grid-cols-2" : "mx-auto grid max-w-md gap-5"
            }
          >
            {tiers.map((tier) => (
              <TierCard
                key={tier.id}
                program={program}
                tier={tier}
                featured={featuredId === tier.id}
                featuredLabel={tier.slug === selectedTier ? "Your selection" : "Recommended"}
                signedIn={signedIn}
                verified={verified}
                here={here}
                className="w-full"
              />
            ))}
          </div>
        )}
      </div>
    </details>
  );
}
