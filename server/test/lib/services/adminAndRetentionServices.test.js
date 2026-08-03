import { describe, test, expect, vi } from "vitest";
import { createAdminAccountService } from "../../../lib/services/adminAccountService.js";
import { createRetentionService } from "../../../lib/services/retentionService.js";

describe("adminAccountService", () => {
  const createMockDb = () => ({
    createUser: vi.fn(() => 50),
    updateUserRole: vi.fn(),
    setUserBanned: vi.fn(),
    findUserById: vi.fn((id) => (id === 50 ? { id: 50, username: "charlie" } : null)),
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
    expect(res.userId).toBe(50);
    expect(db.createUser).toHaveBeenCalledWith("charlie", "hash123", undefined, undefined, undefined);
    expect(db.updateUserRole).toHaveBeenCalledWith(50, "admin");
  });

  test("setAccountBanStatus sets banned status and revokes sessions when banned", () => {
    const db = createMockDb();
    const service = createAdminAccountService(db);

    const res = service.setAccountBanStatus({ targetUserId: 50, banned: true });

    expect(res.success).toBe(true);
    expect(db.setUserBanned).toHaveBeenCalledWith(50, true, "");
    expect(db.deleteSessionByUserId).toHaveBeenCalledWith(50);
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
