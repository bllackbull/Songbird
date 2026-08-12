import { describe, test, expect } from "vitest";

function matchAndUpdatePendingMessage(
  prev,
  pendingClientId,
  serverData,
  keepPendingUntilServerEcho,
) {
  const serverId = serverData?.id ? String(serverData.id) : null;
  const awaitingServerEcho = Boolean(serverId);
  const index = prev.findIndex(
    (msg) =>
      (msg?._clientId && String(msg._clientId) === String(pendingClientId)) ||
      (msg?.client_request_id &&
        String(msg.client_request_id) === String(pendingClientId)) ||
      (msg?.id && String(msg.id) === String(pendingClientId)) ||
      (serverId && String(msg?._serverId || msg?.id) === String(serverId)),
  );

  if (index >= 0) {
    return prev.map((msg, msgIndex) =>
      msgIndex === index
        ? {
            ...msg,
            _clientId: pendingClientId,
            client_request_id: pendingClientId,
            _serverId: serverId || msg._serverId || null,
            _delivery: keepPendingUntilServerEcho ? "sending" : "sent",
            _processingPending:
              keepPendingUntilServerEcho || Boolean(msg?._processingPending),
            _awaitingServerEcho: awaitingServerEcho,
            _uploadProgress: keepPendingUntilServerEcho ? 100 : null,
            expiresAt: serverData?.expiresAt || msg.expiresAt || null,
            files:
              Array.isArray(serverData?.files) && serverData.files.length > 0
                ? serverData.files
                : msg.files,
          }
        : msg,
    );
  }

  // Fallback appending
  return [
    ...prev,
    {
      id: pendingClientId,
      _clientId: pendingClientId,
      client_request_id: pendingClientId,
      _serverId: serverId,
      _delivery: keepPendingUntilServerEcho ? "sending" : "sent",
      _awaitingServerEcho: awaitingServerEcho,
      expiresAt: serverData?.expiresAt || null,
      files: serverData?.files || [],
    },
  ];
}

describe("Issue 2: Pending file message deduplication when file retention is OFF", () => {
  test("updates existing optimistic pending message in-place without producing duplicate key rows", () => {
    const clientId = "pending-1786474799787-7vz0xf";
    const serverUuid = "f47ac10b-58cc-4372-a567-0e02b2c3d479";
    const fileUuid = "11111111-1111-4111-a111-111111111111";
    const initialMessages = [
      {
        id: clientId,
        _clientId: clientId,
        client_request_id: clientId,
        body: "Sent document",
        _delivery: "sending",
        files: [{ id: fileUuid, name: "test.pdf", expiresAt: null }],
        expiresAt: null,
      },
    ];

    const serverResponseData = {
      id: serverUuid,
      expiresAt: null,
      files: [{ id: fileUuid, name: "test.pdf", expiresAt: null }],
    };

    const updated = matchAndUpdatePendingMessage(
      initialMessages,
      clientId,
      serverResponseData,
      false,
    );

    // Must be exactly 1 message in array (deduplicated), NOT 2
    expect(updated.length).toBe(1);
    expect(updated[0]._clientId).toBe(clientId);
    expect(updated[0]._serverId).toBe(serverUuid);
    expect(updated[0]._delivery).toBe("sent");

    // Keys generated from _clientId or _serverId must be unique in the resulting message array
    const keys = updated.map((m) => m._clientId || m._serverId || m.id);
    const uniqueKeys = new Set(keys);
    expect(uniqueKeys.size).toBe(keys.length);
  });

  test("correctly matches pending message when msg.id or client_request_id matches clientId even if _clientId was stripped", () => {
    const clientId = "pending-999999999999-abc123";
    const serverUuid = "a1b2c3d4-e5f6-4789-8012-3456789abcde";
    const fileUuid = "22222222-2222-4222-a222-222222222222";
    const initialMessages = [
      {
        id: clientId,
        client_request_id: clientId,
        body: "Sent document",
        _delivery: "sending",
        files: [{ id: fileUuid, name: "file.png" }],
      },
    ];

    const serverResponseData = {
      id: serverUuid,
      expiresAt: null,
      files: [{ id: fileUuid, name: "file.png", expiresAt: null }],
    };

    const updated = matchAndUpdatePendingMessage(
      initialMessages,
      clientId,
      serverResponseData,
      false,
    );

    expect(updated.length).toBe(1);
    expect(updated[0]._serverId).toBe(serverUuid);
  });
});
