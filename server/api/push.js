function registerPushRoutes(app, deps) {
  const {
    requireSession,
    requireSessionUsernameMatch,
    findUserByUsername,
    upsertPushSubscription,
    deletePushSubscription,
    VAPID_PUBLIC_KEY,
    sendPushNotificationToUsers,
    listPushSubscriptionsByUserIds,
  } = deps;

  app.get("/api/push/public-key", (req, res) => {
    const session = requireSession(req, res);
    if (!session) return;
    if (!VAPID_PUBLIC_KEY) {
      return res.status(503).json({ error: "Push is not configured." });
    }
    return res.json({ publicKey: VAPID_PUBLIC_KEY });
  });

  app.post("/api/push/subscribe", (req, res) => {
    const session = requireSession(req, res);
    if (!session) return;
    const { username, subscription } = req.body || {};
    if (!username || !subscription?.endpoint) {
      return res
        .status(400)
        .json({ error: "Username and subscription are required." });
    }
    if (!requireSessionUsernameMatch(res, session, username)) return;
    const user = findUserByUsername(String(username || "").toLowerCase());
    if (!user) return res.status(404).json({ error: "User not found." });
    try {
      upsertPushSubscription(
        user.id,
        subscription.endpoint,
        subscription.keys?.p256dh,
        subscription.keys?.auth,
      );
      return res.json({ ok: true });
    } catch (error) {
      return res
        .status(500)
        .json({ error: error?.message || "Unable to save subscription." });
    }
  });

  app.post("/api/push/unsubscribe", (req, res) => {
    const session = requireSession(req, res);
    if (!session) return;
    const { username, endpoint } = req.body || {};
    if (!username || !endpoint) {
      return res
        .status(400)
        .json({ error: "Username and endpoint are required." });
    }
    if (!requireSessionUsernameMatch(res, session, username)) return;
    deletePushSubscription(endpoint);
    return res.json({ ok: true });
  });

  app.post("/api/push/test", async (req, res) => {
    const session = requireSession(req, res);
    if (!session) return;
    const { username } = req.body || {};
    if (!username) {
      return res.status(400).json({ error: "Username is required." });
    }
    if (!requireSessionUsernameMatch(res, session, username)) return;
    if (!VAPID_PUBLIC_KEY) {
      return res.status(503).json({ error: "Push is not configured." });
    }
    const user = findUserByUsername(String(username || "").toLowerCase());
    if (!user) return res.status(404).json({ error: "User not found." });
    const subs = listPushSubscriptionsByUserIds([user.id]);
    if (!subs.length) {
      return res.status(400).json({ error: "No push subscription found." });
    }
    try {
      await sendPushNotificationToUsers([user.id], {
        title: "Songbird",
        body: "Test notification",
        data: { url: "/" },
      });
      return res.json({ ok: true });
    } catch {
      return res
        .status(500)
        .json({ error: "Unable to send test notification." });
    }
  });

  app.get("/api/push/debug", (req, res) => {
    const session = requireSession(req, res);
    if (!session) return;
    const username = req.query?.username?.toString();
    if (!username) {
      return res.status(400).json({ error: "Username is required." });
    }
    if (!requireSessionUsernameMatch(res, session, username)) return;
    const user = findUserByUsername(String(username || "").toLowerCase());
    if (!user) return res.status(404).json({ error: "User not found." });
    const subs = listPushSubscriptionsByUserIds([user.id]);
    return res.json({
      ok: true,
      configured: Boolean(VAPID_PUBLIC_KEY),
      count: subs.length,
      endpoints: subs.map((sub) => sub.endpoint),
    });
  });
}

export { registerPushRoutes };
