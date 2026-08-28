/**
 * Parses PCM audio samples and generates a normalized waveform array of `samplesCount` elements.
 *
 * @param {Float32Array | number[]} pcmData - Raw PCM audio sample values.
 * @param {number} [samplesCount=50] - Number of bucket samples for waveform rendering.
 * @returns {number[]} Array of normalized amplitude floats between 0.05 and 1.0.
 */
export function parseWaveformSamples(pcmData, samplesCount = 50) {
  const count = Math.max(1, Math.floor(samplesCount));
  const fallback = Array.from({ length: count }, () => 0.05);

  if (!pcmData || pcmData.length === 0) {
    return fallback;
  }

  const rawValues = new Array(count);
  const dataLen = pcmData.length;

  for (let i = 0; i < count; i++) {
    const start = Math.floor((i * dataLen) / count);
    let end = Math.floor(((i + 1) * dataLen) / count);
    if (end <= start) {
      end = Math.min(start + 1, dataLen);
    }

    let sumSq = 0;
    const bucketLen = end - start;
    for (let j = start; j < end; j++) {
      const val = pcmData[j] || 0;
      sumSq += val * val;
    }

    rawValues[i] = Math.sqrt(sumSq / bucketLen);
  }

  let maxVal = 0;
  for (let i = 0; i < count; i++) {
    if (rawValues[i] > maxVal) {
      maxVal = rawValues[i];
    }
  }

  if (maxVal === 0 || !Number.isFinite(maxVal)) {
    return fallback;
  }

  return rawValues.map((val) => {
    const normalized = 0.05 + (val / maxVal) * 0.95;
    return Number(Math.max(0.05, Math.min(1.0, normalized)).toFixed(4));
  });
}

/**
 * Asynchronously decodes audio file to extract duration and waveform samples.
 * Falls back gracefully to default waveform array if AudioContext is unavailable or fails.
 *
 * @param {File | Blob} file
 * @param {number} [samplesCount=50]
 * @returns {Promise<{ duration: number, waveform: number[] }>}
 */
export async function extractAudioWaveform(file, samplesCount = 50) {
  const count = Math.max(1, Math.floor(samplesCount));
  const fallback = {
    duration: 0,
    waveform: Array.from({ length: count }, () => 0.05),
  };

  if (!file) return fallback;

  try {
    const AudioCtx =
      typeof window !== "undefined" &&
      (window.AudioContext || window.webkitAudioContext);
    if (!AudioCtx) return fallback;

    const audioCtx = new AudioCtx();
    let arrayBuffer;
    if (typeof file.arrayBuffer === "function") {
      arrayBuffer = await file.arrayBuffer();
    } else {
      arrayBuffer = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
      });
    }

    const audioBuffer = await new Promise((resolve, reject) => {
      audioCtx.decodeAudioData(arrayBuffer, resolve, reject);
    });

    const pcmData = audioBuffer.getChannelData(0);
    const waveform = parseWaveformSamples(pcmData, count);
    const duration = Number(audioBuffer.duration || 0);

    if (typeof audioCtx.close === "function") {
      audioCtx.close().catch(() => {});
    }

    return { duration, waveform };
  } catch {
    return fallback;
  }
}

/**
 * Asynchronously extracts width, height, duration, and WebP thumbnail from video file.
 *
 * @param {File | Blob} file
 * @returns {Promise<{ width?: number, height?: number, duration?: number, thumbnail?: string }>}
 */
export async function extractVideoMetadataAndThumbnail(file) {
  if (
    !file ||
    typeof window === "undefined" ||
    typeof document === "undefined"
  ) {
    return {};
  }

  return new Promise((resolve) => {
    let objectUrl = null;
    try {
      objectUrl = URL.createObjectURL(file);
    } catch {
      return resolve({});
    }

    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "metadata";

    const cleanUp = () => {
      if (objectUrl) {
        try {
          URL.revokeObjectURL(objectUrl);
        } catch {}
      }
      video.removeAttribute("src");
      video.remove();
    };

    const onError = () => {
      cleanUp();
      resolve({});
    };

    video.onerror = onError;

    video.onloadedmetadata = () => {
      const duration = Number(video.duration || 0);
      const seekTime = duration > 1 ? 1.0 : duration > 0 ? duration / 2 : 0;
      video.currentTime = seekTime;
    };

    video.onseeked = () => {
      try {
        const width = video.videoWidth || 0;
        const height = video.videoHeight || 0;
        const duration = Number(video.duration || 0);

        if (!width || !height) {
          cleanUp();
          return resolve({ duration });
        }

        const maxDim = 320;
        let targetW = width;
        let targetH = height;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            targetW = maxDim;
            targetH = Math.round((height * maxDim) / width);
          } else {
            targetH = maxDim;
            targetW = Math.round((width * maxDim) / height);
          }
        }

        const canvas = document.createElement("canvas");
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(video, 0, 0, targetW, targetH);
        }

        let thumbnail = null;
        try {
          thumbnail = canvas.toDataURL("image/webp", 0.8);
        } catch {
          thumbnail = canvas.toDataURL("image/png");
        }

        cleanUp();
        resolve({ width, height, duration, thumbnail });
      } catch {
        cleanUp();
        resolve({});
      }
    };

    video.src = objectUrl;
  });
}

/**
 * Asynchronously extracts width, height, and WebP thumbnail from image file.
 *
 * @param {File | Blob} file
 * @returns {Promise<{ width?: number, height?: number, thumbnail?: string }>}
 */
export async function extractImageMetadataAndThumbnail(file) {
  if (
    !file ||
    typeof window === "undefined" ||
    typeof document === "undefined"
  ) {
    return {};
  }

  return new Promise((resolve) => {
    let objectUrl = null;
    try {
      objectUrl = URL.createObjectURL(file);
    } catch {
      return resolve({});
    }

    const img = new Image();

    const cleanUp = () => {
      if (objectUrl) {
        try {
          URL.revokeObjectURL(objectUrl);
        } catch {}
      }
    };

    img.onerror = () => {
      cleanUp();
      resolve({});
    };

    img.onload = () => {
      try {
        const width = img.naturalWidth || 0;
        const height = img.naturalHeight || 0;

        if (!width || !height) {
          cleanUp();
          return resolve({});
        }

        const maxDim = 320;
        let targetW = width;
        let targetH = height;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            targetW = maxDim;
            targetH = Math.round((height * maxDim) / width);
          } else {
            targetH = maxDim;
            targetW = Math.round((width * maxDim) / height);
          }
        }

        const canvas = document.createElement("canvas");
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, 0, 0, targetW, targetH);
        }

        let thumbnail = null;
        try {
          thumbnail = canvas.toDataURL("image/webp", 0.8);
        } catch {
          thumbnail = canvas.toDataURL("image/png");
        }

        cleanUp();
        resolve({ width, height, thumbnail });
      } catch {
        cleanUp();
        resolve({});
      }
    };

    img.src = objectUrl;
  });
}

/**
 * Facade function to extract preprocess metadata based on file type (image, video, audio).
 *
 * @param {File | Blob} file
 * @returns {Promise<Object>} Metadata object relevant to file type or empty object.
 */
export async function extractMediaPreprocessMetadata(file) {
  if (!file || !file.type || typeof file.type !== "string") {
    return {};
  }

  if (file.type.startsWith("image/")) {
    return extractImageMetadataAndThumbnail(file);
  }
  if (file.type.startsWith("video/")) {
    return extractVideoMetadataAndThumbnail(file);
  }
  if (file.type.startsWith("audio/")) {
    return extractAudioWaveform(file);
  }

  return {};
}
