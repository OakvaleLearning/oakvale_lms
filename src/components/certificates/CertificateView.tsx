import type { CSSProperties, ReactNode } from "react";
import { Playfair_Display, Great_Vibes } from "next/font/google";
import { cn } from "@/lib/utils";
import { fillPlaceholders, formatIssueDate, type CertificateData, type TemplateDesign } from "@/lib/certificate-design";

const serif = Playfair_Display({ subsets: ["latin"], weight: ["500", "600", "700"], display: "swap" });
const script = Great_Vibes({ subsets: ["latin"], weight: "400", display: "swap" });

/** Sizes are in container-width units, so the certificate scales as one piece at any width. */
const u = (n: number) => `${n}cqw`;

/**
 * A certificate drawn from a template design. A4 landscape proportions; the
 * QR code and barcode SVGs come from the server (see certificateCodes).
 */
export function CertificateView({
  design,
  data,
  qrSvg,
  barcodeSvg,
  className,
}: {
  design: TemplateDesign;
  data: CertificateData;
  qrSvg?: string;
  barcodeSvg?: string;
  className?: string;
}) {
  const Layout = { CLASSIC: Classic, MODERN: Modern, MINIMAL: Minimal }[design.layout];
  return (
    <div className={cn("certificate @container w-full", className)}>
      <div
        className="relative aspect-[297/210] w-full overflow-hidden text-ink-800"
        style={{ backgroundColor: design.backgroundColor }}
      >
        <Layout design={design} data={data} qrSvg={design.showQr ? qrSvg : undefined} barcodeSvg={design.showBarcode ? barcodeSvg : undefined} />
      </div>
    </div>
  );
}

type Props = { design: TemplateDesign; data: CertificateData; qrSvg?: string; barcodeSvg?: string };

/* ------------------------------------------------------------------ *
 * Layouts
 * ------------------------------------------------------------------ */

function Classic({ design, data, qrSvg, barcodeSvg }: Props) {
  return (
    <div className="absolute flex flex-col items-center text-center" style={{ inset: u(2.2), border: `${u(0.3)} solid ${design.primaryColor}` }}>
      <div className="absolute" style={{ inset: u(0.8), border: `${u(0.1)} solid ${design.accentColor}` }} />
      <div className="relative flex size-full flex-col items-center" style={{ padding: `${u(3.4)} ${u(6)} ${u(2.6)}` }}>
        <Logo height={4} />
        <Heading design={design} style={{ marginTop: u(2.2), fontSize: u(4) }} />
        <Rule color={design.accentColor} style={{ marginTop: u(1.2) }} />
        <Intro design={design} style={{ marginTop: u(1.8) }} />
        <Name design={design} data={data} style={{ marginTop: u(0.8) }} />
        <Body design={design} data={data} style={{ marginTop: u(1.2), maxWidth: "78%" }} />
        <Score design={design} data={data} />
        <div className="mt-auto grid w-full grid-cols-[1fr_auto_1fr] items-end" style={{ gap: u(2) }}>
          <IdBlock data={data} barcodeSvg={barcodeSvg} className="items-start text-left" />
          <Signatures design={design} />
          <div className="flex justify-end">
            <Qr svg={qrSvg} />
          </div>
        </div>
        <Footer design={design} data={data} />
      </div>
    </div>
  );
}

