import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Award, CheckCircle2, Circle, Clock, Mail, Send } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { getUnlockedCourseIds } from "@/lib/lms/access";
import { certificateCodes, getCertificateProgress, getDesign, syncCertificates, verifyUrl } from "@/lib/lms/certificates";
import { formatIssueDate } from "@/lib/certificate-design";
import { CertificateView } from "@/components/certificates/CertificateView";
import { CopyLinkButton } from "@/components/certificates/CertificateActions";
import { ButtonLink } from "@/components/ui/Button";
import { EmptyState, PageHeader } from "@/components/dashboard/ui";
import { ProgressBar } from "@/components/learn/ProgressBar";
import { Reveal, Stagger, StaggerItem } from "@/components/motion";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Certificates" };

export default async function CertificatesPage() {
  const session = await requireSession("/learn/certificates");
  // Picks up certificates earned before a course had them switched on.
  await syncCertificates(session.userId);

  const [certificates, unlocked] = await Promise.all([
    prisma.certificate.findMany({
      where: { userId: session.userId },
      orderBy: { issuedAt: "desc" },
      include: { course: { select: { slug: true, program: { select: { slug: true } } } } },
    }),
    getUnlockedCourseIds(session.userId),
  ]);

  const earned = new Set(certificates.map((c) => c.courseId));
  const pendingCourses = await prisma.course.findMany({
    where: { id: { in: [...unlocked].filter((id) => !earned.has(id)) }, published: true, certificateEnabled: true },
    orderBy: [{ program: { order: "asc" } }, { order: "asc" }],
    select: { id: true, slug: true, title: true, cpdEnabled: true, cpdProvider: true, program: { select: { slug: true, title: true } } },
  });
  const working = (
    await Promise.all(
      pendingCourses.map(async (c) => ({ course: c, progress: (await getCertificateProgress(session.userId, c.id))! }))
    )
  ).filter((w) => w.progress.lessonsTotal > 0);
  const designs = new Map(
    await Promise.all(
      [...new Set(certificates.map((c) => c.templateId))].map(async (id) => [id, await getDesign(id)] as const)
    )
  );

  if (certificates.length === 0 && working.length === 0) {
    return (
      <div className="mx-auto max-w-5xl space-y-10">
        <PageHeader eyebrow="Certificates" title="Your certificates" />
        <EmptyState icon={Award} title="No certificates yet" action={<ButtonLink href="/learn">Go to my learning</ButtonLink>}>
          Finish a course and pass its quizzes to earn a certificate. It will appear here.
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-10">
      <PageHeader
        eyebrow="Certificates"
        title="Your certificates"
        description="Download your certificates, and share their verification link with employers."
      />

      {certificates.length > 0 && (
        <Stagger className="space-y-4">
          {certificates.map((cert) => (
            <StaggerItem key={cert.id} as="section" className="card overflow-hidden">
              <div className="flex flex-col gap-5 p-4 sm:flex-row sm:p-5">
                <Link
                  href={`/certificates/${cert.serial}`}
                  className="block shrink-0 overflow-hidden rounded-lg ring-1 ring-line transition-shadow hover:shadow-raised sm:w-64"
                  aria-label={`View certificate for ${cert.courseTitle}`}
                >
                  <CertificateView design={designs.get(cert.templateId)!} data={cert} {...certificateCodes(cert.serial)} />
                </Link>
                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="flex flex-wrap items-center gap-2">
                    {cert.revokedAt ? (
                      <span className="inline-flex h-6 items-center rounded-full bg-amber-50 px-2.5 text-xs font-medium text-amber-800">
                        Revoked
                      </span>
                    ) : (
                      <span className="inline-flex h-6 items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 text-xs font-medium text-emerald-700">
                        <CheckCircle2 className="size-3" /> Earned
                      </span>
                    )}
                    <span className="text-xs text-ink-500">{cert.programTitle}</span>
                  </div>
                  <h2 className="mt-2 text-[17px] font-semibold leading-snug tracking-tight text-ink-950">{cert.courseTitle}</h2>
                  <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
                    <div>
                      <dt className="text-xs text-ink-500">Issued</dt>
                      <dd className="font-medium text-ink-900">{formatIssueDate(cert.issuedAt)}</dd>
                    </div>
                    {cert.score !== null && (
                      <div>
                        <dt className="text-xs text-ink-500">Score</dt>
                        <dd className="font-medium tabular-nums text-ink-900">{cert.score}%</dd>
                      </div>
                    )}
                    <div>
                      <dt className="text-xs text-ink-500">Certificate ID</dt>
                      <dd className="font-mono font-medium tracking-wider text-ink-900">{cert.serial}</dd>
                    </div>
                  </dl>
                  <div className="mt-5 flex flex-wrap gap-2 sm:mt-auto sm:pt-5">
                    <ButtonLink href={`/certificates/${cert.serial}`} size="sm">
                      View and download
                    </ButtonLink>
                    <CopyLinkButton url={verifyUrl(cert.serial)} size="sm" />
                  </div>
                </div>
              </div>
              {cert.cpdStatus !== "NONE" && (
                <CpdNotice
                  status={cert.cpdStatus}
                  provider={cert.cpdProvider || "the CPD issuing body"}
                  hours={cert.cpdHours}
                  updatedAt={cert.cpdUpdatedAt}
                  email={session.email}
                />
              )}
            </StaggerItem>
          ))}
        </Stagger>
      )}

      {working.length > 0 && (
        <section>
          <h2 className="font-display text-xl text-ink-950">Working towards</h2>
          <p className="mt-1 text-sm text-ink-500">What&apos;s left before each certificate is issued.</p>
          <Reveal delay={0.05} className="mt-4 grid gap-4 sm:grid-cols-2">
            {working.map(({ course, progress }) => {
              const lessonsOk = progress.lessonsTotal > 0 && progress.lessonsDone === progress.lessonsTotal;
              const scoreOk = progress.score === null || progress.score >= progress.passMark;
              const percent = progress.lessonsTotal ? Math.round((progress.lessonsDone / progress.lessonsTotal) * 100) : 0;
              const untaken = progress.quizzes - progress.quizzesTaken;
              return (
                <Link
                  key={course.id}
                  href={`/learn/${course.program.slug}/${course.slug}`}
                  className="card group flex flex-col p-5 transition-colors hover:border-ink-300"
                >
                  <span className="text-xs text-ink-500">{course.program.title}</span>
                  <h3 className="mt-1 text-[15px] font-semibold text-ink-950">{course.title}</h3>
                  <ProgressBar percent={percent} className="mt-4" />
                  <ul className="mt-4 space-y-2 text-sm">
                    <Requirement done={lessonsOk}>
                      Complete every lesson · {progress.lessonsDone} of {progress.lessonsTotal}
                    </Requirement>
                    {progress.score !== null && (
                      <Requirement done={scoreOk}>
                        Quiz average of {progress.passMark}% or more · yours is {progress.score}%
                        {untaken > 0 && (
                          <span className="block text-xs text-ink-500">
                            {untaken} {untaken === 1 ? "quiz" : "quizzes"} not taken yet, counted as 0%
                          </span>
                        )}
                        {lessonsOk && !scoreOk && untaken === 0 && (
                          <span className="block text-xs text-ink-500">Retake a quiz to raise your average.</span>
                        )}
                      </Requirement>
                    )}
                  </ul>
                  {course.cpdEnabled && (
                    <p className="mt-4 rounded-lg bg-ink-50 px-3 py-2 text-xs leading-relaxed text-ink-600">
                      Includes a CPD certificate from {course.cpdProvider || "an accredited CPD body"}.
                    </p>
                  )}
                  <span className="mt-auto flex items-center justify-between pt-5 text-sm font-medium text-primary-700">
                    Continue course
                    <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </Link>
              );
            })}
          </Reveal>
        </section>
      )}
    </div>
  );
}

function Requirement({ done, children }: { done: boolean; children: React.ReactNode }) {
  const Icon = done ? CheckCircle2 : Circle;
  return (
    <li className="flex items-start gap-2">
      <Icon className={cn("mt-0.5 size-4 shrink-0", done ? "text-emerald-600" : "text-ink-300")} />
      <span className={done ? "text-ink-700" : "text-ink-800"}>{children}</span>
    </li>
  );
}

function CpdNotice({
  status,
  provider,
  hours,
  updatedAt,
  email,
}: {
  status: "PENDING" | "SUBMITTED" | "ISSUED" | "NONE";
  provider: string;
  hours: number | null;
  updatedAt: Date | null;
  email: string;
}) {
  const { icon: Icon, title, text } = {
    NONE: { icon: Clock, title: "", text: "" },
    PENDING: {
      icon: Clock,
      title: "CPD certificate: being arranged",
      text: `We'll send your details to ${provider}. They'll email your CPD certificate to ${email} directly.`,
    },
    SUBMITTED: {
      icon: Send,
      title: "CPD certificate: requested",
      text: `Your details went to ${provider}${updatedAt ? ` on ${formatIssueDate(updatedAt)}` : ""}. Look out for their email at ${email}.`,
    },
    ISSUED: {
      icon: Mail,
      title: "CPD certificate: issued",
      text: `${provider} has issued your CPD certificate and emailed it to ${email}. Check your spam folder if you can't find it.`,
    },
  }[status];
  return (
    <div className="flex items-start gap-3 border-t border-line bg-canvas/60 px-4 py-3.5 sm:px-5">
      <Icon className="mt-0.5 size-4 shrink-0 text-ink-500" />
      <div className="text-sm">
        <p className="font-medium text-ink-900">
          {title}
          {hours ? <span className="font-normal text-ink-500"> · {hours} CPD hours</span> : null}
        </p>
        <p className="mt-0.5 leading-relaxed text-ink-600">{text}</p>
      </div>
    </div>
  );
}
