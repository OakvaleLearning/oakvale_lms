import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CircleAlert, CircleCheck, CircleX } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { extractSerial, formatIssueDate } from "@/lib/certificate-design";
import { certificateCodes, getDesign } from "@/lib/lms/certificates";
import { CertificateView } from "@/components/certificates/CertificateView";
import { VerifyForm } from "@/components/certificates/VerifyForm";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Certificate check", robots: { index: false } };

export default async function VerifyResultPage({ params }: PageProps<"/verify/[serial]">) {
  const { serial: raw } = await params;
  const serial = extractSerial(decodeURIComponent(raw));
  if (serial && serial !== raw) redirect(`/verify/${serial}`);

  const cert = serial
    ? await prisma.certificate.findUnique({
        where: { serial },
        select: {
          serial: true,
          recipientName: true,
          courseTitle: true,
          programTitle: true,
          score: true,
          issuedAt: true,
          revokedAt: true,
          cpdHours: true,
          cpdProvider: true,
          cpdStatus: true,
          templateId: true,
        },
      })
    : null;

  if (!cert) {
    return (
      <div className="mx-auto max-w-xl space-y-8">
        <Status
          tone="bad"
          title="No certificate found"
          text={`We have no certificate with the ID ${serial ?? decodeURIComponent(raw)}. Check the ID was typed correctly. A certificate that doesn't appear here was not issued by Oakvale Learning.`}
        />
        <div className="card p-5 sm:p-7">
          <h2 className="mb-5 text-[15px] font-semibold text-ink-950">Check another certificate</h2>
          <VerifyForm />
        </div>
      </div>
    );
  }

  const design = await getDesign(cert.templateId);
  const revoked = Boolean(cert.revokedAt);

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      {revoked ? (
        <Status
          tone="warn"
          title="This certificate has been revoked"
          text={`It was issued by Oakvale Learning on ${formatIssueDate(cert.issuedAt)} but withdrawn on ${formatIssueDate(cert.revokedAt!)}. It is no longer valid.`}
        />
      ) : (
        <Status
          tone="good"
          title="Valid certificate"
          text={`This certificate is genuine. It was issued by Oakvale Learning to ${cert.recipientName} on ${formatIssueDate(cert.issuedAt)}.`}
        />
      )}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className={cn("card overflow-hidden p-2 sm:p-3", revoked && "opacity-60 grayscale")}>
          <CertificateView design={design} data={cert} {...certificateCodes(cert.serial)} className="rounded-lg ring-1 ring-line" />
        </div>
        <dl className="card divide-y divide-line text-sm">
          <Row label="Awarded to" value={cert.recipientName} />
          <Row label="Course" value={cert.courseTitle} />
          <Row label="Programme" value={cert.programTitle} />
          <Row label="Issued" value={formatIssueDate(cert.issuedAt)} />
          {cert.score !== null && <Row label="Assessment score" value={`${cert.score}%`} />}
          <Row label="Certificate ID" value={<span className="font-mono tracking-wider">{cert.serial}</span>} />
          {cert.cpdStatus !== "NONE" && (
            <Row
              label="CPD"
              value={`${cert.cpdHours ? `${cert.cpdHours} CPD hours, ` : ""}certified separately by ${cert.cpdProvider || "the CPD issuing body"}`}
            />
          )}
        </dl>
      </div>

      <details className="card group p-5 sm:p-7">
        <summary className="cursor-pointer list-none text-[15px] font-semibold text-ink-950">
          Check another certificate <span className="text-ink-400 group-open:hidden">+</span>
        </summary>
        <div className="mt-5">
          <VerifyForm />
        </div>
      </details>
    </div>
  );
}

function Status({ tone, title, text }: { tone: "good" | "warn" | "bad"; title: string; text: string }) {
  const Icon = { good: CircleCheck, warn: CircleAlert, bad: CircleX }[tone];
  return (
    <div
      role="status"
      className={cn(
        "flex items-start gap-4 rounded-2xl border p-5 sm:p-6",
        tone === "good" && "border-emerald-200 bg-emerald-50 text-emerald-900",
        tone === "warn" && "border-amber-200 bg-amber-50 text-amber-900",
        tone === "bad" && "border-accent-200 bg-accent-50 text-accent-900"
      )}
    >
      <Icon className="mt-0.5 size-6 shrink-0" />
      <div>
        <h1 className="font-display text-xl leading-tight sm:text-2xl">{title}</h1>
        <p className="mt-1.5 text-sm leading-relaxed opacity-85">{text}</p>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="px-5 py-3.5">
      <dt className="text-xs text-ink-500">{label}</dt>
      <dd className="mt-0.5 font-medium text-ink-900">{value}</dd>
    </div>
  );
}
