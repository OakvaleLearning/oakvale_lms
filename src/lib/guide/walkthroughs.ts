/**
 * Step-by-step walkthroughs for the Oakvale Guide (the app-navigation
 * assistant). Shared by the server, which lists them to the model, and the
 * client, which plays them as a spotlight tour over the real page.
 *
 * Targets are found by what's on screen, not by code: a sidebar link by its
 * href, or a button / link / heading by its visible label. If you rename a
 * button or page heading, update the walkthroughs that point at it.
 */

export type GuideAudience = "admin" | "learner";

export type GuideTarget =
  /** A sidebar link, by href. On phones the menu button is highlighted until the drawer is open. */
  | { nav: string }
  /**
   * A button, link, tab, field label or heading whose visible text equals (or
   * starts with) `text`. `closest` widens the highlight to an ancestor, e.g.
   * "section" to light up a whole panel from its heading.
   */
  | { text: string; closest?: string }
  | { selector: string };

export interface GuideStep {
  title: string;
  body: string;
  /**
   * Page the step happens on. `*` matches one path segment. Steps without a
   * path work anywhere (sidebar links are on every page).
   */
  path?: string;
  target?: GuideTarget;
  /** Move on when the highlighted element is clicked (e.g. a button that opens a dialog). */
  advanceOnClick?: boolean;
  /** A tour started on this step's page skips ahead to here. */
  checkpoint?: boolean;
}

export interface Walkthrough {
  id: string;
  audience: GuideAudience;
  title: string;
  /** One line for the list, and what the model reads to choose a walkthrough. */
  summary: string;
  steps: GuideStep[];
}

const nav = (href: string, label: string, body?: string): GuideStep => ({
  title: `Open ${label}`,
  body: body ?? `Click ${label} in the sidebar.`,
  target: { nav: href },
  advanceOnClick: true,
});

const openProgramme: GuideStep[] = [
  nav("/admin/programs", "Programmes"),
  {
    title: "Choose a programme",
    body: "Click Manage on the programme you want to work on.",
    path: "/admin/programs",
    target: { text: "Manage" },
    checkpoint: true,
  },
];

const openModule: GuideStep[] = [
  ...openProgramme,
  {
    title: "Open a module",
    body: "Click the module you want to work on.",
    path: "/admin/programs/*",
    target: { text: "Modules", closest: "section" },
    checkpoint: true,
  },
];

const openLesson: GuideStep[] = [
  ...openModule,
  {
    title: "Open a lesson",
    body: "Click the lesson you want to edit.",
    path: "/admin/modules/*",
    target: { text: "Curriculum", closest: "section" },
    checkpoint: true,
  },
];

