import { useEffect, useRef, useState } from "react";

const SILENT_FETCH_TRACK_MAX_CHATS = 40;

export function useMessagesLoader({
  user,
  chats,
  activeChat,
  activeChatIdRef,
  activeChatTypeRef,
  isActiveChannelChat,
  isAppActive,
  isMobileViewport,
  mobileTab,
  setMessages,
  setUnreadInChat,
  setUnreadMarkerId,
  setUserScrolledUp,
  setIsAtBottom,
  setChannelSeenCounts,
  lastMessageIdRef,
  openingChatRef,
  openingUnreadCountRef,
  openingHadUnreadRef,
  pendingScrollToUnreadRef,
  unreadMarkerIdRef,
  pendingScrollToBottomRef,
  userScrolledUpRef,
  isAtBottomRef,
  unreadAnchorLockUntilRef,
  shouldAutoMarkReadRef,
  allowStartReachedRef,
  formatDayLabel,
  formatTime,
  parseServerDate,
  resolveReplyPreview,
  normalizeMessageBody,
  CHAT_PAGE_CONFIG,
  listMessagesByQuery,
  markMessagesRead,
}) {
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [hasOlderMessages, setHasOlderMessages] = useState(false);
  const messageFetchInFlightRef = useRef(false);
  const queuedSilentMessageRefreshRef = useRef(null);
  const messageFetchAbortRef = useRef(null);
  const messageFetchRequestIdRef = useRef(0);
  const lastSilentFetchByChatRef = useRef(new Map());

  const markSilentFetchAt = (chatId, timestamp) => {
    const key = Number(chatId || 0);
    if (!key) return;
    const map = lastSilentFetchByChatRef.current;
    map.set(key, Number(timestamp || Date.now()));
    if (map.size > 1) {
      const value = map.get(key);
      map.delete(key);
      map.set(key, value);
    }
    while (map.size > SILENT_FETCH_TRACK_MAX_CHATS) {
      const oldestKey = map.keys().next().value;
      if (oldestKey === undefined) break;
      map.delete(oldestKey);
    }
  };

  useEffect(
    () => () => {
      if (messageFetchAbortRef.current) {
        messageFetchAbortRef.current.abort();
        messageFetchAbortRef.current = null;
      }
      queuedSilentMessageRefreshRef.current = null;
      messageFetchInFlightRef.current = false;
    },
    [],
  );

  async function loadMessages(chatId, options = {}) {
    const requestChatId = Number(chatId);
    const isSilentRefresh = Boolean(options.silent);
    if (isSilentRefresh) {
      const now = Date.now();
      const lastAt = Number(lastSilentFetchByChatRef.current.get(requestChatId) || 0);
      if (lastAt && now - lastAt < 320) {
        queuedSilentMessageRefreshRef.current = {
          chatId: requestChatId,
          options: { ...options, silent: true },
        };
        return;
      }
      markSilentFetchAt(requestChatId, now);
    }
    const requestId = messageFetchRequestIdRef.current + 1;
    messageFetchRequestIdRef.current = requestId;
    if (messageFetchAbortRef.current) {
      messageFetchAbortRef.current.abort();
    }
    const controller = new AbortController();
    messageFetchAbortRef.current = controller;
    if (!options.silent) {
      setLoadingMessages(true);
    }
    if (
      messageFetchInFlightRef.current &&
      options.silent &&
      options.preserveHistory &&
      !options.prepend
    ) {
      queuedSilentMessageRefreshRef.current = {
        chatId: Number(chatId),
        options: { ...options, silent: true, preserveHistory: true },
      };
      return;
    }
    messageFetchInFlightRef.current = true;
    try {
      const fetchLimit = Number(
        options.limit || CHAT_PAGE_CONFIG.messageFetchLimit,
      );
      const query = new URLSearchParams({
        chatId: String(chatId),
        username: user.username,
        limit: String(fetchLimit),
      });
      if (options.beforeId) {
        query.set("beforeId", String(options.beforeId));
      }
      if (options.beforeCreatedAt) {
        query.set("beforeCreatedAt", String(options.beforeCreatedAt));
      }
      const res = await listMessagesByQuery(
        Object.fromEntries(query.entries()),
        { cache: "no-store", signal: controller.signal },
      );
      if (requestId !== messageFetchRequestIdRef.current) {
        return;
      }
      const data = await res.json();
      if (requestId !== messageFetchRequestIdRef.current) {
        return;
      }
      if (!res.ok) {
        throw new Error(data?.error || "Failed to load messages.");
      }
      if (activeChatIdRef.current !== requestChatId) {
        return;
      }
      setHasOlderMessages((prev) =>
        options.prepend
          ? Boolean(data?.hasMore)
          : options.preserveHistory
            ? prev || Boolean(data?.hasMore)
            : Boolean(data?.hasMore),
      );
      const chatType =
        chats.find((chat) => Number(chat.id) === Number(requestChatId))?.type ||
        activeChatTypeRef.current ||
        null;
      const allowSystemEvents =
        String(chatType || "").toLowerCase() !== "channel";
      const nextMessages = (data.messages || []).map((msg) => {
        const date = parseServerDate(msg.created_at);
        const dayKey = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
        const readByMe =
          Number(msg?.user_id || 0) === Number(user.id) ||
          Boolean(msg.read_by_me);
        const hasProcessingVideo = Array.isArray(msg?.files)
          ? msg.files.some(
              (file) =>
                String(file?.mimeType || "")
                  .toLowerCase()
                  .startsWith("video/") &&
                file?.processing === true &&
                !String(file?.url || "").includes("-h264-"),
            )
          : false;
        const isOwnProcessingVideo =
          hasProcessingVideo && msg.username === user.username;
        const normalizedBody = normalizeMessageBody(msg?.body);
        const normalizedReply =
          msg?.replyTo && typeof msg.replyTo === "object"
            ? {
                ...msg.replyTo,
                body: normalizeMessageBody(msg.replyTo?.body),
              }
            : msg?.replyTo || null;
        const bodyText = normalizedBody;
        const systemMatch = bodyText.match(
          /^\[\[system:(join|joined|left|removed):(.+)\]\]$/i,
        );
        const rawTargetName = systemMatch?.[2]
          ? String(systemMatch[2]).trim()
          : "";
        const maxNameLength = 13;
        const shortTargetName =
          rawTargetName.length > maxNameLength
            ? `${rawTargetName.slice(0, maxNameLength)}...`
            : rawTargetName;
        const isolatedTargetName = `\u2068${shortTargetName || "A member"}\u2069`;
        const normalizedSystemType = String(
          systemMatch?.[1] || "",
        ).toLowerCase();
        const systemSuffix =
          normalizedSystemType === "left"
            ? "left the group"
            : normalizedSystemType === "removed"
              ? "was removed from the group"
              : normalizedSystemType
                ? "joined the group"
                : "";
        const systemText =
          systemSuffix && isolatedTargetName
            ? `${isolatedTargetName} ${systemSuffix}`
            : "";
        return {
          ...msg,
          body: normalizedBody,
          replyTo: normalizedReply,
          _readByMe: readByMe,
          _dayKey: dayKey,
          _dayLabel: formatDayLabel(msg.created_at),
          _timeLabel: formatTime(msg.created_at),
          _processingPending: isOwnProcessingVideo,
          _systemEvent:
            allowSystemEvents && normalizedSystemType
              ? {
                  type: normalizedSystemType,
                  text: systemText,
                  name: shortTargetName || "A member",
                  suffix: systemSuffix,
                }
              : null,
        };
      });
      const replyIconByMessageId = new Map(
        nextMessages
          .map((message) => [
            Number(message?.id || 0),
            resolveReplyPreview(message).icon || null,
          ])
          .filter(
            ([id, icon]) => Number.isFinite(id) && id > 0 && Boolean(icon),
          ),
      );
      const replyColorByMessageId = new Map(
        nextMessages
          .map((message) => [Number(message?.id || 0), message?.color || null])
          .filter(
            ([id, color]) => Number.isFinite(id) && id > 0 && Boolean(color),
          ),
      );
      const nextMessagesWithReplyIcons = nextMessages.map((message) => {
        if (!message?.replyTo) return message;
        const replyId = Number(message.replyTo.id || 0);
        if (!replyId) return message;
        const resolvedIcon = replyIconByMessageId.get(replyId) || null;
        const resolvedColor = replyColorByMessageId.get(replyId) || null;
        if (!resolvedIcon && !resolvedColor) return message;
        return {
          ...message,
          replyTo: {
            ...message.replyTo,
            icon: resolvedIcon || message.replyTo.icon || null,
            color: resolvedColor || message.replyTo.color || null,
          },
        };
      });
      if (options.prepend) {
        setMessages((prev) => {
          if (activeChatIdRef.current !== requestChatId) return prev;
          const seen = new Set(prev.map((msg) => Number(msg.id)));
          const older = nextMessagesWithReplyIcons.filter(
            (msg) => !seen.has(Number(msg.id)),
          );
          return older.length ? [...older, ...prev] : prev;
        });
        return;
      }
      setMessages((prev) => {
        if (activeChatIdRef.current !== requestChatId) return prev;
        if (isActiveChannelChat) {
          const nextCounts = nextMessagesWithReplyIcons.reduce((acc, msg) => {
            const id = Number(msg?.id || 0);
            if (!id) return acc;
            if (Number.isFinite(Number(msg?.seenCount))) {
              acc[id] = Math.max(1, Number(msg.seenCount));
            }
            return acc;
          }, {});
          if (Object.keys(nextCounts).length) {
            setChannelSeenCounts((prevCounts) => ({
              ...prevCounts,
              ...nextCounts,
            }));
          }
        }
        let basePrev = prev;
        if (options.pruneMissing) {
          const serverIds = new Set(
            nextMessagesWithReplyIcons
              .map((msg) => Number(msg?.id || 0))
              .filter((id) => Number.isFinite(id) && id > 0),
          );
          basePrev = prev.filter((msg) => {
            if (msg?._delivery === "sending" || msg?._delivery === "failed")
              return true;
            if (msg?._clientId) return true;
            const serverId = Number(msg?._serverId || msg?.id || 0);
            return serverIds.has(serverId);
          });
        }
        const prevLatestVisibleTime = basePrev.reduce((max, msg) => {
          const t = Number(
            msg?._visibilityTime || parseServerDate(msg?.created_at).getTime(),
          );
          return Number.isFinite(t) ? Math.max(max, t) : max;
        }, 0);
        const prevByServerId = new Map(
          basePrev
            .filter((msg) => Number.isFinite(Number(msg._serverId || msg.id)))
            .map((msg) => [Number(msg._serverId || msg.id), msg]),
        );
        const prevLocalCandidates = basePrev.filter((msg) =>
          Boolean(msg?._clientId),
        );
        const nextMessagesWithLocalIdentity = nextMessagesWithReplyIcons.map(
          (serverMsg) => {
            let existingLocal = prevByServerId.get(Number(serverMsg.id));
            if (!existingLocal) {
              existingLocal = prevLocalCandidates.find((localMsg) => {
                if (!localMsg?._clientId) return false;
                if ((localMsg.username || "") !== (serverMsg.username || ""))
                  return false;
                if ((localMsg.body || "") !== (serverMsg.body || ""))
                  return false;
                const localFiles = Array.isArray(localMsg.files)
                  ? localMsg.files
                  : [];
                const serverFiles = Array.isArray(serverMsg.files)
                  ? serverMsg.files
                  : [];
                if (localFiles.length !== serverFiles.length) return false;
                const localTime = parseServerDate(
                  localMsg.created_at,
                ).getTime();
                const serverTime = parseServerDate(
                  serverMsg.created_at,
                ).getTime();
                return Math.abs(localTime - serverTime) < 2 * 60 * 1000;
              });
            }
            if (!existingLocal?._clientId) return serverMsg;
            const serverFiles = Array.isArray(serverMsg.files)
              ? serverMsg.files
              : [];
            const localFiles = Array.isArray(existingLocal.files)
              ? existingLocal.files
              : [];
            const mergedFiles =
              serverFiles.length && localFiles.length === serverFiles.length
                ? serverFiles.map((file, idx) => {
                    const serverUrl = String(file?.url || "");
                    const localUrl =
                      localFiles[idx]?.url || localFiles[idx]?._localUrl || null;
                    const keepLocalUrl =
                      !serverUrl || serverUrl.startsWith("blob:");
                    return {
                      ...file,
                      _localId:
                        localFiles[idx]?._localId || localFiles[idx]?.id || null,
                      _localUrl: keepLocalUrl ? localUrl : null,
                    };
                  })
                : serverFiles;
            return {
              ...serverMsg,
              files: mergedFiles,
              _clientId: existingLocal._clientId,
              _serverId: Number(serverMsg.id),
              _chatId: existingLocal._chatId,
              _delivery: undefined,
              _awaitingServerEcho: false,
              _visibilityTime: existingLocal?._visibilityTime,
              read_at: serverMsg.read_at || existingLocal?.read_at || null,
              read_by_user_id:
                serverMsg.read_by_user_id || existingLocal?.read_by_user_id || null,
              seenCount: Math.max(
                Number(serverMsg?.seenCount || 0),
                Number(existingLocal?.seenCount || 0),
              ) || undefined,
            };
          },
        );
        const nextMessagesWithVisibility = nextMessagesWithLocalIdentity.map(
          (serverMsg) => {
            if (serverMsg?._visibilityTime) return serverMsg;
            const hasVideo = Array.isArray(serverMsg?.files)
              ? serverMsg.files.some((file) =>
                  String(file?.mimeType || "")
                    .toLowerCase()
                    .startsWith("video/"),
                )
              : false;
            const isFromOther =
              String(serverMsg?.username || "") !== String(user.username || "");
            const createdAtMs = parseServerDate(
              serverMsg?.created_at,
            ).getTime();
            const revealedLate =
              isFromOther &&
              hasVideo &&
              Number.isFinite(createdAtMs) &&
              prevLatestVisibleTime > 0 &&
              createdAtMs < prevLatestVisibleTime;
            if (!revealedLate) return serverMsg;
            return {
              ...serverMsg,
              _visibilityTime: Date.now(),
            };
          },
        );

        if (
          nextMessages.length === 0 &&
          basePrev.some((msg) => {
            if (Number(msg._chatId || chatId) !== Number(chatId)) return false;
            return Boolean(
              msg._clientId || msg._awaitingServerEcho || msg._delivery,
            );
          })
        ) {
          // Prevent one-frame disappearance when first local message exists
          // and a transient fetch returns empty before server echo settles.
          return basePrev;
        }
        const normalizeBody = (value) => normalizeMessageBody(value).trim();
        const isPendingMessageAcknowledged = (pending, serverMessages) => {
          if (!pending || !serverMessages.length) return false;
          const pendingServerId = Number(pending?._serverId || 0);
          if (
            pendingServerId &&
            serverMessages.some((serverMsg) => Number(serverMsg.id) === pendingServerId)
          ) {
            return true;
          }
          const pendingHasFiles =
            Array.isArray(pending.files) && pending.files.length > 0;
          const pendingProgress = Number(pending._uploadProgress ?? 100);
          if (
            pending._delivery === "sending" &&
            pendingHasFiles &&
            pendingProgress < 100
          ) {
            return false;
          }
          const pendingCreatedAt = parseServerDate(
            pending.created_at || new Date().toISOString(),
          ).getTime();
          const pendingFiles = Array.isArray(pending.files)
            ? pending.files
            : [];
          const pendingBody = normalizeBody(pending.body || "");
          return serverMessages.some((serverMsg) => {
            if (serverMsg.username !== pending.username) return false;
            const serverBody = normalizeBody(serverMsg.body || "");
            if (serverBody !== pendingBody) return false;
            const serverFiles = Array.isArray(serverMsg.files)
              ? serverMsg.files
              : [];
            if (serverFiles.length !== pendingFiles.length) return false;
            const serverCreatedAt = parseServerDate(
              serverMsg.created_at,
            ).getTime();
            const minMatchTime = pendingCreatedAt - 3000;
            const maxMatchTime = pendingCreatedAt + 2 * 60 * 1000;
            return (
              serverCreatedAt >= minMatchTime && serverCreatedAt <= maxMatchTime
            );
          });
        };

        const isServerMessageShadowedByPendingUpload = (
          serverMsg,
          pendingMessages,
        ) => {
          return pendingMessages.some((pending) => {
            if (!pending || pending._delivery !== "sending") return false;
            const pendingFiles = Array.isArray(pending.files)
              ? pending.files
              : [];
            if (!pendingFiles.length) return false;
            const pendingProgress = Number(pending._uploadProgress || 0);
            if (pendingProgress >= 100) return false;
            if (serverMsg.username !== pending.username) return false;
            const serverBody = normalizeBody(serverMsg.body || "");
            const pendingBody = normalizeBody(pending.body || "");
            if (serverBody !== pendingBody) return false;
            const serverFiles = Array.isArray(serverMsg.files)
              ? serverMsg.files
              : [];
            if (serverFiles.length !== pendingFiles.length) return false;
            const pendingCreatedAt = parseServerDate(
              pending.created_at || new Date().toISOString(),
            ).getTime();
            const serverCreatedAt = parseServerDate(
              serverMsg.created_at,
            ).getTime();
            const minMatchTime = pendingCreatedAt - 3000;
            const maxMatchTime = pendingCreatedAt + 2 * 60 * 1000;
            return (
              serverCreatedAt >= minMatchTime && serverCreatedAt <= maxMatchTime
            );
          });
        };

        const pendingLocal = basePrev.filter(
          (msg) =>
            (msg._delivery === "sending" || msg._delivery === "failed") &&
            Number(msg._chatId || chatId) === Number(chatId) &&
            !isPendingMessageAcknowledged(msg, nextMessages),
        );
        const optimisticSentLocal = basePrev.filter((msg) => {
          if (!msg?._awaitingServerEcho) return false;
          if (Number(msg._chatId || chatId) !== Number(chatId)) return false;
          return !nextMessagesWithVisibility.some(
            (serverMsg) =>
              Number(serverMsg.id) === Number(msg._serverId || msg.id),
          );
        });
        const nextMessagesVisible = nextMessagesWithVisibility.filter(
          (msg) => !isServerMessageShadowedByPendingUpload(msg, pendingLocal),
        );
        const compareMessages = (left, right) => {
          const leftIsPending =
            left?._delivery === "sending" || Boolean(left?._processingPending);
          const rightIsPending =
            right?._delivery === "sending" ||
            Boolean(right?._processingPending);
          if (leftIsPending !== rightIsPending) {
            return leftIsPending ? 1 : -1;
          }
          if (leftIsPending && rightIsPending) {
            const leftQueuedAt = Number(left?._queuedAt || 0);
            const rightQueuedAt = Number(right?._queuedAt || 0);
            if (leftQueuedAt !== rightQueuedAt) {
              return leftQueuedAt - rightQueuedAt;
            }
          }
          const leftServerId = Number(left?._serverId || left?.id);
          const rightServerId = Number(right?._serverId || right?.id);
          const leftHasServerId =
            Number.isFinite(leftServerId) && leftServerId > 0;
          const rightHasServerId =
            Number.isFinite(rightServerId) && rightServerId > 0;
          if (leftHasServerId && rightHasServerId) {
            return leftServerId - rightServerId;
          }
          const leftTime = Number(
            left?._visibilityTime ||
              parseServerDate(left?.created_at).getTime(),
          );
          const rightTime = Number(
            right?._visibilityTime ||
              parseServerDate(right?.created_at).getTime(),
          );
          if (leftTime !== rightTime) {
            return leftTime - rightTime;
          }
          const leftId = Number(left?.id);
          const rightId = Number(right?.id);
          const leftHasNumericId = Number.isFinite(leftId);
          const rightHasNumericId = Number.isFinite(rightId);
          if (leftHasNumericId && rightHasNumericId) {
            return leftId - rightId;
          }
          return String(left?._clientId || "").localeCompare(
            String(right?._clientId || ""),
          );
        };

        let mergedNext = [
          ...nextMessagesVisible,
          ...optimisticSentLocal,
          ...pendingLocal,
        ].sort(compareMessages);

        const nowMs = Date.now();
        const rescuedOptimistic = basePrev.filter((msg) => {
          if (!msg?._clientId) return false;
          if (Number(msg._chatId || chatId) !== Number(chatId)) return false;
          const queuedAt = Number(msg?._queuedAt || 0);
          if (!queuedAt || nowMs - queuedAt > 2 * 60 * 1000) return false;
          const hasClientMatch = mergedNext.some(
            (item) => String(item?._clientId || "") === String(msg._clientId),
          );
          if (hasClientMatch) return false;
          const optimisticServerId = Number(msg?._serverId || 0);
          if (optimisticServerId) {
            const hasServerMatch = mergedNext.some(
              (item) =>
                Number(item?._serverId || item?.id || 0) === optimisticServerId,
            );
            if (hasServerMatch) return false;
          }
          return true;
        });
        if (rescuedOptimistic.length) {
          mergedNext = [...mergedNext, ...rescuedOptimistic].sort(
            compareMessages,
          );
        }

        // Final reconciliation pass: prevent duplicate rows that represent
        // the same logical message (server id first, then optimistic client id).
        const mergedNextDeduped = [];
        const serverIdentityMap = new Map();
        const clientIdentityMap = new Map();
        mergedNext.forEach((msg) => {
          const serverId = Number(msg?._serverId || msg?.id || 0);
          const hasServerId = Number.isFinite(serverId) && serverId > 0;
          const clientId = String(msg?._clientId || "").trim();
          const identityKey = hasServerId ? `s:${serverId}` : clientId ? `c:${clientId}` : "";
          if (!identityKey) {
            mergedNextDeduped.push(msg);
            return;
          }
          const map = hasServerId ? serverIdentityMap : clientIdentityMap;
          const existingIndex = map.get(identityKey);
          if (existingIndex === undefined) {
            map.set(identityKey, mergedNextDeduped.length);
            mergedNextDeduped.push(msg);
            return;
          }
          const existing = mergedNextDeduped[existingIndex];
          const existingHasServerId = Number.isFinite(
            Number(existing?._serverId || existing?.id || 0),
          );
          // Prefer server-backed rows over optimistic ones.
          if (hasServerId && !existingHasServerId) {
            mergedNextDeduped[existingIndex] = msg;
            return;
          }
          // Otherwise keep the row with richer server reconciliation state.
          const existingAwaiting = Boolean(existing?._awaitingServerEcho);
          const nextAwaiting = Boolean(msg?._awaitingServerEcho);
          if (existingAwaiting && !nextAwaiting) {
            mergedNextDeduped[existingIndex] = msg;
          }
        });
        mergedNext = mergedNextDeduped;

        if (options.preserveHistory) {
          const mergedById = new Map();
          mergedNext.forEach((msg) => {
            const key = Number(msg?._serverId || msg?.id);
            if (Number.isFinite(key)) {
              mergedById.set(key, msg);
            }
          });
          const carriedOlder = prev.filter((msg) => {
            const key = Number(msg?._serverId || msg?.id);
            if (!Number.isFinite(key)) return false;
            return !mergedById.has(key);
          });
          if (carriedOlder.length) {
            mergedNext = [...carriedOlder, ...mergedNext].sort(compareMessages);
          }
        }
        return mergedNext;
      });
      const lastMsg = nextMessages[nextMessages.length - 1];
      const lastId = lastMsg?.id || null;
      const hasUnreadFromOthers = nextMessages.some(
        (msg) => msg.username !== user.username && !msg._readByMe,
      );
      const hasNew =
        lastId &&
        lastMessageIdRef.current &&
        lastId !== lastMessageIdRef.current;
      const newFromSelf = hasNew && lastMsg?.username === user.username;
      lastMessageIdRef.current = lastId;

      if (openingChatRef.current) {
        const firstUnreadIndex = nextMessages.findIndex(
          (msg) => msg.username !== user.username && !msg._readByMe,
        );
        const firstUnreadMessage =
          firstUnreadIndex >= 0 ? nextMessages[firstUnreadIndex] : null;

        shouldAutoMarkReadRef.current = true;
        pendingScrollToUnreadRef.current = null;

        if (
          !firstUnreadMessage?.id &&
          openingUnreadCountRef.current > 0 &&
          !options.forceUnreadFetch
        ) {
          const boostedLimit = Math.min(
            CHAT_PAGE_CONFIG.messageFetchLimit,
            Math.max(
              CHAT_PAGE_CONFIG.messageFetchLimit,
              Number(openingUnreadCountRef.current || 0) + 200,
              Number(options.limit || 0) + 200,
            ),
          );
          void loadMessages(chatId, {
            silent: true,
            preserveHistory: true,
            limit: boostedLimit,
            forceUnreadFetch: true,
          });
          return;
        }

        if (firstUnreadMessage?.id) {
          shouldAutoMarkReadRef.current = false;
          const unreadId = Number(firstUnreadMessage.id);
          setUnreadMarkerId(unreadId);
          unreadMarkerIdRef.current = unreadId;
          pendingScrollToUnreadRef.current = unreadId;
          pendingScrollToBottomRef.current = false;
          userScrolledUpRef.current = false;
          setUserScrolledUp(false);
          isAtBottomRef.current = false;
          setIsAtBottom(false);
        } else {
          setUnreadMarkerId(null);
          unreadMarkerIdRef.current = null;
          pendingScrollToBottomRef.current = true;
          userScrolledUpRef.current = false;
          setUserScrolledUp(false);
          isAtBottomRef.current = true;
          setIsAtBottom(true);
          shouldAutoMarkReadRef.current = true;
        }

        openingHadUnreadRef.current = false;
        openingUnreadCountRef.current = 0;
        openingChatRef.current = false;
        // Enable pagination after initial load completes (works on both desktop and mobile)
        allowStartReachedRef.current = true;
      }

      if (options.forceBottom) {
        pendingScrollToBottomRef.current = true;
        isAtBottomRef.current = true;
        setIsAtBottom(true);
        userScrolledUpRef.current = false;
        setUserScrolledUp(false);
      }

      if (!options.silent) {
        setUnreadInChat(0);
      }

      const hasPendingUnreadAnchor =
        pendingScrollToUnreadRef.current !== null ||
        unreadMarkerIdRef.current !== null;
      const keepUnreadAnchor =
        hasPendingUnreadAnchor ||
        (Boolean(options.initialLoad) &&
          Number(openingUnreadCountRef.current || 0) > 0);
      const unreadAnchorLocked =
        unreadMarkerIdRef.current !== null &&
        Date.now() < Number(unreadAnchorLockUntilRef.current || 0);
      if (!keepUnreadAnchor && !unreadAnchorLocked) {
        if (newFromSelf) {
          pendingScrollToBottomRef.current = true;
          isAtBottomRef.current = true;
          setIsAtBottom(true);
          userScrolledUpRef.current = false;
          setUserScrolledUp(false);
        } else if (hasNew && !userScrolledUpRef.current) {
          pendingScrollToBottomRef.current = true;
          isAtBottomRef.current = true;
          setIsAtBottom(true);
        }
      }
      if (
        activeChat?.type === "dm" &&
        hasUnreadFromOthers &&
        isAppActive &&
        (!isMobileViewport || mobileTab === "chat") &&
        isAtBottomRef.current &&
        !userScrolledUpRef.current &&
        (shouldAutoMarkReadRef.current || options.initialLoad)
      ) {
        await markMessagesRead({ chatId, username: user.username }).catch(
          () => null,
        );
      }
    } catch (error) {
      if (error?.name === "AbortError") {
        return;
      }
      // Keep chat window free of transient fetch errors.
    } finally {
      if (messageFetchAbortRef.current === controller) {
        messageFetchAbortRef.current = null;
      }
      messageFetchInFlightRef.current = false;
      if (queuedSilentMessageRefreshRef.current) {
        const queued = queuedSilentMessageRefreshRef.current;
        queuedSilentMessageRefreshRef.current = null;
        void loadMessages(queued.chatId, queued.options);
      }
      if (!options.silent) {
        setLoadingMessages(false);
      }
    }
  }

  return {
    loadMessages,
    loadingMessages,
    setLoadingMessages,
    hasOlderMessages,
    setHasOlderMessages,
  };
}
