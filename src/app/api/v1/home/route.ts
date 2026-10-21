import { NextResponse } from "next/server";
import { getLearnerHome } from "@/lib/lms/catalog";
import { requireApiSession } from "@/lib/api/mobile";
import { isPrelaunch } from "@/lib/launch";

/** Enrolled programmes → courses with progress, plus the lesson to continue. */
export async function GET() {
  const session = await requireApiSession();
  if (session instanceof NextResponse) return session;
  const { programs, continueLesson } = await getLearnerHome(session.userId);
  return NextResponse.json({
    // Pre-launch: enrolled, but courses don't open yet.
    prelaunch: isPrelaunch() && session.role !== "ADMIN",
    programs,
    continueLesson: continueLesson && {
      lessonId: continueLesson.lessonId,
      programSlug: continueLesson.programSlug,
      courseSlug: continueLesson.courseSlug,
      lessonTitle: continueLesson.lessonTitle,
      courseTitle: continueLesson.courseTitle,
    },
  });
}
