import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import request from "supertest";
import realFs from "node:fs";
import realPath from "node:path";
import os from "node:os";
import { makeApp, makeUserStore } from "../helpers/makeApp.js";
import { createStorageEncryption } from "../../lib/storageEncryption.js";

const ENC_MAGIC = Buffer.from("SBENC1\0", "utf8");

// Fake .mov payload — content does not need to be a valid video because the
// route only encrypts + records the file; transcoding is stubbed out.
function buildFakeMovBuffer() {
  return Buffer.concat([
    Buffer.from([0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70]),
    Buffer.from("fake-mov-payload-for-encryption-repro", "utf8"),
  ]);
}

function makeUploadMiddleware(tmpDir, storedName, plainBytes) {
  return {
    array: () => (req, _res, next) => {
      const filePath = realPath.join(tmpDir, storedName);
      realFs.writeFileSync(filePath, plainBytes);
      req.files = [
        {
          originalname: "clip.mov",
          mimetype: "video/quicktime",
          filename: storedName,
          path: filePath,
          size: plainBytes.length,
        },
      ];
      req.body = req.body || {};
      req.body.chatId =
        req.body.chatId || "c0c0c0c0-d1d1-4e2e-af3f-060606060606";
      req.body.username = req.body.username || "alice";
      req.body.uploadType = req.body.uploadType || "media";
      next();
    },
  };
}

describe("POST /api/messages/upload local video with encryption enabled", () => {
  let tmpDir;
  let storedName;
  let plainBytes;
  let cookie;
  let appObj;
  let createMessageFilesMock;

  beforeEach(() => {
    tmpDir = realFs.mkdtempSync(
      realPath.join(os.tmpdir(), "sb-enc-type-test-"),
    );
    storedName = "clip-test.mov";
    plainBytes = buildFakeMovBuffer();

    process.env.STORAGE_ENCRYPTION_KEY = "test-encryption-key-for-repro";

    const ALICE_ID = "a0a0a0a0-b1b1-4c2c-8d3d-e4e4e4e4e4e4";
    const userStore = makeUserStore([
      {
        id: ALICE_ID,
        username: "alice",
        password_hash: "hash",
        nickname: "Alice",
        avatar_url: null,
        color: "#10b981",
        status: "online",
        role: "user",
        banned: false,
      },
    ]);

    const CHAT_ID = "c0c0c0c0-d1d1-4e2e-af3f-060606060606";
    const storageEncryption = createStorageEncryption({
      fsImpl: realFs,
      pathImpl: realPath,
    });
    createMessageFilesMock = vi.fn().mockReturnValue([]);

    appObj = makeApp({
      userStore,
      settings: { FILE_UPLOAD: true, FILE_UPLOAD_TRANSCODE_VIDEOS: false },
      deps: {
        emitChatEvent: () => {},
        fs: realFs,
        path: realPath,
        uploadRootDir: tmpDir,
        storageEncryption,
        storageProcessingMode: "sync",
        MESSAGE_FILE_LIMITS: {
          maxFiles: 10,
          maxTotalBytes: 100 * 1024 * 1024,
        },
        findChatById: () => ({ id: CHAT_ID, type: "group", name: "Test" }),
        findUserByUsername: (u) => userStore.findUserByUsername(u),
        isMember: () => true,
        createOrReuseMessage: () => ({
          id: "d0d0d0d0-e1e1-4f2f-b040-171717171717",
          deduped: false,
        }),
        createMessageFiles: createMessageFilesMock,
        listMessageFilesByMessageIds: () => [],
        hydrateMissingVideoMetadata: (rows) => Promise.resolve(rows || []),
        isVideoFileProcessing: () => false,
        probeVideoMetadata: async () => ({
          widthPx: null,
          heightPx: null,
          durationSeconds: null,
        }),
        enqueueVideoTranscodeJob: () => {},
        computeExpiryIso: () => null,
        inferMimeFromFilename: () => "video/quicktime",
        decodeOriginalFilename: (f) => f,
        isDangerousUploadFile: () => false,
        hasEnoughFreeDiskSpace: () => true,
        sanitizePositiveInt: (v) => v || null,
        sanitizeDurationSeconds: (v) => v || null,
        parseUploadFileMetadata: () => ({}),
        getUploadKind: () => "media",
        uploadFiles: makeUploadMiddleware(tmpDir, storedName, plainBytes),
        listChatMembers: () => [],
        listMutedUserIdsForChat: () => [],
        removeUploadedFiles: () => {},
      },
    });

    appObj.sessionStore.createSession(ALICE_ID, "enc-type-token");
    cookie = [`sid=enc-type-token`];
  });

  afterEach(() => {
    delete process.env.STORAGE_ENCRYPTION_KEY;
    realFs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test("records encryptionType local when the stored file was encrypted", async () => {
    const res = await request(appObj.app)
      .post("/api/messages/upload")
      .set("Cookie", cookie)
      .field("chatId", "c0c0c0c0-d1d1-4e2e-af3f-060606060606")
      .field("username", "alice")
      .field("uploadType", "media");

    expect(res.status).toBe(200);

    // The file on disk must actually be encrypted ...
    const onDisk = realFs.readFileSync(realPath.join(tmpDir, storedName));
    expect(onDisk.subarray(0, ENC_MAGIC.length).equals(ENC_MAGIC)).toBe(true);

    // ... and the DB record must say so, otherwise the media worker is told
    // encryptionType=none and tries to ffprobe ciphertext (moov not found).
    expect(createMessageFilesMock).toHaveBeenCalledTimes(1);
    const filesArg = createMessageFilesMock.mock.calls[0][1];
    expect(filesArg).toHaveLength(1);
    expect(filesArg[0].encryptionType || filesArg[0].encryption_type).toBe(
      "local",
    );
  });
});
