import { useCallback, useState } from "react";
import {
  Ban,
  Chat,
  CheckCheck,
  Copy,
  Download,
  Forward,
  Pencil,
  Reply,
  Trash,
  User,
  Volume2,
  VolumeX,
} from "../../icons/lucide.js";
import { copyTextToClipboard } from "../../utils/clipboard.js";
import {
  extractMessageBodyText,
  getMessageFiles,
  hasMessageText,
} from "../../utils/messageContent.js";

export function useAppContextMenu({
  activeChatId,
  chats,
  currentUsername,
  canCurrentUserEditGroup,
  canReplyToMessage,
  canEditMessage,
  canDeleteMessageForEveryone,
  onReplyToMessage,
  onEditMessage,
  onDeleteMessage,
  onForwardMessage,
  onSaveMessageFiles,
  onOpenOrCreateDm,
  onOpenProfile,
  onRemoveGroupMember,
  onMarkChatSeen,
  onToggleChatMute,
  onDeleteChats,
}) {
  const [contextMenu, setContextMenu] = useState(null);

  const findContextMenuLinkTarget = useCallback((eventTarget, targetEl) => {
    const eventNode =
      eventTarget instanceof Element ? eventTarget : eventTarget?.parentElement || null;
    if (!eventNode || !targetEl || !targetEl.contains(eventNode)) return null;
    const anchor = eventNode.closest("a[href]");
    if (!anchor || !targetEl.contains(anchor)) return null;
    const href = String(anchor.href || anchor.getAttribute("href") || "").trim();
    if (!href) return null;
    return href;
  }, []);

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  const findExistingDmWithUser = useCallback(
    (username) => {
      const targetUsername = String(username || "").toLowerCase();
      if (!targetUsername) return null;
      return (
        chats.find((chat) => {
          if (chat?.type !== "dm") return false;
          return (chat.members || []).some(
            (member) =>
              String(member?.username || "").toLowerCase() === targetUsername,
          );
        }) || null
      );
    },
    [chats],
  );

  const handleMarkChatSeen = useCallback(
    async (chat) => {
      const chatId = Number(chat?.id || 0);
      if (!chatId) return;
      await onMarkChatSeen?.(chat, {
        activeChatId,
      });
    },
    [activeChatId, onMarkChatSeen],
  );

  const openContextMenu = useCallback(
    ({ kind, data, targetEl, event }) => {
      const rect = targetEl?.getBoundingClientRect?.() || null;
      const point = {
        x: Number(event?.clientX || rect?.left || 0),
        y: Number(event?.clientY || rect?.bottom || rect?.top || 0),
      };
      const items = [];

      if (kind === "message") {
        const message = data?.message || null;
        const hasText = hasMessageText(message);
        const linkTarget = findContextMenuLinkTarget(event?.target, targetEl);
        const files = getMessageFiles(message);
        items.push(
          ...(canReplyToMessage
            ? [
                {
                  id: "reply",
                  label: "Reply",
                  icon: Reply,
                  onSelect: () => onReplyToMessage?.(message),
                },
              ]
            : []),
          ...(hasText
            ? [
                {
                  id: linkTarget ? "copy-link" : "copy",
                  label: linkTarget ? "Copy link" : "Copy text",
                  icon: Copy,
                  onSelect: () =>
                    copyTextToClipboard(
                      linkTarget || extractMessageBodyText(message?.body),
                    ),
                },
              ]
            : []),
          ...(hasText && canEditMessage?.(message)
            ? [
                {
                  id: "edit",
                  label: "Edit",
                  icon: Pencil,
                  onSelect: () => onEditMessage?.(message),
                },
              ]
            : []),
          ...(files.length
            ? [
                {
                  id: "save",
                  label: "Save",
                  icon: Download,
                  onSelect: () => onSaveMessageFiles?.(message),
                },
              ]
            : []),
          {
            id: "forward",
            label: "Forward",
            icon: Forward,
            onSelect: () => onForwardMessage?.(message),
          },
          {
            id: "delete",
            label: "Delete",
            icon: Trash,
            danger: true,
            onSelect: () =>
              onDeleteMessage?.(message, {
                allowDeleteForEveryone: Boolean(
                  canDeleteMessageForEveryone?.(message),
                ),
              }),
          },
        );
      }

      if (kind === "user") {
        const targetUser = data?.member || data?.user || null;
        const username = String(targetUser?.username || "").toLowerCase();
        const isSelf = username === String(currentUsername || "").toLowerCase();
        const existingDm = findExistingDmWithUser(username);
        const isRemovableGroupMember =
          data?.sourceChatType === "group" &&
          canCurrentUserEditGroup &&
          !isSelf &&
          String(targetUser?.role || "").toLowerCase() !== "owner";

        items.push({
          id: "profile",
          label: "Open profile",
          icon: User,
          onSelect: () => {
            if (typeof data?.onOpenProfile === "function") {
              data.onOpenProfile(targetUser);
              return;
            }
            onOpenProfile?.(targetUser);
          },
        });

        if (!isSelf && !existingDm) {
          items.push({
            id: "chat",
            label: "Chat",
            icon: Chat,
            onSelect: () => onOpenOrCreateDm?.(targetUser),
          });
        }

        if (isRemovableGroupMember) {
          items.push({
            id: "remove",
            label: "Remove",
            icon: Ban,
            danger: true,
            onSelect: () => onRemoveGroupMember?.(targetUser),
          });
        }
      }

      if (kind === "chat") {
        const chat = data?.chat || null;
        const unreadCount = Number(chat?.unread_count || 0);
        if (unreadCount > 0) {
          items.push({
            id: "seen",
            label: "Mark as seen",
            icon: CheckCheck,
            onSelect: () => handleMarkChatSeen(chat),
          });
        }
        if (String(chat?.type || "").toLowerCase() !== "saved") {
          items.push({
            id: "mute",
            label: chat?._muted ? "Unmute" : "Mute",
            icon: chat?._muted ? Volume2 : VolumeX,
            onSelect: () => onToggleChatMute?.(chat?.id),
          });
        }
        items.push({
          id: "delete",
          label: "Delete",
          icon: Trash,
          danger: true,
          onSelect: () => onDeleteChats?.([Number(chat?.id || 0)]),
        });
      }

      if (!items.length) return;
      const message = kind === "message" ? data?.message || null : null;
      setContextMenu({
        kind,
        point,
        items,
        targetEl: targetEl || null,
        targetChatId: Number(activeChatId || 0) || null,
        targetMessageKey: message
          ? String(message?._clientId ?? message?._serverId ?? message?.id ?? "")
          : "",
      });
    },
    [
      activeChatId,
      canReplyToMessage,
      canCurrentUserEditGroup,
      currentUsername,
      findContextMenuLinkTarget,
      findExistingDmWithUser,
      handleMarkChatSeen,
      onDeleteChats,
      onDeleteMessage,
      onEditMessage,
      onForwardMessage,
      onSaveMessageFiles,
      onOpenOrCreateDm,
      onOpenProfile,
      onRemoveGroupMember,
      onReplyToMessage,
      onToggleChatMute,
      canDeleteMessageForEveryone,
      canEditMessage,
    ],
  );

  return {
    contextMenu,
    closeContextMenu,
    openContextMenu,
  };
}
