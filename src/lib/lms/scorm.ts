import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { recordProgress } from "./progress";

/**
 * Persisting the SCORM runtime data model (cmi) sent by scorm-again on each
 * commit, and mapping it onto LessonProgress.
 */

type Cmi = Record<string, unknown>;

const get = (obj: unknown, path: string): unknown =>
  path.split(".").reduce<unknown>((o, k) => (o && typeof o === "object" ? (o as Cmi)[k] : undefined), obj);

const num = (v: unknown): number | undefined => {
  const n = typeof v === "string" ? parseFloat(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : undefined;
};

/** Completion and percent score from a SCORM 1.2 or 2004 cmi object. */
export function summarizeCmi(version: string, cmi: Cmi): { completed: boolean; score?: number } {
  if (version === "1.2") {
    const status = String(get(cmi, "core.lesson_status") ?? "");
    const raw = num(get(cmi, "core.score.raw"));
    const max = num(get(cmi, "core.score.max"));
    const min = num(get(cmi, "core.score.min")) ?? 0;
    const score =
      raw === undefined ? undefined : max && max > min ? ((raw - min) / (max - min)) * 100 : raw;
    return { completed: status === "completed" || status === "passed", score };
  }
  const completion = String(get(cmi, "completion_status") ?? "");
  const success = String(get(cmi, "success_status") ?? "");
  const scaled = num(get(cmi, "score.scaled"));
  const raw = num(get(cmi, "score.raw"));
  const score = scaled !== undefined ? scaled * 100 : raw;
  return { completed: completion === "completed" || success === "passed", score };
}

export async function saveScormState(
  userId: string,
  lessonId: string,
  version: string,
  cmi: Cmi
): Promise<void> {
  const json = cmi as Prisma.InputJsonValue;
  await prisma.scormState.upsert({
    where: { userId_lessonId: { userId, lessonId } },
    update: { cmi: json },
    create: { userId, lessonId, cmi: json },
  });
  const { completed, score } = summarizeCmi(version, cmi);
  await recordProgress(userId, lessonId, {
    completed,
    score: score === undefined ? undefined : Math.min(100, Math.max(0, score)),
  });
}

/**
 * The saved cmi to preload before the package initialises, so it resumes where
 * the learner left off. Write-only/session fields are dropped and `entry` is
 * set to "resume" when the last session was suspended.
 */
export async function getInitialCmi(
  userId: string,
  lessonId: string,
  version: string,
  learner: { id: string; name: string }
): Promise<Cmi> {
  const state = await prisma.scormState.findUnique({
    where: { userId_lessonId: { userId, lessonId } },
  });
  const saved = structuredClone((state?.cmi as Cmi | undefined) ?? {});

  if (version === "1.2") {
    const core = ((saved.core as Cmi | undefined) ?? {}) as Cmi;
    const suspended = core.exit === "suspend";
    delete core.exit;
    delete core.session_time;
    core.student_id = learner.id;
    core.student_name = learner.name;
    core.entry = state ? (suspended ? "resume" : "") : "ab-initio";
    saved.core = core;
    return saved;
  }

  const suspended = saved.exit === "suspend";
  delete saved.exit;
  delete saved.session_time;
  saved.learner_id = learner.id;
  saved.learner_name = learner.name;
  saved.entry = state ? (suspended ? "resume" : "") : "ab-initio";
  return saved;
}
