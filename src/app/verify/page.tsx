import type { Metadata } from "next";
import { VerifyForm } from "@/components/certificates/VerifyForm";

export const metadata: Metadata = {
  title: "Verify a certificate",
  description: "Check that an Oakvale Learning certificate is genuine.",
};

export default function VerifyPage() {
  return (
    <div className="mx-auto max-w-xl">
      <div className="eyebrow">Verify</div>
      <h1 className="mt-2 font-display text-3xl leading-tight text-ink-950 sm:text-[2.125rem]">Check a certificate</h1>
      <p className="mt-3 text-[15px] leading-relaxed text-ink-500">
        Every Oakvale Learning certificate has a QR code and a unique ID. Upload a picture of the certificate, or type its
        ID, to see whether it is genuine and still valid.
      </p>
      <div className="card mt-8 p-5 sm:p-7">
        <VerifyForm />
      </div>
    </div>
  );
}
