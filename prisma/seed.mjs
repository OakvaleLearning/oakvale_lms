// Seeds an admin and the marketing-site programmes (prisma/programs.mjs) with
// their tiers, courses and module outline, plus a demo learner in development.
// Safe to re-run: rows are matched by their natural keys, and text is only
// filled in where it is still blank (or an old placeholder), so edits made in
// the admin are never overwritten.
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { PROGRAMS } from "./programs.mjs";

const prisma = new PrismaClient();

// Placeholder text from earlier versions of this script; safe to replace.
const OLD_DEFAULTS = new Set([
  "",
  "Core knowledge and skills every caregiver needs.",
  "Advanced practice. Complete the Foundation course first.",
  ...PROGRAMS.flatMap((p) => [`${p.title}: Foundation`, `${p.title}: Professional`]),
]);

/** Field updates for values that are still blank / placeholders. */
function fillBlanks(row, wanted) {
  return Object.fromEntries(Object.entries(wanted).filter(([k, v]) => row[k] !== v && OLD_DEFAULTS.has(row[k] ?? "")));
}

async function upsertUser({ email, name, password, role }) {
  const passwordHash = await bcrypt.hash(password, 12);
  return prisma.user.upsert({
    where: { email },
    update: { role },
    create: { name, email, passwordHash, role },
  });
}

async function seedProgram(def, order) {
  let program = await prisma.program.upsert({
    where: { slug: def.slug },
    update: {},
    create: { slug: def.slug, title: def.title, description: def.description, published: true, order },
  });
  program = await prisma.program.update({ where: { id: program.id }, data: fillBlanks(program, { description: def.description }) });

  const courses = {};
  for (const [i, slug] of ["foundation", "professional"].entries()) {
    const c = def.courses[slug];
    let course = await prisma.course.upsert({
      where: { programId_slug: { programId: program.id, slug } },
      update: {},
      create: {
        programId: program.id,
        slug,
        title: c.title,
        description: c.description,
        published: true,
        order: i,
        prerequisiteId: slug === "professional" ? courses.foundation.id : null,
      },
    });
    course = await prisma.course.update({
      where: { id: course.id },
      data: fillBlanks(course, { title: c.title, description: c.description }),
    });
    // The outline from the marketing page; lessons are added in the admin.
    if ((await prisma.module.count({ where: { courseId: course.id } })) === 0) {
      for (const [m, title] of c.modules.entries()) {
        await prisma.module.create({ data: { courseId: course.id, title: `Module ${m + 1}: ${title}`, order: m } });
      }
    }
    courses[slug] = course;
  }
  const foundation = courses.foundation;

  const unlocks = {
    foundation: [courses.foundation.id],
    professional: [courses.professional.id],
    full: [courses.foundation.id, courses.professional.id],
  };
  let i = 0;
  for (const [slug, t] of Object.entries(def.tiers)) {
    let tier = await prisma.tier.upsert({
      where: { programId_slug: { programId: program.id, slug } },
      update: {},
      create: { programId: program.id, slug, name: t.name, description: t.description, price: t.price * 100, order: i },
    });
    i++;
    tier = await prisma.tier.update({ where: { id: tier.id }, data: fillBlanks(tier, { description: t.description }) });
    for (const courseId of unlocks[slug]) {
      await prisma.tierCourse.upsert({
        where: { tierId_courseId: { tierId: tier.id, courseId } },
        update: {},
        create: { tierId: tier.id, courseId },
      });
    }
  }

  // A starter quiz in the first module, so the learner side has something
  // playable before any files are uploaded. Dev only.
  const firstModule = await prisma.module.findFirst({ where: { courseId: foundation.id }, orderBy: { order: "asc" } });
  if (
    process.env.NODE_ENV !== "production" &&
    firstModule &&
    (await prisma.lesson.count({ where: { module: { courseId: foundation.id } } })) === 0
  ) {
    await prisma.module.update({
      where: { id: firstModule.id },
      data: {
        lessons: {
          create: {
            title: "Check your understanding",
            type: "QUIZ",
            order: 0,
            quiz: {
              create: {
                passMark: 50,
                questions: {
                  create: [
                    {
                      order: 0,
                      type: "SINGLE",
                      prompt: "What should you do first when you arrive at a client's home?",
                      options: [
                        { id: "a", text: "Start cleaning" },
                        { id: "b", text: "Wash your hands and greet the client" },
                        { id: "c", text: "Check your phone" },
                      ],
                      correct: ["b"],
                      explanation: "Hand hygiene and a respectful greeting come first.",
                    },
                    {
                      order: 1,
                      type: "TRUE_FALSE",
                      prompt: "It is fine to share a client's medical details with friends.",
                      options: [
                        { id: "true", text: "True" },
                        { id: "false", text: "False" },
                      ],
                      correct: ["false"],
                      explanation: "Client information is confidential.",
                    },
                  ],
                },
              },
            },
          },
        },
      },
    });
  }

  return program;
}

async function main() {
  const adminEmail = (process.env.ADMIN_EMAIL ?? "admin@oakvalelearning.com").toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD ?? "admin12345";
  await upsertUser({ email: adminEmail, name: "Oakvale Admin", password: adminPassword, role: "ADMIN" });
  console.log(`✔ Admin ready: ${adminEmail} (password: ${adminPassword})`);

  const programs = [];
  for (const [i, def] of PROGRAMS.entries()) programs.push(await seedProgram(def, i));
  console.log(`✔ Programs ready: ${PROGRAMS.map((p) => p.slug).join(", ")}`);

  // Demo learner with the Adult Care "Full Programme" tier — dev only.
  if (process.env.NODE_ENV !== "production") {
    const learner = await upsertUser({
      email: "learner@example.com",
      name: "Demo Learner",
      password: "learner12345",
      role: "LEARNER",
    });
    const fullTier = await prisma.tier.findUniqueOrThrow({
      where: { programId_slug: { programId: programs[0].id, slug: "full" } },
    });
    await prisma.enrollment.upsert({
      where: { userId_tierId: { userId: learner.id, tierId: fullTier.id } },
      update: {},
      create: {
        userId: learner.id,
        tierId: fullTier.id,
        status: "ACTIVE",
        source: "ADMIN",
        amount: 0,
        activatedAt: new Date(),
      },
    });
    console.log("✔ Demo learner ready: learner@example.com (password: learner12345)");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
