import { AlertCircle, CheckCircle, Clock, LoaderCircle, XCircle, SkipForward } from "../../icons/lucide.js";

/**
 * Displays the remote channel queue status with counts for each status type.
 * Updates in real-time via polling from parent component.
 * 
 * @param {Object} props
 * @param {Object} props.queue - Queue summary object with status counts (e.g., { pending: 5, processing: 2, done: 10 })
 * @param {boolean} props.sourceEnabled - Whether the remote channel source is enabled
 */
export default function RemoteChannelQueueStatus({ queue = {}, sourceEnabled }) {
  const pending = Number(queue.pending || 0);
  const processing = Number(queue.processing || 0);
  const retry = Number(queue.retry || 0);
  const done = Number(queue.done || 0);
  const failed = Number(queue.failed || 0);
  const skipped = Number(queue.skipped || 0);

  // Calculate active items (items that are being processed or waiting)
  const active = pending + processing + retry;
  const total = active + done + failed + skipped;

  const statusItems = [
    {
      label: "Pending",
      count: pending,
      icon: Clock,
      color: "text-slate-500 dark:text-slate-400",
      bgColor: "bg-slate-100 dark:bg-slate-800",
      show: pending > 0,
    },
    {
      label: "Processing",
      count: processing,
      icon: LoaderCircle,
      color: "text-blue-600 dark:text-blue-400",
      bgColor: "bg-blue-50 dark:bg-blue-900/30",
      iconClass: "animate-spin",
      show: processing > 0,
    },
    {
      label: "Retry",
      count: retry,
      icon: AlertCircle,
      color: "text-amber-600 dark:text-amber-400",
      bgColor: "bg-amber-50 dark:bg-amber-900/30",
      show: retry > 0,
    },
    {
      label: "Done",
      count: done,
      icon: CheckCircle,
      color: "text-emerald-600 dark:text-emerald-400",
      bgColor: "bg-emerald-50 dark:bg-emerald-900/30",
      show: done > 0,
    },
    {
      label: "Failed",
      count: failed,
      icon: XCircle,
      color: "text-rose-600 dark:text-rose-400",
      bgColor: "bg-rose-50 dark:bg-rose-900/30",
      show: failed > 0,
    },
    {
      label: "Skipped",
      count: skipped,
      icon: SkipForward,
      color: "text-slate-500 dark:text-slate-400",
      bgColor: "bg-slate-100 dark:bg-slate-800",
      show: skipped > 0,
    },
  ];

  const visibleItems = statusItems.filter((item) => item.show);

  return (
    <div className="rounded-xl border border-emerald-200/50 bg-emerald-50/30 p-2.5 dark:border-emerald-500/20 dark:bg-emerald-500/5">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
        Queue Status
      </p>
      {total === 0 ? (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {sourceEnabled ? "Queue is empty" : "Remote channel is disabled"}
        </p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {visibleItems.map((item) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.label}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-2 py-1 ${item.bgColor}`}
                  title={`${item.count} ${item.label.toLowerCase()} ${item.count === 1 ? "item" : "items"}`}
                >
                  <Icon
                    size={12}
                    className={`${item.color} ${item.iconClass || ""}`}
                  />
                  <span className={`text-xs font-semibold ${item.color}`}>
                    {item.count}
                  </span>
                  <span className="text-[10px] font-medium text-slate-600 dark:text-slate-400">
                    {item.label}
                  </span>
                </div>
              );
            })}
          </div>
          {active > 0 ? (
            <p className="mt-2 text-[10px] text-slate-600 dark:text-slate-400">
              {active} {active === 1 ? "message" : "messages"} in queue
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
