import "server-only";
import { prisma } from "@/lib/prisma";
import { lessonTypeFor, type BlockKind } from "./blocks";

/**
 * A lesson's type and length are derived from its parts: one part makes it that
 * kind of lesson, several (or none yet) make it a mixed lesson, and its length
 * is the sum of the parts' estimated times. Call after adding, removing or
 * changing parts.
 */
export async function syncLesson(lessonId: string): Promise<void> {
  const blocks = await prisma.lessonBlock.findMany({ where: { lessonId }, select: { type: true, durationSec: true } });
  const withTime = blocks.filter((b) => b.durationSec);
  await prisma.lesson.update({
    where: { id: lessonId },
    data: {
      type: lessonTypeFor(blocks.map((b) => b.type as BlockKind)),
      durationSec: withTime.length ? withTime.reduce((sum, b) => sum + (b.durationSec ?? 0), 0) : null,
    },
  });
}

/** Re-number a lesson's parts 0..n-1 in their current order, healing gaps and ties. */
export async function renumberBlocks(lessonId: string): Promise<void> {
  const blocks = await prisma.lessonBlock.findMany({
    where: { lessonId },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    select: { id: true, order: true },
  });
  const changed = blocks.map((b, order) => ({ id: b.id, order })).filter((b, i) => blocks[i].order !== b.order);
  if (changed.length) {
    await prisma.$transaction(changed.map((b) => prisma.lessonBlock.update({ where: { id: b.id }, data: { order: b.order } })));
  }
}
