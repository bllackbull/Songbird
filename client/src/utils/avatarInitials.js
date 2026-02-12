export function getAvatarInitials(value, fallback = "S") {
  const text = String(value || "").trim();
  if (!text) return fallback;
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length) return fallback;

  const first = Array.from(words[0])[0] || "";
  const second = words.length > 1 ? Array.from(words[1])[0] || "" : "";
  const initials = `${first}${second}`.trim();

  return initials ? initials.toLocaleUpperCase() : fallback;
}
