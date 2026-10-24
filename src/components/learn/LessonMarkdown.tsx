"use client";

import { Streamdown } from "streamdown";

/** A lesson's written content. Markdown is rendered safely (no raw HTML). */
export function LessonMarkdown({ children }: { children: string }) {
  return (
    <Streamdown mode="static" controls={false} className="tutor-md lesson-md">
      {children}
    </Streamdown>
  );
}
