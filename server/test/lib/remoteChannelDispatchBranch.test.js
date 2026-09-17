import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { createRemoteChannelManager } from "../../lib/remoteChannels.js";

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "rc-dispatch-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

const photoMessage = (id = 9) => ({
  id,
  media: { photo: { sizes: [{ w: 100, h: 100 }] } },
});

function makeStreamArgs(manager, overrides = {}) {
  const ensureMessage = Object.assign(async () => 42, {
    peekMessageId: () => null,
  });
  return {
    activeClient: {
      getMessages: async () => [photoMessage()],
      downloadMedia: async () => Buffer.from("dispatch-bytes"),
    },
    entity: {},
    mediaMessageIds: [9],
    chat: { id: "c1" },
    author: { id: "u1", username: "owner" },
    ensureMessage,
    ...overrides,
  };
}

describe("streamTelegramMediaFiles dispatch branch", () => {
  test("dispatched media skips the inline attach (webhook completes it)", async () => {
    const createMessageFiles = vi.fn(async () => [1]);
    const dispatchMirrorMedia = vi.fn(async () => true);
    // Manager captures deps at construction, so build it with the spies.
    const spied = createRemoteChannelManager({
      config: {
        enabled: true,
        fileUploadEnabled: true,
        uploadRootDir: tmpDir,
        avatarUploadRootDir: tmpDir,
        messageFileLimits: {
          maxFiles: 10,
          maxFileSizeBytes: 25 * 1024 * 1024,
          maxTotalBytes: 75 * 1024 * 1024,
        },
      },
      fs,
      path,
      crypto,
      dispatchMirrorMedia,
      storageProvider: { type: "local" },
      storageEncryption: {
        encryptFileInPlace: () => {},
        decryptBuffer: (b) => Buffer.from(b),
      },
      getUploadKind: () => "image",
      isDangerousUploadFile: () => false,
      hasEnoughFreeDiskSpace: () => true,
      sanitizePositiveInt: (n) => n,
      sanitizeDurationSeconds: (n) => n,
      createMessageFiles,
      setMessageExpiresAt: async () => {},
      emitChatEvent: () => {},
      debugLog: () => {},
    });
    const attached = await spied.streamTelegramMediaFiles(
      makeStreamArgs(spied),
    );
    expect(attached).toBe(1);
    expect(dispatchMirrorMedia).toHaveBeenCalledTimes(1);
    const args = dispatchMirrorMedia.mock.calls[0][0];
    expect(args.messageId).toBe(42);
    expect(args.chatId).toBe("c1");
    expect(args.storedName).toBeTruthy();
    expect(args.filePath).toContain(tmpDir);
    // Inline attach must not run — the webhook owns completion.
    expect(createMessageFiles).not.toHaveBeenCalled();
  });

  test("declined dispatch falls back to the inline path", async () => {
    const createMessageFiles = vi.fn(async () => [1]);
    const manager = createRemoteChannelManager({
      config: {
        enabled: true,
        fileUploadEnabled: true,
        uploadRootDir: tmpDir,
        avatarUploadRootDir: tmpDir,
        messageFileLimits: {
          maxFiles: 10,
          maxFileSizeBytes: 25 * 1024 * 1024,
          maxTotalBytes: 75 * 1024 * 1024,
        },
      },
      fs,
      path,
      crypto,
      dispatchMirrorMedia: async () => false,
      storageProvider: { type: "local" },
      storageEncryption: {
        encryptFileInPlace: () => {},
        decryptBuffer: (b) => Buffer.from(b),
      },
      getUploadKind: () => "image",
      isDangerousUploadFile: () => false,
      hasEnoughFreeDiskSpace: () => true,
      sanitizePositiveInt: (n) => n,
      sanitizeDurationSeconds: (n) => n,
      createMessageFiles,
      setMessageExpiresAt: async () => {},
      emitChatEvent: () => {},
      debugLog: () => {},
    });
    const attached = await manager.streamTelegramMediaFiles(
      makeStreamArgs(manager),
    );
    expect(attached).toBe(1);
    expect(createMessageFiles).toHaveBeenCalledTimes(1);
  });
});
