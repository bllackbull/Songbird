import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  isLocalWorkerHealthy,
  ensureLocalWorkerRunning,
  resolveWorkerScriptPath,
  stopLocalWorker,
} from "../../lib/localWorkerManager.js";
import EventEmitter from "node:events";

describe("localWorkerManager", () => {
  afterEach(() => {
    stopLocalWorker();
    vi.restoreAllMocks();
  });

  describe("isLocalWorkerHealthy", () => {
    it("returns true when probe returns 200 with status ok", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ status: "ok", service: "songbird-media-worker" }),
      });

      const healthy = await isLocalWorkerHealthy(8080, mockFetch, 100);
      expect(healthy).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        "http://127.0.0.1:8080/health",
        expect.objectContaining({ method: "GET" }),
      );
    });

    it("returns false when probe fails or throws", async () => {
      const mockFetch = vi
        .fn()
        .mockRejectedValue(new Error("Connection refused"));
      const healthy = await isLocalWorkerHealthy(8080, mockFetch, 100);
      expect(healthy).toBe(false);
    });

    it("returns false when probe returns non-200 status", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        json: async () => ({}),
      });
      const healthy = await isLocalWorkerHealthy(8080, mockFetch, 100);
      expect(healthy).toBe(false);
    });
  });

  describe("ensureLocalWorkerRunning", () => {
    it("skips starting local worker when storageProcessingMode is 'remote'", async () => {
      const mockFetch = vi.fn();
      const mockSpawn = vi.fn();

      const result = await ensureLocalWorkerRunning({
        storageProcessingMode: "remote",
        fetchImpl: mockFetch,
        spawnImpl: mockSpawn,
      });

      expect(result.started).toBe(false);
      expect(result.reason).toBe("remote_mode");
      expect(mockFetch).not.toHaveBeenCalled();
      expect(mockSpawn).not.toHaveBeenCalled();
    });

    it("skips starting local worker when startLocalWorker is 'false'", async () => {
      const mockFetch = vi.fn();
      const mockSpawn = vi.fn();

      const result = await ensureLocalWorkerRunning({
        storageProcessingMode: "local",
        startLocalWorker: "false",
        fetchImpl: mockFetch,
        spawnImpl: mockSpawn,
      });

      expect(result.started).toBe(false);
      expect(result.reason).toBe("disabled_by_env");
      expect(mockFetch).not.toHaveBeenCalled();
      expect(mockSpawn).not.toHaveBeenCalled();
    });

    it("does not spawn new worker if local worker is already healthy", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ status: "ok", service: "songbird-media-worker" }),
      });
      const mockSpawn = vi.fn();

      const result = await ensureLocalWorkerRunning({
        storageProcessingMode: "auto",
        workerPort: 8080,
        fetchImpl: mockFetch,
        spawnImpl: mockSpawn,
      });

      expect(result.started).toBe(false);
      expect(result.alreadyRunning).toBe(true);
      expect(mockSpawn).not.toHaveBeenCalled();
    });

    it("auto-starts local worker when unhealthy and mode is 'auto'", async () => {
      const mockFetch = vi
        .fn()
        .mockRejectedValue(new Error("Connection refused"));
      const mockChild = new EventEmitter();
      mockChild.pid = 4321;
      mockChild.killed = false;
      mockChild.kill = vi.fn();

      const mockSpawn = vi.fn().mockReturnValue(mockChild);

      const result = await ensureLocalWorkerRunning({
        storageProcessingMode: "auto",
        workerPort: 8080,
        fetchImpl: mockFetch,
        spawnImpl: mockSpawn,
      });

      expect(result.started).toBe(true);
      expect(result.pid).toBe(4321);
      expect(mockSpawn).toHaveBeenCalledTimes(1);

      const [execPath, args, opts] = mockSpawn.mock.calls[0];
      expect(execPath).toBe(process.execPath);
      expect(args[0]).toContain("worker");
      expect(opts.env.WORKER_PORT).toBe("8080");
    });

    it("auto-starts local worker when unhealthy and mode is 'local'", async () => {
      const mockFetch = vi
        .fn()
        .mockRejectedValue(new Error("Connection refused"));
      const mockChild = new EventEmitter();
      mockChild.pid = 9876;
      mockChild.killed = false;
      mockChild.kill = vi.fn();

      const mockSpawn = vi.fn().mockReturnValue(mockChild);

      const result = await ensureLocalWorkerRunning({
        storageProcessingMode: "local",
        workerPort: 9090,
        fetchImpl: mockFetch,
        spawnImpl: mockSpawn,
      });

      expect(result.started).toBe(true);
      expect(result.pid).toBe(9876);
      expect(result.port).toBe(9090);
      expect(mockSpawn).toHaveBeenCalledTimes(1);
    });

    it("skips starting local worker and does not probe when transcodeVideos is false", async () => {
      const mockFetch = vi.fn();
      const mockSpawn = vi.fn();

      const result = await ensureLocalWorkerRunning({
        storageProcessingMode: "auto",
        transcodeVideos: false,
        fetchImpl: mockFetch,
        spawnImpl: mockSpawn,
      });

      expect(result.started).toBe(false);
      expect(result.reason).toBe("transcoding_disabled");
      expect(mockFetch).not.toHaveBeenCalled();
      expect(mockSpawn).not.toHaveBeenCalled();
    });

    it("skips starting local worker and does not probe when FILE_UPLOAD_TRANSCODE_VIDEOS env is false", async () => {
      const originalEnv = process.env.FILE_UPLOAD_TRANSCODE_VIDEOS;
      process.env.FILE_UPLOAD_TRANSCODE_VIDEOS = "false";
      try {
        const mockFetch = vi.fn();
        const mockSpawn = vi.fn();

        const result = await ensureLocalWorkerRunning({
          storageProcessingMode: "auto",
          fetchImpl: mockFetch,
          spawnImpl: mockSpawn,
        });

        expect(result.started).toBe(false);
        expect(result.reason).toBe("transcoding_disabled");
        expect(mockFetch).not.toHaveBeenCalled();
        expect(mockSpawn).not.toHaveBeenCalled();
      } finally {
        if (originalEnv !== undefined) {
          process.env.FILE_UPLOAD_TRANSCODE_VIDEOS = originalEnv;
        } else {
          delete process.env.FILE_UPLOAD_TRANSCODE_VIDEOS;
        }
      }
    });
  });
});
