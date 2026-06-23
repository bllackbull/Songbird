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
      className={`flex w-full items-center gap-2 rounded-xl px-3 text-left text-slate-700 transition hover:bg-emerald-50 hover:text-emerald-700 dark:text-slate-100 dark:hover:bg-emerald-500/10 dark:hover:text-emerald-200 ${
        thick ? "py-3 text-base font-medium" : "py-2.5 text-sm font-semibold"
      }`}
    >
      {isDark ? (
        <Sun
          key="theme-sun"
          size={18}
          className={`shrink-0 text-emerald-500 icon-anim-spin-dir ${themeToggleAnimating ? "icon-theme-enter-sun" : ""}`}
        />
      ) : (
        <Moon
          key="theme-moon"
          size={18}
          className={`shrink-0 text-emerald-500 icon-anim-spin-left ${themeToggleAnimating ? "icon-theme-enter-moon" : ""}`}
        />
      )}
      {isDark ? "Light mode" : "Dark mode"}
    </button>
  );
}
