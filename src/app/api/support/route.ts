import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import {
  getLearnerConversation,
  isOverLearnerLimit,
  listSupportMessages,
  markReadByLearner,
  sendLearnerMessage,
} from "@/lib/support";

const schema = z.object({ text: z.string().trim().min(1).max(4000) });

function parseAfter(req: Request): Date | undefined {
  const after = new URL(req.url).searchParams.get("after");
  const date = after ? new Date(after) : undefined;
  return date && !Number.isNaN(date.getTime()) ? date : undefined;
}

/** The learner's support conversation; `?after=<ISO>` returns only newer messages. */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const conversation = await getLearnerConversation(session.userId);
  if (!conversation) return NextResponse.json({ status: null, messages: [] });
  const messages = await listSupportMessages(conversation.id, parseAfter(req));
  await markReadByLearner(conversation.id);
  return NextResponse.json({ status: conversation.status, messages });
}

/** Send a message to the support team. */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Please enter a message." }, { status: 400 });
  if (await isOverLearnerLimit(session.userId)) {
    return NextResponse.json(
      { error: "You've sent a lot of messages in a short time. Please wait a few minutes." },
      { status: 429 }
    );
  }
  const message = await sendLearnerMessage(session.userId, parsed.data.text);
  return NextResponse.json({ message });
}
