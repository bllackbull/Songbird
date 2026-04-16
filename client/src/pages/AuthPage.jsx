import { useEffect, useLayoutEffect, useRef, useState } from "react";
import AuthFooter from "../components/auth/AuthFooter.jsx";
import AuthFormFields from "../components/auth/AuthFormFields.jsx";
import AuthHeader from "../components/auth/AuthHeader.jsx";
import AuthOverlay from "../components/auth/AuthOverlay.jsx";
import AuthStatusBanner from "../components/auth/AuthStatusBanner.jsx";

export default function AuthPage({
  mode,
  isDark,
  onToggleTheme,
  onSubmit,
  onSwitchMode,
  status,
  loading,
  showSigningOverlay = false,
  allowSignup = true,
}) {
  const isLogin = mode === "login";
  const canSignup = Boolean(allowSignup);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [themeToggleAnimating, setThemeToggleAnimating] = useState(false);
  const [nicknameLength, setNicknameLength] = useState(0);
  const [usernameLength, setUsernameLength] = useState(0);
  const themeAnimTimeoutRef = useRef(null);
  const cardRef = useRef(null);
  const [fitsViewport, setFitsViewport] = useState(true);

  useEffect(() => {
    return () => {
      if (themeAnimTimeoutRef.current) {
        clearTimeout(themeAnimTimeoutRef.current);
      }
    };
  }, []);

  useLayoutEffect(() => {
    const node = cardRef.current;
    if (!node || typeof window === "undefined") return;

    const measure = () => {
      const parentHeight = Number(node.parentElement?.clientHeight || 0);
      const viewportHeight = Number(window.visualViewport?.height || window.innerHeight || 0);
      const availableHeight = parentHeight || viewportHeight;
      const cardHeight = Math.ceil(node.getBoundingClientRect().height);
      setFitsViewport(cardHeight <= Math.max(availableHeight - 8, 0));
    };

    measure();
    const rafId = window.requestAnimationFrame(measure);
    const timeoutId = window.setTimeout(measure, 120);
    const observer =
      typeof ResizeObserver === "function"
        ? new ResizeObserver(() => measure())
        : null;
    observer?.observe(node);
    if (node.parentElement) {
      observer?.observe(node.parentElement);
    }
    window.addEventListener("resize", measure);
    window.visualViewport?.addEventListener("resize", measure);

    return () => {
      window.cancelAnimationFrame(rafId);
      window.clearTimeout(timeoutId);
      observer?.disconnect();
      window.removeEventListener("resize", measure);
      window.visualViewport?.removeEventListener("resize", measure);
    };
  }, [isLogin, canSignup, loading, showConfirmPassword, showPassword, status]);

  const handleToggleTheme = () => {
    setThemeToggleAnimating(true);
    if (themeAnimTimeoutRef.current) {
      clearTimeout(themeAnimTimeoutRef.current);
    }
    onToggleTheme();
    themeAnimTimeoutRef.current = setTimeout(() => {
      setThemeToggleAnimating(false);
    }, 520);
  };

  return (
    <section
      ref={cardRef}
      className={`relative w-full max-w-md rounded-3xl border border-emerald-200/70 bg-white/80 p-6 shadow-2xl shadow-emerald-500/10 backdrop-blur dark:border-white/5 dark:bg-slate-900/80 sm:p-8 ${
        fitsViewport ? "my-auto self-center" : "my-0 self-start"
      }`}
    >
      <AuthHeader
        isLogin={isLogin}
        isDark={isDark}
        themeToggleAnimating={themeToggleAnimating}
        onToggleTheme={handleToggleTheme}
      />

      <AuthFormFields
        isLogin={isLogin}
        canSignup={canSignup}
        showPassword={showPassword}
        setShowPassword={setShowPassword}
        showConfirmPassword={showConfirmPassword}
        setShowConfirmPassword={setShowConfirmPassword}
        nicknameLength={nicknameLength}
        setNicknameLength={setNicknameLength}
        usernameLength={usernameLength}
        setUsernameLength={setUsernameLength}
        loading={loading}
        onSubmit={onSubmit}
        onReset={() => {
          setNicknameLength(0);
          setUsernameLength(0);
        }}
      />

      <AuthStatusBanner status={status} />

      <AuthFooter
        isLogin={isLogin}
        canSignup={canSignup}
        onSwitchMode={onSwitchMode}
      />

      <AuthOverlay isLogin={isLogin} show={showSigningOverlay} />
    </section>
  );
}


