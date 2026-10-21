import "server-only";
import { Resend } from "resend";
import { SITE } from "@/content/site";

/**
 * Email is "configured" only when a real Resend API key is present. Until then
 * we no-op (and log) so the enrollment flow stays testable without sending mail
 * — mirroring how Paystack falls back to simulation.
 */
export function isEmailConfigured(): boolean {
  const key = process.env.RESEND_API_KEY ?? "";
  return key.startsWith("re_");
}

const FROM = process.env.EMAIL_FROM ?? `Oakvale Learning <onboarding@resend.dev>`;
const REPLY_TO = process.env.EMAIL_REPLY_TO ?? SITE.email;

let client: Resend | null = null;
function resend(): Resend {
  if (!client) client = new Resend(process.env.RESEND_API_KEY);
  return client;
}

interface SendArgs {
  to: string;
  subject: string;
  html: string;
  text: string;
}

/**
 * Send a transactional email. Never throws — returns whether it was sent so
 * callers can decide whether to retry (e.g. reset a "sent" flag on failure).
 */
export async function sendEmail(args: SendArgs): Promise<boolean> {
  if (!isEmailConfigured()) {
    console.info(`[email] skipped (RESEND_API_KEY not set) → "${args.subject}" to ${args.to}`);
    return false;
  }
  try {
    const { error } = await resend().emails.send({
      from: FROM,
      to: args.to,
      replyTo: REPLY_TO,
      subject: args.subject,
      html: args.html,
      text: args.text,
    });
    if (error) {
      console.error("[email] send failed:", error);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[email] send threw:", err);
    return false;
  }
}

/** Resend accepts up to 100 emails per batch request. */
export const EMAIL_BATCH_SIZE = 100;

/**
 * Send up to 100 emails in one request. Resend accepts or rejects the whole
 * batch, so this returns a single success flag. Never throws.
 */
export async function sendEmailBatch(emails: SendArgs[]): Promise<boolean> {
  if (emails.length === 0) return true;
  if (!isEmailConfigured()) {
    console.info(`[email] skipped batch of ${emails.length} (RESEND_API_KEY not set) → "${emails[0].subject}"`);
    return false;
  }
  try {
    const { error } = await resend().batch.send(
      emails.map((e) => ({ from: FROM, to: e.to, replyTo: REPLY_TO, subject: e.subject, html: e.html, text: e.text }))
    );
    if (error) {
      console.error("[email] batch send failed:", error);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[email] batch send threw:", err);
    return false;
  }
}
