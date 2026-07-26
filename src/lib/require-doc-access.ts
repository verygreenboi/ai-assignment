import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/db/client";
import { documentShares, documents } from "@/db/schema";
import { type Capability, type Role, can, resolveRole } from "@/lib/permissions";
import { type SessionUser, readSession, requireSession } from "@/lib/session";

/**
 * The guard — spec §2.3. Two entry points, one brain.
 *
 * Route handlers have a `Request`; App Router server components do not. That
 * is the only reason there are two doors. Both run the same joined query, the
 * same `resolveRole` and the same `can`, and throw the same error.
 */

export type Document = typeof documents.$inferSelect;

export type DocAccess = {
  user: SessionUser;
  document: Document;
  role: Role;
};

export class DocAccessError extends Error {
  readonly status: 401 | 403 | 404;

  constructor(status: 401 | 403 | 404, message: string) {
    super(message);
    this.name = "DocAccessError";
    this.status = status;
  }
}

/**
 * One query for the document and the caller's share of it. A left join keeps
 * "document missing" and "no share" distinguishable in a single round trip —
 * both end up 404 to the caller, but only after we know which one it was.
 */
async function authorize(
  user: SessionUser,
  documentId: string,
  capability: Capability,
): Promise<DocAccess> {
  const rows = await db
    .select({ document: documents, share: documentShares })
    .from(documents)
    .leftJoin(
      documentShares,
      and(
        eq(documentShares.documentId, documents.id),
        eq(documentShares.userId, user.id),
      ),
    )
    .where(eq(documents.id, documentId))
    .limit(1);

  const row = rows[0];

  if (!row) {
    throw new DocAccessError(404, "Document not found");
  }

  const role = resolveRole(user.id, row.document, row.share);

  // 404, not 403: a caller with no relationship to the document must not be
  // able to tell "does not exist" from "not yours", or the id space is
  // enumerable. A caller who DOES hold a role already knows it exists, so
  // they get an honest 403 below.
  if (role === null) {
    throw new DocAccessError(404, "Document not found");
  }

  if (!can(role, capability)) {
    throw new DocAccessError(403, "You do not have permission to do that");
  }

  return { user, document: row.document, role };
}

/** The route-handler door. */
export async function requireDocAccess(
  request: Request,
  documentId: string,
  capability: Capability,
): Promise<DocAccess> {
  let user: SessionUser;

  try {
    user = await requireSession(request);
  } catch {
    throw new DocAccessError(401, "Not signed in");
  }

  return authorize(user, documentId, capability);
}

/** The server-component door — reads the cookie via `next/headers`. */
export async function loadDocumentForPage(
  documentId: string,
  capability: Capability,
): Promise<DocAccess> {
  const user = await readSession();

  if (!user) {
    throw new DocAccessError(401, "Not signed in");
  }

  return authorize(user, documentId, capability);
}

/** Map a guard failure onto the `{ error }` shape every handler returns. */
export function toErrorResponse(error: unknown): NextResponse {
  if (error instanceof DocAccessError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}
