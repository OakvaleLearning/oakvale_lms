import { NextResponse } from "next/server";
import { getLearnerHome } from "@/lib/lms/catalog";
import { requireApiSession } from "@/lib/api/mobile";
import { isPrelaunch } from "@/lib/launch";

/** Enrolled programmes → modules with progress, plus the lesson to continue. */
export async function GET() {
  const session = await requireApiSession();
  if (session instanceof NextResponse) return session;
  const { programs, continueLesson } = await getLearnerHome(session.userId);
  return NextResponse.json({
    // Pre-launch: enrolled, but modules don't open yet.
    prelaunch: isPrelaunch() && session.role !== "ADMIN",
    // `courses` repeats `modules` for app versions from before the rename.
    programs: programs.map((p) => ({ ...p, courses: p.modules })),
    continueLesson: continueLesson && {
      lessonId: continueLesson.lessonId,
      programSlug: continueLesson.programSlug,
      moduleSlug: continueLesson.moduleSlug,
      lessonTitle: continueLesson.lessonTitle,
      moduleTitle: continueLesson.moduleTitle,
      // Old names, for app versions from before the rename.
      courseSlug: continueLesson.moduleSlug,
      courseTitle: continueLesson.moduleTitle,
    },
  });
}
