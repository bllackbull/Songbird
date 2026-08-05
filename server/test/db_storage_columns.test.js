import { describe, test, expect, beforeAll } from "vitest";
import {
  createMessageFiles,
  findMessageFileById,
  listMessageFilesByMessageIds,
  getRow,
  getAll,
  createMessage,
  createUser,
  createChat,
} from "../db.js";

describe("Database Storage and Media Columns (Migration 035)", () => {
  let testUserId;
  let testChatId;
  let testMessageId;

  beforeAll(() => {
    // Create prerequisite test entities
    testUserId = createUser(`storage_user_${Date.now()}`, "password123");
    testChatId = createChat("Storage Test Chat", "group");
    testMessageId = createMessage(
      testChatId,
      testUserId,
      "Test message for files",
    );
  });

  test("users table has avatar storage columns", () => {
    const user = getRow("SELECT * FROM users WHERE id = ?", [testUserId]);
    expect(user).toBeDefined();
    expect(user.avatar_storage_driver).toBeDefined();
    expect(user.avatar_storage_driver).toBe("local");
    expect(user.avatar_storage_key).toBeDefined(); // Can be null
    expect(user.avatar_encryption_type).toBeDefined();
    expect(user.avatar_encryption_type).toBe("none");
  });

  test("createMessageFiles inserts default storage and media fields", () => {
    createMessageFiles(testMessageId, [
      {
        kind: "image",
        originalName: "test.png",
        storedName: "test_stored.png",
        mimeType: "image/png",
        sizeBytes: 1024,
      },
    ]);

    const files = listMessageFilesByMessageIds([testMessageId]);
    expect(files.length).toBeGreaterThan(0);
    const file = files.find((f) => f.stored_name === "test_stored.png");
    expect(file).toBeDefined();
    expect(file.storage_driver).toBe("local");
    expect(file.storage_key).toBeNull();
    expect(file.processing_status).toBe("ready");
    expect(file.blurhash).toBeNull();
    expect(file.waveform).toBeNull();
    expect(file.thumb_storage_key).toBeNull();
    expect(file.encryption_type).toBe("none");
  });

  test("createMessageFiles inserts custom storage and media fields", () => {
    createMessageFiles(testMessageId, [
      {
        kind: "audio",
        originalName: "voice.ogg",
        storedName: "voice_stored.ogg",
        mimeType: "audio/ogg",
        sizeBytes: 2048,
        storageDriver: "s3",
        storageKey: "audio/123/voice.ogg",
        processingStatus: "processing",
        blurhash: "L6PZf-ay.ayB",
        waveform: "[0,1,2,3,4]",
        thumbStorageKey: "audio/123/thumb.png",
        encryptionType: "aes-256-gcm",
      },
    ]);

    const files = listMessageFilesByMessageIds([testMessageId]);
    const file = files.find((f) => f.stored_name === "voice_stored.ogg");
    expect(file).toBeDefined();
    expect(file.storage_driver).toBe("s3");
    expect(file.storage_key).toBe("audio/123/voice.ogg");
    expect(file.processing_status).toBe("processing");
    expect(file.blurhash).toBe("L6PZf-ay.ayB");
    expect(file.waveform).toBe("[0,1,2,3,4]");
    expect(file.thumb_storage_key).toBe("audio/123/thumb.png");
    expect(file.encryption_type).toBe("aes-256-gcm");

    // Test findMessageFileById
    const fetchedById = findMessageFileById(file.id);
    expect(fetchedById).toBeDefined();
    expect(fetchedById.id).toBe(file.id);
    expect(fetchedById.storage_driver).toBe("s3");
    expect(fetchedById.storage_key).toBe("audio/123/voice.ogg");
    expect(fetchedById.processing_status).toBe("processing");
    expect(fetchedById.blurhash).toBe("L6PZf-ay.ayB");
    expect(fetchedById.waveform).toBe("[0,1,2,3,4]");
    expect(fetchedById.thumb_storage_key).toBe("audio/123/thumb.png");
    expect(fetchedById.encryption_type).toBe("aes-256-gcm");
  });
});
