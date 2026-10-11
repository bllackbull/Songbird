import { dbKnex } from "../db/knex.js";
import { isValidUuid } from "./uuidUtils.js";

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

function toSql(builder) {
  if (builder && typeof builder.toSQL === "function") {
    const c = builder.toSQL();
    return { sql: c.sql, params: c.bindings || [] };
  }
  return { sql: builder, params: [] };
}

export function resolveUserRow(dbApi, selector) {
  const raw = String(selector || "").trim();
  if (!raw) return null;
  const num = Number(raw);
  const isId = isValidUuid(raw) || (Number.isFinite(num) && num > 0);
  const qb = isId
    ? dbKnex("users")
        .select("id", "username", "nickname", "avatar_url", "color", "status", "banned", "verified")
        .where("id", isNaN(num) ? raw : num)
        .first()
    : dbKnex("users")
        .select("id", "username", "nickname", "avatar_url", "color", "status", "banned", "verified")
        .where("username", raw.toLowerCase())
        .first();

  const { sql, params } = toSql(qb);
  const result = dbApi.getRow(sql, params);

  if (result && typeof result.then === "function") {
    return result.then((row) => row || null).catch(() => null);
  }
  return result || null;
}

export function resolveChatRow(dbApi, selector, options = {}) {
  const raw = String(selector || "").trim();
  if (!raw) return null;
  const num = Number(raw);
  const isId = isValidUuid(raw) || (Number.isFinite(num) && num > 0);
  const groupOnly = options.groupOnly !== false;
  const normalizedUsername = normalizeGroupUsername(raw);

  const buildQuery = (isIdQuery) => {
    const qb = dbKnex("chats").select(
      "id", "name", "type", "group_username", "group_visibility", "invite_token", "group_color",
      "allow_member_invites", "group_avatar_url", "created_by_user_id", "verified",
    );
    if (isIdQuery) {
      qb.where("id", isNaN(num) ? raw : num);
    } else {
      qb.whereIn("group_username", [normalizedUsername, `@${normalizedUsername}`]);
    }
    if (groupOnly) qb.whereIn("type", ["group", "channel"]);
    return qb.first();
  };

  const { sql, params } = toSql(buildQuery(isId));
  const result = dbApi.getRow(sql, params);

  if (result && typeof result.then === "function") {
    return result.then((row) => row || null).catch(() => null);
  }
  return result || null;
}
