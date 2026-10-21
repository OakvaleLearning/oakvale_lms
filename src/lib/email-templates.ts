import "server-only";
import { SITE } from "@/content/site";
import { formatLaunchDate, launchDate } from "@/lib/launch";

/**
 * Shared email shell plus the four learner emails from "Revised Oakvale
 * Automated Emails": enrolment confirmed, two pre-launch emails and the
 * launch-eve "how to get started" email.
 *
 * Templates are pure (data in, { subject, html, text } out) so the admin
 * preview page can render them without sending anything.
 */

export const TEAM = "The Oakvale Learning Team";

export function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

export const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Wrap body content in a simple, email-client-safe HTML shell. */
export function layout(title: string, bodyHtml: string): string {
  return `<!doctype html>
<html lang="en">
  <body style="margin:0;background:#f4f4f5;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#18181b;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:24px 0;">
      <tr><td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e4e4e7;">
          <tr><td style="background:#3229a2;padding:20px 32px;">
            <span style="color:#ffffff;font-size:18px;font-weight:700;letter-spacing:.2px;">${SITE.name}</span>
          </td></tr>
          <tr><td style="padding:32px;">
            ${title ? `<h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;color:#0f172a;">${title}</h1>` : ""}
            ${bodyHtml}
          </td></tr>
          <tr><td style="padding:20px 32px;border-top:1px solid #e4e4e7;color:#71717a;font-size:12px;">
            ${SITE.name} · ${SITE.address}<br/>
            Questions? Just reply to this email or contact ${SITE.email}.
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

export function button(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;"><tr><td style="border-radius:10px;background:#3229a2;">
    <a href="${href}" style="display:inline-block;padding:12px 24px;color:#ffffff;font-weight:600;font-size:14px;text-decoration:none;border-radius:10px;">${label}</a>
  </td></tr></table>`;
}

export function p(text: string): string {
  return `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#3f3f46;">${text}</p>`;
}

/* ------------------------------------------------------------------ *
 * Block builder: one description renders to both HTML and plain text.
 * Text may use **bold**; learner data is escaped before rendering.
 * ------------------------------------------------------------------ */

type Block =
  | { type: "p"; text: string }
  | { type: "h"; text: string }
  | { type: "list"; items: string[] }
  | { type: "details"; title?: string; rows: [string, string][] }
  | { type: "link"; label: string; href: string }
  | { type: "button"; label: string; href: string };

const para = (text: string): Block => ({ type: "p", text });
const heading = (text: string): Block => ({ type: "h", text });
const list = (...items: string[]): Block => ({ type: "list", items });
const signoff = (): Block[] => [para(`Warmly,\n${TEAM}`)];

const inlineHtml = (s: string) => escape(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/\n/g, "<br/>");
const inlineText = (s: string) => s.replace(/\*\*(.+?)\*\*/g, "$1");

function renderHtml(blocks: Block[]): string {
  return blocks
    .map((b) => {
      switch (b.type) {
        case "p":
          return p(inlineHtml(b.text));
        case "h":
          return `<h2 style="margin:24px 0 8px;font-size:16px;line-height:1.4;color:#0f172a;">${inlineHtml(b.text)}</h2>`;
        case "list":
          return `<ul style="margin:0 0 16px;padding-left:20px;font-size:15px;line-height:1.6;color:#3f3f46;">${b.items
            .map((i) => `<li style="margin:0 0 8px;">${inlineHtml(i)}</li>`)
            .join("")}</ul>`;
        case "details":
          return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;background:#f6f6f9;border:1px solid #e6e6ed;border-radius:12px;">
            <tr><td style="padding:16px 20px;">
              ${b.title ? `<div style="margin:0 0 8px;font-size:13px;font-weight:600;color:#0f172a;">${inlineHtml(b.title)}</div>` : ""}
              ${b.rows
                .map(
                  ([k, v]) =>
                    `<div style="font-size:14px;line-height:1.7;color:#3f3f46;"><span style="color:#71717a;">${inlineHtml(k)}:</span> <strong style="color:#0f172a;">${inlineHtml(v)}</strong></div>`
                )
                .join("")}
            </td></tr></table>`;
        case "link":
          return p(`<a href="${escape(b.href)}" style="color:#3229a2;font-weight:600;">${inlineHtml(b.label)}</a>`);
        case "button":
          return button(escape(b.href), inlineHtml(b.label));
      }
    })
    .join("\n");
}

function renderText(blocks: Block[]): string {
  return blocks
    .map((b) => {
      switch (b.type) {
        case "p":
          return inlineText(b.text);
        case "h":
          return inlineText(b.text).toUpperCase();
        case "list":
          return b.items.map((i) => `• ${inlineText(i)}`).join("\n");
        case "details":
          return [b.title && inlineText(b.title), ...b.rows.map(([k, v]) => `${k}: ${v}`)].filter(Boolean).join("\n");
        case "link":
        case "button":
          return `${inlineText(b.label)}: ${b.href}`;
      }
    })
    .join("\n\n");
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

function compose(subject: string, title: string, blocks: Block[]): RenderedEmail {
  return { subject, html: layout(title ? inlineHtml(title) : "", renderHtml(blocks)), text: renderText(blocks) };
}

/* ------------------------------------------------------------------ *
 * Learner data the templates need
 * ------------------------------------------------------------------ */

export interface EmailEnrolment {
  programSlug: string;
  programTitle: string;
  tierName: string;
  /** First course and module the learner will open, if the content exists yet. */
  firstCourseTitle?: string;
  firstModuleTitle?: string;
}

export interface LearnerEmailData {
  name: string;
  email: string;
  enrolments: EmailEnrolment[];
}

const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;

/** What each programme's learners will be working towards (Email 2). */
const PROGRAMME_PREVIEW: Record<string, string> = {
  "adult-care":
    "You will be taking steps towards understanding how to support adults and older people with their daily needs, wellbeing and dignity.",
  "child-care":
    "You will be taking steps towards understanding children's needs, development, safety and early learning.",
};

function supportLines(): string[] {
  const whatsapp = process.env.SUPPORT_WHATSAPP?.trim();
  return [
    `**Email:** ${SITE.email}`,
    ...(whatsapp ? [`**WhatsApp:** ${whatsapp}`] : []),
    "**Support hours:** 9am – 6pm",
  ];
}

/* ------------------------------------------------------------------ *
 * Email 1 — sent when payment succeeds (pre-launch)
 * ------------------------------------------------------------------ */

export function enrolmentConfirmedEmail(learner: { name: string }, enrolment: EmailEnrolment): RenderedEmail {
  const name = firstName(learner.name);
  const launch = formatLaunchDate();
  return compose(`${name}, you're in! Your spot is confirmed.`, `Congratulations, ${name}!`, [
    para("Your payment has been received. Thank you for choosing Oakvale Learning. We are excited to welcome you!"),
    {
      type: "details",
      title: "Your enrolment details",
      rows: [
        ["Programme", enrolment.programTitle],
        ["Selected tier", enrolment.tierName],
      ],
    },
    para(
      `Please check that your programme and selected tier are correct. If you notice any errors, contact us at ${SITE.email} so we can help you make the necessary corrections. If everything is correct, there's nothing else you need to do at this stage.`
    ),
    heading("Here's the next step"),
    para(
      `Our learning platform and mobile app will officially open on **${launch}**. You'll receive a few emails from us before then to help you prepare for your learning journey.`
    ),
    para("In the meantime:"),
    list(
      `**Save the date:** ${launch}.`,
      "**Stay connected:** if this landed in your spam folder, move it to your primary inbox so you don't miss updates and important instructions."
    ),
    para("Thank you for taking this step towards building your skills in caregiving. We're glad to have you with us!"),
    ...signoff(),
  ]);
}

/* ------------------------------------------------------------------ *
 * Email 2 — a couple of days after enrolling
 * ------------------------------------------------------------------ */

export function careFutureEmail(learner: LearnerEmailData): RenderedEmail {
  const name = firstName(learner.name);
  const previews = [...new Set(learner.enrolments.map((e) => PROGRAMME_PREVIEW[e.programSlug]).filter(Boolean))];
  return compose(`${name}, the world is building a future around care and you are a part of it.`, "", [
    para(`Hello ${name},`),
    para("Have you ever stopped to think about how much of our lives depend on someone caring for us?"),
    para(
      "From helping an older person with daily activities or assisting an adult with the recovery process to supporting a child's growth and development, care plays an important role in every community."
    ),
    para("**You have chosen to be part of something meaningful.**"),
    para(
      "Professional caregiving is more than being willing to help. It involves developing the knowledge, practical skills and understanding needed to support others with dignity, patience and respect."
    ),
    heading("Did you know?"),
    para(
      "The International Labour Organization (ILO) says investing in childcare and elder care could create up to **299 million jobs by 2035**."
    ),
    para("This statistic shows where the world is heading: towards more value for trained caregivers."),
    para(
      "At Oakvale Learning, your training is an opportunity to build your knowledge, strengthen your skills and prepare for relevant opportunities in the care sector."
    ),
    para(
      "Whether you are starting from scratch or building on experience you already have, there is always room to learn and grow."
    ),
    ...(previews.length ? [heading("Here's something to look forward to"), ...previews.map(para)] : []),
    para("You've already taken the first step. Over the next few days, we'll show you how simple your learning experience will be."),
    para(`**Save the date:** your platform opens on ${formatLaunchDate(false)}.`),
    para("We look forward to learning with you!"),
    ...signoff(),
  ]);
}

/* ------------------------------------------------------------------ *
 * Email 3 — a few days later: how learning works
 * ------------------------------------------------------------------ */

export function toolkitEmail(learner: LearnerEmailData): RenderedEmail {
  const name = firstName(learner.name);
  const shortDate = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", timeZone: "Africa/Lagos" }).format(
    launchDate()
  );
  return compose(`Getting ready for ${shortDate}? Here's your toolkit`, "", [
    para(`Hello ${name},`),
    para("We're getting closer to opening day!"),
    para(
      "If you're wondering how you'll access your lessons or fit learning into your daily routine, don't worry. We've designed the Oakvale Learning experience to give you more flexibility and control over your learning."
    ),
    heading("Here's how it works"),
    list(
      "**Learn at your own pace:** At Oakvale, you can learn according to your schedule and progress through your training at your own pace. It's your pathway. You are in control.",
      `**Learn on your smartphone or laptop:** You'll primarily access your lessons through the Oakvale mobile app. You can also use a web browser at ${appUrl()} if that works better for you.`,
      "**How you'll be assessed:** Your progress is checked through short quizzes and written reviews. There are no live exams. No one is watching over your shoulder.",
      "**Take it one step at a time:** You don't need to know everything before you begin. All you need is a willingness to learn and a commitment to developing your skills."
    ),
    heading("Your next step"),
    para(
      `Get your writing materials and devices ready and set your alarm: our learning platform officially opens on **${formatLaunchDate()}**.`
    ),
    para(
      "Keep an eye on your inbox. You will receive a follow-up email with instructions on how to access your account and find your first module."
    ),
    para("We look forward to getting started with you!"),
    ...signoff(),
  ]);
}

/* ------------------------------------------------------------------ *
 * Email 4 — the day before launch: how to get started
 * ------------------------------------------------------------------ */

export function launchEveEmail(learner: LearnerEmailData): RenderedEmail {
  const name = firstName(learner.name);
  const base = appUrl();
  const playStore = process.env.PLAY_STORE_URL?.trim();
  const appStore = process.env.APP_STORE_URL?.trim();
  const first = learner.enrolments.find((e) => e.firstCourseTitle) ?? learner.enrolments[0];

  const blocks: Block[] = [
    para("The wait is over! Oakvale Learning is officially LIVE!"),
    para(
      "Your learning journey starts tomorrow, and we're excited to help you take this next step towards building your caregiving skills."
    ),
    ...learner.enrolments.map(
      (e): Block => ({
        type: "details",
        title: `Your ${e.programTitle} pathway is ready.`,
        rows: [["Tier", e.tierName]],
      })
    ),
    para("Ready to get started? Follow these three simple steps."),

    heading(playStore || appStore ? "Step 1: Download the Oakvale app" : "Step 1: Open Oakvale"),
    ...(playStore ? [{ type: "link", label: "Download on Google Play", href: playStore } as Block] : []),
    ...(appStore ? [{ type: "link", label: "Download on the App Store", href: appStore } as Block] : []),
    { type: "link", label: playStore || appStore ? "Prefer a browser? Open Oakvale in your browser" : "Open Oakvale in your browser", href: `${base}/login` },

    heading("Step 2: Log in"),
    list(
      "Open the app or website and tap **Log in**.",
      `Use this email address: **${learner.email}**`,
      `Use the password you created when you enrolled. Forgotten it? Reset it at ${base}/forgot-password`
    ),

    heading("Step 3: Start your first module"),
    list(
      "Once you're in, open **My learning**.",
      ...(first ? [`Select **${first.firstCourseTitle ?? first.programTitle}**.`] : []),
      ...(first?.firstModuleTitle ? [`Tap **${first.firstModuleTitle}** to begin.`] : [])
    ),
    para("That's it! You're ready to start learning. Go at your own pace."),

    heading("Encountering an issue?"),
    para("If you have trouble downloading the app, logging in or finding your lessons, we're here to help."),
    list(...supportLines()),
    para(`Welcome to Oakvale, ${name}! We're proud to be part of your journey.`),
    ...signoff(),
  ];

  return compose("Your learning starts tomorrow", `${name}, it's time!`, blocks);
}
