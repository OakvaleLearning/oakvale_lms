import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { certificateCodes, getDesign, verifyUrl } from "@/lib/lms/certificates";
import { CertificateView } from "@/components/certificates/CertificateView";
import { CopyLinkButton, DownloadButton } from "@/components/certificates/CertificateActions";

export const metadata: Metadata = { title: "Certificate", robots: { index: false } };

/** A learner's own certificate, full size, ready to print or save as PDF. */
export default async function CertificatePage({ params }: PageProps<"/certificates/[serial]">) {
  const { serial } = await params;
  const session = await requireSession(`/certificates/${serial}`);
  const cert = await prisma.certificate.findUnique({ where: { serial } });
  if (!cert || (cert.userId !== session.userId && session.role !== "ADMIN")) notFound();

  const design = await getDesign(cert.templateId);
  const back = session.role === "ADMIN" ? "/admin/certificates" : "/learn/certificates";

  return (
    <div className="min-h-screen bg-canvas print:min-h-0 print:bg-white">
      {/* One A4 landscape sheet with no browser margins. */}
      <style>{`@page { size: A4 landscape; margin: 0; }`}</style>

      <header className="border-b border-line bg-white print:hidden">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-8">
          <Link href={back} className="inline-flex items-center gap-1.5 text-sm text-ink-500 transition-colors hover:text-ink-900">
            <ArrowLeft className="size-4" /> Certificates
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <CopyLinkButton url={verifyUrl(cert.serial)} size="sm" />
            <DownloadButton size="sm" />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-8 print:m-0 print:max-w-none print:p-0">
        {cert.revokedAt && (
          <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 print:hidden">
            This certificate has been revoked and no longer verifies as valid.
          </p>
        )}
        <div className="shadow-raised ring-1 ring-line print:w-[296mm] print:shadow-none print:ring-0">
          <CertificateView design={design} data={cert} {...certificateCodes(cert.serial)} />
        </div>
        <p className="mt-5 flex items-start gap-2 text-sm text-ink-500 print:hidden">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-ink-400" />
          <span>
            Anyone can check this certificate by scanning its QR code or entering <span className="font-mono">{cert.serial}</span> at{" "}
            <Link href="/verify" className="text-primary-700 underline underline-offset-2">
              {verifyUrl("").replace(/\/$/, "")}
            </Link>
            . Choose “Save as PDF” in the print window to download it.
          </span>
        </p>
      </main>
    </div>
  );
}
