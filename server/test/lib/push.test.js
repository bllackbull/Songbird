import { describe, test, expect, vi } from "vitest";
import { createPushService } from "../../lib/push.js";

describe("createPushService", () => {
  const dummyVapid = {
    publicKey: "dummy-public-key",
    privateKey: "dummy-private-key",
    subject: "mailto:admin@example.com",
  };

  test("deletes subscription when push service returns 403 with VAPID credential mismatch", async () => {
    const deletePushSubscription = vi.fn().mockResolvedValue(true);
    const fakeWebpush = {
      setVapidDetails: vi.fn(),
      sendNotification: vi.fn().mockRejectedValue({
        statusCode: 403,
        body: "the VAPID credentials in the authorization header do not correspond to the credentials used to create the subscriptions.",
      }),
    };

    const pushService = createPushService({
      webpush: fakeWebpush,
      listPushSubscriptionsByUserIds: () => [
        {
          user_id: "user-1",
          endpoint: "https://fcm.googleapis.com/fcm/send/endpoint-403",
          p256dh: "key",
          auth: "auth",
        },
      ],
      deletePushSubscription,
      vapid: dummyVapid,
    });

    await pushService.sendPushNotificationToUsers(["user-1"], {
      title: "Test",
    });

    expect(deletePushSubscription).toHaveBeenCalledWith(
      "https://fcm.googleapis.com/fcm/send/endpoint-403",
    );
  });

  test("deletes subscription when push service returns 401 unauthorized", async () => {
    const deletePushSubscription = vi.fn().mockResolvedValue(true);
    const fakeWebpush = {
      setVapidDetails: vi.fn(),
      sendNotification: vi.fn().mockRejectedValue({
        statusCode: 401,
        body: "Unauthorized",
      }),
    };

    const pushService = createPushService({
      webpush: fakeWebpush,
      listPushSubscriptionsByUserIds: () => [
        {
          user_id: "user-1",
          endpoint: "https://web.push.apple.com/endpoint-401",
          p256dh: "key",
          auth: "auth",
        },
      ],
      deletePushSubscription,
      vapid: dummyVapid,
    });

    await pushService.sendPushNotificationToUsers(["user-1"], {
      title: "Test",
    });

    expect(deletePushSubscription).toHaveBeenCalledWith(
      "https://web.push.apple.com/endpoint-401",
    );
  });

  test("deletes subscription on 410, 404, or 400 VapidPkHashMismatch", async () => {
    const deletePushSubscription = vi.fn().mockResolvedValue(true);
    const fakeWebpush = {
      setVapidDetails: vi.fn(),
      sendNotification: vi.fn().mockRejectedValue({
        statusCode: 410,
        body: "Gone",
      }),
    };

    const pushService = createPushService({
      webpush: fakeWebpush,
      listPushSubscriptionsByUserIds: () => [
        {
          user_id: "user-1",
          endpoint: "https://push.services.mozilla.com/endpoint-410",
          p256dh: "key",
          auth: "auth",
        },
      ],
      deletePushSubscription,
      vapid: dummyVapid,
    });

    await pushService.sendPushNotificationToUsers(["user-1"], {
      title: "Test",
    });

    expect(deletePushSubscription).toHaveBeenCalledWith(
      "https://push.services.mozilla.com/endpoint-410",
    );
  });

  test("does NOT delete subscription on transient 500 or 503 errors", async () => {
    const deletePushSubscription = vi.fn().mockResolvedValue(true);
    const fakeWebpush = {
      setVapidDetails: vi.fn(),
      sendNotification: vi.fn().mockRejectedValue({
        statusCode: 503,
        body: "Service Unavailable",
      }),
    };

    const pushService = createPushService({
      webpush: fakeWebpush,
      listPushSubscriptionsByUserIds: () => [
        {
          user_id: "user-1",
          endpoint: "https://fcm.googleapis.com/fcm/send/endpoint-503",
          p256dh: "key",
          auth: "auth",
        },
      ],
      deletePushSubscription,
      vapid: dummyVapid,
    });

    await pushService.sendPushNotificationToUsers(["user-1"], {
      title: "Test",
    });

    expect(deletePushSubscription).not.toHaveBeenCalled();
  });
});
