import { createElement } from "react";
import { marked } from "marked";
import DOMPurify from "dompurify";
import { renderToStaticMarkup } from "react-dom/server";
import { Check, Copy } from "../icons/lucide.js";

const SCHEME_PATTERN = "[a-z][a-z0-9+.-]*";
const SIMPLE_LINK_PATTERN = /\b(?:https?:\/\/|www\.)\S+/i;
const SIMPLE_MENTION_PATTERN = /(^|[^a-z0-9._])@[a-z0-9._]{3,}/i;
const COMPLEX_MARKDOWN_INLINE_PATTERN = /[`*_#[\]()>|~]/;
const COMPLEX_MARKDOWN_LINE_PATTERN = /(^|\n)\s*(?:[-+*]\s+|\d+\.\s+|>)/;
const MAX_CACHE_ENTRIES = 350;
const MAX_CACHEABLE_TEXT_LENGTH = 8192;

const blockCache = new Map();
const inlineCache = new Map();
const inlinePlainCache = new Map();
let hljsModule = null;
let hljsLoadPromise = null;
const COPY_ICON_HTML = renderToStaticMarkup(
  createElement(Copy, {
    size: 14,
    strokeWidth: 2,
    "aria-hidden": "true",
    className: "sb-code-copy-lucide",
  }),
);
const CHECK_ICON_HTML = renderToStaticMarkup(
  createElement(Check, {
    size: 14,
    strokeWidth: 2.3,
    "aria-hidden": "true",
    className: "sb-code-copy-lucide",
  }),
);

const escapeHtml = (value) =>
  String(value || "").replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return char;
    }
  });

const normalizeMarkdownInput = (value) => {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const text = value.text ?? value.body;
    if (typeof text === "string") return text;
    return "";
  }
  if (value === null || value === undefined) return "";
  const str = String(value);
  return str === "[object Object]" ? "" : str;
};

const escapeMarkdownHtmlTags = (value) =>
  String(value || "").replace(/<\/?[A-Za-z][^>\n]*>/g, (match) =>
    escapeHtml(match),
  );

const containsHtmlLikeTag = (value) =>
  /<\/?[A-Za-z][^>\n]*>/.test(String(value || ""));

const containsFencedCode = (value) =>
  /(^|\n)\s*(```|~~~)/.test(String(value || ""));

