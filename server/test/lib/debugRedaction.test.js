import { describe, test, expect } from "vitest";
import { redactDebugSecrets } from "../../lib/debugRedaction.js";

describe("redactDebugSecrets", () => {
  test("redacts nested TURN secrets in debug request bodies", () => {
    const result = redactDebugSecrets({
      body: {
        credential: "relay-password",
        apiToken: "cf-token-secret",
        turnUrl: "turn:relay.example.com:3478",
      },
    });
    expect(result.body).toEqual({
      credential: "[redacted]",
      apiToken: "[redacted]",
      turnUrl: "turn:relay.example.com:3478",
    });
  });

  test("redacts Telegram secrets and array items without mutating the input", () => {
    const input = {
      body: [
        {
          apiHash: "hash-secret",
          sessionString: "session-secret",
          username: "alice",
        },
      ],
    };
    const result = redactDebugSecrets(input);
    expect(result.body[0]).toEqual({
      apiHash: "[redacted]",
      sessionString: "[redacted]",
      username: "alice",
    });
    expect(input.body[0].apiHash).toBe("hash-secret");
  });
});
