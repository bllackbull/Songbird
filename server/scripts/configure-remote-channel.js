import fs from "node:fs";
import { execFileSync } from "node:child_process";
import readline from "node:readline/promises";
import { argv, stdin as defaultInput, stdout as defaultOutput } from "node:process";
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Logger, TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import {
  getTelegramClientConnectionOptions,
  parseTelegramProxy,
} from "../lib/remoteChannels.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.resolve(scriptDir, "..");
const projectRootDir = path.resolve(serverDir, "..");
const defaultEnvPath = path.join(projectRootDir, ".env");
const envExamplePath = path.join(projectRootDir, ".env.example");

let envPath = defaultEnvPath;
let rl = null;
let ttyInput = null;
let ttyOutput = null;

function trim(value) {
  return String(value || "").trim();
}

function hasOwn(object, key) {
  return Object.hasOwn(object, key);
}

function readFlagValue(args, index, flagName, inlineValue) {
  if (inlineValue !== undefined) return { value: inlineValue, index };
  const next = args[index + 1];
  if (next === undefined || next.startsWith("--")) {
    throw new Error(`${flagName} requires a value.`);
  }
  return { value: next, index: index + 1 };
}

function parseArgs(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const rawArg = args[index];
    const [flagName, inlineValue] = rawArg.includes("=")
      ? rawArg.split(/=(.*)/s, 2)
      : [rawArg, undefined];

    switch (flagName) {
      case "-h":
      case "--help":
        options.help = true;
        break;
      case "--non-interactive":
        options.nonInteractive = true;
        break;
      case "--no-restart":
        options.noRestart = true;
        break;
      case "--force-sms":
        options.forceSms = true;
        break;
      case "--no-proxy":
        options.proxyUrl = "";
        break;
      case "--api-id":
      case "--api-hash":
      case "--proxy-url":
      case "--phone-number":
      case "--phone-code":
      case "--password":
      case "--env-file": {
        const result = readFlagValue(args, index, flagName, inlineValue);
        index = result.index;
        const key = flagName
          .slice(2)
          .replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
        options[key] = result.value;
        break;
      }
      default:
        throw new Error(`Unknown option: ${rawArg}`);
    }
  }
  return options;
}

function printHelp() {
  console.log(`Usage: node server/scripts/configure-remote-channel.js [options]

Options:
  --api-id <id>           Telegram API ID
  --api-hash <hash>       Telegram API hash
  --proxy-url <url>       Optional Telegram proxy URL
  --no-proxy              Clear any existing proxy URL
  --phone-number <phone>  Telegram phone number, including country code
  --phone-code <code>     Telegram login code, if already available
  --password <password>   Telegram two-step password, if enabled
  --force-sms             Ask Telegram to send the login code by SMS
  --env-file <path>       .env file to update (default: project root .env)
  --no-restart            Skip automatic songbird.service restart after saving
  --non-interactive       Fail instead of prompting for missing values
  -h, --help              Show this help

The login code is usually only available after Telegram receives the phone
number. If --phone-code is omitted, this helper asks for it after Telegram sends
the code. After saving, this helper restarts songbird.service when the service
is installed.`);
}

function createPromptInterface() {
  if (rl) return rl;
  let input = defaultInput;
  let output = defaultOutput;

  if (
    !defaultInput.isTTY &&
    process.platform !== "win32" &&
    fs.existsSync("/dev/tty")
  ) {
    ttyInput = fs.createReadStream("/dev/tty");
    ttyOutput = fs.createWriteStream("/dev/tty");
    input = ttyInput;
    output = ttyOutput;
  }

  rl = readline.createInterface({ input, output });
  return rl;
}

async function ask(question) {
  return createPromptInterface().question(question);
}

function requireFlagOrPrompt(options, flagName, label) {
  if (options.nonInteractive) {
    throw new Error(`${label} is required. Pass ${flagName} or run without --non-interactive.`);
  }
}

function formatEnvString(value) {
  return `"${String(value)
    .replace(/\\/g, "\\\\")
    .replace(/\r/g, "\\r")
    .replace(/\n/g, "\\n")
    .replace(/"/g, '\\"')}"`;
}

