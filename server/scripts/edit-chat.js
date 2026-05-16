import {
  getCliArgs,
  getPositionalArgs,
  getFlagValue,
  hasFlag,
} from "./_cli.js";
import { openDatabase, runAdminActionViaServer } from "./_db-admin.js";
import {
  normalizeHexColor,
  normalizeGroupUsername,
  normalizeVisibility,
  resolveChatRow,
  resolveUserRow,
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
  const positional = getPositionalArgs(args);
  const chatSelector = String(positional[0] || "").trim();
  const nameValue = getFlagValue(args, "--name");
  const usernameValue = getFlagValue(args, "--username");
  const visibilityValue = getFlagValue(args, "--visibility");
  const colorValue = getFlagValue(args, "--color");
  const ownerValue = getFlagValue(args, "--owner");
  const allowMemberInvites = hasFlag(args, "--allow-member-invites")
    ? true
    : hasFlag(args, "--disallow-member-invites")
      ? false
      : null;
  const remoteChannelValue = getFlagValue(args, "--remote-channel");
  const syncMetadata = hasFlag(args, "--sync-metadata");
  const noSyncMetadata = hasFlag(args, "--no-sync-metadata");
  const streamMedia = hasFlag(args, "--stream-media");
  const noStreamMedia = hasFlag(args, "--no-stream-media");
  const enableRemote = hasFlag(args, "--enable-remote");
  const disableRemote = hasFlag(args, "--disable-remote");
  const pauseQueue = hasFlag(args, "--pause-queue");
  const resumeQueue = hasFlag(args, "--resume-queue");
  const skipQueue = hasFlag(args, "--skip-queue");
  const skipAllQueue = hasFlag(args, "--skip-all-queue");
  const testRemote = hasFlag(args, "--test-remote");

  if (!chatSelector) {
    console.error(
      'Usage: npm run db:chat:edit -- <chat-id-or-username> [--name "New name"] [--username new_handle] [--visibility public|private] [--color #10b981] [--owner alice]',
    );
    console.error(
      'Remote Channel: [--remote-channel <telegram-source>] [--sync-metadata | --no-sync-metadata] [--stream-media | --no-stream-media]',
    );
    console.error(
      'Remote Channel Control: [--enable-remote | --disable-remote] [--pause-queue | --resume-queue] [--skip-queue | --skip-all-queue] [--test-remote]',
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

  // Handle remote channel configuration
  if (remoteChannelValue || syncMetadata || noSyncMetadata || streamMedia || noStreamMedia || enableRemote || disableRemote || pauseQueue || resumeQueue || skipQueue || skipAllQueue || testRemote) {
    const payload = {
      chatSelector,
      remoteChannelValue,
      syncMetadata: syncMetadata ? true : noSyncMetadata ? false : null,
      streamMedia: streamMedia ? true : noStreamMedia ? false : null,
      enableRemote,
      disableRemote,
      pauseQueue,
      resumeQueue,
      skipQueue,
      skipAllQueue,
      testRemote,
    };

    const remoteResult = await runAdminActionViaServer("edit_remote_channel", payload);
    if (remoteResult) {
      console.log(
        `Server mode remote channel updated: chat=${remoteResult.chatId}`,
      );
      return;
    }

    const dbApi = await openDatabase();
    try {
      const chat = resolveChatRow(dbApi, chatSelector);
      if (!chat?.id) {
        console.error("Chat not found. Use a group/channel id or username.");
        process.exit(1);
      }

      if (chat.type !== "channel") {
        console.error("Remote Channel can only be configured for channels.");
        process.exit(1);
      }

      const remoteChannelEnabled = String(
        process.env.REMOTE_CHANNEL || "false"
      ).toLowerCase() === "true";
      if (!remoteChannelEnabled) {
        console.error(
          "Remote Channel feature is disabled. Configure and enable remote channel first.",
        );
        process.exit(1);
      }

      const existing = dbApi.getRow(
        "SELECT id, source_raw, source_chat_id, source_username, sync_metadata, stream_media, enabled, paused FROM remote_channel_sources WHERE chat_id = ?",
        [Number(chat.id)],
      );

      if (!existing?.id && (syncMetadata || noSyncMetadata || streamMedia || noStreamMedia || enableRemote || disableRemote || pauseQueue || resumeQueue || skipQueue || skipAllQueue || testRemote)) {
        console.error(
          `No Remote Channel configured for chat: id=${chat.id}. Configure it during channel creation with db:chat:create.`,
        );
        process.exit(1);
      }

      // Handle queue management actions
      if (pauseQueue) {
        dbApi.run(
          "UPDATE remote_channel_sources SET paused = 1, updated_at = datetime('now') WHERE chat_id = ?",
          [Number(chat.id)],
        );
        dbApi.save();
        console.log(`Remote Channel queue paused for chat: id=${chat.id}`);
        return;
      }

      if (resumeQueue) {
        dbApi.run(
          "UPDATE remote_channel_sources SET paused = 0, updated_at = datetime('now') WHERE chat_id = ?",
          [Number(chat.id)],
        );
        dbApi.save();
        console.log(`Remote Channel queue resumed for chat: id=${chat.id}`);
        return;
      }

      if (skipQueue) {
        const skipped = dbApi.run(
          `UPDATE remote_channel_queue
           SET status = 'skipped',
               locked_at = NULL,
               lock_owner = NULL,
               last_error = 'Manually skipped via CLI.',
               processed_at = datetime('now')
           WHERE id = (
             SELECT id FROM remote_channel_queue
             WHERE source_id = ?
               AND status IN ('pending', 'retry', 'processing')
             ORDER BY id ASC
             LIMIT 1
           )`,
          [Number(existing.id)],
        );
        dbApi.save();
        console.log(
          skipped > 0
            ? `Skipped current queue item for chat: id=${chat.id}`
            : `No queue items to skip for chat: id=${chat.id}`,
        );
        return;
      }

      if (skipAllQueue) {
        const skipped = dbApi.run(
          `UPDATE remote_channel_queue
           SET status = 'skipped',
               locked_at = NULL,
               lock_owner = NULL,
               last_error = 'Manually skipped via CLI.',
               processed_at = datetime('now')
           WHERE source_id = ?
             AND status IN ('pending', 'retry')`,
          [Number(existing.id)],
        );
        dbApi.save();
        console.log(`Skipped ${skipped} queue items for chat: id=${chat.id}`);
        return;
      }

      if (testRemote) {
        console.error(
          "Test connection is not available in CLI mode. Use the web UI or API to test the connection.",
        );
        process.exit(1);
      }

      if (disableRemote) {
        if (existing?.id) {
          dbApi.run(
            "UPDATE remote_channel_sources SET enabled = 0, updated_at = datetime('now') WHERE chat_id = ?",
            [Number(chat.id)],
          );
          dbApi.save();
          console.log(`Remote Channel disabled for chat: id=${chat.id}`);
        } else {
          console.log(`No Remote Channel configured for chat: id=${chat.id}`);
        }
        return;
      }

      if (enableRemote) {
        if (existing?.id) {
          dbApi.run(
            "UPDATE remote_channel_sources SET enabled = 1, updated_at = datetime('now') WHERE chat_id = ?",
            [Number(chat.id)],
          );
          dbApi.save();
          console.log(`Remote Channel enabled for chat: id=${chat.id}`);
        } else {
          console.error(
            `No Remote Channel configured for chat: id=${chat.id}. Configure it during channel creation with db:chat:create.`,
          );
          process.exit(1);
        }
        return;
      }

      let sourceRaw = existing?.source_raw || null;
      let sourceChatId = existing?.source_chat_id || null;
      let sourceUsername = existing?.source_username || null;
      let sourceVersion = Math.max(1, Number(existing?.source_version || 1) || 1);

      if (remoteChannelValue) {
        const normalized = normalizeTelegramSource(remoteChannelValue);
        if (!normalized) {
          console.error(
            "Invalid Telegram source. Use a channel username, t.me link, or numeric chat ID.",
          );
          process.exit(1);
        }

        const sourceChanged = Boolean(
          existing?.id &&
            (String(existing.source_raw || "") !== String(remoteChannelValue || "") ||
              String(existing.source_chat_id || "") !== String(normalized.sourceChatId || "") ||
              String(existing.source_username || "") !== String(normalized.sourceUsername || ""))
        );

        sourceRaw = remoteChannelValue;
        sourceChatId = normalized.sourceChatId || null;
        sourceUsername = normalized.sourceUsername || null;
        if (sourceChanged) {
          sourceVersion += 1;
        }
      }

      const nextSyncMetadata = syncMetadata
        ? 1
        : noSyncMetadata
          ? 0
          : Number(existing?.sync_metadata || 0);
      const nextStreamMedia = streamMedia
        ? 1
        : noStreamMedia
          ? 0
          : Number(existing?.stream_media || 0);
      const nextEnabled = Number(existing?.enabled || 1);

      if (remoteChannelValue) {
        dbApi.run(
          `INSERT INTO remote_channel_sources (
             chat_id, provider, source_raw, source_chat_id, source_username,
             source_version, sync_metadata, stream_media, enabled, last_error, updated_at
           )
           VALUES (?, 'telegram', ?, ?, ?, ?, ?, ?, ?, NULL, datetime('now'))
           ON CONFLICT(chat_id) DO UPDATE SET
             provider = excluded.provider,
             source_title = CASE
               WHEN COALESCE(remote_channel_sources.source_raw, '') != COALESCE(excluded.source_raw, '')
                 OR COALESCE(remote_channel_sources.source_chat_id, '') != COALESCE(excluded.source_chat_id, '')
                 OR COALESCE(remote_channel_sources.source_username, '') != COALESCE(excluded.source_username, '')
               THEN NULL
               ELSE remote_channel_sources.source_title
             END,
             source_avatar_url = CASE
               WHEN COALESCE(remote_channel_sources.source_raw, '') != COALESCE(excluded.source_raw, '')
                 OR COALESCE(remote_channel_sources.source_chat_id, '') != COALESCE(excluded.source_chat_id, '')
                 OR COALESCE(remote_channel_sources.source_username, '') != COALESCE(excluded.source_username, '')
               THEN NULL
               ELSE remote_channel_sources.source_avatar_url
             END,
             last_remote_message_id = CASE
               WHEN COALESCE(remote_channel_sources.source_raw, '') != COALESCE(excluded.source_raw, '')
                 OR COALESCE(remote_channel_sources.source_chat_id, '') != COALESCE(excluded.source_chat_id, '')
                 OR COALESCE(remote_channel_sources.source_username, '') != COALESCE(excluded.source_username, '')
               THEN NULL
               ELSE remote_channel_sources.last_remote_message_id
             END,
             source_raw = excluded.source_raw,
             source_chat_id = excluded.source_chat_id,
             source_username = excluded.source_username,
             source_version = excluded.source_version,
             sync_metadata = excluded.sync_metadata,
             stream_media = excluded.stream_media,
             enabled = excluded.enabled,
             last_error = NULL,
             updated_at = datetime('now')`,
          [
            Number(chat.id),
            sourceRaw,
            sourceChatId,
            sourceUsername,
            sourceVersion,
            nextSyncMetadata,
            nextStreamMedia,
            nextEnabled,
          ],
        );

        if (existing?.id && sourceVersion > Number(existing.source_version || 1)) {
          dbApi.run(
            `UPDATE remote_channel_queue
             SET status = 'skipped',
                 locked_at = NULL,
                 lock_owner = NULL,
                 last_error = 'Remote source changed before this item was mirrored.',
                 processed_at = datetime('now')
             WHERE source_id = ?
               AND status IN ('pending', 'retry', 'processing')`,
            [Number(existing.id)],
          );
        }
      } else {
        // Only update flags
        dbApi.run(
          "UPDATE remote_channel_sources SET sync_metadata = ?, stream_media = ?, updated_at = datetime('now') WHERE chat_id = ?",
          [nextSyncMetadata, nextStreamMedia, Number(chat.id)],
        );
      }

      dbApi.save();
      console.log(`Remote Channel updated: chat=${chat.id}`);
      if (remoteChannelValue) {
        console.log(`Source: ${sourceRaw}`);
      }
      console.log(`Sync metadata: ${nextSyncMetadata ? "yes" : "no"}`);
      console.log(`Stream media: ${nextStreamMedia ? "yes" : "no"}`);
    } finally {
      dbApi.close();
    }
    return;
  }

  const payload = {
    chatSelector,
    name: nameValue == null ? undefined : String(nameValue),
    username:
      usernameValue == null
        ? undefined
        : normalizeGroupUsername(usernameValue),
    visibility:
      visibilityValue == null
        ? undefined
        : normalizeVisibility(visibilityValue),
    color: normalizedColor,
    owner: ownerValue == null ? undefined : String(ownerValue).trim(),
    allowMemberInvites,
  };

  const remoteResult = await runAdminActionViaServer("edit_chat", payload);
  if (remoteResult) {
    console.log(
      `Server mode chat updated: id=${remoteResult.id} type=${remoteResult.type}`,
    );
    return;
  }

  const dbApi = await openDatabase();
  try {
    const chat = resolveChatRow(dbApi, chatSelector);
    if (!chat?.id) {
      console.error("Chat not found. Use a group/channel id or username.");
      process.exit(1);
    }

    const nextName =
      nameValue == null
        ? String(chat.name || "")
        : String(nameValue || "").trim();
    const nextUsername =
      usernameValue == null
        ? String(chat.group_username || "").replace(/^@+/, "")
        : normalizeGroupUsername(usernameValue);
    const nextVisibility =
      visibilityValue == null
        ? String(chat.group_visibility || "public").toLowerCase()
        : normalizeVisibility(visibilityValue);
    const nextColor =
      normalizedColor || String(chat.group_color || "").trim() || null;
    const effectiveVisibility =
      nextVisibility === "private" ? "private" : "public";
    if (
      effectiveVisibility !== "private" &&
      allowMemberInvites !== null &&
      allowMemberInvites !== true
    ) {
      console.error(
        "Member invites can only be changed for private chats. Public chats always allow member invites.",
      );
      process.exit(1);
    }
    const nextAllowMemberInvites =
      effectiveVisibility === "private"
        ? allowMemberInvites === null
          ? Number(chat.allow_member_invites || 0)
            ? 1
            : 0
          : allowMemberInvites
            ? 1
            : 0
        : 1;

    if (nextUsername) {
      const userConflict = dbApi.getRow(
        "SELECT id FROM users WHERE username = ?",
        [nextUsername],
      );
      if (userConflict?.id) {
        console.error("Chat username already exists.");
        process.exit(1);
      }
      const chatConflict = dbApi.getRow(
        "SELECT id FROM chats WHERE type IN ('group', 'channel') AND group_username IN (?, ?) AND id != ?",
        [nextUsername, `@${nextUsername}`, Number(chat.id)],
      );
      if (chatConflict?.id) {
        console.error("Chat username already exists.");
        process.exit(1);
      }
    }

    let nextOwner = null;
    if (ownerValue != null) {
      nextOwner = resolveUserRow(dbApi, ownerValue);
      if (!nextOwner?.id) {
        console.error("New owner user not found.");
        process.exit(1);
      }
    }

    dbApi.run(
      `UPDATE chats
       SET name = ?, group_username = ?, group_visibility = ?, group_color = ?, allow_member_invites = ?, created_by_user_id = COALESCE(?, created_by_user_id)
       WHERE id = ? AND type IN ('group', 'channel')`,
      [
        nextName || null,
        nextUsername || null,
        nextVisibility,
        nextColor,
        nextAllowMemberInvites,
        nextOwner?.id ? Number(nextOwner.id) : null,
        Number(chat.id),
      ],
    );

    if (nextOwner?.id) {
      dbApi.run(
        "UPDATE chat_members SET role = 'member' WHERE chat_id = ? AND role = 'owner'",
        [Number(chat.id)],
      );
      dbApi.run(
        "INSERT OR IGNORE INTO chat_members (chat_id, user_id, role) VALUES (?, ?, 'owner')",
        [Number(chat.id), Number(nextOwner.id)],
      );
      dbApi.run(
        "UPDATE chat_members SET role = 'owner' WHERE chat_id = ? AND user_id = ?",
        [Number(chat.id), Number(nextOwner.id)],
      );
    }

    dbApi.save();
    const updated = resolveChatRow(dbApi, String(chat.id));
    console.log(
      `Chat updated: id=${updated.id} type=${updated.type} name=${updated.name || ""}`,
    );
    if (nextOwner?.username) {
      console.log(`Owner changed to: ${nextOwner.username}`);
    }
  } finally {
    dbApi.close();
  }
}

main().catch((err) => {
  console.error(err?.message || err);
  process.exit(1);
});
