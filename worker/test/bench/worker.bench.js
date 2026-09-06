import { describe, bench, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import {
  isEncryptedFileBuffer,
  decryptFileToTempPath,
  encryptBuffer,
} from "../../encryption.js";
import { resolveDataDir, createStorage } from "../../storage.js";

// ─── Setup Test Fixtures ───────────────────────────────────────────────────────

const tempBenchDir = path.join(
  os.tmpdir(),
  "songbird-worker-bench-" + crypto.randomUUID(),
);
fs.mkdirSync(tempBenchDir, { recursive: true });

const key = "bench-secret-key-12345";
process.env.STORAGE_ENCRYPTION_KEY = key;

// Buffer fixtures
const smallPlain = Buffer.alloc(4 * 1024, "A");
const mediumPlain = Buffer.alloc(64 * 1024, "B");
const largePlain = Buffer.alloc(512 * 1024, "C");

const encryptedSmallBuffer = encryptBuffer(smallPlain);
const encryptedMediumBuffer = encryptBuffer(mediumPlain);

// File paths
const smallPlainFile = path.join(tempBenchDir, "small.txt");
const mediumPlainFile = path.join(tempBenchDir, "medium.txt");
const unencryptedFile = path.join(tempBenchDir, "unencrypted.bin");

fs.writeFileSync(smallPlainFile, smallPlain);
fs.writeFileSync(mediumPlainFile, mediumPlain);
fs.writeFileSync(unencryptedFile, smallPlain);

// Pre-create encrypted files for decryption benchmarking
const smallEncryptedFile = path.join(tempBenchDir, "small_enc.bin");
const mediumEncryptedFile = path.join(tempBenchDir, "medium_enc.bin");
fs.writeFileSync(smallEncryptedFile, encryptedSmallBuffer);
fs.writeFileSync(mediumEncryptedFile, encryptedMediumBuffer);

afterAll(() => {
  try {
    fs.rmSync(tempBenchDir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
});

// ─── isEncryptedFileBuffer Benchmarks ─────────────────────────────────────────

describe("isEncryptedFileBuffer", () => {
  bench("null / undefined guard (early exit)", () => {
    isEncryptedFileBuffer(null);
    isEncryptedFileBuffer(undefined);
  });

  bench("small buffer (< 35 bytes header)", () => {
    isEncryptedFileBuffer(Buffer.from("short"));
  });

  bench("plain unencrypted buffer (64 KB)", () => {
    isEncryptedFileBuffer(mediumPlain);
  });

  bench("valid encrypted header (64 KB)", () => {
    isEncryptedFileBuffer(encryptedMediumBuffer);
  });
});

// ─── Buffer Encryption Benchmarks ─────────────────────────────────────────────

describe("Buffer Encryption (AES-256-GCM)", () => {
  bench("encryptBuffer — 4 KB payload", () => {
    encryptBuffer(smallPlain);
  });

  bench("encryptBuffer — 64 KB payload", () => {
    encryptBuffer(mediumPlain);
  });

  bench("encryptBuffer — 512 KB payload", () => {
    encryptBuffer(largePlain);
  });
});

// ─── File Decryption Benchmarks ───────────────────────────────────────────────

describe("File Decryption to Temp Path", () => {
  bench("decryptFileToTempPath — 4 KB encrypted payload", () => {
    const res = decryptFileToTempPath(smallEncryptedFile, "test.txt");
    res.cleanup();
  });

  bench("decryptFileToTempPath — 64 KB encrypted payload", () => {
    const res = decryptFileToTempPath(mediumEncryptedFile, "test.bin");
    res.cleanup();
  });

  bench("decryptFileToTempPath — unencrypted bypass (no-op fast path)", () => {
    const res = decryptFileToTempPath(unencryptedFile, "plain.txt");
    res.cleanup();
  });
});

// ─── Storage Configuration & Resolution Benchmarks ───────────────────────────

describe("Storage Resolution & Factory", () => {
  bench("resolveDataDir with custom data dir", () => {
    resolveDataDir("/var/songbird/data");
  });

  bench("resolveDataDir fallback to project data dir", () => {
    resolveDataDir();
  });

  bench("createStorage (local driver)", () => {
    createStorage({ driver: "local", dataDir: tempBenchDir });
  });

  bench("createStorage (remote S3 driver)", () => {
    createStorage({
      driver: "s3",
      endpoint: "https://s3.example.com",
      region: "us-east-1",
      bucket: "songbird-media",
      accessKeyId: "AKIATEST1234",
      secretAccessKey: "SECRETKEY1234",
    });
  });
});
