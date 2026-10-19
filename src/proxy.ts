import { NextResponse, type NextRequest } from "next/server";

/**
 * Optimistic check only: a visitor with no session cookie is sent to log in
 * with the full path as `next`, so deep links (e.g. a lesson) survive login.
 * The real session verification happens in the layouts and route handlers.
 */
export function proxy(request: NextRequest) {
  if (request.cookies.has("oakvale_session")) return NextResponse.next();
  const { pathname, search } = request.nextUrl;
  const login = new URL("/login", request.url);
  login.searchParams.set("next", pathname + search);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/learn/:path*", "/admin/:path*"],
};
