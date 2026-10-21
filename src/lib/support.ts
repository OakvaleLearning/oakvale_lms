import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * Support chat between a learner and the Oakvale team. Each learner has one
 * ongoing conversation; any admin can reply. Clients poll for new messages.
 */

/** Learner messages allowed per rolling 10 minutes. */
const LEARNER_BURST_LIMIT = 20;

export interface SupportMessageView {
  id: string;
  fromSupport: boolean;
  senderName: string;
  body: string;
  createdAt: string;
}

const messageSelect = {
  id: true,
  fromSupport: true,
  body: true,
  createdAt: true,
  sender: { select: { name: true } },
} as const;

function toView(m: {
  id: string;
  fromSupport: boolean;
  body: string;
  createdAt: Date;
  sender: { name: string } | null;
}): SupportMessageView {
  return {
    id: m.id,
    fromSupport: m.fromSupport,
    senderName: m.sender?.name ?? (m.fromSupport ? "Oakvale Support" : "Learner"),
    body: m.body,
    createdAt: m.createdAt.toISOString(),
  };
}

/** Messages in a conversation, oldest first; with `after`, only newer ones (for polling). */
export async function listSupportMessages(conversationId: string, after?: Date): Promise<SupportMessageView[]> {
  const messages = await prisma.supportMessage.findMany({
    where: { conversationId, ...(after ? { createdAt: { gt: after } } : {}) },
    orderBy: { createdAt: "asc" },
    select: messageSelect,
  });
  return messages.map(toView);
}

export async function getLearnerConversation(userId: string) {
  return prisma.supportConversation.findUnique({ where: { userId }, select: { id: true, status: true } });
}

export async function markReadByLearner(conversationId: string) {
  await prisma.supportConversation.update({ where: { id: conversationId }, data: { learnerLastReadAt: new Date() } });
}

export async function markReadBySupport(conversationId: string) {
  await prisma.supportConversation.update({ where: { id: conversationId }, data: { supportLastReadAt: new Date() } });
}

export async function isOverLearnerLimit(userId: string): Promise<boolean> {
  const sent = await prisma.supportMessage.count({
    where: { senderId: userId, fromSupport: false, createdAt: { gte: new Date(Date.now() - 10 * 60 * 1000) } },
  });
  return sent >= LEARNER_BURST_LIMIT;
}

/** A learner's message; starts the conversation or reopens a resolved one. */
export async function sendLearnerMessage(userId: string, body: string): Promise<SupportMessageView> {
  const conversation = await prisma.supportConversation.upsert({
    where: { userId },
    // Nothing has been read by support yet.
    create: { userId, supportLastReadAt: new Date(0) },
    update: {},
    select: { id: true },
  });
  const now = new Date();
  const [message] = await prisma.$transaction([
    prisma.supportMessage.create({
      data: { conversationId: conversation.id, senderId: userId, fromSupport: false, body },
      select: messageSelect,
    }),
    prisma.supportConversation.update({
      where: { id: conversation.id },
      data: { status: "OPEN", lastMessageAt: now, lastFromSupport: false, learnerLastReadAt: now },
    }),
  ]);
  return toView(message);
}

export async function sendSupportReply(conversationId: string, adminId: string, body: string): Promise<SupportMessageView> {
  const now = new Date();
  const [message] = await prisma.$transaction([
    prisma.supportMessage.create({
      data: { conversationId, senderId: adminId, fromSupport: true, body },
      select: messageSelect,
    }),
    prisma.supportConversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: now, lastFromSupport: true, supportLastReadAt: now },
    }),
  ]);
  return toView(message);
}

/** Support replies the learner hasn't seen yet. */
export async function learnerUnreadCount(userId: string): Promise<number> {
  const conversation = await prisma.supportConversation.findUnique({
    where: { userId },
    select: { id: true, learnerLastReadAt: true },
  });
  if (!conversation) return 0;
  return prisma.supportMessage.count({
    where: { conversationId: conversation.id, fromSupport: true, createdAt: { gt: conversation.learnerLastReadAt } },
  });
}

/** Open conversations whose latest learner message no admin has read. */
export async function supportUnreadCount(): Promise<number> {
  return prisma.supportConversation.count({
    where: {
      status: "OPEN",
      lastFromSupport: false,
      lastMessageAt: { gt: prisma.supportConversation.fields.supportLastReadAt },
    },
  });
}
