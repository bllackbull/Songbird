import { describe, it, expect } from "vitest";
import {
  parseWaveformSamples,
  extractMediaPreprocessMetadata,
  extractAudioWaveform,
} from "../../src/utils/mediaPreprocess.js";

describe("mediaPreprocess", () => {
  describe("parseWaveformSamples", () => {
    it("returns default length array with 0.05 when pcmData is empty or invalid", () => {
      const resultEmpty = parseWaveformSamples([]);
      expect(resultEmpty).toHaveLength(50);
      expect(resultEmpty.every((v) => v === 0.05)).toBe(true);

      const resultNull = parseWaveformSamples(null, 30);
      expect(resultNull).toHaveLength(30);
      expect(resultNull.every((v) => v === 0.05)).toBe(true);
    });

    it("correctly buckets and normalizes Float32Array pcmData", () => {
      const pcmData = new Float32Array(100);
      for (let i = 0; i < 100; i++) {
        pcmData[i] = i === 50 ? 1.0 : 0.0;
      }

      const waveform = parseWaveformSamples(pcmData, 10);
      expect(waveform).toHaveLength(10);
      waveform.forEach((val) => {
        expect(val).toBeGreaterThanOrEqual(0.05);
        expect(val).toBeLessThanOrEqual(1.0);
      });
      expect(waveform[5]).toBe(1.0);
      expect(waveform[0]).toBe(0.05);
    });

    it("handles uniform non-zero PCM data without division by zero", () => {
      const pcmData = new Float32Array(50).fill(0.5);
      const waveform = parseWaveformSamples(pcmData, 20);

      expect(waveform).toHaveLength(20);
      waveform.forEach((val) => {
        expect(val).toBeGreaterThanOrEqual(0.05);
        expect(val).toBeLessThanOrEqual(1.0);
      });
    });
  });

  describe("extractMediaPreprocessMetadata", () => {
    it("returns empty object for invalid or unsupported file types", async () => {
      expect(await extractMediaPreprocessMetadata(null)).toEqual({});
      expect(
        await extractMediaPreprocessMetadata({ type: "application/pdf" }),
      ).toEqual({});
      expect(
        await extractMediaPreprocessMetadata({ type: "text/plain" }),
      ).toEqual({});
    });

    it("returns audio duration and waveform fallback when AudioContext is unavailable or fails", async () => {
      const file = { type: "audio/mp3", name: "test.mp3" };
      const meta = await extractMediaPreprocessMetadata(file);

      expect(meta).toHaveProperty("duration");
      expect(meta).toHaveProperty("waveform");
      expect(meta.waveform).toHaveLength(50);
      expect(Array.isArray(meta.waveform)).toBe(true);
      meta.waveform.forEach((sample) => {
        expect(sample).toBeGreaterThanOrEqual(0.05);
        expect(sample).toBeLessThanOrEqual(1.0);
      });
    });

    it("falls back gracefully for image and video in non-browser env", async () => {
      const imgFile = { type: "image/png", name: "test.png" };
      const imgMeta = await extractMediaPreprocessMetadata(imgFile);
      expect(imgMeta).toBeDefined();

      const videoFile = { type: "video/mp4", name: "test.mp4" };
      const videoMeta = await extractMediaPreprocessMetadata(videoFile);
      expect(videoMeta).toBeDefined();
    });
  });

  describe("extractAudioWaveform", () => {
    it("returns fallback waveform when decoding fails or AudioContext is absent", async () => {
      const file = {
        type: "audio/wav",
        arrayBuffer: async () => new ArrayBuffer(0),
      };
      const result = await extractAudioWaveform(file, 40);

      expect(result).toEqual({
        duration: 0,
        waveform: expect.any(Array),
      });
      expect(result.waveform).toHaveLength(40);
      expect(result.waveform.every((v) => v === 0.05)).toBe(true);
    });
  });
});