function Modern({ design, data, qrSvg, barcodeSvg }: Props) {
  return (
    <div className="absolute inset-0 flex">
      <aside
        className="flex shrink-0 flex-col justify-between text-white"
        style={{ width: "27%", backgroundColor: design.primaryColor, padding: `${u(3.6)} ${u(2.8)}` }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- scales with the certificate, and prints */}
        <img src="/oakvale-logo-white.svg" alt="Oakvale Learning" style={{ width: "88%" }} />
        <div>
          <div style={{ height: u(0.35), width: u(5), backgroundColor: design.accentColor }} />
          <p className="leading-snug text-white/80" style={{ marginTop: u(1.4), fontSize: u(1.2) }}>
            Issued {formatIssueDate(data.issuedAt)}
          </p>
        </div>
        {qrSvg ? (
          <div>
            <Qr svg={qrSvg} />
            <p className="text-white/70" style={{ marginTop: u(0.8), fontSize: u(0.9) }}>
              Scan to verify
            </p>
          </div>
        ) : (
          <span />
        )}
      </aside>
      <div className="flex min-w-0 flex-1 flex-col" style={{ padding: `${u(4.4)} ${u(5)} ${u(3)}` }}>
        <Heading design={design} style={{ fontSize: u(4.1) }} />
        <Intro design={design} style={{ marginTop: u(3) }} />
        <Name design={design} data={data} style={{ marginTop: u(0.6) }} />
        <div style={{ marginTop: u(1), height: u(0.25), width: u(8), backgroundColor: design.accentColor }} />
        <Body design={design} data={data} style={{ marginTop: u(1.8) }} />
        <Score design={design} data={data} />
        <div className="mt-auto flex items-end justify-between" style={{ gap: u(3) }}>
          <Signatures design={design} align="start" />
          <IdBlock data={data} barcodeSvg={barcodeSvg} className="items-end text-right" />
        </div>
        <Footer design={design} data={data} align="left" />
      </div>
    </div>
  );
}

