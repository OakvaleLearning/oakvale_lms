import { Award, Check, CheckCircle2, ClipboardCheck, Info } from "lucide-react";
import { cn, formatNaira } from "@/lib/utils";
import { isPrelaunch } from "@/lib/launch";
import { ButtonLink } from "@/components/ui/Button";
import { EnrollButton } from "@/app/(checkout)/enroll/EnrollButton";
import type { ProgramOffer, TierOffer } from "@/lib/lms/offerings";

/**
 * One plan on sale: price, what it includes and the right next step for this learner
 * (sign up, confirm email, pre-assessment, pay, or go to the modules).
 */
export function TierCard({
  program,
  tier,
  featured,
  featuredLabel,
  signedIn,
  verified,
  here,
  className,
}: {
  program: Pick<ProgramOffer, "certificateEnabled" | "cpdEnabled" | "cpdHours">;
  tier: TierOffer;
  featured: boolean;
  /** Badge on the featured plan, e.g. "Recommended". */
  featuredLabel?: string;
  signedIn: boolean;
  verified: boolean;
  /** Where to return after login, signup or email confirmation. */
  here: string;
  className?: string;
}) {
  const { modules, saving, needs, gate, enrolled } = tier;
  const hasCertificate = program.certificateEnabled && modules.length > 0;

  return (
    <div
      className={cn(
        "relative flex flex-col rounded-2xl bg-white p-6 sm:p-7",
        featured ? "border-2 border-primary-600 shadow-raised" : "border border-line shadow-card",
        className
      )}
    >
      {featured && featuredLabel && (
        <span className="absolute -top-3 left-6 inline-flex h-6 items-center rounded-full bg-primary-600 px-3 text-[11px] font-semibold tracking-wide text-white uppercase">
          {featuredLabel}
        </span>
      )}

      <div className="flex items-start justify-between gap-3">
        <h3 className="text-lg font-semibold tracking-tight text-ink-950">{tier.name}</h3>
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
      <p className="mt-1.5 text-sm leading-relaxed text-ink-500">{tier.tagline}</p>

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
            {isPrelaunch() ? "You're enrolled" : "Go to my modules"}
          </ButtonLink>
        ) : signedIn && gate && !gate.passed ? (
          <ButtonLink href={`/pre-assessment/${tier.id}`} variant={featured ? "primary" : "outline"} size="lg" className="w-full">
            Take the pre-assessment
          </ButtonLink>
        ) : signedIn && !verified ? (
          <ButtonLink
            href={`/verify-email?next=${encodeURIComponent(here)}`}
            variant={featured ? "primary" : "outline"}
            size="lg"
            className="w-full"
          >
            Confirm your email to enrol
          </ButtonLink>
        ) : signedIn ? (
          <EnrollButton tierId={tier.id} label={`Pay ${formatNaira(tier.price)}`} variant={featured ? "primary" : "dark"} />
        ) : (
          <ButtonLink
            href={`/signup?next=${encodeURIComponent(here)}`}
            variant={featured ? "primary" : "outline"}
            size="lg"
            className="w-full"
          >
            Create account to enrol
          </ButtonLink>
        )}
      </div>

      {gate && !enrolled && (
        <p className={cn("mt-3 flex items-start gap-2 text-xs leading-relaxed", gate.passed ? "text-emerald-700" : "text-ink-500")}>
          {gate.passed ? (
            <CheckCircle2 className="mt-px size-3.5 shrink-0" />
          ) : (
            <ClipboardCheck className="mt-px size-3.5 shrink-0 text-ink-400" />
          )}
          {gate.passed ? "Pre-assessment passed. You can enrol." : "Pass a short pre-assessment to unlock enrolment."}
        </p>
      )}

      <div className="mt-7 border-t border-line pt-6">
        <p className="text-xs font-semibold tracking-wide text-ink-500 uppercase">What&apos;s included</p>
        <ul className="mt-4 space-y-3.5">
          {modules.map((mod) => (
            <li key={mod.moduleId} className="flex gap-3">
              <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-primary-50 text-primary-600">
                <Check className="size-3" strokeWidth={3} />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink-900">{mod.title}</p>
                {mod.lessons > 0 && (
                  <p className="mt-0.5 text-xs text-ink-500">{`${mod.lessons} ${mod.lessons === 1 ? "lesson" : "lessons"}`}</p>
                )}
              </div>
            </li>
          ))}
          {hasCertificate && (
            <li className="flex gap-3">
              <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-primary-50 text-primary-600">
                <Award className="size-3" strokeWidth={2.5} />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink-900">Programme certificate</p>
                <p className="mt-0.5 text-xs text-ink-500">
                  {[
                    modules.length > 1 ? "On completing every module" : "On completing the module",
                    program.cpdEnabled && (program.cpdHours ? `CPD · ${program.cpdHours} hrs` : "CPD certificate"),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
            </li>
          )}
        </ul>
        {needs && (
          <p className="mt-5 flex items-start gap-2 rounded-lg bg-canvas px-3 py-2.5 text-xs leading-relaxed text-ink-600">
            <Info className="mt-px size-3.5 shrink-0 text-ink-400" />
            Requires {needs} to be completed first.
          </p>
        )}
      </div>
    </div>
  );
}
