import "server-only";
import { generateText, Output } from "ai";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { backfillAssetText, needsTextBackfill } from "./packages";
import { tutorModel } from "./tutor";

/**
 * Drafts quiz questions from the course's own lesson material (descriptions,
 * tutor notes and text extracted from uploaded packages) with the same model
 * as the AI tutor. Admins review and edit the result like any other question.
 */

/** Characters of material sent to the model. */
const MATERIAL_LIMIT = 60_000;

export const GENERATE_COUNTS = [5, 10, 15, 20] as const;
export const DIFFICULTIES = ["easy", "mixed", "challenging"] as const;
export type QuestionKind = "SINGLE" | "MULTIPLE" | "TRUE_FALSE";
export type Difficulty = (typeof DIFFICULTIES)[number];

export type QuizKind = "QUIZ" | "EXAM";

export interface SourceLesson {
  id: string;
  title: string;
  moduleTitle: string;
  /** Characters of written material available; 0 means only the title. */
  chars: number;
  /** Selected by default: the lessons a quiz follows, or the whole course for an exam. */
  suggested: boolean;
}

/**
 * Non-quiz lessons in the quiz's course, in course order, with how much text
 * each has. A quiz suggests the lessons since the previous quiz; a final
 * assessment suggests every lesson.
 */
