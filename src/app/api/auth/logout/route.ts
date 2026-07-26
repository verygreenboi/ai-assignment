import { NextResponse } from "next/server";

import { SESSION_COOKIE } from "@/lib/session";

/** `POST /api/auth/logout` — clears the cookie, 204. Spec §2.4. */
export async function POST(): Promise<NextResponse> {
  const response = new NextResponse(null, { status: 204 });

  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });

  return response;
}
