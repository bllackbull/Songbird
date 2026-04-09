import { LoaderCircle } from "../../icons/lucide.js";

export default function AuthOverlay({ isLogin, show }) {
  if (!show || !isLogin) return null;
  return (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded-3xl bg-white/85 backdrop-blur-sm dark:bg-slate-950/85">
      <LoaderCircle className="h-12 w-12 animate-spin text-emerald-500" />
      <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-200">
        Signing in...
      </p>
    </div>
  );
}
