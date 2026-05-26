import { AlertCircle, Check, Clock12, FastForward, LoaderCircle, Pause, Play, Refresh, SkipForward } from "../../icons/lucide.js";

/**
 * Displays the remote channel queue status with counts for each status type.
 * The stats box is clickable to trigger a connection test.
 *
 * @param {Object} props
 * @param {Object} props.queue - Queue summary object with status counts
 * @param {boolean} props.sourceEnabled - Whether the remote channel source is enabled
 * @param {boolean} props.readOnly - Whether to show action buttons
 * @param {Function} props.onPause - Callback for pause action
 * @param {Function} props.onResume - When provided, shows Resume button instead of Pause
 * @param {Function} props.onSkip - Callback for skip action
 * @param {Function} props.onSkipAll - Callback for skip all action
 * @param {Function} props.onTestConnection - Callback to trigger connection test
 * @param {string} props.testConnectionResult - 'success', 'error', or null
 * @param {boolean} props.testConnectionLoading - Whether test is in progress
 * @param {boolean} props.actionLoading - Whether a queue action is in progress
 */
export default function RemoteChannelQueueStatus({
  queue = {},
  sourceEnabled,
  readOnly = false,
  onPause,
  onResume,
  onSkip,
  onSkipAll,
  onTestConnection,
  testConnectionResult = null,
  testConnectionLoading = false,
  actionLoading = false,
}) {
  const pending = Number(queue.pending || 0);
  const processing = Number(queue.processing || 0);
  const retry = Number(queue.retry || 0);
  const done = Number(queue.done || 0);
  const failed = Number(queue.failed || 0);
  const skipped = Number(queue.skipped || 0);

  const active = pending + processing + retry;
  const total = active + done + failed + skipped;

  const statusItems = [
    {
      label: "Queued",
      count: pending + retry,
      icon: LoaderCircle,
      iconClass: "animate-spin",
      color: "text-slate-600 dark:text-slate-300",
      show: (pending + retry) > 0,
    },
    {
      label: "Processing",
      count: processing,
      icon: Clock12,
      iconClass: "animate-spin",
      color: "text-blue-600 dark:text-blue-400",
      show: processing > 0,
    },
    {
      label: "Done",
      count: done,
      icon: Check,
      color: "text-emerald-600 dark:text-emerald-400",
      show: done > 0,
    },
    {
      label: "Failed",
      count: failed,
      icon: AlertCircle,
      color: "text-rose-600 dark:text-rose-400",
      show: failed > 0,
    },
  ];

  const visibleItems = statusItems.filter((item) => item.show);

  // Connection status badge shown in top-right corner
  const connectionBadge = (() => {
    if (active > 0) {
      // Items in queue implies connection is working — show count
      return {
        label: `${active} in queue`,
        className: "text-slate-600 dark:text-slate-400",
      };
    }
    if (testConnectionLoading) {
      return {
        label: "Connecting...",
        className: "text-stale-600 dark:text-stale-400",
        icon: <LoaderCircle size={11} className="animate-spin" />,
      };
    }
    if (testConnectionResult === "success") {
      return {
        label: "Connected",
        className: "text-emerald-600 dark:text-emerald-400",
        icon: <Check size={11} />,
      };
    }
    if (testConnectionResult === "error") {
      return {
        label: "Disconnected",
        className: "text-rose-600 dark:text-rose-400",
        icon: <AlertCircle size={11} />,
      };
    }
    // No result yet (initial state before first check)
    return {
      label: "Check",
      className: "text-slate-500 dark:text-slate-400",
      icon: <Refresh size={11} />,
    };
  })();

  // Box turns red when disconnected
  const isDisconnected = testConnectionResult === "error" && active === 0;
  const boxClass = isDisconnected
    ? "rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 dark:border-rose-500/30 dark:bg-rose-900/30"
    : "rounded-xl border border-emerald-200 bg-emerald-50/70 px-3 py-2.5 dark:border-emerald-500/30 dark:bg-emerald-500/10";

  const canTest = Boolean(onTestConnection) && !testConnectionLoading && !actionLoading;
  const actionsBlocked = actionLoading || testConnectionLoading || isDisconnected;

  return (
    <div className="space-y-2">
      {/* Queue Stats — clickable to test connection */}
      <button
        type="button"
        onClick={canTest ? onTestConnection : undefined}
        disabled={!canTest}
        className={`w-full text-left transition ${boxClass} ${
          canTest
            ? isDisconnected
              ? "cursor-pointer hover:border-rose-300 hover:bg-rose-100 dark:hover:bg-rose-900/45"
              : "cursor-pointer hover:border-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-500/15"
            : "cursor-default"
        }`}
        title={canTest ? "Click to test connection" : undefined}
      >
        <div className="flex items-center justify-between">
          <p className={`text-xs font-semibold ${isDisconnected ? "text-rose-600 dark:text-rose-200" : "text-slate-700 dark:text-slate-200"}`}>
            Queue Status
          </p>
          <span className={`inline-flex items-center gap-1 text-[10px] font-medium ${connectionBadge.className}`}>
            {connectionBadge.icon ?? null}
            {connectionBadge.label}
          </span>
        </div>

        {total === 0 ? (
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {sourceEnabled ? "Queue is empty" : "Remote channel is disabled"}
          </p>
        ) : (
          <div className="mt-2 flex flex-wrap gap-2">
            {visibleItems.map((item) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.label}
                  className="inline-flex items-center gap-1.5"
                  title={`${item.count} ${item.label.toLowerCase()}`}
                >
                  <Icon size={13} className={`${item.color} ${item.iconClass || ""}`} />
                  <span className={`text-xs font-semibold ${item.color}`}>
                    {item.count}
                  </span>
                  <span className="text-[11px] font-medium text-slate-600 dark:text-slate-400">
                    {item.label}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </button>

      {/* Action Buttons */}
      {!readOnly && sourceEnabled ? (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onResume || onPause}
            disabled={(!onResume && !onPause) || actionsBlocked}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            title={onResume ? "Resume queue" : "Pause queue"}
          >
            {actionLoading || testConnectionLoading ? (
              <LoaderCircle size={13} className="animate-spin" />
            ) : onResume ? (
              <Play size={13} />
            ) : (
              <Pause size={13} />
            )}
            {onResume ? "Resume" : "Pause"}
          </button>

          <button
            type="button"
            onClick={onSkip}
            disabled={!onSkip || active === 0 || actionsBlocked}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            title="Skip current item"
          >
            {actionLoading || testConnectionLoading ? (
              <LoaderCircle size={13} className="animate-spin" />
            ) : (
              <FastForward size={13} />
            )}
            Skip
          </button>

          <button
            type="button"
            onClick={onSkipAll}
            disabled={!onSkipAll || active === 0 || actionsBlocked}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            title="Skip all queued items"
          >
            {actionLoading || testConnectionLoading ? (
              <LoaderCircle size={13} className="animate-spin" />
            ) : (
              <SkipForward size={13} />
            )}
            Skip All
          </button>
        </div>
      ) : null}
    </div>
  );
}
