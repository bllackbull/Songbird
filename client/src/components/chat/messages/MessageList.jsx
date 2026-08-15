import { MessageTimeline } from "./MessageTimeline.jsx";

export function OfflineHistoryBanner({ isOffline, hasOlderMessages, loadingOlderMessages }) {
  if (!isOffline || hasOlderMessages || loadingOlderMessages) return null;
  return (
    <div
      className="px-3 pb-3 pt-1 text-center md:px-0"
      data-testid="offline-history-banner"
    >
      <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-slate-200/80 bg-white/90 px-4 py-1.5 text-xs text-slate-600 shadow-xs dark:border-slate-800 dark:bg-slate-900/90 dark:text-slate-400">
        <span>Reached top of cached history — connect to load older messages</span>
      </div>
    </div>
  );
}

export function MessageList(props) {
  return <MessageTimeline {...props} />;
}
