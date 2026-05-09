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
  const userId = Number(user?.id || 0);
  if (!username && !userId) return false;
  if (isRemoteChannelMessage(message)) return false;
  if (username) {
    return String(message?.username || "").trim().toLowerCase() === username;
  }
  return Number(message?.user_id || message?.userId || 0) === userId;
};

export const isMessageFromOtherUser = (message, user) =>
  !isMessageAuthoredByUser(message, user);
