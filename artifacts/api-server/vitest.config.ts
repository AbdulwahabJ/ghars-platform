import { defineConfig } from "vitest/config";

// The dev DATABASE_URL is only used to derive the cluster location; all tests
// run against a dedicated, disposable database created by test/global-setup.ts.
const devUrl = process.env.DATABASE_URL;
if (!devUrl) {
  throw new Error(
    "DATABASE_URL must be set (used to derive the isolated test database URL).",
  );
}
const testUrl = new URL(devUrl);
testUrl.pathname = "/dental_followup_test";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    globalSetup: ["./test/global-setup.ts"],
    setupFiles: ["./test/setup-env.ts"],
    // Test files share one database; run them sequentially for determinism.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    env: {
      TEST_ADMIN_DATABASE_URL: devUrl,
      DATABASE_URL: testUrl.toString(),
      SESSION_SECRET: "test-session-secret-not-production",
      INITIAL_SETUP_KEY: "test-setup-key-1234",
      NODE_ENV: "test",
    },
  },
});
