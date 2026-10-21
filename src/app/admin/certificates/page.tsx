import type { Metadata } from "next";
import Link from "next/link";
import { Award, Copy, Download, Eye, Plus, Search, Send, ShieldCheck, Star } from "lucide-react";
import type { CpdStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { SAMPLE_CERTIFICATE, formatIssueDate, toDesign } from "@/lib/certificate-design";
import { certificateCodes } from "@/lib/lms/certificates";
import { CertificateView } from "@/components/certificates/CertificateView";
import { CpdQueue, RevokeButton, type CpdRow } from "@/components/admin/CertificateControls";
import { EmptyState, PageHeader, StatCard } from "@/components/dashboard/ui";
import { Button, ButtonLink, buttonClass } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { duplicateTemplate, makeDefaultTemplate } from "./actions";

export const metadata: Metadata = { title: "Certificates" };

const TABS = [
  { id: "issued", label: "Issued" },
  { id: "cpd", label: "CPD requests" },
  { id: "templates", label: "Templates" },
] as const;
type Tab = (typeof TABS)[number]["id"];

const CPD_FILTERS: { id: Exclude<CpdStatus, "NONE">; label: string }[] = [
  { id: "PENDING", label: "To send" },
  { id: "SUBMITTED", label: "Sent to body" },
  { id: "ISSUED", label: "Issued" },
];

export default async function AdminCertificatesPage({ searchParams }: PageProps<"/admin/certificates">) {
  await requireAdmin();
  const sp = await searchParams;
  const tab: Tab = TABS.some((t) => t.id === sp.tab) ? (sp.tab as Tab) : "issued";

  const [total, revoked, cpdPending] = await Promise.all([
    prisma.certificate.count(),
    prisma.certificate.count({ where: { revokedAt: { not: null } } }),
    prisma.certificate.count({ where: { cpdStatus: "PENDING", revokedAt: null } }),
  ]);

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <PageHeader
        eyebrow="Learning"
        title="Certificates"
        description="Certificates issued to learners, CPD requests for the issuing bodies, and the templates certificates are drawn from."
        actions={
          <Link href="/verify" target="_blank" className={buttonClass({ variant: "outline", size: "sm" })}>
            <ShieldCheck className="size-4" /> Verification page
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Issued" value={total} icon={Award} />
        <StatCard label="Valid" value={total - revoked} icon={ShieldCheck} hint={revoked ? `${revoked} revoked` : undefined} />
        <StatCard label="CPD to send" value={cpdPending} icon={Send} />
      </div>

      <nav aria-label="Certificate sections" className="flex gap-1 overflow-x-auto rounded-xl bg-ink-100 p-1 sm:w-fit">
        {TABS.map((t) => (
          <Link
            key={t.id}
            href={`/admin/certificates?tab=${t.id}`}
            aria-current={tab === t.id ? "page" : undefined}
            className={cn(
              "flex-1 rounded-lg px-4 py-1.5 text-center text-sm whitespace-nowrap transition-colors sm:flex-none",
              tab === t.id ? "bg-white font-medium text-ink-950 shadow-card" : "text-ink-600 hover:text-ink-900"
            )}
          >
            {t.label}
            {t.id === "cpd" && cpdPending > 0 && (
              <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 text-xs font-semibold text-amber-800 tabular-nums">{cpdPending}</span>
            )}
          </Link>
        ))}
      </nav>

      {tab === "issued" && <Issued q={typeof sp.q === "string" ? sp.q.trim() : ""} />}
      {tab === "cpd" && <Cpd status={CPD_FILTERS.find((f) => f.id === sp.status)?.id ?? "PENDING"} />}
      {tab === "templates" && <Templates />}
    </div>
  );
}

async function Issued({ q }: { q: string }) {
  const where: Prisma.CertificateWhereInput = q
    ? {
        OR: [
          { serial: { contains: q, mode: "insensitive" } },
          { recipientName: { contains: q, mode: "insensitive" } },
          { courseTitle: { contains: q, mode: "insensitive" } },
          { user: { email: { contains: q, mode: "insensitive" } } },
        ],
      }
    : {};
  const certificates = await prisma.certificate.findMany({
    where,
    orderBy: { issuedAt: "desc" },
    take: 200,
    include: { user: { select: { id: true, email: true } } },
  });

  return (
    <section className="card overflow-hidden">
      <form className="flex gap-2 border-b border-line p-3 sm:p-4" role="search">
        <input type="hidden" name="tab" value="issued" />
        <label className="relative flex-1">
          <span className="sr-only">Search certificates</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-400" />
          <input
            name="q"
            defaultValue={q}
            placeholder="Name, email, course or certificate ID"
            className="h-9 w-full rounded-lg border border-line bg-white pl-9 pr-3 text-sm outline-none placeholder:text-ink-400 focus:border-primary-500 focus:ring-3 focus:ring-primary-100"
          />
        </label>
        <Button type="submit" size="sm" variant="outline">
          Search
        </Button>
      </form>

      {certificates.length === 0 ? (
        <p className="px-5 py-12 text-center text-sm text-ink-500">
          {q ? "No certificates match that search." : "No certificates yet. They're issued automatically when learners finish a course."}
        </p>
      ) : (
        <ul className="divide-y divide-line">
          {certificates.map((c) => (
            <li key={c.id} className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:gap-4 sm:px-5">
              <div className="grid min-w-0 flex-1 gap-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_9rem] sm:items-center sm:gap-4">
                <div className="min-w-0">
                  <Link href={`/admin/learners/${c.user.id}`} className="block truncate text-sm font-medium text-ink-900 hover:text-primary-700">
                    {c.recipientName}
                  </Link>
                  <span className="block truncate text-xs text-ink-500">{c.user.email}</span>
                </div>
                <div className="min-w-0">
                  <span className="block truncate text-sm text-ink-800">{c.courseTitle}</span>
                  <span className="block text-xs text-ink-500">
                    {formatIssueDate(c.issuedAt)}
                    {c.score !== null && ` · ${c.score}%`}
                  </span>
                </div>
                <div>
                  <span className="block font-mono text-xs tracking-wider text-ink-700">{c.serial}</span>
                  {c.revokedAt ? (
                    <span className="text-xs font-medium text-amber-700" title={c.revokedReason ?? undefined}>
                      Revoked {formatIssueDate(c.revokedAt)}
                    </span>
                  ) : (
                    <span className="text-xs font-medium text-emerald-700">Valid</span>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1 border-t border-line pt-2 sm:border-0 sm:pt-0">
                <Link href={`/certificates/${c.serial}`} className={buttonClass({ variant: "ghost", size: "sm" })}>
                  <Eye className="size-4" /> View
                </Link>
                <RevokeButton id={c.id} revoked={Boolean(c.revokedAt)} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

async function Cpd({ status }: { status: Exclude<CpdStatus, "NONE"> }) {
  const certificates = await prisma.certificate.findMany({
    where: { cpdStatus: status, revokedAt: null },
    orderBy: { issuedAt: "asc" },
    include: { user: { select: { email: true, phone: true } } },
  });
  const rows: CpdRow[] = certificates.map((c) => ({
    id: c.id,
    learner: c.recipientName,
    email: c.user.email,
    phone: c.user.phone,
    course: c.courseTitle,
    provider: c.cpdProvider ?? "CPD body not set",
    hours: c.cpdHours,
    issuedAt: formatIssueDate(c.issuedAt),
    status: c.cpdStatus as CpdRow["status"],
    updatedAt: c.cpdUpdatedAt ? formatIssueDate(c.cpdUpdatedAt) : null,
  }));

  return (
    <section className="space-y-4">
      <p className="text-sm leading-relaxed text-ink-600">
        Learners who earn a certificate on a CPD course are listed here. Download the list, send it to the issuing body, then
        mark those learners as sent. The body emails each learner their CPD certificate directly; mark them issued once it
        confirms.
      </p>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-lg bg-ink-100 p-1">
          {CPD_FILTERS.map((f) => (
            <Link
              key={f.id}
              href={`/admin/certificates?tab=cpd&status=${f.id}`}
              className={cn(
                "rounded-md px-3 py-1 text-sm transition-colors",
                status === f.id ? "bg-white font-medium text-ink-950 shadow-card" : "text-ink-600 hover:text-ink-900"
              )}
            >
              {f.label}
            </Link>
          ))}
        </div>
        <a href={`/api/admin/certificates/cpd?status=${status}`} className={buttonClass({ variant: "outline", size: "sm" })}>
          <Download className="size-4" /> Download CSV
        </a>
      </div>
      <div className="card overflow-hidden">
        {rows.length ? (
          <CpdQueue key={status} rows={rows} />
        ) : (
          <p className="px-5 py-12 text-center text-sm text-ink-500">Nothing here right now.</p>
        )}
      </div>
    </section>
  );
}

async function Templates() {
  const templates = await prisma.certificateTemplate.findMany({
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    include: { _count: { select: { courses: true } } },
  });
  const codes = certificateCodes(SAMPLE_CERTIFICATE.serial);

  if (templates.length === 0) {
    return (
      <EmptyState
        icon={Award}
        title="No templates yet"
        action={<ButtonLink href="/admin/certificates/templates/new">Create a template</ButtonLink>}
      >
        A template sets the layout, colours, wording and signatures of your certificates.
      </EmptyState>
    );
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-600">Courses use the default template unless you pick another in the course settings.</p>
        <ButtonLink href="/admin/certificates/templates/new" size="sm">
          <Plus className="size-4" /> New template
        </ButtonLink>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {templates.map((t) => (
          <article key={t.id} className="card flex flex-col overflow-hidden">
            <Link href={`/admin/certificates/templates/${t.id}`} className="block border-b border-line bg-canvas p-3">
              <div className="overflow-hidden rounded-md shadow-card ring-1 ring-line">
                <CertificateView design={toDesign(t)} data={SAMPLE_CERTIFICATE} {...codes} />
              </div>
            </Link>
            <div className="flex flex-1 flex-col p-4">
              <div className="flex items-center gap-2">
                <h3 className="min-w-0 flex-1 truncate text-sm font-semibold text-ink-950">{t.name}</h3>
                {t.isDefault && (
                  <span className="inline-flex h-5 items-center gap-1 rounded-full bg-primary-50 px-2 text-[11px] font-medium text-primary-700">
                    <Star className="size-3" /> Default
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-xs text-ink-500">
                {t._count.courses
                  ? `Chosen by ${t._count.courses} ${t._count.courses === 1 ? "course" : "courses"}`
                  : t.isDefault
                    ? "Used by every course without its own template"
                    : "Not chosen by any course"}
              </p>
              <div className="mt-auto flex flex-wrap gap-1 pt-4">
                <ButtonLink href={`/admin/certificates/templates/${t.id}`} size="sm" variant="outline">
                  Edit
                </ButtonLink>
                <form action={duplicateTemplate.bind(null, t.id)}>
                  <Button type="submit" size="sm" variant="ghost">
                    <Copy className="size-4" /> Duplicate
                  </Button>
                </form>
                {!t.isDefault && (
                  <form action={makeDefaultTemplate.bind(null, t.id)}>
                    <Button type="submit" size="sm" variant="ghost">
                      Make default
                    </Button>
                  </form>
                )}
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
