// Imports learners, enrolments and payments from the marketing site's database
// (learners_portal) into this LMS.
//
//   PORTAL_DATABASE_URL="postgres://…" node prisma/import-portal.mjs           # dry run: report only
//   PORTAL_DATABASE_URL="postgres://…" node prisma/import-portal.mjs --apply   # write to DATABASE_URL
//
// Run `npm run seed` against the LMS first: portal enrolments are per track and
// map to that programme's "full" tier (the portal sold the full programme).
//
// - Every portal account comes across with its password hash (both apps use
//   bcrypt), so learners sign in with the password they already have. Accounts
//   whose email already exists here are matched, not duplicated: their name,
//   password and role are left alone and only a missing phone is filled in.
//   Imported accounts are always learners; portal admins are listed instead.
// - Learners with a successful payment are marked email-verified (they paid
//   through Paystack with that address).
// - Enrolments are LEGACY. Fully paid → ACTIVE. Split-plan deposits (PARTIAL)
//   → CANCELLED, i.e. no access until an admin uses "Grant access" with the
//   Full Programme tier once the balance is paid; they are listed at the end.
//   The LMS keeps one enrolment per learner per tier, so a learner's portal
//   enrolments in several cohorts of one track become one, keeping the best status.
// - Every payment is copied (matched on its Paystack reference) with its status.
//
// Safe to re-run: rows are matched by email, (learner, tier) and reference.
// A re-run picks up payments that changed on the portal and upgrades an
// enrolment to ACTIVE, but never downgrades one.
import { PrismaClient } from "@prisma/client";

const APPLY = process.argv.includes("--apply");
const PORTAL_URL = process.env.PORTAL_DATABASE_URL;
if (!PORTAL_URL) {
  console.error("Set PORTAL_DATABASE_URL to the learners_portal database.");
  process.exit(1);
}

const lms = new PrismaClient();
// Read with raw SQL so this doesn't depend on the portal's generated client.
const portal = new PrismaClient({ datasourceUrl: PORTAL_URL });

const TRACK_PROGRAM = { ADULT_CARE: "adult-care", CHILD_CARE: "child-care" };
const TRACK_TIER = "full";
// Which of a learner's portal enrolments in one track wins.
const RANK = { ACTIVE: 4, PARTIAL: 3, PENDING: 2, CANCELLED: 1 };
const STATUS = { ACTIVE: "ACTIVE", PARTIAL: "CANCELLED", PENDING: "PENDING", CANCELLED: "CANCELLED" };

const naira = (kobo) => `₦${(kobo / 100).toLocaleString("en-NG")}`;
const counts = {};
const count = (key) => (counts[key] = (counts[key] ?? 0) + 1);

