import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { listSupportMessages, markReadBySupport, sendSupportReply } from "@/lib/support";

const replySchema = z.object({ text: z.string().trim().min(1).max(4000) });
const statusSchema = z.object({ status: z.enum(["OPEN", "RESOLVED"]) });

async function authorise(conversationId: string) {
  const session = await getSession();
  if (!session) return { error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) } as const;
  if (session.role !== "ADMIN") return { error: NextResponse.json({ error: "Not allowed" }, { status: 403 }) } as const;
  const conversation = await prisma.supportConversation.findUnique({
    where: { id: conversationId },
    select: { id: true, status: true },
  });
  if (!conversation) return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) } as const;
  return { session, conversation } as const;
}

/** Messages for the inbox thread; `?after=<ISO>` returns only newer ones. */
export async function GET(req: Request, ctx: RouteContext<"/api/admin/support/[conversationId]">) {
  const { conversationId } = await ctx.params;
  const auth = await authorise(conversationId);
  if ("error" in auth) return auth.error;

  const after = new URL(req.url).searchParams.get("after");
  const date = after ? new Date(after) : undefined;
  const messages = await listSupportMessages(
    conversationId,
    date && !Number.isNaN(date.getTime()) ? date : undefined
  );
  await markReadBySupport(conversationId);
  return NextResponse.json({ status: auth.conversation.status, messages });
}

/** Reply as the support team. */
export async function POST(req: Request, ctx: RouteContext<"/api/admin/support/[conversationId]">) {
  const { conversationId } = await ctx.params;
  const auth = await authorise(conversationId);
  if ("error" in auth) return auth.error;

  const parsed = replySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Please enter a reply." }, { status: 400 });
  const message = await sendSupportReply(conversationId, auth.session.userId, parsed.data.text);
  return NextResponse.json({ message });
}

/** Mark the conversation resolved or reopen it. */
export async function PATCH(req: Request, ctx: RouteContext<"/api/admin/support/[conversationId]">) {
  const { conversationId } = await ctx.params;
  const auth = await authorise(conversationId);
  if ("error" in auth) return auth.error;

  const parsed = statusSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  await prisma.supportConversation.update({ where: { id: conversationId }, data: { status: parsed.data.status } });
  return NextResponse.json({ status: parsed.data.status });
}