const ADMIN: Walkthrough[] = [
  {
    id: "admin-create-programme",
    audience: "admin",
    title: "Create a programme",
    summary: "Start a new programme, the top level that holds modules and pricing tiers.",
    steps: [
      nav("/admin/programs", "Programmes"),
      {
        title: "Start a new programme",
        body: "Click New programme.",
        path: "/admin/programs",
        target: { text: "New programme" },
        advanceOnClick: true,
        checkpoint: true,
      },
      {
        title: "Name it",
        body: "Enter a title and, if you like, a short description. Then click Create programme. You'll go straight to the new programme's page.",
        path: "/admin/programs",
        target: { text: "Create programme" },
      },
      {
        title: "Add modules",
        body: "Modules are the big building blocks of a programme (e.g. Foundation, Professional). Add them here, in the order learners should take them.",
        path: "/admin/programs/*",
        target: { text: "Modules", closest: "section" },
      },
      {
        title: "Set the price",
        body: "A tier is what learners buy. Each tier has a price and unlocks a set of modules. Add at least one so learners can enrol.",
        path: "/admin/programs/*",
        target: { text: "Tiers & pricing", closest: "section" },
      },
      {
        title: "Publish when ready",
        body: "Turn on Published and click Save to show the programme on the enrolment page. You can also add a cover image and certificate settings in this column.",
        path: "/admin/programs/*",
        target: { text: "Programme details", closest: "section" },
      },
    ],
  },
  {
    id: "admin-add-module",
    audience: "admin",
    title: "Add a module to a programme",
    summary: "Create a new module inside an existing programme and open the module builder.",
    steps: [
      ...openProgramme,
      {
        title: "Add a module",
        body: "Click Add module.",
        path: "/admin/programs/*",
        target: { text: "Add module" },
        advanceOnClick: true,
        checkpoint: true,
      },
      {
        title: "Name the module",
        body: "Enter a title (and an optional description), then click Create module. You'll go straight to its builder.",
        path: "/admin/programs/*",
        target: { text: "Create module" },
      },
      {
        title: "Build the curriculum",
        body: "Modules are made of topics, and topics hold lessons. Start by adding a topic.",
        path: "/admin/modules/*",
        target: { text: "Curriculum", closest: "section" },
      },
      {
        title: "Module settings",
        body: "Set a prerequisite, choose whether lessons unlock in order, and switch on Published when it's ready. Don't forget to tick this module in a tier on the programme page so learners who buy that tier get it.",
        path: "/admin/modules/*",
        target: { text: "Module settings", closest: "section" },
      },
    ],
  },
  {
    id: "admin-add-lesson",
    audience: "admin",
    title: "Add topics and lessons",
    summary: "Add a topic to a module, create a lesson inside it and add its content (video, documents, text and more).",
    steps: [
      ...openModule,
      {
        title: "Add a topic",
        body: "Type a topic name in the box next to this button (e.g. “Topic 1: Getting started”), then click Add topic.",
        path: "/admin/modules/*",
        target: { text: "Add topic" },
        checkpoint: true,
      },
      {
        title: "Add a lesson",
        body: "Each topic has an Add lesson button at the bottom. Click it on the topic you want.",
        path: "/admin/modules/*",
        target: { text: "Add lesson" },
        advanceOnClick: true,
      },
      {
        title: "Name the lesson",
        body: "Give the lesson a title, pick what it starts with, then click Create lesson. The lesson editor opens next.",
        path: "/admin/modules/*",
        target: { text: "Create lesson" },
      },
      {
        title: "Add the content",
        body: "A lesson is built from parts: video, audio, document, text, embed, SCORM, web page or quiz. Pick a kind under Add a part, or drop files anywhere on this page to upload them.",
        path: "/admin/lessons/*",
        target: { text: "Lesson content", closest: "section" },
        checkpoint: true,
      },
      {
        title: "Details and visibility",
        body: "Add notes for learners and Tutor notes (extra material the AI tutor uses; learners don't see it). Switch on Visible to learners and click Save.",
        path: "/admin/lessons/*",
        target: { text: "Lesson details", closest: "section" },
      },
    ],
  },
  {
    id: "admin-add-quiz",
    audience: "admin",
    title: "Add a quiz or final assessment",
    summary: "Add a quiz part to a lesson, write or generate questions, set the pass mark, or make it the module's final assessment.",
    steps: [
      ...openLesson,
      {
        title: "Add a quiz part",
        body: "Click Quiz in the list of parts. A lesson can have one quiz.",
        path: "/admin/lessons/*",
        target: { text: "Quiz" },
        advanceOnClick: true,
        checkpoint: true,
      },
      {
        title: "Write the questions",
        body: "Open the quiz part to add questions: single choice, multiple choice, true/false or fill in the blanks (type the answer in [brackets]). Set the pass mark and how many attempts learners get.",
        path: "/admin/lessons/*",
        target: { text: "Lesson content", closest: "section" },
      },
      {
        title: "Final assessment",
        body: "To make it the module's final assessment, the quiz must be the lesson's only part. Then set Where it sits to “Final assessment, after all lessons”. It opens once every other lesson is complete.",
        path: "/admin/lessons/*",
      },
    ],
  },
  {
    id: "admin-tiers",
    audience: "admin",
    title: "Set up pricing tiers",
    summary: "Add or edit the tiers learners buy: name, price and the modules each one unlocks.",
    steps: [
      ...openProgramme,
      {
        title: "Tiers & pricing",
        body: "Tiers are what learners pay for. Each one unlocks the modules you tick.",
        path: "/admin/programs/*",
        target: { text: "Tiers & pricing", closest: "section" },
        checkpoint: true,
      },
      {
        title: "Add a tier",
        body: "Click Add tier.",
        path: "/admin/programs/*",
        target: { text: "Add tier" },
        advanceOnClick: true,
      },
      {
        title: "Fill it in",
        body: "Enter a name and a price in naira, tick the modules it unlocks and keep Available to buy on. Then click Create tier.",
        path: "/admin/programs/*",
        target: { text: "Create tier" },
      },
      {
        title: "Edit later",
        body: "Click any tier to expand it, change its price or modules, set up its pre-assessment, or delete it.",
        path: "/admin/programs/*",
        target: { text: "Tiers & pricing", closest: "section" },
      },
    ],
  },
  {
    id: "admin-publish",
    audience: "admin",
    title: "Publish content for learners",
    summary: "Make a programme, tier, module and lesson visible to learners, and preview it as a learner.",
    steps: [
      ...openProgramme,
      {
        title: "Publish the programme",
        body: "Learners only see content when every level is published. Start here: turn on Published and click Save.",
        path: "/admin/programs/*",
        target: { text: "Programme details", closest: "section" },
        checkpoint: true,
      },
      {
        title: "Make a tier available",
        body: "Expand a tier and check Available to buy is on, and that it unlocks the modules you want.",
        path: "/admin/programs/*",
        target: { text: "Tiers & pricing", closest: "section" },
      },
      {
        title: "Open a module",
        body: "Draft modules show a Draft badge. Click one to publish it.",
        path: "/admin/programs/*",
        target: { text: "Modules", closest: "section" },
      },
      {
        title: "Publish the module",
        body: "Turn on Published and click Save.",
        path: "/admin/modules/*",
        target: { text: "Module settings", closest: "section" },
        checkpoint: true,
      },
      {
        title: "Check the lessons",
        body: "Each lesson must also be Visible to learners. Open a draft lesson and switch it on under Lesson details.",
        path: "/admin/modules/*",
        target: { text: "Curriculum", closest: "section" },
      },
      {
        title: "Preview as a learner",
        body: "Click Preview as learner to see exactly what learners will see.",
        path: "/admin/modules/*",
        target: { text: "Preview as learner" },
      },
    ],
  },
  {
    id: "admin-question-bank",
    audience: "admin",
    title: "Create a question bank",
    summary: "Build a pool of questions for tier pre-assessments, or copy them from a lesson quiz.",
    steps: [
      nav("/admin/question-banks", "Question banks"),
      {
        title: "New bank",
        body: "Click New bank.",
        path: "/admin/question-banks",
        target: { text: "New bank" },
        advanceOnClick: true,
        checkpoint: true,
      },
      {
        title: "Name it",
        body: "Give the bank a title (one bank per topic works well, so every topic gets questions), then click Create bank.",
        path: "/admin/question-banks",
        target: { text: "Create bank" },
      },
      {
        title: "Add questions",
        body: "Click Add a question. You can use single choice, multiple choice, true/false or fill in the blanks.",
        path: "/admin/question-banks/*",
        target: { text: "Add a question" },
        checkpoint: true,
      },
      {
        title: "Or copy from a quiz",
        body: "Pick a lesson quiz here to copy all of its questions into this bank in one go.",
        path: "/admin/question-banks/*",
        target: { text: "Copy from a quiz", closest: "section" },
      },
    ],
  },
  {
    id: "admin-pre-assessment",
    audience: "admin",
    title: "Turn on a pre-assessment",
    summary: "Require learners to pass an entry test, drawn from question banks, before they can pay for a tier.",
    steps: [
      {
        title: "Before you start",
        body: "You need at least one question bank with questions in it. If you haven't made one, ask me how to create a question bank first.",
      },
      ...openProgramme,
      {
        title: "Expand the tier",
        body: "Click the tier you want to protect with an entry test.",
        path: "/admin/programs/*",
        target: { text: "Tiers & pricing", closest: "section" },
        checkpoint: true,
      },
      {
        title: "Open its pre-assessment",
        body: "Click the Pre-assessment link at the bottom of the expanded tier.",
        path: "/admin/programs/*",
        target: { text: "Pre-assessment:" },
      },
      {
        title: "Settings",
        body: "Switch on Require a pre-assessment, tick the banks to draw from, then set questions per attempt, pass mark, max attempts and wait time. Click Save.",
        path: "/admin/tiers/*/pre-assessment",
        target: { text: "Settings", closest: "section" },
        checkpoint: true,
      },
      {
        title: "Results",
        body: "Every attempt shows up here. Use Reset to let a learner start again.",
        path: "/admin/tiers/*/pre-assessment",
        target: { text: "Results", closest: "section" },
      },
    ],
  },
  {
    id: "admin-grant-access",
    audience: "admin",
    title: "Give a learner access without payment",
    summary: "Find a learner and grant them a tier for free (skips payment and the pre-assessment), or cancel an enrolment.",
    steps: [
      nav("/admin/learners", "Learners"),
      {
        title: "Find the learner",
        body: "Type their name or email here and press Enter.",
        path: "/admin/learners",
        target: { selector: 'input[name="q"]' },
        checkpoint: true,
      },
      {
        title: "Open their profile",
        body: "Click the learner's name in the list.",
        path: "/admin/learners",
      },
      {
        title: "Grant a tier",
        body: "Choose a tier in the dropdown and click Grant access. They can start straight away; no payment or pre-assessment needed.",
        path: "/admin/learners/*",
        target: { text: "Grant access" },
        checkpoint: true,
      },
      {
        title: "Manage enrolments",
        body: "Their enrolments are listed here. Cancel removes access to that tier.",
        path: "/admin/learners/*",
        target: { text: "Enrolments", closest: "section" },
      },
    ],
  },
  {
    id: "admin-certificates",
    audience: "admin",
    title: "Set up and issue certificates",
    summary: "Switch on programme certificates, set the pass mark and template, issue them, and manage templates and CPD.",
    steps: [
      ...openProgramme,
      {
        title: "Certificate settings",
        body: "Turn on Issue a certificate, set the pass mark (the average of the learner's quiz scores) and choose a template. Add CPD details if the programme carries CPD. Click Save.",
        path: "/admin/programs/*",
        target: { text: "Certificate", closest: "section" },
        checkpoint: true,
      },
      {
        title: "Issue to those who qualify",
        body: "Certificates are issued automatically when learners finish. This button issues them to anyone who already qualifies.",
        path: "/admin/programs/*",
        target: { text: "Issue to learners who qualify" },
      },
      nav("/admin/certificates", "Certificates", "Click Certificates in the sidebar to see everything issued."),
      {
        title: "Issued, CPD and templates",
        body: "Issued lists every certificate (search, view, revoke). CPD tracks requests to send to the issuing body. Templates is where you design how certificates look.",
        path: "/admin/certificates",
        target: { selector: 'nav[aria-label="Certificate sections"]' },
        checkpoint: true,
      },
    ],
  },
  {
    id: "admin-community",
    audience: "admin",
    title: "Create and moderate community groups",
    summary: "Create a community group for an audience, appoint group admins and handle reported posts.",
    steps: [
      nav("/admin/community", "Community"),
      {
        title: "New group",
        body: "Click New group.",
        path: "/admin/community",
        target: { text: "New group" },
        advanceOnClick: true,
        checkpoint: true,
      },
      {
        title: "Choose who's in it",
        body: "Name the group and choose its audience. Members are added automatically from active enrolments. Click Create group.",
        path: "/admin/community",
        target: { text: "Create group" },
      },
      {
        title: "Your groups",
        body: "Click a group to edit its details or cover. To appoint a group admin (moderator), open the group in the community and use its Members tab.",
        path: "/admin/community",
        target: { text: "Groups", closest: "section" },
      },
      {
        title: "Reports",
        body: "Posts and comments members flag land here. Dismiss the report or remove the content.",
        path: "/admin/community",
        target: { text: "Reports", closest: "section" },
      },
    ],
  },
  {
    id: "admin-support",
    audience: "admin",
    title: "Reply to support messages",
    summary: "Read and answer learner questions in the support inbox and mark conversations resolved.",
    steps: [
      nav("/admin/support", "Support"),
      {
        title: "Open conversations",
        body: "Open shows conversations waiting on you; Resolved holds finished ones. Click a conversation to read it.",
        path: "/admin/support",
        target: { text: "Open" },
        checkpoint: true,
      },
      {
        title: "Reply",
        body: "Type your reply at the bottom of the conversation. It appears on the learner's Support page straight away.",
        path: "/admin/support",
      },
    ],
  },
  {
    id: "admin-team",
    audience: "admin",
    title: "Add another admin",
    summary: "Give a colleague admin access, or remove it.",
    steps: [
      nav("/admin/team", "Team"),
      {
        title: "Add an admin",
        body: "Enter their name and email and click Add admin. New people get an email to set a password; an existing learner account is upgraded.",
        path: "/admin/team",
        target: { text: "Add an admin", closest: "section" },
        checkpoint: true,
      },
      {
        title: "Current admins",
        body: "Remove takes away admin access. Their account stays, as a learner.",
        path: "/admin/team",
        target: { text: "Admins", closest: "section" },
      },
    ],
  },
  {
    id: "admin-payments",
    audience: "admin",
    title: "Find a payment",
    summary: "Look up a payment by learner or Paystack reference.",
    steps: [
      nav("/admin/payments", "Payments"),
      {
        title: "Search",
        body: "Search by learner name, email or payment reference, then press Enter.",
        path: "/admin/payments",
        target: { selector: 'input[name="q"]' },
        checkpoint: true,
      },
    ],
  },
  {
    id: "admin-emails",
    audience: "admin",
    title: "Check the automated emails",
    summary: "Preview the pre-launch email sequence and see how many of each have been sent.",
    steps: [
      nav("/admin/emails", "Emails"),
      {
        title: "Pick an email",
        body: "Each email shows when it sends and how many have gone out. Click one to preview it.",
        path: "/admin/emails",
        target: { selector: 'nav[aria-label="Emails"]' },
        checkpoint: true,
      },
    ],
  },
];

