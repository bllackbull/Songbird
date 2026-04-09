import { useEffect, useRef, useState } from "react";
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

  useEffect(() => {
    return () => {
      if (themeAnimTimeoutRef.current) {
        clearTimeout(themeAnimTimeoutRef.current);
      }
    };
  }, []);

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
    <section className="app-scroll relative my-auto w-full max-w-md max-h-[calc(100dvh-5.5rem)] overflow-y-auto rounded-3xl border border-emerald-200/70 bg-white/80 p-6 shadow-2xl shadow-emerald-500/10 backdrop-blur dark:border-white/5 dark:bg-slate-900/80 sm:max-h-none sm:overflow-visible sm:p-8">
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


