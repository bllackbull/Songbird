import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ArrowRight, Close } from "../../icons/lucide.js";
import { copyTextToClipboard } from "../../utils/clipboard.js";
import { renderMarkdownBlock } from "../../utils/markdown.js";

function normalizeVersionLabel(value) {
  return String(value || "")
    .trim()
    .replace(/^v/i, "");
}

function getSections(changelogSections, version, changelog) {
  if (Array.isArray(changelogSections) && changelogSections.length) {
    const normalizedCurrentVersion = normalizeVersionLabel(version);
    const mappedSections = changelogSections
      .map((section) => ({
        heading: String(section?.heading || "").trim(),
        body: String(section?.body || "").trim(),
      }))
      .filter((section) => section.heading || section.body);
    const currentIndex = mappedSections.findIndex(
      (section) =>
        normalizeVersionLabel(section.heading) === normalizedCurrentVersion,
    );

    if (currentIndex > 0) {
      return [
        mappedSections[currentIndex],
        ...mappedSections.slice(0, currentIndex),
        ...mappedSections.slice(currentIndex + 1),
      ];
    }

    return mappedSections;
  }

  const body = String(changelog || "").trim();
  if (!body) return [];
  return [
    {
      heading: String(version || "").trim(),
      body,
    },
  ];
}