function Minimal({ design, data, qrSvg, barcodeSvg }: Props) {
  return (
    <div className="absolute inset-0 flex flex-col" style={{ padding: `${u(5)} ${u(6.5)} ${u(3.6)}` }}>
      <div className="absolute inset-x-0 top-0" style={{ height: u(0.9), backgroundColor: design.primaryColor }} />
      <div className="flex items-start justify-between">
        <Logo height={3.6} />
        <span className="font-mono tracking-wider text-ink-500" style={{ fontSize: u(1) }}>
          {data.serial}
        </span>
      </div>
      <Heading design={design} style={{ marginTop: u(4.6), fontSize: u(3.2) }} />
      <Intro design={design} style={{ marginTop: u(2.6) }} />
      <Name design={design} data={data} style={{ marginTop: u(0.6), fontSize: u(5.6) }} />
      <Body design={design} data={data} style={{ marginTop: u(1.4), maxWidth: "72%" }} />
      <Score design={design} data={data} />
      <div className="mt-auto flex items-end justify-between" style={{ gap: u(3) }}>
        <div>
          <Signatures design={design} align="start" />
          <p className="text-ink-500" style={{ marginTop: u(1.6), fontSize: u(1.05) }}>
            Issued {formatIssueDate(data.issuedAt)}
          </p>
        </div>
        <div className="flex items-end" style={{ gap: u(1.6) }}>
          {barcodeSvg && <Svg svg={barcodeSvg} style={{ width: u(15), height: u(3.2) }} />}
          <Qr svg={qrSvg} />
        </div>
      </div>
      <Footer design={design} data={data} align="left" />
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Pieces
 * ------------------------------------------------------------------ */

function Logo({ height }: { height: number }) {
  // eslint-disable-next-line @next/next/no-img-element -- scales with the certificate, and prints
  return <img src="/oakvale-new-300x84.png" alt="Oakvale Learning" style={{ height: u(height), width: "auto" }} />;
}

function Rule({ color, style }: { color: string; style?: CSSProperties }) {
  return (
    <div className="flex items-center" style={{ gap: u(0.8), ...style }}>
      <span style={{ height: u(0.1), width: u(6), backgroundColor: color }} />
      <span className="rotate-45" style={{ height: u(0.6), width: u(0.6), backgroundColor: color }} />
      <span style={{ height: u(0.1), width: u(6), backgroundColor: color }} />
    </div>
  );
}

function Heading({ design, style }: { design: TemplateDesign; style?: CSSProperties }) {
  return (
    <h2
      className={cn("leading-[1.1]", design.font === "SERIF" ? cn(serif.className, "font-semibold") : "font-display")}
      style={{ color: design.primaryColor, ...style }}
    >
      {design.heading}
    </h2>
  );
}

function Intro({ design, style }: { design: TemplateDesign; style?: CSSProperties }) {
  if (!design.intro) return null;
  return (
    <p className="tracking-[0.14em] text-ink-500 uppercase" style={{ fontSize: u(1.15), ...style }}>
      {design.intro}
    </p>
  );
}

function Name({ design, data, style }: { design: TemplateDesign; data: CertificateData; style?: CSSProperties }) {
  return (
    <p
      className={cn("leading-[1.15] text-ink-950", design.font === "SERIF" ? cn(serif.className, "font-medium") : "font-display")}
      style={{ fontSize: u(5), ...style }}
    >
      {data.recipientName}
    </p>
  );
}

function Body({ design, data, style }: { design: TemplateDesign; data: CertificateData; style?: CSSProperties }) {
  return (
    <p className="leading-relaxed text-ink-700" style={{ fontSize: u(1.5), ...style }}>
      <Filled text={design.body} data={data} />
    </p>
  );
}

function Score({ design, data }: { design: TemplateDesign; data: CertificateData }) {
  if (!design.showScore || data.score === null) return null;
  return (
    <p className="font-medium text-ink-600" style={{ marginTop: u(1), fontSize: u(1.2) }}>
      Assessment score: <span style={{ color: design.primaryColor }}>{data.score}%</span>
    </p>
  );
}

function Filled({ text, data }: { text: string; data: CertificateData }) {
  return fillPlaceholders(text, data).map((part, i) =>
    part.value ? (
      <strong key={i} className="font-semibold text-ink-950">
        {part.text}
      </strong>
    ) : (
      part.text
    )
  );
}

function Signatures({ design, align = "center" }: { design: TemplateDesign; align?: "center" | "start" }) {
  const people = [
    { name: design.signatoryName, title: design.signatoryTitle },
    { name: design.signatory2Name, title: design.signatory2Title },
  ].filter((p) => p.name.trim());
  if (people.length === 0) return <span />;
  return (
    <div className={cn("flex", align === "center" ? "justify-center" : "justify-start")} style={{ gap: u(4) }}>
      {people.map((p, i) => (
        <div key={i} className="text-center" style={{ minWidth: u(16) }}>
          <p className={cn(script.className, "leading-none text-ink-900")} style={{ fontSize: u(2.6) }}>
            {p.name}
          </p>
          <div style={{ marginTop: u(0.5), height: u(0.08), backgroundColor: "currentColor" }} className="text-ink-300" />
          <p className="font-semibold text-ink-900" style={{ marginTop: u(0.6), fontSize: u(1.05) }}>
            {p.name}
          </p>
          {p.title && (
            <p className="text-ink-500" style={{ fontSize: u(0.95) }}>
              {p.title}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

function IdBlock({ data, barcodeSvg, className }: { data: CertificateData; barcodeSvg?: string; className?: string }) {
  return (
    <div className={cn("flex flex-col", className)} style={{ gap: u(0.5) }}>
      {barcodeSvg && <Svg svg={barcodeSvg} style={{ width: u(15), height: u(3) }} />}
      <p className="text-ink-500" style={{ fontSize: u(0.9) }}>
        Certificate ID <span className="font-mono font-medium tracking-wider text-ink-800">{data.serial}</span>
      </p>
    </div>
  );
}

function Qr({ svg }: { svg?: string }) {
  if (!svg) return null;
  return (
    <div className="bg-white" style={{ padding: u(0.6), width: u(9.5), borderRadius: u(0.6) }}>
      <Svg svg={svg} className="aspect-square w-full" />
    </div>
  );
}

function Footer({ design, data, align = "center" }: { design: TemplateDesign; data: CertificateData; align?: "center" | "left" }) {
  if (!design.footer) return null;
  return (
    <p className={cn("text-ink-500", align === "center" ? "text-center" : "text-left")} style={{ marginTop: u(1.4), fontSize: u(0.9) }}>
      <Filled text={design.footer} data={data} />
    </p>
  );
}

/** Trusted SVG markup generated by bwip-js from our own certificate ID. */
function Svg({ svg, className, style }: { svg: string; className?: string; style?: CSSProperties }): ReactNode {
  return (
    <div
      className={cn("[&>svg]:block [&>svg]:size-full", className)}
      style={style}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
