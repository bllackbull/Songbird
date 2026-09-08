import { describe, expect, test, afterEach } from "vitest";
import { createRawTestDb, migrations } from "../db/testDbHelper.js";
import { isValidUuid } from "../../lib/uuidUtils.js";

describe("Migration 036: UUID Primary Keys", () => {
  let activeDb = null;

  afterEach(() => {
    if (activeDb) {
      try {
        activeDb.close();
      } catch {}
      activeDb = null;
    }
  });

  async function setupDbUpTo35() {
    activeDb = await createRawTestDb();
    const sortedMigrations = [...migrations].sort(
      (a, b) => a.version - b.version,
    );
    // Apply migrations up to 35
    for (const m of sortedMigrations) {
      if (m.version < 36) {
        await m.up(activeDb.migrationContext);
        activeDb.setSchemaVersion(m.version);
      }
    }
    return activeDb;
  }

  test("backfill handles NULL uuid rows", async () => {
    const dbInst = await setupDbUpTo35();
    const { db, getAll } = dbInst.migrationContext;

    // Add uuid column manually to simulate a table with NULL uuid values
    db.run("ALTER TABLE users ADD COLUMN uuid TEXT");
    db.run("ALTER TABLE chats ADD COLUMN uuid TEXT");
    db.run("ALTER TABLE chat_messages ADD COLUMN uuid TEXT");

    // Insert rows with NULL uuid
    db.run(
      "INSERT INTO users (id, username, password_hash, uuid) VALUES (1, 'user_null_uuid', 'hash', NULL)",
    );
    db.run(
      "INSERT INTO chats (id, name, type, uuid) VALUES (1, 'chat_null_uuid', 'dm', NULL)",
    );
    db.run(
      "INSERT INTO chat_messages (id, chat_id, user_id, body, uuid) VALUES (1, 1, 1, 'hello', NULL)",
    );

    // Apply migration 36
    const m36 = migrations.find((m) => m.version === 36);
    await m36.up(dbInst.migrationContext);

    const users = getAll("SELECT id FROM users WHERE username = 'user_null_uuid'");
    expect(users.length).toBe(1);
    expect(isValidUuid(users[0].id)).toBe(true);

    const chats = getAll("SELECT id FROM chats WHERE name = 'chat_null_uuid'");
    expect(chats.length).toBe(1);
    expect(isValidUuid(chats[0].id)).toBe(true);

    const messages = getAll("SELECT id, chat_id, user_id FROM chat_messages WHERE body = 'hello'");
    expect(messages.length).toBe(1);
    expect(isValidUuid(messages[0].id)).toBe(true);
    expect(isValidUuid(messages[0].chat_id)).toBe(true);
    expect(isValidUuid(messages[0].user_id)).toBe(true);
  });

  test("FK conversion produces correct UUID references via joins", async () => {
    const dbInst = await setupDbUpTo35();
    const { db, getAll } = dbInst.migrationContext;

    db.run("ALTER TABLE users ADD COLUMN uuid TEXT");
    db.run("ALTER TABLE chats ADD COLUMN uuid TEXT");
    db.run("ALTER TABLE chat_messages ADD COLUMN uuid TEXT");

    const aliceUuid = "11111111-1111-4111-a111-111111111111";
    const bobUuid = "22222222-2222-4222-a222-222222222222";
    const chatUuid = "33333333-3333-4333-a333-333333333333";
    const msg1Uuid = "44444444-4444-4444-a444-444444444444";
    const msg2Uuid = "55555555-5555-4555-a555-555555555555";

    db.run(
      "INSERT INTO users (id, username, password_hash, uuid) VALUES (10, 'alice', 'hash', ?)",
      [aliceUuid],
    );
    db.run(
      "INSERT INTO users (id, username, password_hash, uuid) VALUES (20, 'bob', 'hash', ?)",
      [bobUuid],
    );
    db.run(
      "INSERT INTO chats (id, name, type, created_by_user_id, uuid) VALUES (100, 'group', 'group', 10, ?)",
      [chatUuid],
    );
    db.run(
      "INSERT INTO chat_members (chat_id, user_id, role) VALUES (100, 10, 'owner')",
    );
    db.run(
      "INSERT INTO chat_members (chat_id, user_id, role) VALUES (100, 20, 'member')",
    );
    db.run(
      "INSERT INTO chat_messages (id, chat_id, user_id, body, uuid) VALUES (1000, 100, 10, 'first msg', ?)",
      [msg1Uuid],
    );
    db.run(
      "INSERT INTO chat_messages (id, chat_id, user_id, body, reply_to_message_id, uuid) VALUES (1001, 100, 20, 'reply msg', 1000, ?)",
      [msg2Uuid],
    );

    // Apply migration 36
    const m36 = migrations.find((m) => m.version === 36);
    await m36.up(dbInst.migrationContext);

    // Verify users
    const alice = getAll("SELECT id FROM users WHERE username = 'alice'")[0];
    expect(alice.id).toBe(aliceUuid);

    // Verify chats
    const chat = getAll("SELECT id, created_by_user_id FROM chats WHERE id = ?", [chatUuid])[0];
    expect(chat.id).toBe(chatUuid);
    expect(chat.created_by_user_id).toBe(aliceUuid);

    // Verify chat members
    const members = getAll("SELECT chat_id, user_id, role FROM chat_members WHERE chat_id = ?", [chatUuid]);
    expect(members.length).toBe(2);
    expect(members).toEqual(
      expect.arrayContaining([
        { chat_id: chatUuid, user_id: aliceUuid, role: "owner" },
        { chat_id: chatUuid, user_id: bobUuid, role: "member" },
      ]),
    );

    // Verify chat messages & reply_to_message_id FK
    const msg2 = getAll("SELECT id, chat_id, user_id, reply_to_message_id FROM chat_messages WHERE id = ?", [msg2Uuid])[0];
    expect(msg2.chat_id).toBe(chatUuid);
    expect(msg2.user_id).toBe(bobUuid);
    expect(msg2.reply_to_message_id).toBe(msg1Uuid);
  });

  test("orphaned FKs become NULL or are safely handled", async () => {
    const dbInst = await setupDbUpTo35();
    const { db, getAll } = dbInst.migrationContext;

    db.run("ALTER TABLE users ADD COLUMN uuid TEXT");
    db.run("ALTER TABLE chats ADD COLUMN uuid TEXT");
    db.run("ALTER TABLE chat_messages ADD COLUMN uuid TEXT");

    const chatUuid = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";
    const msgUuid = "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb";

    // Insert user 1
    db.run(
      "INSERT INTO users (id, username, password_hash, uuid) VALUES (1, 'valid_user', 'hash', '11111111-1111-4111-a111-111111111111')",
    );
    // Chat with created_by_user_id referencing non-existent user 9999
    db.run(
      "INSERT INTO chats (id, name, type, created_by_user_id, uuid) VALUES (1, 'orphaned_creator_chat', 'dm', 9999, ?)",
      [chatUuid],
    );
    // Message with forwarded_from_chat_id referencing non-existent chat 8888
    db.run(
      "INSERT INTO chat_messages (id, chat_id, user_id, body, forwarded_from_chat_id, uuid) VALUES (1, 1, 1, 'msg with orphaned forward', 8888, ?)",
      [msgUuid],
    );

    // Apply migration 36
    const m36 = migrations.find((m) => m.version === 36);
    await m36.up(dbInst.migrationContext);

    const chat = getAll("SELECT created_by_user_id FROM chats WHERE id = ?", [chatUuid])[0];
    expect(chat.created_by_user_id).toBeNull();

    const msg = getAll("SELECT forwarded_from_chat_id FROM chat_messages WHERE id = ?", [msgUuid])[0];
    expect(msg.forwarded_from_chat_id).toBeNull();
  });

  test("idempotency guard (safe to run on already-migrated DB)", async () => {
    const dbInst = await setupDbUpTo35();
    const m36 = migrations.find((m) => m.version === 36);

    // Run migration 36 first time
    await m36.up(dbInst.migrationContext);

    const usersFirst = dbInst.migrationContext.getAll("SELECT id FROM users");

    // Run migration 36 second time
    expect(() => m36.up(dbInst.migrationContext)).not.toThrow();

    const usersSecond = dbInst.migrationContext.getAll("SELECT id FROM users");
    expect(usersSecond).toEqual(usersFirst);
  });
});
