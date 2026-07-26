import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    // Vitest 4 removed `environmentMatchGlobs` — projects are the replacement.
    projects: [
      {
        test: {
          name: "integration",
          environment: "node",
          include: ["**/*.integration.test.ts"],
          // `.worktrees/**` is not optional here: the epic driver checks child
          // worktrees out inside the repo, so a root-level `npm run test` would
          // otherwise double-collect every worktree's copy of these files
          // against the one database.
          exclude: ["**/node_modules/**", ".worktrees/**"],
          // Nothing else loads `.env` for a plain node process — without this
          // every integration test fails on an undefined `DATABASE_URL`.
          setupFiles: ["dotenv/config"],
          // Parallel workers against a single database flake.
          fileParallelism: false,
        },
      },
      {
        test: {
          name: "unit",
          environment: "jsdom",
          // Not optional: without it the integration files match the default
          // include here too and run in BOTH projects.
          exclude: [
            "**/*.integration.test.ts",
            "e2e/**",
            "**/node_modules/**",
            ".worktrees/**",
          ],
        },
      },
    ],
  },
});