const normalizeFenceIndentation = (value) =>
  String(value || "").replace(/(^|\n)[ \t]+(?=```|~~~)/g, "$1");

const coerceHtmlString = (value) => {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    if (typeof value.toString === "function") {
      const str = value.toString();
      if (str && str !== "[object Object]") return str;
    }
    if ("innerHTML" in value && typeof value.innerHTML === "string") {
      return value.innerHTML;
    }
    if ("textContent" in value && typeof value.textContent === "string") {
      return value.textContent;
    }
  }
  return "";
};

const normalizeLinkHref = (raw) => {
  const value = String(raw || "").trim();
  if (!value) return "";
  if (new RegExp(`^${SCHEME_PATTERN}:\\/\\/?`, "i").test(value)) return value;
  if (value.startsWith("/")) return value;
  if (value.startsWith("www.")) return `https://${value}`;
  if (/^[A-Za-z0-9.-]+\.[A-Za-z]{2,}(\/|$)/.test(value)) {
    return `https://${value}`;
  }
  return value;
};

const MAX_NESTING_DEPTH = 5;

const limitHtmlNesting = (html) => {
  const restrictedTags = new Set(["ul", "ol", "blockquote"]);
  let depth = 0;
  let result = "";
  let i = 0;

  while (i < html.length) {
    const tagMatch = html.slice(i).match(/^<\/?([a-z]+)[^>]*>/i);

    if (!tagMatch) {
      result += html[i];
      i++;
      continue;
    }

    const fullTag = tagMatch[0];
    const tagName = tagMatch[1].toLowerCase();
    const isOpenTag = !fullTag.startsWith("</");

    if (restrictedTags.has(tagName)) {
      if (isOpenTag) {
        depth++;
        if (depth <= MAX_NESTING_DEPTH) {
          result += fullTag;
        }
      } else {
        if (depth <= MAX_NESTING_DEPTH) {
          result += fullTag;
        }
        depth = Math.max(0, depth - 1);
      }
    } else {
      result += fullTag;
    }

    i += fullTag.length;
  }

  return result;
};

let configured = false;

const configureMarkdown = () => {
  if (configured) return;
  configured = true;

  const renderer = new marked.Renderer();
  renderer.link = (href, _title, text) => {
    const token = typeof href === "object" && href !== null ? href : null;
    const resolvedHref = token ? token.href : href;
    const resolvedText = token ? token.text : text;
    const safeHref = normalizeLinkHref(resolvedHref || "");
    const safeTextRaw = resolvedText || safeHref;
    const safeText =
      typeof safeTextRaw === "string" ? safeTextRaw : String(safeTextRaw || "");
    const safeHrefEscaped = escapeHtml(safeHref);
    const sameTabInvite = /\/invite\/[A-Za-z0-9]+/.test(safeHref);
    const target = sameTabInvite ? "_self" : "_blank";
    const rel = sameTabInvite ? "" : "noopener noreferrer";
    return `<a href="${safeHrefEscaped}" target="${target}" rel="${rel}" class="sb-link">${escapeHtml(safeText)}</a>`;
  };
  renderer.code = (code, infostring) => {
    const token = typeof code === "object" && code !== null ? code : null;
    const rawCodeText = token ? String(token.text || "") : String(code || "");
    const codeText = rawCodeText.replace(/\n+$/, "");
    const lang = token
      ? String(token.lang || "")
          .trim()
          .split(/\s+/)[0]
      : String(infostring || "")
          .trim()
          .split(/\s+/)[0];
    let highlighted = escapeHtml(codeText);
    const hljs = hljsModule;
    if (hljs) {
      if (lang && hljs.getLanguage(lang)) {
        highlighted = hljs.highlight(codeText, { language: lang }).value;
      } else {
        highlighted = hljs.highlightAuto(codeText).value;
      }
    } else if (codeText.length > 24 || lang) {
      void loadHighlighter();
    }
    const safeLang = lang ? `language-${escapeHtml(lang)}` : "language-plain";
    const langLabel = escapeHtml(lang || "text");
    return `<div class="sb-code-block" data-copyable="1"><div class="sb-code-header"><span class="sb-code-lang">${langLabel}</span><button type="button" class="sb-code-copy" aria-label="Copy code" data-state="idle"><span class="sb-code-copy-icons" aria-hidden="true"><span class="sb-code-copy-icon-host sb-code-copy-icon-copy-host">${COPY_ICON_HTML}</span><span class="sb-code-copy-icon-host sb-code-copy-icon-check-host">${CHECK_ICON_HTML}</span></span><span class="sb-sr-only">Copy code</span></button></div><pre class="sb-code"><code class="hljs ${safeLang}">${highlighted}</code></pre></div>`;
  };

  const autoLinkExtension = {
    name: "autoLink",
    level: "inline",
    start(src) {
      const match = src.match(
        new RegExp(`(?:${SCHEME_PATTERN}:\\/\\/|www\\.)`, "i"),
      );
      return match ? match.index : undefined;
    },
    tokenizer(src) {
      const match = src.match(
        new RegExp(`^(?:${SCHEME_PATTERN}:\\/\\/|www\\.)[^\\s<]+`, "i"),
      );
      if (match) {
        return {
          type: "autoLink",
          raw: match[0],
          text: match[0],
          href: normalizeLinkHref(match[0]),
        };
      }
      return undefined;
    },
    renderer(token) {
      const safeHref = escapeHtml(token.href);
      const safeText = escapeHtml(token.text);
      return `<a href="${safeHref}" target="_blank" rel="noopener noreferrer" class="sb-link" data-auto-link="1">${safeText}</a>`;
    },
  };

  const mentionExtension = {
    name: "mention",
    level: "inline",
    start(src) {
      const index = src.indexOf("@");
      return index >= 0 ? index : undefined;
    },
    tokenizer(src) {
      const match = src.match(/^@([a-z0-9._]{3,})/i);
      if (match) {
        return {
          type: "mention",
          raw: match[0],
          username: match[1],
        };
      }
      return undefined;
    },
    renderer(token) {
      const username = String(token.username || "").toLowerCase();
      if (!username) return token.raw;
      return `<span class="sb-mention sb-mention-active" data-mention="${escapeHtml(username)}" dir="ltr">@${escapeHtml(token.username)}</span>`;
    },
  };

  marked.setOptions({
    gfm: true,
    breaks: true,
    headerIds: false,
    mangle: false,
  });
  marked.use({ renderer, extensions: [autoLinkExtension, mentionExtension] });
};

const sanitize = (html) => {
  const cleaned = DOMPurify.sanitize(String(html || ""), {
    ALLOW_DATA_ATTR: true,
    ADD_ATTR: [
      "target",
      "rel",
      "class",
      "role",
      "tabindex",
      "aria-label",
      "aria-hidden",
      "viewBox",
      "fill",
      "stroke",
      "stroke-width",
      "stroke-linecap",
      "stroke-linejoin",
      "width",
      "height",
      "xmlns",
      "data-auto-link",
      "data-mention",
      "data-copyable",
      "data-state",
    ],
    ADD_TAGS: [
      "button",
      "div",
      "em",
      "strong",
      "code",
      "pre",
      "blockquote",
      "ul",
      "ol",
      "li",
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "span",
      "svg",
      "path",
      "rect",
      "line",
      "polyline",
      "polygon",
      "circle",
    ],
    RETURN_TRUSTED_TYPE: false,
  });
  return coerceHtmlString(cleaned);
};

const cleanupMarkdownHtml = (html) =>
  String(html || "")
    .replace(/(<p>(\s|&nbsp;|<br\s*\/?>)*<\/p>\s*)+/gi, "")
    .replace(/^(<p>(\s|&nbsp;|<br\s*\/?>)*<\/p>\s*)+/gi, "")
    .replace(/(<p>(\s|&nbsp;|<br\s*\/?>)*<\/p>\s*)+$/gi, "")
    .replace(/(<br\s*\/?>\s*)+$/gi, "")
    .trim();

const fallbackBlockHtml = (raw) =>
  escapeHtml(raw).replace(/\n/g, "<br />");

const fallbackInlineHtml = (raw) => escapeHtml(raw);

const isObjectStringFailure = (value) =>
  String(value || "").trim() === "[object Object]";

const loadHighlighter = () => {
  if (hljsModule) return Promise.resolve(hljsModule);
  if (hljsLoadPromise) return hljsLoadPromise;
  hljsLoadPromise = import("highlight.js/lib/common")
    .then((mod) => {
      hljsModule = mod?.default || mod || null;
      return hljsModule;
    })
    .catch(() => null)
    .finally(() => {
      hljsLoadPromise = null;
    });
  return hljsLoadPromise;
};

export const preloadMarkdownHighlighter = () => {
  void loadHighlighter();
};

const shouldUseMarkdownParser = (raw) => {
  if (!raw) return false;
  if (SIMPLE_LINK_PATTERN.test(raw)) return true;
  if (SIMPLE_MENTION_PATTERN.test(raw)) return true;
  if (COMPLEX_MARKDOWN_INLINE_PATTERN.test(raw)) return true;
  if (COMPLEX_MARKDOWN_LINE_PATTERN.test(raw)) return true;
  return false;
};

const readFromCache = (cache, key) => {
  if (!key || key.length > MAX_CACHEABLE_TEXT_LENGTH) return null;
  if (!cache.has(key)) return null;
  const value = cache.get(key);
  cache.delete(key);
  cache.set(key, value);
  return value;
};

const writeToCache = (cache, key, value) => {
  if (!key || key.length > MAX_CACHEABLE_TEXT_LENGTH) return value;
  cache.set(key, value);
  if (cache.size > MAX_CACHE_ENTRIES) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey !== undefined) cache.delete(oldestKey);
  }
  return value;
};

