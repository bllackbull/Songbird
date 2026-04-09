export function createPushService({
  webpush,
  listPushSubscriptionsByUserIds,
  deletePushSubscription,
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
    const body = JSON.stringify(payload || {});
    await Promise.all(
      targets.map(async (sub) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: {
                p256dh: sub.p256dh || "",
                auth: sub.auth || "",
              },
            },
            body,
          );
        } catch (error) {
          const status = Number(error?.statusCode || 0);
          if (status === 404 || status === 410) {
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
