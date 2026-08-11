import { useEffect, useRef } from "react";
import { getWebSocketUrl } from "../../api/chatApi.js";
import {
  isMessageAuthoredByUser,
  isRemoteChannelMessage,
} from "../../utils/messageOwnership.js";
import { normalizeUuid, isValidUuid } from "../../utils/uuidUtils.js";

const patchChatAndMoveToFront = (chats, chatId, updateChat) => {
  const targetChatId = normalizeUuid(chatId) || null;
  if (!targetChatId) return { nextChats: chats, found: false };
  const index = chats.findIndex((chat) => {
    if (!chat?.id) return false;
    return String(chat.id).toLowerCase() === String(targetChatId).toLowerCase();
  });
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
  unreadMarkerIdRef,
  unreadAnchorLockUntilRef,
  pendingScrollToUnreadRef,
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
  const loadChatsFirstScheduledAtRef = useRef(0);

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
    let useWebSocket = typeof WebSocket !== "undefined";
    let wsOpened = false;

    // Trailing debounce for chat-list reloads. Each event pushes the flush out
    // by LOAD_CHATS_DEBOUNCE_MS so a burst (e.g. bulk deletes, rapid list
    // changes) collapses into a single listChatsForUser reload. A max-wait
    // ceiling guarantees a continuous stream still reloads within a bounded
    // time instead of being starved forever.
    const LOAD_CHATS_DEBOUNCE_MS = 250;
    const LOAD_CHATS_MAX_WAIT_MS = 1000;

    const flushLoadChats = () => {
      loadChatsTimerRef.current = null;
      loadChatsFirstScheduledAtRef.current = 0;
      void loadChatsRef.current?.({ silent: true });
    };

    const scheduleLoadChats = () => {
      const now = Date.now();
      if (!loadChatsFirstScheduledAtRef.current) {
        loadChatsFirstScheduledAtRef.current = now;
      }
      if (loadChatsTimerRef.current) {
        window.clearTimeout(loadChatsTimerRef.current);
      }
      const elapsed = now - loadChatsFirstScheduledAtRef.current;
      const remainingMaxWait = Math.max(0, LOAD_CHATS_MAX_WAIT_MS - elapsed);
      const delay = Math.min(LOAD_CHATS_DEBOUNCE_MS, remainingMaxWait);
      loadChatsTimerRef.current = window.setTimeout(flushLoadChats, delay);
    };

    const connect = () => {
      if (!isMounted) return;
      wsOpened = false;
      let ws = null;
      if (useWebSocket) {
        try {
          const wsUrl = getWebSocketUrl();
          ws = new WebSocket(wsUrl);
          source = ws;
        } catch (_) {
          useWebSocket = false;
        }
      }

      if (!useWebSocket) {
        source = new EventSource(getSseStreamUrl(username), {
          withCredentials: true,
        });
      }

      const handleOpen = () => {
        if (source instanceof WebSocket) {
          wsOpened = true;
        }
        setSseConnected(true);
        reconnectAttempts = 0;
      };

      const handleMessageData = (dataStr) => {
        let payload = null;
        try {
          payload = JSON.parse(dataStr);
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
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("songbird:realtime-event", { detail: payload }));
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
        const payloadChatId = normalizeUuid(payload.chatId) || null;
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
          Boolean(currentActiveId) && Boolean(payloadChatId) &&
          String(payloadChatId).toLowerCase() === String(currentActiveId).toLowerCase();
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
                    normalizeUuid(payload?.messageId) || chat?.last_message_id || null,
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
            prev.map((chat) => {
              if (!chat?.id) return chat;
              const matches = String(chat.id).toLowerCase() === String(payloadChatId).toLowerCase();
              return matches
                ? {
                    ...chat,
                    last_message_read_at: nowIso,
                    unread_count:
                      isReadableActiveChat
                        ? 0
                        : Number(chat?.unread_count || 0),
                  }
                : chat;
            }),
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
              // Only scroll to bottom if no unread anchor is active
              const anchorActive =
                (unreadMarkerIdRef?.current !== null && unreadMarkerIdRef?.current !== undefined) ||
                Date.now() < Number(unreadAnchorLockUntilRef?.current || 0) ||
                (pendingScrollToUnreadRef?.current !== null && pendingScrollToUnreadRef?.current !== undefined);
              if (!anchorActive) {
                pendingScrollToBottomRef.current = true;
              }
              setChats((prev) =>
                prev.map((chat) => {
                  if (!chat?.id) return chat;
                  const matches = String(chat.id).toLowerCase() === String(payloadChatId).toLowerCase();
                  return matches ? { ...chat, unread_count: 0 } : chat;
                }),
              );
              if (!isMarkingReadRef?.current) {
                isMarkingReadRef.current = true;
                const payloadMsgId = normalizeUuid(payload?.messageId) || null;
                const markReadRequest =
                  payloadMsgId
                    ? markMessageRead({
                        chatId: payloadChatId,
                        username: usernameRef.current,
                        messageId: payloadMsgId,
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
                  .map((id) => normalizeUuid(id))
                  .filter(Boolean)
              : [];
            if (messageIds.length) {
              const deletedIdSet = new Set(messageIds);
              setMessages((prev) =>
                prev
                  .filter((msg) => {
                    const serverId = normalizeUuid(msg?._serverId || msg?.id) || null;
                    return !serverId || !deletedIdSet.has(serverId);
                  })
                  .map((msg) => {
                    const replyId = normalizeUuid(msg?.replyTo?.id) || null;
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
          if (payload.type === "chat_read") {
            // Read receipts are already applied to messages/chat state above
            // (and channel seen-counts refresh via onChatRead). No message
            // content changed, so skip the full-window refetch entirely.
            return;
          }
          if (isUpdateEvent) {
            scheduleLoadChats();
          }
          scheduleMessageRefreshRef.current?.(currentActiveId, {
            preserveHistory: true,
            pruneMissing: isUpdateEvent,
            // Plain new-message appends only need a bounded tail delta; edits
            // change existing content and must reconcile the current window.
            tailDelta: !isUpdateEvent,
          });
        }
      };

      const handleError = () => {
        setSseConnected(false);
        if (source instanceof WebSocket && !wsOpened) {
          useWebSocket = false;
        }
        try { source?.close(); } catch (_) {}
        if (!isMounted) return;
        if (sseReconnectRef.current) {
          clearTimeout(sseReconnectRef.current);
        }
        const backoffDelay = Math.min(
          30000,
          sseReconnectDelayMs * Math.pow(2, reconnectAttempts),
        );
        const jitter = Math.random() * 1000;
        const delay = backoffDelay + jitter;
        reconnectAttempts += 1;
        sseReconnectRef.current = setTimeout(connect, delay);
      };

      if (source instanceof WebSocket) {
        source.onopen = handleOpen;
        source.onmessage = (event) => handleMessageData(event.data);
        source.onerror = handleError;
        source.onclose = handleError;
      } else if (source) {
        source.onopen = handleOpen;
        source.onmessage = (event) => handleMessageData(event.data);
        source.onerror = handleError;
      }
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
      loadChatsFirstScheduledAtRef.current = 0;
    };
  }, [
    activeChatIdRef,
    getSseStreamUrl,
    isAtBottomRef,
    loadChatsRef,
    pendingScrollToBottomRef,
    pendingScrollToUnreadRef,
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
    unreadAnchorLockUntilRef,
    unreadMarkerIdRef,
    userScrolledUpRef,
    username,
    usernameRef,
  ]);
}
