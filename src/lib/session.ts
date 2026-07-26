import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";

/**
 * Session handling — spec §2.6. HS256 JWT in an httpOnly cookie.
 *
 * The secret is read ONCE, at module load, and throws when absent. Silently
 * degrading to an unsigned cookie would turn a misconfigured deploy into an
 * open door, so this fails loudly at boot instead.
 */

const secret = process.env.SESSION_SECRET;

if (!secret) {
  throw new Error(
    "SESSION_SECRET is not set. Copy .env.example to .env and set a value of at least 32 characters.",
  );
}

const key = new TextEncoder().encode(secret);

export const SESSION_COOKIE = "session";

const MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

export type SessionUser = {
  id: string;
  email: string;
  name: string;
};

export type SessionCookie = {
  name: string;
  value: string;
  options: {
    httpOnly: true;
    sameSite: "lax";
    secure: boolean;
    path: string;
    maxAge: number;
  };
};

/** Sign a session token and describe the cookie that carries it. */
export async function createSessionCookie(
  user: SessionUser,
): Promise<SessionCookie> {
  const token = await new SignJWT({ email: user.email, name: user.name })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(key);

  return {
    name: SESSION_COOKIE,
    value: token,
    options: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: MAX_AGE_SECONDS,
    },
  };
}

/** Verify a raw token. Returns null for anything that does not verify. */
export async function verifySessionToken(
  token: string | undefined,
): Promise<SessionUser | null> {
  if (!token) {
    return null;
  }

  try {
    const { payload } = await jwtVerify(token, key, { algorithms: ["HS256"] });

    if (
      typeof payload.sub !== "string" ||
      typeof payload.email !== "string" ||
      typeof payload.name !== "string"
    ) {
      return null;
    }

    return { id: payload.sub, email: payload.email, name: payload.name };
  } catch {
    return null;
  }
}

/**
 * The current session for a server component or server action.
 *
 * `cookies()` is async in Next 16 — awaiting it is not optional.
 */
export async function readSession(): Promise<SessionUser | null> {
  const store = await cookies();
  return verifySessionToken(store.get(SESSION_COOKIE)?.value);
}

/** Read the session cookie off a `Request` — the route-handler door. */
function tokenFromRequest(request: Request): string | undefined {
  const header = request.headers.get("cookie");
  if (!header) {
    return undefined;
  }

  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index === -1) {
      continue;
    }
    if (part.slice(0, index).trim() === SESSION_COOKIE) {
      return decodeURIComponent(part.slice(index + 1).trim());
    }
  }

  return undefined;
}

/** The session, or a throw. Route handlers and the guard use this. */
export async function requireSession(request: Request): Promise<SessionUser> {
  const user = await verifySessionToken(tokenFromRequest(request));

  if (!user) {
    throw new Error("Unauthenticated");
  }

  return user;
}
