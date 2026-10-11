import { describe, it, expect } from "vitest";
import {
  probeVideoDetails,
  probeVideoMetadata,
  transcodeVideo,
  faststartVideo,
  generateThumbnail,
} from "../ffmpeg.js";

describe("worker ffmpeg & ffprobe utilities", () => {
  it("exports all required video processing functions", () => {
    expect(typeof probeVideoDetails).toBe("function");
    expect(typeof probeVideoMetadata).toBe("function");
    expect(typeof transcodeVideo).toBe("function");
    expect(typeof faststartVideo).toBe("function");
    expect(typeof generateThumbnail).toBe("function");
  });

  it("handles probe errors gracefully when file does not exist", async () => {
    const details = await probeVideoDetails("/tmp/non-existent-video-file.mp4");
    expect(details).toEqual({
      needsTranscode: true,
      videoCodec: null,
      audioCodec: null,
      pixFmt: null,
      formatName: null,
      widthPx: null,
      heightPx: null,
      durationSeconds: null,
    });
  });

  it("handles metadata probe errors gracefully when file does not exist", async () => {
    const meta = await probeVideoMetadata("/tmp/non-existent-video-file.mp4");
    expect(meta).toEqual({
      widthPx: null,
      heightPx: null,
      durationSeconds: null,
    });
  });
});
