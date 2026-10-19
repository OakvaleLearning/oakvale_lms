import { NextResponse } from "next/server";
import { destroySession } from "@/lib/auth";

export async function POST(req: Request) {
  await destroySession();
  // Support both fetch() callers and plain <form> posts.
  const accept = req.headers.get("accept") ?? "";
  if (accept.includes("text/html")) {
    return NextResponse.redirect(new URL("/", req.url));
  }
  return NextResponse.json({ ok: true });
}