export async function listQuizSources(quizLessonId: string): Promise<{ kind: QuizKind; sources: SourceLesson[] }> {
  const quizLesson = await prisma.lesson.findUnique({
    where: { id: quizLessonId },
    select: { module: { select: { courseId: true } }, quiz: { select: { kind: true } } },
  });
  if (!quizLesson) return { kind: "QUIZ", sources: [] };
  const kind = quizLesson.quiz?.kind ?? "QUIZ";
  const lessons = await prisma.lesson.findMany({
    where: { module: { courseId: quizLesson.module.courseId } },
    orderBy: [{ module: { order: "asc" } }, { order: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      type: true,
      title: true,
      description: true,
      tutorNotes: true,
      module: { select: { title: true } },
      asset: true,
    },
  });

  // Packages extracted before (or by an older extractor) are read again, so the counts are real.
  const text = new Map(
    await Promise.all(
      lessons.map(async (l) => [l.id, needsTextBackfill(l.type, l.asset) ? await backfillAssetText(l.asset!) : (l.asset?.textContent ?? "")] as const)
    )
  );

  const at = lessons.findIndex((l) => l.id === quizLessonId);
  const previousQuiz = lessons.slice(0, Math.max(at, 0)).findLastIndex((l) => l.type === "QUIZ");
  const sinceLastQuiz = new Set(lessons.slice(previousQuiz + 1, Math.max(at, 0)).map((l) => l.id));
  const beforeQuiz = new Set(lessons.slice(0, Math.max(at, 0)).map((l) => l.id));
  const content = lessons.filter((l) => l.type !== "QUIZ");
  const pick =
    kind === "EXAM"
      ? () => true
      : content.some((l) => sinceLastQuiz.has(l.id))
        ? (id: string) => sinceLastQuiz.has(id)
        : content.some((l) => beforeQuiz.has(l.id))
          ? (id: string) => beforeQuiz.has(id)
          : () => true;

  return {
    kind,
    sources: content.map((l) => ({
      id: l.id,
      title: l.title,
      moduleTitle: l.module.title,
      chars: l.description.length + l.tutorNotes.length + (text.get(l.id)?.length ?? 0),
      suggested: pick(l.id),
    })),
  };
}

async function gatherMaterial(courseId: string, lessonIds: string[]): Promise<string> {
  const lessons = await prisma.lesson.findMany({
    where: { id: { in: lessonIds }, module: { courseId }, type: { not: "QUIZ" } },
    orderBy: [{ module: { order: "asc" } }, { order: "asc" }],
    include: { asset: true, module: { select: { title: true } } },
  });
  const parts = await Promise.all(
    lessons.map(async (l) => {
      const text = needsTextBackfill(l.type, l.asset) ? await backfillAssetText(l.asset!) : (l.asset?.textContent ?? "");
      const body = [l.description, l.tutorNotes, text].filter(Boolean).join("\n\n");
      const attr = (v: string) => v.replace(/"/g, "'");
      return body ? `<lesson module="${attr(l.module.title)}" title="${attr(l.title)}">\n${body}\n</lesson>` : "";
    })
  );
  // Share the budget evenly so one long package doesn't crowd out the rest.
  const filled = parts.filter(Boolean);
  const each = Math.floor(MATERIAL_LIMIT / Math.max(1, filled.length));
  return filled.map((p) => (p.length > each ? p.slice(0, each) + "\n…</lesson>" : p)).join("\n\n");
}

// Every field is required: OpenAI's strict structured outputs reject optional keys.
const generatedSchema = z.object({
  questions: z.array(
    z.object({
      type: z.enum(["SINGLE", "MULTIPLE", "TRUE_FALSE"]),
      prompt: z.string().describe("The question, one or two sentences"),
      options: z.array(z.string()).describe("Answer choices. For TRUE_FALSE exactly [\"True\", \"False\"]"),
      correct: z.array(z.number().int()).describe("Zero-based indexes of the correct options"),
      explanation: z.string().describe("Why the answer is right, citing the lesson, in 1-2 sentences"),
    })
  ),
});

export interface DraftQuestion {
  type: QuestionKind;
  prompt: string;
  options: { id: string; text: string }[];
  correct: string[];
  explanation: string;
}

export type GenerateResult = { ok: true; questions: DraftQuestion[] } | { ok: false; error: string };

export async function generateQuizDraft(input: {
  quizLessonId: string;
  sourceLessonIds: string[];
  count: number;
  types: QuestionKind[];
  difficulty: Difficulty;
  focus: string;
  /** Prompts already in the quiz, so new questions don't repeat them. */
  existing: string[];
}): Promise<GenerateResult> {
  const quizLesson = await prisma.lesson.findUnique({
    where: { id: input.quizLessonId },
    select: {
      title: true,
      quiz: { select: { kind: true } },
      module: { select: { courseId: true, course: { select: { title: true } } } },
    },
  });
  if (!quizLesson) return { ok: false, error: "Lesson not found." };

  const material = await gatherMaterial(quizLesson.module.courseId, input.sourceLessonIds);
  if (material.length < 200) {
    return {
      ok: false,
      error:
        "The selected lessons don't have enough written material yet. Upload their content, or add key points in each lesson's Tutor notes.",
    };
  }

  const typeRules = {
    SINGLE: "SINGLE: 4 options, exactly one correct.",
    MULTIPLE: "MULTIPLE: 4-5 options, two or more correct. Say \"Select all that apply\" in the prompt.",
    TRUE_FALSE: 'TRUE_FALSE: options exactly ["True", "False"], one correct.',
  } satisfies Record<QuestionKind, string>;

  let output: z.infer<typeof generatedSchema>;
  try {
    ({ output } = await generateText({
      model: tutorModel(),
      output: Output.object({ schema: generatedSchema }),
      system: `You write assessment questions for Oakvale Learning, a provider of healthcare and caregiving training.

Rules:
- Base every question only on the lesson material provided. Never test facts that are not in it.
- Test understanding and safe practice (what to do, why, in what order), not trivia like page titles.
- Use plain English suitable for adult learners. Keep prompts and options short.
- Wrong options must be plausible but clearly wrong according to the material. Avoid "all of the above" and "none of the above".
- Vary which position holds the correct answer.
- Each explanation says why the correct answer is right, based on the material.`,
      prompt: `Course: ${quizLesson.module.course.title}
${quizLesson.quiz?.kind === "EXAM" ? "Final assessment" : "Quiz"}: ${quizLesson.title}
${
  quizLesson.quiz?.kind === "EXAM"
    ? "This is the course's final assessment, taken after every lesson. Spread the questions evenly across all the lessons below, and include some that bring together ideas from more than one lesson."
    : "This quiz sits straight after the lessons below and checks that learners understood them. Focus on their key points and safe practice."
}

Write exactly ${input.count} questions. Difficulty: ${input.difficulty}.
Use only these question types, mixed sensibly:
${input.types.map((t) => `- ${typeRules[t]}`).join("\n")}
${input.focus ? `\nFocus on: ${input.focus}\n` : ""}${
        input.existing.length
          ? `\nThe quiz already has these questions; do not repeat or closely paraphrase them:\n${input.existing.map((p) => `- ${p}`).join("\n")}\n`
          : ""
      }
<lesson_material>
${material}
</lesson_material>`,
    }));
  } catch (err) {
    console.error("[quiz-generator]", err);
    return { ok: false, error: "The AI couldn't write questions just now. Please try again." };
  }

  const questions = output.questions.flatMap((q): DraftQuestion[] => {
    const type = input.types.includes(q.type) ? q.type : input.types[0];
    const texts = type === "TRUE_FALSE" ? ["True", "False"] : q.options.map((t) => t.trim()).filter(Boolean).slice(0, 10);
    const ids = type === "TRUE_FALSE" ? ["true", "false"] : texts.map((_, i) => `o${i + 1}`);
    let correct = [...new Set(q.correct)].filter((i) => i >= 0 && i < texts.length).map((i) => ids[i]);
    if (type !== "MULTIPLE") correct = correct.slice(0, 1);
    if (texts.length < 2 || correct.length === 0 || q.prompt.trim().length < 3) return [];
    return [
      {
        type,
        prompt: q.prompt.trim(),
        options: texts.map((text, i) => ({ id: ids[i], text })),
        correct,
        explanation: q.explanation.trim(),
      },
    ];
  });
  if (questions.length === 0) return { ok: false, error: "The AI's questions didn't come out usable. Please try again." };
  return { ok: true, questions: questions.slice(0, input.count) };
}
