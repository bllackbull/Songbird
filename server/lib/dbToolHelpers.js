export function normalizeHexColor(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const normalized = raw.startsWith("#") ? raw : `#${raw}`;
  if (!/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(normalized)) {
    return null;
  }
  const hex = normalized.slice(1).toLowerCase();
  if (hex.length === 6) {
    return `#${hex}`;
  }
  return `#${hex
    .split("")
    .map((char) => `${char}${char}`)
    .join("")}`;
}

export function normalizeChatType(value) {
  return String(value || "")
    .trim()
    .toLowerCase() === "channel"
    ? "channel"
    : "group";
}

export function normalizeVisibility(value) {
  return String(value || "")
    .trim()
    .toLowerCase() === "private"
    ? "private"
    : "public";
}

export function parseListValue(value) {
  return String(value || "")
    .split(/[,\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function normalizeGroupUsername(value) {
  const raw = String(value || "")
    .trim()
    .toLowerCase();
  if (!raw) return "";
  return raw.replace(/^@+/, "");
}

export function resolveUserRow(dbApi, selector) {
  const raw = String(selector || "").trim();
  if (!raw) return null;
  const numeric = Number(raw);
  if (Number.isFinite(numeric) && numeric > 0) {
    return (
      dbApi.getRow(
        "SELECT id, username, nickname, avatar_url, color, status, banned FROM users WHERE id = ?",
        [Math.trunc(numeric)],
      ) || null
    );
  }
  return (
    dbApi.getRow(
      "SELECT id, username, nickname, avatar_url, color, status, banned FROM users WHERE username = ?",
      [raw.toLowerCase()],
    ) || null
  );
}

export function resolveChatRow(dbApi, selector, options = {}) {
  const raw = String(selector || "").trim();
  if (!raw) return null;
  const numeric = Number(raw);
  const groupOnly = options.groupOnly !== false;
  const typeFilter = groupOnly ? " AND type IN ('group', 'channel')" : "";
  if (Number.isFinite(numeric) && numeric > 0) {
    return (
      dbApi.getRow(
        `SELECT id, name, type, group_username, group_visibility, invite_token, group_color,
                allow_member_invites, group_avatar_url, created_by_user_id
         FROM chats
         WHERE id = ?${typeFilter}`,
        [Math.trunc(numeric)],
      ) || null
    );
  }
  const normalizedUsername = normalizeGroupUsername(raw);
  return (
    dbApi.getRow(
      `SELECT id, name, type, group_username, group_visibility, invite_token, group_color,
              allow_member_invites, group_avatar_url, created_by_user_id
       FROM chats
       WHERE group_username IN (?, ?)${typeFilter}`,
      [normalizedUsername, `@${normalizedUsername}`],
    ) || null
  );
}
