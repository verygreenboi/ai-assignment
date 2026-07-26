import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";

import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// These tests deliberately talk to Postgres through a raw `pg` Pool rather than
// through the Drizzle client, for two reasons:
//
//  1. drizzle-orm 0.45.x wraps every driver error in a `DrizzleQueryError`, and
//     the Postgres SQLSTATE lives at `error.cause.code`, not `error.code`. A
//     test asserting on `error.code` through Drizzle would fail on the red push
//     AND on the green push — inverted TDD dressed up as a schema bug.
//  2. On the red push `src/db/` has no schema and no client yet. Importing
//     nothing from it keeps the red an *assertion* diff instead of a module
//     resolution error.
//
// Every case is therefore written as outcome-versus-expected: the whole
// scenario runs inside one closure whose rejection is mapped to its SQLSTATE.
// Before the schema exists that code is `42P01` (undefined_table), so each red
// reads `expected <the behaviour>, received '42P01'` and names exactly what is
// missing.

const SEED_USERS = 3;
const SEED_DOCUMENTS = 2;
const SEED_SHARES = 1;

let pool: Pool;

/**
 * Extract a Postgres SQLSTATE from an unknown rejection value, falling back to
 * the stringified error so an unexpected failure is still legible in the diff.
 */
function sqlState(error: unknown): string {
  if (typeof error === "object" && error !== null && "code" in error) {
    return String((error as { code: unknown }).code);
  }
  return String(error);
}

/** A per-run-unique address, so reruns never collide on `users.email`. */
function uniqueEmail(label: string): string {
  return `${label}-${randomUUID()}@ajaia.test`;
}

async function insertUser(email: string, name: string): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    "insert into users (email, name) values ($1, $2) returning id",
    [email, name],
  );
  return rows[0].id;
}

async function insertDocument(ownerId: string, title: string): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    "insert into documents (owner_id, title) values ($1, $2) returning id",
    [ownerId, title],
  );
  return rows[0].id;
}

async function insertShare(
  documentId: string,
  userId: string,
  role: string,
): Promise<void> {
  await pool.query(
    "insert into document_shares (document_id, user_id, role) values ($1, $2, $3)",
    [documentId, userId, role],
  );
}

async function countWhere(sql: string, params: unknown[]): Promise<number> {
  const { rows } = await pool.query<{ count: number }>(sql, params);
  return rows[0].count;
}

beforeAll(() => {
  pool = new Pool({ connectionString: process.env.DATABASE_URL });
  // An unhandled 'error' event on an idle client would surface as an uncaught
  // exception and drown out the assertion diffs these tests exist to produce.
  pool.on("error", () => {});
});

afterAll(async () => {
  await pool.end();
});

describe("schema constraints", () => {
  it("rejects a second share for the same (document_id, user_id)", async () => {
    const outcome = await (async () => {
      const ownerId = await insertUser(uniqueEmail("dup-owner"), "Dup Owner");
      const granteeId = await insertUser(uniqueEmail("dup-grantee"), "Dup Grantee");
      const documentId = await insertDocument(ownerId, `dup-share-${Date.now()}`);

      await insertShare(documentId, granteeId, "viewer");
      await insertShare(documentId, granteeId, "editor");
    })().then(
      () => "inserted",
      (error: unknown) => sqlState(error),
    );

    // 23505 = unique_violation on unique (document_id, user_id).
    expect(outcome).toBe("23505");
  });

  it("rejects a share with role 'admin'", async () => {
    const outcome = await (async () => {
      const ownerId = await insertUser(uniqueEmail("role-owner"), "Role Owner");
      const granteeId = await insertUser(uniqueEmail("role-grantee"), "Role Grantee");
      const documentId = await insertDocument(ownerId, `role-check-${Date.now()}`);

      await insertShare(documentId, granteeId, "admin");
    })().then(
      () => "inserted",
      (error: unknown) => sqlState(error),
    );

    // 23514 = check_violation on role in ('viewer','editor').
    expect(outcome).toBe("23514");
  });

  it("cascades a document's shares away when the document is deleted", async () => {
    const outcome = await (async () => {
      const ownerId = await insertUser(uniqueEmail("doc-cascade-owner"), "Cascade Owner");
      const granteeId = await insertUser(
        uniqueEmail("doc-cascade-grantee"),
        "Cascade Grantee",
      );
      const documentId = await insertDocument(ownerId, `doc-cascade-${Date.now()}`);
      await insertShare(documentId, granteeId, "viewer");

      await pool.query("delete from documents where id = $1", [documentId]);

      return countWhere(
        "select count(*)::int as count from document_shares where document_id = $1",
        [documentId],
      );
    })().catch((error: unknown) => sqlState(error));

    expect(outcome).toBe(0);
  });

  it("cascades a user's owned documents away when the user is deleted", async () => {
    const outcome = await (async () => {
      const ownerId = await insertUser(uniqueEmail("user-cascade-owner"), "Cascade Owner");
      await insertDocument(ownerId, `user-cascade-a-${Date.now()}`);
      await insertDocument(ownerId, `user-cascade-b-${Date.now()}`);

      await pool.query("delete from users where id = $1", [ownerId]);

      return countWhere(
        "select count(*)::int as count from documents where owner_id = $1",
        [ownerId],
      );
    })().catch((error: unknown) => sqlState(error));

    expect(outcome).toBe(0);
  });
});

describe("seed", () => {
  it("is idempotent: seeding twice leaves 3 users, 2 documents and 1 share", async () => {
    // Clean slate so the rows the constraint tests above left behind are not
    // counted. Deliberately swallowed: on the red push the tables do not exist
    // and this must not throw, or the red stops being an assertion diff.
    await pool
      .query("truncate table users, documents, document_shares restart identity cascade")
      .catch(() => undefined);

    const first = spawnSync("npm", ["run", "db:seed"], { encoding: "utf8" });
    expect(first.status).toBe(0);

    const second = spawnSync("npm", ["run", "db:seed"], { encoding: "utf8" });
    expect(second.status).toBe(0);

    const counts = await pool
      .query<{ users: number; documents: number; shares: number }>(
        `select
           (select count(*)::int from users)           as users,
           (select count(*)::int from documents)       as documents,
           (select count(*)::int from document_shares) as shares`,
      )
      .then((result) => result.rows[0], (error: unknown) => sqlState(error));

    expect(counts).toEqual({
      users: SEED_USERS,
      documents: SEED_DOCUMENTS,
      shares: SEED_SHARES,
    });
  });
});
