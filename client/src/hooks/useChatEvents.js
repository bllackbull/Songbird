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
  onChatRead,
  onPresenceUpdate,
  onChatListChanged,
}) {
  const onIncomingMessageRef = useRef(onIncomingMessage);
  const onChatReadRef = useRef(onChatRead);
  const onPresenceUpdateRef = useRef(onPresenceUpdate);
  const onChatListChangedRef = useRef(onChatListChanged);

  useEffect(() => {
    onIncomingMessageRef.current = onIncomingMessage;
  }, [onIncomingMessage]);

  useEffect(() => {
    onChatReadRef.current = onChatRead;
  }, [onChatRead]);

  useEffect(() => {
    onPresenceUpdateRef.current = onPresenceUpdate;
  }, [onPresenceUpdate]);

  useEffect(() => {
    onChatListChangedRef.current = onChatListChanged;
  }, [onChatListChanged]);

  useEffect(() => {
    if (!username) return;
    let source = null;
    let isMounted = true;

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
          payload.type !== "chat_list_changed" &&
          payload.type !== "presence_update"
        ) {
          return;
        }
        if (payload.type === "presence_update") {
          onPresenceUpdateRef.current?.(payload);
          return;
        }
        void loadChatsRef.current?.({ silent: true });
        const payloadChatId = Number(payload.chatId || 0);
        const currentActiveId = activeChatIdRef.current;
        const isOwnEvent =
          String(payload?.username || "").toLowerCase() ===
          String(usernameRef.current || "").toLowerCase();
        if (payload.type === "chat_list_changed") {
          onChatListChangedRef.current?.(payload);
          return;
        }
        const isIncomingMessage = payload.type === "chat_message" && !isOwnEvent;
        const isDeleteEvent = payload.type === "chat_message_deleted";
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
                  ? { ...chat, last_message_read_at: nowIso }
                  : chat,
              ),
            );
          }
          if (isDeleteEvent) {
            const messageIds = Array.isArray(payload?.messageIds)
              ? payload.messageIds.map((id) => Number(id)).filter((id) => Number.isFinite(id))
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
          scheduleMessageRefreshRef.current?.(currentActiveId);
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
