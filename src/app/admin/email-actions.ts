"use server";

import { requireAdmin } from "@/lib/auth";
import { isEmailConfigured, sendEmail } from "@/lib/email";
import { enrolmentConfirmedEmail } from "@/lib/email-templates";
import { TEMPLATES, previewLearner, type SequenceKey } from "@/lib/email-sequence";

export type TestEmailState = { error?: string; message?: string } | undefined;

/** Send one of the automated emails to the signed-in admin, filled with sample data. */
export async function sendTestEmail(_prev: TestEmailState, formData: FormData): Promise<TestEmailState> {
  const session = await requireAdmin();
  if (!isEmailConfigured()) return { error: "Email isn't configured (RESEND_API_KEY)." };

  const key = String(formData.get("key"));
  const learner = await previewLearner({ name: session.name, email: session.email });
  const email =
    key === "enrolment-confirmed"
      ? enrolmentConfirmedEmail(learner, learner.enrolments[0])
      : key in TEMPLATES
        ? TEMPLATES[key as SequenceKey](learner)
        : null;
  if (!email) return { error: "Unknown email." };

  const ok = await sendEmail({ to: session.email, ...email, subject: `[Test] ${email.subject}` });
  return ok ? { message: `Sent to ${session.email}.` } : { error: "Couldn't send — check the server logs." };
}
