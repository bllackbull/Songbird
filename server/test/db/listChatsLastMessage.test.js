import { describe, expect, test, beforeEach, afterEach } from "vitest";
import crypto from "node:crypto";
import { createTestDb } from "./testDbHelper.js";
import { storageEncryption } from "../../lib/storageEncryption.js";
import {
  listChatsForUser,
  createMessage,
  editMessage,
  hideMessageForEveryone,
} from "../../db.js";

describe("listChatsForUser last_message ordering and update regression", () => {
  let db = null;

  beforeEach(async () => {
    db = await createTestDb();
  });

  afterEach(() => {
    if (db) {
      try {
        db.close();
      } catch {}
      db = null;
    }
  });

  function queryListChatsForUser(userId) {
    const rawRows = db.getAll(
      `
      WITH member_chats AS (
        SELECT
          c.id,
          c.name,
          c.type,
          c.group_username,
          c.group_visibility,
          c.invite_token,
          c.group_color,
          c.allow_member_invites,
          c.group_avatar_url,
          c.created_by_user_id,
          c.created_at,
          c.verified,
          COALESCE(mu.muted, 0) AS muted
        FROM chats c
        JOIN chat_members m ON m.chat_id = c.id
        LEFT JOIN chat_mutes mu ON mu.chat_id = c.id AND mu.user_id = m.user_id
        LEFT JOIN hidden_chats h ON h.chat_id = c.id AND h.user_id = m.user_id
        WHERE m.user_id = ?
          AND h.chat_id IS NULL
      )
      SELECT
        mc.id,
        mc.name,
        mc.type,
        mc.group_username,
        mc.group_visibility,
        mc.invite_token,
        mc.group_color,
        mc.allow_member_invites,
        mc.group_avatar_url,
        mc.created_by_user_id,
        mc.verified,
        mc.muted,
        COALESCE(rcs.enabled, 0) AS remote_channel_enabled,
        last_vm.id AS last_message_id,
        COALESCE(last_vm.edited_body, last_vm.body) AS last_message,
        last_vm.created_at AS last_time,
        last_vm.user_id AS last_sender_id,
        last_vm.client_request_id AS last_message_client_request_id,
        CASE
          WHEN last_vm.id IS NULL THEN NULL
          ELSE COALESCE(last_user.username, 'deleted')
        END AS last_sender_username,
        CASE
          WHEN last_vm.id IS NULL THEN NULL
          ELSE COALESCE(last_user.nickname, 'Deleted user')
        END AS last_sender_nickname,
        last_user.avatar_url AS last_sender_avatar_url,
        last_vm.read_at AS last_message_read_at,
        last_vm.read_by_user_id AS last_message_read_by_user_id,
        outgoing_vm.created_at AS last_outgoing_time
      FROM member_chats mc
      LEFT JOIN chat_messages last_vm ON last_vm.id = (
        SELECT last_cm.id
        FROM chat_messages last_cm
        WHERE last_cm.chat_id = mc.id
          AND last_cm.body NOT LIKE '[[system:%]]'
          AND last_cm.hidden_everyone_at IS NULL
          AND NOT EXISTS (
            SELECT 1
            FROM hidden_chat_messages last_hcm
            WHERE last_hcm.user_id = ?
              AND last_hcm.message_id = last_cm.id
          )
        ORDER BY last_cm.created_at DESC, last_cm.id DESC
        LIMIT 1
      )
      LEFT JOIN users last_user ON last_user.id = last_vm.user_id
      LEFT JOIN chat_messages outgoing_vm ON outgoing_vm.id = (
        SELECT outgoing_cm.id
        FROM chat_messages outgoing_cm
        WHERE outgoing_cm.chat_id = mc.id
          AND outgoing_cm.user_id = ?
          AND NOT (LOWER(COALESCE(outgoing_cm.client_request_id, '')) LIKE 'remote:%')
          AND outgoing_cm.body NOT LIKE '[[system:%]]'
          AND outgoing_cm.hidden_everyone_at IS NULL
          AND NOT EXISTS (
            SELECT 1
            FROM hidden_chat_messages outgoing_hcm
            WHERE outgoing_hcm.user_id = ?
              AND outgoing_hcm.message_id = outgoing_cm.id
          )
        ORDER BY outgoing_cm.created_at DESC, outgoing_cm.id DESC
        LIMIT 1
      )
      LEFT JOIN remote_channel_sources rcs ON rcs.chat_id = mc.id AND rcs.enabled = 1
      ORDER BY last_vm.created_at DESC, last_vm.id DESC, mc.created_at DESC
    `,
      [userId, userId, userId, userId],
    );

    return (rawRows || []).map((row) => {
      const next = { ...row };
      if (typeof next.edited_body === "string") {
        next.edited_body = storageEncryption.decryptText(next.edited_body);
      }
      if (typeof next.body === "string") {
        next.body = storageEncryption.decryptText(next.body);
      }
      if (typeof next.last_message === "string") {
        next.last_message = storageEncryption.decryptText(next.last_message);
      }
      return next;
    });
  }

  test("listChatsForUser selects latest message chronologically even when newer message has lexicographically smaller UUID", () => {
    const userId = crypto.randomUUID();
    const chatId = crypto.randomUUID();

    db.run("INSERT INTO users (id, username, password_hash) VALUES (?, ?, ?)", [
      userId,
      "alice",
      "hash",
    ]);
    db.run(
      "INSERT INTO chats (id, name, type, created_by_user_id) VALUES (?, ?, ?, ?)",
      [chatId, "Test Group", "group", userId],
    );
    db.run(
      "INSERT INTO chat_members (chat_id, user_id, role) VALUES (?, ?, ?)",
      [chatId, userId, "owner"],
    );

    // Message 1: earlier timestamp, lexicographically LARGER UUID
    const msg1Id = "ffffffff-ffff-4fff-8fff-ffffffffffff";
    const msg1Body = storageEncryption.encryptText("First message");
    db.run(
      "INSERT INTO chat_messages (id, chat_id, user_id, body, created_at) VALUES (?, ?, ?, ?, ?)",
      [msg1Id, chatId, userId, msg1Body, "2026-08-11 10:00:00"],
    );

    // Message 2: later timestamp, lexicographically SMALLER UUID
    const msg2Id = "00000000-0000-4000-8000-000000000000";
    const msg2Body = storageEncryption.encryptText("Second message");
    db.run(
      "INSERT INTO chat_messages (id, chat_id, user_id, body, created_at) VALUES (?, ?, ?, ?, ?)",
      [msg2Id, chatId, userId, msg2Body, "2026-08-11 10:05:00"],
    );

    const chats = queryListChatsForUser(userId);
    expect(chats.length).toBe(1);
    expect(chats[0].last_message_id).toBe(msg2Id);
    expect(chats[0].last_message).toBe("Second message");
  });

  test("listChatsForUser updates last_message preview when latest message is edited", () => {
    const userId = crypto.randomUUID();
    const chatId = crypto.randomUUID();

    db.run("INSERT INTO users (id, username, password_hash) VALUES (?, ?, ?)", [
      userId,
      "alice",
      "hash",
    ]);
    db.run(
      "INSERT INTO chats (id, name, type, created_by_user_id) VALUES (?, ?, ?, ?)",
      [chatId, "Test Group", "group", userId],
    );
    db.run(
      "INSERT INTO chat_members (chat_id, user_id, role) VALUES (?, ?, ?)",
      [chatId, userId, "owner"],
    );

    const msgId = "11111111-1111-4111-8111-111111111111";
    const initialBody = storageEncryption.encryptText("Original text");
    db.run(
      "INSERT INTO chat_messages (id, chat_id, user_id, body, created_at) VALUES (?, ?, ?, ?, ?)",
      [msgId, chatId, userId, initialBody, "2026-08-11 10:00:00"],
    );

    // Edit message
    const editedBody = storageEncryption.encryptText("Edited text");
    db.run("UPDATE chat_messages SET edited_body = ? WHERE id = ?", [
      editedBody,
      msgId,
    ]);

    const chats = queryListChatsForUser(userId);
    expect(chats.length).toBe(1);
    expect(chats[0].last_message_id).toBe(msgId);
    expect(chats[0].last_message).toBe("Edited text");
  });

  test("listChatsForUser updates last_message preview when latest message is deleted", () => {
    const userId = crypto.randomUUID();
    const chatId = crypto.randomUUID();

    db.run("INSERT INTO users (id, username, password_hash) VALUES (?, ?, ?)", [
      userId,
      "alice",
      "hash",
    ]);
    db.run(
      "INSERT INTO chats (id, name, type, created_by_user_id) VALUES (?, ?, ?, ?)",
      [chatId, "Test Group", "group", userId],
    );
    db.run(
      "INSERT INTO chat_members (chat_id, user_id, role) VALUES (?, ?, ?)",
      [chatId, userId, "owner"],
    );

    const msg1Id = "11111111-1111-4111-8111-111111111111";
    const msg1Body = storageEncryption.encryptText("First message");
    db.run(
      "INSERT INTO chat_messages (id, chat_id, user_id, body, created_at) VALUES (?, ?, ?, ?, ?)",
      [msg1Id, chatId, userId, msg1Body, "2026-08-11 10:00:00"],
    );

    const msg2Id = "22222222-2222-4222-8222-222222222222";
    const msg2Body = storageEncryption.encryptText("Second message");
    db.run(
      "INSERT INTO chat_messages (id, chat_id, user_id, body, created_at) VALUES (?, ?, ?, ?, ?)",
      [msg2Id, chatId, userId, msg2Body, "2026-08-11 10:05:00"],
    );

    // Delete message 2 for everyone
    db.run(
      "UPDATE chat_messages SET hidden_everyone_at = '2026-08-11 10:06:00' WHERE id = ?",
      [msg2Id],
    );

    const chats = queryListChatsForUser(userId);
    expect(chats.length).toBe(1);
    expect(chats[0].last_message_id).toBe(msg1Id);
    expect(chats[0].last_message).toBe("First message");
  });
});