export const renderMarkdownBlock = (text) => {
  const raw = normalizeMarkdownInput(text);
  if (!raw) return "";
  const cached = readFromCache(blockCache, raw);
  if (cached !== null) return cached;
  const normalizedRaw = normalizeFenceIndentation(raw);
  const hasFencedCode = containsFencedCode(normalizedRaw);
  if (containsHtmlLikeTag(normalizedRaw) && !hasFencedCode) {
    return writeToCache(blockCache, raw, fallbackBlockHtml(raw));
  }
  const safeRaw = hasFencedCode
    ? normalizedRaw
    : escapeMarkdownHtmlTags(normalizedRaw);
  if (!hasFencedCode && !shouldUseMarkdownParser(safeRaw)) {
    return writeToCache(blockCache, raw, fallbackBlockHtml(safeRaw));
  }
  configureMarkdown();
  const parsed = marked.parse(safeRaw);
  const parsedHtml = typeof parsed === "string" ? parsed : String(parsed || "");
  const limited = limitHtmlNesting(parsedHtml);
  const cleaned = cleanupMarkdownHtml(sanitize(limited));
  if (isObjectStringFailure(parsedHtml) || isObjectStringFailure(cleaned)) {
    return writeToCache(blockCache, raw, fallbackBlockHtml(safeRaw));
  }
  return writeToCache(blockCache, raw, cleaned);
};

