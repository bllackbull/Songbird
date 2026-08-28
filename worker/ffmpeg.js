import { spawn } from "node:child_process";

const runBin = (bin, args = []) =>
  new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk || "");
      if (stderr.length > 16000) stderr = stderr.slice(-16000);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) return resolve();
      reject(
        new Error(
          `${bin} failed: ${stderr.trim() || `exit code ${String(code)}`}`,
        ),
      );
    });
  });

export const transcodeVideo = ({ inputPath, outputPath }) =>
  runBin("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    inputPath,
    "-c:v",
    "libx264",
    "-preset",
    "ultrafast",
    "-crf",
    "23",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-movflags",
    "+faststart",
    outputPath,
  ]);

export const probeVideoMetadata = async (filePath) => {
  try {
    const output = await new Promise((resolve, reject) => {
      const child = spawn(
        "ffprobe",
        [
          "-v",
          "error",
          "-select_streams",
          "v:0",
          "-show_entries",
          "stream=width,height,duration:format=duration",
          "-of",
          "json",
          filePath,
        ],
        { stdio: ["ignore", "pipe", "pipe"] },
      );
      let stdout = "";
      child.stdout.on("data", (c) => (stdout += String(c || "")));
      child.on("error", reject);
      child.on("close", (code) =>
        code === 0 ? resolve(stdout) : reject(new Error(`exit ${code}`)),
      );
    });
    const parsed = JSON.parse(String(output || "{}"));
    const stream = Array.isArray(parsed?.streams)
      ? parsed.streams[0] || {}
      : {};
    const sanitizeInt = (v) => {
      const n = Number(v);
      return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
    };
    const sanitizeDuration = (v) => {
      const n = Number(v);
      return Number.isFinite(n) && n >= 0 ? Math.round(n * 1000) / 1000 : null;
    };
    return {
      widthPx: sanitizeInt(stream?.width),
      heightPx: sanitizeInt(stream?.height),
      durationSeconds: sanitizeDuration(
        stream?.duration ?? parsed?.format?.duration,
      ),
    };
  } catch {
    return { widthPx: null, heightPx: null, durationSeconds: null };
  }
};

export const generateThumbnail = ({ inputPath, outputPath }) =>
  runBin("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    inputPath,
    "-vf",
    "thumbnail=30,scale=480:-2",
    "-frames:v",
    "1",
    "-update",
    "1",
    outputPath,
  ]);
