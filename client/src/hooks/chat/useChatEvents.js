import { useEffect, useRef } from "react";

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
  onIncomingMessage,
  onMessageDeleted,
  onChatRead,
  onPresenceUpdate,
  onTypingUpdate,
  onChatListChanged,
  onSessionRevoked,
}) {
  const onIncomingMessageRef = useRef(onIncomingMessage);
  const onMessageDeletedRef = useRef(onMessageDeleted);
  const onChatReadRef = useRef(onChatRead);
  const onPresenceUpdateRef = useRef(onPresenceUpdate);
  const onTypingUpdateRef = useRef(onTypingUpdate);
  const onChatListChangedRef = useRef(onChatListChanged);
  const onSessionRevokedRef = useRef(onSessionRevoked);
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
    onTypingUpdateRef.current = onTypingUpdate;
  }, [onTypingUpdate]);

  useEffect(() => {
    onChatListChangedRef.current = onChatListChanged;
  }, [onChatListChanged]);

  useEffect(() => {
    onSessionRevokedRef.current = onSessionRevoked;
  }, [onSessionRevoked]);

  useEffect(() => {
    if (!username) return;
    let source = null;
    let isMounted = true;
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
        if (payload.type === "chat_typing") {
          onTypingUpdateRef.current?.(payload);
          return;
        }
        const payloadChatId = Number(payload.chatId || 0);
        const currentActiveId = activeChatIdRef.current;
        const isOwnEvent =
          String(payload?.username || "").toLowerCase() ===
          String(usernameRef.current || "").toLowerCase();
        if (payload.type === "chat_list_changed") {
          scheduleLoadChats();
          onChatListChangedRef.current?.(payload);
          return;
        }
        const isIncomingMessage =
          payload.type === "chat_message" && !isOwnEvent;
        const isDeleteEvent = payload.type === "chat_message_deleted";
        const isUpdateEvent = payload.type === "chat_message_updated";
        if (payload.type === "chat_message" && payloadChatId) {
          const eventTime = new Date().toISOString();
          const previewBody = String(
            payload?.summaryText || payload?.body || "",
          ).trim();
          let foundChat = false;
          setChats((prev) => {
            const next = prev.map((chat) => {
              if (Number(chat?.id) !== payloadChatId) return chat;
              foundChat = true;
              const isActiveChat =
                Number(currentActiveId || 0) === Number(payloadChatId);
              const currentUnread = Math.max(0, Number(chat?.unread_count || 0));
              return {
                ...chat,
                last_message_id:
                  Number(payload?.messageId || 0) || chat?.last_message_id || null,
                last_message: previewBody || chat?.last_message || "",
                last_time: eventTime,
                last_sender_username:
                  String(payload?.username || "").trim() ||
                  chat?.last_sender_username ||
                  "",
                unread_count:
                  !isOwnEvent && !isActiveChat ? currentUnread + 1 : currentUnread,
              };
            });
            return next.sort((left, right) => {
              const leftTime = left?.last_time ? Date.parse(left.last_time) : 0;
              const rightTime = right?.last_time ? Date.parse(right.last_time) : 0;
              return rightTime - leftTime;
            });
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
            isActiveChat: currentActiveId && payloadChatId === currentActiveId,
            isOwnEvent,
            body: String(payload?.body || ""),
          });
        }
        if (currentActiveId && payloadChatId === currentActiveId) {
          if (isIncomingMessage) {
            if (userScrolledUpRef.current && !isAtBottomRef.current) {
              setUnreadInChat((prev) => prev + 1);
            } else {
              pendingScrollToBottomRef.current = true;
            }
          }
          if (payload.type === "chat_read" && !isOwnEvent) {
            onChatReadRef.current?.(payload);
            const nowIso = new Date().toISOString();
            setMessages((prev) =>
              prev.map((msg) => {
                const fromCurrentUser =
                  String(msg?.username || "").toLowerCase() ===
                  String(usernameRef.current || "").toLowerCase();
                if (!fromCurrentUser || msg?.read_at) return msg;
                return { ...msg, read_at: nowIso };
              }),
            );
            setChats((prev) =>
              prev.map((chat) =>
                Number(chat?.id) === payloadChatId
                  ? {
                      ...chat,
                      last_message_read_at: nowIso,
                      unread_count:
                        Number(currentActiveId || 0) === Number(payloadChatId)
                          ? 0
                          : Number(chat?.unread_count || 0),
                    }
                  : chat,
              ),
            );
          }
          if (isDeleteEvent) {
            const messageIds = Array.isArray(payload?.messageIds)
              ? payload.messageIds
                  .map((id) => Number(id))
                  .filter((id) => Number.isFinite(id))
              : [];
            if (messageIds.length) {
              setMessages((prev) =>
                prev.filter((msg) => {
                  const serverId = Number(msg?._serverId || msg?.id || 0);
                  return !messageIds.includes(serverId);
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
        sseReconnectRef.current = setTimeout(connect, sseReconnectDelayMs);
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
    sseReconnectDelayMs,
    sseReconnectRef,
    userScrolledUpRef,
    username,
    usernameRef,
  ]);
}