export default function WhatsNewModal({
  open,
  version,
  changelog,
  changelogSections,
  onClose,
}) {
  const panelRef = useRef(null);
  const contentRef = useRef(null);
  const sections = useMemo(
    () => getSections(changelogSections, version, changelog),
    [changelogSections, version, changelog],
  );
  const [pageIndex, setPageIndex] = useState(0);
  const activeSection = sections[pageIndex] || null;
  const markdownHtml = useMemo(
    () => renderMarkdownBlock(activeSection?.body || ""),
    [activeSection?.body],
  );

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const rafId = window.requestAnimationFrame(() => {
      setPageIndex(0);
    });
    return () => window.cancelAnimationFrame(rafId);
  }, [open, version, changelog, changelogSections]);

  useEffect(() => {
    if (!open) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        onClose?.();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    panelRef.current?.focus?.();
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const container = contentRef.current;
    if (!container) return undefined;

    const resolveTargetElement = (target) => {
      if (!target) return null;
      if (target instanceof Element) return target;
      return target.parentElement instanceof Element
        ? target.parentElement
        : null;
    };
    const resetCodeButtonState = (button, state, label) => {
      if (!button) return;
      button.dataset.state = state;
      button.setAttribute("aria-label", label);
    };
    const resetInlineCodeState = (codeEl, state, label) => {
      if (!codeEl) return;
      codeEl.dataset.copyState = state;
      codeEl.setAttribute("aria-label", label);
    };
    const enhanceCodeElements = () => {
      const blocks = container.querySelectorAll(".sb-code-block");
      blocks.forEach((block) => {
        if (block.dataset.sbEnhanced === "1") return;
        block.dataset.sbEnhanced = "1";
      });
      const inlineCodes = container.querySelectorAll("code");
      inlineCodes.forEach((codeEl) => {
        if (codeEl.closest("pre")) return;
        if (codeEl.dataset.sbEnhanced === "1") return;
        codeEl.dataset.sbEnhanced = "1";
        codeEl.tabIndex = 0;
        codeEl.setAttribute("role", "button");
        codeEl.setAttribute("aria-label", "Copy inline code");
        codeEl.classList.add("sb-inline-code-copyable");
      });
    };
    const handleCodeCopy = async ({ codeEl, button }) => {
      if (!codeEl) return;
      const copied = await copyTextToClipboard(codeEl.textContent || "");
      if (button) {
        if (copied) {
          resetCodeButtonState(button, "copied", "Copied");
        } else {
          resetCodeButtonState(button, "error", "Copy failed");
        }
      } else {
        resetInlineCodeState(
          codeEl,
          copied ? "copied" : "error",
          copied ? "Copied inline code" : "Inline code copy failed",
        );
      }
      window.setTimeout(() => {
        if (button) {
          resetCodeButtonState(button, "idle", "Copy code");
        } else {
          resetInlineCodeState(codeEl, "idle", "Copy inline code");
        }
      }, 1200);
    };
    const handleCodeBlockClick = (event) => {
      const target = resolveTargetElement(event?.target);
      if (!target || typeof target.closest !== "function") return;
      const button = target.closest(".sb-code-copy");
      const inlineCode = target.closest(".sb-inline-code-copyable");
      if (inlineCode && container.contains(inlineCode)) {
        event.preventDefault();
        void handleCodeCopy({ codeEl: inlineCode, button: null });
        return;
      }
      const block = button?.closest(".sb-code-block");
      if (!button || !block || !container.contains(block)) return;
      event.preventDefault();
      event.stopPropagation();
      void handleCodeCopy({
        codeEl: block.querySelector("pre.sb-code > code"),
        button,
      });
    };
    const handleCodeBlockKeyDown = (event) => {
      const target = resolveTargetElement(event?.target);
      if (!target || typeof target.closest !== "function") return;
      const inlineCode = target.closest(".sb-inline-code-copyable");
      if (inlineCode && container.contains(inlineCode)) {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        void handleCodeCopy({ codeEl: inlineCode, button: null });
        return;
      }
      const button = target.closest(".sb-code-copy");
      const block = button?.closest(".sb-code-block");
      if (!button || !block || !container.contains(block)) return;
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      void handleCodeCopy({
        codeEl: block.querySelector("pre.sb-code > code"),
        button,
      });
    };

    enhanceCodeElements();
    let idleId = null;
    let timerId = null;
    if (
      typeof window !== "undefined" &&
      typeof window.requestIdleCallback === "function"
    ) {
      idleId = window.requestIdleCallback(enhanceCodeElements, {
        timeout: 600,
      });
    } else {
      timerId = window.setTimeout(enhanceCodeElements, 40);
    }
    container.addEventListener("click", handleCodeBlockClick);
    container.addEventListener("keydown", handleCodeBlockKeyDown);

    return () => {
      container.removeEventListener("click", handleCodeBlockClick);
      container.removeEventListener("keydown", handleCodeBlockKeyDown);
      if (
        idleId !== null &&
        typeof window !== "undefined" &&
        typeof window.cancelIdleCallback === "function"
      ) {
        window.cancelIdleCallback(idleId);
      }
      if (timerId !== null && typeof window !== "undefined") {
        window.clearTimeout(timerId);
      }
    };
  }, [markdownHtml, open]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[160] flex items-center justify-center bg-slate-950/60 px-4 py-6">
      <div
        ref={panelRef}
        tabIndex={-1}
        className="flex max-h-[min(88vh,52rem)] w-full max-w-2xl flex-col overflow-hidden rounded-[2rem] border border-emerald-100/70 bg-white shadow-2xl outline-none dark:border-emerald-500/30 dark:bg-slate-950"
      >
        <div className="flex items-start justify-between gap-4 border-b border-emerald-100/70 px-6 py-5 dark:border-emerald-500/20">
          <div>
            <p className="text-[10px] uppercase tracking-[0.28em] text-emerald-500/80">
              What's New
            </p>
            <h3 className="mt-2 text-2xl font-bold text-emerald-700 dark:text-emerald-200">
              Songbird {activeSection?.heading || version || ""}
            </h3>
          </div>
          <button
            type="button"
            onClick={() => onClose?.()}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-rose-200 bg-rose-50 text-rose-600 transition hover:border-rose-300 hover:bg-rose-100 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200"
            aria-label="Close what's new"
          >
            <Close size={18} />
          </button>
        </div>

        <div
          ref={contentRef}
          className="app-scroll min-h-0 flex-1 overflow-y-auto px-6 py-5"
        >
          {activeSection?.body ? (
            <div
              className="sb-markdown break-words text-left text-sm text-slate-700 [overflow-wrap:anywhere] dark:text-slate-100"
              dangerouslySetInnerHTML={{ __html: String(markdownHtml || "") }}
            />
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-300 px-5 py-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
              No changelog entries are available for this version yet.
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-4 border-t border-emerald-100/70 px-6 py-4 dark:border-emerald-500/20">
          {sections.length > 1 ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPageIndex((current) => Math.max(0, current - 1))}
                disabled={pageIndex === 0}
                className="inline-flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-emerald-200 bg-white text-emerald-700 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-emerald-500/30 dark:bg-slate-950 dark:text-emerald-200 dark:hover:bg-emerald-500/10"
                aria-label="Show previous changelog version"
              >
                <ArrowLeft size={18} />
              </button>
              <span className="min-w-[5.5rem] text-center text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-300">
                {pageIndex + 1} / {sections.length}
              </span>
              <button
                type="button"
                onClick={() =>
                  setPageIndex((current) =>
                    Math.min(sections.length - 1, current + 1),
                  )
                }
                disabled={pageIndex >= sections.length - 1}
                className="inline-flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-emerald-200 bg-white text-emerald-700 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-emerald-500/30 dark:bg-slate-950 dark:text-emerald-200 dark:hover:bg-emerald-500/10"
                aria-label="Show next changelog version"
              >
                <ArrowRight size={18} />
              </button>
            </div>
          ) : (
            <div />
          )}
          <button
            type="button"
            onClick={() => onClose?.()}
            className="rounded-full bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-400"
          >
            Got it!
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
