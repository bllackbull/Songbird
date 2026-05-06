export function createPushService({
  webpush,
  listPushSubscriptionsByUserIds,
  deletePushSubscription,
  getTotalUnreadCount,
  vapid,
}) {
  const VAPID_PUBLIC_KEY = String(vapid.publicKey || "").trim();
  const VAPID_PRIVATE_KEY = String(vapid.privateKey || "").trim();
  const VAPID_SUBJECT = String(
    vapid.subject || "mailto:admin@example.com",
  ).trim();
  const PUSH_ENABLED = Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);

  if (PUSH_ENABLED) {
    try {
      webpush.setVapidDetails(
        VAPID_SUBJECT,
        VAPID_PUBLIC_KEY,
        VAPID_PRIVATE_KEY,
      );
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
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: {
                p256dh: sub.p256dh || "",
                auth: sub.auth || "",
              },
            },
            perUserBody,
            { urgency: "high", TTL: 86400 },
          );
        } catch (error) {
          const status = Number(error?.statusCode || 0);
          const errBody = String(error?.body || "");
          console.warn(
            `[push] delivery failed endpoint=${sub.endpoint.slice(-24)} status=${status} body=${errBody.slice(0, 200)} err=${String(error?.message || error).slice(0, 120)}`,
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
