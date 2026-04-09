import { useEffect, useState } from "react";

export function useNewGroupModal({
  user,
  chats,
  activeChatId,
  editingGroup,
  searchUsers,
  debounceMs,
  maxResults,
}) {
  const [newGroupOpen, setNewGroupOpen] = useState(false);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [groupModalType, setGroupModalType] = useState("group");
  const [newGroupForm, setNewGroupForm] = useState({
    nickname: "",
    username: "",
    visibility: "public",
    allowMemberInvites: true,
  });
  const [newGroupSearch, setNewGroupSearch] = useState("");
  const [newGroupSearchResults, setNewGroupSearchResults] = useState([]);
  const [newGroupSearchLoading, setNewGroupSearchLoading] = useState(false);
  const [newGroupMembers, setNewGroupMembers] = useState([]);
  const [newGroupError, setNewGroupError] = useState("");
  const [groupInviteOpen, setGroupInviteOpen] = useState(false);
  const [createdGroupInviteLink, setCreatedGroupInviteLink] = useState("");
  const [editGroupInviteLink, setEditGroupInviteLink] = useState("");
  const [regeneratingGroupInviteLink, setRegeneratingGroupInviteLink] =
    useState(false);

  useEffect(() => {
    if (!newGroupOpen) return;
    if (!newGroupSearch.trim()) {
      setNewGroupSearchResults([]);
      return;
    }
    const handle = setTimeout(async () => {
      try {
        setNewGroupSearchLoading(true);
        const res = await searchUsers({
          exclude: user.username,
          query: newGroupSearch.trim().toLowerCase(),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data?.error || "Unable to search users.");
        }
        const selectedUsernames = new Set(
          newGroupMembers.map((member) => String(member?.username || "")),
        );
        const currentEditingChat = chats.find(
          (chat) => Number(chat.id) === Number(activeChatId),
        );
        if (
          editingGroup &&
          ["group", "channel"].includes(currentEditingChat?.type)
        ) {
          (currentEditingChat.members || []).forEach((member) => {
            const memberUsername = String(member?.username || "").toLowerCase();
            if (
              memberUsername &&
              memberUsername !== String(user.username || "").toLowerCase()
            ) {
              selectedUsernames.add(memberUsername);
            }
          });
        }
        const users = (data.users || [])
          .filter(
            (candidate) =>
              !selectedUsernames.has(
                String(candidate.username || "").toLowerCase(),
              ),
          )
          .slice(0, maxResults);
        setNewGroupSearchResults(users);
      } catch (err) {
        setNewGroupError(err.message);
      } finally {
        setNewGroupSearchLoading(false);
      }
    }, debounceMs);
    return () => clearTimeout(handle);
  }, [
    activeChatId,
    chats,
    debounceMs,
    editingGroup,
    maxResults,
    newGroupMembers,
    newGroupOpen,
    newGroupSearch,
    searchUsers,
    user.username,
  ]);

  return {
    newGroupOpen,
    setNewGroupOpen,
    creatingGroup,
    setCreatingGroup,
    groupModalType,
    setGroupModalType,
    newGroupForm,
    setNewGroupForm,
    newGroupSearch,
    setNewGroupSearch,
    newGroupSearchResults,
    setNewGroupSearchResults,
    newGroupSearchLoading,
    newGroupMembers,
    setNewGroupMembers,
    newGroupError,
    setNewGroupError,
    groupInviteOpen,
    setGroupInviteOpen,
    createdGroupInviteLink,
    setCreatedGroupInviteLink,
    editGroupInviteLink,
    setEditGroupInviteLink,
    regeneratingGroupInviteLink,
    setRegeneratingGroupInviteLink,
  };
}
