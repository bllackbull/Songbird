export function hasPersian(value) {
  if (!value) return false;
  return /[\u0600-\u06FF]/.test(String(value));
}

