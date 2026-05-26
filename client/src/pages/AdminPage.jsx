import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../api/chatApi.js";
import { ArrowLeft, Ban, Search, Trash, Users } from "../icons/lucide.js";

export default function AdminPage({ user, onBack }) {
  const [tab, setTab] = useState("dashboard");
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [chats, setChats] = useState([]);
  const [userSearch, setUserSearch] = useState("");
  const [loading, setLoading] = useState(false);

  const fetchStats = useCallback(async () => {
    try {
      const res = await apiFetch("/api/admin/stats");
      if (res.ok) setStats(await res.json());
    } catch {}
  }, []);

  const fetchUsers = useCallback(async (search = "") => {
    setLoading(true);
    try {
      const q = search ? `?search=${encodeURIComponent(search)}` : "";
      const res = await apiFetch(`/api/admin/users${q}`);
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users || []);
      }
    } catch {}
    setLoading(false);
  }, []);

  const fetchChats = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch("/api/admin/chats");
      if (res.ok) {
        const data = await res.json();
        setChats(data.chats || []);
      }
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  useEffect(() => {
    if (tab === "users") fetchUsers(userSearch);
    if (tab === "chats") fetchChats();
  }, [tab, fetchUsers, fetchChats, userSearch]);

  const handleBanToggle = async (userId, currentBanned) => {
    await apiFetch(`/api/admin/users/${userId}/ban`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ banned: !currentBanned }),
    });
    fetchUsers(userSearch);
    fetchStats();
  };

  const handleDeleteUser = async (userId) => {
    if (!confirm("Are you sure you want to delete this user?")) return;
    await apiFetch(`/api/admin/users/${userId}`, { method: "DELETE" });
    fetchUsers(userSearch);
    fetchStats();
  };

  const handleDeleteChat = async (chatId) => {
    if (!confirm("Are you sure you want to delete this chat?")) return;
    await apiFetch(`/api/admin/chats/${chatId}`, { method: "DELETE" });
    fetchChats();
    fetchStats();
  };

  return (
    <div className="flex h-full w-full flex-col bg-slate-50 dark:bg-slate-900">
      {/* Header */}
      <div className="flex h-16 items-center gap-3 border-b border-slate-200 bg-white px-6 dark:border-slate-700 dark:bg-slate-800">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-600 transition hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
          aria-label="Back"
        >
          <ArrowLeft size={18} />
        </button>
        <h1 className="text-lg font-semibold text-slate-800 dark:text-white">
          Admin Panel
        </h1>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <div className="w-48 shrink-0 border-r border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800">
          {["dashboard", "users", "chats"].map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`mb-1 w-full rounded-lg px-3 py-2 text-left text-sm font-medium capitalize transition ${
                tab === t
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                  : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {tab === "dashboard" && stats ? (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
              {[
                { label: "Total Users", value: stats.totalUsers },
                { label: "Online Users", value: stats.onlineUsers },
                { label: "Banned Users", value: stats.bannedUsers },
                { label: "Total Chats", value: stats.totalChats },
                { label: "Total Messages", value: stats.totalMessages },
                { label: "Active Sessions", value: stats.totalSessions },
              ].map((item) => (
                <div
                  key={item.label}
                  className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800"
                >
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    {item.label}
                  </p>
                  <p className="mt-1 text-2xl font-bold text-slate-800 dark:text-white">
                    {item.value}
                  </p>
                </div>
              ))}
            </div>
          ) : null}

          {tab === "users" ? (
            <div>
              <div className="mb-4 flex items-center gap-2">
                <div className="relative flex-1">
                  <Search
                    size={16}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                  <input
                    type="text"
                    placeholder="Search users..."
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-emerald-400 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                  />
                </div>
              </div>
              {loading ? (
                <p className="text-sm text-slate-500">Loading...</p>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800">
                      <tr>
                        <th className="px-4 py-3 font-medium text-slate-600 dark:text-slate-300">Username</th>
                        <th className="px-4 py-3 font-medium text-slate-600 dark:text-slate-300">Role</th>
                        <th className="px-4 py-3 font-medium text-slate-600 dark:text-slate-300">Status</th>
                        <th className="px-4 py-3 font-medium text-slate-600 dark:text-slate-300">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                      {users.map((u) => (
                        <tr key={u.id} className="bg-white dark:bg-slate-800">
                          <td className="px-4 py-3">
                            <span className="font-medium text-slate-800 dark:text-white">
                              {u.nickname || u.username}
                            </span>
                            <span className="ml-1 text-xs text-slate-400">@{u.username}</span>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                              u.role === "admin"
                                ? "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300"
                                : "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300"
                            }`}>
                              {u.role || "user"}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            {u.banned ? (
                              <span className="text-xs font-medium text-red-500">Banned</span>
                            ) : (
                              <span className={`text-xs ${u.status === "online" ? "text-emerald-500" : "text-slate-400"}`}>
                                {u.status}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              {u.id !== user.id ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => handleBanToggle(u.id, u.banned)}
                                    className={`rounded px-2 py-1 text-xs font-medium transition ${
                                      u.banned
                                        ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300"
                                        : "bg-orange-100 text-orange-700 hover:bg-orange-200 dark:bg-orange-900/40 dark:text-orange-300"
                                    }`}
                                    title={u.banned ? "Unban" : "Ban"}
                                  >
                                    <Ban size={14} />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteUser(u.id)}
                                    className="rounded bg-red-100 px-2 py-1 text-xs font-medium text-red-700 transition hover:bg-red-200 dark:bg-red-900/40 dark:text-red-300"
                                    title="Delete"
                                  >
                                    <Trash size={14} />
                                  </button>
                                </>
                              ) : (
                                <span className="text-xs text-slate-400">You</span>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : null}

          {tab === "chats" ? (
            <div>
              {loading ? (
                <p className="text-sm text-slate-500">Loading...</p>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800">
                      <tr>
                        <th className="px-4 py-3 font-medium text-slate-600 dark:text-slate-300">Name</th>
                        <th className="px-4 py-3 font-medium text-slate-600 dark:text-slate-300">Type</th>
                        <th className="px-4 py-3 font-medium text-slate-600 dark:text-slate-300">Members</th>
                        <th className="px-4 py-3 font-medium text-slate-600 dark:text-slate-300">Messages</th>
                        <th className="px-4 py-3 font-medium text-slate-600 dark:text-slate-300">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                      {chats.map((c) => (
                        <tr key={c.id} className="bg-white dark:bg-slate-800">
                          <td className="px-4 py-3 font-medium text-slate-800 dark:text-white">
                            {c.name || `Chat #${c.id}`}
                          </td>
                          <td className="px-4 py-3">
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                              {c.type}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{c.member_count}</td>
                          <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{c.message_count}</td>
                          <td className="px-4 py-3">
                            <button
                              type="button"
                              onClick={() => handleDeleteChat(c.id)}
                              className="rounded bg-red-100 px-2 py-1 text-xs font-medium text-red-700 transition hover:bg-red-200 dark:bg-red-900/40 dark:text-red-300"
                              title="Delete"
                            >
                              <Trash size={14} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
