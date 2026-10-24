import "server-only";
import { prisma } from "./prisma";
import type { SessionPayload } from "./auth";
import { mediaUrl } from "./community/shared";

/**
 * The signed-in person as the dashboard sidebar shows them: name and email
 * from the database (fresh after a profile edit) plus their photo.
 */
export async function getShellUser(session: SessionPayload) {
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { name: true, email: true, communityProfile: { select: { avatar: true } } },
  });
  const avatar = user?.communityProfile?.avatar;
  return {
    name: user?.name ?? session.name,
    email: user?.email ?? session.email,
    role: session.role,
    avatar: avatar ? mediaUrl(avatar) : null,
  };
}
