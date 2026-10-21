"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { CertificateView } from "@/components/certificates/CertificateView";
import {
  FONTS,
  FONT_LABEL,
  LAYOUTS,
  LAYOUT_LABEL,
  PLACEHOLDERS,
  SAMPLE_CERTIFICATE,
  type TemplateDesign,
} from "@/lib/certificate-design";
import { saveTemplate } from "@/app/admin/certificates/actions";
import { cn } from "@/lib/utils";
import { Field, Input, Panel, Switch, Textarea } from "./forms";

const SWATCHES = ["#3229a2", "#0d0a2b", "#14532d", "#7f1d1d", "#1e3a5f", "#b08d3c", "#d929dd", "#0e7490"];
const BACKGROUNDS = ["#ffffff", "#fdfbf5", "#f7f7fa", "#f5f1e8"];

export function TemplateEditor({
  id,
  initial,
  initialName,
  qrSvg,
  barcodeSvg,
}: {
  id: string | null;
  initial: TemplateDesign;
  initialName: string;
  qrSvg: string;
  barcodeSvg: string;
}) {
  const router = useRouter();
  const [design, setDesign] = useState(initial);
  const [name, setName] = useState(initialName);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();

  const set = <K extends keyof TemplateDesign>(key: K, value: TemplateDesign[K]) => {
    setSaved(false);
    setDesign((d) => ({ ...d, [key]: value }));
  };
  const text = (key: keyof TemplateDesign) => ({
    value: design[key] as string,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => set(key, e.target.value as never),
  });

  function save() {
    setError("");
    start(async () => {
      const res = await saveTemplate(id, { ...design, name });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSaved(true);
      if (!id) router.replace(`/admin/certificates/templates/${res.id}`);
      else router.refresh();
    });
  }

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="min-w-0 space-y-3 lg:sticky lg:top-8">
        <div className="card bg-canvas p-3 sm:p-5">
          <div className="overflow-hidden rounded-md shadow-raised ring-1 ring-line">
            <CertificateView design={design} data={SAMPLE_CERTIFICATE} qrSvg={qrSvg} barcodeSvg={barcodeSvg} />
          </div>
        </div>
        <p className="text-xs text-ink-500">Preview with sample learner details. Real certificates use each learner&apos;s name, course and score.</p>
      </div>

      <div className="space-y-6">
        <Panel title="Template">
          <div className="space-y-5">
            <Field label="Template name" hint="Only admins see this">
              <Input
                value={name}
                maxLength={80}
                onChange={(e) => {
                  setSaved(false);
                  setName(e.target.value);
                }}
              />
            </Field>
            <Choice label="Layout" options={LAYOUTS.map((l) => ({ value: l, label: LAYOUT_LABEL[l] }))} value={design.layout} onChange={(v) => set("layout", v)} />
            <Choice label="Lettering" options={FONTS.map((f) => ({ value: f, label: FONT_LABEL[f] }))} value={design.font} onChange={(v) => set("font", v)} />
          </div>
        </Panel>

        <Panel title="Colours">
          <div className="space-y-5">
            <ColorField label="Main colour" value={design.primaryColor} swatches={SWATCHES} onChange={(v) => set("primaryColor", v)} />
            <ColorField label="Accent colour" value={design.accentColor} swatches={SWATCHES} onChange={(v) => set("accentColor", v)} />
            <ColorField label="Paper" value={design.backgroundColor} swatches={BACKGROUNDS} onChange={(v) => set("backgroundColor", v)} />
          </div>
        </Panel>

        <Panel title="Wording" description={<>Placeholders: {PLACEHOLDERS.join(" ")}</>}>
          <div className="space-y-5">
            <Field label="Heading">
              <Input maxLength={80} {...text("heading")} />
            </Field>
            <Field label="Line above the name" optional>
              <Input maxLength={120} {...text("intro")} />
            </Field>
            <Field label="Main text" hint="Shown under the learner's name">
              <Textarea rows={3} maxLength={400} {...text("body")} />
            </Field>
            <Field label="Small print" optional hint="e.g. accreditation details, shown at the bottom">
              <Textarea rows={2} maxLength={240} {...text("footer")} />
            </Field>
          </div>
        </Panel>

        <Panel title="Signatures" description="Names are written in a signature style above the line">
          <div className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              <Field label="Signatory" optional>
                <Input maxLength={60} {...text("signatoryName")} />
              </Field>
              <Field label="Their title" optional>
                <Input maxLength={80} {...text("signatoryTitle")} />
              </Field>
              <Field label="Second signatory" optional>
                <Input maxLength={60} {...text("signatory2Name")} />
              </Field>
              <Field label="Their title" optional>
                <Input maxLength={80} {...text("signatory2Title")} />
              </Field>
            </div>
          </div>
        </Panel>

        <Panel title="Show on the certificate">
          <div className="space-y-2">
            <Switch label="QR code" description="Links to the verification page" checked={design.showQr} onChange={(e) => set("showQr", e.target.checked)} />
            <Switch label="Barcode" description="Encodes the certificate ID" checked={design.showBarcode} onChange={(e) => set("showBarcode", e.target.checked)} />
            <Switch label="Assessment score" description="The learner's quiz average" checked={design.showScore} onChange={(e) => set("showScore", e.target.checked)} />
          </div>
        </Panel>

        <div className="sticky bottom-4 flex flex-wrap items-center gap-3 rounded-xl border border-line bg-white p-3 shadow-raised">
          <Button type="button" onClick={save} disabled={pending}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            {id ? "Save template" : "Create template"}
          </Button>
          {saved && !pending && (
            <span className="inline-flex items-center gap-1 text-sm text-emerald-600">
              <CheckCircle2 className="size-4" /> Saved
            </span>
          )}
          {error && (
            <span role="alert" className="text-sm text-accent-600">
              {error}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function Choice<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div>
      <span className="mb-1.5 block text-sm font-medium text-ink-800">{label}</span>
      <div role="radiogroup" aria-label={label} className="flex rounded-lg bg-ink-100 p-1">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            onClick={() => onChange(o.value)}
            className={cn(
              "flex-1 rounded-md px-3 py-1.5 text-sm transition-colors",
              value === o.value ? "bg-white font-medium text-ink-950 shadow-card" : "text-ink-600 hover:text-ink-900"
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function ColorField({
  label,
  value,
  swatches,
  onChange,
}: {
  label: string;
  value: string;
  swatches: string[];
  onChange: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const [synced, setSynced] = useState(value);
  // Follow swatch / picker changes made outside the text box.
  if (synced !== value) {
    setSynced(value);
    setDraft(value);
  }
  return (
    <div>
      <span className="mb-1.5 block text-sm font-medium text-ink-800">{label}</span>
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative size-9 shrink-0 cursor-pointer overflow-hidden rounded-lg border border-line shadow-card" style={{ backgroundColor: value }}>
          <span className="sr-only">Pick {label.toLowerCase()}</span>
          <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 size-full cursor-pointer opacity-0" />
        </label>
        <input
          value={draft}
          maxLength={7}
          spellCheck={false}
          aria-label={`${label} hex value`}
          onChange={(e) => {
            setDraft(e.target.value);
            if (/^#[0-9a-f]{6}$/i.test(e.target.value)) onChange(e.target.value.toLowerCase());
          }}
          className="h-9 w-24 rounded-lg border border-line bg-white px-2.5 font-mono text-sm text-ink-900 shadow-card outline-none focus:border-primary-500 focus:ring-3 focus:ring-primary-100"
        />
        <div className="flex flex-wrap gap-1.5">
          {swatches.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onChange(s)}
              aria-label={`Use ${s}`}
              className={cn("size-6 rounded-full border border-ink-900/10 transition-transform hover:scale-110", value === s && "ring-2 ring-primary-500 ring-offset-2")}
              style={{ backgroundColor: s }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
