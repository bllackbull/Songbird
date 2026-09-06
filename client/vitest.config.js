import { defineConfig } from "vitest/config";
import { playwright } from "@vitest/browser-playwright";
import react from "@vitejs/plugin-react";

// Pass VITEST_HEADFUL=1 (or use the test:browser:headful script) to open a
const headless = process.env.VITEST_HEADFUL !== "1";

const isCoverage =
  process.argv.includes("--coverage") || process.env.VITEST_COVERAGE === "1";

const browserInstances = isCoverage
  ? [
      {
        browser: "chromium",
        launch: {
          args: [
            "--no-sandbox",
            "--disable-dev-shm-usage",
            "--disable-gpu",
          ],
        },
      },
    ]
  : [
      {
        browser: "chromium",
        launch: {
          args: [
            "--no-sandbox",
            "--disable-dev-shm-usage",
            "--disable-gpu",
          ],
        },
      },
      { browser: "firefox" },
    ];

// Dependencies the browser project must pre-bundle. If Vite discovers any of
// these *during* a run instead, it re-optimizes and reloads the page mid-test,
// which throws "Vitest failed to find the runner" and then hangs the runner
// forever. Listing them here forces a single up-front optimize pass.
const browserOptimizeInclude = [
  "lucide-react",
  "vitest-browser-react",
  "react",
  "react/jsx-dev-runtime",
  "react/jsx-runtime",
  "react-dom",
  "react-dom/client",
];

export default defineConfig({
  test: {
    reporters: ["default"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "html"],
      include: ["src/**/*.{js,jsx}"],
      exclude: [
        "node_modules/**",
        "dist/**",
        "coverage/**",
        "test/**",
        "**/*.test.{js,jsx}",
        "**/*.spec.{js,jsx}",
      ],
    },
    projects: [
      {
        // Pure utility tests — no DOM needed, runs in Node
        test: {
          name: "unit",
          include: [
            "test/utils/**/*.{test,spec}.{js,jsx}",
            "test/hooks/**/*.{test,spec}.{js,jsx}",
          ],
          environment: "node",
        },
      },
      {
        // Component tests — runs in a real Chromium browser via Playwright.
        // plugins + optimizeDeps must live on the project itself: the browser
        // project runs its own Vite server and does NOT inherit them from the
        // root config.
        plugins: [react()],
        optimizeDeps: {
          include: browserOptimizeInclude,
        },
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
            instances: browserInstances,
          },
        },
      },
    ],
  },
  benchmark: {
    include: ["test/bench/**/*.bench.js"],
  },
});
