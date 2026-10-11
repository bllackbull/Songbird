import { describe, expect, test, beforeEach, afterEach } from "vitest";
import crypto from "node:crypto";
import { createTestDb } from "./testDbHelper.js";

describe("Database CRUD Operations Integration", () => {
  let dbHelper = null;

  beforeEach(async () => {
    dbHelper = await createTestDb();
  });

  afterEach(() => {
    if (dbHelper) {
      try {
        dbHelper.close();
      } catch {}
      dbHelper = null;
    }
  });

  test("user creation, retrieval, and querying", () => {
    const aliceId = crypto.randomUUID();
    const bobId = crypto.randomUUID();
    dbHelper.run(
      "INSERT INTO users (id, username, nickname, password_hash, role) VALUES (?, ?, ?, ?, ?)",
      [aliceId, "alice", "Alice W", "hash_alice", "user"],
    );
    dbHelper.run(
      "INSERT INTO users (id, username, nickname, password_hash, role) VALUES (?, ?, ?, ?, ?)",
      [bobId, "bob", "Bob B", "hash_bob", "admin"],
    );

    const alice = dbHelper.getRow("SELECT * FROM users WHERE username = ?", [
      "alice",
    ]);
    expect(alice).toBeDefined();
    expect(alice.username).toBe("alice");
    expect(alice.nickname).toBe("Alice W");
    expect(alice.role).toBe("user");

    const allUsers = dbHelper.getAll("SELECT * FROM users ORDER BY username ASC");
    expect(allUsers.length).toBe(2);
    expect(allUsers[0].username).toBe("alice");
    expect(allUsers[1].username).toBe("bob");
  });

  test("chat and member creation and member querying", () => {
    const u1Id = crypto.randomUUID();
    const u2Id = crypto.randomUUID();
    dbHelper.run("INSERT INTO users (id, username, password_hash) VALUES (?, ?, ?)", [
      u1Id,
      "user1",
      "hash1",
    ]);
    dbHelper.run("INSERT INTO users (id, username, password_hash) VALUES (?, ?, ?)", [
      u2Id,
      "user2",
      "hash2",
    ]);

    const chatId = crypto.randomUUID();
    dbHelper.run("INSERT INTO chats (id, name, type) VALUES (?, ?, ?)", [
      chatId,
      "Engineering",
      "group",
    ]);

    dbHelper.run(
      "INSERT INTO chat_members (chat_id, user_id, role) VALUES (?, ?, ?)",
      [chatId, u1Id, "owner"],
    );
    dbHelper.run(
      "INSERT INTO chat_members (chat_id, user_id, role) VALUES (?, ?, ?)",
      [chatId, u2Id, "member"],
    );

    const members = dbHelper.getAll(
      "SELECT cm.*, u.username FROM chat_members cm JOIN users u ON cm.user_id = u.id WHERE cm.chat_id = ? ORDER BY u.username ASC",
      [chatId],
    );

    expect(members.length).toBe(2);
    expect(members[0].username).toBe("user1");
    expect(members[0].role).toBe("owner");
    expect(members[1].username).toBe("user2");
    expect(members[1].role).toBe("member");
  });

  test("sending and fetching message history", () => {
    const senderId = crypto.randomUUID();
    dbHelper.run(
      "INSERT INTO users (id, username, password_hash) VALUES (?, 'sender', 'h')",
      [senderId],
    );

    const chatId = crypto.randomUUID();
    dbHelper.run("INSERT INTO chats (id, name, type) VALUES (?, 'General', 'group')", [chatId]);

    const msg1Id = crypto.randomUUID();
    const msg2Id = crypto.randomUUID();
    dbHelper.run(
      "INSERT INTO chat_messages (id, chat_id, user_id, body) VALUES (?, ?, ?, ?)",
      [msg1Id, chatId, senderId, "First message"],
    );
    dbHelper.run(
      "INSERT INTO chat_messages (id, chat_id, user_id, body) VALUES (?, ?, ?, ?)",
      [msg2Id, chatId, senderId, "Second message"],
    );

    const history = dbHelper.getAll(
      "SELECT m.*, u.username FROM chat_messages m JOIN users u ON m.user_id = u.id WHERE m.chat_id = ? ORDER BY m.created_at ASC",
      [chatId],
    );

    expect(history.length).toBe(2);
    expect(history[0].body).toBe("First message");
    expect(history[1].body).toBe("Second message");
    expect(history[0].username).toBe("sender");
  });

  test("updating app settings", () => {
    dbHelper.run("INSERT INTO app_settings (key, value) VALUES (?, ?)", [
      "site_title",
      "Songbird Chat",
    ]);

    let setting = dbHelper.getRow(
      "SELECT value FROM app_settings WHERE key = ?",
      ["site_title"],
    );
    expect(setting.value).toBe("Songbird Chat");

    dbHelper.run("UPDATE app_settings SET value = ? WHERE key = ?", [
      "Songbird Workspace",
      "site_title",
    ]);

    setting = dbHelper.getRow("SELECT value FROM app_settings WHERE key = ?", [
      "site_title",
    ]);
    expect(setting.value).toBe("Songbird Workspace");
  });

  test("editing and soft deleting / hiding messages", () => {
    const authorId = crypto.randomUUID();
    dbHelper.run(
      "INSERT INTO users (id, username, password_hash) VALUES (?, 'author', 'pass')",
      [authorId],
    );

    const chatId = crypto.randomUUID();
    dbHelper.run("INSERT INTO chats (id, name, type) VALUES (?, 'Room', 'group')", [chatId]);

    const msgId = crypto.randomUUID();
    dbHelper.run(
      "INSERT INTO chat_messages (id, chat_id, user_id, body) VALUES (?, ?, ?, ?)",
      [msgId, chatId, authorId, "Original text"],
    );

    // Edit message
    dbHelper.run(
      "UPDATE chat_messages SET edited = 1, edited_body = ? WHERE id = ?",
      ["Updated text", msgId],
    );

    const editedMsg = dbHelper.getRow(
      "SELECT * FROM chat_messages WHERE id = ?",
      [msgId],
    );
    expect(editedMsg.edited).toBe(1);
    expect(editedMsg.edited_body).toBe("Updated text");

    // Soft delete / hide for everyone
    dbHelper.run(
      "UPDATE chat_messages SET hidden_everyone_at = '2026-08-06T12:00:00Z' WHERE id = ?",
      [msgId],
    );

    const visibleMsgs = dbHelper.getAll(
      "SELECT * FROM chat_messages WHERE chat_id = ? AND hidden_everyone_at IS NULL",
      [chatId],
    );
    expect(visibleMsgs.length).toBe(0);
  });
});
