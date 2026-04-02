import { memo, useEffect, useMemo, useRef, useState } from "react";
import { Download, File, Pause, Play } from "../../icons/lucide.js";

const VOICE_WAVEFORM_CACHE_KEY = "voice-waveform-cache-v1";
const VOICE_WAVEFORM_CACHE_MAX = 160;
const VOICE_WAVEFORM_CACHE = new Map();
const VOICE_WAVEFORM_PROMISES = new Map();
const VOICE_AUDIO_POOL = new Map();
const VOICE_WAVEFORM_BARS_PER_SECOND = 3;
const VOICE_WAVEFORM_MAX_BARS = 36;

const readWaveformCache = () => {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(VOICE_WAVEFORM_CACHE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.v !== 1 || !Array.isArray(parsed.entries)) return;
    parsed.entries.forEach(([key, peaks]) => {
      if (!key || !Array.isArray(peaks)) return;
      VOICE_WAVEFORM_CACHE.set(key, peaks);
    });
  } catch {
    // ignore
  }
};

const persistWaveformCache = () => {
  if (typeof window === "undefined") return;
  try {
    const entries = Array.from(VOICE_WAVEFORM_CACHE.entries()).slice(-VOICE_WAVEFORM_CACHE_MAX);
    window.localStorage.setItem(
      VOICE_WAVEFORM_CACHE_KEY,
      JSON.stringify({ v: 1, entries }),
    );
  } catch {
    // ignore
  }
};

readWaveformCache();

const formatSeconds = (value) => {
  const totalSeconds = Math.max(0, Number(value || 0));
  if (!Number.isFinite(totalSeconds)) return "0:00";
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
};

const buildFallbackWaveform = (seed, count = 20) => {
  const seedValue = Array.from(String(seed || "audio"))
    .reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return Array.from({ length: count }, (_, idx) => {
    const wave = Math.sin((idx + 1) * 0.55 + seedValue * 0.02);
    const jitter = (seedValue % 7) * 0.02;
    const normalized = Math.min(1, Math.max(0.12, Math.abs(wave) + jitter));
    return normalized;
  });
};

const getWaveformPeaks = (buffer, count = 20) => {
  const channel = buffer.getChannelData(0);
  const blockSize = Math.floor(channel.length / count) || 1;
  const peaks = [];
  for (let i = 0; i < count; i += 1) {
    const start = i * blockSize;
    const end = Math.min(channel.length, start + blockSize);
    let sum = 0;
    for (let j = start; j < end; j += 1) {
      sum += Math.abs(channel[j]);
    }
    const avg = sum / Math.max(1, end - start);
    peaks.push(Math.min(1, Math.max(0.12, avg * 2.4)));
  }
  return peaks;
};

const loadAudioWaveform = async (audioUrl, cacheKey, countOverride) => {
  if (!audioUrl || typeof window === "undefined") return null;
  if (VOICE_WAVEFORM_CACHE.has(cacheKey)) {
    return VOICE_WAVEFORM_CACHE.get(cacheKey);
  }
  try {
    const response = await fetch(audioUrl);
    const arrayBuffer = await response.arrayBuffer();
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) return null;
    const context = new AudioContextCtor();
    const buffer = await context.decodeAudioData(arrayBuffer.slice(0));
    const peaks = getWaveformPeaks(buffer, countOverride || 20);
    VOICE_WAVEFORM_CACHE.set(cacheKey, peaks);
    if (typeof context.close === "function") {
      context.close();
    }
    return peaks;
  } catch (_) {
    return null;
  }
};

