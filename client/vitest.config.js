import { defineConfig } from "vitest/config";
import { playwright } from "@vitest/browser-playwright";
import react from "@vitejs/plugin-react";

// Pass VITEST_HEADFUL=1 (or use the test:browser:headful script) to open a
const headless = process.env.VITEST_HEADFUL !== "1";

export default defineConfig({
  plugins: [react()],
  // Pre-bundle these so Vite doesn't attempt dynamic import in CI's cold cache
  optimizeDeps: {
    include: ["lucide-react", "react-icons"],
  },
  test: {
    reporters: ["default"],
    projects: [
      {
        // Pure utility tests — no DOM needed, runs in Node
        name: "unit",
        test: {
          name: "unit",
          include: ["test/utils/**/*.{test,spec}.{js,jsx}"],
          environment: "node",
        },
      },
      {
        // Component tests — runs in a real Chromium browser via Playwright
        name: "browser",
        test: {
          name: "browser",
          include: ["test/components/**/*.{test,spec}.{js,jsx}"],
          exclude: ["test/bench/**"],
          // Fail individual tests quickly rather than hanging the whole CI job
          testTimeout: 20000,
          browser: {
            enabled: true,
            headless,
            provider: playwright(),
            instances: [{ browser: "chromium" }],
          },
        },
      },
    ],
  },
  benchmark: {
    include: ["test/bench/**/*.bench.js"],
  },
});
