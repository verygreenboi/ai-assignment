// `drizzle-kit` auto-loads `.env` from cwd, but making it explicit keeps the
// entry point honest and matches `scripts/seed.ts`, which genuinely needs it.
import "dotenv/config";

import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    // `drizzle-kit generate` reads the schema and emits SQL with no database
    // connection at all, so an unset URL must not be fatal here — only
    // `db:migrate` actually dials out.
    url: process.env.DATABASE_URL ?? "",
  },
});