export const renderMarkdownInline = (text) => {
  const raw = normalizeMarkdownInput(text);
  if (!raw) return "";
  const cached = readFromCache(inlineCache, raw);
  if (cached !== null) return cached;
  if (containsHtmlLikeTag(raw)) {
    return writeToCache(
      inlineCache,
      raw,
      fallbackInlineHtml(raw).replace(/\n/g, "<br />"),
    );
  }
  const safeRaw = escapeMarkdownHtmlTags(raw);
  if (!shouldUseMarkdownParser(safeRaw)) {
    return writeToCache(
      inlineCache,
      raw,
      fallbackInlineHtml(safeRaw).replace(/\n/g, "<br />"),
    );
  }
  configureMarkdown();
  const parsed = marked.parseInline(safeRaw);
  const parsedHtml = typeof parsed === "string" ? parsed : String(parsed || "");
  const limited = limitHtmlNesting(parsedHtml);
  const cleaned = cleanupMarkdownHtml(sanitize(limited));
  if (isObjectStringFailure(parsedHtml) || isObjectStringFailure(cleaned)) {
    return writeToCache(inlineCache, raw, fallbackInlineHtml(safeRaw));
  }
  return writeToCache(inlineCache, raw, cleaned);
};

export const renderMarkdownInlinePlain = (text) => {
  const raw = normalizeMarkdownInput(text);
  if (!raw) return "";
  const cached = readFromCache(inlinePlainCache, raw);
  if (cached !== null) return cached;
  if (containsHtmlLikeTag(raw)) {
    const plain = escapeHtml(raw).replace(/\r?\n+/g, " ").replace(/\s+/g, " ").trim();
    return writeToCache(inlinePlainCache, raw, plain);
  }
  if (!shouldUseMarkdownParser(raw)) {
    const simple = escapeHtml(raw).replace(/\r?\n+/g, " ").replace(/\s+/g, " ").trim();
    return writeToCache(inlinePlainCache, raw, simple);
  }
  const html = renderMarkdownInline(raw);
  const plain = html
    .replace(/<a\b[^>]*>(.*?)<\/a>/gi, "$1")
    .replace(/<span\b[^>]*data-mention=[^>]*>(.*?)<\/span>/gi, "$1")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/\r?\n+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return writeToCache(inlinePlainCache, raw, plain);
};
