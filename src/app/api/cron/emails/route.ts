import { NextResponse } from "next/server";
import { runEmailSequence } from "@/lib/email-sequence";
import { pruneRateLimits } from "@/lib/rate-limit";
import { runCommunityEmails } from "@/lib/community/emails";

export const maxDuration = 300;

/**
 * Daily cron (vercel.json): sends whichever pre-launch emails are due, community
 * event reminders and (on Mondays, or with ?digest=force) the weekly digest,
 * and prunes old rate-limit rows.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  // Vercel Cron sends "Authorization: Bearer <CRON_SECRET>".
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  }
  const forceDigest = new URL(req.url).searchParams.get("digest") === "force";
  const result = {
    ...(await runEmailSequence({ timeBudgetMs: 120_000 })),
    community: await runCommunityEmails({ forceDigest }),
    rateLimitRowsPruned: await pruneRateLimits(),
  };
  console.info("[cron/emails]", JSON.stringify(result));
  return NextResponse.json(result);
}
