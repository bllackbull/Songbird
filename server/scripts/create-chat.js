import crypto from "node:crypto";
import { getCliArgs, getFlagValue, hasFlag } from "./_cli.js";
import { openDatabase, runAdminActionViaServer } from "./_db-admin.js";
import { createInviteToken } from "../lib/inviteTokens.js";
import {
  normalizeChatType,
  normalizeVisibility,
  parseListValue,
  resolveUserRow,
  normalizeGroupUsername,
} from "../lib/dbToolHelpers.js";

function normalizeTelegramSource(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;

  // Numeric chat ID
  const numericSource = raw.match(/^-?\d{5,}$/);
  if (numericSource) {
    return { sourceChatId: raw, sourceUsername: "" };
  }

  // URL or username
  let candidate = raw;
  if (/^https?:\/\//i.test(candidate)) {
    try {
      const url = new URL(candidate);
      const host = url.hostname.toLowerCase();
      if (!["t.me", "telegram.me"].includes(host)) {
        return null;
      }
      const parts = url.pathname.split("/").filter(Boolean);
      if (parts[0] === "s") parts.shift();
      candidate = parts[0] || "";
    } catch {
      return null;
    }
  }

  candidate = candidate.replace(/^@+/, "").trim();
  if (!/^[a-zA-Z][a-zA-Z0-9_]{4,31}$/.test(candidate)) {
    return null;
  }

  return { sourceChatId: "", sourceUsername: candidate.toLowerCase() };
}

