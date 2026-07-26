// `tsx` does NOT load `.env` on its own — without this the seed dies on an
// undefined DATABASE_URL.
import "dotenv/config";

import { and, eq } from "drizzle-orm";

import { db, pool } from "../src/db/client";
import { documentShares, documents, users } from "../src/db/schema";

/**
 * Demo state for humans: enough that a reviewer's first login is not an empty
 * screen, and *Shared with me* is non-empty. E2E specs never assert on this —
 * they create their own per-run-unique data.
 *
 * Idempotent: safe to run on every migrate, every CI job and every E2E global
 * setup. Keyed on `email` for users and `(owner_id, title)` for documents.
 */

const SEED_USERS = [
  { email: "ada@ajaia.test", name: "Ada Lovelace" },
  { email: "grace@ajaia.test", name: "Grace Hopper" },
  { email: "alan@ajaia.test", name: "Alan Turing" },
];

/** Distinct and stable — the titles are the idempotency key for documents. */
const ADA_DOCUMENT_TITLES = [
  "Note G — the first algorithm",
  "Sketch of the Analytical Engine",
];

async function findUserIdByEmail(email: string): Promise<string> {
  const [row] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (!row) {
    throw new Error(`Seed user ${email} is missing after upsert`);
  }
  return row.id;
}

/**
 * Select-then-insert rather than `onConflictDoNothing`: spec §2.2 has no unique
 * index on `documents(owner_id, title)`, so an ON CONFLICT arbiter on those
 * columns fails at runtime with 42P10. Adding the constraint to make ON CONFLICT
 * work would silently change the data model.
 */
async function findOrCreateDocument(ownerId: string, title: string): Promise<string> {
  const [existing] = await db
    .select({ id: documents.id })
    .from(documents)
    .where(and(eq(documents.ownerId, ownerId), eq(documents.title, title)))
    .limit(1);

  if (existing) {
    return existing.id;
  }

  const [created] = await db
    .insert(documents)
    .values({ ownerId, title })
    .returning({ id: documents.id });

  return created.id;
}

async function seed(): Promise<void> {
  // `users.email` is unique, so ON CONFLICT has a real arbiter index here.
  await db.insert(users).values(SEED_USERS).onConflictDoNothing({ target: users.email });

  const adaId = await findUserIdByEmail("ada@ajaia.test");
  const graceId = await findUserIdByEmail("grace@ajaia.test");

  const documentIds: string[] = [];
  for (const title of ADA_DOCUMENT_TITLES) {
    documentIds.push(await findOrCreateDocument(adaId, title));
  }

  // `unique (document_id, user_id)` is the arbiter here.
  await db
    .insert(documentShares)
    .values({ documentId: documentIds[0], userId: graceId, role: "viewer" })
    .onConflictDoNothing({
      target: [documentShares.documentId, documentShares.userId],
    });

  console.log(
    `Seeded ${SEED_USERS.length} users, ${documentIds.length} documents and 1 share.`,
  );
}

seed()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
