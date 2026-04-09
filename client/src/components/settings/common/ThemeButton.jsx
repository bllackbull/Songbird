import { useEffect, useRef, useState } from "react";
import { Moon, Sun } from "../../../icons/lucide.js";

export function ThemeButton({ isDark, toggleTheme, setIsDark, thick = false }) {
  const [themeToggleAnimating, setThemeToggleAnimating] = useState(false);
  const themeAnimTimeoutRef = useRef(null);

  useEffect(() => {
    return () => {
      if (themeAnimTimeoutRef.current) {
        clearTimeout(themeAnimTimeoutRef.current);
      }
    };
  }, []);

  return (
    <button
      type="button"
      onClick={() => {
        setThemeToggleAnimating(true);
        if (themeAnimTimeoutRef.current) {
          clearTimeout(themeAnimTimeoutRef.current);
        }
        if (toggleTheme) {
          toggleTheme();
        } else {
          setIsDark((prev) => !prev);
        }
        themeAnimTimeoutRef.current = setTimeout(() => {
          setThemeToggleAnimating(false);
        }, 520);
      }}
      className={`mt-1 flex w-full items-center gap-2 rounded-xl border border-transparent px-3 text-left text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-100 hover:shadow-[0_0_18px_rgba(16,185,129,0.22)] dark:text-emerald-200 dark:hover:border-emerald-500/30 dark:hover:bg-emerald-500/10 ${
        thick ? "py-3 text-base font-medium" : "py-2 text-sm"
      }`}
    >
      {isDark ? (
        <Sun
          key="theme-sun"
          size={18}
          className={`icon-anim-spin-dir ${themeToggleAnimating ? "icon-theme-enter-sun" : ""}`}
        />
      ) : (
        <Moon
          key="theme-moon"
          size={18}
          className={`icon-anim-spin-left ${themeToggleAnimating ? "icon-theme-enter-moon" : ""}`}
        />
      )}
      {isDark ? "Light mode" : "Dark mode"}
    </button>
  );
}