async function main() {
  const args = getCliArgs();
  const type = normalizeChatType(getFlagValue(args, "--type"));
  const name = String(getFlagValue(args, "--name") || "").trim();
  const ownerSelector = String(getFlagValue(args, "--owner") || "").trim();
  const visibility = normalizeVisibility(getFlagValue(args, "--visibility"));
  const username = normalizeGroupUsername(getFlagValue(args, "--username"));
  const usersValue = getFlagValue(args, "--users");
  const memberSelectors = parseListValue(usersValue);
  const remoteChannelValue = getFlagValue(args, "--remote-channel");
  const syncMetadata = hasFlag(args, "--sync-metadata");
  const streamMedia = hasFlag(args, "--stream-media");

  if (!name || !ownerSelector || !username) {
    console.error(
      'Usage: npm run db:chat:create -- --type group --name "My Group" --owner alice --username my_group [--visibility public|private] [--users bob,charlie]',
    );
    console.error(
      'For channels with Remote Channel: [--remote-channel <telegram-source>] [--sync-metadata] [--stream-media]',
    );
    process.exit(1);
  }

  const remoteResult = await runAdminActionViaServer("create_chat", {
    type,
    name,
    owner: ownerSelector,
    username,
    visibility,
    memberSelectors,
    remoteChannelValue,
    syncMetadata,
    streamMedia,
  });
  if (remoteResult) {
    console.log(
      `Server mode chat created: id=${remoteResult.id} type=${remoteResult.type}`,
    );
    return;
  }

  // Validate Remote Channel configuration if provided
  if (remoteChannelValue) {
    if (type !== "channel") {
      console.error("Remote Channel can only be configured for channels.");
      process.exit(1);
    }

    const remoteChannelEnabled = String(
      process.env.REMOTE_CHANNEL || "false"
    ).toLowerCase() === "true";
    if (!remoteChannelEnabled) {
      console.error(
        "Remote Channel feature is disabled. Configure and enable remote channel first",
      );
      process.exit(1);
    }

    const normalized = normalizeTelegramSource(remoteChannelValue);
    if (!normalized) {
      console.error(
        "Invalid Telegram source. Use a channel username, t.me link, or numeric chat ID.",
      );
      process.exit(1);
    }
  }

  const dbApi = await openDatabase();
  try {
    const owner = resolveUserRow(dbApi, ownerSelector);
    if (!owner?.id) {
      console.error("Owner user not found.");
      process.exit(1);
    }

    const userConflict = dbApi.getRow(
      "SELECT id FROM users WHERE username = ?",
      [username],
    );
    if (userConflict?.id) {
      console.error("Chat username already exists.");
      process.exit(1);
    }
    const chatConflict = dbApi.getRow(
      "SELECT id FROM chats WHERE type IN ('group', 'channel') AND group_username IN (?, ?)",
      [username, `@${username}`],
    );
    if (chatConflict?.id) {
      console.error("Chat username already exists.");
      process.exit(1);
    }

    const ownerUsername = String(owner.username || "").toLowerCase();
    const memberRows = Array.from(
      new Map(
        memberSelectors
          .map((selector) => resolveUserRow(dbApi, selector))
          .filter((row) => row?.id)
          .map((row) => [Number(row.id), row]),
      ).values(),
    ).filter(
      (row) => String(row.username || "").toLowerCase() !== ownerUsername,
    );

    const inviteToken = createInviteToken(crypto);
    const groupColor =
      dbApi.getRow("SELECT color FROM users WHERE id = ?", [Number(owner.id)])
        ?.color || "#10b981";

    dbApi.run("BEGIN");
    let chatId = 0;
    try {
      dbApi.run(
        `INSERT INTO chats (
          name, type, group_username, group_visibility, invite_token, created_by_user_id, group_color, allow_member_invites, group_avatar_url
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          name,
          type,
          username || null,
          visibility,
          inviteToken,
          Number(owner.id),
          groupColor,
          1,
          null,
        ],
      );

      const chatRow = dbApi.getRow(
        `SELECT id, name, type, group_username, group_visibility, created_by_user_id
         FROM chats
         WHERE rowid = last_insert_rowid()`,
      );
      chatId = Number(chatRow?.id || 0);
      if (!chatId) {
        throw new Error("Failed to create chat.");
      }

      dbApi.run(
        "INSERT OR IGNORE INTO chat_members (chat_id, user_id, role) VALUES (?, ?, ?)",
        [chatId, Number(owner.id), "owner"],
      );
      memberRows.forEach((member) => {
        dbApi.run(
          "INSERT OR IGNORE INTO chat_members (chat_id, user_id, role) VALUES (?, ?, ?)",
          [chatId, Number(member.id), "member"],
        );
      });
      dbApi.run("COMMIT");
    } catch (error) {
      dbApi.run("ROLLBACK");
      throw error;
    }

    dbApi.save();
    console.log(`Chat created: id=${chatId} type=${type} name=${name}`);
    console.log(`Owner: ${owner.username}`);
    console.log(`Members added: ${memberRows.length + 1}`);

    // Configure Remote Channel if provided
    if (remoteChannelValue && type === "channel") {
      const normalized = normalizeTelegramSource(remoteChannelValue);
      const sourceRaw = remoteChannelValue;
      const sourceChatId = normalized.sourceChatId || null;
      const sourceUsername = normalized.sourceUsername || null;
      const enabled = 1;
      const syncMeta = syncMetadata ? 1 : 0;
      const streamMed = streamMedia ? 1 : 0;
      const sourceVersion = 1;

      dbApi.run(
        `INSERT INTO remote_channel_sources (
           chat_id, provider, source_raw, source_chat_id, source_username,
           source_version, sync_metadata, stream_media, enabled, last_error, updated_at
         )
         VALUES (?, 'telegram', ?, ?, ?, ?, ?, ?, ?, NULL, datetime('now'))`,
        [
          chatId,
          sourceRaw,
          sourceChatId,
          sourceUsername,
          sourceVersion,
          syncMeta,
          streamMed,
          enabled,
        ],
      );

      dbApi.save();
      console.log(`Remote Channel configured: source=${sourceRaw}`);
      console.log(`Sync metadata: ${syncMetadata ? "yes" : "no"}`);
      console.log(`Stream media: ${streamMedia ? "yes" : "no"}`);
    }
  } finally {
    dbApi.close();
  }
}

main().catch((err) => {
  console.error(err?.message || err);
  process.exit(1);
});
