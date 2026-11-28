import {
  resolveTurnConfig as resolveTurnConfigLib,
  saveTurnConfig,
  validateTurnPatch,
  getTurnMode,
  toHealthEnv,
} from "../lib/turnConfig.js";
import { checkTurnHealth as checkTurnHealthLib } from "../lib/turnHealth.js";

// Admin-gated TURN setup for the Services tab. Credentials are stored as
// unregistered app_settings rows and never echoed back to the panel.
export function registerAdminTurnRoutes(app, deps) {
  const {
    getSessionFromRequest,
    isUserAdmin,
    dbGetSetting,
    dbSetSetting,
    dbDeleteSetting,
    dbSave,
    writeAdminAuditLog,
  } = deps;

  const resolveMaybePromise = async (value) =>
    value && typeof value.then === "function" ? await value : value;

  const requireAdmin = async (req, res) => {
    const raw = getSessionFromRequest(req);
    const session = await resolveMaybePromise(raw);
    if (!session?.id) {
      res.status(401).json({ error: "Not authenticated" });
      return null;
    }
    if (!(await resolveMaybePromise(isUserAdmin(session.id)))) {
      res.status(403).json({ error: "Admin access required" });
      return null;
    }
    return session;
  };

  const resolve = async () =>
    typeof deps.resolveTurnConfig === "function"
      ? deps.resolveTurnConfig()
      : resolveTurnConfigLib({ dbGetSetting });

  const log = (session, action) => {
    if (typeof writeAdminAuditLog !== "function") return;
    try {
      const result = writeAdminAuditLog({
        actorUserId: session?.id ?? null,
        actorUsername: session?.username ?? null,
        action,
        targetType: "system",
        targetLabel: "turn",
        details: null,
        status: "success",
      });
      if (result && typeof result.catch === "function") result.catch(() => {});
    } catch {
      // Auditing must never break the request flow.
    }
  };

  app.get("/api/admin/turn/status", async (req, res) => {
    const session = await requireAdmin(req, res);
    if (!session) return;
    const config = await resolve();
    return res.json({
      mode: getTurnMode(config),
      stunUrl: config.stunUrl,
      turnUrl: config.turnUrl,
      username: config.username,
      tokenId: config.tokenId,
      hasCredential: Boolean(config.credential),
      hasApiToken: Boolean(config.apiToken),
      managedByEnv: config.managedByEnv,
    });
  });

  const persistence = { dbSetSetting, dbSave, dbDeleteSetting };

  app.put("/api/admin/turn/config", async (req, res) => {
    const session = await requireAdmin(req, res);
    if (!session) return;
    const patch = req.body && typeof req.body === "object" ? req.body : {};
    const { mode } = patch;
    if (mode !== undefined && !["self-hosted", "cloudflare"].includes(mode)) {
      return res.status(400).json({ error: "Unknown TURN mode." });
    }
    const config = await resolve();
    const validation = validateTurnPatch(patch, config);
    if (!validation.valid)
      return res.status(400).json({ error: validation.error });
    let ok = await saveTurnConfig(persistence, patch);
    if (ok && mode) {
      // Switching modes wipes the other mode's keys; blanks never come from the form.
      const otherMode =
        mode === "cloudflare"
          ? { turnUrl: "", username: "", credential: "" }
          : { tokenId: "", apiToken: "" };
      ok = await saveTurnConfig(persistence, otherMode);
    }
    if (!ok) {
      return res
        .status(400)
        .json({ error: "Failed to save TURN configuration." });
    }
    log(session, "settings.turn.update");
    return res.json({ ok: true });
  });

  // The only wipe action, equivalent to Telegram's Disconnect.
  app.delete("/api/admin/turn/config", async (req, res) => {
    const session = await requireAdmin(req, res);
    if (!session) return;
    const ok = await saveTurnConfig(persistence, {
      stunUrl: "",
      turnUrl: "",
      username: "",
      credential: "",
      tokenId: "",
      apiToken: "",
    });
    if (!ok) {
      return res
        .status(400)
        .json({ error: "Failed to clear TURN configuration." });
    }
    log(session, "settings.turn.clear");
    return res.json({ ok: true });
  });

  app.post("/api/admin/turn/test", async (req, res) => {
    const session = await requireAdmin(req, res);
    if (!session) return;
    const config = await resolve();
    const probe =
      typeof deps.checkTurnHealth === "function"
        ? deps.checkTurnHealth
        : checkTurnHealthLib;
    let result;
    try {
      result = await probe(toHealthEnv(config), deps.fetch);
    } catch {
      result = {
        configured: true,
        managed: false,
        reachable: false,
        latencyMs: null,
      };
    }
    return res.json(result);
  });
}
