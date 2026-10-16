// Database integration tests (npm run test:db). They run against the linked Supabase project
// inside a transaction that is always rolled back.
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "server-only": fileURLToPath(new URL("./tests/stubs/empty.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.integration.test.ts"],
    testTimeout: 180_000,
    env: { RUN_DB_TESTS: "1" },
  },
});
