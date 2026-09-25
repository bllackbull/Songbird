import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { Logger, TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import { getTelegramClientConnectionOptions } from "../lib/remoteChannels.js";
import {
  clearTelegramSession,
  resolveTelegramSecrets,
  saveTelegramSecrets,
} from "../lib/remoteChannelSecrets.js";
// Guided Telegram setup for Remote Channel (Services tab). Replaces the
// `remote:configure` CLI script: send a login code, verify it (+ 2FA), and
// persist the credentials outside the settings registry with a hot-reload
// (no restart). Env vars always win when set.

const PENDING_TTL_MS = 10 * 60 * 1000;
const pendingLogins = new Map(); // adminUserId -> { client, apiId, apiHash, phoneNumber, phoneCodeHash, createdAt }

function prunePending() {
  const now = Date.now();
  for (const [key, entry] of pendingLogins) {
    if (now - entry.createdAt > PENDING_TTL_MS) {
      entry.client?.destroy?.().catch(() => {});
      pendingLogins.delete(key);
    }
  }
}

function withTimeout(promise, ms, message) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function registerAdminRemoteChannelRoutes(app, deps) {
  const {
    getSessionFromRequest,
    isUserAdmin,
    getSetting,
    dbGetSetting,
    dbSetSetting,
    dbDeleteSetting,
    dbSave,
    remoteChannelManager,
  } = deps;

  const resolveMaybePromise = async (value) =>
    value && typeof value.then === "function" ? await value : value;

  const requireAdmin = async (req, res) => {
    const raw = getSessionFromRequest(req);
    const session = raw && typeof raw.then === "function" ? await raw : raw;
    if (!session?.id) {
      res.status(401).json({ error: "Not authenticated" });
      return null;
    }
    const admin = await resolveMaybePromise(isUserAdmin(session.id));
    if (!admin) {
      res.status(403).json({ error: "Admin access required" });
      return null;
    }
    return session;
  };

  const log = (session, action, opts = {}) => {
    const writeLog = deps.writeAdminAuditLog;
    try {
      const result = writeLog({
        actorUserId: session?.id ?? null,
        actorUsername: session?.username ?? null,
        action,
        targetType: opts.targetType ?? "system",
        targetLabel: opts.targetLabel ?? "remote-channel",
        details: opts.details ?? null,
        status: opts.status ?? "success",
      });
      if (result && typeof result.catch === "function") result.catch(() => {});
    } catch {
      // Logging must never break the request flow.
    }
  };

  const readCreds = () => resolveTelegramSecrets({ dbGetSetting });

  const saveCreds = (creds) =>
    saveTelegramSecrets({ dbSetSetting, dbSave }, creds);

  const reloadManager = async () => {
    if (typeof remoteChannelManager?.reloadConfig === "function") {
      const creds = await readCreds();
      await remoteChannelManager.reloadConfig({
        telegramApiId: creds.apiId,
        telegramApiHash: creds.apiHash,
        telegramSessionString: creds.sessionString,
      });
    }
  };

  // The channel routes gate on the REMOTE_CHANNELS snapshot captured at boot.
  // Re-sync the live object after setup changes so newly linked credentials
  // take effect without a restart.
  const syncChannelFlag = async () => {
    if (!deps.REMOTE_CHANNELS || typeof deps.REMOTE_CHANNELS !== "object") return;
    const creds = await readCreds();
    deps.REMOTE_CHANNELS.telegramConfigured = Boolean(
      creds.apiId && creds.apiHash && creds.sessionString,
    );
  };

  const buildClient = (apiId, apiHash) => {
    const proxyUrl = String(
      getSetting("REMOTE_CHANNEL_TELEGRAM_PROXY_URL") || "",
    ).trim();
    const connectionOptions = getTelegramClientConnectionOptions(
      proxyUrl,
      () => {},
    );
    return new TelegramClient(new StringSession(""), apiId, apiHash, {
      baseLogger: new Logger("none"),
      connectionRetries: 2,
      requestRetries: 1,
      autoReconnect: false,
      ...connectionOptions,
      deviceModel: "Songbird",
      systemVersion: "Songbird Server",
      appVersion: "1.0",
    });
  };

  const limiterKey = (req) =>
    `${String(req.adminSession?.id || "anon")}:${ipKeyGenerator(req.ip)}`;

  const sendCodeLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 5,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    keyGenerator: limiterKey,
    handler: (_req, res) =>
      res
        .status(429)
        .json({ error: "Too many code requests. Try again later." }),
  });
  const signInLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    keyGenerator: limiterKey,
    handler: (_req, res) =>
      res
        .status(429)
        .json({ error: "Too many sign-in attempts. Try again later." }),
  });

  // ─── Status (flags only — never secrets) ──────────────────────────────────
  app.get("/api/admin/remote-channel/status", async (req, res) => {
    const session = await requireAdmin(req, res);
    if (!session) return;
    // Env vars win over DB: when set, Services-tab writes would be ignored.
    const { managedByEnv, ...creds } = await readCreds();
    const health =
      typeof remoteChannelManager?.getHealth === "function"
        ? await remoteChannelManager.getHealth()
        : null;
    return res.json({
      enabled: Boolean(getSetting("REMOTE_CHANNEL")),
      telegramConfigured: Boolean(
        creds.apiId && creds.apiHash && creds.sessionString,
      ),
      hasApiCredentials: Boolean(creds.apiId && creds.apiHash),
      hasSession: Boolean(creds.sessionString),
      telegramConnected: Boolean(health?.telegramConnected),
      proxyConfigured: Boolean(
        String(getSetting("REMOTE_CHANNEL_TELEGRAM_PROXY_URL") || "").trim(),
      ),
      managedByEnv,
    });
  });

  // ─── Step 1: validate creds + send the Telegram login code ────────────────
  app.post(
    "/api/admin/remote-channel/send-code",
    sendCodeLimiter,
    async (req, res) => {
      const session = await requireAdmin(req, res);
      if (!session) return;
      const apiId = Number(req.body?.apiId || 0);
      const apiHash = String(req.body?.apiHash || "").trim();
      const phoneNumber = String(req.body?.phoneNumber || "").trim();
      if (!Number.isInteger(apiId) || apiId <= 0) {
        return res
          .status(400)
          .json({ error: "Telegram API ID must be a positive integer." });
      }
      if (!apiHash)
        return res
          .status(400)
          .json({ error: "Telegram API hash is required." });
      if (!/^\+[1-9]\d{6,14}$/.test(phoneNumber)) {
        return res
          .status(400)
          .json({
            error: "Phone number must be in E.164 format (e.g. +15551234567).",
          });
      }

      prunePending();
      const stale = pendingLogins.get(session.id);
      if (stale) {
        await stale.client?.destroy?.().catch(() => {});
        pendingLogins.delete(session.id);
      }

      const client = buildClient(apiId, apiHash);
      try {
        await withTimeout(
          client.connect(),
          20000,
          "Could not reach Telegram. Check the API credentials and proxy.",
        );
        const { phoneCodeHash, isCodeViaApp } = await withTimeout(
          client.sendCode({ apiId, apiHash }, phoneNumber),
          20000,
          "Telegram did not send a code. Try again.",
        );
        // Persist API creds only after Telegram accepted them.
        const saved = await saveCreds({ apiId, apiHash });
        if (!saved) {
          await client.destroy?.().catch(() => {});
          return res
            .status(500)
            .json({ error: "Could not persist credentials on this server." });
        }
        pendingLogins.set(session.id, {
          client,
          apiId,
          apiHash,
          phoneNumber,
          phoneCodeHash,
          createdAt: Date.now(),
        });
        log(session, "remoteChannel.setup_code_sent", {
          details: "Login code requested",
        });
        return res.json({ ok: true, isCodeViaApp: Boolean(isCodeViaApp) });
      } catch (error) {
        await client.destroy?.().catch(() => {});
        log(session, "remoteChannel.setup_code_failed", {
          details: String(
            error?.errorMessage || error?.message || "send-code failed",
          ),
          status: "failure",
        });
        return res
          .status(400)
          .json({
            error: String(
              error?.errorMessage || error?.message || "Failed to send code.",
            ),
          });
      }
    },
  );

  // ─── Step 2: verify code (+ 2FA password) and persist the session ─────────
  app.post(
    "/api/admin/remote-channel/sign-in",
    signInLimiter,
    async (req, res) => {
      const session = await requireAdmin(req, res);
      if (!session) return;
      prunePending();
      const pending = pendingLogins.get(session.id);
      if (!pending) {
        return res
          .status(400)
          .json({ error: "No pending login. Request a code first." });
      }
      const code = String(req.body?.code || "").trim();
      const password = String(req.body?.password || "");
      if (!/^\d{4,8}$/.test(code)) {
        return res
          .status(400)
          .json({ error: "Login code must be 4–8 digits." });
      }

      const { client, apiId, apiHash, phoneNumber, phoneCodeHash } = pending;
      const authParams = {
        phoneNumber,
        phoneCodeHash,
        phoneCode: async () => code,
        password: async () => password,
        onError: async (error) => {
          throw error;
        },
      };
      try {
        try {
          await withTimeout(
            client.signInUser({ apiId, apiHash }, authParams),
            20000,
            "Sign-in timed out. Try again.",
          );
        } catch (error) {
          if (
            !password &&
            (error?.errorMessage === "SESSION_PASSWORD_NEEDED" ||
              /password is empty/i.test(
                String(error?.errorMessage || error?.message || ""),
              ))
          ) {
            return res.json({ ok: false, needsPassword: true });
          }
          throw error;
        }
        const sessionString = client.session.save();
        if (!sessionString)
          throw new Error("Telegram did not return a session.");
        const saved = await saveCreds({ sessionString });
        if (!saved) throw new Error("Could not persist the session on this server.");
        await reloadManager();
        await syncChannelFlag();
        pendingLogins.delete(session.id);
        await client.destroy?.().catch(() => {});
        log(session, "remoteChannel.setup_signed_in", {
          details: "Telegram session saved",
        });
        return res.json({ ok: true });
      } catch (error) {
        const message = String(
          error?.errorMessage || error?.message || "Sign-in failed.",
        );
        log(session, "remoteChannel.setup_sign_in_failed", {
          details: message,
          status: "failure",
        });
        return res.status(400).json({ error: message });
      }
    },
  );

  // ─── Verify stored credentials against Telegram (read-only) ───────────────
  app.post(
    "/api/admin/remote-channel/test",
    signInLimiter,
    async (req, res) => {
      const session = await requireAdmin(req, res);
      if (!session) return;
      const creds = await readCreds();
      if (!creds.apiId || !creds.apiHash || !creds.sessionString) {
        return res
          .status(400)
          .json({ error: "Remote channel is not fully configured." });
      }
      const client = new TelegramClient(
        new StringSession(creds.sessionString),
        creds.apiId,
        creds.apiHash,
        {
          baseLogger: new Logger("none"),
          connectionRetries: 1,
          autoReconnect: false,
          deviceModel: "Songbird",
        },
      );
      try {
        await withTimeout(client.connect(), 15000, "Could not reach Telegram.");
        const me = await withTimeout(
          client.getMe(),
          15000,
          "Telegram did not respond.",
        );
        const username =
          me?.username ||
          [me?.firstName, me?.lastName].filter(Boolean).join(" ") ||
          "unknown";
        log(session, "remoteChannel.test", {
          details: `Connected as ${username}`,
        });
        return res.json({ ok: true, account: username });
      } catch (error) {
        return res
          .status(400)
          .json({
            error: String(
              error?.errorMessage ||
                error?.message ||
                "Connection test failed.",
            ),
          });
      } finally {
        await client.destroy?.().catch(() => {});
      }
    },
  );

  // ─── Disconnect: clear the session (keeps API ID/hash) ───────────────────
  app.delete("/api/admin/remote-channel/session", async (req, res) => {
    const session = await requireAdmin(req, res);
    if (!session) return;
    prunePending();
    const pending = pendingLogins.get(session.id);
    if (pending) {
      await pending.client?.destroy?.().catch(() => {});
      pendingLogins.delete(session.id);
    }
    const cleared = await clearTelegramSession({ dbDeleteSetting, dbSave });
    if (!cleared) {
      return res
        .status(500)
        .json({ error: "Could not clear the session on this server." });
    }
    await reloadManager();
    await syncChannelFlag();
    log(session, "remoteChannel.disconnected", {
      details: "Telegram session cleared",
    });
    return res.json({ ok: true });
  });
}

export { registerAdminRemoteChannelRoutes };
