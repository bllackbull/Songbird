import { normalizeMessageBody } from "./chatCache.js";

export const truncateText = (text, maxChars) => {
  const value = String(text || "");
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars).trimEnd()}...`;
};

export const summarizeFiles = (files = []) => {
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
  if (files.length === 1) {
    if (videoCount === 1) return "Sent a video";
    if (imageCount === 1) return "Sent a photo";
    if (audioCount === 1) return "Sent a voice message";
    return "Sent a document";
  }
  if (
    audioCount > 0 &&
    videoCount === 0 &&
    imageCount === 0 &&
    docCount === 0
  ) {
    return `Sent ${audioCount} voice message${audioCount > 1 ? "s" : ""}`;
  }
  if (videoCount > 0 && imageCount === 0 && docCount === 0) {
    return `Sent ${videoCount} video${videoCount > 1 ? "s" : ""}`;
  }
  if (imageCount > 0 && videoCount === 0 && docCount === 0) {
    return `Sent ${imageCount} photo${imageCount > 1 ? "s" : ""}`;
  }
  if (docCount > 0 && imageCount === 0 && videoCount === 0) {
    return `Sent ${docCount} document${docCount > 1 ? "s" : ""}`;
  }
  if (imageCount > 0 && videoCount > 0 && docCount === 0) {
    return `Sent ${files.length} media files`;
  }
  return `Sent ${files.length} files`;
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
  const isMixedMedia = imageCount > 0 && videoCount > 0 && docCount === 0;
  const hasVoiceOnly =
    audioCount > 0 && videoCount === 0 && imageCount === 0 && docCount === 0;
  const icon = hasVoiceOnly
    ? "voice"
    : isMixedMedia
      ? "image"
      : videoCount > 0
        ? "video"
        : imageCount > 0
          ? "image"
          : files.length
            ? "document"
            : null;
  let summary = summarizeFiles(files);
  if (!summary && /^Sent a media file$/i.test(rawBody)) {
    if (videoCount === 1 && imageCount === 0) summary = "Sent a video";
    if (imageCount === 1 && videoCount === 0) summary = "Sent a photo";
  }
  const isGenericBody =
    !rawBody ||
    /^Sent (a media file|a document|a voice message|\d+ files|\d+ media files|\d+ voice messages)$/i.test(
      rawBody,
    );
  if (isMixedMedia && (isGenericBody || /^Sent \d+ files$/i.test(rawBody))) {
    summary = `Sent ${files.length} media files`;
  }
  const text =
    isGenericBody && summary ? summary : rawBody || summary || "Message";
  return { text, icon: icon || (docCount > 0 ? "document" : null) };
};
