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

## Community groups and group admins

- Group membership is derived, not stored (`src/lib/community/access.ts`): an active enrolment matching the group's audience plus a verified email. Site admins (`User.role = ADMIN`) are in every group and show as the Oakvale Team.
- A `GroupAdmin` row makes one member a moderator of one group only; it grants nothing in `/admin`. Group admins are always members of that group, paid or not (`getMemberGroups` and `groupMemberWhere` include them).
- Group-scoped moderation goes through `canManageGroup(viewer, groupId)` (site admin or `GroupAdmin` row) and `managedGroupIds(viewer)`: announcements, pin and lock, removing any post or comment, and appointing or removing group admins (`setGroupAdmin` in `src/app/community/actions.ts`, button in `src/components/community/GroupAdminToggle.tsx`, shown on the group's Members tab). Never check `session.role === "ADMIN"` for these; use the group-scoped helper.
- Still site-admin only: creating events and uploading event images, "Manage group", and the `/admin` area.
- `groupMemberWhere`, `groupLearnerWhere` and `notifyGroup` need the group's `id` as well as its audience fields.
- The group banner (`src/app/community/[group]/page.tsx`) is the themed blue gradient unless the group has a `coverImage`. Group admins and site admins get a "more" (…) menu on it with Add/Change/Remove photo (`GroupCoverButton`, actions `createGroupCoverUpload` / `saveGroupCover` in `src/app/community/actions.ts`) that uploads straight to the bucket under `covers/groups/<id>/`. The admin-only `CoverImageField` in `/admin` writes the same field.

## Theme

- The visual theme is copied from the main site (`OakvaleLearning/oakvale_main`: `app/globals.css`, `tailwind.config.js`, `app/layout.tsx`). All tokens live in `@theme` in `src/app/globals.css`; fonts are loaded in `src/app/layout.tsx` with `next/font/google`. Change colours or fonts there, not in components.
- Colours: `primary-*` is forest green (600 = the main site's forest-mid `#145c3f`, 800 = forest `#0a3d2b`, 200/100 = mint/mint-light, 400 = sage). `gold` and `gold-light` (`#c8881a`, `#e8a832`) are for highlights. `accent-*` is the error red (700 = the main site's `#9a1d1d`), so keep using it for errors and warnings, not decoration. `ink-*` are warm greys (900 = charcoal `#1c1c1c`), `canvas`/`cream` is `#f7f3ec` and `line` is `#e8e4de`.
- Fonts: DM Sans for the interface (`font-sans`, the default), Cormorant Garamond for page titles and key figures (`font-display`, or `font-heading`), EB Garamond for lesson reading text (`font-serif`, used by `.lesson-md`), Geist Mono for code.
- Hex values that can't use tokens (emails in `src/lib/email-templates.ts` and `src/lib/community/emails.ts`, `src/app/manifest.ts`, the viewport `themeColor`, certificate defaults in `src/lib/certificate-design.ts`, swatches in `TemplateEditor.tsx`) use `#145c3f`. Update them together if the primary colour changes. Existing saved certificate templates keep the colours they were saved with.