const VoiceMessageChip = memo(({ file }) => {
  const serverUrl =
    file?.url && !String(file.url).startsWith("blob:") ? String(file.url) : "";
  const audioUrl = serverUrl || String(file?._localUrl || file?.url || "");
  const audioRef = useRef(null);
  const stableSrcRef = useRef(audioUrl);
  const [stableSrc, setStableSrc] = useState(audioUrl);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [debugInfo, setDebugInfo] = useState(null);
  const cacheKeyRef = useRef(
    serverUrl ||
      file?._localId ||
      file?.id ||
      file?.storedName ||
      file?.originalName ||
      file?.name ||
      audioUrl ||
      (typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `voice-${Math.random().toString(36).slice(2)}`),
  );
  const fileDuration = Number.isFinite(Number(file?.durationSeconds))
    ? Number(file.durationSeconds)
    : 0;
  const fileDurationRef = useRef(fileDuration);
  const [duration, setDuration] = useState(fileDuration);
  const cacheKey = cacheKeyRef.current;
  const getTargetBars = (value) =>
    Math.max(
      12,
      Math.min(
        VOICE_WAVEFORM_MAX_BARS,
        Math.round((value || 3) * VOICE_WAVEFORM_BARS_PER_SECOND),
      ),
    );
  const [peaks, setPeaks] = useState(() => {
    const cached = VOICE_WAVEFORM_CACHE.get(cacheKey);
    return cached && cached.length
      ? cached
      : buildFallbackWaveform(cacheKey, getTargetBars(fileDuration || duration));
  });
  const pendingPeaksRef = useRef(null);
  const rafRef = useRef(0);
  const playStartRef = useRef(null);

  const ensureWaveform = () => {
    if (!serverUrl) return;
    if (VOICE_WAVEFORM_CACHE.has(cacheKey)) return;
    if (VOICE_WAVEFORM_PROMISES.has(cacheKey)) return;
    const targetBars = getTargetBars(duration);
    const promise = loadAudioWaveform(serverUrl, cacheKey, targetBars).then((loaded) => {
      VOICE_WAVEFORM_PROMISES.delete(cacheKey);
      if (!loaded?.length) return;
      VOICE_WAVEFORM_CACHE.set(cacheKey, loaded);
      persistWaveformCache();
      if (isPlaying) {
        pendingPeaksRef.current = loaded;
        return;
      }
      setPeaks(loaded);
    });
    VOICE_WAVEFORM_PROMISES.set(cacheKey, promise);
  };

  useEffect(() => {
    const cached = VOICE_WAVEFORM_CACHE.get(cacheKey);
    if (cached && cached.length) {
      setPeaks(cached);
      return;
    }
    setPeaks(buildFallbackWaveform(cacheKey, getTargetBars(fileDuration || duration)));
    if (serverUrl) {
      ensureWaveform();
    }
  }, [cacheKey, serverUrl]);

  useEffect(() => {
    if (!audioUrl) return;
    if (audioUrl === stableSrcRef.current) return;
    if (isPlaying) return;
    stableSrcRef.current = audioUrl;
    setStableSrc(audioUrl);
  }, [audioUrl, isPlaying]);

  const getOrCreateAudio = () => {
    const currentSrc = stableSrcRef.current || stableSrc;
    if (!currentSrc) return null;
    const existing = VOICE_AUDIO_POOL.get(cacheKey);
    if (existing) {
      if (existing.src !== currentSrc) {
        try {
          existing.pause();
          existing.currentTime = 0;
          existing.src = currentSrc;
          existing.preload = "none";
        } catch (_) {
          // ignore cleanup errors
        }
      }
      audioRef.current = existing;
      return existing;
    }
    const nextAudio = new Audio(currentSrc);
    nextAudio.preload = "none";
    VOICE_AUDIO_POOL.set(cacheKey, nextAudio);
    audioRef.current = nextAudio;
    return nextAudio;
  };

  useEffect(() => {
    fileDurationRef.current = fileDuration;
    if (!Number.isFinite(duration) || duration <= 0) {
      if (fileDuration > 0) {
        setDuration(fileDuration);
      }
    }
  }, [fileDuration]);

  const getEffectiveTotal = (audio) => {
    if (!audio) return fileDurationRef.current || 0;
    const total = Number(audio.duration || 0);
    if (Number.isFinite(total) && total > 0 && total < 1000000) return total;
    return fileDurationRef.current || 0;
  };

  const getCurrentTimeEstimate = (audio) => {
    if (!audio) return 0;
    const base = Number(audio.currentTime || 0);
    const total = getEffectiveTotal(audio);
    if (!total) return base;
    const durationVal = Number(audio.duration || 0);
    if (Number.isFinite(durationVal) && durationVal > 0 && durationVal < 1000000) {
      return base;
    }
    if (typeof performance !== "undefined" && playStartRef.current !== null) {
      const elapsed = (performance.now() - playStartRef.current) / 1000;
      return Math.max(base, elapsed);
    }
    return base;
  };

  const startProgressLoop = (audio) => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
    }
    const tick = () => {
      if (!audio) return;
      const total = getEffectiveTotal(audio);
      if (total > 0) {
        const currentTime = getCurrentTimeEstimate(audio);
        setProgress(Math.min(1, Math.max(0, currentTime / total)));
      }
      if (typeof window !== "undefined" && window.localStorage?.getItem("sb-debug-voice") === "1") {
        setDebugInfo({
          ct: Number(getCurrentTimeEstimate(audio) || 0),
          dur: Number(audio.duration || 0),
          rs: Number(audio.readyState || 0),
          paused: audio.paused,
        });
      }
      if (!audio.paused) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
  };

  const stopProgressLoop = () => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
  };

  useEffect(() => {
    const audio = getOrCreateAudio();
    if (!audio) return () => {};
    const isCurrentAudio = () => audioRef.current === audio;
    const handleTime = () => {
      if (!isCurrentAudio()) return;
      const total = getEffectiveTotal(audio);
      if (!Number.isFinite(total) || total <= 0) {
        setProgress(0);
        return;
      }
      const currentTime = getCurrentTimeEstimate(audio);
      setProgress(Math.min(1, Math.max(0, currentTime / total)));
    };
    const applyPendingPeaks = () => {
      if (pendingPeaksRef.current?.length) {
        setPeaks(pendingPeaksRef.current);
        pendingPeaksRef.current = null;
      }
    };
    const handleEnded = () => {
      if (!isCurrentAudio()) return;
      const total = getEffectiveTotal(audio);
      const currentTime = getCurrentTimeEstimate(audio);
      if (total > 0 && currentTime + 0.05 < total) {
        return;
      }
      setIsPlaying(false);
      setProgress(1);
      stopProgressLoop();
      applyPendingPeaks();
    };
    const handlePlay = () => {
      if (!isCurrentAudio()) return;
      playStartRef.current =
        typeof performance !== "undefined"
          ? performance.now() - Number(audio.currentTime || 0) * 1000
          : null;
      setIsPlaying(true);
      startProgressLoop(audio);
    };
    const handlePlaying = () => {
      if (!isCurrentAudio()) return;
      playStartRef.current =
        typeof performance !== "undefined"
          ? performance.now() - Number(audio.currentTime || 0) * 1000
          : null;
      setIsPlaying(true);
      startProgressLoop(audio);
    };
    const handlePause = () => {
      if (!isCurrentAudio()) return;
      playStartRef.current = null;
      setIsPlaying(false);
      stopProgressLoop();
      applyPendingPeaks();
    };
    const handleLoaded = () => {
      if (!isCurrentAudio()) return;
      const total = Number(audio.duration || 0);
      const effectiveTotal =
        Number.isFinite(total) && total > 0 && total < 1000000
          ? total
          : fileDurationRef.current || 0;
      if (effectiveTotal > 0) {
        setDuration(effectiveTotal);
          const targetBars = getTargetBars(effectiveTotal);
        if (!VOICE_WAVEFORM_CACHE.has(cacheKey) && serverUrl) {
          if (!VOICE_WAVEFORM_PROMISES.has(cacheKey)) {
            const promise = loadAudioWaveform(serverUrl, cacheKey, targetBars).then((loaded) => {
              VOICE_WAVEFORM_PROMISES.delete(cacheKey);
              if (!loaded?.length) return;
              VOICE_WAVEFORM_CACHE.set(cacheKey, loaded);
              persistWaveformCache();
              if (isPlaying) {
                pendingPeaksRef.current = loaded;
                return;
              }
              setPeaks(loaded);
            });
            VOICE_WAVEFORM_PROMISES.set(cacheKey, promise);
          }
        }
      }
    };
    audio.addEventListener("timeupdate", handleTime);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("play", handlePlay);
    audio.addEventListener("playing", handlePlaying);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("loadedmetadata", handleLoaded);
    return () => {
      audio.removeEventListener("timeupdate", handleTime);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("playing", handlePlaying);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("loadedmetadata", handleLoaded);
      stopProgressLoop();
    };
  }, [cacheKey, stableSrc]);

  const togglePlay = () => {
    const audio = getOrCreateAudio();
    if (!audio || !serverUrl) return;
    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      audio.preload = "auto";
      setIsPlaying(true);
      startProgressLoop(audio);
      audio.play().catch(() => {
        setIsPlaying(false);
        stopProgressLoop();
      });
    }
  };

  const playedBars = useMemo(() => {
    if (!peaks.length) return 0;
    return Math.max(0, Math.floor(progress * peaks.length));
  }, [peaks.length, progress]);

  const canPlay = Boolean(serverUrl);
  const waveformMaxHeight = 32;
  return (
    <div className="inline-flex w-max max-w-full items-center gap-2 rounded-xl border border-emerald-200/70 bg-white px-3 py-2 text-xs text-slate-900 transition hover:border-emerald-300 hover:bg-white/90 hover:shadow-[0_0_16px_rgba(16,185,129,0.18)] dark:border-emerald-500/30 dark:bg-slate-900/50 dark:text-slate-200 dark:hover:bg-slate-900/70 dark:hover:shadow-[0_0_16px_rgba(16,185,129,0.14)]">
      <button
        type="button"
        onClick={togglePlay}
        disabled={!canPlay}
        className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-emerald-200 bg-emerald-100 text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-200/70 disabled:cursor-not-allowed disabled:opacity-60 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200"
        aria-label={isPlaying ? "Pause voice message" : "Play voice message"}
      >
        {isPlaying ? <Pause size={14} /> : <Play size={14} className="translate-x-[1px]" />}
      </button>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center gap-[4px]" style={{ height: `${waveformMaxHeight}px` }}>
            {peaks.map((height, idx) => {
            const barHeight = Math.round(6 + height * (waveformMaxHeight - 6));
            const isPlayed = idx < playedBars;
            return (
                <span
                key={`wave-${cacheKey}-${idx}`}
                className={`w-[4px] rounded-full transition-colors duration-150 ${isPlayed ? "bg-emerald-600" : "bg-emerald-200/90 dark:bg-emerald-500/30"}`}
                style={{ height: `${barHeight}px` }}
              />
            );
          })}
        </div>
        <span className="text-[10px] text-slate-900/80 dark:text-emerald-200/80">
          {canPlay
            ? isPlaying
              ? `${formatSeconds((progress || 0) * (duration || file?.durationSeconds || 0))} / ${formatSeconds(duration || file?.durationSeconds || 0)}`
              : formatSeconds(duration || file?.durationSeconds || 0)
            : "Processing..."}
        </span>
        {debugInfo ? (
          <span className="text-[9px] text-slate-500">
            {`ct:${debugInfo.ct.toFixed(2)} dur:${debugInfo.dur.toFixed(2)} rs:${debugInfo.rs} paused:${debugInfo.paused ? "1" : "0"}`}
          </span>
        ) : null}
      </div>
    </div>
  );
}, (prev, next) => {
  const prevFile = prev.file || {};
  const nextFile = next.file || {};
  return (
    prevFile._localId === nextFile._localId &&
    prevFile.id === nextFile.id &&
    prevFile.url === nextFile.url &&
    prevFile._localUrl === nextFile._localUrl &&
    prevFile.mimeType === nextFile.mimeType &&
    prevFile.name === nextFile.name &&
    prevFile.durationSeconds === nextFile.durationSeconds &&
    prevFile.sizeBytes === nextFile.sizeBytes
  );
});

