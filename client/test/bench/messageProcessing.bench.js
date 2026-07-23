import { describe, bench } from "vitest";
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
  id: 42,
  body: plainBody,
  username: "alice",
  user_id: 1,
  created_at: "2024-06-15T10:30:00Z",
  replyTo: { id: 10, body: "Reply target" },
  files: [
    {
      id: 1,
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
  _chatId: 5,
  _queuedAt: Date.now(),
  _delivery: "sent",
  _uploadType: "media",
  _uploadProgress: 1,
  _awaitingServerEcho: false,
  _processingPending: false,
  _serverId: 42,
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
  bench("plain string (most common path)", () => {
    normalizeMessageBody(plainBody);
  });

  bench("object with .text property", () => {
    normalizeMessageBody(objectBody);
  });

  bench("[object Object] guard", () => {
    normalizeMessageBody(badBody);
  });

  bench("null", () => {
    normalizeMessageBody(null);
  });
});

// ─── sanitizeMessageForCache ──────────────────────────────────────────────────

describe("sanitizeMessageForCache", () => {
  bench("typical message with files and replyTo", () => {
    sanitizeMessageForCache(typicalMessage);
  });

  bench("minimal message (no files, no replyTo)", () => {
    sanitizeMessageForCache({ id: 1, body: "hi", username: "bob" });
  });
});

// ─── summarizeFiles ───────────────────────────────────────────────────────────

describe("summarizeFiles", () => {
  bench("single image", () => {
    summarizeFiles([{ mimeType: "image/jpeg" }]);
  });

  bench("3 images", () => {
    summarizeFiles(imageFiles);
  });

  bench("mixed types (image + video + audio)", () => {
    summarizeFiles(mixedFiles);
  });

  bench("empty array", () => {
    summarizeFiles([]);
  });
});

// ─── getAvatarInitials ────────────────────────────────────────────────────────

describe("getAvatarInitials", () => {
  bench("two Latin words", () => {
    getAvatarInitials("John Doe");
  });

  bench("single Latin word", () => {
    getAvatarInitials("Alice");
  });

  bench("Persian name", () => {
    getAvatarInitials("علی رضا");
  });

  bench("mixed-script name", () => {
    getAvatarInitials("Ali علی");
  });

  bench("empty string (fallback path)", () => {
    getAvatarInitials("");
  });
});

// ─── compareVersions / normalizeVersion ──────────────────────────────────────

describe("compareVersions", () => {
  bench("equal versions", () => {
    compareVersions("1.2.3", "1.2.3");
  });

  bench("major difference", () => {
    compareVersions("2.0.0", "1.9.9");
  });

  bench("prerelease vs stable", () => {
    compareVersions("1.0.0-beta.1", "1.0.0");
  });

  bench("v-prefixed inputs", () => {
    compareVersions("v2.1.0", "v2.0.9");
  });
});

describe("normalizeVersion", () => {
  bench("strip v prefix", () => {
    normalizeVersion("v1.2.3");
  });

  bench("no-op on plain version", () => {
    normalizeVersion("1.2.3");
  });
});
