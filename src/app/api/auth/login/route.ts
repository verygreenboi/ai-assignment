import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/db/client";
import { users } from "@/db/schema";
import { createSessionCookie } from "@/lib/session";

/**
 * `POST /api/auth/login` — spec §2.4.
 *
 * One of the two session entry points, so by construction it cannot call
 * `requireSession`. It touches no document data and carries its own denial
 * test: an unknown email gets 401 and NO `Set-Cookie`.
 */
export async function POST(request: Request): Promise<NextResponse> {
  let email: unknown;

  try {
    const body: unknown = await request.json();
    email =
      typeof body === "object" && body !== null
        ? (body as Record<string, unknown>).email
        : undefined;
  } catch {
    email = undefined;
  }

  if (typeof email !== "string" || email.length === 0) {
    return NextResponse.json({ error: "An email is required" }, { status: 400 });
  }

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (!user) {
    return NextResponse.json({ error: "Unknown account" }, { status: 401 });
  }

  const cookie = await createSessionCookie({
    id: user.id,
    email: user.email,
    name: user.name,
  });

  const response = NextResponse.json({
    id: user.id,
    email: user.email,
    name: user.name,
  });
  response.cookies.set(cookie.name, cookie.value, cookie.options);

  return response;
}