export function MessageFiles({
  files = [],
  isDesktop,
  docFullWidth = false,
  loadedMediaThumbs,
  setLoadedMediaThumbs,
  mediaAspectByKey,
  setMediaAspectByKey,
  videoPosterByUrl,
  setVideoPosterByUrl,
  videoPosterCacheKey,
  mediaThumbCacheKey,
  mediaCacheVersion = 1,
  openFocusMedia,
  onMessageMediaLoaded,
  handleVideoThumbLoadedMetadata,
  getFileRenderType,
}) {
  if (!files.length) return null;
  const resolveFileRenderType = getFileRenderType || (() => "document");

  const writeMediaCache = (key, payload) => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(key, JSON.stringify(payload));
    } catch (_) {
      // ignore storage failures
    }
  };

  const getMediaAspectRatio = (file) => {
    const key = file?.id || `${file?.name || ""}-${file?.sizeBytes || 0}`;
    const cached = Number(mediaAspectByKey[key]);
    if (Number.isFinite(cached) && cached > 0) {
      return Math.min(2.4, Math.max(0.42, cached));
    }
    const width = Number(file?.width);
    const height = Number(file?.height);
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      const renderType = getFileRenderType(file);
      // Stable fallback boxes on mobile to avoid layout shifts while media metadata loads.
      return renderType === "video" ? 16 / 9 : 1;
    }
    const ratio = width / height;
    // Clamp extreme values to keep bubble layout usable.
    return Math.min(2.4, Math.max(0.42, ratio));
  };

  const cacheMediaAspectRatio = (file, width, height) => {
    const w = Number(width);
    const h = Number(height);
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return;
    const ratio = Math.min(2.4, Math.max(0.42, w / h));
    const key = file?.id || `${file?.name || ""}-${file?.sizeBytes || 0}`;
    setMediaAspectByKey((prev) => {
      if (prev[key] === ratio) return prev;
      return { ...prev, [key]: ratio };
    });
  };

  const formatFileSize = (sizeBytes) => {
    const bytes = Number(sizeBytes || 0);
    if (!Number.isFinite(bytes) || bytes <= 0) return "";
    const kb = 1024;
    const mb = kb * 1024;
    const gb = mb * 1024;
    if (bytes >= gb) return `${(bytes / gb).toFixed(2)} GB`;
    if (bytes >= mb) return `${(bytes / mb).toFixed(2)} MB`;
    return `${Math.max(1, Math.round(bytes / kb))} KB`;
  };

  const getFileNameParts = (name, maxBaseChars = 14) => {
    const fullName = String(name || "document");
    const lastDot = fullName.lastIndexOf(".");
    if (lastDot <= 0 || lastDot === fullName.length - 1) {
      const base = fullName.length > maxBaseChars + 3
        ? `${fullName.slice(0, maxBaseChars)}...`
        : fullName;
      return { base, ext: "" };
    }
    const baseRaw = fullName.slice(0, lastDot);
    const extRaw = fullName.slice(lastDot + 1);
    const base =
      baseRaw.length > maxBaseChars
        ? `${baseRaw.slice(0, maxBaseChars)}...`
        : baseRaw;
    return { base, ext: `.${extRaw}` };
  };

  const cacheVideoPoster = (videoUrl, videoEl) => {
    if (!videoUrl || !videoEl || videoPosterByUrl[videoUrl]) return;
    try {
      if (Number(videoEl.readyState || 0) < 2) return;
      const sourceWidth = Number(videoEl.videoWidth || 0);
      const sourceHeight = Number(videoEl.videoHeight || 0);
      if (sourceWidth <= 0 || sourceHeight <= 0) return;
      const maxWidth = 320;
      const scale = Math.min(1, maxWidth / sourceWidth);
      const targetWidth = Math.max(1, Math.round(sourceWidth * scale));
      const targetHeight = Math.max(1, Math.round(sourceHeight * scale));
      const canvas = document.createElement("canvas");
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(videoEl, 0, 0, targetWidth, targetHeight);
      const posterDataUrl = canvas.toDataURL("image/jpeg", 0.62);
      setVideoPosterByUrl((prev) => {
        if (prev[videoUrl]) return prev;
        const next = { ...prev, [videoUrl]: posterDataUrl };
        if (typeof window !== "undefined") {
          try {
            const compact = Object.fromEntries(Object.entries(next).slice(-80));
            writeMediaCache(videoPosterCacheKey, {
              version: mediaCacheVersion,
              updatedAt: Date.now(),
              posters: compact,
            });
            return compact;
          } catch (_) {
            return prev;
          }
        }
        return next;
      });
    } catch (_) {
      // no-op
    }
  };

  const markMediaThumbLoaded = (thumbKey) => {
    setLoadedMediaThumbs((prev) => {
      if (prev.has(thumbKey)) return prev;
        const next = new Set(prev);
        next.add(thumbKey);
        if (typeof window !== "undefined") {
          try {
            const persisted = Array.from(next);
            writeMediaCache(mediaThumbCacheKey, {
              version: mediaCacheVersion,
              updatedAt: Date.now(),
              items: persisted.slice(-250),
            });
          } catch (_) {
            // ignore cache failures
          }
        }
        return next;
    });
    onMessageMediaLoaded?.();
  };

  const handleVideoThumbReady = (event, thumbKey, videoUrl) => {
    const video = event.currentTarget;
    if (!video) return;
    cacheVideoPoster(videoUrl, video);
    // Mobile Safari sometimes paints first frame only after a decode/play step.
    if (!isDesktop) {
      const playPromise = video.play?.();
      if (playPromise && typeof playPromise.then === "function") {
        playPromise
          .then(() => {
            const duration = Number(video.duration || 0);
            if (Number.isFinite(duration) && duration > 0) {
              const target = Math.min(0.16, Math.max(duration * 0.02, 0.02));
              if (video.currentTime < target) {
                try {
                  video.currentTime = target;
                } catch (_) {
                  // no-op
                }
              }
            }
            video.pause?.();
            cacheVideoPoster(videoUrl, video);
            markMediaThumbLoaded(thumbKey);
          })
          .catch(() => {
            // Even when autoplay is blocked, try to finalize poster from current decoded frame.
            cacheVideoPoster(videoUrl, video);
            markMediaThumbLoaded(thumbKey);
          });
        return;
      }
    }
    markMediaThumbLoaded(thumbKey);
  };

  const hasMediaFiles = files.some((file) => {
    const type = resolveFileRenderType(file);
    return type === "image" || type === "video";
  });
  const containerClass = hasMediaFiles
    ? "mt-1 flex w-full max-w-full flex-col gap-2"
    : "mt-1 inline-grid w-max max-w-full grid-cols-1 gap-2 justify-items-stretch";


  return (
    <div className={containerClass}>
      {files.map((file, fileIndex) => {
        const renderType = resolveFileRenderType(file);
        const isImage = renderType === "image";
        const isVideo = renderType === "video";
        const isAudio = renderType === "audio";
        const videoUrl = String(file?.url || "");
        const isTranscodedOutput = videoUrl.includes("-h264-");
        const isProcessingVideo = isVideo && file?.processing === true && !isTranscodedOutput;
        const stableId = file._localId || file.id || "";
        const key = stableId || `${file.name}-${file.sizeBytes || 0}`;
        const mediaDownloadName =
          file?.name ||
          file?.originalName ||
          file?.original_name ||
          file?.storedName ||
          file?.stored_name ||
          (file?.url ? String(file.url).split("?")[0].split("/").pop() : "") ||
          "media";
        const thumbKey = `thumb-${key}`;
        const cachedPoster = isVideo && file.url ? videoPosterByUrl[file.url] : "";
        const thumbLoaded = loadedMediaThumbs.has(thumbKey) || Boolean(cachedPoster);
        const mediaAspectRatio = getMediaAspectRatio(file);
        const mediaFrameStyle = mediaAspectRatio
          ? { aspectRatio: `${mediaAspectRatio}` }
          : { minHeight: isDesktop ? "190px" : "160px" };
        const imageFrameClass = "relative flex w-full items-center justify-center overflow-hidden";
        const imageClass = isDesktop
          ? `absolute inset-0 block h-full w-full object-cover transition-opacity duration-150 ${
              thumbLoaded ? "opacity-100" : "opacity-0"
            }`
          : "absolute inset-0 block h-full w-full object-cover";
        const videoFrameClass = "relative flex w-full items-center justify-center overflow-hidden";
        const videoClass = isDesktop
          ? `absolute inset-0 block h-full w-full object-cover transition-opacity duration-150 ${
              thumbLoaded ? "opacity-100" : "opacity-0"
            }`
          : "absolute inset-0 block h-full w-full object-cover";

        if (isAudio) {
          return <VoiceMessageChip key={key} file={file} />;
        }

        if (isImage && file.url) {
          return (
            <button
              type="button"
              key={key}
              onClick={() =>
                openFocusMedia({
                  url: file.url,
                  downloadUrl: `${file.url}${file.url.includes("?") ? "&" : "?"}download=1`,
                  name: mediaDownloadName,
                  type: "image",
                  width: file.width,
                  height: file.height,
                  expiresAt: file.expiresAt || null,
                })
              }
              className="relative block w-full overflow-hidden rounded-xl border border-emerald-200/70 bg-white/70 dark:border-emerald-500/30 dark:bg-slate-900/50"
            >
              <div className={imageFrameClass} style={mediaFrameStyle}>
                <img
                  src={file.url}
                  alt={file.name || "image"}
                  onLoad={(event) => {
                    cacheMediaAspectRatio(
                      file,
                      event.currentTarget?.naturalWidth,
                      event.currentTarget?.naturalHeight,
                    );
                    markMediaThumbLoaded(thumbKey);
                  }}
                  loading={isDesktop ? "lazy" : "eager"}
                  decoding={isDesktop ? "async" : "sync"}
                  fetchPriority={!isDesktop && fileIndex === 0 ? "high" : "auto"}
                  className={imageClass}
                />
                {isDesktop && !thumbLoaded ? (
                  <div className="pointer-events-none absolute inset-0 animate-pulse bg-emerald-100/70 dark:bg-slate-800/80" />
                ) : null}
                {!mediaAspectRatio ? (
                  <div
                    className="pointer-events-none w-full animate-pulse bg-emerald-100/70 dark:bg-slate-800/80"
                    style={{ height: "180px" }}
                  />
                ) : null}
              </div>
            </button>
          );
        }

        if (isProcessingVideo) {
          return (
            <div
              key={key}
              className="relative block w-full overflow-hidden rounded-xl border border-emerald-200/70 bg-slate-200/70 dark:border-emerald-500/30 dark:bg-slate-800/70"
            >
              <div className={videoFrameClass} style={mediaFrameStyle}>
                <div className="absolute inset-0 animate-pulse bg-slate-200/80 dark:bg-slate-800/80" />
              </div>
            </div>
          );
        }

        if (isVideo && file.url) {
          return (
            <button
              type="button"
              key={key}
              onClick={() =>
                openFocusMedia({
                  url: file.url,
                  downloadUrl: `${file.url}${file.url.includes("?") ? "&" : "?"}download=1`,
                  name: mediaDownloadName,
                  type: "video",
                  processing: Boolean(file.processing),
                  width: file.width,
                  height: file.height,
                  expiresAt: file.expiresAt || null,
                })
              }
              className="relative block w-full overflow-hidden rounded-xl border border-emerald-200/70 bg-black/60 dark:border-emerald-500/30"
              aria-label={`Open video ${file.name || ""}`.trim()}
            >
              <div className={videoFrameClass} style={mediaFrameStyle}>
                {cachedPoster ? (
                  <img
                    src={cachedPoster}
                    alt={file.name || "video thumbnail"}
                    onLoad={() => markMediaThumbLoaded(thumbKey)}
                    className={videoClass}
                  />
                ) : (
                  <video
                    key={file.url}
                    autoPlay={!isDesktop}
                    loop={!isDesktop}
                    muted
                    playsInline
                    preload={isDesktop ? "auto" : "auto"}
                    poster={videoPosterByUrl[file.url] || undefined}
                    onLoadedMetadata={(event) => {
                      cacheMediaAspectRatio(
                        file,
                        event.currentTarget?.videoWidth,
                        event.currentTarget?.videoHeight,
                      );
                      handleVideoThumbLoadedMetadata(event);
                      if (!isDesktop) {
                        markMediaThumbLoaded(thumbKey);
                      }
                    }}
                    onCanPlay={(event) => handleVideoThumbReady(event, thumbKey, file.url)}
                    onLoadedData={(event) => handleVideoThumbReady(event, thumbKey, file.url)}
                    onError={() => {
                      if (!isDesktop) {
                        markMediaThumbLoaded(thumbKey);
                      }
                    }}
                    src={file.url}
                    className={videoClass}
                  />
                )}
                {!thumbLoaded && isDesktop ? (
                  <div className="pointer-events-none absolute inset-0 animate-pulse bg-slate-200/80 dark:bg-slate-800/80" />
                ) : null}
                {!mediaAspectRatio ? (
                  <div
                    className="pointer-events-none w-full animate-pulse bg-slate-200/80 dark:bg-slate-800/80"
                    style={{ height: "180px" }}
                  />
                ) : null}
              </div>
              <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/40 bg-black/45 text-white">
                  <Play size={18} className="translate-x-[1px]" />
                </span>
              </span>
            </button>
          );
        }

        const docChipClass = isDesktop
          ? "inline-flex w-full min-w-0 max-w-full overflow-hidden"
          : "inline-flex w-full min-w-0 max-w-full overflow-hidden";

        return file.url ? (
          <a
            key={key}
            href={file.url}
            download={file.name || undefined}
            rel="noopener noreferrer"
            className={`group ${docChipClass} items-center gap-2 rounded-xl border border-emerald-200/70 bg-white/70 px-3 py-2.5 text-xs text-slate-700 transition hover:border-emerald-300 hover:bg-white hover:shadow-[0_0_16px_rgba(16,185,129,0.18)] dark:border-emerald-500/30 dark:bg-slate-900/50 dark:text-slate-200 dark:hover:bg-slate-900/70 dark:hover:shadow-[0_0_16px_rgba(16,185,129,0.14)]`}
          >
            <span className="relative inline-flex h-5 w-5 shrink-0 items-center justify-center">
              <File size={18} className="absolute text-emerald-600 transition-opacity duration-150 group-hover:opacity-0 dark:text-emerald-300" />
              <Download size={18} className="absolute text-emerald-600 opacity-0 transition-opacity duration-150 group-hover:opacity-100 dark:text-emerald-300" />
            </span>
            <span className="min-w-0 flex-1">
              {(() => {
                const { base, ext } = getFileNameParts(file.name || "document");
                return (
                  <span className="flex min-w-0 items-center" dir="auto">
                    <span className="min-w-0 truncate whitespace-nowrap">{base}</span>
                    {ext ? <span className="shrink-0">{ext}</span> : null}
                  </span>
                );
              })()}
              <span className="mt-0.5 block text-[10px] text-slate-500 dark:text-slate-400">
                {formatFileSize(file.sizeBytes)}
              </span>
            </span>
          </a>
        ) : (
          <div
            key={key}
            className={`${docChipClass} items-center gap-2 rounded-xl border border-emerald-200/70 bg-white/70 px-3 py-2.5 text-xs text-slate-700 dark:border-emerald-500/30 dark:bg-slate-900/50 dark:text-slate-200`}
          >
            <File size={18} className="shrink-0 text-emerald-600 dark:text-emerald-300" />
            <span className="min-w-0 flex-1">
              {(() => {
                const { base, ext } = getFileNameParts(file.name || "document");
                return (
                  <span className="flex min-w-0 items-center" dir="auto">
                    <span className="min-w-0 truncate whitespace-nowrap">{base}</span>
                    {ext ? <span className="shrink-0">{ext}</span> : null}
                  </span>
                );
              })()}
              <span className="mt-0.5 block text-[10px] text-slate-500 dark:text-slate-400">
                {formatFileSize(file.sizeBytes)}
              </span>
            </span>
          </div>
        );
      })}
    </div>
  );
}
