import { type NextRequest, NextResponse } from "next/server";

import { verifySessionToken } from "@/lib/session";

/**
 * Next 16's rename of `middleware.ts` — spec §2.6.
 *
 * A coarse filter, not the control: it verifies the cookie's SIGNATURE and
 * nothing more, and it never imports the database client. The real access
 * decision is `requireDocAccess` / `loadDocumentForPage`, per document.
 *
 * The matcher is load-bearing. Without it this runs on every request,
 * including `/_next/static`, and unauthenticated `/login` would redirect to
 * itself forever.
 */
export const config = {
  matcher: ["/documents/:path*", "/api/documents/:path*"],
};

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const token = request.cookies.get("session")?.value;
  const user = await verifySessionToken(token);

  if (user) {
    return NextResponse.next();
  }

  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const login = new URL("/login", request.url);
  return NextResponse.redirect(login);
}

export default proxy;
