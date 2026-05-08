import { useEffect, useRef, useState, useCallback } from "react";
import {
  Check,
  Pencil,
  File,
  ImageIcon,
  Mic,
  Paperclip,
  Play,
  Reply,
  Send,
  Close,
  Video,
} from "../../../icons/lucide.js";
import { hasPersian } from "../../../utils/fontUtils.js";
import { renderMarkdownInlinePlain } from "../../../utils/markdown.js";

function applyTextareaSize({
  textareaEl,
  maxTextareaHeight,
  composerEl,
  onComposerResize,
  onComposerHeightChange,
}) {
  if (!textareaEl) return;
  textareaEl.style.height = "0px";
  const nextHeight = Math.min(textareaEl.scrollHeight, maxTextareaHeight);
  textareaEl.style.height = `${Math.max(44, nextHeight)}px`;
  textareaEl.style.overflowY =
    textareaEl.scrollHeight > maxTextareaHeight ? "auto" : "hidden";
  onComposerResize?.();
  if (composerEl) {
    onComposerHeightChange?.(Number(composerEl.offsetHeight || 0));
  }
}

export function MessageComposer({
  activeChatId,
  isDesktop,
  handleSend,
  onComposerResize,
  replyTarget,
  onClearReply,
  editTarget,
  onClearEdit,
  pendingUploadFiles,
  pendingUploadType,
  pendingVoiceMessage,
  fileUploadEnabled,
  mediaInputRef,
  documentInputRef,
  onClearPendingUploads,
  onRemovePendingUpload,
  onUploadFilesSelected,
  onVoiceRecorded,
  onClearPendingVoiceMessage,
  uploadError,
  activeUploadProgress,
  messageMaxChars = null,
  onMessageInput,
  uploadBusy,
  showUploadMenu,
  setShowUploadMenu,
  uploadMenuRef,
  handleVideoThumbLoadedMetadata,
  onComposerHeightChange,
  onComposerFocusChange,
  composerInputRef,
  microphonePermissionStatus = "unknown",
  onRequestMicrophonePermission,
}) {
  const composerRef = useRef(null);
  const fallbackInputRef = useRef(null);
  const messageInputRef = composerInputRef || fallbackInputRef;
  const keepFocusRef = useRef(false);
  const previousEditIdRef = useRef(0);
  const appliedEditIdRef = useRef(0);
  const [messageValue, setMessageValue] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [recordingMs, setRecordingMs] = useState(0);
  const recordingTimerRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const recordingStreamRef = useRef(null);
  const recordingChunksRef = useRef([]);
  const recordingStartRef = useRef(0);
  const recordingDurationMsRef = useRef(0);
  const isPressingMicRef = useRef(false);
  const pendingStopRef = useRef(false);
  const maxTextareaHeight = 136;
  const openFilePicker = useCallback((inputRef) => {
    const input = inputRef?.current;
    if (!input || input.disabled) return;
    try {
      if (typeof input.showPicker === "function") {
        input.showPicker();
      } else {
        input.click();
      }
    } catch {
      try {
        input.click();
      } catch {
        // ignore
      }
    }
  }, []);
  const formatDuration = (totalSeconds) => {
    const seconds = Math.max(0, Math.floor(Number(totalSeconds || 0)));
    const minutes = Math.floor(seconds / 60);
    const remainder = seconds % 60;
    return `${minutes}:${String(remainder).padStart(2, "0")}`;
  };
  const normalizeReplyBody = (value) => {
    if (typeof value === "string")
      return value === "[object Object]" ? "" : value;
    if (value && typeof value === "object") {
      const text = value.text ?? value.body;
      return typeof text === "string" ? text : "";
    }
    return "";
  };
  const replyBodyText = normalizeReplyBody(replyTarget?.body);
  const editBodyText = normalizeReplyBody(editTarget?.body);
  const composerHasPersian = hasPersian(messageValue);
  const editHasFiles = Array.isArray(editTarget?.files) && editTarget.files.length > 0;
  const editBodyLooksLikeFileSummary =
    /^Sent (a media file|a photo|a video|a document|a voice message|\d+ (files|photos|videos|documents|media files|voice messages))$/i.test(
      String(editBodyText || "").trim(),
    );
  const replyBodyNormalized = String(replyBodyText || "").trim();
  const isPluralMediaSummary =
    /^Sent \d+ (files|photos|videos|documents|media files)$/i.test(
      replyBodyNormalized,
    );
  const isGenericReplyMediaText =
    /^Sent (a media file|a file|a photo|a video|a document|\d+ (files|photos|videos|documents|media files))$/i.test(
      replyBodyNormalized,
    );
  const isGenericReplyVoiceText =
    /^Sent (a voice message|\d+ voice messages)$/i.test(replyBodyNormalized);
  const derivedReplyIcon = (() => {
    if (!replyTarget) return null;
    if (replyTarget.icon) return replyTarget.icon;
    if (/^Sent \d+ media files/i.test(replyBodyText)) return "image";
    if (/^Sent (a voice message|\d+ voice messages)/i.test(replyBodyText))
      return "voice";
    if (/^Sent (a video|\d+ videos)/i.test(replyBodyText)) return "video";
    if (/^Sent (a photo|\d+ photos)/i.test(replyBodyText)) return "image";
    if (/^Sent a media file/i.test(replyBodyText)) return "image";
    if (/^Sent (a file|a document|\d+ documents|\d+ files)/i.test(replyBodyText))
      return "document";
    return null;
  })();
  const resolvedReplyText =
    derivedReplyIcon === "voice"
      ? isGenericReplyVoiceText
        ? "Sent a voice message"
        : replyBodyText || "Message"
      : derivedReplyIcon === "video"
        ? isGenericReplyMediaText && !isPluralMediaSummary
          ? "Sent a video"
          : replyBodyText || "Message"
        : derivedReplyIcon === "image"
          ? isGenericReplyMediaText && !isPluralMediaSummary
            ? "Sent a photo"
            : replyBodyText || "Message"
          : replyBodyText || "Message";
  const resolvedReplyHtml = renderMarkdownInlinePlain(resolvedReplyText);

  const hasText = Boolean(String(messageValue || "").trim());
  const hasPendingUploads = Boolean(pendingUploadFiles?.length);
  const hasPendingVoice = Boolean(pendingVoiceMessage);
  const isEditMode = Boolean(editTarget);
  const micMode =
    !isEditMode && !hasText && !hasPendingUploads && !hasPendingVoice && !isRecording;
  const micDisabled = uploadBusy || !fileUploadEnabled || isEditMode;
  const canSubmitMessage = isEditMode
    ? hasText
    : hasText || hasPendingUploads || hasPendingVoice;

  useEffect(() => {
    applyTextareaSize({
      textareaEl: messageInputRef.current,
      maxTextareaHeight,
      composerEl: composerRef.current,
      onComposerResize,
      onComposerHeightChange,
    });
  }, [maxTextareaHeight, messageInputRef, onComposerHeightChange, onComposerResize]);

  useEffect(() => {
    applyTextareaSize({
      textareaEl: messageInputRef.current,
      maxTextareaHeight,
      composerEl: composerRef.current,
      onComposerResize,
      onComposerHeightChange,
    });
  }, [
    maxTextareaHeight,
    messageInputRef,
    onComposerHeightChange,
    onComposerResize,
    pendingUploadFiles?.length,
  ]);

  useEffect(() => {
    applyTextareaSize({
      textareaEl: messageInputRef.current,
      maxTextareaHeight,
      composerEl: composerRef.current,
      onComposerResize,
      onComposerHeightChange,
    });
  }, [
    editTarget,
    maxTextareaHeight,
    messageInputRef,
    onComposerHeightChange,
    onComposerResize,
    replyTarget,
  ]);

  useEffect(() => {
    const nextEditId = Number(editTarget?.id || 0);
    if (!nextEditId) return;
    if (appliedEditIdRef.current === nextEditId) return;
    const nextValue =
      editHasFiles && editBodyLooksLikeFileSummary ? "" : String(editBodyText || "");
    const frameId = requestAnimationFrame(() => {
      appliedEditIdRef.current = nextEditId;
      previousEditIdRef.current = nextEditId;
      setMessageValue(nextValue);
      if (typeof onMessageInput === "function") {
        onMessageInput(nextValue);
      }
      applyTextareaSize({
        textareaEl: messageInputRef.current,
        maxTextareaHeight,
        composerEl: composerRef.current,
        onComposerResize,
        onComposerHeightChange,
      });
      messageInputRef.current?.focus?.();
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [
    editBodyLooksLikeFileSummary,
    editBodyText,
    editHasFiles,
    editTarget?.id,
    maxTextareaHeight,
    messageInputRef,
    onComposerHeightChange,
    onMessageInput,
    onComposerResize,
  ]);

  useEffect(() => {
    if (editTarget) return;
    if (!previousEditIdRef.current) return;
    const frameId = requestAnimationFrame(() => {
      previousEditIdRef.current = 0;
      appliedEditIdRef.current = 0;
      setMessageValue("");
      if (typeof onMessageInput === "function") {
        onMessageInput("");
      }
      applyTextareaSize({
        textareaEl: messageInputRef.current,
        maxTextareaHeight,
        composerEl: composerRef.current,
        onComposerResize,
        onComposerHeightChange,
      });
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [
    editTarget,
    maxTextareaHeight,
    messageInputRef,
    onComposerHeightChange,
    onComposerResize,
    onMessageInput,
  ]);

  useEffect(() => {
    return () => {
      if (recordingTimerRef.current) {
        window.clearInterval(recordingTimerRef.current);
      }
      if (recordingStreamRef.current) {
        recordingStreamRef.current
          .getTracks()
          ?.forEach((track) => track.stop());
        recordingStreamRef.current = null;
      }
    };
  }, []);

  const startRecordingTimer = () => {
    if (recordingTimerRef.current) {
      window.clearInterval(recordingTimerRef.current);
    }
    recordingStartRef.current = Date.now();
    setRecordingMs(0);
    recordingTimerRef.current = window.setInterval(() => {
      setRecordingMs(Date.now() - recordingStartRef.current);
    }, 200);
  };

  const stopRecordingTimer = () => {
    if (recordingTimerRef.current) {
      window.clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
  };

  const stopRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    const canStop = recorder && recorder.state !== "inactive";
    if (!isRecording && !canStop) return;
    recordingDurationMsRef.current = Date.now() - recordingStartRef.current;
    setIsRecording(false);
    stopRecordingTimer();
    if (canStop) {
      try {
        if (
          recorder.state === "recording" &&
          typeof recorder.requestData === "function"
        ) {
          recorder.requestData();
        }
      } catch {
        // no-op
      }
      try {
        recorder.stop();
      } catch {
        // no-op
      }
    }
    if (recordingStreamRef.current) {
      recordingStreamRef.current.getTracks()?.forEach((track) => track.stop());
      recordingStreamRef.current = null;
    }
  }, [isRecording]);

  const createVoiceFileFromChunks = async (chunks, durationSeconds) => {
    if (!chunks.length) return null;
    const preferredTypes = [
      "audio/webm;codecs=opus",
      "audio/ogg;codecs=opus",
      "audio/webm",
      "audio/ogg",
    ];
    const mimeType =
      preferredTypes.find(
        (type) =>
          typeof MediaRecorder !== "undefined" &&
          MediaRecorder.isTypeSupported(type),
      ) ||
      chunks[0].type ||
      "audio/webm";
    const ext = mimeType.includes("ogg") ? "ogg" : "webm";
    const blob = new Blob(chunks, { type: mimeType });
    const filename = `voice-message-${Date.now()}.${ext}`;
    let file = blob;
    try {
      if (typeof File !== "undefined") {
        file = new File([blob], filename, { type: mimeType });
      } else {
        file = blob;
      }
    } catch {
      file = blob;
    }
    if (file && !file.name) {
      Object.defineProperty(file, "name", {
        value: filename,
        configurable: true,
      });
    }
    return {
      file,
      durationSeconds,
      mimeType,
    };
  };

  const requestMicrophoneStream = async () => {
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      throw new Error("Microphone access is not supported in this browser.");
    }
    if (navigator.permissions?.query) {
      try {
        await navigator.permissions.query({ name: "microphone" });
      } catch {
        // ignore permissions API failures
      }
    }
    return navigator.mediaDevices.getUserMedia({ audio: true });
  };

  const startRecording = useCallback(async () => {
    if (isRecording) return;
    if (pendingVoiceMessage) return;
    if (!fileUploadEnabled) return;
    if (uploadBusy) return;
    if (pendingUploadFiles?.length) return;
    setShowUploadMenu(false);
    recordingChunksRef.current = [];
    const stream = await requestMicrophoneStream();
    if (!isPressingMicRef.current) {
      stream.getTracks()?.forEach((track) => track.stop());
      return;
    }
    recordingStreamRef.current = stream;
    const options = {};
    if (typeof MediaRecorder !== "undefined") {
      if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) {
        options.mimeType = "audio/webm;codecs=opus";
      } else if (MediaRecorder.isTypeSupported("audio/ogg;codecs=opus")) {
        options.mimeType = "audio/ogg;codecs=opus";
      }
    }
    const recorder = new MediaRecorder(stream, options);
    mediaRecorderRef.current = recorder;
    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        recordingChunksRef.current.push(event.data);
      }
    };
    recorder.onerror = (event) => {
      console.warn("[voice] recorder error", event);
    };
    recorder.onstop = async () => {
      const fallbackDurationMs = Date.now() - recordingStartRef.current;
      const durationMs = recordingDurationMsRef.current || fallbackDurationMs;
      const chunks = recordingChunksRef.current;
      recordingChunksRef.current = [];
      recordingDurationMsRef.current = 0;
      if (!chunks.length) {
        console.warn("[voice] no audio chunks collected");
        return;
      }
      if (durationMs <= 1000) {
        return;
      }
      const durationSeconds = Math.max(1, Math.round(durationMs / 1000));
      const payload = await createVoiceFileFromChunks(chunks, durationSeconds);
      if (payload && typeof onVoiceRecorded === "function") {
        onVoiceRecorded(payload);
      }
    };
    recorder.start(250);
    setIsRecording(true);
    startRecordingTimer();
    if (pendingStopRef.current || !isPressingMicRef.current) {
      pendingStopRef.current = false;
      stopRecording();
    }
  }, [
    isRecording,
    pendingVoiceMessage,
    fileUploadEnabled,
    uploadBusy,
    pendingUploadFiles?.length,
    setShowUploadMenu,
    stopRecording,
    onVoiceRecorded,
  ]);

  const handleMicPointerDown = useCallback(
    async (event) => {
      event.preventDefault();
      if (micDisabled) return;
      if (microphonePermissionStatus === "prompt") {
        try {
          await onRequestMicrophonePermission?.();
        } catch {
          // ignore prompt failures
        }
        isPressingMicRef.current = false;
        pendingStopRef.current = false;
        return;
      }
      isPressingMicRef.current = true;
      pendingStopRef.current = false;
      try {
        await startRecording();
      } catch {
        // ignore
      }
    },
    [micDisabled, microphonePermissionStatus, onRequestMicrophonePermission, startRecording],
  );

  const restoreComposerFocus = () => {
    if (!keepFocusRef.current) return;
    keepFocusRef.current = false;
    requestAnimationFrame(() => {
      messageInputRef.current?.focus?.({ preventScroll: true });
      messageInputRef.current?.focus?.();
    });
  };

  const captureComposerFocus = () => {
    if (typeof document === "undefined") return;
    if (document.activeElement === messageInputRef.current) {
      keepFocusRef.current = true;
    }
  };

  const handleMicPointerUp = (event) => {
    event?.preventDefault?.();
    isPressingMicRef.current = false;
    const recorder = mediaRecorderRef.current;
    if (isRecording || (recorder && recorder.state === "recording")) {
      stopRecording();
      if (keepFocusRef.current) {
        keepFocusRef.current = false;
        requestAnimationFrame(() => {
          messageInputRef.current?.focus?.({ preventScroll: true });
          messageInputRef.current?.focus?.();
        });
      }
      return;
    }
    pendingStopRef.current = true;
    if (keepFocusRef.current) {
      keepFocusRef.current = false;
      requestAnimationFrame(() => {
        messageInputRef.current?.focus?.({ preventScroll: true });
        messageInputRef.current?.focus?.();
      });
    }
  };

  useEffect(() => {
    if (!isRecording) return;
    const handleWindowPointerUp = (event) => {
      event?.preventDefault?.();
      isPressingMicRef.current = false;
      const recorder = mediaRecorderRef.current;
      if (isRecording || (recorder && recorder.state === "recording")) {
        stopRecording();
        if (keepFocusRef.current) {
          keepFocusRef.current = false;
          requestAnimationFrame(() => {
            messageInputRef.current?.focus?.({ preventScroll: true });
            messageInputRef.current?.focus?.();
          });
        }
        return;
      }
      pendingStopRef.current = true;
      if (keepFocusRef.current) {
        keepFocusRef.current = false;
        requestAnimationFrame(() => {
          messageInputRef.current?.focus?.({ preventScroll: true });
          messageInputRef.current?.focus?.();
        });
      }
    };
    window.addEventListener("pointerup", handleWindowPointerUp);
    window.addEventListener("pointercancel", handleWindowPointerUp);
    return () => {
      window.removeEventListener("pointerup", handleWindowPointerUp);
      window.removeEventListener("pointercancel", handleWindowPointerUp);
    };
  }, [isRecording, messageInputRef, stopRecording]);

  useEffect(() => {
    const handleWindowFocus = () => {
      if (!keepFocusRef.current) return;
      keepFocusRef.current = false;
      requestAnimationFrame(() => {
        messageInputRef.current?.focus?.({ preventScroll: true });
        messageInputRef.current?.focus?.();
      });
    };
    window.addEventListener("focus", handleWindowFocus);
    return () => {
      window.removeEventListener("focus", handleWindowFocus);
    };
  }, [messageInputRef]);

  if (!activeChatId) return null;

  return (
    <form
      ref={composerRef}
      className="sticky bottom-0 z-30 flex shrink-0 flex-col gap-3 border-t border-slate-300/80 bg-white px-4 py-3 dark:border-emerald-500/20 dark:bg-slate-900 sm:px-6 md:static md:mt-auto"
      style={{
        bottom: isDesktop
          ? undefined
          : "max(0px, var(--mobile-bottom-offset, 0px))",
        paddingBottom: isDesktop
          ? "0.75rem"
          : "max(0.75rem, calc(env(safe-area-inset-bottom) + 0.5rem))",
      }}
      onSubmit={(event) => {
        if (!canSubmitMessage) {
          event.preventDefault();
          return;
        }
        handleSend(event);
        requestAnimationFrame(() => {
          if (!editTarget) {
            setMessageValue("");
          }
          applyTextareaSize({
            textareaEl: messageInputRef.current,
            maxTextareaHeight,
            composerEl: composerRef.current,
            onComposerResize,
            onComposerHeightChange,
          });
          if (!isDesktop) {
            messageInputRef.current?.focus();
          }
        });
      }}
      onKeyDown={(event) => {
        if (event.key !== "Enter" || event.shiftKey || event.isComposing)
          return;
        if (!pendingUploadFiles?.length) return;
        if (!isDesktop) return;
        const activeEl = document.activeElement;
        if (activeEl === messageInputRef.current) return;
        event.preventDefault();
        event.currentTarget?.requestSubmit?.();
      }}
    >
      {editTarget ? (
        <div className="rounded-2xl border border-emerald-200/80 bg-emerald-50/70 p-2 dark:border-emerald-500/30 dark:bg-slate-950/70">
          <div className="flex items-start gap-3 px-1">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-200">
              <Pencil size={20} className="icon-anim-sway" />
            </div>
            <div className="flex min-w-0 flex-1 flex-col">
              <span
                className={`truncate text-[11px] font-semibold text-emerald-700 dark:text-emerald-200 ${
                  hasPersian(
                    "Edit Message",
                  )
                    ? "font-fa"
                    : ""
                }`}
                dir="auto"
                style={{ unicodeBidi: "isolate" }}
                title="Edit Message"
              >
                Edit Message
              </span>
              <span
                className={`mt-1 min-w-0 truncate text-xs text-slate-600 dark:text-slate-300 ${
                  hasPersian(editBodyText) ? "font-fa" : ""
                }`}
                dir="auto"
                style={{ unicodeBidi: "isolate" }}
              >
                {editBodyText || "Message"}
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                onClearEdit?.();
                restoreComposerFocus();
              }}
              onPointerDown={(event) => {
                captureComposerFocus();
                if (!isDesktop) event.preventDefault();
              }}
              className="inline-flex h-9 w-9 items-center justify-center self-center rounded-full border border-rose-200 text-rose-600 transition hover:border-rose-300 hover:bg-rose-50 hover:shadow-[0_0_16px_rgba(244,63,94,0.2)] dark:border-rose-500/30 dark:text-rose-200 dark:hover:bg-rose-500/10"
              aria-label="Cancel edit"
            >
              <Close size={20} className="icon-anim-pop" />
            </button>
          </div>
        </div>
      ) : replyTarget ? (
        <div className="rounded-2xl border border-emerald-200/80 bg-emerald-50/70 p-2 dark:border-emerald-500/30 dark:bg-slate-950/70">
          <div className="flex items-start gap-3 px-1">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-200">
              <Reply size={20} className="icon-anim-sway" />
            </div>
            <div className="flex min-w-0 flex-1 flex-col">
              <span
                className={`truncate text-[11px] font-semibold text-emerald-700 dark:text-emerald-200 ${
                  hasPersian(
                    replyTarget.displayName || replyTarget.username || "message",
                  )
                    ? "font-fa"
                    : ""
                }`}
                dir="auto"
                style={{ unicodeBidi: "isolate" }}
                title={
                  replyTarget.displayName || replyTarget.username || "message"
                }
              >
                Reply to{" "}
                {replyTarget.displayName || replyTarget.username || "message"}
              </span>
              <span
                className="mt-1 flex min-w-0 items-baseline gap-1 text-xs text-slate-600 dark:text-slate-300"
                dir="ltr"
                style={{ unicodeBidi: "isolate" }}
              >
                {derivedReplyIcon === "voice" ? (
                  <Mic
                    size={12}
                    className="translate-y-[3px] shrink-0 text-slate-500 dark:text-slate-400"
                  />
                ) : derivedReplyIcon === "video" ? (
                  <Video
                    size={12}
                    className="translate-y-[3px] shrink-0 text-slate-500 dark:text-slate-400"
                  />
                ) : derivedReplyIcon === "image" ? (
                  <ImageIcon
                    size={12}
                    className="translate-y-[3px] shrink-0 text-slate-500 dark:text-slate-400"
                  />
                ) : derivedReplyIcon === "document" ? (
                  <File
                    size={12}
                    className="translate-y-[3px] shrink-0 text-slate-500 dark:text-slate-400"
                  />
                ) : null}
                <span
                  className={`min-w-0 truncate ${
                    hasPersian(resolvedReplyText) ? "font-fa" : ""
                  }`}
                  dir="auto"
                  style={{ unicodeBidi: "isolate" }}
                  dangerouslySetInnerHTML={{
                    __html: String(resolvedReplyHtml || ""),
                  }}
                />
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                onClearReply?.();
                restoreComposerFocus();
              }}
              onPointerDown={(event) => {
                captureComposerFocus();
                if (!isDesktop) event.preventDefault();
              }}
              className="inline-flex h-9 w-9 items-center justify-center self-center rounded-full border border-rose-200 text-rose-600 transition hover:border-rose-300 hover:bg-rose-50 hover:shadow-[0_0_16px_rgba(244,63,94,0.2)] dark:border-rose-500/30 dark:text-rose-200 dark:hover:bg-rose-500/10"
              aria-label="Cancel reply"
            >
              <Close size={20} className="icon-anim-pop" />
            </button>
          </div>
        </div>
      ) : null}
      {pendingVoiceMessage ? (
        <div className="rounded-2xl border border-emerald-200/80 bg-emerald-50/70 p-2 dark:border-emerald-500/30 dark:bg-slate-950/70">
          <div className="flex items-start gap-3 px-1">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-200">
              <Mic size={20} className="icon-anim-sway" />
            </div>
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-[11px] font-semibold text-emerald-700 dark:text-emerald-200">
                Voice message
              </span>
              <span className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                {formatDuration(pendingVoiceMessage.durationSeconds || 0)}
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                onClearPendingVoiceMessage?.();
                restoreComposerFocus();
              }}
              onPointerDown={(event) => {
                captureComposerFocus();
                if (!isDesktop) event.preventDefault();
              }}
              className="inline-flex h-9 w-9 items-center justify-center self-center rounded-full border border-rose-200 text-rose-600 transition hover:border-rose-300 hover:bg-rose-50 hover:shadow-[0_0_16px_rgba(244,63,94,0.2)] dark:border-rose-500/30 dark:text-rose-200 dark:hover:bg-rose-500/10"
              aria-label="Cancel voice message"
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
                    openFilePicker(mediaInputRef);
                  } else {
                    openFilePicker(documentInputRef);
                  }
                  restoreComposerFocus();
                }}
                onPointerDown={(event) => {
                  captureComposerFocus();
                  if (!isDesktop) event.preventDefault();
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
                onClick={() => {
                  onClearPendingUploads?.();
                  restoreComposerFocus();
                }}
                onPointerDown={(event) => {
                  captureComposerFocus();
                  if (!isDesktop) event.preventDefault();
                }}
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
              const isImage =
                !forceDocPreview && item.mimeType?.startsWith("image/");
              const isVideo =
                !forceDocPreview && item.mimeType?.startsWith("video/");
              return (
                <div
                  key={item.id}
                  className="relative overflow-hidden rounded-xl border border-emerald-200/70 bg-white/90 p-2 text-[11px] dark:border-emerald-500/30 dark:bg-slate-900/70"
                >
                  <button
                    type="button"
                    onClick={() => {
                      onRemovePendingUpload?.(item.id);
                      restoreComposerFocus();
                    }}
                    onPointerDown={(event) => {
                      captureComposerFocus();
                      if (!isDesktop) event.preventDefault();
                    }}
                    className="absolute right-1 top-1 z-20 inline-flex h-5 w-5 items-center justify-center rounded-full border border-rose-200 bg-white/90 text-rose-600 dark:border-rose-500/30 dark:bg-slate-900 dark:text-rose-200"
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
        <p className="text-xs text-rose-600 dark:text-rose-300">
          {uploadError}
        </p>
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
        {!isRecording ? (
          <>
            <div className="relative" ref={uploadMenuRef}>
              <button
                type="button"
                disabled={uploadBusy}
                onPointerDown={(event) => {
                  captureComposerFocus();
                  if (!isDesktop) event.preventDefault();
                }}
                onClick={() => {
                  if (uploadBusy) return;
                  setShowUploadMenu((prev) => !prev);
                  restoreComposerFocus();
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
                    onPointerDown={(event) => {
                      captureComposerFocus();
                      if (!isDesktop) event.preventDefault();
                    }}
                    onClick={() => {
                      openFilePicker(mediaInputRef);
                      setShowUploadMenu(false);
                    }}
                    className="flex w-full items-center gap-2 rounded-lg border border-transparent px-2 py-2 text-left text-xs text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-100 dark:text-emerald-200 dark:hover:border-emerald-500/30 dark:hover:bg-emerald-500/10"
                  >
                    <ImageIcon size={15} className="icon-anim-sway" />
                    Photo or Video
                  </button>
                  <button
                    type="button"
                    onPointerDown={(event) => {
                      captureComposerFocus();
                      if (!isDesktop) event.preventDefault();
                    }}
                    onClick={() => {
                      openFilePicker(documentInputRef);
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
                  restoreComposerFocus();
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
                  restoreComposerFocus();
                }}
              />
            </div>
            <textarea
              ref={messageInputRef}
              name="message"
              rows={1}
              placeholder="Type a message"
              value={messageValue}
              maxLength={
                Number.isFinite(Number(messageMaxChars))
                  ? messageMaxChars
                  : undefined
              }
              lang={composerHasPersian ? "fa" : "en"}
              dir="auto"
              onInput={(event) => {
                const value = event.currentTarget.value || "";
                setMessageValue(value);
                applyTextareaSize({
                  textareaEl: event.currentTarget,
                  maxTextareaHeight,
                  composerEl: composerRef.current,
                  onComposerResize,
                  onComposerHeightChange,
                });
                if (typeof onMessageInput === "function") {
                  onMessageInput(value);
                }
              }}
              onFocus={() => onComposerFocusChange?.(true)}
              onBlur={() => onComposerFocusChange?.(false)}
              onKeyDown={(event) => {
                if (!isDesktop) return;
                if (
                  event.key !== "Enter" ||
                  event.shiftKey ||
                  event.isComposing
                )
                  return;
                if (!canSubmitMessage) return;
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }}
              className={`chat-scroll min-w-0 flex-1 resize-none rounded-2xl border border-emerald-200 bg-white px-4 py-2 text-base text-slate-700 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-300/60 dark:border-emerald-500/30 dark:bg-slate-900 dark:text-slate-100 ${
                composerHasPersian ? "font-fa" : ""
              }`}
              style={{
                minHeight: "44px",
                maxHeight: `${maxTextareaHeight}px`,
                unicodeBidi: "plaintext",
                whiteSpace: "pre-wrap",
                wordBreak: "normal",
                overflowWrap: "break-word",
                overflowX: "hidden",
                textAlign: "start",
              }}
            />
          </>
        ) : (
          <div className="flex min-w-0 flex-1 items-center justify-between rounded-2xl border border-emerald-200 bg-white px-4 py-2 text-sm text-emerald-700 dark:border-emerald-500/30 dark:bg-slate-900 dark:text-emerald-200">
            <span className="text-xs font-semibold uppercase tracking-wide">
              Recording
            </span>
            <span className="flex items-center gap-2 text-sm font-semibold">
              <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-rose-500" />
              {formatDuration(recordingMs / 1000)}
            </span>
            <span className="w-12" />
          </div>
        )}
        <button
          type={micMode || isRecording ? "button" : "submit"}
          onPointerDown={(event) => {
            captureComposerFocus();
            if (!isDesktop) event.preventDefault();
            if (micMode) {
              handleMicPointerDown(event);
            }
          }}
          onPointerUp={isRecording ? handleMicPointerUp : undefined}
          onMouseDown={(event) => {
            if (!isDesktop) {
              event.preventDefault();
            }
          }}
          disabled={
            ((micMode || isRecording) && micDisabled) ||
            (!micMode && !isRecording && !canSubmitMessage)
          }
          className={`inline-flex h-11 items-center justify-center rounded-2xl px-4 py-2 text-sm font-semibold text-white shadow-lg transition disabled:cursor-not-allowed disabled:opacity-70 ${
            isRecording
              ? "bg-rose-500 shadow-rose-500/30 hover:bg-rose-400 hover:shadow-rose-500/40"
              : "bg-emerald-500 shadow-emerald-500/30 hover:bg-emerald-400 hover:shadow-emerald-500/40"
          }`}
        >
          {micMode || isRecording ? (
            <Mic className="icon-anim-pop" />
          ) : (
            editTarget ? (
              <Check className="icon-anim-slide" />
            ) : (
              <Send className="icon-anim-slide" />
            )
          )}
        </button>
      </div>
    </form>
  );
}
