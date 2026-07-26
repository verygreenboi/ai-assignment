import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema";

/**
 * The one database handle. Nothing else in the codebase constructs a pool.
 *
 * `pool` is exported alongside it so short-lived processes (the seed script)
 * can close their connections and exit instead of hanging on an idle client.
 */
export const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export const db = drizzle(pool, { schema });
