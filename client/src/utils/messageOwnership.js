export const isRemoteChannelMessage = (message) =>
  /^remote:/i.test(
    String(
      message?.client_request_id ||
        message?.clientRequestId ||
        message?._clientId ||
        "",
    ).trim(),
  ) || Boolean(message?.isRemoteChannelMessage);

export const isMessageAuthoredByUser = (message, user) => {
  const username = String(user?.username || user || "").trim().toLowerCase();
  const userId = user?.id ? String(user.id).trim().toLowerCase() : null;
  if (!username && !userId) return false;
  if (isRemoteChannelMessage(message)) return false;
  if (username) {
    return String(message?.username || "").trim().toLowerCase() === username;
  }
  // Compare user IDs as case-insensitive strings (UUID-safe)
  const msgUserId = String(message?.user_id || message?.userId || "").trim().toLowerCase();
  return Boolean(userId && msgUserId && msgUserId === userId);
};

export const isMessageFromOtherUser = (message, user) =>
  !isMessageAuthoredByUser(message, user);
