import { NextResponse } from "next/server";
import { runEmailSequence } from "@/lib/email-sequence";

export const maxDuration = 300;

/** Daily cron (vercel.json): sends whichever pre-launch emails are due. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  // Vercel Cron sends "Authorization: Bearer <CRON_SECRET>".
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  }
  const result = await runEmailSequence();
  console.info("[cron/emails]", JSON.stringify(result));
  return NextResponse.json(result);
}
