import { execSync } from "node:child_process";

/**
 * Bring the database up to date before the E2E suite runs.
 *
 * Each child process self-loads `.env` from cwd, so no env plumbing is needed
 * here. Note that Playwright starts `webServer` *before* `globalSetup`, so
 * specs must never assume the database was migrated when Next booted — the CI
 * migrate step before the test steps is the real guarantee.
 *
 * This file does not match `testMatch`, so living in `e2e/` is safe.
 */
export default async function globalSetup(): Promise<void> {
  execSync("npm run db:migrate && npm run db:seed", { stdio: "inherit" });
}
