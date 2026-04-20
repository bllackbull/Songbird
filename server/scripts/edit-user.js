import { getCliArgs, getPositionalArgs, getFlagValue } from "./_cli.js";
import { openDatabase, runAdminActionViaServer } from "./_db-admin.js";
import { normalizeHexColor, resolveUserRow } from "../lib/dbToolHelpers.js";

const USERNAME_REGEX = /^[a-z0-9._]+$/;
const ALLOWED_STATUSES = new Set(["online", "invisible"]);

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
  const userSelector = String(positional[0] || "").trim();
  const usernameValue = getFlagValue(args, "--username");
  const nicknameValue = getFlagValue(args, "--nickname");
  const avatarUrlValue = getFlagValue(args, "--avatar-url");
  const statusValue = getFlagValue(args, "--status");
  const colorValue = getFlagValue(args, "--color");

  if (!userSelector) {
    console.error(
      'Usage: npm run db:user:edit -- <user-id-or-username> [--username new_username] [--nickname "Display Name"] [--avatar-url /api/uploads/avatars/file.png] [--status online|invisible] [--color #10b981]',
    );
    process.exit(1);
  }

  const normalizedColor = colorValue
    ? normalizeHexColor(colorValue)
    : undefined;
  if (colorValue && !normalizedColor) {
    console.error("Invalid color. Use a hex color like #10b981.");
    process.exit(1);
  }

  const nextStatus =
    statusValue === null
      ? undefined
      : String(statusValue || "")
          .trim()
          .toLowerCase();
  if (nextStatus !== undefined && !ALLOWED_STATUSES.has(nextStatus)) {
    console.error("Invalid status. Allowed: online, invisible.");
    process.exit(1);
  }

  const remoteResult = await runAdminActionViaServer("edit_user", {
    userSelector,
    username: usernameValue === null ? undefined : usernameValue,
    nickname: nicknameValue === null ? undefined : nicknameValue,
    avatarUrl: avatarUrlValue === null ? undefined : avatarUrlValue,
    status: nextStatus,
    color: normalizedColor,
  });
  if (remoteResult) {
    console.log(
      `Server mode user updated: id=${remoteResult.id} username=${remoteResult.username}`,
    );
    return;
  }

  const dbApi = await openDatabase();
  try {
    const user = resolveUserRow(dbApi, userSelector);
    if (!user?.id) {
      console.error("User not found.");
      process.exit(1);
    }

    const nextUsername =
      usernameValue === null
        ? String(user.username || "")
        : String(usernameValue || "")
            .trim()
            .toLowerCase();
    const nextNickname =
      nicknameValue === null
        ? user.nickname
        : String(nicknameValue || "").trim() || null;
    const nextAvatarUrl =
      avatarUrlValue === null
        ? user.avatar_url
        : String(avatarUrlValue || "").trim() || null;
    const nextColor =
      normalizedColor || String(user.color || "").trim() || null;
    const effectiveStatus =
      nextStatus === undefined
        ? String(user.status || "online").toLowerCase()
        : nextStatus;

    if (nextUsername.length < 3) {
      console.error("Username must be at least 3 characters.");
      process.exit(1);
    }
    if (USERNAME_MAX && nextUsername.length > USERNAME_MAX) {
      console.error(`Username must be at most ${USERNAME_MAX} characters.`);
      process.exit(1);
    }
    if (!USERNAME_REGEX.test(nextUsername)) {
      console.error(
        "Invalid username. Allowed: lowercase english letters, numbers, ., _",
      );
      process.exit(1);
    }
    if (nextNickname && nextNickname.length > (NICKNAME_MAX || 0)) {
      console.error(`Nickname must be at most ${NICKNAME_MAX} characters.`);
      process.exit(1);
    }

    if (nextUsername !== String(user.username || "").toLowerCase()) {
      const userConflict = dbApi.getRow(
        "SELECT id FROM users WHERE username = ?",
        [nextUsername],
      );
      if (userConflict?.id) {
        console.error("Username already exists.");
        process.exit(1);
      }
      const chatConflict = dbApi.getRow(
        "SELECT id FROM chats WHERE type IN ('group', 'channel') AND group_username IN (?, ?)",
        [nextUsername, `@${nextUsername}`],
      );
      if (chatConflict?.id) {
        console.error("Username already exists.");
        process.exit(1);
      }
    }

    dbApi.run(
      "UPDATE users SET username = ?, nickname = ?, avatar_url = ?, color = ?, status = ? WHERE id = ?",
      [
        nextUsername,
        nextNickname,
        nextAvatarUrl,
        nextColor,
        effectiveStatus,
        Number(user.id),
      ],
    );
    dbApi.save();

    const updated = resolveUserRow(dbApi, String(user.id));
    console.log(`User updated: id=${updated.id} username=${updated.username}`);
    console.log(`Nickname: ${updated.nickname || ""}`);
    console.log(`Color: ${updated.color || ""}`);
  } finally {
    dbApi.close();
  }
}

main().catch((err) => {
  console.error(err?.message || err);
  process.exit(1);
});
