import path from "node:path";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const rootEnv = loadEnv(mode, path.resolve(__dirname, ".."), "");
  const apiPort = Number(rootEnv.PORT || process.env.PORT || 5174);

  return {
    plugins: [react()],
    envDir: "..",
    envPrefix: ["CHAT_", "FILE_", "MESSAGE_"],
    server: {
      host: "0.0.0.0",
      port: 5173,
      proxy: {
        "/api": `http://localhost:${apiPort}`,
      },
    },
  };
});
