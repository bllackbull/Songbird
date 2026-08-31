import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import realFs from "node:fs";
import realPath from "node:path";
import os from "node:os";
import { makeApp, makeUserStore } from "../helpers/makeApp.js";
import { createStorageEncryption } from "../../lib/storageEncryption.js";
import { RemoteStorageProvider } from "../../lib/storage/RemoteStorageProvider.js";

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const ENC_MAGIC = Buffer.from("SBENC1\0", "utf8");

function buildPlainPngBuffer() {
  const header = PNG_MAGIC;
  const ihdr = Buffer.from([0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52]);
  const idat = Buffer.from("IDAT-decoy-payload", "utf8");
  return Buffer.concat([header, ihdr, idat]);
}

function makeUploadMiddleware(tmpDir, storedName, plainBytes) {
  return {
    array: () => (req, _res, next) => {
      const filePath = realPath.join(tmpDir, storedName);
      realFs.writeFileSync(filePath, plainBytes);
      req.files = [
        {
          originalname: "photo.png",
          mimetype: "image/png",
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

describe("POST /api/messages/upload with remote storage + file encryption", () => {
  let tmpDir;
  let storedName;
  let plainBytes;
  let uploadBufferSpy;
  let provider;
  let cookie;
  let appObj;

  beforeEach(() => {
    tmpDir = realFs.mkdtempSync(realPath.join(os.tmpdir(), "sb-upload-test-"));
    storedName = "photo-test.png";
    plainBytes = buildPlainPngBuffer();

    uploadBufferSpy = vi
      .fn()
      .mockResolvedValue({ key: `uploads/${storedName}` });
    provider = new RemoteStorageProvider({
      STORAGE_BUCKET: "test-bucket",
      STORAGE_REGION: "auto",
      STORAGE_ACCESS_KEY_ID: "test-key",
      STORAGE_SECRET_ACCESS_KEY: "test-secret",
      STORAGE_ENDPOINT: "https://example.com",
    });
    provider.uploadBuffer = uploadBufferSpy;
    vi.spyOn(provider, "getDownloadUrl").mockResolvedValue(
      `https://cdn.example.com/uploads/${storedName}`,
    );

    process.env.STORAGE_ENCRYPTION_KEY = "test-encryption-key-for-repro";

    const hash = bcrypt.hashSync("secret123", 4);
    const ALICE_ID = "a0a0a0a0-b1b1-4c2c-8d3d-e4e4e4e4e4e4";
    const userStore = makeUserStore([
      {
        id: ALICE_ID,
        username: "alice",
        password_hash: hash,
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

    const emitChatEvent = vi.fn();

    appObj = makeApp({
      userStore,
      settings: { FILE_UPLOAD: true },
      deps: {
        emitChatEvent,
        fs: realFs,
        path: realPath,
        uploadRootDir: tmpDir,
        storageEncryption,
        storageProvider: provider,
        storageProcessingMode: "sync",
        MESSAGE_FILE_LIMITS: {
          maxFiles: 10,
          maxTotalBytes: 100 * 1024 * 1024,
        },
        findChatById: () => ({
          id: CHAT_ID,
          type: "group",
          name: "Test Group",
        }),
        findUserByUsername: (u) => userStore.findUserByUsername(u),
        isMember: () => true,
        createOrReuseMessage: () => ({
          id: "d0d0d0d0-e1e1-4f2f-b040-171717171717",
          deduped: false,
        }),
        createMessageFiles: vi.fn(),
        listMessageFilesByMessageIds: () => [],
        hydrateMissingVideoMetadata: (rows) => Promise.resolve(rows || []),
        isVideoFileProcessing: () => false,
        enqueueVideoTranscodeJob: () => {},
        computeExpiryIso: () => null,
        inferMimeFromFilename: () => "image/png",
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

    const sessionToken = "enc-remote-token";
    appObj.sessionStore.createSession(ALICE_ID, sessionToken);
    cookie = [`sid=${sessionToken}`];
  });

  afterEach(() => {
    delete process.env.STORAGE_ENCRYPTION_KEY;
    realFs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test("uploads PLAINTEXT bytes to remote storage (not encrypted bytes)", async () => {
    const res = await request(appObj.app)
      .post("/api/messages/upload")
      .set("Cookie", cookie)
      .field("chatId", "c0c0c0c0-d1d1-4e2e-af3f-060606060606")
      .field("username", "alice")
      .field("uploadType", "media");

    expect(res.status).toBe(200);
    expect(uploadBufferSpy).toHaveBeenCalledTimes(1);

    const [fileKey, body, contentType] = uploadBufferSpy.mock.calls[0];
    expect(fileKey).toBe(`uploads/${storedName}`);
    expect(contentType).toBe("image/png");

    expect(Buffer.isBuffer(body)).toBe(true);
    const bytes = Buffer.from(body);

    expect(bytes.subarray(0, PNG_MAGIC.length).equals(PNG_MAGIC)).toBe(true);
    expect(bytes.subarray(0, ENC_MAGIC.length).equals(ENC_MAGIC)).toBe(false);
    expect(String(bytes.subarray(0, 32))).not.toContain("SBENC1");
  });
});
