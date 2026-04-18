import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const SCREEN_GAP = 12;

export default function AppContextMenu({ menu, onClose }) {
  const menuRef = useRef(null);
  const [desktopPosition, setDesktopPosition] = useState({ x: 0, y: 0 });
  const [verticalPlacement, setVerticalPlacement] = useState("below");

  useEffect(() => {
    if (!menu) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        onClose?.();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
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
          {menu.items.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  item.onSelect?.();
                  onClose?.();
                }}
                className={`flex w-full items-center gap-3 px-4 py-3 text-left text-sm transition ${
                  item.danger
                    ? "text-rose-600 dark:text-rose-300 hover:bg-black/5 dark:hover:bg-white/10"
                    : "hover:bg-black/5 dark:hover:bg-white/10"
                }`}
              >
                {Icon ? (
                  <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center">
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
