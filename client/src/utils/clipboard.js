export const CLIPBOARD_COPY_EVENT = "songbird:clipboard-copy";

const dispatchCopyEvent = (text) => {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(
      new CustomEvent(CLIPBOARD_COPY_EVENT, {
        detail: { text: String(text || "") },
      }),
    );
  } catch {
    // Ignore event dispatch issues.
  }
};

export async function copyTextToClipboard(value, options = {}) {
  const text = String(value ?? "");
  const shouldNotify = options?.notify !== false;
  if (!text) return false;

  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      if (shouldNotify) dispatchCopyEvent(text);
      return true;
    }
  } catch {
    // Fall through to the legacy copy path.
  }

  try {
    const el = document.createElement("textarea");
    el.value = text;
    el.setAttribute("readonly", "");
    el.style.position = "absolute";
    el.style.left = "-9999px";
    document.body.appendChild(el);
    el.select();
    const copied = document.execCommand("copy");
    document.body.removeChild(el);
    if (copied && shouldNotify) {
      dispatchCopyEvent(text);
    }
    return copied;
  } catch {
    return false;
  }
}
