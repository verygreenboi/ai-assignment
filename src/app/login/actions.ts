"use server";

import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { db } from "@/db/client";
import { users } from "@/db/schema";
import { createSessionCookie } from "@/lib/session";

/**
 * Sign in from the login page's account cards.
 *
 * Demo mode: the email IS the credential (spec §2.6). It is still checked
 * against the database — an email nobody seeded gets nothing.
 */
export async function signIn(formData: FormData): Promise<void> {
  const email = String(formData.get("email") ?? "");

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (!user) {
    redirect("/login?error=unknown-account");
  }

  const cookie = await createSessionCookie({
    id: user.id,
    email: user.email,
    name: user.name,
  });

  const store = await cookies();
  store.set(cookie.name, cookie.value, cookie.options);

  redirect("/documents");
}
