import { defineConfig } from "vitest/config"

// Run with `bun run test` (vitest under Bun, ADR-0028), never `bun test`.
export default defineConfig({
  test: {
    // The forks pool needs `child.channel.unref`, which Bun 1.4 lacks on Windows.
    pool: "threads",
    projects: [
      {
        test: {
          name: "unit",
          include: ["{apps,packages}/*/test/**/*.test.ts"],
          exclude: ["**/*.integration.test.ts", "**/node_modules/**"]
        }
      },
      {
        test: {
          name: "integration",
          include: ["{apps,packages}/*/test/**/*.integration.test.ts"],
          exclude: ["**/node_modules/**"],
          // Migrates a template database once per run; each test file clones it (ADR-0026).
          globalSetup: ["packages/db/src/testing/globalSetup.ts"],
          testTimeout: 30_000,
          hookTimeout: 120_000
        }
      }
    ]
  }
})
