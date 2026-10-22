import { CalendarClock, CheckCircle2 } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { SITE } from "@/content/site";
import { ButtonLink } from "@/components/ui/Button";

/** What learners see instead of their courses while PRELAUNCH is on. */
export async function PrelaunchNotice({ userId }: { userId: string }) {
  const enrollments = await prisma.enrollment.findMany({
    where: { userId, status: "ACTIVE" },
    orderBy: { activatedAt: "asc" },
    include: { tier: { include: { program: { select: { title: true } } } } },
  });

  return (
    <div className="card mx-auto max-w-lg p-8 text-center sm:p-12">
      <span className="mx-auto grid size-11 place-items-center rounded-xl border border-line bg-canvas text-primary-600">
        <CalendarClock className="size-5" />
      </span>
      {enrollments.length > 0 ? (
        <>
          <h2 className="mt-5 font-display text-2xl text-ink-950">Your place is secured</h2>
          <ul className="mt-6 divide-y divide-line overflow-hidden rounded-xl border border-line text-left">
            {enrollments.map((e) => (
              <li key={e.id} className="flex items-center gap-2.5 bg-canvas/60 px-4 py-3 text-sm font-medium text-ink-800">
                <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />
                {e.tier.program.title} ({e.tier.name})
              </li>
            ))}
          </ul>
          <p className="mt-6 text-sm leading-relaxed text-ink-500">
            Our learning platform opens soon. We&apos;ll email you the moment your courses are ready, on the web
            and in the Oakvale app.
          </p>
        </>
      ) : (
        <>
          <h2 className="mt-5 font-display text-2xl text-ink-950">Learning opens soon</h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-500">
            Early enrolment is open. Secure your place now and we&apos;ll email you as soon as courses are ready.
          </p>
          <ButtonLink href="/enroll" className="mt-6">
            See programmes
          </ButtonLink>
        </>
      )}
      <p className="mt-8 border-t border-line pt-5 text-xs text-ink-500">
        Questions? <a href={`mailto:${SITE.email}`} className="text-primary-600">{SITE.email}</a>
      </p>
    </div>
  );
}
