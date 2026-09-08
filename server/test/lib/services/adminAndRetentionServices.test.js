import { describe, test, expect, vi } from "vitest";
import { createAdminAccountService } from "../../../lib/services/adminAccountService.js";
import { createRetentionService } from "../../../lib/services/retentionService.js";

const USER_ID = "50505050-5050-4050-8050-505050505050";

describe("adminAccountService", () => {
  const createMockDb = () => ({
    createUser: vi.fn(() => USER_ID),
    updateUserRole: vi.fn(),
    setUserBanned: vi.fn(),
    findUserById: vi.fn((id) => (id === USER_ID ? { id: USER_ID, username: "charlie" } : null)),
    findUserByUsername: vi.fn((un) => null),
    deleteSessionByUserId: vi.fn(),
  });

  test("createAccount creates user and sets role", () => {
    const db = createMockDb();
    const service = createAdminAccountService(db);

    const res = service.createAccount({
      username: "charlie",
      passwordHash: "hash123",
      role: "admin",
    });

    expect(res.success).toBe(true);
    expect(res.userId).toBe(USER_ID);
    expect(db.createUser).toHaveBeenCalledWith("charlie", "hash123", undefined, undefined, undefined);
    expect(db.updateUserRole).toHaveBeenCalledWith(USER_ID, "admin");
  });

  test("setAccountBanStatus sets banned status and revokes sessions when banned", () => {
    const db = createMockDb();
    const service = createAdminAccountService(db);

    const res = service.setAccountBanStatus({ targetUserId: USER_ID, banned: true });

    expect(res.success).toBe(true);
    expect(db.setUserBanned).toHaveBeenCalledWith(USER_ID, true, "");
    expect(db.deleteSessionByUserId).toHaveBeenCalledWith(USER_ID);
  });
});

describe("retentionService", () => {
  const createMockDb = () => ({
    cleanupMissingMessageFiles: vi.fn(() => ["f1", "f2"]),
    deleteExpiredMessages: vi.fn(() => 5),
  });

  test("runRetentionCleanup runs missing file and expired message cleanup", () => {
    const db = createMockDb();
    const service = createRetentionService(db);

    const res = service.runRetentionCleanup();

    expect(res.success).toBe(true);
    expect(res.missingFilesCleaned).toBe(2);
    expect(res.expiredMessagesDeleted).toBe(5);
  });
});
