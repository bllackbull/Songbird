export const FILE_SUMMARY_PATTERN =
  /^Sent (a media file|a file|a photo|a video|a document|a voice message|\d+ (files|photos|videos|documents|media files|voice messages))$/i;

export const extractMessageBodyText = (value) => {
  if (typeof value === "string") {
    return value === "[object Object]" ? "" : value;
  }
  if (value && typeof value === "object") {
    return String(value.text || value.body || "");
  }
  return String(value ?? "");
};

export const getMessageFiles = (message) =>
  Array.isArray(message?.files) ? message.files : [];

export const hasMessageText = (message) => {
  const bodyText = extractMessageBodyText(message?.body).trim();
  if (!bodyText) return false;
  const files = getMessageFiles(message);
  if (!files.length) return true;
  return !FILE_SUMMARY_PATTERN.test(bodyText);
};
