import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import { getTelegramClientConnectionOptions } from "../lib/remoteChannels.js";

const serverDir = path.dirname(fileURLToPath(import.meta.url));
const projectRootDir = path.resolve(serverDir, "..", "..");
dotenv.config({ path: path.join(projectRootDir, ".env") });
dotenv.config({ path: path.join(path.resolve(serverDir, ".."), ".env"), override: true });

const apiId = Number(process.env.REMOTE_CHANNEL_TELEGRAM_API_ID || 0);
const apiHash = String(process.env.REMOTE_CHANNEL_TELEGRAM_API_HASH || "").trim();
const proxyUrl = String(process.env.REMOTE_CHANNEL_PROXY_URL || "").trim();

if (!apiId || !apiHash) {
  console.error(
    "Set REMOTE_CHANNEL_TELEGRAM_API_ID and REMOTE_CHANNEL_TELEGRAM_API_HASH before generating a session.",
  );
  process.exit(1);
}

const rl = readline.createInterface({ input, output });

try {
  const connectionOptions = getTelegramClientConnectionOptions(proxyUrl, (message) =>
    console.warn(message),
  );
  const client = new TelegramClient(new StringSession(""), apiId, apiHash, {
    connectionRetries: 5,
    ...connectionOptions,
    deviceModel: "Songbird",
    systemVersion: "Songbird Server",
    appVersion: "1.0",
  });

  await client.start({
    phoneNumber: async () => rl.question("Telegram phone number: "),
    phoneCode: async () => rl.question("Login code: "),
    password: async () => rl.question("Two-step password, if enabled: "),
    onError: (error) => {
      console.error(String(error?.message || error));
    },
  });

  console.log("\nREMOTE_CHANNEL_TELEGRAM_SESSION_STRING=");
  console.log(client.session.save());
  await client.disconnect();
} finally {
  rl.close();
}
