import { sql } from "drizzle-orm";

import { db } from "../db/client";
import { users } from "../db/schema";

/**
 * The shared integration-test harness. Children 3–7 import this.
 */

const BASELINE_USERS = [
  { email: "ada@ajaia.test", name: "Ada Lovelace" },
  { email: "grace@ajaia.test", name: "Grace Hopper" },
  { email: "alan@ajaia.test", name: "Alan Turing" },
];

/**
 * Empty the three application tables.
 *
 * Deliberately enumerated rather than "every table in the public schema":
 * Drizzle's migrations journal lives in `drizzle.__drizzle_migrations`, and
 * truncating it would make the next `db:migrate` replay every migration onto a
 * database that already has the objects.
 */
export async function resetDb(): Promise<void> {
  await db.execute(
    sql`TRUNCATE TABLE users, documents, document_shares RESTART IDENTITY CASCADE;`,
  );
}

/** The three users and nothing else — no documents, no shares. */
export async function seedBaseline(): Promise<void> {
  await db.insert(users).values(BASELINE_USERS).onConflictDoNothing({ target: users.email });
}
