/**
 * Certificate template shape and text helpers, shared by the server, the
 * certificate renderer and the admin template editor (so no "server-only").
 */

export const LAYOUTS = ["CLASSIC", "MODERN", "MINIMAL"] as const;
export const FONTS = ["SERIF", "SANS"] as const;

export type CertificateLayout = (typeof LAYOUTS)[number];
export type CertificateFont = (typeof FONTS)[number];

export const LAYOUT_LABEL: Record<CertificateLayout, string> = {
  CLASSIC: "Classic",
  MODERN: "Modern",
  MINIMAL: "Minimal",
};

export const FONT_LABEL: Record<CertificateFont, string> = {
  SERIF: "Elegant serif",
  SANS: "Clean sans-serif",
};

/** Everything about a template that affects how a certificate looks. */
export interface TemplateDesign {
  layout: CertificateLayout;
  font: CertificateFont;
  primaryColor: string;
  accentColor: string;
  backgroundColor: string;
  heading: string;
  intro: string;
  body: string;
  footer: string;
  signatoryName: string;
  signatoryTitle: string;
  signatory2Name: string;
  signatory2Title: string;
  showScore: boolean;
  showQr: boolean;
  showBarcode: boolean;
}

/** Used when no template exists at all; matches the schema defaults. */
export const DEFAULT_DESIGN: TemplateDesign = {
  layout: "CLASSIC",
  font: "SERIF",
  primaryColor: "#3229a2",
  accentColor: "#b08d3c",
  backgroundColor: "#ffffff",
  heading: "Certificate of Completion",
  intro: "This is to certify that",
  body: "has successfully completed {course}, part of the {programme} programme.",
  footer: "",
  signatoryName: "Oakvale Learning",
  signatoryTitle: "Director of Training",
  signatory2Name: "",
  signatory2Title: "",
  showScore: true,
  showQr: true,
  showBarcode: true,
};

export function toDesign(t: TemplateDesign): TemplateDesign {
  return Object.fromEntries(Object.keys(DEFAULT_DESIGN).map((k) => [k, t[k as keyof TemplateDesign]])) as unknown as TemplateDesign;
}

/** What gets printed on one certificate. */
export interface CertificateData {
  serial: string;
  recipientName: string;
  courseTitle: string;
  programTitle: string;
  score: number | null;
  issuedAt: Date | string;
  cpdHours: number | null;
}

export const SAMPLE_CERTIFICATE: CertificateData = {
  serial: "OAK-7K3Q-M9XP",
  recipientName: "Adaeze Okafor",
  courseTitle: "Professional Child Care",
  programTitle: "Child Care",
  score: 86,
  issuedAt: "2026-11-20T10:00:00Z",
  cpdHours: 12,
};

export const PLACEHOLDERS = ["{name}", "{course}", "{programme}", "{score}", "{date}", "{hours}"] as const;

export function formatIssueDate(date: Date | string): string {
  return new Date(date).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Lagos" });
}

/**
 * Split template text into plain and filled-in parts, so the renderer can
 * emphasise the values ("{course}" → **Professional Child Care**).
 */
export function fillPlaceholders(text: string, data: CertificateData): { text: string; value: boolean }[] {
  const values: Record<string, string> = {
    "{name}": data.recipientName,
    "{course}": data.courseTitle,
    "{programme}": data.programTitle,
    "{score}": data.score === null ? "" : `${data.score}%`,
    "{date}": formatIssueDate(data.issuedAt),
    "{hours}": data.cpdHours === null ? "" : String(data.cpdHours),
  };
  return text
    .split(/(\{(?:name|course|programme|score|date|hours)\})/g)
    .filter(Boolean)
    .map((part) => (part in values ? { text: values[part], value: true } : { text: part, value: false }));
}

/** Certificate IDs: OAK-XXXX-XXXX in Crockford base32 (no I, L, O or U to misread). */
export const SERIAL_PATTERN = /OAK-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}/;

/** Pull a certificate ID out of a scanned QR/barcode value or typed text. */
export function extractSerial(input: string): string | null {
  // Forgive the usual typing slips: O for 0, I/L for 1, U for V, missing dashes.
  const fix = (s: string) => s.replace(/O/g, "0").replace(/[IL]/g, "1").replace(/U/g, "V");
  for (const m of input.toUpperCase().replace(/\s+/g, "").matchAll(/OAK-?([0-9A-Z]{4})-?([0-9A-Z]{4})(?![0-9A-Z])/g)) {
    const serial = `OAK-${fix(m[1])}-${fix(m[2])}`;
    if (SERIAL_PATTERN.test(serial)) return serial;
  }
  return null;
}
