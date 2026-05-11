import { useEffect, useRef } from "react";
import {
  isMessageAuthoredByUser,
  isRemoteChannelMessage,
} from "../../utils/messageOwnership.js";

const patchChatAndMoveToFront = (chats, chatId, updateChat) => {
  const targetChatId = Number(chatId || 0);
  if (!targetChatId) return { nextChats: chats, found: false };
  const index = chats.findIndex((chat) => Number(chat?.id) === targetChatId);
  if (index < 0) return { nextChats: chats, found: false };
  const currentChat = chats[index];
  const nextChat = updateChat(currentChat);
  if (!nextChat || nextChat === currentChat) {
    return { nextChats: chats, found: true };
  }
  if (index === 0) {
    const nextChats = chats.slice();
    nextChats[0] = nextChat;
    return { nextChats, found: true };
  }
  const nextChats = chats.slice();
  nextChats.splice(index, 1);
  nextChats.unshift(nextChat);
  return { nextChats, found: true };
};

const isDocumentActive = () => {
  if (typeof document === "undefined") return false;
  return document.visibilityState === "visible" && document.hasFocus();
};

export function useChatEvents({
  username,
  getSseStreamUrl,
  sseReconnectDelayMs,
  setSseConnected,
  loadChatsRef,
  scheduleMessageRefreshRef,
  activeChatIdRef,
  usernameRef,
  userScrolledUpRef,
  isAtBottomRef,
  pendingScrollToBottomRef,
  setUnreadInChat,
  setMessages,
  setChats,
  sseReconnectRef,
  canMarkReadInCurrentView,
  markMessagesRead,
  markMessageRead,
  isMarkingReadRef,
  onIncomingMessage,
  onMessageDeleted,
  onChatRead,
  onPresenceUpdate,
  onProfileUpdated,
  onTypingUpdate,
  onChatListChanged,
  onSessionRevoked,
}) {
  const onIncomingMessageRef = useRef(onIncomingMessage);
  const onMessageDeletedRef = useRef(onMessageDeleted);
  const onChatReadRef = useRef(onChatRead);
  const onPresenceUpdateRef = useRef(onPresenceUpdate);
  const onProfileUpdatedRef = useRef(onProfileUpdated);
  const onTypingUpdateRef = useRef(onTypingUpdate);
  const onChatListChangedRef = useRef(onChatListChanged);
  const onSessionRevokedRef = useRef(onSessionRevoked);
  const canMarkReadInCurrentViewRef = useRef(canMarkReadInCurrentView);
  const loadChatsTimerRef = useRef(null);
  const loadChatsScheduledRef = useRef(false);

  useEffect(() => {
    onIncomingMessageRef.current = onIncomingMessage;
  }, [onIncomingMessage]);

  useEffect(() => {
    onMessageDeletedRef.current = onMessageDeleted;
  }, [onMessageDeleted]);

  useEffect(() => {
    onChatReadRef.current = onChatRead;
  }, [onChatRead]);

  useEffect(() => {
    onPresenceUpdateRef.current = onPresenceUpdate;
  }, [onPresenceUpdate]);

  useEffect(() => {
    onProfileUpdatedRef.current = onProfileUpdated;
  }, [onProfileUpdated]);

  useEffect(() => {
    onTypingUpdateRef.current = onTypingUpdate;
  }, [onTypingUpdate]);

  useEffect(() => {
    onChatListChangedRef.current = onChatListChanged;
  }, [onChatListChanged]);

  useEffect(() => {
    onSessionRevokedRef.current = onSessionRevoked;
  }, [onSessionRevoked]);

  useEffect(() => {
    canMarkReadInCurrentViewRef.current = Boolean(canMarkReadInCurrentView);
  }, [canMarkReadInCurrentView]);

  useEffect(() => {
    if (!username) return;
    let source = null;
    let isMounted = true;
    let reconnectAttempts = 0;

    const scheduleLoadChats = () => {
      if (loadChatsScheduledRef.current) return;
      loadChatsScheduledRef.current = true;
      loadChatsTimerRef.current = window.setTimeout(() => {
        loadChatsScheduledRef.current = false;
        loadChatsTimerRef.current = null;
        void loadChatsRef.current?.({ silent: true });
      }, 180);
    };

    const connect = () => {
      if (!isMounted) return;
      source = new EventSource(getSseStreamUrl(username), {
        withCredentials: true,
      });
      source.onopen = () => {
        setSseConnected(true);
        reconnectAttempts = 0;
      };

      source.onmessage = (event) => {
        let payload = null;
        try {
          payload = JSON.parse(event.data);
        } catch {
          return;
        }
        if (!payload?.type) return;
        if (
          payload.type !== "chat_message" &&
          payload.type !== "chat_read" &&
          payload.type !== "chat_message_deleted" &&
          payload.type !== "chat_message_updated" &&
          payload.type !== "chat_list_changed" &&
          payload.type !== "presence_update" &&
          payload.type !== "profile_updated" &&
          payload.type !== "chat_typing" &&
          payload.type !== "session_revoked"
        ) {
          return;
        }
        if (payload.type === "session_revoked") {
          onSessionRevokedRef.current?.(payload);
          return;
        }
        if (payload.type === "presence_update") {
          onPresenceUpdateRef.current?.(payload);
          return;
        }
        if (payload.type === "profile_updated") {
          onProfileUpdatedRef.current?.(payload);
          return;
        }
        if (payload.type === "chat_typing") {
          onTypingUpdateRef.current?.(payload);
          return;
        }
        const payloadChatId = Number(payload.chatId || 0);
        const currentActiveId = activeChatIdRef.current;
        const payloadUsername = String(payload?.username || "").toLowerCase();
        const currentUsername = String(usernameRef.current || "").toLowerCase();
        const isOwnEvent =
          payloadUsername === currentUsername && !isRemoteChannelMessage(payload);
        if (payload.type === "chat_list_changed") {
          scheduleLoadChats();
          onChatListChangedRef.current?.(payload);
          return;
        }
        const isIncomingMessage =
          payload.type === "chat_message" && !isOwnEvent;
        const isDeleteEvent = payload.type === "chat_message_deleted";
        const isUpdateEvent = payload.type === "chat_message_updated";
        const isSelectedChat =
          Boolean(currentActiveId) &&
          Number(payloadChatId) === Number(currentActiveId);
        const isReadableActiveChat =
          isSelectedChat &&
          isDocumentActive() &&
          canMarkReadInCurrentViewRef.current;
        if (payload.type === "chat_message" && payloadChatId) {
          const eventTime = new Date().toISOString();
          const previewBody = String(
            payload?.summaryText || payload?.body || "",
          ).trim();
          let foundChat = false;
          setChats((prev) => {
            const { nextChats, found } = patchChatAndMoveToFront(
              prev,
              payloadChatId,
              (chat) => {
                const currentUnread = Math.max(0, Number(chat?.unread_count || 0));
                const clientRequestId = String(
                  payload?.client_request_id || payload?.clientRequestId || "",
                ).trim();
                return {
                  ...chat,
                  last_message_id:
                    Number(payload?.messageId || 0) || chat?.last_message_id || null,
                  last_message: previewBody || chat?.last_message || "",
                  last_time: eventTime,
                  last_message_client_request_id: clientRequestId || null,
                  last_sender_username:
                    String(payload?.username || "").trim() ||
                    chat?.last_sender_username ||
                    "",
                  last_message_read_at: isOwnEvent
                    ? null
                    : chat?.last_message_read_at || null,
                  unread_count:
                    isReadableActiveChat
                      ? 0
                      : !isOwnEvent
                        ? currentUnread + 1
                        : currentUnread,
                };
              },
            );
            foundChat = found;
            return nextChats;
          });
          if (!foundChat) {
            scheduleLoadChats();
          }
        }
        if (isDeleteEvent) {
          scheduleLoadChats();
          onMessageDeletedRef.current?.(payload);
        }
        if (isIncomingMessage) {
          onIncomingMessageRef.current?.(payload, {
            isActiveChat: isReadableActiveChat,
            isSelectedChat,
            isOwnEvent,
            body: String(payload?.body || ""),
          });
        }
        if (payload.type === "chat_read" && !isOwnEvent && payloadChatId) {
          const nowIso = new Date().toISOString();
          setChats((prev) =>
            prev.map((chat) =>
              Number(chat?.id) === payloadChatId
                ? {
                    ...chat,
                    last_message_read_at: nowIso,
                    unread_count:
                      isReadableActiveChat
                        ? 0
                        : Number(chat?.unread_count || 0),
                  }
                : chat,
            ),
          );
        }
        if (isSelectedChat) {
          if (isIncomingMessage) {
            if (!isReadableActiveChat) {
              // The chat may be selected in a hidden/background tab. Keep it
              // unread and avoid pretending the user saw the message.
            } else if (userScrolledUpRef.current && !isAtBottomRef.current) {
              setUnreadInChat((prev) => prev + 1);
            } else {
              pendingScrollToBottomRef.current = true;
              setChats((prev) =>
                prev.map((chat) =>
                  Number(chat?.id) === Number(payloadChatId)
                    ? { ...chat, unread_count: 0 }
                    : chat,
                ),
              );
              if (!isMarkingReadRef?.current) {
                isMarkingReadRef.current = true;
                const markReadRequest =
                  Number(payload?.messageId || 0) > 0
                    ? markMessageRead({
                        chatId: payloadChatId,
                        username: usernameRef.current,
                        messageId: Number(payload.messageId),
                      })
                    : markMessagesRead({
                        chatId: payloadChatId,
                        username: usernameRef.current,
                      });
                markReadRequest
                  .catch(() => null)
                  .finally(() => {
                    isMarkingReadRef.current = false;
                  });
              }
            }
          }
          if (payload.type === "chat_read" && !isOwnEvent) {
            onChatReadRef.current?.(payload);
            const nowIso = new Date().toISOString();
            setMessages((prev) =>
              prev.map((msg) => {
                const fromCurrentUser = isMessageAuthoredByUser(msg, {
                  username: usernameRef.current,
                });
                if (!fromCurrentUser || msg?.read_at) return msg;
                return { ...msg, read_at: nowIso };
              }),
            );
          }
          if (isDeleteEvent) {
            const messageIds = Array.isArray(payload?.messageIds)
              ? payload.messageIds
                  .map((id) => Number(id))
                  .filter((id) => Number.isFinite(id))
              : [];
            if (messageIds.length) {
              const deletedIdSet = new Set(messageIds);
              setMessages((prev) =>
                prev
                  .filter((msg) => {
                    const serverId = Number(msg?._serverId || msg?.id || 0);
                    return !deletedIdSet.has(serverId);
                  })
                  .map((msg) => {
                    const replyId = Number(msg?.replyTo?.id || 0);
                    if (!replyId || !deletedIdSet.has(replyId)) return msg;
                    return {
                      ...msg,
                      replyTo: null,
                    };
                  }),
              );
            }
            scheduleMessageRefreshRef.current?.(currentActiveId, {
              preserveHistory: true,
              pruneMissing: true,
            });
            return;
          }
          if (isUpdateEvent) {
            scheduleLoadChats();
          }
          scheduleMessageRefreshRef.current?.(currentActiveId, {
            preserveHistory: true,
            pruneMissing: isUpdateEvent,
          });
        }
      };

      source.onerror = () => {
        setSseConnected(false);
        source?.close();
        if (!isMounted) return;
        if (sseReconnectRef.current) {
          clearTimeout(sseReconnectRef.current);
        }
        // Exponential backoff with jitter to avoid thundering herd on server restart.
        const backoffDelay = Math.min(
          30000,
          sseReconnectDelayMs * Math.pow(2, reconnectAttempts),
        );
        const jitter = Math.random() * 1000;
        const delay = backoffDelay + jitter;
        reconnectAttempts += 1;
        sseReconnectRef.current = setTimeout(connect, delay);
      };
    };

    void connect();

    return () => {
      isMounted = false;
      setSseConnected(false);
      source?.close();
      if (sseReconnectRef.current) {
        clearTimeout(sseReconnectRef.current);
      }
      if (loadChatsTimerRef.current) {
        clearTimeout(loadChatsTimerRef.current);
        loadChatsTimerRef.current = null;
      }
      loadChatsScheduledRef.current = false;
    };
  }, [
    activeChatIdRef,
    getSseStreamUrl,
    isAtBottomRef,
    loadChatsRef,
    pendingScrollToBottomRef,
    scheduleMessageRefreshRef,
    setChats,
    setMessages,
    setSseConnected,
    setUnreadInChat,
    isMarkingReadRef,
    markMessageRead,
    markMessagesRead,
    sseReconnectDelayMs,
    sseReconnectRef,
    userScrolledUpRef,
    username,
    usernameRef,
  ]);
}
