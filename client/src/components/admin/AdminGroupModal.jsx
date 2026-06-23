import { useCallback, useEffect, useRef, useState, lazy, Suspense } from "react";
import { searchUsers, apiFetch } from "../../api/chatApi.js";
import { CHAT_PAGE_CONFIG } from "../../settings/chatPageConfig.js";
import { api, inputCls } from "./adminShared.js";
import { Field } from "./AdminCommon.jsx";
import Avatar from "../common/Avatar.jsx";

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
function OwnerPicker({ value, onChange, currentUser }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);

  useEffect(() => {
    if (!query.trim()) { setResults([]); return undefined; }
    const handle = setTimeout(async () => {
      try {
        const res = await searchUsers({ exclude: currentUser?.username || "", query: query.trim().toLowerCase() });
        const data = await res.json();
        setResults((data.users || []).slice(0, MAX_RESULTS));
      } catch { setResults([]); }
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [query, currentUser?.username]);

  useEffect(() => {
    const onDocClick = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  return (
    <div ref={boxRef} className="relative">
      {value ? (
        <div className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-white px-3 py-2 dark:border-emerald-500/30 dark:bg-slate-900">
          <Avatar src={value.avatar_url} name={value.nickname || value.username} color={value.color || "#10b981"} className="h-7 w-7 text-xs font-bold text-white" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold text-slate-700 dark:text-slate-200">{value.nickname || value.username}</p>
            <p className="truncate text-[11px] text-slate-400">@{value.username}</p>
          </div>
          <button type="button" onClick={() => { onChange(null); setQuery(""); setOpen(true); }}
            className="rounded-lg px-2 py-1 text-[11px] font-semibold text-emerald-600 transition hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-500/10">
            Change
          </button>
        </div>
      ) : (
        <>
          <input
            value={query}
            onChange={(e) => { setQuery(e.target.value.toLowerCase()); setOpen(true); }}
            onFocus={() => setOpen(true)}
            placeholder="Search a user by username…"
            className={inputCls}
          />
          {open && (results.length > 0 || query.trim()) ? (
            <div className="absolute left-0 right-0 z-50 mt-1.5 max-h-56 overflow-y-auto rounded-2xl border border-emerald-200 bg-white p-1 shadow-xl shadow-emerald-950/10 dark:border-emerald-500/30 dark:bg-slate-900">
              {results.length === 0 ? (
                <p className="px-3 py-2 text-xs text-slate-400">No users found.</p>
              ) : results.map((u) => (
                <button key={u.id} type="button"
                  onClick={() => { onChange(u); setOpen(false); setQuery(""); }}
                  className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left transition hover:bg-emerald-50 dark:hover:bg-emerald-500/10">
                  <Avatar src={u.avatar_url} name={u.nickname || u.username} color={u.color || "#10b981"} className="h-7 w-7 text-xs font-bold text-white" />
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-slate-700 dark:text-slate-200">{u.nickname || u.username}</p>
                    <p className="truncate text-[11px] text-slate-400">@{u.username}</p>
                  </div>
                </button>
              ))}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

/**
 * Admin create/edit chat modal. Reuses the app's NewGroupModal shell and injects
 * admin-only controls (owner selection, color, and on create the chat type)
 * through its `extraFields` slot, then submits to the admin endpoints.
 */
export default function AdminGroupModal({ mode, chat, initialType = "group", currentUser, onClose, onSaved }) {
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
  const [owner, setOwner] = useState(null);
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

  // Member search (create flow only). Mirrors useNewGroupModal behaviour.
  useEffect(() => {
    if (editing) return undefined;
    if (!search.trim()) { setResults([]); return undefined; }
    const handle = setTimeout(async () => {
      try {
        setSearching(true);
        const res = await searchUsers({ exclude: currentUser?.username || "", query: search.trim().toLowerCase() });
        const data = await res.json();
        const chosen = new Set(members.map((m) => String(m.username || "")));
        setResults((data.users || []).filter((u) => !chosen.has(String(u.username || ""))).slice(0, MAX_RESULTS));
      } catch { setResults([]); } finally { setSearching(false); }
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [search, members, editing, currentUser?.username]);

  const entityLabel = type === "channel" ? "Channel" : "Group";

  const submit = useCallback(async () => {
    setError(""); setBusy(true);
    try {
      const name = String(form.nickname || "").trim();
      const username = String(form.username || "").trim().toLowerCase();
      if (!name || !username) { setError("Name and username are required."); setBusy(false); return; }

      if (editing) {
        const payload = {
          name,
          username,
          visibility: form.visibility,
          color: form.groupColor,
        };
        if (owner?.id) payload.owner = owner.id;
        const r = await api.patch(`/api/admin/chats/${chat.id}`, payload);
        if (!r.ok) { const d = await r.json(); setError(d.error || "Failed"); setBusy(false); return; }
        if (fileUploadEnabled) {
          if (pendingAvatarFile) await uploadAvatarTo(chat.id, pendingAvatarFile);
          else if (avatarRemoved) await apiFetch(`/api/admin/chats/${chat.id}/avatar`, { method: "DELETE" });
        }
      } else {
        if (!owner?.id) { setError("Please select an owner."); setBusy(false); return; }
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
  }, [editing, form, owner, type, members, chat, onSaved, onClose, fileUploadEnabled, pendingAvatarFile, avatarRemoved, uploadAvatarTo]);

  const extraFields = (
    <div className="space-y-3">
      <Field label={editing ? "Transfer ownership" : "Owner"} hint={editing ? "Leave unchanged to keep the current owner." : undefined}>
        <OwnerPicker value={owner} onChange={setOwner} currentUser={currentUser} />
      </Field>
      <Field label="Color">
        <div className="flex items-center gap-2">
          <input type="color" value={form.groupColor || "#10b981"} onChange={(e) => setForm((f) => ({ ...f, groupColor: e.target.value }))}
            className="color-swatch h-11 w-11 shrink-0 cursor-pointer overflow-hidden rounded-xl border border-emerald-200/70 dark:border-emerald-500/30" />
          <input className={inputCls + " flex-1"} value={form.groupColor} onChange={(e) => setForm((f) => ({ ...f, groupColor: e.target.value }))} placeholder="#10b981" />
        </div>
      </Field>
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
