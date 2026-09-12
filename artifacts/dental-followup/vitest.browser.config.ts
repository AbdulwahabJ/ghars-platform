import path from "node:path";
import react from "@vitejs/plugin-react";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
    },
    dedupe: ["react", "react-dom"],
  },
  test: {
    include: ["browser-tests/**/*.test.tsx"],
    browser: {
      enabled: true,
      headless: true,
      screenshotFailures: false,
      provider: playwright({
        launchOptions: {
          executablePath: "/repl/tools/bin/chromium",
          args: ["--no-sandbox"],
        },
      }),
      instances: [{ browser: "chromium" }],
    },
  },
});