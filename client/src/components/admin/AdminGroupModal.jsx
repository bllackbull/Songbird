import { useCallback, useEffect, useRef, useState, lazy, Suspense } from "react";
import { Close } from "../../icons/lucide.js";
import { searchUsers, apiFetch } from "../../api/chatApi.js";
import { CHAT_PAGE_CONFIG } from "../../settings/chatPageConfig.js";
import { api, inputCls } from "./adminShared.js";
import Avatar from "../common/Avatar.jsx";
import { hasPersian } from "../../utils/fontUtils.js";

const NewGroupModal = lazy(() => import("../modals/NewGroupModal.jsx"));

const SEARCH_DEBOUNCE_MS = 250;
const MAX_RESULTS = 6;

const emptyFormFor = (type) => ({
  nickname: "",
  username: "",
  groupColor: "#10b981",
  visibility: "public",
  allowMemberInvites: true,
  // Remote-channel fields are unused in the admin flow but kept for shape parity.
  remoteChannelEnabled: false,
  remoteChannelProvider: "songbird",
  remoteChannelSource: "",
  remoteChannelSyncMetadata: false,
  remoteChannelStreamMedia: false,
  remoteChannelStatus: null,
  remoteChannelLoading: false,
  _type: type,
});

/**
 * Owner picker — a searchable user selector that mirrors the app dropdown
 * styling. Shows the currently selected owner and lets the admin search and
 * pick any user by username.
 */
