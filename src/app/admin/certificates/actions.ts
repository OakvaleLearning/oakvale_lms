"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { FONTS, LAYOUTS, toDesign } from "@/lib/certificate-design";
import { issueEligibleForProgram } from "@/lib/lms/certificates";
import { audit, changes } from "@/lib/audit";

type ActionState = { error?: string; ok?: boolean } | undefined;
type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

function refresh() {
  revalidatePath("/admin/certificates", "layout");
  revalidatePath("/learn", "layout");
}

/* ------------------------------------------------------------------ *
 * Templates
 * ------------------------------------------------------------------ */

const color = z.string().regex(/^#[0-9a-f]{6}$/i, "Colours must be hex values like #145c3f");
const line = (max: number) => z.string().trim().max(max);

const templateSchema = z.object({
  name: z.string().trim().min(2, "Give the template a name").max(80),
  layout: z.enum(LAYOUTS),
  font: z.enum(FONTS),
  primaryColor: color,
  accentColor: color,
  backgroundColor: color,
  heading: z.string().trim().min(2, "Add a heading").max(80),
  intro: line(120),
  body: z.string().trim().min(2, "Add the main text").max(400),
  footer: line(240),
  signatoryName: line(60),
  signatoryTitle: line(80),
  signatory2Name: line(60),
  signatory2Title: line(80),
  showScore: z.boolean(),
  showQr: z.boolean(),
  showBarcode: z.boolean(),
});

export type TemplateInput = z.infer<typeof templateSchema>;

export async function saveTemplate(id: string | null, input: unknown): Promise<Result<{ id: string }>> {
  const admin = await requireAdmin();
  const parsed = templateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid template" };

  const template = id
    ? await prisma.certificateTemplate.update({ where: { id }, data: parsed.data })
    : await prisma.certificateTemplate.create({
        // The first template becomes the default.
        data: { ...parsed.data, isDefault: (await prisma.certificateTemplate.count()) === 0 },
      });
  await audit(admin, id ? "template.update" : "template.create", `${id ? "Edited" : "Created"} certificate template “${template.name}”`, {
    target: ["template", template.id],
  });
  refresh();
  return { ok: true, id: template.id };
}

export async function duplicateTemplate(id: string): Promise<void> {
  const admin = await requireAdmin();
  const source = await prisma.certificateTemplate.findUniqueOrThrow({ where: { id } });
  const copy = await prisma.certificateTemplate.create({
    data: { ...toDesign(source), name: `${source.name} (copy)`.slice(0, 80) },
  });
  await audit(admin, "template.create", `Duplicated certificate template “${source.name}”`, { target: ["template", copy.id] });
  refresh();
  redirect(`/admin/certificates/templates/${copy.id}`);
}

export async function makeDefaultTemplate(id: string): Promise<void> {
  const admin = await requireAdmin();
  const [, template] = await prisma.$transaction([
    prisma.certificateTemplate.updateMany({ where: { isDefault: true }, data: { isDefault: false } }),
    prisma.certificateTemplate.update({ where: { id }, data: { isDefault: true } }),
  ]);
  await audit(admin, "template.default", `Made “${template.name}” the default certificate template`, { target: ["template", id] });
  refresh();
}

export async function deleteTemplate(id: string): Promise<ActionState> {
  const admin = await requireAdmin();
  const template = await prisma.certificateTemplate.findUnique({ where: { id }, select: { isDefault: true, name: true } });
  if (!template) return { error: "Template not found." };
  if (template.isDefault) return { error: "Make another template the default first." };
  // Programmes and certificates using it fall back to the default template.
  await prisma.certificateTemplate.delete({ where: { id } });
  await audit(admin, "template.delete", `Deleted certificate template “${template.name}”`, { target: ["template", id] });
  refresh();
  redirect("/admin/certificates?tab=templates");
}

/* ------------------------------------------------------------------ *
 * Programme certificate settings
 * ------------------------------------------------------------------ */

const programCertificateSchema = z.object({
  certificateEnabled: z.boolean(),
  certificateTemplateId: z.string().max(40),
  certificatePassMark: z.coerce.number().int().min(0, "Pass mark is 0–100").max(100, "Pass mark is 0–100"),
  cpdEnabled: z.boolean(),
  cpdProvider: line(120),
  cpdHours: z.union([z.literal(""), z.coerce.number().int().min(1, "CPD hours must be at least 1").max(1000)]),
});

export async function updateProgramCertificate(programId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const parsed = programCertificateSchema.safeParse({
    certificateEnabled: fd.get("certificateEnabled") === "on",
    certificateTemplateId: String(fd.get("certificateTemplateId") ?? ""),
    certificatePassMark: fd.get("certificatePassMark"),
    cpdEnabled: fd.get("cpdEnabled") === "on",
    cpdProvider: String(fd.get("cpdProvider") ?? ""),
    cpdHours: String(fd.get("cpdHours") ?? "").trim(),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid settings" };
  const { certificateTemplateId, cpdHours, ...data } = parsed.data;
  if (data.cpdEnabled && !data.cpdProvider) return { error: "Name the CPD issuing body." };

  const before = await prisma.program.findUniqueOrThrow({ where: { id: programId } });
  const next = { ...data, certificateTemplateId: certificateTemplateId || null, cpdHours: cpdHours === "" ? null : cpdHours };
  await prisma.program.update({ where: { id: programId }, data: next });
  const diff = changes(before, next);
  if (Object.keys(diff).length) {
    await audit(admin, "certificate.settings", `Changed certificate settings for “${before.title}”`, { target: ["program", programId], details: diff });
  }
  revalidatePath(`/admin/programs/${programId}`);
  refresh();
  return { ok: true };
}

export async function issueEligible(programId: string): Promise<Result<{ issued: number }>> {
  const admin = await requireAdmin();
  const issued = await issueEligibleForProgram(programId);
  const program = await prisma.program.findUnique({ where: { id: programId }, select: { title: true } });
  await audit(admin, "certificate.issue", `Issued ${issued} ${issued === 1 ? "certificate" : "certificates"} for “${program?.title}”`, {
    target: ["program", programId],
  });
  refresh();
  return { ok: true, issued };
}

/* ------------------------------------------------------------------ *
 * Issued certificates and CPD
 * ------------------------------------------------------------------ */

export async function revokeCertificate(id: string, reason: string): Promise<Result> {
  const admin = await requireAdmin();
  const cert = await prisma.certificate.update({
    where: { id },
    data: { revokedAt: new Date(), revokedReason: reason.trim().slice(0, 300) || null },
  });
  await audit(admin, "certificate.revoke", `Revoked certificate ${cert.serial} (${cert.recipientName})`, {
    target: ["user", cert.userId],
    details: { serial: cert.serial, reason: cert.revokedReason },
  });
  refresh();
  return { ok: true };
}

export async function restoreCertificate(id: string): Promise<Result> {
  const admin = await requireAdmin();
  const cert = await prisma.certificate.update({ where: { id }, data: { revokedAt: null, revokedReason: null } });
  await audit(admin, "certificate.restore", `Restored certificate ${cert.serial} (${cert.recipientName})`, { target: ["user", cert.userId] });
  refresh();
  return { ok: true };
}

const cpdSchema = z.object({
  ids: z.array(z.string().max(40)).min(1).max(1000),
  status: z.enum(["PENDING", "SUBMITTED", "ISSUED"]),
});

export async function setCpdStatus(ids: string[], status: "PENDING" | "SUBMITTED" | "ISSUED"): Promise<Result<{ updated: number }>> {
  const admin = await requireAdmin();
  const parsed = cpdSchema.safeParse({ ids, status });
  if (!parsed.success) return { ok: false, error: "Nothing to update." };
  const { count } = await prisma.certificate.updateMany({
    where: { id: { in: parsed.data.ids }, cpdStatus: { not: "NONE" } },
    data: { cpdStatus: parsed.data.status, cpdUpdatedAt: new Date() },
  });
  await audit(admin, "cpd.status", `Marked ${count} CPD ${count === 1 ? "request" : "requests"} as ${parsed.data.status.toLowerCase()}`, {
    details: { certificateIds: parsed.data.ids.slice(0, 200) },
  });
  refresh();
  return { ok: true, updated: count };
}
