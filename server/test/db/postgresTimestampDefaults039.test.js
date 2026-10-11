import { describe, expect, test } from "vitest";
import { migration039PostgresTimestampDefaults } from "../../migrations/039-postgres-timestamp-defaults.js";
import { createTestDb } from "./testDbHelper.js";

function makeCapturingCtx({ isPostgres, tables }) {
  const statements = [];
  const tableSet = new Set(Object.keys(tables));
  return {
    ctx: {
      isPostgres,
      tableExists: (t) => tableSet.has(String(t)),
      hasColumn: (t, c) =>
        Array.isArray(tables[t]) && tables[t].includes(String(c)),
      db: {
        run: (sql, params = []) => {
          statements.push({ sql, params });
          return Promise.resolve(1);
        },
      },
      getAll: () => Promise.resolve([]),
    },
    statements,
  };
}

const ALL_TABLES = {
  chat_left_members: ["left_at"],
  chat_message_files: ["created_at"],
  chat_message_reads: ["read_at"],
  chat_messages: ["created_at"],
  chat_mutes: ["updated_at"],
  chats: ["created_at"],
  group_removed_members: ["removed_at"],
  hidden_chat_messages: ["hidden_at"],
  hidden_chats: ["hidden_at"],
  pending_presigned_uploads: ["created_at"],
  push_subscriptions: ["created_at", "updated_at"],
  remote_channel_provider_state: ["updated_at"],
  remote_channel_queue: ["created_at"],
  remote_channel_sources: ["created_at", "updated_at"],
  sessions: ["created_at", "last_seen"],
  users: ["created_at"],
};

describe("migration 039 postgres timestamp defaults", () => {
  test("is a no-op on SQLite", async () => {
    const { ctx, statements } = makeCapturingCtx({
      isPostgres: false,
      tables: ALL_TABLES,
    });
    await migration039PostgresTimestampDefaults.up(ctx);
    expect(statements).toHaveLength(0);
  });

  test("repairs defaults and backfills the literal on Postgres", async () => {
    const { ctx, statements } = makeCapturingCtx({
      isPostgres: true,
      tables: ALL_TABLES,
    });
    await migration039PostgresTimestampDefaults.up(ctx);

    const alters = statements.filter((s) => s.sql.startsWith("ALTER TABLE"));
    const updates = statements.filter((s) => s.sql.startsWith("UPDATE"));
    // 19 affected columns → one ALTER + one UPDATE each
    expect(alters).toHaveLength(19);
    expect(updates).toHaveLength(19);

    for (const { sql, params } of statements) {
      expect(sql).not.toContain("datetime(");
    }
    for (const { params } of updates) {
      expect(params).toEqual(["datetime('now')"]);
    }

    const chatMessagesUpdate = updates.find((s) =>
      s.sql.startsWith("UPDATE chat_messages"),
    );
    expect(chatMessagesUpdate.sql).toContain("COALESCE(read_at,");
  });

  test("skips tables/columns that do not exist", async () => {
    const { ctx, statements } = makeCapturingCtx({
      isPostgres: true,
      tables: { chat_messages: ["created_at"] },
    });
    await migration039PostgresTimestampDefaults.up(ctx);
    expect(statements).toHaveLength(2);
    expect(statements[0].sql).toContain("ALTER TABLE chat_messages");
    expect(statements[1].sql).toContain("UPDATE chat_messages");
  });

  test("runs cleanly and idempotently on a real SQLite database", async () => {
    const activeDb = await createTestDb();
    try {
      await migration039PostgresTimestampDefaults.up(activeDb.migrationContext);
      await migration039PostgresTimestampDefaults.up(activeDb.migrationContext);
    } finally {
      try {
        activeDb.close();
      } catch {}
    }
  });
});
