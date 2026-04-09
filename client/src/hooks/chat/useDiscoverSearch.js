import { useEffect, useState } from "react";

export function useDiscoverSearch({
  user,
  discoverUsersAndGroups,
  debounceMs,
  maxResults,
}) {
  const [chatsSearchQuery, setChatsSearchQuery] = useState("");
  const [discoverLoading, setDiscoverLoading] = useState(false);
  const [discoverUsers, setDiscoverUsers] = useState([]);
  const [discoverGroups, setDiscoverGroups] = useState([]);
  const [discoverChannels, setDiscoverChannels] = useState([]);
  const [discoverSaved, setDiscoverSaved] = useState(false);

  useEffect(() => {
    const query = String(chatsSearchQuery || "").trim();
    if (!query) {
      setDiscoverLoading(false);
      setDiscoverUsers([]);
      setDiscoverGroups([]);
      setDiscoverChannels([]);
      setDiscoverSaved(false);
      return;
    }
    const normalizedQuery = query.toLowerCase();
    const savedMatch =
      normalizedQuery.includes("saved") || normalizedQuery.includes("bookmark");
    setDiscoverSaved(savedMatch);
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        setDiscoverLoading(true);
        const res = await discoverUsersAndGroups({
          username: user.username,
          query: normalizedQuery,
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data?.error || "Unable to search.");
        }
        if (cancelled) return;
        setDiscoverUsers(
          (Array.isArray(data?.users) ? data.users : []).slice(0, maxResults),
        );
        setDiscoverGroups(
          (Array.isArray(data?.groups) ? data.groups : []).slice(0, maxResults),
        );
        setDiscoverChannels(
          (Array.isArray(data?.channels) ? data.channels : []).slice(
            0,
            maxResults,
          ),
        );
      } catch {
        if (cancelled) return;
        setDiscoverUsers([]);
        setDiscoverGroups([]);
        setDiscoverChannels([]);
      } finally {
        if (!cancelled) {
          setDiscoverLoading(false);
        }
      }
    }, debounceMs);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [
    chatsSearchQuery,
    debounceMs,
    discoverUsersAndGroups,
    maxResults,
    user.username,
  ]);

  return {
    chatsSearchQuery,
    setChatsSearchQuery,
    discoverLoading,
    discoverUsers,
    discoverGroups,
    discoverChannels,
    discoverSaved,
  };
}