const LEARNER: Walkthrough[] = [
  {
    id: "learner-continue",
    audience: "learner",
    title: "Continue where you left off",
    summary: "Find your modules and resume your last lesson.",
    steps: [
      nav("/learn", "My learning"),
      {
        title: "Resume your lesson",
        body: "Click here to jump back into the lesson you were on.",
        path: "/learn",
        target: { text: "Resume lesson" },
        checkpoint: true,
      },
      {
        title: "Or pick a module",
        body: "Scroll down to see every module in your programme. Locked modules open once you finish the one before.",
        path: "/learn",
      },
    ],
  },
  {
    id: "learner-enrol",
    audience: "learner",
    title: "Enrol in a programme",
    summary: "Choose a programme and plan, take the entry test if there is one, and pay.",
    steps: [
      nav("/programmes", "Programmes"),
      {
        title: "Choose your programme",
        body: "Every programme Oakvale offers is listed here. Click View plans on a programme to open it and compare its plans: each one shows its price and which modules it includes.",
        path: "/programmes",
        target: { text: "View plans" },
        checkpoint: true,
      },
      {
        title: "Enrol",
        body: "Click the button on the plan you want. Some plans ask you to take a short pre-assessment first; pass it and you'll come back here to pay securely with Paystack. You need to confirm your email before paying.",
        path: "/programmes",
        target: { text: "Pay" },
      },
    ],
  },
  {
    id: "learner-tutor",
    audience: "learner",
    title: "Ask the AI tutor about a lesson",
    summary: "Open a lesson and use Ask the tutor for help with the lesson's content (not available on quizzes).",
    steps: [
      nav("/learn", "My learning"),
      {
        title: "Open a lesson",
        body: "Resume your lesson, or open a module and choose a lesson.",
        path: "/learn",
        target: { text: "Resume lesson" },
      },
      {
        title: "Choose a lesson",
        body: "Click any lesson that's open to you.",
        path: "/learn/*/*",
      },
      {
        title: "Ask the tutor",
        body: "Click Ask the tutor. It can summarise the lesson, explain terms or quiz you. It isn't available on lessons with a quiz or assessment.",
        path: "/learn/*/*/*",
        target: { text: "Ask the tutor" },
        advanceOnClick: true,
        checkpoint: true,
      },
    ],
  },
  {
    id: "learner-complete-lesson",
    audience: "learner",
    title: "Complete a lesson and move on",
    summary: "Mark parts of a lesson complete, go to the next lesson and track your module progress.",
    steps: [
      nav("/learn", "My learning"),
      {
        title: "Open a lesson",
        body: "Click Resume lesson, or open a module and pick a lesson.",
        path: "/learn",
        target: { text: "Resume lesson" },
      },
      {
        title: "Work through the parts",
        body: "Videos, audio, quizzes and interactive parts complete themselves when you finish them. For readings and documents, click Mark as complete.",
        path: "/learn/*/*/*",
        target: { text: "Mark as complete" },
        checkpoint: true,
      },
      {
        title: "Next lesson",
        body: "Click here to go on. On the last lesson it takes you back to the module.",
        path: "/learn/*/*/*",
        target: { text: "Next lesson" },
      },
    ],
  },
  {
    id: "learner-quizzes",
    audience: "learner",
    title: "Quizzes and final assessments",
    summary: "How quizzes, pass marks, attempts and the final assessment work.",
    steps: [
      nav("/learn", "My learning"),
      {
        title: "Quizzes",
        body: "Some lessons end with a quiz. You'll see the pass mark, your best score and how many attempts you have left. Your best score counts.",
      },
      {
        title: "Final assessment",
        body: "Some modules end with a final assessment. It's listed last and opens once you've completed every other lesson in the module.",
      },
      {
        title: "Certificates",
        body: "Your certificate is issued when you finish every module in your plan and your average quiz score reaches the programme's pass mark.",
      },
    ],
  },
  {
    id: "learner-certificates",
    audience: "learner",
    title: "Get your certificate",
    summary: "View, download and share your certificates, and see what's left to earn one.",
    steps: [
      nav("/learn/certificates", "Certificates"),
      {
        title: "View and download",
        body: "Open your certificate to view or download it. Copy link gives you a verification link to share with employers.",
        path: "/learn/certificates",
        target: { text: "View and download" },
        checkpoint: true,
      },
      {
        title: "Working towards",
        body: "Programmes you haven't finished yet show what's left before your certificate is issued.",
        path: "/learn/certificates",
        target: { text: "Working towards" },
      },
    ],
  },
  {
    id: "learner-community-post",
    audience: "learner",
    title: "Post in the community",
    summary: "Open your community group and share a question or update with other learners.",
    steps: [
      nav("/community", "Community"),
      {
        title: "Open your group",
        body: "Click the group you'd like to post in.",
        path: "/community",
      },
      {
        title: "Write a post",
        body: "Click here and write your question or update. You can add photos too.",
        path: "/community/*",
        target: { text: "Share something with the community…" },
        advanceOnClick: true,
        checkpoint: true,
      },
      {
        title: "Share it",
        body: "Click Post when you're ready.",
        path: "/community/*",
        target: { text: "Post" },
      },
    ],
  },
  {
    id: "learner-community-events",
    audience: "learner",
    title: "Find community events",
    summary: "See upcoming events in your group and RSVP.",
    steps: [
      nav("/community", "Community"),
      {
        title: "Open your group",
        body: "Click your group.",
        path: "/community",
      },
      {
        title: "Events",
        body: "Click the Events tab to see what's coming up. Open an event and choose Going, Maybe or Can't go.",
        path: "/community/*",
        target: { text: "Events" },
        checkpoint: true,
      },
    ],
  },
  {
    id: "learner-community-settings",
    audience: "learner",
    title: "Community profile and emails",
    summary: "Change how other learners see you and which community emails you receive.",
    steps: [
      nav("/community", "Community"),
      {
        title: "Community settings",
        body: "Click the settings button at the top of the community page.",
        path: "/community",
        target: { selector: 'a[href="/community/settings"]' },
        checkpoint: true,
      },
      {
        title: "Your profile",
        body: "Add a headline, location and a little about you, then save.",
        path: "/community/settings",
        target: { text: "Headline" },
        checkpoint: true,
      },
      {
        title: "Email notifications",
        body: "Choose whether you get emails about replies and a weekly digest.",
        path: "/community/settings",
        target: { text: "Email notifications" },
      },
    ],
  },
  {
    id: "learner-support",
    audience: "learner",
    title: "Contact Oakvale support",
    summary: "Message the Oakvale team about payments, access, your account or anything else.",
    steps: [
      nav("/support", "Support"),
      {
        title: "Send a message",
        body: "Type your question and send it. Replies show up here, and the Support link in the menu shows a badge when there's a new one.",
        path: "/support",
        target: { selector: "main form textarea" },
        checkpoint: true,
      },
    ],
  },
  {
    id: "learner-profile",
    audience: "learner",
    title: "Update your profile",
    summary: "Change your photo, name or WhatsApp number.",
    steps: [
      nav("/account", "Profile"),
      {
        title: "Your name",
        body: "Certificates use this name, so use your legal name. Then click Save.",
        path: "/account",
        target: { text: "Full name" },
        checkpoint: true,
      },
      {
        title: "Your photo",
        body: "Add or change your photo here. It shows in the community too.",
        path: "/account",
        target: { text: "Photo" },
      },
    ],
  },
];

