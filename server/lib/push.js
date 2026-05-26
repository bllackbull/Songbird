export function createPushService({
  webpush,
  listPushSubscriptionsByUserIds,
  deletePushSubscription,
  getTotalUnreadCount,
  vapid,
  proxyUrl,
}) {
  const VAPID_PUBLIC_KEY = String(vapid.publicKey || "").trim();
  const VAPID_PRIVATE_KEY = String(vapid.privateKey || "").trim();
  const VAPID_SUBJECT = String(
    vapid.subject || "mailto:admin@example.com",
  ).trim();
  const PUSH_ENABLED = Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);
  
  let proxyAgent = null;

  if (PUSH_ENABLED) {
    try {
      webpush.setVapidDetails(
        VAPID_SUBJECT,
        VAPID_PUBLIC_KEY,
        VAPID_PRIVATE_KEY,
      );
      
      // Configure proxy if provided
      if (proxyUrl) {
        import('https-proxy-agent').then(({ HttpsProxyAgent }) => {
          proxyAgent = new HttpsProxyAgent(proxyUrl);
          console.log(`[push] Using proxy: ${proxyUrl}`);
        }).catch((error) => {
          console.error(
            "[push] Failed to configure proxy:",
            String(error?.message || error),
          );
        });
      }
    } catch (error) {
      console.error(
        "[push] VAPID setup failed:",
        String(error?.message || error),
      );
    }
  }

  async function sendPushNotificationToUsers(userIds = [], payload = {}) {
    if (!PUSH_ENABLED) return;
    const targets = listPushSubscriptionsByUserIds(userIds);
    if (!targets.length) return;

    const badgeByUserId = {};
    for (const sub of targets) {
      const uid = sub.user_id;
      if (!(uid in badgeByUserId)) {
        try {
          badgeByUserId[uid] = getTotalUnreadCount
            ? getTotalUnreadCount(uid)
            : 1;
        } catch {
          badgeByUserId[uid] = 1;
        }
      }
    }

    await Promise.all(
      targets.map(async (sub) => {
        const badge = badgeByUserId[sub.user_id] ?? 1;
        const perUserBody = JSON.stringify({ ...payload, badge });
        try {
          const sendOptions = { urgency: "high", TTL: 86400 };
          if (proxyAgent) sendOptions.agent = proxyAgent;
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: {
                p256dh: sub.p256dh || "",
                auth: sub.auth || "",
              },
            },
            perUserBody,
            sendOptions,
          );
        } catch (error) {
          const status = Number(error?.statusCode || 0);
          const errBody = String(error?.body || "");
          
          // Log detailed error information for debugging
          let errorDetails = String(error?.message || error).slice(0, 120);
          if (error?.errors && Array.isArray(error.errors)) {
            // AggregateError contains multiple errors
            errorDetails = error.errors.map(e => String(e?.message || e)).join('; ').slice(0, 200);
          }
          
          console.warn(
            `[push] delivery failed endpoint=${sub.endpoint.slice(-24)} status=${status} body=${errBody.slice(0, 200)} err=${errorDetails}`,
          );
          
          const isGone =
            status === 404 ||
            status === 410 ||
            (status === 400 && errBody.includes("VapidPkHashMismatch"));
          if (isGone) {
            deletePushSubscription(sub.endpoint);
          }
        }
      }),
    );
  }

  return {
    PUSH_ENABLED,
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY,
    VAPID_SUBJECT,
    sendPushNotificationToUsers,
  };
}
