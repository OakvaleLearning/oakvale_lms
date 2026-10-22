import { z } from "zod";

/**
 * WhatsApp / phone number. Deliberately lenient about formatting (spaces,
 * dashes, brackets, leading +) and strict only about digit count, so we accept
 * both local "0810 818 9514" and international "+44 7700 900123" numbers.
 */
export const phoneSchema = z
  .string()
  .trim()
  .min(1, "Please enter your WhatsApp number")
  .max(25)
  .regex(
    /^\+?[\d\s()\-.]{7,24}$/,
    "Enter a valid WhatsApp number, e.g. 0810 818 9514"
  )
  .refine(
    (v) => {
      const digits = v.replace(/\D/g, "").length;
      return digits >= 7 && digits <= 15;
    },
    "Enter a valid WhatsApp number, e.g. 0810 818 9514"
  );

export const signupSchema = z.object({
  name: z.string().trim().min(2, "Please enter your name").max(120),
  email: z.string().trim().email("Enter a valid email").max(200),
  phone: phoneSchema,
  password: z.string().min(8, "Password must be at least 8 characters").max(200),
});

export const loginSchema = z.object({
  email: z.string().trim().email("Enter a valid email").max(200),
  password: z.string().min(1, "Enter your password").max(200),
});

export const forgotPasswordSchema = z.object({
  email: z.string().trim().email("Enter a valid email").max(200),
});

export const resetPasswordSchema = z.object({
  token: z.string().trim().min(1, "This reset link is invalid.").max(500),
  password: z.string().min(8, "Password must be at least 8 characters").max(200),
});

export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

/* ------------------------------------------------------------------ *
 * Admin — catalogue
 * ------------------------------------------------------------------ */

export const slugSchema = z
  .string()
  .trim()
  .min(2, "Slug is too short")
  .max(60)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers and hyphens only");

export const programSchema = z.object({
  title: z.string().trim().min(2, "Title is too short").max(160),
  slug: slugSchema,
  description: z.string().trim().max(2000).default(""),
  published: z.boolean().default(false),
});

export const tierSchema = z.object({
  name: z.string().trim().min(2, "Name is too short").max(80),
  slug: slugSchema,
  description: z.string().trim().max(1000).default(""),
  priceNaira: z.coerce.number().int("Whole Naira only").min(0).max(100_000_000),
  published: z.boolean().default(true),
  courseIds: z.array(z.string().max(40)).max(200).default([]),
});

export const courseSchema = z.object({
  title: z.string().trim().min(2, "Title is too short").max(160),
  slug: slugSchema,
  description: z.string().trim().max(4000).default(""),
  published: z.boolean().default(false),
  sequential: z.boolean().default(false),
  prerequisiteId: z.string().max(40).optional().or(z.literal("")),
});

export const LESSON_TYPES = ["VIDEO", "AUDIO", "SCORM", "HTML", "QUIZ"] as const;

export const lessonCreateSchema = z.object({
  title: z.string().trim().min(2, "Title is too short").max(200),
  // "EXAM" creates a QUIZ lesson that is the course's final assessment.
  type: z.enum([...LESSON_TYPES, "EXAM"]),
});

export const lessonUpdateSchema = z.object({
  title: z.string().trim().min(2, "Title is too short").max(200),
  description: z.string().trim().max(10000).default(""),
  tutorNotes: z.string().trim().max(30000).default(""),
  published: z.boolean().default(true),
  durationMin: z.coerce.number().min(0).max(24 * 60).optional(),
});

export const QUIZ_KINDS = ["QUIZ", "EXAM"] as const;

export const quizSettingsSchema = z.object({
  kind: z.enum(QUIZ_KINDS).default("QUIZ"),
  passMark: z.coerce.number().int().min(0).max(100),
  maxAttempts: z.coerce.number().int().min(1).max(100).optional(),
  shuffle: z.boolean().default(false),
});