async function main() {
  if ((await lms.$queryRaw`SELECT 1 AS ok`.catch(() => null)) === null) throw new Error("Can't reach the LMS database (DATABASE_URL).");

  const tiers = {};
  for (const [track, programSlug] of Object.entries(TRACK_PROGRAM)) {
    const tier = await lms.tier.findFirst({ where: { slug: TRACK_TIER, program: { slug: programSlug } } });
    if (!tier) throw new Error(`No "${TRACK_TIER}" tier in programme "${programSlug}". Run \`npm run seed\` first.`);
    tiers[track] = tier;
  }

  const users = await portal.$queryRaw`SELECT "id", "name", "email", "phone", "passwordHash", "role", "createdAt" FROM "User" ORDER BY "createdAt"`;
  const enrollments = await portal.$queryRaw`
    SELECT "id", "userId", "track"::text AS "track", "status"::text AS "status", "plan"::text AS "plan", "cohort",
           "totalAmount", "amountPaid", "enrolledEmailSentAt", "createdAt", "updatedAt"
    FROM "Enrollment"`;
  const payments = await portal.$queryRaw`
    SELECT "id", "enrollmentId", "userId", "reference", "amount", "status"::text AS "status", "channel", "paidAt", "createdAt"
    FROM "Payment" ORDER BY "createdAt"`;

  console.log(`${APPLY ? "Importing" : "Dry run (nothing is written; add --apply to import)"}:`);
  console.log(`  portal has ${users.length} accounts, ${enrollments.length} enrolments, ${payments.length} payments\n`);

  const paidUsers = new Set(payments.filter((p) => p.status === "SUCCESS").map((p) => p.userId));
  const firstPaidAt = new Map();
  for (const p of payments) {
    if (p.status !== "SUCCESS") continue;
    const at = p.paidAt ?? p.createdAt;
    if (!firstPaidAt.has(p.userId) || at < firstPaidAt.get(p.userId)) firstPaidAt.set(p.userId, at);
  }

  /* ---------------- Accounts ---------------- */
  const userIdMap = new Map(); // portal user id → LMS user id (or a placeholder in a dry run)
  const portalAdmins = [];
  for (const u of users) {
    if (u.role === "ADMIN") portalAdmins.push(u.email);
    const verifiedAt = paidUsers.has(u.id) ? firstPaidAt.get(u.id) : null;
    const existing = await lms.user.findFirst({
      where: { email: { equals: u.email, mode: "insensitive" } },
      select: { id: true, phone: true, emailVerifiedAt: true },
    });
    if (existing) {
      userIdMap.set(u.id, existing.id);
      const data = {
        ...(!existing.phone && u.phone ? { phone: u.phone } : {}),
        ...(!existing.emailVerifiedAt && verifiedAt ? { emailVerifiedAt: verifiedAt } : {}),
      };
      count(Object.keys(data).length ? "accounts matched and updated" : "accounts matched, unchanged");
      if (APPLY && Object.keys(data).length) await lms.user.update({ where: { id: existing.id }, data });
      continue;
    }
    count("accounts created");
    if (!APPLY) {
      userIdMap.set(u.id, `new:${u.id}`);
      continue;
    }
    const created = await lms.user.create({
      data: {
        name: u.name,
        email: u.email,
        phone: u.phone,
        passwordHash: u.passwordHash,
        role: "LEARNER",
        emailVerifiedAt: verifiedAt,
        createdAt: u.createdAt,
      },
    });
    userIdMap.set(u.id, created.id);
  }

  /* ---------------- Enrolments ---------------- */
  const best = new Map(); // `${portal user}:${track}` → winning portal enrolment
  for (const e of enrollments) {
    const key = `${e.userId}:${e.track}`;
    const cur = best.get(key);
    if (!cur || RANK[e.status] > RANK[cur.status] || (RANK[e.status] === RANK[cur.status] && e.updatedAt > cur.updatedAt)) best.set(key, e);
  }
  if (best.size < enrollments.length) console.log(`  ${enrollments.length - best.size} enrolments in other cohorts of the same track were merged\n`);

  const lastPaidAt = new Map(); // portal enrolment id → latest successful payment
  for (const p of payments) {
    if (p.status === "SUCCESS" && (!lastPaidAt.has(p.enrollmentId) || (p.paidAt ?? p.createdAt) > lastPaidAt.get(p.enrollmentId))) {
      lastPaidAt.set(p.enrollmentId, p.paidAt ?? p.createdAt);
    }
  }

  const enrollmentIdMap = new Map(); // `${portal user}:${track}` → LMS enrolment id
  const deposits = [];
  const usersById = new Map(users.map((u) => [u.id, u]));
  for (const [key, e] of best) {
    const userId = userIdMap.get(e.userId);
    const tier = tiers[e.track];
    const status = STATUS[e.status];
    if (e.status === "PARTIAL") {
      deposits.push(`${usersById.get(e.userId)?.email}  ${tier.name} (${TRACK_PROGRAM[e.track]})  paid ${naira(e.amountPaid)} of ${naira(e.totalAmount)}`);
    }
    const existing = userId.startsWith("new:")
      ? null
      : await lms.enrollment.findUnique({ where: { userId_tierId: { userId, tierId: tier.id } } });

    if (existing) {
      enrollmentIdMap.set(key, existing.id);
      if (status === "ACTIVE" && existing.status !== "ACTIVE") {
        count("enrolments activated");
        if (APPLY) {
          await lms.enrollment.update({ where: { id: existing.id }, data: { status: "ACTIVE", activatedAt: lastPaidAt.get(e.id) ?? new Date() } });
        }
      } else count("enrolments already here, unchanged");
      continue;
    }
    count(`enrolments created (${status})`);
    if (!APPLY) {
      enrollmentIdMap.set(key, `new:${e.id}`);
      continue;
    }
    const created = await lms.enrollment.create({
      data: {
        userId,
        tierId: tier.id,
        status,
        source: "LEGACY",
        amount: e.totalAmount,
        activatedAt: status === "ACTIVE" ? (lastPaidAt.get(e.id) ?? e.updatedAt) : null,
        enrolledEmailSentAt: e.enrolledEmailSentAt,
        createdAt: e.createdAt,
      },
    });
    enrollmentIdMap.set(key, created.id);
  }

  /* ---------------- Payments ---------------- */
  const trackByEnrollment = new Map(enrollments.map((e) => [e.id, e.track]));
  for (const p of payments) {
    const userId = userIdMap.get(p.userId);
    const enrollmentId = enrollmentIdMap.get(`${p.userId}:${trackByEnrollment.get(p.enrollmentId)}`);
    if (!userId || !enrollmentId) {
      count("payments skipped (no account or enrolment)");
      continue;
    }
    const existing = await lms.payment.findUnique({ where: { reference: p.reference }, select: { status: true } });
    if (existing) {
      // Only a payment that has since succeeded or failed on the portal changes.
      const changed = existing.status !== p.status && existing.status !== "SUCCESS";
      count(changed ? "payments updated" : "payments already here, unchanged");
      if (APPLY && changed) {
        await lms.payment.update({ where: { reference: p.reference }, data: { status: p.status, channel: p.channel, paidAt: p.paidAt } });
      }
      continue;
    }
    count(`payments copied (${p.status})`);
    if (APPLY) {
      await lms.payment.create({
        data: {
          enrollmentId,
          userId,
          reference: p.reference,
          amount: p.amount,
          status: p.status,
          channel: p.channel,
          paidAt: p.paidAt,
          createdAt: p.createdAt,
        },
      });
    }
  }

  /* ---------------- Report ---------------- */
  for (const [k, v] of Object.entries(counts).sort()) console.log(`  ${String(v).padStart(5)}  ${k}`);
  const paidTotal = payments.filter((p) => p.status === "SUCCESS").reduce((s, p) => s + p.amount, 0);
  console.log(`\n  successful payments on the portal: ${naira(paidTotal)}`);
  if (deposits.length) {
    console.log(`\nSplit-plan deposits with no access yet (${deposits.length}). Once the balance is paid, open the learner in /admin → Grant access → Full Programme:`);
    for (const d of deposits) console.log(`  ${d}`);
  }
  if (portalAdmins.length) {
    console.log(`\nPortal admins, imported as learners (add them in /admin/team if they need admin here):`);
    for (const a of portalAdmins) console.log(`  ${a}`);
  }
  if (!APPLY) console.log("\nNothing was written. Re-run with --apply to import.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await Promise.all([lms.$disconnect(), portal.$disconnect()]);
  });
