import { describe, expect, test, vi } from "vitest";
import { createInspector } from "../../lib/inspect.js";

describe("createInspector", () => {
  test("builds a snapshot from asynchronous PostgreSQL queries", async () => {
    const adminGetRow = vi.fn((sql) => {
      const q = (sql?.toSQL ? sql.toSQL().sql : String(sql)).toLowerCase();
      if (q.includes("from \"users\"") || q.includes("from `users`") || q.includes("from users")) return Promise.resolve({ n: 2 });
      if (q.includes("from \"chats\"") || q.includes("from `chats`") || q.includes("from chats")) return Promise.resolve({ n: 1 });
      if (q.includes("from \"chat_messages\"") || q.includes("from `chat_messages`") || q.includes("from chat_messages")) return Promise.resolve({ n: 3 });
      if (q.includes("from \"chat_message_files\"") || q.includes("from `chat_message_files`") || q.includes("from chat_message_files"))
        return Promise.resolve({ n: 0 });
      return Promise.resolve({ n: 0 });
    });
    const adminGetAll = vi.fn((sql) => {
      const q = (sql?.toSQL ? sql.toSQL().sql : String(sql)).toLowerCase();
      if (q.includes("users")) {
        return Promise.resolve([{ id: 1, username: "alice" }]);
      }
      if (q.includes("chats")) {
        return Promise.resolve([{ id: 10, type: "group", name: "General" }]);
      }
      if (q.includes("chat_members")) {
        return Promise.resolve([
          { chat_id: 10, user_id: 1 },
          { chat_id: 10, user_id: 2 },
        ]);
      }
      return Promise.resolve([]);
    });
    const inspector = createInspector({
      fs: { statfsSync: vi.fn() },
      dataDir: "/data",
      adminGetRow,
      adminGetAll,
    });

    await expect(
      inspector.buildInspectSnapshot("all", 25),
    ).resolves.toMatchObject({
      kind: "all",
      counts: { users: 2, chats: 1, messages: 3, files: 0 },
      users: [{ id: 1, username: "alice" }],
      chats: [
        {
          id: 10,
          type: "group",
          name: "General",
          members: 2,
          member_ids: [1, 2],
          messages: 0,
        },
      ],
    });
  });
});