const REMOTE_CHANNEL_ENV_DEFAULTS = Object.freeze({
  REMOTE_CHANNEL: "false",
  REMOTE_CHANNEL_TELEGRAM_API_ID: "0",
  REMOTE_CHANNEL_TELEGRAM_API_HASH: formatEnvString(""),
  REMOTE_CHANNEL_TELEGRAM_SESSION_STRING: formatEnvString(""),
  REMOTE_CHANNEL_PROXY_URL: formatEnvString(""),
  REMOTE_CHANNEL_POLL_INTERVAL_MS: "5000",
  REMOTE_CHANNEL_TELEGRAM_POLL_LIMIT: "50",
  REMOTE_CHANNEL_QUEUE_INTERVAL_MS: "1000",
  REMOTE_CHANNEL_QUEUE_MAX_ATTEMPTS: "10",
  REMOTE_CHANNEL_QUEUE_BATCH_SIZE: "10",
  REMOTE_CHANNEL_QUEUE_STALE_LOCK_MS: "300000",
});

function readEnvTemplate() {
  if (fs.existsSync(envPath)) {
    return fs.readFileSync(envPath, "utf8");
  }
  if (fs.existsSync(envExamplePath)) {
    return fs.readFileSync(envExamplePath, "utf8");
  }
  return "";
}

function readEnvKeys(content) {
  const keys = new Set();
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    if (match?.[1]) keys.add(match[1]);
  }
  return keys;
}

function upsertEnvValues(content, values) {
  const eol = content.includes("\r\n") ? "\r\n" : "\n";
  const lines = content ? content.split(/\r?\n/) : [];
  if (lines.at(-1) === "") lines.pop();

  const seen = new Set();
  const updatedLines = lines.map((line) => {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    const key = match?.[1];
    if (!key || !Object.hasOwn(values, key)) return line;
    seen.add(key);
    return `${key}=${values[key]}`;
  });

  const missingEntries = Object.entries(values).filter(
    ([key]) => !seen.has(key),
  );
  if (missingEntries.length) {
    if (updatedLines.length && updatedLines.at(-1).trim() !== "") {
      updatedLines.push("");
    }
    for (const [key, value] of missingEntries) {
      updatedLines.push(`${key}=${value}`);
    }
  }

  return `${updatedLines.join(eol)}${eol}`;
}

function appendMissingEnvValues(content, values) {
  const existingKeys = readEnvKeys(content);
  const missingValues = Object.fromEntries(
    Object.entries(values).filter(([key]) => !existingKeys.has(key)),
  );

  if (!Object.keys(missingValues).length) return content;
  return upsertEnvValues(content, missingValues);
}

function writeRemoteChannelEnv({ apiId, apiHash, proxyUrl, sessionString }) {
  const configuredContent = upsertEnvValues(readEnvTemplate(), {
    REMOTE_CHANNEL: "true",
    REMOTE_CHANNEL_TELEGRAM_API_ID: String(apiId),
    REMOTE_CHANNEL_TELEGRAM_API_HASH: formatEnvString(apiHash),
    REMOTE_CHANNEL_TELEGRAM_SESSION_STRING: formatEnvString(sessionString),
    REMOTE_CHANNEL_PROXY_URL: formatEnvString(proxyUrl),
  });
  const nextContent = appendMissingEnvValues(
    configuredContent,
    REMOTE_CHANNEL_ENV_DEFAULTS,
  );
  fs.writeFileSync(envPath, nextContent, "utf8");
}

