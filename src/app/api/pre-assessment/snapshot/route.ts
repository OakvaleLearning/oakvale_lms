import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { saveSnapshot } from "@/lib/lms/pre-assessment";
import { isSameOrigin } from "../same-origin";

const PREFIX = "data:image/jpeg;base64,";
const schema = z.object({ attemptId: z.string().min(1).max(40), image: z.string().startsWith(PREFIX).max(300_000) });

/** A webcam still from a proctored pre-assessment, as a small JPEG data URL. */
export async function POST(req: Request) {
  if (!isSameOrigin(req)) return NextResponse.json({ error: "This request isn't allowed." }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Please log in again." }, { status: 401 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const jpeg = Buffer.from(parsed.data.image.slice(PREFIX.length), "base64");
  const result = await saveSnapshot(session.userId, parsed.data.attemptId, new Uint8Array(jpeg));
  return result.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: result.error }, { status: result.status });
}
