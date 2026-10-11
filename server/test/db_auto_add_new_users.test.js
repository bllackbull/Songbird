import { describe, test, expect, beforeAll } from "vitest";
import { migration037AutoAddNewUsers } from "../migrations/037-auto-add-new-users.js";
import {
  createChat,
  findChatById,
  updateChat,
  updateGroupChat,
  updateChannelChat,
  getAutoAddPublicChatIds,
  bulkAddMemberToChats,
  adminListChats,
  createUser,
  getRow,
  getAll,
} from "../db.js";

describe("Migration 037 - auto_add_new_users", () => {
  test("defines migration 037 with version 37", () => {
    expect(migration037AutoAddNewUsers.version).toBe(37);
    expect(typeof migration037AutoAddNewUsers.up).toBe("function");
  });

  test("runs migration up callback to add column if missing", () => {
    const executed = [];
    const mockDb = {
      run: (sql) => executed.push(sql),
    };
    const hasColumn = (table, col) => false;
    migration037AutoAddNewUsers.up({ db: mockDb, hasColumn });
    expect(executed.some((sql) => sql.includes("auto_add_new_users"))).toBe(
      true,
    );
  });
});

describe("DB Auto-Add New Users Helpers", () => {
  let testUserId;
  let publicAutoAddChatId;
  let publicNormalChatId;
  let privateChatId;

  beforeAll(async () => {
    testUserId = createUser(`auto_add_user_${Date.now()}`, "password123");

    publicAutoAddChatId = await createChat("Public Auto Add Group", "group", {
      groupVisibility: "public",
      autoAddNewUsers: true,
    });

    publicNormalChatId = await createChat("Public Normal Group", "group", {
      groupVisibility: "public",
      autoAddNewUsers: false,
    });

    privateChatId = await createChat("Private Group", "group", {
      groupVisibility: "private",
      autoAddNewUsers: true, // Should be forced to 0
    });
  });

  test("createChat enforces auto_add_new_users = 0 when visibility is private", () => {
    const chat = getRow("SELECT * FROM chats WHERE id = ?", [privateChatId]);
    expect(chat.auto_add_new_users).toBe(0);

    const autoAddChat = getRow("SELECT * FROM chats WHERE id = ?", [
      publicAutoAddChatId,
    ]);
    expect(autoAddChat.auto_add_new_users).toBe(1);
  });

  test("getAutoAddPublicChatIds returns only public chats with auto_add_new_users = 1", async () => {
    const ids = await getAutoAddPublicChatIds();
    expect(ids).toContain(publicAutoAddChatId);
    expect(ids).not.toContain(publicNormalChatId);
    expect(ids).not.toContain(privateChatId);
  });

  test("adminListChats includes auto_add_new_users in returned chat objects", async () => {
    const res = await adminListChats({ search: "Public Auto Add Group" });
    const chats = res.chats || [];
    const chat = chats.find((c) => c.id === publicAutoAddChatId);
    expect(chat).toBeDefined();
    expect(chat.auto_add_new_users).toBe(1);
  });

  test("findChatById includes auto_add_new_users in returned chat object", async () => {
    const chat = await findChatById(publicAutoAddChatId);
    expect(chat).toBeDefined();
    expect(chat.auto_add_new_users).toBe(1);
  });

  test("bulkAddMemberToChats inserts members into specified chats", async () => {
    const addedIds = await bulkAddMemberToChats(testUserId, [
      publicAutoAddChatId,
      publicNormalChatId,
    ]);
    expect(addedIds).toEqual([publicAutoAddChatId, publicNormalChatId]);

    const members = getAll(
      "SELECT * FROM chat_members WHERE user_id = ? AND chat_id IN (?, ?)",
      [testUserId, publicAutoAddChatId, publicNormalChatId],
    );
    expect(members.length).toBe(2);
  });

  test("updateChat enforces auto_add_new_users = 0 when changing group_visibility to private", async () => {
    const chatId = await createChat("Switch To Private Group", "group", {
      groupVisibility: "public",
      autoAddNewUsers: true,
    });

    let chat = getRow("SELECT * FROM chats WHERE id = ?", [chatId]);
    expect(chat.auto_add_new_users).toBe(1);

    await updateChat(chatId, { group_visibility: "private" });

    chat = getRow("SELECT * FROM chats WHERE id = ?", [chatId]);
    expect(chat.group_visibility).toBe("private");
    expect(chat.auto_add_new_users).toBe(0);
  });

  test("updateGroupChat enforces auto_add_new_users = 0 when changing visibility to private", async () => {
    const chatId = await createChat("Group Chat Test", "group", {
      groupVisibility: "public",
      autoAddNewUsers: true,
    });

    await updateGroupChat(chatId, {
      name: "Group Chat Test",
      groupVisibility: "private",
      autoAddNewUsers: true,
    });

    const chat = getRow("SELECT * FROM chats WHERE id = ?", [chatId]);
    expect(chat.group_visibility).toBe("private");
    expect(chat.auto_add_new_users).toBe(0);
  });
});
