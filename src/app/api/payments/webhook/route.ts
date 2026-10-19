import { createHmac, timingSafeEqual } from "node:crypto";
import { reconcilePayment } from "@/lib/payments";

/**
 * Paystack webhook (set the URL to https://<lms-domain>/api/payments/webhook in
 * the Paystack dashboard). Activates enrolments even when the learner closes
 * the tab before returning to the callback page.
 */
export async function POST(req: Request) {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) return new Response("Not configured", { status: 503 });

  const raw = await req.text();
  const signature = req.headers.get("x-paystack-signature") ?? "";
  const expected = createHmac("sha512", secret).update(raw).digest("hex");
  const valid =
    signature.length === expected.length &&
    timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  if (!valid) return new Response("Invalid signature", { status: 401 });

  const event = JSON.parse(raw) as { event?: string; data?: { reference?: string } };
  if (event.event === "charge.success" && event.data?.reference) {
    // Re-verifies with Paystack's API rather than trusting the payload.
    await reconcilePayment(event.data.reference);
  }
  return new Response("ok");
}
