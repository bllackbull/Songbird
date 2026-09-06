import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { dbKnex } from "../../db/knex.js";
import {
  getRemoteChannelSourceByChatId,
  getRemoteChannelSourceById,
  upsertRemoteChannelSource,
  listEnabledRemoteChannelSources,
  updateRemoteChannelSourceSeen,
  updateRemoteChannelSourceError,
  updateRemoteChannelSourcePaused,
  getCurrentRemoteChannelQueueItemId,
  skipCurrentRemoteChannelQueueItem,
  skipAllRemoteChannelQueueItems,
  getRemoteChannelProviderState,
  setRemoteChannelProviderState,
  enqueueRemoteChannelQueueItem,
  getRemoteChannelQueueSummary,
  releaseStaleRemoteChannelQueueItems,
  claimNextRemoteChannelQueueItem,
  markRemoteChannelQueueItemDone,
  markRemoteChannelQueueItemSkipped,
  markRemoteChannelQueueItemRetry,
  purgeOldRemoteChannelQueueItems,
  createMessageFiles,
  findMessageFileById,
  listMessageFilesByMessageIds,
  listMessageFilesNeedingMetadata,
  updateMessageFileMetadata,
  setMessageExpiresAt,
  editMessage,
  hideMessageForUser,
  hideMessageForEveryone,
  recordMessageReads,
  markMessagesRead,
  markMessageRead,
  hideChatsForUser,
  unhideChat,
  setChatMuted,
  upsertPushSubscription,
  deletePushSubscription,
  listPushSubscriptionsByUserIds,
  updateUserProfile,
  updateUserPassword,
  updateUserStatus,
  setUserBanned,
  deleteSessionsByUserId,
  updateLastSeen,
  findMessageIdByClientRequestId,
  createOrReuseMessage,
  regenerateGroupInviteToken,
  updateGroupChat,
  updateChannelChat,
  setChatMemberRole,
  clearChatMemberLeft,
  clearGroupMemberRemoved,
  removeChatMember,
  markChatMemberLeft,
  markGroupMemberRemoved,
  adminBanUser,
  adminDeleteUser,
  adminDeleteChat,
  adminClearAllMessages,
  adminResetDatabase,
  bootstrapAdminUsers,
  dbSetSetting,
  dbDeleteSetting,
  dbGetAllSettings,
  getRow,
  getAll,
  run,
} from "../../db.js";