function commandExists(command) {
  try {
    execFileSync(command, ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function systemdServiceExists(serviceName) {
  if (!commandExists("systemctl")) return false;

  try {
    const loadState = execFileSync(
      "systemctl",
      ["show", serviceName, "--property=LoadState", "--value"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    ).trim();
    return Boolean(loadState && loadState !== "not-found");
  } catch {
    return false;
  }
}

function restartSongbirdService(options) {
  if (options.noRestart) {
    console.log("Songbird restart skipped because --no-restart was passed.");
    return;
  }

  const serviceName = "songbird.service";
  if (!systemdServiceExists(serviceName)) {
    console.warn(`${serviceName} not found; restart skipped.`);
    return;
  }

  const isRoot = typeof process.getuid === "function" && process.getuid() === 0;
  const command = isRoot || !commandExists("sudo") ? "systemctl" : "sudo";
  const args = isRoot || command === "systemctl"
    ? ["restart", serviceName]
    : ["systemctl", "restart", serviceName];

  console.log(`Restarting ${serviceName}...`);
  try {
    execFileSync(command, args, { stdio: "inherit" });
  } catch {
    throw new Error(
      `Remote Channel configuration was saved, but restarting ${serviceName} failed. Run "sudo systemctl restart ${serviceName}" manually.`,
    );
  }
  console.log("Songbird restarted successfully.");
}

function formatExistingHint(value) {
  return value ? " (press Enter to keep existing)" : "";
}

function getExistingApiId(value) {
  const apiId = Number(value);
  return Number.isInteger(apiId) && apiId > 0 ? String(apiId) : "";
}

async function promptTelegramApiId(currentValue) {
  while (true) {
    const suffix = currentValue ? ` [${currentValue}]` : "";
    const answer = await ask(`Telegram API ID${suffix}: `);
    const value = trim(answer) || trim(currentValue);
    const apiId = Number(value);
    if (Number.isInteger(apiId) && apiId > 0) return apiId;
    console.log("Enter a positive numeric Telegram API ID.");
  }
}

async function promptRequiredSecret(label, currentValue) {
  while (true) {
    const answer = await ask(`${label}${formatExistingHint(currentValue)}: `);
    const value = trim(answer) || trim(currentValue);
    if (value) return value;
    console.log(`${label} is required.`);
  }
}

async function promptProxyUrl(currentValue) {
  const current = trim(currentValue);
  while (true) {
    const suffix = current
      ? " (optional; type none to clear, press Enter to keep existing)"
      : " (optional)";
    const answer = await ask(`Telegram proxy URL${suffix}: `);
    let value = trim(answer);
    if (!value && current) value = current;
    if (/^(none|no|direct)$/i.test(value)) value = "";
    if (!value) return "";

    const messages = [];
    if (parseTelegramProxy(value, (message) => messages.push(message))) {
      return value;
    }

    const message =
      messages.at(-1) ||
      "Proxy URL must use http://, https://, socks4://, socks5://, or mtproxy:// with host and port.";
    console.log(message.replace(/^\[remote-channel\]\s*/i, ""));
  }
}

async function promptRequiredLoginValue(label) {
  while (true) {
    const value = trim(await ask(label));
    if (value) return value;
    console.log("This value is required.");
  }
}

function validateApiId(value) {
  const apiId = Number(value);
  if (Number.isInteger(apiId) && apiId > 0) return apiId;
  throw new Error("Telegram API ID must be a positive integer.");
}

function validateProxyUrl(value) {
  const proxyUrl = trim(value);
  if (!proxyUrl) return "";
  const messages = [];
  if (parseTelegramProxy(proxyUrl, (message) => messages.push(message))) {
    return proxyUrl;
  }
  const message =
    messages.at(-1) ||
    "Proxy URL must use http://, https://, socks4://, socks5://, or mtproxy:// with host and port.";
  throw new Error(message.replace(/^\[remote-channel\]\s*/i, ""));
}

async function resolveApiId(options) {
  if (hasOwn(options, "apiId")) return validateApiId(options.apiId);

  const currentValue = getExistingApiId(
    process.env.REMOTE_CHANNEL_TELEGRAM_API_ID,
  );
  if (options.nonInteractive && currentValue) return validateApiId(currentValue);

  requireFlagOrPrompt(options, "--api-id", "Telegram API ID");
  return promptTelegramApiId(currentValue);
}

async function resolveApiHash(options) {
  if (hasOwn(options, "apiHash")) {
    const apiHash = trim(options.apiHash);
    if (apiHash) return apiHash;
    throw new Error("Telegram API hash cannot be empty.");
  }

  const currentValue = trim(process.env.REMOTE_CHANNEL_TELEGRAM_API_HASH);
  if (options.nonInteractive && currentValue) return currentValue;

  requireFlagOrPrompt(options, "--api-hash", "Telegram API hash");
  return promptRequiredSecret("Telegram API hash", currentValue);
}

async function resolveProxyUrl(options) {
  if (hasOwn(options, "proxyUrl")) return validateProxyUrl(options.proxyUrl);

  const currentValue = trim(process.env.REMOTE_CHANNEL_PROXY_URL);
  if (options.nonInteractive) return validateProxyUrl(currentValue);

  return promptProxyUrl(currentValue);
}

async function resolvePhoneNumber(options) {
  if (hasOwn(options, "phoneNumber")) {
    const phoneNumber = trim(options.phoneNumber);
    if (phoneNumber) return phoneNumber;
    throw new Error("Telegram phone number cannot be empty.");
  }

  requireFlagOrPrompt(options, "--phone-number", "Telegram phone number");
  return promptRequiredLoginValue("Telegram phone number: ");
}

async function resolvePhoneCode(options, isCodeViaApp) {
  if (hasOwn(options, "phoneCode")) {
    const phoneCode = trim(options.phoneCode);
    if (phoneCode) return phoneCode;
    throw new Error("Telegram login code cannot be empty.");
  }

  requireFlagOrPrompt(options, "--phone-code", "Telegram login code");
  const delivery = isCodeViaApp ? "Telegram app" : "SMS";
  return promptRequiredLoginValue(`Login code from ${delivery}: `);
}

async function resolveTwoStepPassword(options) {
  if (hasOwn(options, "password")) return String(options.password || "");

  requireFlagOrPrompt(options, "--password", "Telegram two-step password");
  return ask("Two-step password, if enabled: ");
}

let client = null;

try {
  const options = parseArgs(argv.slice(2));
  if (options.help) {
    printHelp();
    process.exit(0);
  }

  envPath = options.envFile ? path.resolve(options.envFile) : defaultEnvPath;
  dotenv.config({ path: envPath, override: true });
  dotenv.config({ path: path.join(serverDir, ".env"), override: true });

  console.log("Songbird Remote Channel configuration");
  console.log(
    "Create Telegram credentials at https://my.telegram.org/apps first.\n",
  );

  const apiId = await resolveApiId(options);
  const apiHash = await resolveApiHash(options);
  const proxyUrl = await resolveProxyUrl(options);
  const phoneNumber = await resolvePhoneNumber(options);

  const connectionOptions = getTelegramClientConnectionOptions(
    proxyUrl,
    (message) => console.warn(message),
  );
  client = new TelegramClient(new StringSession(""), apiId, apiHash, {
    baseLogger: new Logger("none"),
    connectionRetries: 3,
    requestRetries: 2,
    reconnectRetries: 0,
    retryDelay: 1000,
    autoReconnect: false,
    ...connectionOptions,
    deviceModel: "Songbird",
    systemVersion: "Songbird Server",
    appVersion: "1.0",
  });

  console.log(
    "\nSigning in to Telegram. Use a dedicated Telegram account if possible.",
  );
  await client.start({
    phoneNumber: async () => phoneNumber,
    phoneCode: async (isCodeViaApp) => resolvePhoneCode(options, isCodeViaApp),
    password: async () => resolveTwoStepPassword(options),
    forceSMS: Boolean(options.forceSms),
    onError: (error) => {
      console.error(String(error?.message || error));
      return Boolean(
        options.nonInteractive ||
          hasOwn(options, "phoneCode") ||
          hasOwn(options, "password"),
      );
    },
  });

  const sessionString = client.session.save();
  if (!sessionString) {
    throw new Error("Telegram did not return a session string.");
  }

  writeRemoteChannelEnv({ apiId, apiHash, proxyUrl, sessionString });

  const displayPath = path.relative(process.cwd(), envPath) || envPath;
  console.log(`\nRemote Channel configuration saved to ${displayPath}.`);
  console.log(
    "Keep the Telegram session private. It authorizes Songbird to read channels visible to this Telegram account.",
  );
  restartSongbirdService(options);
} catch (error) {
  console.error(
    `\nRemote Channel configuration failed: ${String(error?.message || error)}`,
  );
  process.exitCode = 1;
} finally {
  if (client) {
    const stopClient =
      typeof client.destroy === "function"
        ? () => client.destroy()
        : () => client.disconnect();
    await stopClient().catch(() => {});
  }
  rl?.close();
  ttyInput?.destroy();
  ttyOutput?.destroy();
}
