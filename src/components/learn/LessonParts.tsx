import { CheckCircle2 } from "lucide-react";
import type { checkLessonAccess } from "@/lib/lms/access";
import { BLOCK_LABEL, documentKind, type BlockKind } from "@/lib/lms/blocks";
import { getQuizForLearner } from "@/lib/lms/quiz";
import { getInitialCmi } from "@/lib/lms/scorm";
import { isStorageConfigured, presignDownload } from "@/lib/storage";
import { cn } from "@/lib/utils";
import { LessonIcon } from "@/components/learn/LessonIcon";
import { LessonFrame } from "@/components/learn/LessonFrame";
import { LessonMarkdown } from "@/components/learn/LessonMarkdown";
import { MediaPlayer } from "@/components/learn/MediaPlayer";
import { ScormPlayer } from "@/components/learn/ScormPlayer";
import { QuizPlayer } from "@/components/learn/QuizPlayer";
import { MarkCompleteButton } from "@/components/learn/MarkCompleteButton";
import { DocumentPart } from "@/components/learn/DocumentPart";

type Lesson = Extract<Awaited<ReturnType<typeof checkLessonAccess>>, { ok: true }>["lesson"];
type Part = Lesson["blocks"][number];
type PartState = { status: "IN_PROGRESS" | "COMPLETED"; positionSec: number | null; score: number | null };
/** A learner's progress on each part of the lesson, by part id. */
export type PartProgress = Map<string, PartState>;

/**
 * A lesson's parts in order. A lesson with one part looks like a plain
 * player; with several, each part gets a numbered heading and a strip at the
 * top shows where the learner is.
 */
export async function LessonParts({
  lesson,
  session,
  progress,
}: {
  lesson: Lesson;
  session: { userId: string; name: string };
  progress: PartProgress;
}) {
  const parts = lesson.blocks;
  if (parts.length === 0) return <Placeholder />;

  const done = (p: Part) => progress.get(p.id)?.status === "COMPLETED";
  const single = parts.length === 1;

  return (
    <div>
      {!single && <PartsNav parts={parts} done={done} />}
      <ol className={cn(!single && "mt-6 space-y-10")}>
        {parts.map((part, i) => (
          <li key={part.id} id={`part-${part.id}`} className="scroll-mt-24">
            {!single && <PartHeader part={part} index={i} done={done(part)} />}
            <PartBody part={part} lesson={lesson} session={session} progress={progress.get(part.id)} />
          </li>
        ))}
      </ol>
    </div>
  );
}

const partName = (part: Part) => part.title.trim() || BLOCK_LABEL[part.type as BlockKind];

