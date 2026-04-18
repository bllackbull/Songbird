import { normalizeMessageBody } from "./chatCache.js";

export const truncateText = (text, maxChars) => {
  const value = String(text || "");
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars).trimEnd()}...`;
};

const isDocumentModeFiles = (files = [], uploadMode = "") => {
  const normalizedMode = String(uploadMode || "").toLowerCase();
  if (normalizedMode === "document") return true;
  const nonAudioFiles = (Array.isArray(files) ? files : []).filter((file) => {
    const mimeType = String(file?.mimeType || "").toLowerCase();
    return !mimeType.startsWith("audio/");
  });
  return (
    nonAudioFiles.length > 0 &&
    nonAudioFiles.every(
      (file) => String(file?.kind || "").toLowerCase() === "document",
    )
  );
};

const getFileSummaryMeta = (files = [], uploadMode = "") => {
  if (!Array.isArray(files) || files.length === 0) return "";
  const videoCount = files.filter((file) =>
    String(file?.mimeType || "")
      .toLowerCase()
      .startsWith("video/"),
  ).length;
  const imageCount = files.filter((file) =>
    String(file?.mimeType || "")
      .toLowerCase()
      .startsWith("image/"),
  ).length;
  const audioCount = files.filter((file) =>
    String(file?.mimeType || "")
      .toLowerCase()
      .startsWith("audio/"),
  ).length;
  const docCount = Math.max(
    0,
    files.length - videoCount - imageCount - audioCount,
  );
  const documentMode = isDocumentModeFiles(files, uploadMode);
  const activeTypes = [
    audioCount > 0 ? "audio" : null,
    videoCount > 0 ? "video" : null,
    imageCount > 0 ? "image" : null,
    docCount > 0 ? "document" : null,
  ].filter(Boolean);
  const hasMixedAudio = audioCount > 0 && files.length > audioCount;
  const hasMixedMediaOnly =
    activeTypes.length === 2 &&
    imageCount > 0 &&
    videoCount > 0 &&
    audioCount === 0 &&
    docCount === 0;

  if (files.length === 1) {
    if (documentMode && audioCount === 0) {
      return { text: "Sent a document", icon: "document" };
    }
    if (videoCount === 1) return { text: "Sent a video", icon: "video" };
    if (imageCount === 1) return { text: "Sent a photo", icon: "image" };
    if (audioCount === 1) {
      return { text: "Sent a voice message", icon: "voice" };
    }
    return { text: "Sent a document", icon: "document" };
  }
  if (audioCount > 0 && videoCount === 0 && imageCount === 0 && docCount === 0) {
    return {
      text: `Sent ${audioCount} voice message${audioCount > 1 ? "s" : ""}`,
      icon: "voice",
    };
  }
  if (videoCount > 0 && imageCount === 0 && docCount === 0) {
    return {
      text: `Sent ${videoCount} video${videoCount > 1 ? "s" : ""}`,
      icon: "video",
    };
  }
  if (imageCount > 0 && videoCount === 0 && docCount === 0) {
    return {
      text: `Sent ${imageCount} photo${imageCount > 1 ? "s" : ""}`,
      icon: "image",
    };
  }
  if (docCount > 0 && imageCount === 0 && videoCount === 0) {
    return {
      text: `Sent ${docCount} document${docCount > 1 ? "s" : ""}`,
      icon: "document",
    };
  }
  if (documentMode || hasMixedAudio || activeTypes.length > 2 || (docCount > 0 && activeTypes.length > 1)) {
    return {
      text: `Sent ${files.length} document${files.length > 1 ? "s" : ""}`,
      icon: "document",
    };
  }
  if (hasMixedMediaOnly) {
    return {
      text: `Sent ${files.length} media files`,
      icon: "image",
    };
  }
  return {
    text: `Sent ${files.length} document${files.length > 1 ? "s" : ""}`,
    icon: "document",
  };
};

export const summarizeFiles = (files = [], uploadMode = "") => {
  const summary = getFileSummaryMeta(files, uploadMode);
  return typeof summary === "string" ? summary : summary?.text || "";
};

export const resolveReplyPreview = (msg) => {
  if (!msg) return { text: "", icon: null };
  const rawBody = normalizeMessageBody(msg.body).trim();
  const files = Array.isArray(msg.files)
    ? msg.files
    : Array.isArray(msg._files)
      ? msg._files
      : [];
  const videoCount = files.filter((file) =>
    String(file?.mimeType || "")
      .toLowerCase()
      .startsWith("video/"),
  ).length;
  const imageCount = files.filter((file) =>
    String(file?.mimeType || "")
      .toLowerCase()
      .startsWith("image/"),
  ).length;
  const audioCount = files.filter((file) =>
    String(file?.mimeType || "")
      .toLowerCase()
      .startsWith("audio/"),
  ).length;
  const docCount = Math.max(
    0,
    files.length - videoCount - imageCount - audioCount,
  );
  const summaryMeta = getFileSummaryMeta(files);
  const icon =
    typeof summaryMeta === "string" ? (docCount > 0 ? "document" : null) : summaryMeta?.icon || null;
  let summary =
    typeof summaryMeta === "string" ? summaryMeta : summaryMeta?.text || "";
  if (!summary && /^Sent a media file$/i.test(rawBody)) {
    if (videoCount === 1 && imageCount === 0) summary = "Sent a video";
    if (imageCount === 1 && videoCount === 0) summary = "Sent a photo";
  }
  const isGenericBody =
    !rawBody ||
    /^Sent (a media file|a file|a document|a voice message|\d+ (files|documents|media files|voice messages))$/i.test(
      rawBody,
    );
  if (
    icon === "image" &&
    /^Sent \d+ media files$/i.test(summary || "") &&
    (isGenericBody || /^Sent \d+ files$/i.test(rawBody))
  ) {
    summary = `Sent ${files.length} media files`;
  }
  const text =
    isGenericBody && summary ? summary : rawBody || summary || "Message";
  return { text, icon: icon || (docCount > 0 ? "document" : null) };
};
