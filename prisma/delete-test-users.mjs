// Deletes test accounts. Dry run by default: it only prints what would go.
//
//   node prisma/delete-test-users.mjs --emails a@x.com,b@y.com
//   node prisma/delete-test-users.mjs --file test-users.txt        (one email per line)
//   node prisma/delete-test-users.mjs --match "%+test@%"            (SQL LIKE on email)
//   ...add --confirm to actually delete.
//
// Safety rules:
// - Admins are never deleted.
// - Users with a SUCCESS payment or a certificate are skipped unless --include-paid.
// - Every User relation cascades (or sets null), so one delete removes the user's
//   enrolments, payments, progress, posts, comments, reactions, etc. Post comment
//   and reaction totals on other people's posts are recounted afterwards.
// - Files in the bucket (avatars, post images) are left behind; they are harmless.
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args[i + 1];
};
const confirm = args.includes("--confirm");
const includePaid = args.includes("--include-paid");

let where;
if (opt("--emails")) {
  where = { email: { in: opt("--emails").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean) } };
} else if (opt("--file")) {
  const emails = readFileSync(opt("--file"), "utf8").split(/\r?\n/).map((e) => e.trim().toLowerCase()).filter((e) => e && !e.startsWith("#"));
  where = { email: { in: emails } };
} else if (opt("--match")) {
  // Prisma has no LIKE; translate the common %foo% / foo% / %foo forms.
  const m = opt("--match");
  const core = m.replace(/^%|%$/g, "");
  if (!core || core.includes("%")) throw new Error("--match supports only %text%, text% or %text");
  where = { email: m.startsWith("%") && m.endsWith("%") ? { contains: core, mode: "insensitive" } : m.endsWith("%") ? { startsWith: core, mode: "insensitive" } : { endsWith: core, mode: "insensitive" } };
} else {
  console.error("Pass --emails, --file or --match. Nothing done.");
  process.exit(1);
}

const prisma = new PrismaClient();

try {
  const host = (() => { try { return new URL(process.env.DATABASE_URL).host; } catch { return "(unknown)"; } })();
  console.log(`Database: ${host}\n`);

  const users = await prisma.user.findMany({
    where,
    select: {
      id: true, email: true, name: true, role: true, createdAt: true,
      payments: { where: { status: "SUCCESS" }, select: { amount: true } },
      _count: { select: { certificates: true, enrollments: true, posts: true, comments: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const keep = [];
  const remove = [];
  for (const u of users) {
    const paid = u.payments.reduce((s, p) => s + p.amount, 0);
    const reason =
      u.role === "ADMIN" ? "admin" :
      !includePaid && paid > 0 ? `paid ₦${(paid / 100).toLocaleString()}` :
      !includePaid && u._count.certificates > 0 ? `${u._count.certificates} certificate(s)` : null;
    (reason ? keep : remove).push({ ...u, paid, reason });
  }

  const line = (u) => `  ${u.email.padEnd(40)} ${u.name.slice(0, 24).padEnd(24)} joined ${u.createdAt.toISOString().slice(0, 10)}  enrol ${u._count.enrollments}  posts ${u._count.posts}  comments ${u._count.comments}${u.reason ? `  [skipped: ${u.reason}]` : ""}`;
  console.log(`Matched ${users.length} user(s).\n\nWill delete (${remove.length}):`);
  remove.forEach((u) => console.log(line(u)));
  if (keep.length) {
    console.log(`\nSkipped (${keep.length}):`);
    keep.forEach((u) => console.log(line(u)));
  }

  if (!remove.length) {
    console.log("\nNothing to delete.");
  } else if (!confirm) {
    console.log("\nDry run. Re-run with --confirm to delete these users.");
  } else {
    const ids = remove.map((u) => u.id);
    // Posts by other people that these users commented on or reacted to.
    const touched = await prisma.post.findMany({
      where: {
        authorId: { notIn: ids },
        OR: [{ comments: { some: { authorId: { in: ids } } } }, { reactions: { some: { userId: { in: ids } } } }],
      },
      select: { id: true },
    });

    await prisma.$transaction(async (tx) => {
      const { count } = await tx.user.deleteMany({ where: { id: { in: ids }, role: { not: "ADMIN" } } });
      for (const { id } of touched) {
        const [commentCount, reactionCount] = await Promise.all([
          tx.comment.count({ where: { postId: id, deletedAt: null } }),
          tx.reaction.count({ where: { postId: id } }),
        ]);
        await tx.post.update({ where: { id }, data: { commentCount, reactionCount } });
      }
      console.log(`\nDeleted ${count} user(s); recounted ${touched.length} post(s).`);
    }, { timeout: 60_000 });
  }
} finally {
  await prisma.$disconnect();
}
