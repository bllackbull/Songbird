import { marked } from "marked";
import DOMPurify from "dompurify";
import hljs from "highlight.js/lib/common";

const SCHEME_PATTERN = "[a-z][a-z0-9+.-]*";

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
    let highlighted = "";
    if (lang && hljs.getLanguage(lang)) {
      highlighted = hljs.highlight(codeText, { language: lang }).value;
    } else {
      highlighted = hljs.highlightAuto(codeText).value;
    }
    const safeLang = lang ? `language-${escapeHtml(lang)}` : "language-plain";
    return `<pre class="sb-markdown-code"><code class="hljs ${safeLang}">${highlighted}</code></pre>`;
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
      return `<span class="sb-mention" data-mention="${escapeHtml(username)}">@${escapeHtml(token.username)}</span>`;
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

const sanitize = (html) =>
  DOMPurify.sanitize(html, {
    ALLOW_DATA_ATTR: true,
    ADD_ATTR: ["target", "rel", "class", "data-auto-link", "data-mention"],
    ADD_TAGS: [
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
    ],
  });

const cleanupMarkdownHtml = (html) =>
  String(html || "")
    .replace(/(<p>(\s|&nbsp;|<br\s*\/?>)*<\/p>\s*)+/gi, "")
    .replace(/^(<p>(\s|&nbsp;|<br\s*\/?>)*<\/p>\s*)+/gi, "")
    .replace(/(<p>(\s|&nbsp;|<br\s*\/?>)*<\/p>\s*)+$/gi, "")
    .replace(/(<br\s*\/?>\s*)+$/gi, "")
    .trim();

export const renderMarkdownBlock = (text) => {
  configureMarkdown();
  const raw = String(text || "");
  if (!raw) return "";
  const parsed = marked.parse(raw);
  const limited = limitHtmlNesting(parsed);
  return cleanupMarkdownHtml(sanitize(limited));
};

export const renderMarkdownInline = (text) => {
  configureMarkdown();
  const raw = String(text || "");
  if (!raw) return "";
  const parsed = marked.parseInline(raw);
  const limited = limitHtmlNesting(parsed);
  return cleanupMarkdownHtml(sanitize(limited));
};

export const renderMarkdownInlinePlain = (text) => {
  const html = renderMarkdownInline(text);
  return html
    .replace(/<a\b[^>]*>(.*?)<\/a>/gi, "$1")
    .replace(/<span\b[^>]*data-mention=[^>]*>(.*?)<\/span>/gi, "$1");
};
