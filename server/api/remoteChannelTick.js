import rateLimit, { ipKeyGenerator } from "express-rate-limit";

/**
 * remoteChannelTick.js — sleep-friendly on-demand polling.
 *
 * POST /api/internal/remote-channel/tick runs one poll+queue cycle
 * (Telegram + Songbird sources, then a queue drain) and disconnects the
 * MTProto client so a serverless host (e.g. Render free) can sleep again.
 *
 * Auth: shared secret via `x-songbird-cron-secret` header, matching
 * REMOTE_CHANNEL_CRON_SECRET. That secret is auto-generated on first boot
 * (see ensureSystemSecrets in lib/secrets.js) and persisted to app_settings,
 * so deploys never require the user to invent one: env var wins when set
 * (and must match the stored value), otherwise the stored value is used.
 * Owners copy it from the admin panel Settings → Secrets section into their
 * external cron job.
 */

function resolveExpectedSecret(getSetting) {
  const envSecret = String(process.env.REMOTE_CHANNEL_CRON_SECRET || "").trim();
  if (envSecret) return envSecret;
  const live =
    typeof getSetting === "function"
      ? String(getSetting("REMOTE_CHANNEL_CRON_SECRET") || "").trim()
      : "";
  return live;
}

function registerRemoteChannelTickRoutes(app, deps) {
  const { remoteChannelManager, getSetting } = deps;

  const tickLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 30,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    keyGenerator: (req) => ipKeyGenerator(req.ip),
    handler: (_req, res) =>
      res.status(429).json({ error: "Too many requests." }),
  });

  app.post(
    "/api/internal/remote-channel/tick",
    tickLimiter,
    async (req, res) => {
      const expected = resolveExpectedSecret(getSetting);
      if (!expected) {
        return res.status(403).json({
          error:
            "Tick endpoint is not configured yet. Restart the server once so it can auto-generate REMOTE_CHANNEL_CRON_SECRET.",
        });
      }
      const provided = String(
        req.headers["x-songbird-cron-secret"] ||
          req.headers["x-cron-secret"] ||
          "",
      );
      if (!provided || provided !== expected) {
        return res.status(401).json({ error: "Unauthorized." });
      }
      if (!remoteChannelManager?.tickOnce) {
        return res
          .status(500)
          .json({ error: "Remote Channel manager unavailable." });
      }
      try {
        const body = req.body || {};
        const options = {};
        // Legacy param — still honored as max poll rounds (see tickOnce).
        if (body.drainBatches !== undefined) options.drainBatches = Number(body.drainBatches);
        if (body.maxPollRounds !== undefined) options.maxPollRounds = Number(body.maxPollRounds);
        if (body.maxQueueBatches !== undefined) options.maxQueueBatches = Number(body.maxQueueBatches);
        const summary = await remoteChannelManager.tickOnce(options);

        console.log(
          "[remote-channel] tick done",
          JSON.stringify({
            queued: summary?.queued ?? null,
            processed: summary?.processed ?? null,
            pollRounds: summary?.pollRounds ?? null,
            queueBatches: summary?.queueBatches ?? null,
            telegram: summary?.telegram ?? null,
            songbird: summary?.songbird ?? null,
          }),
        );
        return res.json({ ok: true, ...summary });
      } catch (error) {
        if (error?.code === "TICK_BUSY") {
          console.warn("[remote-channel] tick rejected: already in progress");
          return res
            .status(409)
            .json({ error: String(error?.message || "Tick already in progress.") });
        }
        return res
          .status(500)
          .json({ error: String(error?.message || "Tick failed.") });
      }
    },
  );

  // Liveness probe for the cron setup — same secret gate, no polling.
  app.get(
    "/api/internal/remote-channel/tick",
    tickLimiter,
    async (req, res) => {
      const expected = resolveExpectedSecret(getSetting);
      if (!expected) {
        return res.status(403).json({
          error:
            "Tick endpoint is not configured yet. Restart the server once so it can auto-generate REMOTE_CHANNEL_CRON_SECRET.",
        });
      }
      const provided = String(
        req.headers["x-songbird-cron-secret"] ||
          req.headers["x-cron-secret"] ||
          "",
      );
      if (!provided || provided !== expected) {
        return res.status(401).json({ error: "Unauthorized." });
      }
      const health = (await remoteChannelManager?.getHealth?.()) || null;
      return res.json({
        ok: true,
        tickMode: Boolean(health?.tickMode),
        health,
      });
    },
  );
}

export { registerRemoteChannelTickRoutes };
