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
          exclude: ["**/node_modules/**"],
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
