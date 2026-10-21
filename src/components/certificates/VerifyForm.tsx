"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ImageUp, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { FormError, inputClass } from "@/components/ui/TextField";
import { extractSerial } from "@/lib/certificate-design";
import { cn } from "@/lib/utils";

/** Chrome/Android ship a native detector that also reads barcodes; jsQR covers the rest. */
type Detector = { detect(source: ImageBitmapSource): Promise<{ rawValue: string }[]> };
declare global {
  interface Window {
    BarcodeDetector?: new (opts: { formats: string[] }) => Detector;
  }
}

async function loadImage(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Find a certificate ID in a photo or screenshot of a certificate. */
async function readCertificateImage(file: File): Promise<string | null> {
  const img = await loadImage(file);

  if (window.BarcodeDetector) {
    try {
      const found = await new window.BarcodeDetector({ formats: ["qr_code", "code_128"] }).detect(img);
      for (const code of found) {
        const serial = extractSerial(code.rawValue);
        if (serial) return serial;
      }
    } catch {
      /* unsupported format list on this device; fall through to jsQR */
    }
  }

  const { default: jsQR } = await import("jsqr");
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  // jsQR is sensitive to scale, so try a few sizes; the QR is a small part of the page.
  for (const max of [1600, 1000, 2400, 700]) {
    const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const result = jsQR(data, canvas.width, canvas.height, { inversionAttempts: "attemptBoth" });
    const serial = result && extractSerial(result.data);
    if (serial) return serial;
  }
  return null;
}

export function VerifyForm({ defaultValue = "" }: { defaultValue?: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [code, setCode] = useState(defaultValue);
  const [error, setError] = useState("");
  const [reading, setReading] = useState(false);
  const [dragging, setDragging] = useState(false);

  function go(serial: string) {
    setError("");
    router.push(`/verify/${serial}`);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const serial = extractSerial(code);
    if (serial) go(serial);
    else setError("That doesn't look like an Oakvale certificate ID. It looks like OAK-7K3Q-M9XP.");
  }

  async function upload(file: File) {
    if (!file.type.startsWith("image/")) {
      setError("Please upload a photo or screenshot (JPG, PNG or WebP).");
      return;
    }
    setError("");
    setReading(true);
    try {
      const serial = await readCertificateImage(file);
      if (serial) go(serial);
      else
        setError(
          "We couldn't find a QR code in that image. Try a sharper, well-lit photo with the whole QR code in view, or type the certificate ID instead."
        );
    } catch {
      setError("We couldn't open that image. Please try another one.");
    } finally {
      setReading(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className="space-y-5">
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
      />
      <button
        type="button"
        disabled={reading}
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files?.[0];
          if (file && !reading) upload(file);
        }}
        className={cn(
          "flex w-full flex-col items-center rounded-2xl border border-dashed border-ink-300 bg-white px-6 py-10 text-center transition-colors hover:border-primary-400 hover:bg-primary-50/40 disabled:cursor-progress",
          dragging && "border-primary-500 bg-primary-50/60 ring-3 ring-primary-100"
        )}
      >
        <span className="grid size-11 place-items-center rounded-xl border border-line bg-canvas text-ink-500">
          {reading ? <Loader2 className="size-5 animate-spin" /> : <ImageUp className="size-5" />}
        </span>
        <span className="mt-4 text-sm font-medium text-ink-900">
          {reading ? "Reading the QR code…" : "Upload a photo or screenshot of the certificate"}
        </span>
        <span className="mt-1 text-xs text-ink-500">We read its QR code. The image stays on your device.</span>
      </button>

      <div className="flex items-center gap-3 text-xs text-ink-400">
        <span className="h-px flex-1 bg-line" /> or type the certificate ID <span className="h-px flex-1 bg-line" />
      </div>

      <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row">
        <label className="sr-only" htmlFor="certificate-id">
          Certificate ID
        </label>
        <input
          id="certificate-id"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="OAK-7K3Q-M9XP"
          autoComplete="off"
          spellCheck={false}
          className={cn(inputClass, "font-mono uppercase tracking-wider placeholder:normal-case")}
        />
        <Button type="submit" className="h-11 shrink-0">
          <Search className="size-4" /> Verify
        </Button>
      </form>

      {error && <FormError>{error}</FormError>}
    </div>
  );
}
