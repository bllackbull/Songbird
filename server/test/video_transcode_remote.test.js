import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import { createVideoTranscodeManager } from "../lib/videoTranscode.js";
import { LocalStorageProvider } from "../lib/storage/LocalStorageProvider.js";
import { createStorageEncryption } from "../lib/storageEncryption.js";

describe("Video Transcode Manager - Remote & Local Storage", () => {
  let tmpDir;
  let mockStorageProvider;
  let mockSpawn;
  let dbRows;
  let adminRunEvents;
  let emittedEvents;
  let storageEncryption;

  beforeEach(async () => {
    tmpDir = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), "transcode-test-"),
    );
    mockStorageProvider = new LocalStorageProvider({ uploadDir: tmpDir });
    dbRows = new Map();
    adminRunEvents = [];
    emittedEvents = [];
    storageEncryption = createStorageEncryption();

    // Mock spawn to simulate successful ffmpeg & ffprobe executions
    mockSpawn = vi.fn((cmd, args, opts) => {
      const listeners = {};
      const child = {
        stdout: {
          on: (event, cb) => {
            listeners[`stdout:${event}`] = cb;
            if (cmd === "ffprobe" && event === "data") {
              cb(
                JSON.stringify({
                  streams: [{ width: 1280, height: 720, duration: "5.5" }],
                  format: { duration: "5.5" },
                }),
              );
            }
          },
        },
        stderr: {
          on: (event, cb) => {
            listeners[`stderr:${event}`] = cb;
          },
        },
        on: (event, cb) => {
          listeners[event] = cb;
          if (event === "close") {
            // When ffmpeg runs, write a dummy output MP4 file if commanded
            if (cmd === "ffmpeg") {
              const outPath = args[args.length - 1];
              if (outPath && !outPath.startsWith("-")) {
                try {
                  fs.writeFileSync(outPath, "dummy transcoded video content");
                } catch (_) {}
              }
            }
            setTimeout(() => cb(0), 10);
          }
        },
      };
      return child;
    });
  });

  afterEach(async () => {
    if (tmpDir) {
      await fs.promises.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("transcodes remote video file downloaded from storageProvider and uploads result", async () => {
    const remoteKey = "messages/video123.mp4";
    const srcPath = path.join(tmpDir, remoteKey);
    await fs.promises.mkdir(path.dirname(srcPath), { recursive: true });
    await fs.promises.writeFile(srcPath, "dummy input video content");

    const fileRecord = {
      id: "file-uuid-123",
      message_id: "msg-uuid-456",
      stored_name: "video123.mp4",
      storage_key: remoteKey,
      storage_driver: "remote",
      mime_type: "video/mp4",
      processing_status: "pending",
    };
    dbRows.set("file-uuid-123", fileRecord);

    const manager = createVideoTranscodeManager({
      spawn: mockSpawn,
      fs,
      path,
      crypto: (await import("node:crypto")).default,
      adminRun: (sql) => {
        adminRunEvents.push(sql);
      },
      adminGetRow: (sqlBuilder) => {
        return fileRecord;
      },
      adminSave: () => {},
      listMessageFilesByMessageIds: () => [fileRecord],
      emitChatEvent: (chatId, evt) => {
        emittedEvents.push({ chatId, evt });
      },
      debugLog: () => {},
      uploadRootDir: tmpDir,
      transcodeVideosToH264: true,
      storageEncryption,
      storageProvider: mockStorageProvider,
    });

    const jobHandled = manager.enqueueVideoTranscodeJob({
      fileId: "file-uuid-123",
      storedName: "video123.mp4",
      storageKey: remoteKey,
      storageDriver: "remote",
      chatId: "chat-uuid-789",
      messageId: "msg-uuid-456",
    });

    expect(jobHandled).toBe(true);

    // Wait for queue processing
    await new Promise((r) => setTimeout(r, 200));

    expect(mockSpawn).toHaveBeenCalled();
    const readyEvent = emittedEvents.find((e) => e.evt.type === "video:ready");
    expect(readyEvent).toBeDefined();
    expect(readyEvent.evt.status).toBe("ready");
    expect(readyEvent.evt.storageKey).toMatch(/messages\/video123-h264.*\.mp4/);
  });
});
