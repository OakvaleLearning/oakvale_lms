import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { clientIp } from "@/lib/rate-limit";
import { checkIn } from "@/lib/lms/pre-assessment";
import { CLIENT_EVENTS } from "@/lib/lms/proctoring";
import { isSameOrigin } from "../same-origin";

const schema = z.object({
  attemptId: z.string().min(1).max(40),
  clientId: z.string().min(8).max(64),
  answers: z.record(z.string().max(40), z.array(z.string().max(200)).max(20)).optional(),
  events: z.array(z.enum(CLIENT_EVENTS)).max(20).optional(),
});

/**
 * The pre-assessment player's heartbeat (every few seconds, straight away on
 * a proctoring event, and with `keepalive` as the page closes): autosaves
 * answers and records events. Tells the player when the attempt has ended.
 */
export async function POST(req: Request) {
  if (!isSameOrigin(req)) return NextResponse.json({ error: "This request isn't allowed." }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Please log in again." }, { status: 401 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const { attemptId, ...input } = parsed.data;
  const result = await checkIn(session.userId, attemptId, input, await clientIp());
  return NextResponse.json(result, { status: result.ok ? 200 : 404 });
}
