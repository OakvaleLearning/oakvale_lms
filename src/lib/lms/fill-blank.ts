/**
 * Fill-in-the-blank questions.
 *
 * Admins write the sentence with each answer in square brackets, alternatives
 * separated by "|":  "Wash your hands for at least [20|twenty] seconds."
 *
 * Stored on `Question`: `prompt` has each blank replaced by BLANK, `options` is
 * empty, and `correct` holds one entry per blank (in order) with its accepted
 * answers joined by "|". Learners never receive `correct`; they get the prompt
 * split into the text around the blanks, and submit one typed answer per blank.
 * Marking ignores case, extra spaces and surrounding punctuation.
 */

export const BLANK = "{{blank}}";
export const MAX_BLANKS = 10;
export const MAX_ANSWER_CHARS = 100;

const BRACKETED = /\[([^[\]]*)\]/g;

/** Turn the admin's bracketed text into the stored prompt and accepted answers per blank. */
export function parseBlankText(text: string): { prompt: string; answers: string[][] } {
  const answers: string[][] = [];
  const prompt = text.replace(BRACKETED, (_, inner: string) => {
    answers.push(inner.split("|").map((a) => a.trim()).filter(Boolean));
    return BLANK;
  });
  return { prompt, answers };
}

/** The bracketed text the admin edits, rebuilt from a stored question. */
export function toBlankText(prompt: string, correct: string[]): string {
  let i = 0;
  return prompt.split(BLANK).reduce((out, part, idx) => (idx === 0 ? part : `${out}[${correct[i++] ?? ""}]${part}`), "");
}

/** The text around the blanks: blanks = segments.length - 1. */
export function blankSegments(prompt: string): string[] {
  return prompt.split(BLANK);
}

/** The prompt with each blank shown as a line, for lists and plain-text clients. */
export function displayBlankPrompt(prompt: string): string {
  return prompt.split(BLANK).join("_____");
}

export function normalizeAnswer(s: string): string {
  return s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[\s.,;:!?"'()]+|[\s.,;:!?"'()]+$/g, "");
}

/** Whether a typed answer matches one blank's accepted answers ("a|b"). */
export function blankMatches(given: string | undefined, accepted: string): boolean {
  const g = normalizeAnswer(given ?? "");
  return g !== "" && accepted.split("|").some((a) => normalizeAnswer(a) === g);
}
