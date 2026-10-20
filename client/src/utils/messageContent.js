export const FILE_SUMMARY_PATTERN =
  /^Sent (a media file|a file|a photo|a video|a document|a voice message|\d+ (files|photos|videos|documents|media files|voice messages))$/i;

const CALL_LOG_BODY_PATTERN =
  /^\[\[call:(voice|video):(outgoing|cancelled|failed|connected)(?::(\d+))?\]\]$/i;

export const extractMessageBodyText = (value) => {
  if (typeof value === "string") {
    return value === "[object Object]" ? "" : value;
  }
  if (value && typeof value === "object") {
    return String(value.text || value.body || "");
  }
  return String(value ?? "");
};

export const parseCallLogBody = (body) => {
  const raw = extractMessageBodyText(body).trim();
  const match = raw.match(CALL_LOG_BODY_PATTERN);
  if (!match) return null;
  return {
    type: match[1].toLowerCase(),
    status: match[2].toLowerCase(),
    duration: match[3] == null ? null : Math.max(0, parseInt(match[3], 10)),
  };
};

export const isCallLogBody = (body) => parseCallLogBody(body) !== null;

export const getCallLogLabel = (callLog, isOwnMessage) => {
  if (!callLog) return "";
  if (callLog.status === "cancelled") return "Cancelled call";
  if (callLog.status === "failed") return "Failed call";
  if (callLog.status === "outgoing") return "Outgoing call";
  return isOwnMessage ? "Outgoing call" : "Incoming call";
};

export const getMessageFiles = (message) =>
  Array.isArray(message?.files) ? message.files : [];

export const hasMessageText = (message) => {
  const bodyText = extractMessageBodyText(message?.body).trim();
  if (!bodyText) return false;
  if (bodyText.startsWith("sb-enc-v1:")) return false;
  if (isCallLogBody(bodyText)) return false;
  const files = getMessageFiles(message);
  if (!files.length) return true;
  return !FILE_SUMMARY_PATTERN.test(bodyText);
};
