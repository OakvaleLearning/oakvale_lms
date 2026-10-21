import "server-only";
import { SITE } from "@/content/site";
import { formatNaira } from "@/lib/utils";
import { sendEmail } from "@/lib/email";
import { RESET_TOKEN_TTL_MINUTES } from "@/lib/auth";
import { isPrelaunch } from "@/lib/launch";

const TEAM = "The Oakvale Learning Team";

function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

/** Wrap body content in a simple, email-client-safe HTML shell. */
function layout(title: string, bodyHtml: string): string {
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
            <h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;color:#0f172a;">${title}</h1>
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

function button(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;"><tr><td style="border-radius:10px;background:#3229a2;">
    <a href="${href}" style="display:inline-block;padding:12px 24px;color:#ffffff;font-weight:600;font-size:14px;text-decoration:none;border-radius:10px;">${label}</a>
  </td></tr></table>`;
}

function p(text: string): string {
  return `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#3f3f46;">${text}</p>`;
}

/** Sent once when an enrolment becomes ACTIVE (payment verified). */
export async function sendEnrolledEmail(
  user: { name: string; email: string },
  info: { programTitle: string; tierName: string; amountKobo: number }
): Promise<boolean> {
  const link = `${appUrl()}/learn`;
  const what = `${info.programTitle} — ${info.tierName}`;
  const prelaunch = isPrelaunch();
  const next = prelaunch
    ? "Your place is secured. Our learning platform opens soon, and we'll email you the moment your courses are ready."
    : "Your courses are open now — learn at your own pace, on your phone or computer.";

  const bodyHtml =
    p(`Dear ${escape(user.name)},`) +
    p(`Your payment of <strong>${formatNaira(info.amountKobo)}</strong> was successful and you are now enrolled in <strong>${escape(what)}</strong>.`) +
    p(next) +
    button(link, prelaunch ? "View my enrolment" : "Start learning") +
    p(`Warm regards,<br/>${TEAM}`);

  const text = `Dear ${user.name},

Your payment of ${formatNaira(info.amountKobo)} was successful and you are now enrolled in ${what}.

${next}

${prelaunch ? "View my enrolment" : "Start learning"}: ${link}

Warm regards,
${TEAM}`;

  return sendEmail({
    to: user.email,
    subject: `You're enrolled: ${what}`,
    html: layout(prelaunch ? "Welcome — your place is secured" : "Welcome — your courses are ready", bodyHtml),
    text,
  });
}

/** Launch day: tells an early enrolee their courses are open. */
export async function sendCoursesOpenEmail(user: { name: string; email: string }): Promise<boolean> {
  const link = `${appUrl()}/learn`;

  const bodyHtml =
    p(`Dear ${escape(user.name)},`) +
    p(`The wait is over — your ${SITE.name} courses are now open.`) +
    p(`Sign in with the email and password you enrolled with and start learning at your own pace, on your phone or computer.`) +
    button(link, "Start learning") +
    p(`Warm regards,<br/>${TEAM}`);

  const text = `Dear ${user.name},

The wait is over — your ${SITE.name} courses are now open.

Sign in with the email and password you enrolled with and start learning at your own pace: ${link}

Warm regards,
${TEAM}`;

  return sendEmail({
    to: user.email,
    subject: `Your ${SITE.name} courses are open`,
    html: layout("Your courses are open", bodyHtml),
    text,
  });
}

export async function sendPasswordResetEmail(
  user: { name: string; email: string },
  token: string
): Promise<boolean> {
  const link = `${appUrl()}/reset-password?token=${encodeURIComponent(token)}`;
  const ttl =
    RESET_TOKEN_TTL_MINUTES >= 60
      ? `${RESET_TOKEN_TTL_MINUTES / 60} hour${RESET_TOKEN_TTL_MINUTES === 60 ? "" : "s"}`
      : `${RESET_TOKEN_TTL_MINUTES} minutes`;

  const bodyHtml =
    p(`Dear ${escape(user.name)},`) +
    p(`We received a request to reset the password for your ${SITE.name} account. Click the button below to choose a new one.`) +
    button(link, "Reset my password") +
    p(`This link expires in <strong>${ttl}</strong> and can only be used once.`) +
    p(`If you did not request this, you can safely ignore this email — your password will stay unchanged.`) +
    p(`Warm regards,<br/>${TEAM}`);

  const text = `Dear ${user.name},

We received a request to reset the password for your ${SITE.name} account.

Reset your password here: ${link}

This link expires in ${ttl} and can only be used once.

If you did not request this, you can safely ignore this email — your password will stay unchanged.

Warm regards,
${TEAM}`;

  return sendEmail({
    to: user.email,
    subject: `Reset your ${SITE.name} password`,
    html: layout("Reset your password", bodyHtml),
    text,
  });
}
