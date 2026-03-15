import { useEffect, useRef, useState } from "react";
import { File, ImageIcon, Paperclip, Play, Reply, Send, Close, Video } from "../../icons/lucide.js";
import { hasPersian } from "../../utils/fontUtils.js";

export function MessageComposer({
  activeChatId,
  isDesktop,
  handleSend,
  onComposerResize,
  replyTarget,
  onClearReply,
  pendingUploadFiles,
  pendingUploadType,
  fileUploadEnabled,
  mediaInputRef,
  documentInputRef,
  onClearPendingUploads,
  onRemovePendingUpload,
  onUploadFilesSelected,
  uploadError,
  activeUploadProgress,
  uploadBusy,
  showUploadMenu,
  setShowUploadMenu,
  uploadMenuRef,
  handleVideoThumbLoadedMetadata,
}) {
  const messageInputRef = useRef(null);
  const [isRtl, setIsRtl] = useState(false);
  const maxTextareaHeight = 136;
  const replyIsRtl = replyTarget ? hasPersian(replyTarget.body || "") : false;
  const replyBodyText = replyTarget?.body || "";
  const derivedReplyIcon = (() => {
    if (!replyTarget) return null;
    if (replyTarget.icon) return replyTarget.icon;
    if (/^Sent a video/i.test(replyBodyText)) return "video";
    if (/^Sent a photo/i.test(replyBodyText)) return "image";
    if (/^Sent (a document|\d+ files)/i.test(replyBodyText)) return "document";
    return null;
  })();

  const resizeTextarea = () => {
    const el = messageInputRef.current;
    if (!el) return;
    el.style.height = "0px";
    const nextHeight = Math.min(el.scrollHeight, maxTextareaHeight);
    el.style.height = `${Math.max(44, nextHeight)}px`;
    el.style.overflowY = el.scrollHeight > maxTextareaHeight ? "auto" : "hidden";
    onComposerResize?.();
  };

  useEffect(() => {
    resizeTextarea();
  }, []);

  useEffect(() => {
    resizeTextarea();
  }, [pendingUploadFiles?.length]);

  useEffect(() => {
    resizeTextarea();
  }, [replyTarget]);

  if (!activeChatId) return null;

  return (
    <form
      className="sticky bottom-0 z-30 flex flex-col gap-3 border-t border-slate-300/80 bg-white px-4 py-3 dark:border-emerald-500/20 dark:bg-slate-900 sm:px-6 md:static md:mt-auto md:shrink-0"
      style={{
        bottom: isDesktop ? undefined : "max(0px, var(--mobile-bottom-offset, 0px))",
        paddingBottom: isDesktop
          ? "0.75rem"
          : "max(0.75rem, calc(env(safe-area-inset-bottom) + 0.5rem))",
      }}
      onSubmit={(event) => {
        handleSend(event);
        requestAnimationFrame(() => {
          setIsRtl(false);
          resizeTextarea();
        });
      }}
    >
      {replyTarget ? (
        <div className="rounded-2xl border border-emerald-200/80 bg-emerald-50/70 p-2 dark:border-emerald-500/30 dark:bg-slate-950/70">
          <div className="flex items-start gap-3 px-1">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-200">
              <Reply size={20} className="icon-anim-sway" />
            </div>
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-200">
                Reply to {replyTarget.displayName || replyTarget.username || "message"}
              </span>
              <span
                className={`mt-1 flex min-w-0 items-center gap-1 text-xs text-slate-600 dark:text-slate-300 ${
                  replyIsRtl ? "font-fa text-right" : "text-left"
                }`}
                dir={replyIsRtl ? "rtl" : "ltr"}
                style={{ unicodeBidi: "plaintext" }}
              >
                {derivedReplyIcon === "video" ? (
                  <Video size={12} className="shrink-0 text-slate-500 dark:text-slate-400" />
                ) : derivedReplyIcon === "image" ? (
                  <ImageIcon size={12} className="shrink-0 text-slate-500 dark:text-slate-400" />
                ) : derivedReplyIcon === "document" ? (
                  <File size={12} className="shrink-0 text-slate-500 dark:text-slate-400" />
                ) : null}
                <span className="min-w-0 truncate">{replyTarget.body || "Message"}</span>
              </span>
            </div>
            <button
              type="button"
              onClick={onClearReply}
              className="inline-flex h-9 w-9 items-center justify-center self-center rounded-full border border-emerald-200 text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-50 hover:shadow-[0_0_16px_rgba(16,185,129,0.2)] dark:border-emerald-500/30 dark:text-emerald-200 dark:hover:bg-emerald-500/10"
              aria-label="Cancel reply"
            >
              <Close size={20} className="icon-anim-pop" />
            </button>
          </div>
        </div>
      ) : null}
      {pendingUploadFiles?.length ? (
        <div className="rounded-2xl border border-emerald-200/80 bg-emerald-50/70 p-2 dark:border-emerald-500/30 dark:bg-slate-950/70">
          <div className="mb-2 flex items-center justify-between px-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-200">
            <span>
              {pendingUploadType === "media" ? "Photo or Video" : "Document"} (
              {pendingUploadFiles.length})
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={!fileUploadEnabled}
                onClick={() => {
                  if (!fileUploadEnabled) return;
                  if (pendingUploadType === "media") {
                    mediaInputRef.current?.click();
                  } else {
                    documentInputRef.current?.click();
                  }
                }}
                className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 transition ${
                  fileUploadEnabled
                    ? "border-emerald-200/70 text-emerald-700 hover:border-emerald-300 hover:bg-emerald-100 dark:border-emerald-500/30 dark:text-emerald-200 dark:hover:bg-emerald-500/10"
                    : "cursor-not-allowed border-slate-300 text-slate-400 dark:border-slate-700 dark:text-slate-500"
                }`}
              >
                <Paperclip size={12} />
                Add
              </button>
              <button
                type="button"
                onClick={onClearPendingUploads}
                className="inline-flex items-center gap-1 rounded-full border border-rose-200/70 px-2 py-0.5 text-rose-600 transition hover:border-rose-300 hover:bg-rose-50 dark:border-rose-500/30 dark:text-rose-300 dark:hover:bg-rose-900/30"
              >
              <Close size={12} className="icon-anim-pop" />
                Clear
              </button>
            </div>
          </div>
          <div className="chat-scroll grid max-h-40 grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3">
            {pendingUploadFiles.map((item) => {
              const forceDocPreview = pendingUploadType === "document";
              const isImage = !forceDocPreview && item.mimeType?.startsWith("image/");
              const isVideo = !forceDocPreview && item.mimeType?.startsWith("video/");
              return (
                <div
                  key={item.id}
                  className="relative overflow-hidden rounded-xl border border-emerald-200/70 bg-white/90 p-2 text-[11px] dark:border-emerald-500/30 dark:bg-slate-900/70"
                >
                  <button
                    type="button"
                    onClick={() => onRemovePendingUpload(item.id)}
                    className="absolute right-1 top-1 z-20 inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-300 bg-white/90 text-slate-600 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-300"
                    aria-label="Remove file"
                  >
                    <Close size={11} className="icon-anim-pop" />
                  </button>
                  {isImage ? (
                    <div className="mb-1 flex h-24 items-center justify-center rounded-md">
                      <img
                        src={item.previewUrl}
                        alt={item.name}
                        className="h-24 w-auto max-w-full rounded-md object-contain"
                      />
                    </div>
                  ) : isVideo ? (
                    <div className="relative mb-1 flex h-24 items-center justify-center rounded-md">
                      <video
                        src={item.previewUrl}
                        muted
                        playsInline
                        preload="auto"
                        onLoadedMetadata={handleVideoThumbLoadedMetadata}
                        onLoadedData={handleVideoThumbLoadedMetadata}
                        onCanPlay={handleVideoThumbLoadedMetadata}
                        className="h-24 w-auto max-w-full rounded-md object-contain"
                      />
                      <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
                        <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/40 bg-black/45 text-white">
                          <Play size={14} className="translate-x-[1px]" />
                        </span>
                      </span>
                    </div>
                  ) : (
                    <div className="mb-1 flex h-24 w-full items-center justify-center rounded-md bg-slate-100 text-emerald-700 dark:bg-slate-800 dark:text-emerald-200">
                      <File size={16} />
                    </div>
                  )}
                  <p className="truncate pr-5 text-slate-700 dark:text-slate-200">
                    {item.name}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
      {uploadError ? (
        <p className="text-xs text-rose-600 dark:text-rose-300">{uploadError}</p>
      ) : null}
      {activeUploadProgress !== null ? (
        <div className="rounded-xl border border-emerald-200/70 bg-emerald-50/60 px-3 py-2 dark:border-emerald-500/30 dark:bg-slate-950/70">
          <div className="mb-1 flex items-center justify-between text-[11px] font-semibold text-emerald-700 dark:text-emerald-200">
            <span>Uploading files...</span>
            <span>{Math.round(activeUploadProgress)}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-emerald-100 dark:bg-slate-800">
            <div
              className="h-full rounded-full bg-emerald-500 transition-[width] duration-150"
              style={{ width: `${activeUploadProgress}%` }}
            />
          </div>
        </div>
      ) : null}
      <div className="flex flex-row items-center gap-3">
        <div className="relative" ref={uploadMenuRef}>
          <button
            type="button"
            disabled={uploadBusy}
            onClick={() => {
              if (uploadBusy) return;
              setShowUploadMenu((prev) => !prev);
            }}
            className={`inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-transparent bg-transparent transition ${
              !uploadBusy
                ? "text-emerald-700 hover:border-emerald-300 hover:bg-emerald-100 hover:shadow-[0_0_16px_rgba(16,185,129,0.22)] dark:text-emerald-200 dark:hover:border-emerald-500/30 dark:hover:bg-emerald-500/10"
                : "cursor-not-allowed text-slate-400 dark:text-slate-500"
            }`}
            aria-label="Attach file"
          >
            <Paperclip size={18} className="icon-anim-sway" />
          </button>
          {showUploadMenu && !uploadBusy ? (
            <div className="absolute bottom-12 left-0 z-40 w-44 rounded-xl border border-emerald-200/80 bg-white p-1.5 shadow-lg dark:border-emerald-500/30 dark:bg-slate-950">
              <button
                type="button"
                onClick={() => {
                  mediaInputRef.current?.click();
                  setShowUploadMenu(false);
                }}
                className="flex w-full items-center gap-2 rounded-lg border border-transparent px-2 py-2 text-left text-xs text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-100 dark:text-emerald-200 dark:hover:border-emerald-500/30 dark:hover:bg-emerald-500/10"
              >
                <ImageIcon size={15} className="icon-anim-sway" />
                Photo or Video
              </button>
              <button
                type="button"
                onClick={() => {
                  documentInputRef.current?.click();
                  setShowUploadMenu(false);
                }}
                className="mt-1 flex w-full items-center gap-2 rounded-lg border border-transparent px-2 py-2 text-left text-xs text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-100 dark:text-emerald-200 dark:hover:border-emerald-500/30 dark:hover:bg-emerald-500/10"
              >
                <File size={15} className="icon-anim-lift" />
                Document
              </button>
            </div>
          ) : null}
          <input
            ref={mediaInputRef}
            type="file"
            accept="image/*,video/*"
            multiple
            className="sr-only"
            disabled={uploadBusy}
            onChange={(event) => {
              onUploadFilesSelected(
                event.target.files,
                "media",
                pendingUploadType === "media",
              );
              event.target.value = "";
            }}
          />
          <input
            ref={documentInputRef}
            type="file"
            multiple
            className="sr-only"
            disabled={uploadBusy}
            onChange={(event) => {
              onUploadFilesSelected(
                event.target.files,
                "document",
                pendingUploadType === "document",
              );
              event.target.value = "";
            }}
          />
        </div>
        <textarea
          ref={messageInputRef}
          name="message"
          rows={1}
          placeholder="Type a message"
          lang={isRtl ? "fa" : "en"}
          dir={isRtl ? "rtl" : "ltr"}
          onInput={(event) => {
            const value = event.currentTarget.value || "";
            setIsRtl(hasPersian(value));
            resizeTextarea();
          }}
          onKeyDown={(event) => {
            if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
            event.preventDefault();
            event.currentTarget.form?.requestSubmit();
          }}
          className={`chat-scroll min-w-0 flex-1 resize-none rounded-2xl border border-emerald-200 bg-white px-4 py-2 text-base text-slate-700 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-300/60 dark:border-emerald-500/30 dark:bg-slate-900 dark:text-slate-100 ${isRtl ? "text-right font-fa" : "text-left"}`}
          style={{
            minHeight: "44px",
            maxHeight: `${maxTextareaHeight}px`,
            unicodeBidi: "plaintext",
            whiteSpace: "pre-wrap",
            wordBreak: "normal",
            overflowWrap: "break-word",
            overflowX: "hidden",
          }}
        />
        <button
          type="submit"
          className="inline-flex h-11 items-center justify-center rounded-2xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-emerald-500/30 transition hover:bg-emerald-400 hover:shadow-emerald-500/40"
        >
          <Send className="icon-anim-slide" />
        </button>
      </div>
    </form>
  );
}
