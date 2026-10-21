"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { FONTS, LAYOUTS, toDesign } from "@/lib/certificate-design";
import { issueEligibleForCourse } from "@/lib/lms/certificates";

type ActionState = { error?: string; ok?: boolean } | undefined;
type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

function refresh() {
  revalidatePath("/admin/certificates", "layout");
  revalidatePath("/learn", "layout");
}

/* ------------------------------------------------------------------ *
 * Templates
 * ------------------------------------------------------------------ */

const color = z.string().regex(/^#[0-9a-f]{6}$/i, "Colours must be hex values like #3229a2");
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
  await requireAdmin();
  const parsed = templateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid template" };

  const template = id
    ? await prisma.certificateTemplate.update({ where: { id }, data: parsed.data })
    : await prisma.certificateTemplate.create({
        // The first template becomes the default.
        data: { ...parsed.data, isDefault: (await prisma.certificateTemplate.count()) === 0 },
      });
  refresh();
  return { ok: true, id: template.id };
}

export async function duplicateTemplate(id: string): Promise<void> {
  await requireAdmin();
  const source = await prisma.certificateTemplate.findUniqueOrThrow({ where: { id } });
  const copy = await prisma.certificateTemplate.create({
    data: { ...toDesign(source), name: `${source.name} (copy)`.slice(0, 80) },
  });
  refresh();
  redirect(`/admin/certificates/templates/${copy.id}`);
}

export async function makeDefaultTemplate(id: string): Promise<void> {
  await requireAdmin();
  await prisma.$transaction([
    prisma.certificateTemplate.updateMany({ where: { isDefault: true }, data: { isDefault: false } }),
    prisma.certificateTemplate.update({ where: { id }, data: { isDefault: true } }),
  ]);
  refresh();
}

export async function deleteTemplate(id: string): Promise<ActionState> {
  await requireAdmin();
  const template = await prisma.certificateTemplate.findUnique({ where: { id }, select: { isDefault: true } });
  if (!template) return { error: "Template not found." };
  if (template.isDefault) return { error: "Make another template the default first." };
  // Courses and certificates using it fall back to the default template.
  await prisma.certificateTemplate.delete({ where: { id } });
  refresh();
  redirect("/admin/certificates?tab=templates");
}

/* ------------------------------------------------------------------ *
 * Course certificate settings
 * ------------------------------------------------------------------ */

const courseCertificateSchema = z.object({
  certificateEnabled: z.boolean(),
  certificateTemplateId: z.string().max(40),
  certificatePassMark: z.coerce.number().int().min(0, "Pass mark is 0–100").max(100, "Pass mark is 0–100"),
  cpdEnabled: z.boolean(),
  cpdProvider: line(120),
  cpdHours: z.union([z.literal(""), z.coerce.number().int().min(1, "CPD hours must be at least 1").max(1000)]),
});

export async function updateCourseCertificate(courseId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireAdmin();
  const parsed = courseCertificateSchema.safeParse({
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

  await prisma.course.update({
    where: { id: courseId },
    data: { ...data, certificateTemplateId: certificateTemplateId || null, cpdHours: cpdHours === "" ? null : cpdHours },
  });
  revalidatePath(`/admin/courses/${courseId}`);
  refresh();
  return { ok: true };
}

export async function issueEligible(courseId: string): Promise<Result<{ issued: number }>> {
  await requireAdmin();
  const issued = await issueEligibleForCourse(courseId);
  refresh();
  return { ok: true, issued };
}

/* ------------------------------------------------------------------ *
 * Issued certificates and CPD
 * ------------------------------------------------------------------ */

export async function revokeCertificate(id: string, reason: string): Promise<Result> {
  await requireAdmin();
  await prisma.certificate.update({
    where: { id },
    data: { revokedAt: new Date(), revokedReason: reason.trim().slice(0, 300) || null },
  });
  refresh();
  return { ok: true };
}

export async function restoreCertificate(id: string): Promise<Result> {
  await requireAdmin();
  await prisma.certificate.update({ where: { id }, data: { revokedAt: null, revokedReason: null } });
  refresh();
  return { ok: true };
}

const cpdSchema = z.object({
  ids: z.array(z.string().max(40)).min(1).max(1000),
  status: z.enum(["PENDING", "SUBMITTED", "ISSUED"]),
});

export async function setCpdStatus(ids: string[], status: "PENDING" | "SUBMITTED" | "ISSUED"): Promise<Result<{ updated: number }>> {
  await requireAdmin();
  const parsed = cpdSchema.safeParse({ ids, status });
  if (!parsed.success) return { ok: false, error: "Nothing to update." };
  const { count } = await prisma.certificate.updateMany({
    where: { id: { in: parsed.data.ids }, cpdStatus: { not: "NONE" } },
    data: { cpdStatus: parsed.data.status, cpdUpdatedAt: new Date() },
  });
  refresh();
  return { ok: true, updated: count };
}
