import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.{js,mjs,cjs}"],
    reporters: ["default"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "html"],
      include: [
        "api/**/*.js",
        "lib/**/*.js",
        "settings/**/*.js",
        "db/**/*.js",
        "db.js",
        "index.js",
        "migrations/**/*.js",
      ],
      exclude: [
        "node_modules/**",
        "coverage/**",
        "dist/**",
        "test/**",
        "scripts/**",
        "data/**",
        "**/*.test.{js,mjs,cjs}",
        "**/*.spec.{js,mjs,cjs}",
        "vitest.config.js",
      ],
    },
  },
  benchmark: {
    include: ["test/bench/**/*.bench.js"],
  },
});
