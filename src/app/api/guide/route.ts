import { NextResponse } from "next/server";
import { createUIMessageStreamResponse, streamText, tool, toUIMessageStream } from "ai";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { HOUR, rateLimit } from "@/lib/rate-limit";
import { tutorModel } from "@/lib/lms/tutor";
import { GUIDE_HISTORY_LIMIT, GUIDE_HOURLY_LIMIT, buildGuideSystemPrompt, guideAudience } from "@/lib/guide/assistant";
import { walkthroughsFor } from "@/lib/guide/walkthroughs";

const schema = z.object({
  path: z.string().max(300).default("/"),
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), text: z.string().trim().max(4000) }))
    .min(1)
    .max(40),
});

/**
 * Ask the Oakvale Guide a question. The conversation lives in the browser
 * (it's about navigation, not learning), so the client sends recent history.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  const latest = parsed.success ? parsed.data.messages.at(-1) : null;
  if (!parsed.success || latest?.role !== "user" || !latest.text || latest.text.length > 1000) {
    return NextResponse.json({ error: "Please enter a question." }, { status: 400 });
  }

  const limit = await rateLimit(`guide:${session.userId}`, GUIDE_HOURLY_LIMIT, HOUR);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "You've asked a lot of questions this hour. Try again a little later." },
      { status: 429 }
    );
  }

  const ids = walkthroughsFor(guideAudience(session)).map((w) => w.id) as [string, ...string[]];
  const history = parsed.data.messages
    .slice(-GUIDE_HISTORY_LIMIT)
    .filter((m) => m.text)
    .map((m) => ({ role: m.role, content: m.text }));

  try {
    const result = streamText({
      model: tutorModel(),
      system: buildGuideSystemPrompt(session, parsed.data.path),
      messages: history,
      tools: {
        show_walkthrough: tool({
          description: "Offer the user a step-by-step walkthrough that highlights each step on screen.",
          inputSchema: z.object({ id: z.enum(ids).describe("The walkthrough id") }),
          execute: async ({ id }) => ({ offered: id }),
        }),
      },
    });

    return createUIMessageStreamResponse({
      stream: toUIMessageStream({
        stream: result.stream,
        onError: (err) => {
          console.error("[guide]", err);
          return "The guide couldn't answer just now. Please try again.";
        },
      }),
    });
  } catch (err) {
    console.error("[guide]", err);
    return NextResponse.json({ error: "The guide couldn't answer just now. Please try again." }, { status: 500 });
  }
}
