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
    <div className="mx-auto max-w-lg rounded-3xl border border-ink-100 bg-white p-8 text-center sm:p-10">
      <CalendarClock className="mx-auto size-12 text-primary-600" />
      {enrollments.length > 0 ? (
        <>
          <h2 className="mt-4 text-xl font-bold text-ink-900">Your place is secured</h2>
          <ul className="mt-5 space-y-2 text-left">
            {enrollments.map((e) => (
              <li key={e.id} className="flex items-center gap-2 rounded-2xl bg-primary-50 px-4 py-3 text-sm font-medium text-ink-800">
                <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />
                {e.tier.program.title} — {e.tier.name}
              </li>
            ))}
          </ul>
          <p className="mt-5 text-sm text-ink-500">
            Our learning platform opens soon. We&apos;ll email you the moment your courses are ready — on the web
            and in the Oakvale app.
          </p>
        </>
      ) : (
        <>
          <h2 className="mt-4 text-xl font-bold text-ink-900">Learning opens soon</h2>
          <p className="mt-2 text-sm text-ink-500">
            Early enrolment is open. Secure your place now and we&apos;ll email you as soon as courses are ready.
          </p>
          <ButtonLink href="/enroll" className="mt-6">
            See programmes
          </ButtonLink>
        </>
      )}
      <p className="mt-6 text-xs text-ink-400">
        Questions? <a href={`mailto:${SITE.email}`} className="text-primary-600">{SITE.email}</a>
      </p>
    </div>
  );
}
