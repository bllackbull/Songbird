export const isCrossOriginUrl = (url) => {
  if (typeof window === "undefined" || !window.location) return false;
  try {
    return new URL(url, window.location.href).origin !== window.location.origin;
  } catch {
    return true;
  }
};

export const saveMedia = async (url, filename) => {
  const href = String(url || "").trim();
  const name = String(filename || "").trim() || "media";
  if (!href || typeof document === "undefined") return false;

  let finalHref = href;
  let revokeObjectUrl = null;
  if (isCrossOriginUrl(href)) {
    try {
      const res = await fetch(href, { credentials: "omit", mode: "cors" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      finalHref = URL.createObjectURL(blob);
      revokeObjectUrl = finalHref;
    } catch {
      // Fall back to direct navigation when the blob fetch fails.
    }
  }

  const link = document.createElement("a");
  link.href = finalHref;
  link.download = name;
  link.rel = "noopener noreferrer";
  link.target = "_blank";
  document.body.appendChild(link);
  link.click();
  link.remove();

  if (revokeObjectUrl) {
    window.setTimeout(() => URL.revokeObjectURL(revokeObjectUrl), 60_000);
  }
  return true;
};

const buildFileDownloadUrl = (url) => {
  const raw = String(url || "").trim();
  if (!raw) return "";
  return `${raw}${raw.includes("?") ? "&" : "?"}download=1`;
};

export const getMessageFileDownloadUrl = (file) =>
  buildFileDownloadUrl(file?.downloadUrl || file?.url || "");

export const getMessageFileDownloadName = (file) =>
  String(
    file?.name ||
      file?.originalName ||
      file?.original_name ||
      file?.storedName ||
      file?.stored_name ||
      "media",
  ).trim() || "media";

export const downloadMessageFile = async (file) => {
  const url = getMessageFileDownloadUrl(file);
  if (!url) return false;
  return saveMedia(url, getMessageFileDownloadName(file));
};

export const downloadMessageFiles = (files = []) => {
  const list = Array.isArray(files) ? files.filter((file) => file?.url) : [];
  list.forEach((file, index) => {
    window.setTimeout(() => {
      void downloadMessageFile(file);
    }, index * 140);
  });
  return list.length;
};