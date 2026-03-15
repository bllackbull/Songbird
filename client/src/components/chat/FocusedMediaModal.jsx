import {
  AlertCircle,
  Download,
  Pause,
  Play,
  Volume2,
  VolumeX,
  Close,
} from "../../icons/lucide.js";

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
  if (!focusedMedia) return null;

  return (
    <div
      className={`fixed inset-0 z-[200] transition-opacity duration-200 ${
        isDesktop ? "bg-black/80" : "bg-black"
      } ${focusVisible ? "opacity-100" : "opacity-0"}`}
      onClick={() => {
        if (isDesktop) {
          closeFocusMedia();
        }
      }}
    >
      {!isDesktop ? (
        <div
          className={`absolute left-0 right-0 z-10 flex items-center justify-between px-6 py-4 transition-all duration-200 ${
            focusVisible ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-1"
          }`}
          style={{ top: "max(0px, env(safe-area-inset-top))" }}
        >
          <button
            type="button"
            onClick={closeFocusMedia}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/30 bg-black/40 text-white transition hover:border-white/50 hover:bg-black/55"
            aria-label="Close"
          >
            <Close size={18} className="icon-anim-pop" />
          </button>
          <a
            href={focusedMedia.url}
            download={focusedMedia.name || "media"}
            className="group inline-flex h-9 items-center gap-2 rounded-full bg-emerald-500 px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-emerald-500/30 transition hover:bg-emerald-400 hover:shadow-[0_0_22px_rgba(16,185,129,0.45)]"
          >
            <Download size={15} className="icon-anim-drop" />
            Save
          </a>
        </div>
      ) : null}
      {isDesktop ? (
        <>
          <div
            className={`absolute left-6 top-4 z-10 transition-all duration-200 ${
              focusVisible ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-1"
            }`}
          >
            <button
              type="button"
              onClick={closeFocusMedia}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/30 bg-black/40 text-white transition hover:border-white/50 hover:bg-black/55"
              aria-label="Close"
            >
              <Close size={18} className="icon-anim-pop" />
            </button>
          </div>
          <div
            className={`absolute right-6 top-4 z-10 transition-all duration-200 ${
              focusVisible ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-1"
            }`}
          >
            <a
              href={focusedMedia.url}
              download={focusedMedia.name || "media"}
              className="group inline-flex h-9 items-center gap-2 rounded-full bg-emerald-500 px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-emerald-500/30 transition hover:bg-emerald-400 hover:shadow-[0_0_22px_rgba(16,185,129,0.45)]"
            >
              <Download size={15} className="icon-anim-drop" />
              Save
            </a>
          </div>
        </>
      ) : null}
      <div
        className={`flex h-full justify-center p-3 md:p-6 ${
          isDesktop ? "items-center" : "items-center"
        }`}
        style={
          isDesktop
            ? undefined
            : {
                paddingTop: "max(4.25rem, calc(env(safe-area-inset-top) + 3rem))",
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
            maxHeight: isDesktop ? "min(86vh, 820px)" : "calc(100vh - 13rem)",
          }}
        >
          {focusedMedia.type === "video" ? (
            <div
              className="relative mx-auto flex w-fit max-w-full flex-col items-center"
              onClick={(event) => event.stopPropagation()}
              onTouchStart={
                isMobileTouchDevice && !isDesktop ? handleFocusTouchStart : undefined
              }
              onTouchEnd={
                isMobileTouchDevice && !isDesktop ? handleFocusTouchEnd : undefined
              }
            >
              {focusedMedia.processing ? (
                <div
                  className="mx-auto flex items-center justify-center overflow-hidden rounded-2xl bg-slate-200/80 dark:bg-slate-800/80"
                  style={getFocusFrameStyle()}
                >
                  <div className="h-full w-full animate-pulse rounded-2xl bg-slate-200/80 dark:bg-slate-800/80" />
                </div>
              ) : (
                <div className="relative mx-auto flex w-fit max-w-full items-center justify-center">
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
              onTouchStart={
                isMobileTouchDevice && !isDesktop ? handleFocusTouchStart : undefined
              }
              onTouchEnd={
                isMobileTouchDevice && !isDesktop ? handleFocusTouchEnd : undefined
              }
            >
              <img
                src={focusedMedia.url}
                alt={focusedMedia.name || "media"}
                onLoad={onFocusedImageLoad}
                className={`mx-auto max-h-[78vh] w-auto max-w-full rounded-2xl object-contain transition-opacity duration-150 ${
                  focusedMediaLoaded ? "opacity-100" : "opacity-0"
                }`}
              />
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
          className="absolute inset-x-0 bottom-0 z-20 px-4 pb-4 md:px-6"
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
                disabled={Boolean(focusedMedia.processing) || !focusedMediaLoaded}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/30 bg-white/10"
                aria-label={focusedVideoPlaying ? "Pause" : "Play"}
              >
                {focusedVideoPlaying ? <Pause size={15} /> : <Play size={15} />}
              </button>
              <button
                type="button"
                onClick={toggleFocusedVideoMute}
                disabled={Boolean(focusedMedia.processing) || !focusedMediaLoaded}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/30 bg-white/10"
                aria-label={focusedVideoMuted ? "Unmute" : "Mute"}
              >
                {focusedVideoMuted ? <VolumeX size={15} /> : <Volume2 size={15} />}
              </button>
              <input
                type="range"
                min={0}
                max={Math.max(focusedVideoDuration, 0)}
                step={0.1}
                value={Math.min(focusedVideoTime, focusedVideoDuration || 0)}
                onChange={(event) => seekFocusedVideo(event.target.value)}
                disabled={Boolean(focusedMedia.processing) || !focusedMediaLoaded}
                className="h-1.5 flex-1 accent-emerald-400"
                aria-label="Seek video"
              />
              <span className="w-20 text-right text-[11px]">
                {formatSeconds(focusedVideoTime)} / {formatSeconds(focusedVideoDuration)}
              </span>
            </div>
          </div>
        </div>
      ) : null}
      {focusExpiryWarning ? (
        <div
          className="absolute inset-x-0 bottom-0 z-10 flex justify-center px-4 pb-16 md:px-6"
          onClick={(event) => event.stopPropagation()}
        >
          <div
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold leading-none ${
              focusExpiryWarning.danger
                ? "border-rose-300 bg-rose-100 text-rose-700 dark:border-rose-500 dark:bg-rose-900 dark:text-rose-100"
                : "border-white/20 bg-black/65 text-white"
            }`}
          >
            <AlertCircle className="h-[13px] w-[13px] shrink-0" />
            <span className="leading-none">{focusExpiryWarning.text}</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