export const questionSchema = z
  .object({
    type: z.enum(["SINGLE", "MULTIPLE", "TRUE_FALSE"]),
    prompt: z.string().trim().min(3, "Question is too short").max(2000),
    options: z
      .array(z.object({ id: z.string().min(1).max(40), text: z.string().trim().min(1, "Options can't be empty").max(500) }))
      .min(2, "Add at least two options")
      .max(10),
    correct: z.array(z.string().max(40)).min(1, "Mark the correct answer"),
    explanation: z.string().trim().max(2000).optional().or(z.literal("")),
    points: z.coerce.number().int().min(1).max(100).default(1),
  })
  .refine((q) => q.correct.every((c) => q.options.some((o) => o.id === c)), "Correct answer must be one of the options")
  .refine((q) => q.type === "MULTIPLE" || q.correct.length === 1, "Single-answer questions need exactly one correct option");

/* ------------------------------------------------------------------ *
 * Community
 * ------------------------------------------------------------------ */

export const POST_MAX_CHARS = 5000;
export const COMMENT_MAX_CHARS = 2000;
export const POST_MAX_IMAGES = 4;
export const REACTION_KINDS = ["LIKE", "LOVE", "CELEBRATE", "INSIGHTFUL"] as const;
export const GROUP_AUDIENCES = ["ALL_PAID", "PROGRAM", "TIER"] as const;
export const RSVP_STATUSES = ["GOING", "MAYBE", "NO"] as const;
/** /community/<slug> sits beside these pages, so groups can't use their names. */
export const RESERVED_GROUP_SLUGS = ["events", "members", "notifications", "settings", "new"];

export const postSchema = z.object({
  groupId: z.string().min(1, "Choose a group").max(40),
  body: z.string().trim().min(1, "Write something first").max(POST_MAX_CHARS, `Posts are limited to ${POST_MAX_CHARS} characters`),
  images: z.array(z.string().max(300)).max(POST_MAX_IMAGES, `Add up to ${POST_MAX_IMAGES} images`).default([]),
  announcement: z.boolean().default(false),
});

export const postEditSchema = z.object({
  body: z.string().trim().min(1, "Write something first").max(POST_MAX_CHARS, `Posts are limited to ${POST_MAX_CHARS} characters`),
});

export const commentSchema = z.object({
  body: z.string().trim().min(1, "Write a comment first").max(COMMENT_MAX_CHARS, `Comments are limited to ${COMMENT_MAX_CHARS} characters`),
  parentId: z.string().max(40).optional(),
});

export const communityProfileSchema = z.object({
  headline: z.string().trim().max(80).default(""),
  location: z.string().trim().max(80).default(""),
  bio: z.string().trim().max(280, "Keep your bio under 280 characters").default(""),
  notifyEmail: z.boolean().default(true),
  digest: z.boolean().default(true),
});

export const communityGroupSchema = z
  .object({
    name: z.string().trim().min(2, "Name is too short").max(80),
    slug: slugSchema,
    description: z.string().trim().max(1000).default(""),
    audience: z.enum(GROUP_AUDIENCES),
    programId: z.string().max(40).optional(),
    tierId: z.string().max(40).optional(),
  })
  .refine((g) => !RESERVED_GROUP_SLUGS.includes(g.slug), { message: "That slug is reserved — choose another", path: ["slug"] })
  .refine((g) => g.audience !== "PROGRAM" || g.programId, { message: "Choose the programme", path: ["programId"] })
  .refine((g) => g.audience !== "TIER" || g.tierId, { message: "Choose the tier", path: ["tierId"] });

export const communityEventSchema = z
  .object({
    groupId: z.string().min(1).max(40),
    title: z.string().trim().min(3, "Title is too short").max(140),
    description: z.string().trim().max(5000).default(""),
    startsAt: z.date({ error: "Enter a valid start time" }),
    endsAt: z.date().optional(),
    location: z.string().trim().max(200).default(""),
    meetingUrl: z.url({ protocol: /^https?$/, error: "Enter a full link starting with https://" }).max(500).optional(),
  })
  .refine((e) => !e.endsAt || e.endsAt > e.startsAt, { message: "The end must be after the start", path: ["endsAt"] });