function OwnerPicker({ value, onChange }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (value) { setResults([]); return undefined; }
    if (!query.trim()) { setResults([]); return undefined; }
    const handle = setTimeout(async () => {
      try {
        setLoading(true);
        const res = await searchUsers({ exclude: "", query: query.trim().toLowerCase() });
        const data = await res.json();
        setResults((data.users || []).slice(0, MAX_RESULTS));
      } catch { setResults([]); } finally { setLoading(false); }
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [query, value]);

  // Once an owner is selected, show it as a highlighted card (mirrors a selected
  // member) with a pencil button to change the selection.
  if (value) {
    const label = value.nickname || value.username;
    return (
      <div className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white/80 px-3 py-3 text-left dark:border-white/10 dark:bg-slate-950">
        <Avatar src={value.avatar_url} alt={label} name={label} color={value.color || "#10b981"} className="h-8 w-8 text-xs font-bold text-white" />
        <div className="min-w-0 flex-1">
          <p className={`truncate text-sm font-semibold text-slate-700 dark:text-slate-200 ${hasPersian(label) ? "font-fa" : ""}`} dir="auto" title={label}>{label}</p>
          <p className="truncate text-xs text-slate-500 dark:text-slate-400" dir="auto">@{value.username}</p>
        </div>
        <button type="button" onClick={() => { onChange(null); }}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-rose-200 bg-transparent text-rose-600 transition hover:border-rose-300 hover:bg-rose-100 dark:border-rose-500/30 dark:text-rose-200 dark:hover:bg-rose-500/10"
          title="Remove owner">
          <Close size={14} className="icon-anim-pop" />
        </button>
      </div>
    );
  }

  const queryHasPersian = hasPersian(query || "");

  return (
    <div>
      <div className="relative">
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value.toLowerCase())}
          placeholder="username"
          lang={queryHasPersian ? "fa" : "en"}
          dir={queryHasPersian ? "rtl" : "ltr"}
          className={`w-full rounded-2xl border border-emerald-200 bg-white px-4 py-3 pr-14 text-sm text-slate-700 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-300/60 dark:border-emerald-500/30 dark:bg-slate-900 dark:text-slate-100 ${queryHasPersian ? "font-fa text-right" : "text-left"}`}
          style={{ unicodeBidi: "plaintext" }}
        />
        {query.trim() ? (
          <button type="button" onClick={() => setQuery("")}
            className="absolute right-1 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-transparent bg-transparent text-rose-600 transition hover:bg-rose-100 dark:text-rose-200 dark:hover:bg-rose-500/10"
            aria-label="Clear search">
            <Close size={16} className="icon-anim-pop" />
          </button>
        ) : null}
      </div>
      <div className="mt-3 space-y-2">
        {results.length ? (
          <div className="app-scroll max-h-64 space-y-2 overflow-y-auto pr-1">
            {results.map((u) => {
              const label = u.nickname || u.username;
              return (
                <button key={u.id} type="button"
                  onClick={() => { onChange(u); setQuery(""); }}
                  className="flex w-full items-center gap-3 rounded-2xl border border-emerald-100/70 bg-white/80 px-3 py-3 text-left text-sm font-medium text-slate-700 transition hover:border-emerald-300 dark:border-emerald-500/30 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-900/50">
                  <Avatar src={u.avatar_url} alt={label} name={label} color={u.color || "#10b981"} className="h-8 w-8 text-xs font-bold text-white" />
                  <div className="min-w-0">
                    <p className={`truncate font-semibold ${hasPersian(label) ? "font-fa" : ""}`} dir="auto" title={label}>{label}</p>
                    <p className="truncate text-xs text-slate-500 dark:text-slate-400" dir="auto">@{u.username}</p>
                  </div>
                </button>
              );
            })}
          </div>
        ) : loading ? (
          <p className="text-xs text-slate-500 dark:text-slate-400">Searching...</p>
        ) : query.trim() ? (
          <p className="text-xs text-slate-500 dark:text-slate-400">No users found.</p>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Admin create/edit chat modal. Reuses the app's NewGroupModal shell and injects
 * admin-only controls (owner selection, color, and on create the chat type)
 * through its `extraFields` slot, then submits to the admin endpoints.
 */
export default function AdminGroupModal({ mode, chat, initialType = "group", onClose, onSaved }) {
  const editing = mode === "edit";
  const type = editing ? (chat?.type || "group") : initialType;
  const [form, setForm] = useState(() => {
    if (editing) {
      return {
        ...emptyFormFor(chat?.type || "group"),
        nickname: chat?.name || "",
        username: chat?.group_username || "",
        groupColor: chat?.group_color || "#10b981",
        visibility: chat?.group_visibility || "public",
      };
    }
    return emptyFormFor(initialType);
  });
  const [owner, setOwner] = useState(() => {
    if (editing && chat?.owner_id) {
      return {
        id: chat.owner_id,
        username: chat.owner_username,
        nickname: chat.owner_nickname,
        avatar_url: chat.owner_avatar_url,
        color: chat.owner_color,
      };
    }
    return null;
  });
  // Remember the original owner so edits only transfer ownership when changed.
  const initialOwnerId = editing ? (chat?.owner_id ?? null) : null;
  const [search, setSearch] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [members, setMembers] = useState([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Avatar state. In edit mode we upload immediately to the existing chat; in
  // create mode we hold the picked file and upload after the chat is created.
  const fileUploadEnabled = CHAT_PAGE_CONFIG.fileUploadEnabled;
  const [avatarPreview, setAvatarPreview] = useState(editing ? (chat?.group_avatar_url || "") : "");
  const [pendingAvatarFile, setPendingAvatarFile] = useState(null);
  const [avatarRemoved, setAvatarRemoved] = useState(false);
  const objectUrlRef = useRef(null);

  useEffect(() => () => { if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current); }, []);

  const uploadAvatarTo = useCallback(async (chatId, file) => {
    const fd = new FormData();
    fd.append("avatar", file);
    await apiFetch(`/api/admin/chats/${chatId}/avatar`, { method: "POST", body: fd });
  }, []);

  const handleAvatarChange = useCallback((e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    const url = URL.createObjectURL(file);
    objectUrlRef.current = url;
    setPendingAvatarFile(file);
    setAvatarRemoved(false);
    setAvatarPreview(url);
  }, []);

  const handleAvatarRemove = useCallback(() => {
    if (objectUrlRef.current) { URL.revokeObjectURL(objectUrlRef.current); objectUrlRef.current = null; }
    setPendingAvatarFile(null);
    setAvatarRemoved(true);
    setAvatarPreview("");
  }, []);

  // Member search (create flow only). Mirrors useNewGroupModal behaviour, and
  // also excludes whoever is currently selected as the owner.
  useEffect(() => {
    if (editing) return undefined;
    if (!search.trim()) { setResults([]); return undefined; }
    const handle = setTimeout(async () => {
      try {
        setSearching(true);
        const res = await searchUsers({ exclude: "", query: search.trim().toLowerCase() });
        const data = await res.json();
        const chosen = new Set(members.map((m) => String(m.username || "")));
        if (owner?.username) chosen.add(String(owner.username));
        setResults((data.users || []).filter((u) => !chosen.has(String(u.username || ""))).slice(0, MAX_RESULTS));
      } catch { setResults([]); } finally { setSearching(false); }
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [search, members, editing, owner?.username]);

  // Selecting an owner removes that user from the member selection (the owner is
  // added as owner on the backend, never as a plain member).
  const handleOwnerChange = useCallback((next) => {
    setOwner(next);
    if (next?.id) {
      setMembers((prev) => prev.filter((m) => Number(m.id) !== Number(next.id)));
    }
  }, []);

  const entityLabel = type === "channel" ? "Channel" : "Group";

  const submit = useCallback(async () => {
    setError(""); setBusy(true);
    try {
      const name = String(form.nickname || "").trim();
      const username = String(form.username || "").trim().toLowerCase();
      if (!name || !username) { setError("Name and username are required."); setBusy(false); return; }
      if (!owner?.id) { setError("Please select an owner."); setBusy(false); return; }

      if (editing) {
        const payload = {
          name,
          username,
          visibility: form.visibility,
          color: form.groupColor,
        };
        if (owner?.id && owner.id !== initialOwnerId) payload.owner = owner.id;
        const r = await api.patch(`/api/admin/chats/${chat.id}`, payload);
        if (!r.ok) { const d = await r.json(); setError(d.error || "Failed"); setBusy(false); return; }
        if (fileUploadEnabled) {
          if (pendingAvatarFile) await uploadAvatarTo(chat.id, pendingAvatarFile);
          else if (avatarRemoved) await apiFetch(`/api/admin/chats/${chat.id}/avatar`, { method: "DELETE" });
        }
      } else {
        const payload = {
          type,
          name,
          username,
          visibility: form.visibility,
          owner: owner.id,
          color: form.groupColor,
          memberIds: members.map((m) => Number(m.id)).filter(Boolean),
        };
        const r = await api.post("/api/admin/chats", payload);
        if (!r.ok) { const d = await r.json(); setError(d.error || "Failed"); setBusy(false); return; }
        const d = await r.json().catch(() => ({}));
        const newId = d?.chat?.id;
        if (fileUploadEnabled && pendingAvatarFile && newId) {
          await uploadAvatarTo(newId, pendingAvatarFile);
        }
      }
      onSaved(); onClose();
    } catch {
      setError("Request failed."); setBusy(false);
    }
  }, [editing, form, owner, type, members, chat, onSaved, onClose, fileUploadEnabled, pendingAvatarFile, avatarRemoved, uploadAvatarTo, initialOwnerId]);

  const extraFields = (
    <div className="space-y-3">
      <div className="rounded-2xl border border-emerald-200 p-3 dark:border-emerald-500/30">
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Owner</p>
        <div className="mt-2">
          <OwnerPicker value={owner} onChange={handleOwnerChange} />
        </div>
      </div>
      <div className="rounded-2xl border border-emerald-200 p-3 dark:border-emerald-500/30">
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Color</p>
        <div className="mt-2 flex items-center gap-2">
          <input className={inputCls + " flex-1"} value={form.groupColor} onChange={(e) => setForm((f) => ({ ...f, groupColor: e.target.value }))} placeholder="#10b981" />
          <input type="color" value={form.groupColor || "#10b981"} onChange={(e) => setForm((f) => ({ ...f, groupColor: e.target.value }))}
            className="color-swatch h-11 w-11 shrink-0 cursor-pointer overflow-hidden rounded-xl border border-emerald-200/70 dark:border-emerald-500/30" />
        </div>
      </div>
    </div>
  );

  return (
    <Suspense fallback={null}>
      <NewGroupModal
        open
        groupForm={form}
        setGroupForm={setForm}
        groupSearchQuery={search}
        setGroupSearchQuery={setSearch}
        groupSearchResults={results}
        groupSearchLoading={searching}
        selectedGroupMembers={members}
        setSelectedGroupMembers={setMembers}
        groupError={error}
        setGroupError={setError}
        creatingGroup={busy}
        onCreate={submit}
        onClose={onClose}
        title={editing ? `Edit ${entityLabel.toLowerCase()}` : `New ${entityLabel.toLowerCase()}`}
        submitLabel={editing ? "Save" : "Create"}
        entityLabel={entityLabel}
        extraFields={extraFields}
        showMemberSearch={!editing}
        showAvatarField={fileUploadEnabled}
        avatarPreview={avatarPreview}
        avatarColor={form.groupColor || "#10b981"}
        avatarName={form.nickname || form.username || entityLabel}
        onAvatarChange={handleAvatarChange}
        onAvatarRemove={handleAvatarRemove}
        fileUploadEnabled={fileUploadEnabled}
        showInviteManagement={false}
        showRemoteChannelSettings={false}
      />
    </Suspense>
  );
}
