function applyInlineMarkdown(input) {
  return input
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-sky-500 underline break-all">$1</a>')
    .replace(/(^|\s)(https?:\/\/[^\s<]+)/g, '$1<a href="$2" target="_blank" rel="noopener noreferrer" class="text-sky-500 underline break-all">$2</a>')
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/~~([^~]+)~~/g, "<del>$1</del>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
}

export function markdownToHtml(markdown = "") {
  // allow inline HTML, but block executable script tags
  const cleaned = markdown.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "");
  const lines = cleaned.split(/\r?\n/);
  const out = [];
  let inList = false;
  let inOrderedList = false;
  let inCodeBlock = false;

  const closeLists = () => {
    if (inList) {
      out.push("</ul>");
      inList = false;
    }
    if (inOrderedList) {
      out.push("</ol>");
      inOrderedList = false;
    }
  };

  lines.forEach((line) => {
    const trimmed = line.trim();
    if (trimmed.startsWith("```")) {
      closeLists();
      if (inCodeBlock) {
        out.push("</code></pre>");
        inCodeBlock = false;
      } else {
        out.push('<pre class="overflow-x-auto rounded-lg bg-slate-100 p-3 dark:bg-slate-900"><code>');
        inCodeBlock = true;
      }
      return;
    }
    if (inCodeBlock) {
      out.push(line.replaceAll("<", "&lt;").replaceAll(">", "&gt;"));
      return;
    }

    if (!trimmed) {
      closeLists();
      out.push('<div class="h-2"></div>');
      return;
    }
    if (trimmed.startsWith("> ")) {
      closeLists();
      out.push(`<blockquote class="border-l-4 border-emerald-300 pl-3 text-slate-600 dark:text-slate-300">${applyInlineMarkdown(trimmed.slice(2))}</blockquote>`);
      return;
    }
    if (trimmed.startsWith("- ")) {
      if (!inList) {
        if (inOrderedList) {
          out.push("</ol>");
          inOrderedList = false;
        }
        out.push('<ul class="list-disc pl-5 space-y-1">');
        inList = true;
      }
      out.push(`<li>${applyInlineMarkdown(trimmed.slice(2))}</li>`);
      return;
    }
    const orderedMatch = trimmed.match(/^(\d+)\.\s+(.*)$/);
    if (orderedMatch) {
      if (!inOrderedList) {
        if (inList) {
          out.push("</ul>");
          inList = false;
        }
        out.push('<ol class="list-decimal pl-5 space-y-1">');
        inOrderedList = true;
      }
      out.push(`<li>${applyInlineMarkdown(orderedMatch[2])}</li>`);
      return;
    }

    closeLists();
    if (trimmed.startsWith("### ")) {
      out.push(`<h3 class="text-base font-semibold">${applyInlineMarkdown(trimmed.slice(4))}</h3>`);
      return;
    }
    if (trimmed.startsWith("## ")) {
      out.push(`<h2 class="text-lg font-semibold">${applyInlineMarkdown(trimmed.slice(3))}</h2>`);
      return;
    }
    if (trimmed.startsWith("# ")) {
      out.push(`<h1 class="text-xl font-semibold">${applyInlineMarkdown(trimmed.slice(2))}</h1>`);
      return;
    }
    if (trimmed.startsWith("---")) {
      out.push('<hr class="my-2 border-slate-200 dark:border-slate-700" />');
      return;
    }
    if (trimmed.startsWith("<") && trimmed.endsWith(">")) {
      out.push(trimmed);
      return;
    }
    out.push(`<p>${applyInlineMarkdown(trimmed)}</p>`);
  });

  if (inCodeBlock) {
    out.push("</code></pre>");
  }
  closeLists();
  return out.join("");
}
