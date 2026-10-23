import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { checkLessonAccess } from "@/lib/lms/access";
import { getInitialCmi } from "@/lib/lms/scorm";
import { isStorageConfigured } from "@/lib/storage";
import { ScormPlayer } from "@/components/learn/ScormPlayer";

export const metadata: Metadata = { title: "Lesson", robots: { index: false } };

/**
 * Full-screen SCORM/HTML player for the mobile app's WebView: no site chrome;
 * the app draws its own header and "Mark as complete" button.
 */
export default async function MobileLessonPage({ params, searchParams }: PageProps<"/m/lesson/[lessonId]">) {
  const { lessonId } = await params;
  const { block: blockParam } = await searchParams;
  const session = await getSession();
  if (!session) return <Notice>Your session has expired. Go back and open the lesson again.</Notice>;

  const access = await checkLessonAccess(session, lessonId);
  if (!access.ok) notFound();
  const { lesson } = access;
  // The web part to play: the one asked for, else the lesson's first SCORM / web page part.
  const web = lesson.blocks.filter((b) => b.type === "SCORM" || b.type === "HTML");
  const part = web.find((b) => b.id === blockParam) ?? web[0];
  const asset = part?.asset;
  if (!part || !asset || asset.status !== "READY" || !isStorageConfigured()) {
    return <Notice>This lesson&apos;s content is being prepared. Please check back soon.</Notice>;
  }

  const src = `/content/${asset.id}/${asset.launchPath}`;
  if (part.type === "HTML") {
    return <iframe src={src} title={lesson.title} className="fixed inset-0 size-full border-0" allowFullScreen />;
  }
  const version = asset.scormVersion === "1.2" ? "1.2" : "2004";
  const initialCmi = await getInitialCmi(session.userId, lesson.id, version, { id: session.userId, name: session.name });
  return <ScormPlayer lessonId={lesson.id} version={version} src={src} initialCmi={initialCmi} fullScreen />;
}

function Notice({ children }: { children: React.ReactNode }) {
  return <div className="grid min-h-dvh place-items-center p-8 text-center text-sm text-ink-500">{children}</div>;
}
