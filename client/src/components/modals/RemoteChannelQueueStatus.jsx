import { AlertCircle, Check, Clock12, FastForward, LoaderCircle, Pause, Play, SkipForward, Refresh } from "../../icons/lucide.js";

/**
 * Displays the remote channel queue status with counts for each status type.
 * Updates in real-time via polling from parent component.
 * 
 * @param {Object} props
 * @param {Object} props.queue - Queue summary object with status counts
 * @param {boolean} props.sourceEnabled - Whether the remote channel source is enabled
 * @param {boolean} props.readOnly - Whether to show action buttons (false for edit mode, true for view mode)
 * @param {Function} props.onPause - Callback for pause/resume toggle (pass onResume to show Resume button)
 * @param {Function} props.onResume - When provided, shows Resume button instead of Pause
 * @param {Function} props.onSkip - Callback for skip action
 * @param {Function} props.onSkipAll - Callback for skip all action
 * @param {Function} props.onTestConnection - Callback for test connection action
 * @param {string} props.testConnectionResult - Test result: 'success', 'error', or null
 * @param {boolean} props.testConnectionLoading - Whether test is in progress
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
}) {
  const pending = Number(queue.pending || 0);
  const processing = Number(queue.processing || 0);
  const retry = Number(queue.retry || 0);
  const done = Number(queue.done || 0);
  const failed = Number(queue.failed || 0);
  const skipped = Number(queue.skipped || 0);

  // Calculate active items (items that are being processed or waiting)
  // Combine retry with pending since they're both waiting to be processed
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

  return (
    <div className="space-y-2">
      {/* Queue Stats */}
      <div className="rounded-xl border border-emerald-200/70 bg-emerald-50/50 px-3 py-2.5 dark:border-emerald-500/30 dark:bg-emerald-500/5">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">
            Queue Status
          </p>
          {total > 0 && active > 0 ? (
            <span className="text-[10px] text-slate-600 dark:text-slate-400">
              {active} in queue
            </span>
          ) : null}
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
                  <Icon
                    size={13}
                    className={`${item.color} ${item.iconClass || ""}`}
                  />
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
      </div>

      {/* Action Buttons - Only show in edit mode */}
      {!readOnly && sourceEnabled ? (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onResume || onPause}
            disabled={!onResume && !onPause}
            className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-emerald-500/30 dark:bg-slate-900 dark:text-emerald-200 dark:hover:bg-emerald-500/10"
            title={onResume ? "Resume queue" : "Pause queue"}
          >
            {onResume ? (
              <>
                <Play size={13} />
                Resume
              </>
            ) : (
              <>
                <Pause size={13} />
                Pause
              </>
            )}
          </button>
          
          <button
            type="button"
            onClick={onSkip}
            disabled={!onSkip || active === 0}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            title="Skip current item"
          >
            <FastForward size={13} />
            Skip
          </button>
          
          <button
            type="button"
            onClick={onSkipAll}
            disabled={!onSkipAll || active === 0}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            title="Skip all queued items"
          >
            <SkipForward size={13} />
            Skip All
          </button>
          
          <button
            type="button"
            onClick={onTestConnection}
            disabled={!onTestConnection || testConnectionLoading || testConnectionResult !== null}
            className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition ${
              testConnectionResult === 'success'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200 cursor-not-allowed'
                : testConnectionResult === 'error'
                ? 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-900/30 dark:text-rose-200 cursor-not-allowed'
                : testConnectionLoading
                ? 'border-blue-200 bg-white text-blue-700 dark:border-blue-500/30 dark:bg-slate-900 dark:text-blue-300 cursor-not-allowed'
                : 'border-blue-200 bg-white text-blue-700 hover:border-blue-300 hover:bg-blue-50 dark:border-blue-500/30 dark:bg-slate-900 dark:text-blue-300 dark:hover:bg-blue-500/10 cursor-pointer'
            }`}
            title="Test connection to target channel"
          >
            {testConnectionLoading ? (
              <LoaderCircle size={13} className="animate-spin" />
            ) : testConnectionResult === 'success' ? (
              <Check size={13} />
            ) : testConnectionResult === 'error' ? (
              <AlertCircle size={13} />
            ) : (
              <Refresh size={13} />
            )}
            {testConnectionLoading ? 'Testing...' : testConnectionResult === 'success' ? 'Connected' : testConnectionResult === 'error' ? 'Failed' : 'Test'}
          </button>
        </div>
      ) : null}
    </div>
  );
}
