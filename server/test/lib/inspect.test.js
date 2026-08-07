import { describe, expect, test, vi } from "vitest";
import { createInspector } from "../../lib/inspect.js";

describe("createInspector", () => {
  test("builds a snapshot from asynchronous PostgreSQL queries", async () => {
    const adminGetRow = vi.fn((sql) => {
      if (sql.includes("FROM users")) return Promise.resolve({ n: 2 });
      if (sql.includes("FROM chats")) return Promise.resolve({ n: 1 });
      if (sql.includes("FROM chat_messages")) return Promise.resolve({ n: 3 });
      if (sql.includes("FROM chat_message_files"))
        return Promise.resolve({ n: 0 });
      return Promise.resolve({ n: 0 });
    });
    const adminGetAll = vi.fn((sql) => {
      if (sql.includes("FROM users")) {
        return Promise.resolve([{ id: 1, username: "alice" }]);
      }
      if (sql.includes("FROM chats")) {
        return Promise.resolve([{ id: 10, type: "group", name: "General" }]);
      }
      if (sql.includes("FROM chat_members")) {
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
    expect(adminGetAll).not.toHaveBeenCalledWith(
      expect.stringContaining("GROUP_CONCAT"),
      expect.anything(),
    );
  });
});
