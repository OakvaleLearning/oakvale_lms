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
- Removing a member (`setGroupMembership` in `src/app/community/actions.ts`, buttons in `src/components/community/GroupMemberButtons.tsx`, Members tab) writes a `GroupRemoval` row, because membership is derived and can't otherwise be revoked. `getMemberGroups` and `groupMemberWhere` honour it; deleting the row ("Let back in") restores access. It is per group, ends any `GroupAdmin` role in that group, keeps the person's account, enrolments, other groups and past posts, and never applies to site admins or to yourself.
- Deploying a change that adds a table the membership queries use (`GroupAdmin`, `GroupRemoval`) before `prisma migrate deploy` breaks the whole community for everyone, not just the new feature. Run the migration first or at the same time.
