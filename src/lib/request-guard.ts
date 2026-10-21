import "server-only";
import { NextResponse } from "next/server";
import { checkBotId } from "botid/server";
import { HONEYPOT_FIELD } from "@/lib/auth-form";

type Guarded = { ok: true; body: Record<string, unknown> } | { ok: false; response: NextResponse };

const deny = (error: string, status: number): Guarded => ({ ok: false, response: NextResponse.json({ error }, { status }) });

/**
 * Checks shared by the public auth forms, before any database work:
 *  - the request comes from this site (no cross-site form posts),
 *  - Vercel BotID says it's a person (always passes in development),
 *  - the honeypot field is empty,
 *  - the body is a JSON object.
 * Paths must also be listed in src/instrumentation-client.ts for BotID to work.
 */
export async function guardAuthRequest(req: Request, { bot = true }: { bot?: boolean } = {}): Promise<Guarded> {
  const origin = req.headers.get("origin");
  if (origin) {
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    let originHost: string | null = null;
    try {
      originHost = new URL(origin).host;
    } catch {}
    if (!host || originHost !== host) return deny("This request isn't allowed.", 403);
  }

  if (bot) {
    const verification = await checkBotId();
    if (verification.isBot) return deny("We couldn't verify your request. Please refresh the page and try again.", 403);
  }

  const body: unknown = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return deny("Invalid request.", 400);
  const record = body as Record<string, unknown>;
  if (typeof record[HONEYPOT_FIELD] === "string" && record[HONEYPOT_FIELD] !== "") {
    console.warn("[auth] honeypot filled, request dropped");
    return deny("Invalid request.", 400);
  }
  return { ok: true, body: record };
}
