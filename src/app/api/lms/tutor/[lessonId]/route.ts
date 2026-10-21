import { NextResponse } from "next/server";
import { createUIMessageStreamResponse, streamText, toUIMessageStream } from "ai";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkLessonAccess } from "@/lib/lms/access";
import {
  buildTutorSystemPrompt,
  getOrCreateThread,
  getRecentTutorMessages,
  getTutorAvailability,
  getTutorHistory,
  isOverTutorLimit,
  tutorModel,
} from "@/lib/lms/tutor";

const schema = z.object({ text: z.string().trim().min(1).max(2000) });

async function authorise(lessonId: string) {
  const session = await getSession();
  if (!session) return { error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) } as const;
  const access = await checkLessonAccess(session, lessonId);
  if (!access.ok) return { error: NextResponse.json({ error: "Not allowed" }, { status: 403 }) } as const;
  return { session, lesson: access.lesson } as const;
}

/** Saved conversation for this lesson. */
export async function GET(_req: Request, ctx: RouteContext<"/api/lms/tutor/[lessonId]">) {
  const { lessonId } = await ctx.params;
  const auth = await authorise(lessonId);
  if ("error" in auth) return auth.error;

  const [availability, messages] = await Promise.all([
    getTutorAvailability(auth.session, auth.lesson),
    getTutorHistory(auth.session.userId, lessonId),
  ]);
  return NextResponse.json({ availability, messages });
}

/** Ask the tutor a question; the reply is streamed and saved. */
export async function POST(req: Request, ctx: RouteContext<"/api/lms/tutor/[lessonId]">) {
  const { lessonId } = await ctx.params;
  const auth = await authorise(lessonId);
  if ("error" in auth) return auth.error;
  const { session, lesson } = auth;

  if ((await getTutorAvailability(session, lesson)) !== "OPEN") {
    return NextResponse.json({ error: "Finish the quiz to unlock the tutor." }, { status: 403 });
  }
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Please enter a question." }, { status: 400 });
  if (await isOverTutorLimit(session.userId)) {
    return NextResponse.json(
      { error: "You've asked a lot of questions this hour. Take a short break and try again soon." },
      { status: 429 }
    );
  }

  try {
    const thread = await getOrCreateThread(session.userId, lessonId);
    const [system, history] = await Promise.all([
      buildTutorSystemPrompt(session, lesson),
      getRecentTutorMessages(thread.id),
    ]);
    await prisma.tutorMessage.create({ data: { threadId: thread.id, role: "USER", content: parsed.data.text } });

    const result = streamText({
      model: tutorModel(),
      system,
      messages: [...history, { role: "user", content: parsed.data.text }],
    });
    // Finish (and save) the reply even if the learner closes the panel mid-answer.
    result.consumeStream();

    return createUIMessageStreamResponse({
      stream: toUIMessageStream({
        stream: result.stream,
        onError: (err) => {
          console.error("[tutor]", err);
          return "The tutor couldn't answer just now. Please try again.";
        },
        onEnd: async ({ responseMessage }) => {
          const text = responseMessage.parts
            .map((p) => (p.type === "text" ? p.text : ""))
            .join("")
            .trim();
          if (!text) return;
          await prisma.tutorMessage.create({ data: { threadId: thread.id, role: "ASSISTANT", content: text } });
          await prisma.tutorThread.update({ where: { id: thread.id }, data: { updatedAt: new Date() } });
        },
      }),
    });
  } catch (err) {
    console.error("[tutor]", err);
    return NextResponse.json({ error: "The tutor couldn't answer just now. Please try again." }, { status: 500 });
  }
}
