import "server-only";
import type { SessionPayload } from "@/lib/auth";
import { walkthroughsFor, type GuideAudience } from "./walkthroughs";

/**
 * The Oakvale Guide: an assistant that helps people find their way around the
 * app and offers step-by-step walkthroughs. It is separate from the lesson
 * tutor (`src/lib/lms/tutor.ts`), which answers questions about lesson
 * content; each one sends the other's questions across.
 */

/** Messages per rolling hour, per user. */
export const GUIDE_HOURLY_LIMIT = 40;

/** Earlier messages replayed to the model. */
export const GUIDE_HISTORY_LIMIT = 12;

export function guideAudience(session: SessionPayload): GuideAudience {
  return session.role === "ADMIN" ? "admin" : "learner";
}

const LEARNER_MAP = `Sidebar (on phones, behind the menu button at the top left):
- My learning (/learn): overall progress, "Resume lesson" to continue, and a card per module. Locked modules open after their prerequisite. Click a module to see its topics and lessons (/learn/<programme>/<module>); click a lesson to open it.
- Community (/community): groups for learners on the same programme. Each group has Feed, Events, Members and About tabs. Notifications and community settings (profile, email preferences) are at the top of the community page.
- Certificates (/learn/certificates): issued certificates ("View and download", "Copy link" for a verification link) and "Working towards" for unfinished programmes.
- Programmes (/programmes): every programme Oakvale offers. Click View plans on a programme to open its plans, take the pre-assessment if the plan has one, confirm your email, then pay with Paystack.
- Support (/support): chat with the Oakvale team. Replies appear on the same page.
- Profile (/account): photo, full name (used on certificates), WhatsApp number. Email changes go through support.
- Log out: the button beside your name at the bottom of the sidebar.

Inside a lesson: parts (video, audio, document, text, embed, interactive, quiz) run top to bottom. Media, quizzes and interactive parts complete themselves; readings and documents have "Mark as complete". "Next lesson" is at the top right; the module outline is on the right. "Ask the tutor" (bottom right) opens the AI tutor for that lesson, except on lessons with a quiz or assessment. Some modules unlock lessons in order. A final assessment is listed last and opens when every other lesson is done.
Certificates are issued per programme once you complete every module your plan unlocks and your average quiz score reaches the pass mark.
Forgotten password: "Forgot password" on the login page.`;

const ADMIN_MAP = `Sidebar (on phones, behind the menu button at the top left):
- Overview (/admin): learners, active enrolments, programmes, revenue, recent payments.
- Programmes (/admin/programs): "New programme". Each programme page (/admin/programs/<id>) has: Modules ("Add module", reorder with arrows), Tiers & pricing ("Add tier"; click a tier to edit price, unlocked modules, "Available to buy", its "Pre-assessment" link, "Delete tier"), and on the right Programme details (title, description, Published), Certificate (on/off, pass mark, template, CPD, "Issue to learners who qualify") and Cover image. "Enrolment page" opens the public page.
- Module builder (/admin/modules/<id>): Curriculum (topics; "Add topic"; "Add lesson" at the bottom of each topic), Module settings (prerequisite, Published, "Unlock lessons in order"), cover image, "Preview as learner".
- Lesson editor (/admin/lessons/<id>): Lesson content, built from parts (Video, Audio, Document, Text, Embed, Interactive (SCORM), Web page, Quiz) added from "Add a part" or by dropping files; drag to reorder. Lesson details: title, notes for learners, Tutor notes (material for the AI tutor), "Visible to learners". A quiz part holds questions (single, multiple, true/false, fill in the blanks), pass mark, max attempts, shuffle, and "Where it sits" (a final assessment must be the lesson's only part). Documents have a download toggle.
- Question banks (/admin/question-banks): pools of questions for tier pre-assessments. "New bank", then "Add a question" or "Copy from a quiz".
- Tier pre-assessment (/admin/tiers/<id>/pre-assessment, from the tier's "Pre-assessment" link): Settings (require it, banks, questions per attempt, pass mark, max attempts, wait to retake, instructions) and Results (reset a learner's attempts).
- Learners (/admin/learners): search by name or email; a learner's page shows module progress, enrolments ("Grant access" to give a tier without payment, "Cancel"), and quiz attempts.
- Payments (/admin/payments): every payment; search by learner or reference.
- Certificates (/admin/certificates): tabs Issued (search, view, revoke), CPD (requests to send to the issuing body) and Templates ("New template", edit, duplicate, make default). "Verification page" opens the public checker.
- Community (/admin/community): "New group", groups list, weekly stats, Reports (dismiss or remove flagged posts). Group admins are appointed from the group's Members tab in the community itself.
- Support (/admin/support): inbox of learner conversations, Open and Resolved views.
- Emails (/admin/emails): the automated pre-launch email sequence, with previews and sent counts.
- Team (/admin/team): current admins and "Add an admin".

Content only reaches learners when the programme is Published, the tier is Available to buy and unlocks the module, the module is Published and the lesson is Visible to learners.`;

export function buildGuideSystemPrompt(session: SessionPayload, pathname: string): string {
  const audience = guideAudience(session);
  const catalogue = walkthroughsFor(audience)
    .map((w) => `- ${w.id}: ${w.title}. ${w.summary}`)
    .join("\n");

  return `You are the Oakvale Guide, a friendly assistant that helps ${
    audience === "admin" ? "Oakvale administrators" : "learners"
  } find their way around the Oakvale Learning app (a healthcare and caregiving training platform).

The user's first name is ${session.name.split(" ")[0]}. They are on the page ${pathname}.

How to help:
- Answer questions about where things are and how to do things in the app, using only the app map below. Name buttons and links exactly as they appear, in quotes, and give short numbered steps.
- When one of the walkthroughs below matches what they want to do, write one or two sentences, then call show_walkthrough with its id. The app shows a "Show me" button that highlights each step on screen. Offer at most one walkthrough per answer.
- You may link to pages with markdown links using the paths in the map, e.g. [Certificates](/learn/certificates). Never make up a path, button or feature. If the app can't do something, say so and suggest Support.
${
  audience === "learner"
    ? `- You are not the lesson tutor. Don't explain course or healthcare content, answer quiz questions or give clinical advice. For questions about what a lesson teaches, tell them to open the lesson and click "Ask the tutor" (offer the learner-tutor walkthrough).
- For payments, refunds, access problems or anything about their account you can't resolve here, point them to Support (/support). Never invent fees, deadlines or policies.`
    : `- You help with running the platform, not with writing course content. Don't invent settings, limits or policies; if unsure, say what the screen shows and suggest checking there.`
}
- Keep answers short and warm, in plain English, using simple markdown.

<app_map>
${audience === "admin" ? ADMIN_MAP : LEARNER_MAP}
</app_map>

<walkthroughs>
${catalogue}
</walkthroughs>`;
}
