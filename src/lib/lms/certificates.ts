import "server-only";
import { randomInt } from "node:crypto";
import bwipjs from "bwip-js/node";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { appUrl } from "@/lib/email-templates";
import { sendCertificateEmail } from "@/lib/emails";
import { DEFAULT_DESIGN, toDesign, type TemplateDesign } from "@/lib/certificate-design";
import { getUnlockedModuleIds } from "./access";

/**
 * Module certificates. A learner earns one when every published lesson is
 * complete and the average of their best quiz scores reaches the module's
 * pass mark. Modules with CPD also queue a CPD request, which the admin sends
 * to the issuing body; that body emails its certificate to the learner.
 */

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const block = () => Array.from({ length: 4 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
const newSerial = () => `OAK-${block()}-${block()}`;

export const verifyUrl = (serial: string) => `${appUrl()}/verify/${serial}`;

/** QR code (links to the verify page) and Code 128 barcode (the ID), as SVG markup. */
export function certificateCodes(serial: string) {
  return {
    qrSvg: bwipjs.toSVG({ bcid: "qrcode", text: verifyUrl(serial), scale: 3 }),
    barcodeSvg: bwipjs.toSVG({ bcid: "code128", text: serial, height: 9, scale: 2, includetext: false }),
  };
}

/** A template's design, falling back to the default template, then the built-in one. */
export async function getDesign(templateId: string | null | undefined): Promise<TemplateDesign> {
  const template =
    (templateId && (await prisma.certificateTemplate.findUnique({ where: { id: templateId } }))) ||
    (await prisma.certificateTemplate.findFirst({ where: { isDefault: true } })) ||
    (await prisma.certificateTemplate.findFirst({ orderBy: { createdAt: "asc" } }));
  return template ? toDesign(template) : DEFAULT_DESIGN;
}

export interface CertificateProgress {
  enabled: boolean;
  lessonsDone: number;
  lessonsTotal: number;
  /** Quizzes in the module and how many the learner has attempted. */
  quizzes: number;
  quizzesTaken: number;
  /** Average of best quiz scores, counting untaken quizzes as 0; null without quizzes. */
  score: number | null;
  passMark: number;
  eligible: boolean;
}

/** Where a learner stands against a module's certificate requirements. */
export async function getCertificateProgress(userId: string, moduleId: string): Promise<CertificateProgress | null> {
  const mod = await prisma.module.findUnique({
    where: { id: moduleId },
    select: { certificateEnabled: true, certificatePassMark: true },
  });
  if (!mod) return null;

  const lessons = await prisma.lesson.findMany({
    where: { published: true, topic: { moduleId } },
    select: {
      quiz: { select: { _count: { select: { questions: true } } } },
      progress: { where: { userId }, select: { status: true, score: true } },
    },
  });
  // A quiz with no questions can't be taken, so it doesn't count. (A lesson's score is its quiz's score.)
  const quizzes = lessons.filter((l) => (l.quiz?._count.questions ?? 0) > 0);
  const lessonsDone = lessons.filter((l) => l.progress[0]?.status === "COMPLETED").length;
  const score = quizzes.length
    ? Math.round(quizzes.reduce((sum, l) => sum + (l.progress[0]?.score ?? 0), 0) / quizzes.length)
    : null;

  return {
    enabled: mod.certificateEnabled,
    lessonsDone,
    lessonsTotal: lessons.length,
    quizzes: quizzes.length,
    quizzesTaken: quizzes.filter((l) => l.progress[0]?.score !== null && l.progress[0]?.score !== undefined).length,
    score,
    passMark: mod.certificatePassMark,
    eligible:
      mod.certificateEnabled &&
      lessons.length > 0 &&
      lessonsDone === lessons.length &&
      (score === null || score >= mod.certificatePassMark),
  };
}

/** Issue the module certificate if the learner qualifies and doesn't have one yet. */
export async function issueCertificateIfEligible(userId: string, moduleId: string) {
  const existing = await prisma.certificate.findUnique({ where: { userId_moduleId: { userId, moduleId } } });
  if (existing) return existing;

  const progress = await getCertificateProgress(userId, moduleId);
  if (!progress?.eligible) return null;

  const [user, mod] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { name: true, email: true, role: true } }),
    prisma.module.findUniqueOrThrow({
      where: { id: moduleId },
      select: {
        title: true,
        certificateTemplateId: true,
        cpdEnabled: true,
        cpdProvider: true,
        cpdHours: true,
        program: { select: { title: true } },
      },
    }),
  ]);
  // Admins previewing a module don't earn certificates.
  if (user.role === "ADMIN") return null;

  const templateId =
    mod.certificateTemplateId ??
    (await prisma.certificateTemplate.findFirst({ where: { isDefault: true }, select: { id: true } }))?.id ??
    null;

  let certificate = null;
  for (let attempt = 0; !certificate && attempt < 5; attempt++) {
    try {
      certificate = await prisma.certificate.create({
        data: {
          serial: newSerial(),
          userId,
          moduleId,
          templateId,
          recipientName: user.name,
          moduleTitle: mod.title,
          programTitle: mod.program.title,
          score: progress.score,
          ...(mod.cpdEnabled
            ? { cpdStatus: "PENDING", cpdProvider: mod.cpdProvider || null, cpdHours: mod.cpdHours, cpdUpdatedAt: new Date() }
            : {}),
        },
      });
    } catch (err) {
      if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")) throw err;
      // Either the serial collided (try another) or a parallel request already issued it.
      const raced = await prisma.certificate.findUnique({ where: { userId_moduleId: { userId, moduleId } } });
      if (raced) return raced;
    }
  }
  if (!certificate) throw new Error("Could not allocate a certificate ID.");

  if (await sendCertificateEmail(user, { ...certificate, link: `${appUrl()}/certificates/${certificate.serial}` })) {
    await prisma.certificate.update({ where: { id: certificate.id }, data: { emailSentAt: new Date() } });
  }
  return certificate;
}

/** After a lesson is completed: issue its module's certificate if that finished the module. */
export async function checkCertificateAfterLesson(userId: string, lessonId: string) {
  const lesson = await prisma.lesson.findUnique({ where: { id: lessonId }, select: { topic: { select: { moduleId: true } } } });
  if (!lesson) return;
  try {
    await issueCertificateIfEligible(userId, lesson.topic.moduleId);
  } catch (err) {
    console.error("[certificates] issue failed:", err);
  }
}

/** Issue any certificates a learner qualifies for but is missing (e.g. after an admin turned them on). */
export async function syncCertificates(userId: string) {
  const moduleIds = await getUnlockedModuleIds(userId);
  const modules = await prisma.module.findMany({
    where: { id: { in: [...moduleIds] }, certificateEnabled: true, certificates: { none: { userId } } },
    select: { id: true },
  });
  for (const c of modules) {
    try {
      await issueCertificateIfEligible(userId, c.id);
    } catch (err) {
      console.error("[certificates] sync failed:", err);
    }
  }
}

/** Admin: issue to everyone who has already met a module's requirements. */
export async function issueEligibleForModule(moduleId: string): Promise<number> {
  const learners = await prisma.lessonProgress.findMany({
    where: { status: "COMPLETED", lesson: { topic: { moduleId } }, user: { certificates: { none: { moduleId } } } },
    distinct: ["userId"],
    select: { userId: true },
  });
  let issued = 0;
  for (const { userId } of learners) {
    // Only learners who can still open the module (active enrolment).
    if (!(await getUnlockedModuleIds(userId)).has(moduleId)) continue;
    if (await issueCertificateIfEligible(userId, moduleId)) issued++;
  }
  return issued;
}