describe("Dual Driver Complete DB Functions Coverage", () => {
  let originalDbClient;

  beforeEach(() => {
    originalDbClient = process.env.DB_CLIENT;
  });

  afterEach(() => {
    if (originalDbClient !== undefined) {
      process.env.DB_CLIENT = originalDbClient;
    } else {
      delete process.env.DB_CLIENT;
    }
    vi.restoreAllMocks();
  });

  describe("Remote Channel Source and Queue Functions under Dual Drivers", () => {
    test("getRemoteChannelSourceByChatId handles SQLite and Postgres modes", async () => {
      // Postgres mode
      process.env.DB_CLIENT = "postgres";
      vi.spyOn(dbKnex, "raw").mockResolvedValue({
        rows: [{ id: 10, chat_id: "c1", provider: "telegram" }],
      });
      const pgRes = await getRemoteChannelSourceByChatId("c1");
      expect(pgRes).toEqual({ id: 10, chat_id: "c1", provider: "telegram" });

      // SQLite mode
      delete process.env.DB_CLIENT;
      const sqliteRes = getRemoteChannelSourceByChatId("nonexistent");
      expect(sqliteRes).toBeDefined();
    });

    test("getRemoteChannelSourceById handles SQLite and Postgres modes", async () => {
      process.env.DB_CLIENT = "postgres";
      vi.spyOn(dbKnex, "raw").mockResolvedValue({
        rows: [{ id: 5, chat_id: "c2" }],
      });
      const pgRes = await getRemoteChannelSourceById(5);
      expect(pgRes).toEqual({ id: 5, chat_id: "c2" });

      delete process.env.DB_CLIENT;
      const sqliteRes = getRemoteChannelSourceById(999999);
      expect(sqliteRes).toBeNull();
    });

    test("upsertRemoteChannelSource handles null/empty payload", async () => {
      expect(await upsertRemoteChannelSource({})).toBeNull();
      expect(await upsertRemoteChannelSource({ chatId: null })).toBeNull();
    });

    test("updateRemoteChannelSourceSeen / Error / Paused under Postgres mode", async () => {
      process.env.DB_CLIENT = "postgres";
      vi.spyOn(dbKnex, "raw").mockImplementation(async (sql) => {
        const lower = String(sql || "").toLowerCase();
        if (lower.includes("select")) {
          return {
            rows: [{ id: 5, last_remote_message_id: 10, last_error: "old" }],
          };
        }
        return { rows: [], rowCount: 1 };
      });

      const resSeen = await updateRemoteChannelSourceSeen(5, {
        lastRemoteMessageId: 20,
      });
      expect(resSeen).toBeDefined();

      const resErr = await updateRemoteChannelSourceError(5, "New error");
      expect(resErr).toBeDefined();

      const resPaused = await updateRemoteChannelSourcePaused(5, true);
      expect(resPaused).toBeDefined();
    });

    test("getCurrentRemoteChannelQueueItemId, skipCurrentRemoteChannelQueueItem, skipAllRemoteChannelQueueItems under Postgres mode", async () => {
      process.env.DB_CLIENT = "postgres";
      vi.spyOn(dbKnex, "raw").mockImplementation(async (sql) => {
        const lower = String(sql || "").toLowerCase();
        if (lower.includes("select")) {
          return { rows: [{ id: 42 }] };
        }
        return { rows: [], rowCount: 1 };
      });

      const itemId = await getCurrentRemoteChannelQueueItemId(5);
      expect(itemId).toBe(42);

      const skipCur = await skipCurrentRemoteChannelQueueItem(5);
      expect(skipCur).toBeDefined();

      const skipAll = await skipAllRemoteChannelQueueItems(5);
      expect(skipAll).toBeDefined();

      expect(await getCurrentRemoteChannelQueueItemId(0)).toBeNull();
      expect(await skipCurrentRemoteChannelQueueItem(0)).toBe(0);
      expect(await skipAllRemoteChannelQueueItems(0)).toBe(0);
    });

    test("getRemoteChannelProviderState and setRemoteChannelProviderState under Postgres mode", async () => {
      process.env.DB_CLIENT = "postgres";
      vi.spyOn(dbKnex, "raw").mockImplementation(async (sql) => {
        const lower = String(sql || "").toLowerCase();
        if (lower.includes("select")) {
          return { rows: [{ provider: "telegram", next_update_offset: 100 }] };
        }
        return { rows: [], rowCount: 1 };
      });

      const state = await getRemoteChannelProviderState("telegram");
      expect(state).toEqual({ provider: "telegram", next_update_offset: 100 });

      const setState = await setRemoteChannelProviderState("telegram", {
        nextUpdateOffset: 105,
      });
      expect(setState).toBeDefined();
    });

    test("enqueueRemoteChannelQueueItem and getRemoteChannelQueueSummary under Postgres mode", async () => {
      process.env.DB_CLIENT = "postgres";
      vi.spyOn(dbKnex, "raw").mockImplementation(async (sql) => {
        const lower = String(sql || "").toLowerCase();
        if (
          lower.includes("group by") ||
          lower.includes("select status") ||
          lower.includes('select "status"')
        ) {
          return {
            rows: [
              { status: "pending", count: 3 },
              { status: "done", count: 10 },
            ],
          };
        }
        if (lower.includes("select id")) {
          return { rows: [{ id: 101, source_id: 5, status: "pending" }] };
        }
        return { rows: [], rowCount: 1 };
      });

      const enqueued = await enqueueRemoteChannelQueueItem({
        sourceId: 5,
        payloadJson: '{"test":true}',
        telegramMessageId: 99,
      });
      expect(enqueued).toEqual({ id: 101, source_id: 5, status: "pending" });

      const summary = await getRemoteChannelQueueSummary(5);
      expect(summary).toEqual({ pending: 3, done: 10 });
    });

    test("queue lifecycle functions (releaseStale, claimNext, markDone, markSkipped, markRetry, purgeOld) under Postgres mode", async () => {
      process.env.DB_CLIENT = "postgres";
      vi.spyOn(dbKnex, "raw").mockImplementation(async (sql) => {
        const lower = String(sql || "").toLowerCase();
        if (lower.includes("select q.id")) {
          return { rows: [{ id: 7, source_id: 5, status: "pending" }] };
        }
        return { rows: [], rowCount: 1 };
      });

      await releaseStaleRemoteChannelQueueItems(new Date().toISOString());

      const claimed = await claimNextRemoteChannelQueueItem(
        "worker-1",
        new Date().toISOString(),
      );
      expect(claimed).toMatchObject({
        id: 7,
        status: "processing",
        lock_owner: "worker-1",
      });

      await markRemoteChannelQueueItemDone(7, "msg-123");
      await markRemoteChannelQueueItemSkipped(7, "duplicate");
      await markRemoteChannelQueueItemRetry(7, {
        failed: false,
        error: "timeout",
      });
      await purgeOldRemoteChannelQueueItems(new Date().toISOString());
    });
  });

  describe("Message Files and Metadata Functions under Dual Drivers", () => {
    test("createMessageFiles, findMessageFileById, listMessageFilesByMessageIds, listMessageFilesNeedingMetadata, updateMessageFileMetadata", async () => {
      process.env.DB_CLIENT = "postgres";
      vi.spyOn(dbKnex, "raw").mockImplementation(async (sql) => {
        const lower = String(sql || "").toLowerCase();
        if (lower.includes("select") && lower.includes("chat_message_files")) {
          return {
            rows: [
              {
                id: "f1",
                message_id: "m1",
                stored_name: "file1.png",
                original_name: "orig.png",
              },
            ],
          };
        }
        return { rows: [], rowCount: 1 };
      });

      await createMessageFiles("m1", [
        {
          storedName: "file1.png",
          originalName: "orig.png",
          mimeType: "image/png",
          sizeBytes: 100,
        },
      ]);

      const file = await findMessageFileById("f1");
      expect(file).toHaveProperty("stored_name", "file1.png");

      const fileList = await listMessageFilesByMessageIds(["m1"]);
      expect(Array.isArray(fileList)).toBe(true);

      const needingMeta = await listMessageFilesNeedingMetadata(10);
      expect(Array.isArray(needingMeta)).toBe(true);

      await updateMessageFileMetadata("f1", { width: 800, height: 600 });
    });
  });

  describe("User Profile, Password, Status, and Membership Mutation Functions under Dual Drivers", () => {
    test("user updates and membership functions under Postgres mode", async () => {
      process.env.DB_CLIENT = "postgres";
      vi.spyOn(dbKnex, "raw").mockResolvedValue({ rows: [], rowCount: 1 });

      await updateUserProfile("u1", "newname", "New Nick", "http://avatar.jpg");
      await updateUserPassword("u1", "newhash");
      await updateUserStatus("u1", "offline");
      await setUserBanned("u1", true);
      await deleteSessionsByUserId("u1");
      await updateLastSeen("u1");

      await regenerateGroupInviteToken("c1", "token-abc");
      await updateGroupChat("c1", { name: "Updated Group" });
      await updateChannelChat("c1", { name: "Updated Channel" });
      await setChatMemberRole("c1", "u1", "admin");
      await removeChatMember("c1", "u1");
      await markChatMemberLeft("c1", "u1");
      await clearChatMemberLeft("c1", "u1");
      await markGroupMemberRemoved("c1", "u1", "admin1");
      await clearGroupMemberRemoved("c1", "u1");
    });
  });

  describe("Push Subscriptions, Mutes, Hiding and Admin Mutations under Dual Drivers", () => {
    test("push subscriptions and mutes under Postgres mode", async () => {
      process.env.DB_CLIENT = "postgres";
      vi.spyOn(dbKnex, "raw").mockImplementation(async (sql) => {
        const lower = String(sql || "").toLowerCase();
        if (lower.includes("select") && lower.includes("push_subscriptions")) {
          return { rows: [{ user_id: "u1", endpoint: "https://push.com" }] };
        }
        return { rows: [], rowCount: 1 };
      });

      await upsertPushSubscription("u1", "https://push.com", "p256", "auth", 1);
      const subs = await listPushSubscriptionsByUserIds(["u1"]);
      expect(Array.isArray(subs)).toBe(true);
      await deletePushSubscription("https://push.com");

      await hideChatsForUser("u1", ["c1", "c2"]);
      await unhideChat("u1", "c1");
      await setChatMuted("u1", "c1", true);
      await setChatMuted("u1", "c1", false);
    });

    test("admin operations (ban, deleteUser, deleteChat, clearAllMessages, resetDatabase, bootstrap) under Postgres mode", async () => {
      process.env.DB_CLIENT = "postgres";
      vi.spyOn(dbKnex, "raw").mockResolvedValue({
        rows: [{ stored_name: "f1.png" }],
        rowCount: 1,
      });
      vi.spyOn(dbKnex, "transaction").mockImplementation(async (cb) => {
        const trx = (table) => {
          const qb = dbKnex(table);
          qb.then = function (resolve, reject) {
            if (table.includes("chat_message_files")) {
              return Promise.resolve([{ stored_name: "f1.png" }]).then(
                resolve,
                reject,
              );
            }
            return Promise.resolve([]).then(resolve, reject);
          };
          return qb;
        };
        trx.raw = async () => ({
          rows: [{ stored_name: "f1.png" }],
          rowCount: 1,
        });
        return cb(trx);
      });

      await adminBanUser("u1", true);
      const delUserRes = await adminDeleteUser("u1");
      expect(delUserRes).toBeDefined();

      const delChatRes = await adminDeleteChat("c1");
      expect(delChatRes).toBeDefined();

      const clearRes = await adminClearAllMessages();
      expect(clearRes).toEqual({ storedNames: ["f1.png"] });

      const resetRes = await adminResetDatabase();
      expect(resetRes).toEqual({ storedNames: ["f1.png"] });

      await bootstrapAdminUsers(["admin1"]);
    });

    test("dbSettings helpers under Postgres mode", async () => {
      process.env.DB_CLIENT = "postgres";
      vi.spyOn(dbKnex, "raw").mockImplementation(async (sql) => {
        const lower = String(sql || "").toLowerCase();
        if (lower.includes("select")) {
          return { rows: [{ key: "k1", value: "v1" }] };
        }
        return { rows: [], rowCount: 1 };
      });

      await dbSetSetting("site_name", "Songbird");
      await dbDeleteSetting("site_name");
      const settings = await dbGetAllSettings();
      expect(Array.isArray(settings)).toBe(true);
      expect(settings[0]).toEqual({ key: "k1", value: "v1" });
    });
  });
});
