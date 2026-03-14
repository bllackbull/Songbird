import { Download, File, Play } from "../../icons/lucide.js";

export function MessageFiles({
  files = [],
  isDesktop,
  loadedMediaThumbs,
  setLoadedMediaThumbs,
  mediaAspectByKey,
  setMediaAspectByKey,
  videoPosterByUrl,
  setVideoPosterByUrl,
  videoPosterCacheKey,
  openFocusMedia,
  onMessageMediaLoaded,
  handleVideoThumbLoadedMetadata,
  getFileRenderType,
}) {
  if (!files.length) return null;

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
            window.sessionStorage.setItem(videoPosterCacheKey, JSON.stringify(compact));
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
          window.sessionStorage.setItem("chat-media-thumbs", JSON.stringify(persisted.slice(-250)));
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

  return (
    <div className="mt-1 space-y-2">
      {files.map((file, fileIndex) => {
        const renderType = getFileRenderType(file);
        const isImage = renderType === "image";
        const isVideo = renderType === "video";
        const videoUrl = String(file?.url || "");
        const isTranscodedOutput = videoUrl.includes("-h264-");
        const isProcessingVideo = isVideo && file?.processing === true && !isTranscodedOutput;
        const key = file.id || `${file.name}-${file.sizeBytes || 0}`;
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

        if (isImage && file.url) {
          return (
            <button
              type="button"
              key={key}
              onClick={() =>
                openFocusMedia({
                  url: file.url,
                  name: file.name,
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
                  name: file.name,
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

        return file.url ? (
          <a
            key={key}
            href={file.url}
            download={file.name || undefined}
            rel="noopener noreferrer"
            className="group inline-flex w-fit max-w-full items-center gap-2 rounded-xl border border-emerald-200/70 bg-white/70 px-3 py-2.5 text-xs text-slate-700 transition hover:border-emerald-300 hover:bg-white hover:shadow-[0_0_16px_rgba(16,185,129,0.18)] dark:border-emerald-500/30 dark:bg-slate-900/50 dark:text-slate-200 dark:hover:bg-slate-900/70 dark:hover:shadow-[0_0_16px_rgba(16,185,129,0.14)]"
          >
            <span className="relative inline-flex h-5 w-5 shrink-0 items-center justify-center">
              <File size={18} className="absolute text-emerald-600 transition-opacity duration-150 group-hover:opacity-0 dark:text-emerald-300" />
              <Download size={18} className="absolute text-emerald-600 opacity-0 transition-opacity duration-150 group-hover:opacity-100 dark:text-emerald-300" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block whitespace-normal break-words">{file.name || "document"}</span>
              <span className="mt-0.5 block text-[10px] text-slate-500 dark:text-slate-400">
                {formatFileSize(file.sizeBytes)}
              </span>
            </span>
          </a>
        ) : (
          <div
            key={key}
            className="inline-flex w-fit max-w-full items-center gap-2 rounded-xl border border-emerald-200/70 bg-white/70 px-3 py-2.5 text-xs text-slate-700 dark:border-emerald-500/30 dark:bg-slate-900/50 dark:text-slate-200"
          >
            <File size={18} className="shrink-0 text-emerald-600 dark:text-emerald-300" />
            <span className="min-w-0 flex-1">
              <span className="block whitespace-normal break-words">{file.name || "document"}</span>
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
