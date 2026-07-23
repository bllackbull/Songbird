import { defineConfig } from "vitest/config";
import { playwright } from "@vitest/browser-playwright";
import react from "@vitejs/plugin-react";

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
          browser: {
            enabled: true,
            provider: playwright(),
            instances: [{ browser: "chromium" }, { browser: "firefox" }],
          },
        },
      },
    ],
  },
});
