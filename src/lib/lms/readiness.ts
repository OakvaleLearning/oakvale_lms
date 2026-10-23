/**
 * Whether a lesson part has what learners need. Shared by the admin pages.
 * No database access: pass in what the page already loaded.
 */

export type PartStatus = "READY" | "EMPTY" | "UPLOADING" | "PROCESSING" | "FAILED";

interface PartLike {
  type: string;
  body: string;
  asset: { status: string } | null;
}

/** A part's state: written parts need text, quizzes need questions, file parts need a processed upload. */
export function partStatus(part: PartLike, questionCount: number): PartStatus {
  if (part.type === "TEXT") return part.body.trim() ? "READY" : "EMPTY";
  if (part.type === "QUIZ") return questionCount > 0 ? "READY" : "EMPTY";
  return (part.asset?.status as PartStatus | undefined) ?? "EMPTY";
}

export interface LessonReadiness {
  total: number;
  ready: number;
  /** The first problem found, if any, in the order learners would hit it. */
  problem: Exclude<PartStatus, "READY"> | null;
}

export function lessonReadiness(parts: PartLike[], questionCount: number): LessonReadiness {
  const statuses = parts.map((p) => partStatus(p, questionCount));
  const problem = statuses.find((s) => s === "FAILED") ?? statuses.find((s) => s !== "READY") ?? null;
  return { total: parts.length, ready: statuses.filter((s) => s === "READY").length, problem: problem as LessonReadiness["problem"] };
}
