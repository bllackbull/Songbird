import path from "node:path";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { visualizer } from "rollup-plugin-visualizer";

export default defineConfig(({ mode }) => {
  const rootEnv = loadEnv(mode, path.resolve(__dirname, ".."), "");
  const apiPort = Number(
    rootEnv.SERVER_PORT ||
      rootEnv.PORT ||
      process.env.SERVER_PORT ||
      process.env.PORT ||
      5174,
  );
  const analyze =
    String(rootEnv.ANALYZE || process.env.ANALYZE || "").toLowerCase() === "true";

  return {
    plugins: [
      react(),
      ...(analyze
        ? [
            visualizer({
              filename: "dist/stats.html",
              gzipSize: true,
              brotliSize: true,
              open: false,
            }),
          ]
        : []),
    ],
    envDir: "..",
    envPrefix: ["APP_", "CHAT_", "FILE_", "MESSAGE_", "ACCOUNT_"],
    build: {
      chunkSizeWarningLimit: 800,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes("node_modules")) return;
            if (
              id.includes("/react/") ||
              id.includes("/react-dom/") ||
              id.includes("/scheduler/")
            ) {
              return "react-core";
            }
            if (id.includes("/lucide-react/")) {
              return "icons";
            }
            if (
              id.includes("/marked/") ||
              id.includes("/dompurify/") ||
              id.includes("/highlight.js/")
            ) {
              return "markdown";
            }
            return "vendor";
          },
        },
      },
    },
    server: {
      host: "0.0.0.0",
      port: 5173,
      proxy: {
        "/api": `http://localhost:${apiPort}`,
      },
    },
  };
});
