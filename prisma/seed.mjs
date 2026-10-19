// Seeds an admin, the two marketing-site programs with their tiers, and a demo
// learner. Safe to re-run: everything is upserted by its natural key.
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// Mirrors learners_portal src/content/site.ts (slugs + tier prices in Naira).
const PROGRAMS = [
  {
    slug: "adult-care",
    title: "Adult & Elderly Care",
    tiers: { foundation: 35000, professional: 70000, full: 100000 },
  },
  {
    slug: "child-care",
    title: "Childcare & Early Years",
    tiers: { foundation: 30000, professional: 55000, full: 80000 },
  },
];

const TIER_NAMES = { foundation: "Foundation", professional: "Professional", full: "Full Programme" };

async function upsertUser({ email, name, password, role }) {
  const passwordHash = await bcrypt.hash(password, 12);
  return prisma.user.upsert({
    where: { email },
    update: { role },
    create: { name, email, passwordHash, role },
  });
}

async function seedProgram(def, order) {
  const program = await prisma.program.upsert({
    where: { slug: def.slug },
    update: {},
    create: { slug: def.slug, title: def.title, published: true, order },
  });

  const foundation = await prisma.course.upsert({
    where: { programId_slug: { programId: program.id, slug: "foundation" } },
    update: {},
    create: {
      programId: program.id,
      slug: "foundation",
      title: `${def.title}: Foundation`,
      description: "Core knowledge and skills every caregiver needs.",
      published: true,
      order: 0,
    },
  });
  const professional = await prisma.course.upsert({
    where: { programId_slug: { programId: program.id, slug: "professional" } },
    update: {},
    create: {
      programId: program.id,
      slug: "professional",
      title: `${def.title}: Professional`,
      description: "Advanced practice. Complete the Foundation course first.",
      published: true,
      order: 1,
      prerequisiteId: foundation.id,
    },
  });

  const unlocks = {
    foundation: [foundation.id],
    professional: [professional.id],
    full: [foundation.id, professional.id],
  };
  let i = 0;
  for (const [slug, naira] of Object.entries(def.tiers)) {
    const tier = await prisma.tier.upsert({
      where: { programId_slug: { programId: program.id, slug } },
      update: {},
      create: { programId: program.id, slug, name: TIER_NAMES[slug], price: naira * 100, order: i++ },
    });
    for (const courseId of unlocks[slug]) {
      await prisma.tierCourse.upsert({
        where: { tierId_courseId: { tierId: tier.id, courseId } },
        update: {},
        create: { tierId: tier.id, courseId },
      });
    }
  }

  // A starter module with a quiz, so the learner side has something playable
  // before any files are uploaded to R2. Dev only.
  if (
    process.env.NODE_ENV !== "production" &&
    (await prisma.module.count({ where: { courseId: foundation.id } })) === 0
  ) {
    await prisma.module.create({
      data: {
        courseId: foundation.id,
        title: "Module 1: Getting started",
        order: 0,
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
