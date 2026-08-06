import { describe, expect, test, beforeEach, afterEach } from "vitest";
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
    dbHelper.run(
      "INSERT INTO users (username, nickname, password_hash, role) VALUES (?, ?, ?, ?)",
      ["alice", "Alice W", "hash_alice", "user"],
    );
    dbHelper.run(
      "INSERT INTO users (username, nickname, password_hash, role) VALUES (?, ?, ?, ?)",
      ["bob", "Bob B", "hash_bob", "admin"],
    );

    const alice = dbHelper.getRow("SELECT * FROM users WHERE username = ?", [
      "alice",
    ]);
    expect(alice).toBeDefined();
    expect(alice.username).toBe("alice");
    expect(alice.nickname).toBe("Alice W");
    expect(alice.role).toBe("user");

    const allUsers = dbHelper.getAll("SELECT * FROM users ORDER BY id ASC");
    expect(allUsers.length).toBe(2);
    expect(allUsers[0].username).toBe("alice");
    expect(allUsers[1].username).toBe("bob");
  });

  test("chat and member creation and member querying", () => {
    dbHelper.run("INSERT INTO users (username, password_hash) VALUES (?, ?)", [
      "user1",
      "hash1",
    ]);
    dbHelper.run("INSERT INTO users (username, password_hash) VALUES (?, ?)", [
      "user2",
      "hash2",
    ]);
    const u1 = dbHelper.getRow("SELECT id FROM users WHERE username = 'user1'");
    const u2 = dbHelper.getRow("SELECT id FROM users WHERE username = 'user2'");

    dbHelper.run("INSERT INTO chats (name, type) VALUES (?, ?)", [
      "Engineering",
      "group",
    ]);
    const chat = dbHelper.getRow(
      "SELECT id FROM chats WHERE name = 'Engineering'",
    );

    dbHelper.run(
      "INSERT INTO chat_members (chat_id, user_id, role) VALUES (?, ?, ?)",
      [chat.id, u1.id, "owner"],
    );
    dbHelper.run(
      "INSERT INTO chat_members (chat_id, user_id, role) VALUES (?, ?, ?)",
      [chat.id, u2.id, "member"],
    );

    const members = dbHelper.getAll(
      "SELECT cm.*, u.username FROM chat_members cm JOIN users u ON cm.user_id = u.id WHERE cm.chat_id = ? ORDER BY u.id ASC",
      [chat.id],
    );

    expect(members.length).toBe(2);
    expect(members[0].username).toBe("user1");
    expect(members[0].role).toBe("owner");
    expect(members[1].username).toBe("user2");
    expect(members[1].role).toBe("member");
  });

  test("sending and fetching message history", () => {
    dbHelper.run(
      "INSERT INTO users (username, password_hash) VALUES ('sender', 'h')",
    );
    const sender = dbHelper.getRow(
      "SELECT id FROM users WHERE username = 'sender'",
    );

    dbHelper.run("INSERT INTO chats (name, type) VALUES ('General', 'group')");
    const chat = dbHelper.getRow("SELECT id FROM chats WHERE name = 'General'");

    dbHelper.run(
      "INSERT INTO chat_messages (chat_id, user_id, body) VALUES (?, ?, ?)",
      [chat.id, sender.id, "First message"],
    );
    dbHelper.run(
      "INSERT INTO chat_messages (chat_id, user_id, body) VALUES (?, ?, ?)",
      [chat.id, sender.id, "Second message"],
    );

    const history = dbHelper.getAll(
      "SELECT m.*, u.username FROM chat_messages m JOIN users u ON m.user_id = u.id WHERE m.chat_id = ? ORDER BY m.id ASC",
      [chat.id],
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
    dbHelper.run(
      "INSERT INTO users (username, password_hash) VALUES ('author', 'pass')",
    );
    const author = dbHelper.getRow(
      "SELECT id FROM users WHERE username = 'author'",
    );

    dbHelper.run("INSERT INTO chats (name, type) VALUES ('Room', 'group')");
    const chat = dbHelper.getRow("SELECT id FROM chats WHERE name = 'Room'");

    dbHelper.run(
      "INSERT INTO chat_messages (chat_id, user_id, body) VALUES (?, ?, ?)",
      [chat.id, author.id, "Original text"],
    );
    const msg = dbHelper.getRow(
      "SELECT id FROM chat_messages WHERE body = 'Original text'",
    );

    // Edit message
    dbHelper.run(
      "UPDATE chat_messages SET edited = 1, edited_body = ? WHERE id = ?",
      ["Updated text", msg.id],
    );

    const editedMsg = dbHelper.getRow(
      "SELECT * FROM chat_messages WHERE id = ?",
      [msg.id],
    );
    expect(editedMsg.edited).toBe(1);
    expect(editedMsg.edited_body).toBe("Updated text");

    // Soft delete / hide for everyone
    dbHelper.run(
      "UPDATE chat_messages SET hidden_everyone_at = '2026-08-06T12:00:00Z' WHERE id = ?",
      [msg.id],
    );

    const visibleMsgs = dbHelper.getAll(
      "SELECT * FROM chat_messages WHERE chat_id = ? AND hidden_everyone_at IS NULL",
      [chat.id],
    );
    expect(visibleMsgs.length).toBe(0);
  });
});
