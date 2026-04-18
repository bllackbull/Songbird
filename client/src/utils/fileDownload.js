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

export const downloadMessageFile = (file) => {
  const url = getMessageFileDownloadUrl(file);
  if (!url || typeof document === "undefined") return false;
  const link = document.createElement("a");
  link.href = url;
  link.download = getMessageFileDownloadName(file);
  link.rel = "noopener noreferrer";
  link.target = "_blank";
  document.body.appendChild(link);
  link.click();
  link.remove();
  return true;
};

export const downloadMessageFiles = (files = []) => {
  const list = Array.isArray(files) ? files.filter((file) => file?.url) : [];
  list.forEach((file, index) => {
    window.setTimeout(() => {
      downloadMessageFile(file);
    }, index * 140);
  });
  return list.length;
};
