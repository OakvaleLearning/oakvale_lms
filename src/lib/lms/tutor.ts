import "server-only";
import { openai } from "@ai-sdk/openai";
import { prisma } from "@/lib/prisma";
import type { SessionPayload } from "@/lib/auth";
import type { LessonAccess } from "./access";
import { backfillAssetText } from "./packages";
import type { QuizOption } from "./quiz";

/**
 * AI tutor shown beside each lesson. Answers are grounded in the lesson's own
 * material: its description, admin "tutor notes", text extracted from the
 * uploaded package and, once a quiz is finished, the learner's results.
 */

/** Any OpenAI model id from the Vercel AI Gateway, e.g. "openai/gpt-5.5". */
export const TUTOR_MODEL = "openai/gpt-5.4-mini";

/** OpenAI directly when OPENAI_API_KEY is set, otherwise the Vercel AI Gateway. */
export function tutorModel() {
  return process.env.OPENAI_API_KEY ? openai(TUTOR_MODEL.replace(/^openai\//, "")) : TUTOR_MODEL;
}

/** Learner messages allowed per rolling hour, across all lessons. */
export const TUTOR_HOURLY_LIMIT = 30;

/** Earlier messages replayed to the model with each question. */
const HISTORY_LIMIT = 20;

/** Characters of lesson material included in the prompt. */
const MATERIAL_LIMIT = 24_000;

export type TutorAvailability = "OPEN" | "QUIZ_LOCKED";
type AccessibleLesson = Extract<LessonAccess, { ok: true }>["lesson"];

export interface TutorMessageView {
  id: string;
  role: "user" | "assistant";
  text: string;
}

/**
 * The tutor stays closed on a quiz until its answers would be revealed anyway:
 * the learner has passed or has no attempts left.
 */
export async function getTutorAvailability(
  session: SessionPayload,
  lesson: Pick<AccessibleLesson, "id" | "type">
): Promise<TutorAvailability> {
  if (lesson.type !== "QUIZ" || session.role === "ADMIN") return "OPEN";
  const quiz = await prisma.quiz.findUnique({
    where: { lessonId: lesson.id },
    select: { maxAttempts: true, attempts: { where: { userId: session.userId }, select: { passed: true } } },
  });
  if (!quiz) return "OPEN";
  const finished =
    quiz.attempts.some((a) => a.passed) || (quiz.maxAttempts !== null && quiz.attempts.length >= quiz.maxAttempts);
  return finished ? "OPEN" : "QUIZ_LOCKED";
}

export async function getTutorHistory(userId: string, lessonId: string): Promise<TutorMessageView[]> {
  const messages = await prisma.tutorMessage.findMany({
    where: { thread: { userId, lessonId } },
    orderBy: { createdAt: "asc" },
    select: { id: true, role: true, content: true },
  });
  return messages.map((m) => ({ id: m.id, role: m.role === "USER" ? "user" : "assistant", text: m.content }));
}

/** Recent history in model form, oldest first. */
export async function getRecentTutorMessages(threadId: string) {
  const recent = await prisma.tutorMessage.findMany({
    where: { threadId },
    orderBy: { createdAt: "desc" },
    take: HISTORY_LIMIT,
    select: { role: true, content: true },
  });
  return recent.reverse().map((m) => ({
    role: m.role === "USER" ? ("user" as const) : ("assistant" as const),
    content: m.content,
  }));
}

export async function getOrCreateThread(userId: string, lessonId: string) {
  return prisma.tutorThread.upsert({
    where: { userId_lessonId: { userId, lessonId } },
    create: { userId, lessonId },
    update: {},
    select: { id: true },
  });
}

export async function isOverTutorLimit(userId: string): Promise<boolean> {
  const sent = await prisma.tutorMessage.count({
    where: { role: "USER", thread: { userId }, createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) } },
  });
  return sent >= TUTOR_HOURLY_LIMIT;
}

/** System prompt describing the tutor's role and the lesson it is helping with. */
export async function buildTutorSystemPrompt(session: SessionPayload, lesson: AccessibleLesson): Promise<string> {
  const course = lesson.module.course;
  const [siblings, quizNotes] = await Promise.all([
    prisma.lesson.findMany({
      where: { moduleId: lesson.moduleId, published: true },
      orderBy: { order: "asc" },
      select: { title: true },
    }),
    lesson.type === "QUIZ" ? describeQuizResults(session.userId, lesson.id) : Promise.resolve(""),
  ]);

  let packageText = lesson.asset?.textContent ?? null;
  if (packageText === null && lesson.asset?.status === "READY" && (lesson.type === "SCORM" || lesson.type === "HTML")) {
    packageText = await backfillAssetText(lesson.asset);
  }

  const material = [
    lesson.description && `Lesson notes:\n${lesson.description}`,
    lesson.tutorNotes && `Additional material from the instructor:\n${lesson.tutorNotes}`,
    packageText && `Lesson content:\n${packageText}`,
  ]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, MATERIAL_LIMIT);

  return `You are the Oakvale Learning tutor, helping a learner on a healthcare and caregiving training programme.

The learner's first name is ${session.name.split(" ")[0]}.
Programme: ${course.program.title}
Course: ${course.title}
Module: ${lesson.module.title}
Lessons in this module: ${siblings.map((s) => s.title).join("; ")}
Current lesson: ${lesson.title}

How to help:
- Base your answers on the lesson material below. If something is not covered there, say so briefly, then give a short general explanation and suggest they check with their instructor.
- Explain in plain, warm English for an adult learner. Keep answers short (a few sentences or a short list) unless asked for more. Use simple markdown.
- When asked to quiz the learner, ask one question at a time and wait for their answer.
- Stay on the course topic. Politely steer unrelated requests back to the lesson.
- This is training, not clinical advice. If the learner describes a real person's health or an emergency, tell them to follow their workplace procedures and speak to a supervisor, nurse or doctor (or emergency services if urgent).
- Never invent Oakvale policies, fees, certification rules or deadlines; point them to Oakvale support for those.
${quizNotes ? `\n${quizNotes}\n` : ""}
<lesson_material>
${material || "No written material is available for this lesson yet. Use the titles above for context."}
</lesson_material>`;
}

/** The learner's latest attempt, for explaining mistakes after a finished quiz. */
async function describeQuizResults(userId: string, lessonId: string): Promise<string> {
  const quiz = await prisma.quiz.findUnique({
    where: { lessonId },
    include: {
      questions: { orderBy: { order: "asc" } },
      attempts: { where: { userId }, orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  const attempt = quiz?.attempts[0];
  if (!quiz || !attempt) return "";

  const answers = attempt.answers as Record<string, string[]>;
  const lines = quiz.questions.map((q, i) => {
    const options = q.options as unknown as QuizOption[];
    const text = (ids: string[]) =>
      ids.map((id) => options.find((o) => o.id === id)?.text ?? id).join(", ") || "(no answer)";
    const correct = q.correct as string[];
    const given = answers[q.id] ?? [];
    const right = given.length === correct.length && given.every((id) => correct.includes(id));
    return [
      `${i + 1}. ${q.prompt}`,
      `   Learner answered: ${text(given)} — ${right ? "correct" : "incorrect"}`,
      `   Correct answer: ${text(correct)}`,
      q.explanation ? `   Explanation: ${q.explanation}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  });

  return `The learner has finished this quiz (latest score ${attempt.score}%, pass mark ${quiz.passMark}%). Help them understand any questions they got wrong.
<quiz_results>
${lines.join("\n")}
</quiz_results>`;
}
