import { describe, expect, test, beforeEach, afterEach } from "vitest";
import { createTestDb } from "./testDbHelper.js";

describe("Database Schema Integration", () => {
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

  test("creates all key tables in the database", () => {
    const keyTables = [
      "meta",
      "users",
      "chats",
      "chat_members",
      "chat_messages",
      "hidden_chats",
      "sessions",
      "push_subscriptions",
      "remote_channel_sources",
      "remote_channel_queue",
      "app_settings",
    ];

    for (const table of keyTables) {
      expect(dbHelper.tableExists(table), `table ${table} exists`).toBe(true);
    }
  });

  test("creates expected columns on key tables", () => {
    // users table
    expect(dbHelper.hasColumn("users", "id")).toBe(true);
    expect(dbHelper.hasColumn("users", "username")).toBe(true);
    expect(dbHelper.hasColumn("users", "password_hash")).toBe(true);
    expect(dbHelper.hasColumn("users", "role")).toBe(true);
    expect(dbHelper.hasColumn("users", "verified")).toBe(true);
    expect(dbHelper.hasColumn("users", "banned")).toBe(true);

    // chats table
    expect(dbHelper.hasColumn("chats", "id")).toBe(true);
    expect(dbHelper.hasColumn("chats", "name")).toBe(true);
    expect(dbHelper.hasColumn("chats", "type")).toBe(true);
    expect(dbHelper.hasColumn("chats", "allow_member_invites")).toBe(true);
    expect(dbHelper.hasColumn("chats", "verified")).toBe(true);

    // chat_members table
    expect(dbHelper.hasColumn("chat_members", "chat_id")).toBe(true);
    expect(dbHelper.hasColumn("chat_members", "user_id")).toBe(true);
    expect(dbHelper.hasColumn("chat_members", "role")).toBe(true);

    // chat_messages table
    expect(dbHelper.hasColumn("chat_messages", "id")).toBe(true);
    expect(dbHelper.hasColumn("chat_messages", "chat_id")).toBe(true);
    expect(dbHelper.hasColumn("chat_messages", "user_id")).toBe(true);
    expect(dbHelper.hasColumn("chat_messages", "body")).toBe(true);
    expect(dbHelper.hasColumn("chat_messages", "client_request_id")).toBe(true);
    expect(dbHelper.hasColumn("chat_messages", "edited")).toBe(true);
    expect(dbHelper.hasColumn("chat_messages", "edited_body")).toBe(true);
    expect(dbHelper.hasColumn("chat_messages", "hidden_everyone_at")).toBe(
      true,
    );
    expect(dbHelper.hasColumn("chat_messages", "expires_at")).toBe(true);

    // remote_channel_sources table
    expect(dbHelper.hasColumn("remote_channel_sources", "id")).toBe(true);
    expect(dbHelper.hasColumn("remote_channel_sources", "chat_id")).toBe(true);
    expect(dbHelper.hasColumn("remote_channel_sources", "provider")).toBe(true);
    expect(dbHelper.hasColumn("remote_channel_sources", "paused")).toBe(true);

    // remote_channel_queue table
    expect(dbHelper.hasColumn("remote_channel_queue", "id")).toBe(true);
    expect(dbHelper.hasColumn("remote_channel_queue", "source_id")).toBe(true);
    expect(dbHelper.hasColumn("remote_channel_queue", "status")).toBe(true);

    // app_settings table
    expect(dbHelper.hasColumn("app_settings", "key")).toBe(true);
    expect(dbHelper.hasColumn("app_settings", "value")).toBe(true);
  });
});
