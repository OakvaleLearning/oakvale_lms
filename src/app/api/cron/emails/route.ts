import { NextResponse } from "next/server";
import { runEmailSequence } from "@/lib/email-sequence";
import { pruneRateLimits } from "@/lib/rate-limit";

export const maxDuration = 300;

/** Daily cron (vercel.json): sends whichever pre-launch emails are due, and prunes old rate-limit rows. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  // Vercel Cron sends "Authorization: Bearer <CRON_SECRET>".
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  }
  const result = { ...(await runEmailSequence()), rateLimitRowsPruned: await pruneRateLimits() };
  console.info("[cron/emails]", JSON.stringify(result));
  return NextResponse.json(result);
}
