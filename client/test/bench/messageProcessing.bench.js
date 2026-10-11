import { describe, test } from "vitest";
import {
  normalizeMessageBody,
  sanitizeMessageForCache,
} from "../../src/utils/chatCache.js";
import { summarizeFiles } from "../../src/utils/messagePreview.js";
import { getAvatarInitials } from "../../src/utils/avatarInitials.js";
import {
  compareVersions,
  normalizeVersion,
} from "../../src/utils/versioning.js";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const plainBody =
  "Hello, this is a normal chat message with some text content.";
const objectBody = { text: "Hello from object body" };
const badBody = "[object Object]";

const typicalMessage = {
  id: "d0d0d0d0-e1e1-4f2f-b040-171717171717",
  body: plainBody,
  username: "alice",
  user_id: "a0a0a0a0-b1b1-4c2c-8d3d-e4e4e4e4e4e4",
  created_at: "2024-06-15T10:30:00Z",
  replyTo: { id: "e0e0e0e0-f1f1-4020-c151-282828282828", body: "Reply target" },
  files: [
    {
      id: "f47ac10b-58cc-4372-a567-0e02b2c3d479",
      url: "/api/uploads/messages/abc.jpg",
      mimeType: "image/jpeg",
      _localUrl: null,
      _localId: null,
      _uploadProgress: null,
      _pending: null,
    },
  ],
  _files: [],
  _clientId: "req-001",
  _chatId: "c0c0c0c0-d1d1-4e2e-af3f-060606060606",
  _queuedAt: Date.now(),
  _delivery: "sent",
  _uploadType: "media",
  _uploadProgress: 1,
  _awaitingServerEcho: false,
  _processingPending: false,
  _serverId: "d0d0d0d0-e1e1-4f2f-b040-171717171717",
  _visibilityTime: null,
  _readByMe: true,
};

const imageFiles = [
  { mimeType: "image/jpeg" },
  { mimeType: "image/png" },
  { mimeType: "image/webp" },
];
const mixedFiles = [
  { mimeType: "image/jpeg" },
  { mimeType: "video/mp4" },
  { mimeType: "audio/ogg" },
];

// ─── normalizeMessageBody ─────────────────────────────────────────────────────

describe("normalizeMessageBody", () => {
  test("plain string (most common path)", async ({ bench }) => {
    await bench("plain string (most common path)", () => {
      normalizeMessageBody(plainBody);
    }).run();
  });

  test("object with .text property", async ({ bench }) => {
    await bench("object with .text property", () => {
      normalizeMessageBody(objectBody);
    }).run();
  });

  test("[object Object] guard", async ({ bench }) => {
    await bench("[object Object] guard", () => {
      normalizeMessageBody(badBody);
    }).run();
  });

  test("null", async ({ bench }) => {
    await bench("null", () => {
      normalizeMessageBody(null);
    }).run();
  });
});

// ─── sanitizeMessageForCache ──────────────────────────────────────────────────

describe("sanitizeMessageForCache", () => {
  test("typical message with files and replyTo", async ({ bench }) => {
    await bench("typical message with files and replyTo", () => {
      sanitizeMessageForCache(typicalMessage);
    }).run();
  });

  test("minimal message (no files, no replyTo)", async ({ bench }) => {
    await bench("minimal message (no files, no replyTo)", () => {
      sanitizeMessageForCache({ id: "d0d0d0d0-e1e1-4f2f-b040-171717171717", body: "hi", username: "bob" });
    }).run();
  });
});

// ─── summarizeFiles ───────────────────────────────────────────────────────────

describe("summarizeFiles", () => {
  test("single image", async ({ bench }) => {
    await bench("single image", () => {
      summarizeFiles([{ mimeType: "image/jpeg" }]);
    }).run();
  });

  test("3 images", async ({ bench }) => {
    await bench("3 images", () => {
      summarizeFiles(imageFiles);
    }).run();
  });

  test("mixed types (image + video + audio)", async ({ bench }) => {
    await bench("mixed types (image + video + audio)", () => {
      summarizeFiles(mixedFiles);
    }).run();
  });

  test("empty array", async ({ bench }) => {
    await bench("empty array", () => {
      summarizeFiles([]);
    }).run();
  });
});

// ─── getAvatarInitials ────────────────────────────────────────────────────────

describe("getAvatarInitials", () => {
  test("two Latin words", async ({ bench }) => {
    await bench("two Latin words", () => {
      getAvatarInitials("John Doe");
    }).run();
  });

  test("single Latin word", async ({ bench }) => {
    await bench("single Latin word", () => {
      getAvatarInitials("Alice");
    }).run();
  });

  test("Persian name", async ({ bench }) => {
    await bench("Persian name", () => {
      getAvatarInitials("علی رضا");
    }).run();
  });

  test("mixed-script name", async ({ bench }) => {
    await bench("mixed-script name", () => {
      getAvatarInitials("Ali علی");
    }).run();
  });

  test("empty string (fallback path)", async ({ bench }) => {
    await bench("empty string (fallback path)", () => {
      getAvatarInitials("");
    }).run();
  });
});

// ─── compareVersions / normalizeVersion ──────────────────────────────────────

describe("compareVersions", () => {
  test("equal versions", async ({ bench }) => {
    await bench("equal versions", () => {
      compareVersions("1.2.3", "1.2.3");
    }).run();
  });

  test("major difference", async ({ bench }) => {
    await bench("major difference", () => {
      compareVersions("2.0.0", "1.9.9");
    }).run();
  });

  test("prerelease vs stable", async ({ bench }) => {
    await bench("prerelease vs stable", () => {
      compareVersions("1.0.0-beta.1", "1.0.0");
    }).run();
  });

  test("v-prefixed inputs", async ({ bench }) => {
    await bench("v-prefixed inputs", () => {
      compareVersions("v2.1.0", "v2.0.9");
    }).run();
  });
});

describe("normalizeVersion", () => {
  test("strip v prefix", async ({ bench }) => {
    await bench("strip v prefix", () => {
      normalizeVersion("v1.2.3");
    }).run();
  });

  test("no-op on plain version", async ({ bench }) => {
    await bench("no-op on plain version", () => {
      normalizeVersion("1.2.3");
    }).run();
  });
});
