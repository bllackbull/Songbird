import { useEffect, useState } from "react";

export function useNewChatSearch({
  user,
  dmUsernamesRef,
  searchUsers,
  debounceMs,
  maxResults,
}) {
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [newChatUsername, setNewChatUsername] = useState("");
  const [newChatError, setNewChatError] = useState("");
  const [newChatResults, setNewChatResults] = useState([]);
  const [newChatLoading, setNewChatLoading] = useState(false);
  const [newChatSelection, setNewChatSelection] = useState(null);

  useEffect(() => {
    if (!newChatOpen) return;
    if (!newChatUsername.trim()) {
      setNewChatResults([]);
      setNewChatSelection(null);
      return;
    }
    const handle = setTimeout(async () => {
      try {
        setNewChatLoading(true);
        const res = await searchUsers({
          exclude: user.username,
          query: newChatUsername.trim().toLowerCase(),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data?.error || "Unable to search users.");
        }
        const dmUsernames = dmUsernamesRef.current;
        const users = (data.users || [])
          .filter(
            (candidate) =>
              !dmUsernames.has(String(candidate.username || "").toLowerCase()),
          )
          .slice(0, maxResults);
        setNewChatResults(users);
      } catch (err) {
        setNewChatError(err.message);
      } finally {
        setNewChatLoading(false);
      }
    }, debounceMs);
    return () => clearTimeout(handle);
  }, [
    debounceMs,
    dmUsernamesRef,
    maxResults,
    newChatOpen,
    newChatUsername,
    searchUsers,
    user.username,
  ]);

  return {
    newChatOpen,
    setNewChatOpen,
    newChatUsername,
    setNewChatUsername,
    newChatError,
    setNewChatError,
    newChatResults,
    setNewChatResults,
    newChatLoading,
    newChatSelection,
    setNewChatSelection,
  };
}
