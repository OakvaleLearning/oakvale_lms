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
