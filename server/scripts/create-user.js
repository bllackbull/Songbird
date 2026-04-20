import bcrypt from "bcryptjs";
import { getCliArgs, getPositionalArgs, getFlagValue } from "./_cli.js";
import { openDatabase, runAdminActionViaServer } from "./_db-admin.js";
import { setUserColor } from "../settings/colors.js";

const USERNAME_REGEX = /^[a-z0-9._]+$/;
const clampEnvInt = (value, fallback, { min, max } = {}) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const intValue = Math.trunc(parsed);
  if (min !== undefined && intValue < min) return fallback;
  if (max !== undefined && intValue > max) return fallback;
  return intValue;
};
const USERNAME_MAX = clampEnvInt(process.env.USERNAME_MAX, 16, {
  min: 3,
  max: 32,
});
const NICKNAME_MAX = clampEnvInt(process.env.NICKNAME_MAX, 24, {
  min: 3,
  max: 64,
});

async function main() {
  const args = getCliArgs();
  const positional = getPositionalArgs(args);
  const nickname = getFlagValue(args, "--nickname") || positional[0] || "";
  const username = getFlagValue(args, "--username") || positional[1] || "";
  const password = getFlagValue(args, "--password") || positional[2] || "";

  if (!nickname || !username || !password) {
    console.error(
      'Usage: npm run db:user:create -- --nickname "Display Name" --username your_username --password your_password',
    );
    console.error(
      'Or positional: npm run db:user:create -- "Display Name" your_username your_password',
    );
    process.exit(1);
  }

  if (!USERNAME_REGEX.test(username)) {
    console.error(
      "Invalid username. Allowed: lowercase english letters, numbers, ., _",
    );
    process.exit(1);
  }
  if (username.length < 3) {
    console.error("Username must be at least 3 characters.");
    process.exit(1);
  }
  if (USERNAME_MAX && username.length > USERNAME_MAX) {
    console.error(`Username must be at most ${USERNAME_MAX} characters.`);
    process.exit(1);
  }
  if (nickname.length < 1) {
    console.error("Nickname must not be empty.");
    process.exit(1);
  }
  if (nickname.length > (NICKNAME_MAX || 0)) {
    console.error(`Nickname must be at most ${NICKNAME_MAX} characters.`);
    process.exit(1);
  }

  const remoteResult = await runAdminActionViaServer("create_user", {
    nickname,
    username,
    password,
  });
  if (remoteResult) {
    console.log(
      `Server mode user created: id=${remoteResult.id} username=${remoteResult.username}`,
    );
    // Let the process exit naturally to avoid Node/UV shutdown assertion errors.
    return;
  }

  const dbApi = await openDatabase();
  try {
    const exists = dbApi.getRow("SELECT id FROM users WHERE username = ?", [
      username,
    ]);
    if (exists?.id) {
      console.error(`Username already exists: ${username}`);
      process.exit(1);
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const assignedColor = setUserColor();
    dbApi.run(
      'INSERT INTO users (username, nickname, avatar_url, color, status, password_hash, created_at, last_seen) VALUES (?, ?, NULL, ?, ?, ?, datetime("now"), datetime("now"))',
      [username, nickname, assignedColor, "online", passwordHash],
    );

    const row = dbApi.getRow(
      "SELECT id, username, nickname FROM users WHERE username = ?",
      [username],
    );
    dbApi.save();
    console.log(
      `User created: id=${row.id} username=${row.username} nickname=${row.nickname || ""}`,
    );
  } finally {
    dbApi.close();
  }
}

main().catch((err) => {
  console.error(err?.message || err);
  process.exit(1);
});
