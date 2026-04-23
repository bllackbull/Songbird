import { useCallback, useEffect, useRef, useState } from "react";
import {
  ClockFading,
  Download,
  Pause,
  Play,
  Volume2,
  VolumeX,
  Close,
} from "../../../icons/lucide.js";

export function FocusedMediaModal({
  focusedMedia,
  isDesktop,
  focusVisible,
  closeFocusMedia,
  isMobileTouchDevice,
  handleFocusTouchStart,
  handleFocusTouchEnd,
  getFocusFrameStyle,
  focusedVideoRef,
  toggleFocusedVideoPlay,
  handleFocusedVideoLoadedMetadata,
  handleFocusedVideoLoadedData,
  handleFocusedVideoCanPlay,
  handleFocusedVideoError,
  focusedMediaLoaded,
  onFocusedImageLoad,
  focusedVideoHint,
  focusedVideoDecodeIssue,
  focusedVideoPlaying,
  focusedVideoMuted,
  toggleFocusedVideoMute,
  focusedVideoDuration,
  focusedVideoTime,
  seekFocusedVideo,
  formatSeconds,
  focusExpiryWarning,
  getFocusAspectRatio,
}) {
  const [zoomScale, setZoomScale] = useState(1);
  const zoomScaleRef = useRef(1);
  const zoomOffsetRef = useRef({ x: 0, y: 0 });
  const zoomRafRef = useRef(0);
  const [isInteracting, setIsInteracting] = useState(false);
  const isInteractingRef = useRef(false);
  const lastZoomStateUpdateRef = useRef(0);
  const mediaViewportRef = useRef(null);
  const mediaZoomLayerRef = useRef(null);
  const touchStateRef = useRef({
    pinching: false,
    panning: false,
    delegateSwipe: false,
    startDistance: 0,
    startScale: 1,
    startMidX: 0,
    startMidY: 0,
    startOffsetX: 0,
    startOffsetY: 0,
    lastPanX: 0,
    lastPanY: 0,
  });
  const lastTapRef = useRef({ time: 0, x: 0, y: 0 });

  const clampZoomOffset = useCallback((scale, x, y) => {
    const viewport = mediaViewportRef.current;
    const zoomLayer = mediaZoomLayerRef.current;
    if (!viewport || !zoomLayer || scale <= 1) {
      return { x: 0, y: 0 };
    }
    const viewportWidth = viewport.clientWidth || 0;
    const viewportHeight = viewport.clientHeight || 0;
    const mediaWidth = zoomLayer.offsetWidth || viewportWidth;
    const mediaHeight = zoomLayer.offsetHeight || viewportHeight;
    const maxX = Math.max(0, (mediaWidth * scale - viewportWidth) / 2);
    const maxY = Math.max(0, (mediaHeight * scale - viewportHeight) / 2);
    return {
      x: Math.max(-maxX, Math.min(maxX, x)),
      y: Math.max(-maxY, Math.min(maxY, y)),
    };
  }, []);

  const applyZoomTransform = useCallback((scale, offset) => {
    const zoomLayer = mediaZoomLayerRef.current;
    if (!zoomLayer) return;
    zoomLayer.style.transform = `translate3d(${offset.x}px, ${offset.y}px, 0) scale(${scale})`;
  }, []);

  const updateZoom = useCallback(
    (nextScale, nextX, nextY) => {
      const clampedScale = Math.max(1, Math.min(4, Number(nextScale) || 1));
      const nextOffset =
        clampedScale <= 1
          ? { x: 0, y: 0 }
          : clampZoomOffset(clampedScale, nextX, nextY);
      const roundedOffset = {
        x: Math.round((nextOffset.x || 0) * 10) / 10,
        y: Math.round((nextOffset.y || 0) * 10) / 10,
      };
      zoomScaleRef.current = clampedScale;
      zoomOffsetRef.current = roundedOffset;
      if (!zoomRafRef.current) {
        zoomRafRef.current = requestAnimationFrame((now) => {
          zoomRafRef.current = 0;
          applyZoomTransform(zoomScaleRef.current, zoomOffsetRef.current);
          const shouldUpdateState =
            !isInteractingRef.current || now - lastZoomStateUpdateRef.current > 90;
          if (shouldUpdateState) {
            lastZoomStateUpdateRef.current = now;
            setZoomScale(zoomScaleRef.current);
          }
        });
      }
    },
    [applyZoomTransform, clampZoomOffset],
  );

  const zoomToPoint = useCallback(
    (scale, clientX, clientY) => {
      const viewport = mediaViewportRef.current;
      if (!viewport) {
        updateZoom(scale, 0, 0);
        return;
      }
      const rect = viewport.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const dx = clientX - centerX;
      const dy = clientY - centerY;
      const nextX = -dx * (scale - 1);
      const nextY = -dy * (scale - 1);
      updateZoom(scale, nextX, nextY);
    },
    [updateZoom],
  );

  useEffect(() => {
    setZoomScale(1);
    applyZoomTransform(1, { x: 0, y: 0 });
    zoomScaleRef.current = 1;
    zoomOffsetRef.current = { x: 0, y: 0 };
    setIsInteracting(false);
    isInteractingRef.current = false;
    touchStateRef.current = {
      pinching: false,
      panning: false,
      delegateSwipe: false,
      startDistance: 0,
      startScale: 1,
      startMidX: 0,
      startMidY: 0,
      startOffsetX: 0,
      startOffsetY: 0,
      lastPanX: 0,
      lastPanY: 0,
    };
  }, [focusedMedia?.url, focusedMedia?.type, isMobileTouchDevice, applyZoomTransform]);

  useEffect(() => {
    return () => {
      if (zoomRafRef.current) {
        cancelAnimationFrame(zoomRafRef.current);
        zoomRafRef.current = 0;
      }
    };
  }, []);

  const handleMediaTouchStart = (event) => {
    if (isDesktop || !isMobileTouchDevice) return;
    const touches = event.touches || [];
    const state = touchStateRef.current;

    if (touches.length >= 2) {
      const [t1, t2] = touches;
      const distance = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      const midX = (t1.clientX + t2.clientX) / 2;
      const midY = (t1.clientY + t2.clientY) / 2;
      state.pinching = true;
      state.panning = false;
      state.delegateSwipe = false;
      state.startDistance = distance || 1;
      state.startScale = zoomScaleRef.current;
      state.startMidX = midX;
      state.startMidY = midY;
      state.startOffsetX = zoomOffsetRef.current.x;
      state.startOffsetY = zoomOffsetRef.current.y;
      event.preventDefault();
      if (!isInteractingRef.current) {
        isInteractingRef.current = true;
        setIsInteracting(true);
      }
      return;
    }

    const touch = touches[0];
    if (!touch) return;

    if (zoomScaleRef.current > 1.001) {
      state.panning = true;
      state.pinching = false;
      state.delegateSwipe = false;
      state.lastPanX = touch.clientX;
      state.lastPanY = touch.clientY;
      event.preventDefault();
      if (!isInteractingRef.current) {
        isInteractingRef.current = true;
        setIsInteracting(true);
      }
      return;
    }

    state.delegateSwipe = true;
    handleFocusTouchStart?.(event);
  };

  const handleMediaTouchMove = (event) => {
    if (isDesktop || !isMobileTouchDevice) return;
    const touches = event.touches || [];
    const state = touchStateRef.current;

    if (touches.length >= 2 && state.pinching) {
      const [t1, t2] = touches;
      const distance = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      const ratio = distance / (state.startDistance || 1);
      const midX = (t1.clientX + t2.clientX) / 2;
      const midY = (t1.clientY + t2.clientY) / 2;
      const nextScale = state.startScale * ratio;
      const nextX = state.startOffsetX + (midX - state.startMidX);
      const nextY = state.startOffsetY + (midY - state.startMidY);
      updateZoom(nextScale, nextX, nextY);
      event.preventDefault();
      return;
    }

    if (touches.length === 1 && state.panning) {
      const touch = touches[0];
      const dx = touch.clientX - state.lastPanX;
      const dy = touch.clientY - state.lastPanY;
      state.lastPanX = touch.clientX;
      state.lastPanY = touch.clientY;
      updateZoom(
        zoomScaleRef.current,
        zoomOffsetRef.current.x + dx,
        zoomOffsetRef.current.y + dy,
      );
      event.preventDefault();
    }
  };

  const handleMediaTouchEnd = (event) => {
    if (isDesktop || !isMobileTouchDevice) return;
    const state = touchStateRef.current;
    const touches = event.touches || [];

    if (touches.length >= 2) return;

    if (touches.length === 1) {
      const touch = touches[0];
      state.pinching = false;
      state.panning = zoomScaleRef.current > 1.001;
      state.lastPanX = touch.clientX;
      state.lastPanY = touch.clientY;
      return;
    }

    state.pinching = false;
    state.panning = false;
    if (isInteractingRef.current) {
      isInteractingRef.current = false;
      setIsInteracting(false);
    }
    if (zoomScaleRef.current <= 1.001) {
      updateZoom(1, 0, 0);
    }
    if (state.delegateSwipe) {
      handleFocusTouchEnd?.(event);
    }
    state.delegateSwipe = false;

    const tap = event.changedTouches?.[0];
    if (!tap) return;
    const now = Date.now();
    const lastTap = lastTapRef.current;
    const dt = now - lastTap.time;
    const dist = Math.hypot(tap.clientX - lastTap.x, tap.clientY - lastTap.y);
    lastTapRef.current = { time: now, x: tap.clientX, y: tap.clientY };
    if (dt < 260 && dist < 28) {
      if (zoomScaleRef.current <= 1.001) {
        zoomToPoint(2.2, tap.clientX, tap.clientY);
      } else {
        updateZoom(1, 0, 0);
      }
    }
  };

  const handleMobileSave = async (event) => {
    event?.preventDefault?.();
    const url = focusedMedia.downloadUrl || focusedMedia.url;
    if (!url) return;
    const filename = focusedMedia.name || "media";
    const tryFallbackDownload = () => {
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.rel = "noopener noreferrer";
      link.target = "_blank";
      document.body.appendChild(link);
      link.click();
      link.remove();
    };

    const canShareFiles =
      typeof navigator !== "undefined" &&
      typeof navigator.share === "function" &&
      typeof navigator.canShare === "function";

    if (!canShareFiles) {
      tryFallbackDownload();
      return;
    }

    try {
      const res = await fetch(url, { credentials: "include" });
      const blob = await res.blob();
      const file = new File([blob], filename, { type: blob.type || undefined });
      if (!navigator.canShare({ files: [file] })) {
        tryFallbackDownload();
        return;
      }
      await navigator.share({
        files: [file],
        title: focusedMedia.name || "Media",
      });
    } catch {
      tryFallbackDownload();
    }
  };

  if (!focusedMedia) return null;

  const controlsHidden = zoomScale > 1.01;
  const controlsVisible = focusVisible && !controlsHidden;

  return (
    <div
      className={`fixed inset-0 z-[200] transition-opacity duration-200 ${
        isDesktop ? "bg-black/80" : "bg-black"
      } ${focusVisible ? "opacity-100" : "opacity-0"}`}
      style={{
        minHeight: "100dvh",
        height: "100dvh",
      }}
      onClick={() => {
        if (isDesktop) {
          closeFocusMedia();
        }
      }}
    >
      {!isDesktop ? (
        <div
          className={`pointer-events-auto absolute left-0 right-0 z-50 flex items-center justify-between px-6 py-4 transition-all duration-200 ${
            controlsVisible
              ? "opacity-100 translate-y-0"
              : "opacity-0 -translate-y-2 pointer-events-none"
          }`}
          style={{ top: "max(0px, env(safe-area-inset-top))" }}
        >
          <button
            type="button"
            onClick={closeFocusMedia}
            className="pointer-events-auto relative z-50 inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/40 bg-transparent text-white transition hover:border-white/60"
            aria-label="Close"
          >
            <Close size={18} className="icon-anim-pop" />
          </button>
          <button
            type="button"
            onClick={handleMobileSave}
            className="pointer-events-auto relative z-50 group inline-flex h-9 items-center gap-2 rounded-full bg-emerald-500 px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-emerald-500/30 transition hover:bg-emerald-400 hover:shadow-[0_0_22px_rgba(16,185,129,0.45)]"
          >
            <Download size={15} className="icon-anim-drop" />
            Save
          </button>
        </div>
      ) : null}
      {isDesktop ? (
        <>
          <div
            className={`pointer-events-auto absolute left-6 top-4 z-50 transition-all duration-200 ${
              controlsVisible
                ? "opacity-100 translate-y-0"
                : "opacity-0 -translate-y-2 pointer-events-none"
            }`}
          >
            <button
              type="button"
              onClick={closeFocusMedia}
              className="pointer-events-auto relative z-50 inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/40 bg-transparent text-white transition hover:border-white/60"
              aria-label="Close"
            >
              <Close size={18} className="icon-anim-pop" />
            </button>
          </div>
          <div
            className={`pointer-events-auto absolute right-6 top-4 z-50 transition-all duration-200 ${
              controlsVisible
                ? "opacity-100 translate-y-0"
                : "opacity-0 -translate-y-2 pointer-events-none"
            }`}
          >
            <a
              href={focusedMedia.downloadUrl || focusedMedia.url}
              download={focusedMedia.name || "media"}
              className="pointer-events-auto relative z-50 group inline-flex h-9 items-center gap-2 rounded-full bg-emerald-500 px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-emerald-500/30 transition hover:bg-emerald-400 hover:shadow-[0_0_22px_rgba(16,185,129,0.45)]"
            >
              <Download size={15} className="icon-anim-drop" />
              Save
            </a>
          </div>
        </>
      ) : null}
      <div
        className={`relative z-0 flex h-full justify-center p-3 md:p-6 ${
          isDesktop ? "items-center" : "items-center"
        }`}
        style={
          isDesktop
            ? undefined
            : {
                paddingTop:
                  "max(4.25rem, calc(env(safe-area-inset-top) + 3rem))",
                paddingBottom:
                  "max(7.5rem, calc(env(safe-area-inset-bottom) + 6.5rem))",
              }
        }
        onClick={(event) => {
          if (!isDesktop) {
            event.stopPropagation();
          }
        }}
      >
        <div
          className={`mx-auto transition-all duration-200 ${
            isDesktop
              ? focusVisible
                ? "opacity-100"
                : "opacity-0"
              : focusVisible
                ? "translate-y-0 scale-100 opacity-100"
                : "translate-y-2 scale-95 opacity-0"
          }`}
          style={{
            width: "fit-content",
            maxWidth: "92vw",
            maxHeight: isDesktop ? "min(86vh, 820px)" : "calc(100dvh - 13rem)",
          }}
        >
          {focusedMedia.type === "video" ? (
            <div
              className="relative mx-auto flex w-fit max-w-full flex-col items-center"
              onClick={(event) => event.stopPropagation()}
              onTouchStart={handleMediaTouchStart}
              onTouchMove={handleMediaTouchMove}
              onTouchEnd={handleMediaTouchEnd}
              onTouchCancel={handleMediaTouchEnd}
              ref={mediaViewportRef}
              style={{ touchAction: "none" }}
            >
              {focusedMedia.processing ? (
                <div
                  className="mx-auto flex items-center justify-center overflow-hidden rounded-2xl bg-slate-200/80 dark:bg-slate-800/80"
                  style={getFocusFrameStyle()}
                >
                  <div className="h-full w-full animate-pulse rounded-2xl bg-slate-200/80 dark:bg-slate-800/80" />
                </div>
              ) : (
                <div
                  className="relative mx-auto flex w-fit max-w-full items-center justify-center"
                  ref={mediaZoomLayerRef}
                style={{
                  transformOrigin: "center center",
                  transition: isInteracting ? "none" : "transform 160ms ease-out",
                  willChange: "transform",
                  backfaceVisibility: "hidden",
                }}
                >
                  <video
                    key={focusedMedia.url}
                    ref={focusedVideoRef}
                    autoPlay
                    playsInline
                    preload="auto"
                    src={focusedMedia.url}
                    onClick={toggleFocusedVideoPlay}
                    onLoadedMetadata={handleFocusedVideoLoadedMetadata}
                    onLoadedData={handleFocusedVideoLoadedData}
                    onCanPlay={handleFocusedVideoCanPlay}
                    onError={handleFocusedVideoError}
                    className="mx-auto block max-h-[72vh] w-auto max-w-full cursor-pointer rounded-2xl bg-transparent object-contain md:max-h-[78vh] md:[transform:translateZ(0)] md:[backface-visibility:hidden]"
                    style={{ backfaceVisibility: "hidden" }}
                  />
                  {!focusedMediaLoaded ? (
                    <div className="pointer-events-none absolute inset-0 animate-pulse rounded-2xl bg-slate-200/80 dark:bg-slate-800/80" />
                  ) : null}
                </div>
              )}
              {focusedVideoHint ? (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <span className="inline-flex h-14 w-14 items-center justify-center rounded-full border border-white/40 bg-black/45 text-white">
                    {focusedVideoHint === "play" ? (
                      <Play size={24} className="translate-x-[1px]" />
                    ) : (
                      <Pause size={24} />
                    )}
                  </span>
                </div>
              ) : null}
            </div>
          ) : (
            <div
              className="relative mx-auto flex w-fit max-w-full flex-col items-center"
              onClick={(event) => event.stopPropagation()}
              onTouchStart={handleMediaTouchStart}
              onTouchMove={handleMediaTouchMove}
              onTouchEnd={handleMediaTouchEnd}
              onTouchCancel={handleMediaTouchEnd}
              ref={mediaViewportRef}
              style={{ touchAction: "none" }}
            >
              <div
                ref={mediaZoomLayerRef}
                style={{
                  transformOrigin: "center center",
                  transition: isInteracting ? "none" : "transform 160ms ease-out",
                  willChange: "transform",
                  backfaceVisibility: "hidden",
                  transformStyle: "preserve-3d",
                  contain: "paint",
                }}
              >
                <img
                  src={focusedMedia.url}
                  alt={focusedMedia.name || "media"}
                  onLoad={onFocusedImageLoad}
                  className={`mx-auto max-h-[78vh] w-auto max-w-full rounded-2xl object-contain transition-opacity duration-150 ${
                    focusedMediaLoaded ? "opacity-100" : "opacity-0"
                  }`}
                  style={{
                    backfaceVisibility: "hidden",
                    transform: "translateZ(0)",
                  }}
                />
              </div>
              {!focusedMediaLoaded ? (
                <div
                  className="absolute inset-0 min-h-[240px] w-[min(92vw,920px)] animate-pulse rounded-2xl bg-slate-200/80 dark:bg-slate-800/80"
                  style={{
                    aspectRatio: `${getFocusAspectRatio()}`,
                  }}
                />
              ) : null}
            </div>
          )}
        </div>
      </div>
      {focusedMedia?.type === "video" ? (
        <div
          className={`absolute inset-x-0 bottom-0 z-20 px-4 pb-4 transition-all duration-200 md:px-6 ${
            controlsVisible
              ? "opacity-100 translate-y-0"
              : "opacity-0 translate-y-2 pointer-events-none"
          }`}
          style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
          onClick={(event) => event.stopPropagation()}
        >
          {focusedVideoDecodeIssue ? (
            <div className="mb-2 flex justify-center">
              <div
                className="rounded-xl border border-amber-300/60 bg-amber-500/20 px-3 py-2 text-center text-xs text-amber-100"
                style={{ width: "min(92vw, 760px)" }}
              >
                {focusedVideoDecodeIssue}
              </div>
            </div>
          ) : null}
          <div
            className="mx-auto rounded-xl bg-black/70 p-2 text-white"
            style={{ width: "min(92vw, 760px)" }}
          >
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={toggleFocusedVideoPlay}
                disabled={
                  Boolean(focusedMedia.processing) || !focusedMediaLoaded
                }
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/30 bg-white/10"
                aria-label={focusedVideoPlaying ? "Pause" : "Play"}
              >
                {focusedVideoPlaying ? <Pause size={15} /> : <Play size={15} />}
              </button>
              <button
                type="button"
                onClick={toggleFocusedVideoMute}
                disabled={
                  Boolean(focusedMedia.processing) || !focusedMediaLoaded
                }
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/30 bg-white/10"
                aria-label={focusedVideoMuted ? "Unmute" : "Mute"}
              >
                {focusedVideoMuted ? (
                  <VolumeX size={15} />
                ) : (
                  <Volume2 size={15} />
                )}
              </button>
              <input
                type="range"
                min={0}
                max={Math.max(focusedVideoDuration, 0)}
                step={0.1}
                value={Math.min(focusedVideoTime, focusedVideoDuration || 0)}
                onChange={(event) => seekFocusedVideo(event.target.value)}
                disabled={
                  Boolean(focusedMedia.processing) || !focusedMediaLoaded
                }
                className="h-1.5 flex-1 accent-emerald-400"
                aria-label="Seek video"
              />
              <span className="w-20 text-right text-[11px]">
                {formatSeconds(focusedVideoTime)} /{" "}
                {formatSeconds(focusedVideoDuration)}
              </span>
            </div>
          </div>
        </div>
      ) : null}
      {focusExpiryWarning ? (
        <div
          className={`absolute inset-x-0 top-0 z-10 flex justify-center px-4 pt-5 transition-all duration-200 md:px-6 ${
            controlsVisible
              ? "opacity-100 translate-y-0"
              : "opacity-0 -translate-y-2 pointer-events-none"
          }`}
          onClick={(event) => event.stopPropagation()}
        >
          <div
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold leading-none ${
              focusExpiryWarning.danger
                ? "border-rose-300 bg-rose-100 text-rose-700 dark:border-rose-500 dark:bg-rose-900 dark:text-rose-100"
                : "border-white/20 bg-black/65 text-white"
            }`}
            title={focusExpiryWarning.title || ""}
          >
            <ClockFading className="h-[13px] w-[13px] shrink-0" />
            <span className="leading-none">{focusExpiryWarning.label}</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
