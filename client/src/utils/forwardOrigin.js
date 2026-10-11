/**
 * forwardOrigin.js
 *
 * Resolves what tapping a message's "forwarded from" header should open.
 * Pure helper extracted from MessageItem so the routing logic is unit
 * testable without rendering.
 *
 * Returns one of:
 *   - null                            → header is not interactive
 *   - { kind: "chat", chatId, ... }   → open the channel/chat profile
 *   - { kind: "user", userId, ... }   → open the member profile
 *   - { kind: "self" }                → open the viewer's own profile
 *
 * NOTE: chat ids are UUID strings since the uuid-primary-keys migration, so
 * presence must be tested with truthiness — never with a numeric comparison
 * like `chatId > 0`, which is always false for UUIDs and misroutes remote
 * channel messages to the viewer's own profile.
 */
export function resolveForwardedTarget({
  forwardedFromChatId = null,
  forwardedFromUserId = null,
  forwardedFromUsername = "",
  forwardedFromLabel = "",
  forwardedOriginAvatarUrl = "",
  forwardedOriginColor = "#10b981",
  remoteForwardedChatId = null,
  storedForwardedLabel = "",
  chatName = "",
  chatColor = null,
  isDeletedForwardedChat = false,
  isDeletedForwardedUser = false,
} = {}) {
  if (isDeletedForwardedChat || isDeletedForwardedUser) return null;
  if (forwardedFromChatId) {
    return {
      kind: "chat",
      chatId: forwardedFromChatId,
      label: forwardedFromLabel,
      avatar_url: forwardedOriginAvatarUrl,
      color: forwardedOriginColor,
    };
  }
  if (forwardedFromUserId) {
    return {
      kind: "user",
      userId: forwardedFromUserId,
      username: forwardedFromUsername,
      nickname: forwardedFromLabel,
      avatar_url: forwardedOriginAvatarUrl,
      color: forwardedOriginColor,
    };
  }
  if (remoteForwardedChatId && storedForwardedLabel) {
    return {
      kind: "chat",
      chatId: remoteForwardedChatId,
      label: chatName || forwardedFromLabel,
      avatar_url: "",
      color: chatColor || "#10b981",
    };
  }
  if (storedForwardedLabel) return { kind: "self" };
  return null;
}
