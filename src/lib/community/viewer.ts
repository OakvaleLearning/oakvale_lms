import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { isEmailVerified, type SessionPayload } from "@/lib/auth";
import { getMemberGroups } from "./access";
import { AUTHOR_SELECT, toAuthor } from "./feed";
import type { AuthorView } from "./shared";

/** The signed-in person as they appear in the community. */
export const getMe = cache(async (session: SessionPayload): Promise<AuthorView> => {
  const user = await prisma.user.findUnique({ where: { id: session.userId }, select: AUTHOR_SELECT });
  return user ? toAuthor(user) : { id: session.userId, name: session.name, avatar: null, headline: "", team: session.role === "ADMIN" };
});

/** The viewer's groups, and whether a paid learner is only missing email confirmation. */
export async function loadCommunity(session: SessionPayload) {
  const groups = await getMemberGroups(session.userId, session.role);
  if (groups.length > 0 || session.role === "ADMIN") return { groups, unverified: false };
  const paid = await prisma.enrollment.count({ where: { userId: session.userId, status: "ACTIVE" } });
  return { groups, unverified: paid > 0 && !(await isEmailVerified(session.userId)) };
}