function PartsNav({ parts, done }: { parts: Part[]; done: (p: Part) => boolean }) {
  const finished = parts.filter(done).length;
  return (
    <nav aria-label="Parts of this lesson" className="card p-4">
      <div className="mb-3 flex items-baseline justify-between gap-3 text-sm">
        <span className="font-medium text-ink-950">In this lesson</span>
        <span className="tabular-nums text-ink-500">
          {finished} of {parts.length} done
        </span>
      </div>
      <ol className="flex gap-2 overflow-x-auto pb-1">
        {parts.map((part, i) => (
          <li key={part.id} className="shrink-0">
            <a
              href={`#part-${part.id}`}
              className={cn(
                "inline-flex h-9 max-w-56 items-center gap-2 rounded-lg border px-3 text-sm transition-colors",
                done(part)
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                  : "border-line bg-white text-ink-700 hover:border-ink-300"
              )}
            >
              {done(part) ? (
                <CheckCircle2 className="size-4 shrink-0" />
              ) : (
                <span className="grid size-5 shrink-0 place-items-center rounded-full bg-ink-100 text-xs font-semibold text-ink-600">
                  {i + 1}
                </span>
              )}
              <span className="truncate">{partName(part)}</span>
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

function PartHeader({ part, index, done }: { part: Part; index: number; done: boolean }) {
  return (
    <header className="mb-3 flex items-center gap-3">
      <span
        className={cn(
          "grid size-8 shrink-0 place-items-center rounded-full text-sm font-semibold",
          done ? "bg-emerald-600 text-white" : "bg-primary-600 text-white"
        )}
      >
        {done ? <CheckCircle2 className="size-4" /> : index + 1}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 text-xs text-ink-500">
          <span className="inline-flex items-center gap-1.5">
            <LessonIcon type={part.type as BlockKind} className="size-3.5" />
            {BLOCK_LABEL[part.type as BlockKind]}
          </span>
          {!part.required && <span className="rounded bg-ink-100 px-1.5 py-0.5 font-medium text-ink-600">Optional</span>}
        </div>
        {part.title.trim() && <h2 className="mt-0.5 text-lg font-semibold leading-snug text-ink-950">{part.title}</h2>}
      </div>
    </header>
  );
}

async function PartBody({
  part,
  lesson,
  session,
  progress,
}: {
  part: Part;
  lesson: Lesson;
  session: { userId: string; name: string };
  progress: PartState | undefined;
}) {
  const completed = progress?.status === "COMPLETED";
  const title = partName(part);

  if (part.type === "TEXT") {
    if (!part.body.trim()) return <Placeholder />;
    return (
      <section className="card p-6 sm:p-8">
        <LessonMarkdown>{part.body}</LessonMarkdown>
        <footer className="mt-6 flex justify-end border-t border-line pt-4">
          <MarkCompleteButton
            key={part.id}
            lessonId={lesson.id}
            blockId={part.id}
            completed={completed}
            label="Mark as read"
          />
        </footer>
      </section>
    );
  }

  if (part.type === "QUIZ") {
    const quiz = await getQuizForLearner(lesson.id, session.userId);
    if (!quiz || quiz.questions.length === 0) return <Placeholder />;
    return (
      <QuizPlayer
        key={part.id}
        lessonId={lesson.id}
        questions={quiz.questions}
        passMark={quiz.passMark}
        attemptsLeft={quiz.maxAttempts === null ? null : Math.max(0, quiz.maxAttempts - quiz.attemptsUsed)}
        bestScore={quiz.bestScore}
        passed={quiz.passed}
      />
    );
  }

  const asset = part.asset;
  if (!asset || asset.status !== "READY" || !isStorageConfigured()) return <Placeholder />;

  if (part.type === "VIDEO" || part.type === "AUDIO") {
    return (
      <MediaPlayer
        key={part.id}
        lessonId={lesson.id}
        blockId={part.id}
        kind={part.type}
        src={await presignDownload(asset.storageKey)}
        startAt={progress?.positionSec ?? 0}
        completed={completed}
      />
    );
  }

  if (part.type === "DOCUMENT") {
    const display = documentKind(asset.fileName);
    const [url, downloadUrl] = await Promise.all([
      presignDownload(asset.storageKey),
      presignDownload(asset.storageKey, { downloadName: asset.fileName }),
    ]);
    return (
      <div>
        <DocumentPart
          display={display}
          fileName={asset.fileName}
          sizeBytes={asset.sizeBytes}
          url={url}
          downloadUrl={downloadUrl}
          title={title}
        />
        <CompletionBar
          done={completed}
          doneText="You've read this."
          todoText="Finished with this document?"
          lessonId={lesson.id}
          blockId={part.id}
        />
      </div>
    );
  }

  const src = `/content/${asset.id}/${asset.launchPath}`;
  if (part.type === "SCORM") {
    const version = asset.scormVersion === "1.2" ? "1.2" : "2004";
    const initialCmi = await getInitialCmi(session.userId, lesson.id, version, {
      id: session.userId,
      name: session.name,
    });
    return (
      <ScormPlayer key={part.id} lessonId={lesson.id} version={version} src={src} initialCmi={initialCmi} title={title} />
    );
  }

  // HTML
  return (
    <div>
      <LessonFrame key={part.id} title={title}>
        <iframe src={src} title={title} className="absolute inset-0 size-full" allowFullScreen />
      </LessonFrame>
      <CompletionBar
        done={completed}
        doneText="You've finished this."
        todoText="Finished working through this?"
        lessonId={lesson.id}
        blockId={part.id}
      />
    </div>
  );
}

function CompletionBar({
  done,
  doneText,
  todoText,
  lessonId,
  blockId,
}: {
  done: boolean;
  doneText: string;
  todoText: string;
  lessonId: string;
  blockId: string;
}) {
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-white px-4 py-3">
      <span className="text-sm text-ink-600">{done ? doneText : todoText}</span>
      <MarkCompleteButton key={blockId} lessonId={lessonId} blockId={blockId} completed={done} />
    </div>
  );
}

function Placeholder() {
  return (
    <div className="grid aspect-video place-items-center rounded-2xl border border-dashed border-ink-200 bg-white/60 p-6 text-center text-sm text-ink-500">
      This part&apos;s content is being prepared. Please check back soon.
    </div>
  );
}
