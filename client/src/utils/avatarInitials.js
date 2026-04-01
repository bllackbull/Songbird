const PERSIAN_REGEX =
  /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
const LATIN_REGEX = /[A-Za-z]/;
const LATIN_CHAR_REGEX = /^[A-Za-z]$/;

const getFirstChar = (text) => {
  const chars = Array.from(String(text || ""));
  return chars.find((char) => String(char || "").trim().length > 0) || "";
};

const toUpperLatin = (char) => {
  const value = String(char || "");
  if (!LATIN_CHAR_REGEX.test(value)) return value;
  return value.toUpperCase();
};

const getWordScript = (text) => {
  const value = String(text || "");
  const hasPersian = PERSIAN_REGEX.test(value);
  const hasLatin = LATIN_REGEX.test(value);
  if (hasPersian && hasLatin) return "mixed";
  if (hasPersian) return "persian";
  if (hasLatin) return "latin";
  return "other";
};

export function getAvatarInitials(value, fallback = "S") {
  const text = String(value || "").trim();
  if (!text) return fallback;
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    const firstWord = words[0];
    const secondWord = words[1];
    const firstChar = getFirstChar(firstWord);
    const secondChar = getFirstChar(secondWord);
    if (!firstChar) return fallback;
    const firstScript = getWordScript(firstWord);
    const secondScript = getWordScript(secondWord);
    if (
      firstScript === "mixed" ||
      secondScript === "mixed" ||
      (firstScript !== "other" &&
        secondScript !== "other" &&
        firstScript !== secondScript)
    ) {
      return firstChar || fallback;
    }
    const left = toUpperLatin(firstChar);
    const right = toUpperLatin(secondChar || "");
    return `${left}${right}` || fallback;
  }
  const firstChar = getFirstChar(text);
  return toUpperLatin(firstChar) || fallback;
}
