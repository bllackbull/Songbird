export const formatBytesAsMb = (bytes) =>
  `${Math.round(Number(bytes || 0) / (1024 * 1024))} MB`;

export const parseServerDate = (value) => {
  if (!value) return new Date();
  if (typeof value === "string") {
    const normalized = value.includes("T") ? value : value.replace(" ", "T");
    const hasExplicitTimezone = /(?:Z|[+-]\\d{2}:?\\d{2})$/i.test(normalized);
    return hasExplicitTimezone ? new Date(normalized) : new Date(`${normalized}Z`);
  }
  return new Date(value);
};

export const formatDayLabel = (dateValue) => {
  const now = new Date();
  const date = parseServerDate(dateValue);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round(
    (startOfToday - startOfDate) / (1000 * 60 * 60 * 24),
  );

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays > 1 && diffDays < 7) {
    return date.toLocaleDateString(undefined, { weekday: "long" });
  }
  return date.toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
  });
};

export const formatTime = (dateValue) =>
  parseServerDate(dateValue).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

export const formatChatCardTimestamp = (dateValue) => {
  const date = parseServerDate(dateValue);
  if (!Number.isFinite(date.getTime())) return "";

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.floor((startOfToday - startOfDate) / (1000 * 60 * 60 * 24));

  if (diffDays <= 0) {
    return formatTime(date);
  }

  if (diffDays < 7) {
    const shortDay = date.toLocaleDateString("en-US", { weekday: "short" }).slice(0, 3);
    return shortDay;
  }

  if (date.getFullYear() === now.getFullYear()) {
    return date.toLocaleDateString("en-US", {
      month: "2-digit",
      day: "2-digit",
    });
  }

  return date.toLocaleDateString("en-US", {
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
  });
};
