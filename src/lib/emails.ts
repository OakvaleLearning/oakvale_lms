import "server-only";
import { SITE } from "@/content/site";
import { formatNaira } from "@/lib/utils";
import { sendEmail } from "@/lib/email";
import { RESET_TOKEN_TTL_MINUTES } from "@/lib/auth";
import { isPrelaunch } from "@/lib/launch";
import { TEAM, appUrl, button, enrolmentConfirmedEmail, escape, layout, p } from "@/lib/email-templates";

/**
 * Sent once when an enrolment becomes ACTIVE (payment verified). Before launch
 * this is "Email 1" of the pre-launch sequence; after launch, a short
 * "your courses are ready" note.
 */
export async function sendEnrolledEmail(
  user: { name: string; email: string },
  info: { programSlug: string; programTitle: string; tierName: string; amountKobo: number }
): Promise<boolean> {
  if (isPrelaunch()) {
    return sendEmail({ to: user.email, ...enrolmentConfirmedEmail(user, info) });
  }

  const link = `${appUrl()}/learn`;
  const what = `${info.programTitle} — ${info.tierName}`;
  const next = "Your courses are open now — learn at your own pace, on your phone or computer.";

  const bodyHtml =
    p(`Dear ${escape(user.name)},`) +
    p(`Your payment of <strong>${formatNaira(info.amountKobo)}</strong> was successful and you are now enrolled in <strong>${escape(what)}</strong>.`) +
    p(next) +
    button(link, "Start learning") +
    p(`Warm regards,<br/>${TEAM}`);

  const text = `Dear ${user.name},

Your payment of ${formatNaira(info.amountKobo)} was successful and you are now enrolled in ${what}.

${next}

Start learning: ${link}

Warm regards,
${TEAM}`;

  return sendEmail({
    to: user.email,
    subject: `You're enrolled: ${what}`,
    html: layout("Welcome — your courses are ready", bodyHtml),
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

/** Sent when a learner earns a course certificate; mentions the CPD certificate when the course has one. */
export async function sendCertificateEmail(
  user: { name: string; email: string },
  cert: { serial: string; courseTitle: string; cpdStatus: string; cpdProvider: string | null; link: string }
): Promise<boolean> {
  const cpd =
    cert.cpdStatus === "NONE"
      ? ""
      : `This course also carries a CPD certificate. We will pass your details to ${cert.cpdProvider || "the CPD issuing body"}, who will email it to you directly.`;

  const bodyHtml =
    p(`Dear ${escape(user.name)},`) +
    p(`Congratulations! You have completed <strong>${escape(cert.courseTitle)}</strong> and earned your ${SITE.name} certificate.`) +
    button(cert.link, "View and download") +
    p(`Your certificate ID is <strong>${cert.serial}</strong>. Anyone can check it is genuine by scanning its QR code or visiting ${appUrl()}/verify.`) +
    (cpd ? p(escape(cpd)) : "") +
    p(`Warm regards,<br/>${TEAM}`);

  const text = `Dear ${user.name},

Congratulations! You have completed ${cert.courseTitle} and earned your ${SITE.name} certificate.

View and download it: ${cert.link}

Your certificate ID is ${cert.serial}. Anyone can check it is genuine by scanning its QR code or visiting ${appUrl()}/verify.
${cpd ? `\n${cpd}\n` : ""}
Warm regards,
${TEAM}`;

  return sendEmail({
    to: user.email,
    subject: `Your certificate: ${cert.courseTitle}`,
    html: layout("You've earned a certificate", bodyHtml),
    text,
  });
}