export const WALKTHROUGHS: Walkthrough[] = [...ADMIN, ...LEARNER];

export function walkthroughsFor(audience: GuideAudience): Walkthrough[] {
  return WALKTHROUGHS.filter((w) => w.audience === audience);
}

export function getWalkthrough(id: string): Walkthrough | undefined {
  return WALKTHROUGHS.find((w) => w.id === id);
}

/** Does `pathname` match `pattern`? `*` matches exactly one segment. */
export function matchPath(pattern: string, pathname: string): boolean {
  const a = pattern.split("/").filter(Boolean);
  const b = pathname.split("/").filter(Boolean);
  return a.length === b.length && a.every((seg, i) => seg === "*" || seg === b[i]);
}

/** Where a walkthrough should start: the last checkpoint on the current page, else the beginning. */
export function startStep(walkthrough: Walkthrough, pathname: string): number {
  for (let i = walkthrough.steps.length - 1; i >= 0; i--) {
    const s = walkthrough.steps[i];
    if (s.checkpoint && s.path && matchPath(s.path, pathname)) return i;
  }
  return 0;
}

/** Walkthroughs that touch the current page come first. */
export function rankForPage(list: Walkthrough[], pathname: string): Walkthrough[] {
  const here = (w: Walkthrough) => w.steps.some((s) => s.path && matchPath(s.path, pathname));
  return [...list.filter(here), ...list.filter((w) => !here(w))];
}
