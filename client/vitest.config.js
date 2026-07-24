import { defineConfig } from "vitest/config";
import { playwright } from "@vitest/browser-playwright";
import react from "@vitejs/plugin-react";

// Pass VITEST_HEADFUL=1 (or use the test:browser:headful script) to open a
const headless = process.env.VITEST_HEADFUL !== "1";

export default defineConfig({
  plugins: [react()],
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
          browser: {
            enabled: true,
            headless,
            provider: playwright(),
            instances: [{ browser: "chromium" }, { browser: "firefox" }],
          },
        },
        optimizeDeps: {
          include: ["lucide-react", "react-icons"],
        },
      },
    ],
  },
  benchmark: {
    include: ["test/bench/**/*.bench.js"],
  },
});
