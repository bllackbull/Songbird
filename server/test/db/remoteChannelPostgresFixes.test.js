import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { dbKnex } from "../../db/knex.js";
import {
  enqueueRemoteChannelQueueItem,
  markRemoteChannelQueueItemDone,
} from "../../db.js";
import { migration040QueueMessageIdText } from "../../migrations/040-queue-message-id-text.js";
import { migrations } from "../../migrations/index.js";

describe("remote channel Postgres fixes (NULL params, UUID done-marker)", () => {
  let originalDbClient;

  beforeEach(() => {
    originalDbClient = process.env.DB_CLIENT;
    process.env.DB_CLIENT = "postgres";
  });

  afterEach(() => {
    if (originalDbClient !== undefined) {
      process.env.DB_CLIENT = originalDbClient;
    } else {
      delete process.env.DB_CLIENT;
    }
    vi.restoreAllMocks();
  });

  test("enqueue with NULL telegram_update_id types the params (no $3 inference error)", async () => {
    // Emulates PostgreSQL's parameter type inference: an untyped NULL in
    // `($3 IS NOT NULL ...)` aborts with "could not determine data type of
    // parameter $3" — the exact error from the production screenshot.
    const raw = vi
      .spyOn(dbKnex, "raw")
      .mockImplementation(async (sql, params) => {
        const lower = String(sql || "").toLowerCase();
        if (lower.startsWith("insert")) {
          return { rows: [], rowCount: 1 };
        }
        const hasUntypedNullCheck = /\$\d+ is not null/.test(lower);
        const hasNullParam =
          Array.isArray(params) && params.some((p) => p === null);
        if (hasUntypedNullCheck && hasNullParam) {
          throw new Error(
            "SELECT ... WHERE source_id = $1 AND source_version = $2 AND (($3 IS NOT NULL AND telegram_update_id = $4) OR ($5 IS NOT NULL AND telegram_message_id = $6)) ORDER BY id DESC LIMIT 1 - could not determine data type of parameter $3",
          );
        }
        return { rows: [{ id: 101, source_id: 5, status: "pending" }] };
      });

    // Telegram channel polls only set telegramMessageId — telegramUpdateId
    // is NULL, which used to crash the post-insert lookup on Postgres.
    const row = await enqueueRemoteChannelQueueItem({
      sourceId: 5,
      sourceVersion: 2,
      telegramMessageId: 563,
      payloadJson: '{"message":{"id":563}}',
    });

    expect(row).toEqual({ id: 101, source_id: 5, status: "pending" });
    const selectCall = raw.mock.calls.find((args) =>
      String(args[0] || "")
        .toLowerCase()
        .startsWith("select"),
    );
    expect(selectCall).toBeDefined();
    // Typed params: CAST(? AS BIGINT) gives PG an explicit type for NULLs.
    expect(String(selectCall[0])).toContain("CAST(");
  });

  test("enqueue returns null on conflict under Postgres (parity with SQLite IGNORE)", async () => {
    const raw = vi.spyOn(dbKnex, "raw").mockImplementation(async (sql) => {
      const lower = String(sql || "").toLowerCase();
      if (lower.startsWith("insert")) {
        return { rows: [], rowCount: 0 }; // ON CONFLICT DO NOTHING
      }
      return { rows: [{ id: 77, source_id: 5, status: "pending" }] };
    });

    const row = await enqueueRemoteChannelQueueItem({
      sourceId: 5,
      sourceVersion: 2,
      telegramMessageId: 563,
      payloadJson: '{"message":{"id":563}}',
    });

    expect(row).toBeNull();
    // No follow-up SELECT for an already-queued message.
    expect(raw).toHaveBeenCalledTimes(1);
  });

  test("markRemoteChannelQueueItemDone passes UUID message ids through untouched", async () => {
    const seen = [];
    vi.spyOn(dbKnex, "raw").mockImplementation(async (sql, params) => {
      seen.push({ sql, params });
      return { rows: [], rowCount: 1 };
    });

    const uuid = "5c532a80-08a2-47c2-afb5-7447df7e0d16";
    await markRemoteChannelQueueItemDone(17, uuid);

    expect(seen).toHaveLength(1);
    // created_message_id must receive the UUID string as-is (migration 040
    // widens the column to TEXT on Postgres; INTEGER rejected it).
    expect(seen[0].params).toEqual([uuid, 17]);
  });
});

describe("migration 040 queue created_message_id widening", () => {
  function makeCtx({ isPostgres, tables }) {
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

  test("is a no-op on SQLite", async () => {
    const { ctx, statements } = makeCtx({
      isPostgres: false,
      tables: { remote_channel_queue: ["created_message_id"] },
    });
    await migration040QueueMessageIdText.up(ctx);
    expect(statements).toHaveLength(0);
  });

  test("widens the column to TEXT on Postgres", async () => {
    const { ctx, statements } = makeCtx({
      isPostgres: true,
      tables: { remote_channel_queue: ["created_message_id"] },
    });
    await migration040QueueMessageIdText.up(ctx);
    expect(statements).toHaveLength(1);
    expect(statements[0].sql).toContain("ALTER TABLE remote_channel_queue");
    expect(statements[0].sql).toContain("created_message_id");
    expect(statements[0].sql).toMatch(/TYPE TEXT/i);
  });

  test("skips gracefully when the table/column is missing", async () => {
    const { ctx, statements } = makeCtx({ isPostgres: true, tables: {} });
    await migration040QueueMessageIdText.up(ctx);
    expect(statements).toHaveLength(0);
  });

  test("is registered with a unique version", async () => {
    const versions = migrations.map((m) => Number(m.version));
    expect(versions).toContain(40);
    expect(new Set(versions).size).toBe(versions.length);
  });
});
