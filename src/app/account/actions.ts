"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { createSession, getSession } from "@/lib/auth";
import { normalizePhone } from "@/lib/utils";
import { accountSchema } from "@/lib/validation";

/** Name and WhatsApp number. The photo is saved by saveAvatar as soon as it uploads. */
export async function saveAccount(_prev: { error?: string; ok?: boolean } | undefined, fd: FormData) {
  const session = await getSession();
  if (!session) return { error: "Please log in again." };
  const phone = String(fd.get("phone") ?? "").trim();
  const parsed = accountSchema.safeParse({
    name: String(fd.get("name") ?? ""),
    // Learners need a WhatsApp number (we reach them there); staff may leave it blank.
    phone: phone === "" && session.role === "ADMIN" ? undefined : phone,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const { name } = parsed.data;
  await prisma.user.update({
    where: { id: session.userId },
    data: { name, phone: parsed.data.phone ? normalizePhone(parsed.data.phone) : null },
  });
  // The name also travels in the session cookie; reissue it so pages reading the session agree.
  if (name !== session.name) await createSession({ ...session, name });
  revalidatePath("/", "layout");
  return { ok: true };
}
