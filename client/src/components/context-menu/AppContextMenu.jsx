import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const SCREEN_GAP = 12;

export default function AppContextMenu({ menu, onClose }) {
  const menuRef = useRef(null);
  const [desktopPosition, setDesktopPosition] = useState({ x: 0, y: 0 });
  const [verticalPlacement, setVerticalPlacement] = useState("below");
  const [focusedIndex, setFocusedIndex] = useState(-1);

  useEffect(() => {
    if (!menu) return undefined;
    // Reset focused index and move focus into the menu
    setFocusedIndex(0);
    return undefined;
  }, [menu]);

  // Focus the active menu item whenever focusedIndex changes
  useEffect(() => {
    if (!menu || focusedIndex < 0) return;
    const container = menuRef.current;
    if (!container) return;
    const items = container.querySelectorAll('[role="menuitem"]');
    const target = items[focusedIndex];
    if (target) {
      try {
        target.focus({ preventScroll: true });
      } catch {
        target.focus();
      }
    }
  }, [focusedIndex, menu]);

  useEffect(() => {
    if (!menu) return undefined;
    const items = menu.items || [];
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        onClose?.();
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setFocusedIndex((prev) => (prev + 1) % items.length);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setFocusedIndex((prev) => (prev - 1 + items.length) % items.length);
        return;
      }
      if (event.key === "Home") {
        event.preventDefault();
        setFocusedIndex(0);
        return;
      }
      if (event.key === "End") {
        event.preventDefault();
        setFocusedIndex(items.length - 1);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [menu, onClose]);

  useEffect(() => {
    const targetEl = menu?.targetEl;
    if (!menu || !targetEl || typeof MutationObserver === "undefined") return undefined;
    if (!targetEl.isConnected) {
      onClose?.();
      return undefined;
    }
    const observer = new MutationObserver(() => {
      if (!targetEl.isConnected) {
        observer.disconnect();
        onClose?.();
      }
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
    return () => observer.disconnect();
  }, [menu, onClose]);

  useLayoutEffect(() => {
    if (!menu || !menuRef.current || typeof window === "undefined") return;
    const rect = menuRef.current.getBoundingClientRect();
    const nextX = Math.min(
      Math.max(SCREEN_GAP, Number(menu.point?.x || 0)),
      window.innerWidth - rect.width - SCREEN_GAP,
    );
    const preferY = Number(menu.point?.y || 0);
    const fitsBelow = preferY + rect.height + SCREEN_GAP <= window.innerHeight;
    const nextY = fitsBelow
      ? preferY
      : Math.max(SCREEN_GAP, preferY - rect.height);
    setDesktopPosition({ x: nextX, y: nextY });
    setVerticalPlacement(fitsBelow ? "below" : "above");
  }, [menu]);

  if (!menu || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[200]"
      onContextMenu={(event) => event.preventDefault()}
    >
      <button
        type="button"
        aria-label="Close context menu"
        className="absolute inset-0 h-full w-full cursor-default border-0 bg-transparent p-0"
        onClick={() => onClose?.()}
      />

      <div
        ref={menuRef}
        role="menu"
        aria-label="Context menu"
        className={`fixed overflow-hidden rounded-[1.25rem] border border-slate-300/80 bg-white text-slate-900 shadow-[0_18px_46px_rgba(15,23,42,0.2)] dark:border-white/10 dark:bg-slate-800 dark:text-slate-100 ${
          verticalPlacement === "below"
            ? "sb-context-menu-open-down"
            : "sb-context-menu-open-up"
        }`}
        style={{
          top: `${desktopPosition.y}px`,
          left: `${desktopPosition.x}px`,
          minWidth: "220px",
          maxWidth: "280px",
          transformOrigin:
            verticalPlacement === "below" ? "top left" : "bottom left",
        }}
      >
        <div className="py-1.5">
          {menu.items.map((item, index) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                role="menuitem"
                tabIndex={focusedIndex === index ? 0 : -1}
                onClick={() => {
                  item.onSelect?.();
                  onClose?.();
                }}
                onFocus={() => setFocusedIndex(index)}
                className={`flex w-full items-center gap-3 px-4 py-3 text-left text-sm transition ${
                  item.danger
                    ? "text-rose-600 dark:text-rose-300 hover:bg-black/5 dark:hover:bg-white/10"
                    : "hover:bg-black/5 dark:hover:bg-white/10"
                }`}
              >
                {Icon ? (
                  <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center" aria-hidden="true">
                    <Icon size={16} />
                  </span>
                ) : null}
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>,
    document.body,
  );
}
