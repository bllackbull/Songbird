/**
 * Administrative Account Domain Service
 *
 * Encapsulates administrative user actions (user creation, role changes,
 * ban/unban toggles, password resets, and session revocations) across the
 * admin panel UI and CLI administration tools.
 */

export function createAdminAccountService(dbApi) {
  const {
    createUser,
    updateUserRole,
    setUserBanned,
    updateUserPassword,
    findUserById,
    findUserByUsername,
    deleteSessionByUserId,
  } = dbApi;

  /**
   * Admin-initiated user creation.
   */
  function createAccount({ username, passwordHash, nickname, avatarUrl, color, role = "user" }) {
    const existing = findUserByUsername(username);
    if (existing) throw new Error("Username already taken");

    if (typeof createUser !== "function") throw new Error("createUser function not available");

    const userId = createUser(username, passwordHash, nickname, avatarUrl, color);

    if (role && role !== "user" && typeof updateUserRole === "function") {
      updateUserRole(userId, role);
    }

    return {
      success: true,
      userId,
      username,
    };
  }

  /**
   * Set user ban status.
   */
  function setAccountBanStatus({ targetUserId, banned, reason = "" }) {
    const user = findUserById(targetUserId);
    if (!user) throw new Error("User not found");

    if (typeof setUserBanned === "function") {
      setUserBanned(targetUserId, Boolean(banned), reason);
    }

    // Revoke sessions if banned
    if (banned && typeof deleteSessionByUserId === "function") {
      deleteSessionByUserId(targetUserId);
    }

    return {
      success: true,
      userId: targetUserId,
      banned: Boolean(banned),
    };
  }

  /**
   * Change user role.
   */
  function setAccountRole({ targetUserId, newRole }) {
    const user = findUserById(targetUserId);
    if (!user) throw new Error("User not found");

    if (typeof updateUserRole === "function") {
      updateUserRole(targetUserId, newRole);
    }

    return {
      success: true,
      userId: targetUserId,
      role: newRole,
    };
  }

  return {
    createAccount,
    setAccountBanStatus,
    setAccountRole,
  };
}
