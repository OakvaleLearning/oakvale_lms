@AGENTS.md

## Lessons are built from parts

- A `Lesson` holds ordered `LessonBlock`s ("parts"): VIDEO, AUDIO, DOCUMENT, TEXT, SCORM, HTML, QUIZ. `Lesson.type` and `durationSec` are derived (`syncLesson` in `src/lib/lms/lesson-parts.ts`); one part means that part's type, several means `MIXED`. Never set them by hand.
- Part kinds, upload rules and labels live in `src/lib/lms/blocks.ts`; readiness (ready/processing/failed/empty) in `src/lib/lms/readiness.ts`.
- Progress is per part (`BlockProgress`) and rolled up to `LessonProgress` by `recordProgress` in `src/lib/lms/progress.ts`. Completion is sticky: adding a part never un-completes a learner. QUIZ and SCORM parts report their own result; all other parts use the client "complete" call.
- A lesson can have at most one SCORM part and one QUIZ part. A final assessment (`Quiz.kind = EXAM`) must be the lesson's only part.
- DOCUMENT parts are always viewed in the lesson (PDF and images directly; Word/PowerPoint/Excel through Microsoft's embed viewer, `officeViewerUrl` in `blocks.ts`, which fetches a short-lived signed URL). `LessonBlock.allowDownload` (default true) controls the Download / Open-in-new-tab buttons only: when false the page never generates an attachment link. It deters casual saving and is not DRM; the signed view URL is still in the page. Toggle: `src/components/admin/DocumentAccess.tsx`.
- Files attach to a part (`ContentAsset.blockId`), not to the lesson. Read `lesson.blocks[].asset`; `lesson.asset` no longer exists.
- Admin editor: `src/app/admin/lessons/[id]/` (server actions in `actions.ts`, client builder in `src/components/admin/LessonBuilder.tsx`). Learner view: `src/components/learn/LessonParts.tsx`. Mobile API: `/api/v1/lessons/[id]` returns `parts[]` (plus `content` for older clients).
- Changing the schema: write a Prisma migration by hand only if `prisma migrate dev` can't run; run `npx prisma generate` before type-checking.
