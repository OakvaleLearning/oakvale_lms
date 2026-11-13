// Seeds the pre-assessment question banks from prisma/data/foundation-question-bank.json
// (converted from Oakvale_Foundation_Question_Bank_Refined_Context_and_Ethics.xlsx):
// one bank per topic, 20 four-option questions each.
//
//   node --env-file=.env prisma/seed-question-banks.mjs
//
// Safe to re-run: banks are matched by title, and a question is skipped when its
// bank already holds one with the same question ID (kept at the start of the
// explanation, e.g. "FND-001 · …") or the same wording. Nothing is updated or
// deleted, so edits made in /admin/question-banks are kept.
import { readFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const data = JSON.parse(await readFile(new URL("./data/foundation-question-bank.json", import.meta.url), "utf8"));

/** The admin-only notes: ID, difficulty and type, the explanation, and the blind spot it tests. */
function explanation(q) {
  const tags = [q.id, q.difficulty, q.kind, q.critical && "Critical safety item"].filter(Boolean).join(" · ");
  const text = [tags, q.explanation, q.blindSpot && `Blind spot: ${q.blindSpot}`].filter(Boolean).join("\n\n");
  return text.slice(0, 2000);
}

let banksCreated = 0;
let added = 0;
let skipped = 0;

for (const b of data.banks) {
  const title = `Foundation: ${b.topic}`;
  const description = [b.module, b.lessons, b.coverage && `Covers: ${b.coverage}`, b.ids].filter(Boolean).join(" · ");
  let bank = await prisma.questionBank.findFirst({ where: { title }, include: { questions: true } });
  if (!bank) {
    bank = await prisma.questionBank.create({ data: { title, description: description.slice(0, 1000) }, include: { questions: true } });
    banksCreated++;
  }

  const have = bank.questions;
  let order = Math.max(-1, ...have.map((q) => q.order)) + 1;
  const rows = [];
  for (const q of b.questions) {
    const prompt = q.context ? `${q.context}\n\n${q.prompt}` : q.prompt;
    if (have.some((h) => h.prompt === prompt || h.explanation?.startsWith(`${q.id} ·`))) {
      skipped++;
      continue;
    }
    const options = Object.entries(q.options).map(([id, text]) => ({ id, text }));
    if (!options.some((o) => o.id === q.correct)) throw new Error(`${q.id}: correct answer "${q.correct}" is not an option`);
    rows.push({ bankId: bank.id, order: order++, type: "SINGLE", prompt, options, correct: [q.correct], explanation: explanation(q), points: 1 });
  }
  if (rows.length) await prisma.bankQuestion.createMany({ data: rows });
  added += rows.length;
  console.log(`${title}: +${rows.length}`);
}

console.log(`\nBanks created: ${banksCreated} · questions added: ${added} · already there: ${skipped}`);
await prisma.$disconnect();
