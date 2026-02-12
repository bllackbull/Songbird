function hexToRgb(hex) {
  if (!hex || typeof hex !== "string") return null;
  const normalized = hex.trim().replace("#", "");
  if (normalized.length !== 6 || /[^0-9a-f]/i.test(normalized)) return null;
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  return { r, g, b };
}

function toLinear(channel) {
  const value = channel / 255;
  if (value <= 0.03928) return value / 12.92;
  return ((value + 0.055) / 1.055) ** 2.4;
}

export function getAvatarTextColor(backgroundColor) {
  const rgb = hexToRgb(backgroundColor);
  if (!rgb) return "#ffffff";
  const luminance =
    0.2126 * toLinear(rgb.r) +
    0.7152 * toLinear(rgb.g) +
    0.0722 * toLinear(rgb.b);
  return luminance > 0.56 ? "#0f172a" : "#ffffff";
}

export function getAvatarStyle(backgroundColor, fallback = "#10b981") {
  const color = backgroundColor || fallback;
  return {
    backgroundColor: color,
    color: getAvatarTextColor(color),
  };
}
