import { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  Check,
  Copy,
  Heart,
  LoaderCircle,
  Refresh,
} from "../../../icons/lucide.js";
import { FaGithub, FaTelegram } from "react-icons/fa6";
import { checkAppVersion } from "../../../api/appMetaApi.js";
import { ABOUT_CONTENT } from "../../../settings/aboutContent.js";
import { copyTextToClipboard } from "../../../utils/clipboard.js";

function SongbirdWebsiteIcon({ size = 24 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      style={{ overflow: "visible" }}
    >
      <path d="M256 0C397.385 0 512 114.615 512 256C512 397.385 397.385 512 256 512C114.615 512 0 397.385 0 256C0 114.615 114.615 0 256 0ZM200.384 360.058C200.384 382.004 240.211 399.795 289.339 399.795C289.341 399.795 289.344 399.795 289.346 399.795V360.056H200.384V360.058ZM289.337 112.001C240.211 112.004 200.388 148.663 200.388 193.884C200.388 194.939 200.409 195.99 200.452 197.036L125.91 169.619C115.331 165.728 103.116 170.956 98.627 181.296C94.1384 191.636 99.0768 203.173 109.656 207.064L154.029 223.385C144.513 221.87 134.616 227.007 130.675 236.086C126.187 246.426 131.124 257.962 141.703 261.854L201.931 284.006C192.779 283.064 183.514 288.147 179.732 296.858C175.244 307.198 180.182 318.735 190.761 322.626L292.287 359.969C291.316 360.026 290.336 360.058 289.35 360.059V399.795C338.475 399.792 378.297 363.133 378.298 317.912C378.298 286.404 358.965 259.052 330.622 245.36C329.479 244.648 328.239 244.038 326.91 243.549L324.101 242.515C322.94 242.061 321.766 241.629 320.58 241.22L249.843 215.202C245.85 208.948 243.558 201.663 243.558 193.884C243.558 172.753 260.451 155.255 282.483 152.208C292.724 161.311 309.043 161.212 319.15 151.908L319.152 151.906L318.969 151.737H332.508V151.736H345.585V151.735C345.585 139.865 336.254 130.001 323.976 128.017C316.106 118.296 303.521 112 289.339 112H289.337V112.001Z" />
    </svg>
  );
}

const SOCIAL_ICONS = {
  github: FaGithub,
  telegram: FaTelegram,
  songbird: SongbirdWebsiteIcon,
};

function WalletRow({ label, address }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="rounded-2xl border border-emerald-200/70 bg-white/90 p-3 dark:border-emerald-500/30 dark:bg-slate-900/50">
      <p className="text-xs font-semibold uppercase text-slate-600 dark:text-white">
        {label}
      </p>
      <button
        type="button"
        onClick={async () => {
          const didCopy = await copyTextToClipboard(address);
          if (!didCopy) return;
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        }}
        className="mt-2 flex w-full items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 text-left text-xs text-emerald-800 transition hover:border-emerald-300 hover:bg-emerald-50 focus:outline-hidden focus:ring-2 focus:ring-emerald-300/60 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200 dark:hover:bg-emerald-500/15"
        aria-label={`Copy ${label} wallet address`}
      >
        <code className="min-w-0 flex-1 break-all font-mono">{address}</code>
        <span className="ml-1 shrink-0 text-emerald-600 dark:text-emerald-400">
          {copied ? <Check size={14} /> : <Copy size={14} />}
        </span>
      </button>
    </div>
  );
}

function DonationLinkRow({ donationLink }) {
  if (!donationLink?.href) return null;

  return (
    <div className="relative overflow-hidden rounded-[1.6rem] border border-sky-200/80 bg-[linear-gradient(135deg,rgba(255,255,255,0.98),rgba(241,248,255,0.98)_56%,rgba(230,243,255,0.96))] p-4 shadow-[0_14px_34px_rgba(100,172,255,0.12)] dark:border-sky-400/25 dark:bg-[linear-gradient(135deg,#0f1419,#17212c_58%,#213449)] dark:shadow-[0_18px_40px_rgba(100,172,255,0.14)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(100,172,255,0.2),transparent_32%),radial-gradient(circle_at_bottom_left,rgba(255,255,255,0.72),transparent_28%)] dark:bg-[radial-gradient(circle_at_top_right,rgba(100,172,255,0.3),transparent_30%),radial-gradient(circle_at_bottom_left,rgba(255,255,255,0.05),transparent_28%)]" />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-[#64ACFF]">
            {donationLink.eyebrow}
          </p>
          <p className="mt-2 text-base font-bold leading-6 text-slate-900 dark:text-white">
            {donationLink.title}
          </p>
          <p className="mt-1.5 max-w-[34ch] text-sm leading-6 text-slate-700 dark:text-slate-200/90">
            {donationLink.description}
          </p>
        </div>
        <a
          href={donationLink.href}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex shrink-0 items-center gap-2 rounded-full border border-sky-300 bg-[#64ACFF] px-4 py-2.5 text-sm font-bold text-white shadow-[0_0_14px_rgba(100,172,255,0.24)] transition hover:border-sky-200 hover:bg-[#7AB8FF] hover:shadow-[0_0_14px_rgba(100,172,255,0.32)] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-sky-300/80 focus-visible:ring-offset-2 focus-visible:ring-offset-[#13171c] dark:border-sky-300/60 dark:bg-[#64ACFF] dark:hover:bg-[#7AB8FF]"
          aria-label={donationLink.buttonLabel}
        >
          <Heart size={15} className="icon-anim-pop fill-current" />
          {donationLink.buttonLabel}
        </a>
      </div>
    </div>
  );
}

export function AboutSettingsPanel({
  appInfo,
  appInfoLoading,
  appInfoError,
  onDone,
  variant = "desktop",
}) {
  const isMobile = variant === "mobile";
  const [checkState, setCheckState] = useState({
    status: "",
    latestVersion: "",
    latestTag: "",
  });
  const resetCheckStateTimerRef = useRef(null);

  const versionLabel =
    String(appInfo?.version || "Unknown").trim() || "Unknown";
  const ownerHref = ABOUT_CONTENT.copyright?.ownerHref || "";
  const ownerLabel = ABOUT_CONTENT.copyright?.ownerLabel || "bllackbull";
  const year = new Date().getFullYear();
  const rowBase =
    "flex w-full items-center justify-between gap-3 rounded-2xl border border-emerald-200/70 bg-white/90 px-4 py-3 text-left text-sm font-semibold text-emerald-700 dark:border-emerald-500/30 dark:bg-slate-900/50 dark:text-emerald-200";
  const actionButtonBase =
    "inline-flex h-7 min-w-[58px] items-center justify-center rounded-full px-3 py-1 text-xs font-semibold leading-none transition";

  useEffect(() => {
    return () => {
      if (resetCheckStateTimerRef.current) {
        window.clearTimeout(resetCheckStateTimerRef.current);
      }
    };
  }, []);

  const scheduleCheckStateReset = () => {
    if (resetCheckStateTimerRef.current) {
      window.clearTimeout(resetCheckStateTimerRef.current);
    }
    resetCheckStateTimerRef.current = window.setTimeout(() => {
      setCheckState({
        status: "",
        latestVersion: "",
        latestTag: "",
      });
      resetCheckStateTimerRef.current = null;
    }, 3200);
  };

  const currentButtonStyle = (() => {
    if (checkState.status === "checking") {
      return {
        className:
          "cursor-wait border border-emerald-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-emerald-700 hover:border-emerald-300 hover:bg-emerald-50 hover:shadow-[0_0_14px_rgba(16,185,129,0.2)] dark:border-emerald-500/30 dark:bg-slate-900 dark:text-emerald-200 dark:hover:bg-emerald-500/10",
        label: "Checking",
        icon: <LoaderCircle size={12} className="animate-spin" />,
      };
    }
    if (checkState.status === "error") {
      return {
        className:
          "border border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200",
        label: "Failed",
        icon: <AlertCircle size={13} />,
      };
    }
    if (checkState.status === "update-available") {
      return {
        className:
          "border border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200",
        label: "Update available",
        icon: <AlertCircle size={13} />,
      };
    }
    if (checkState.status === "up-to-date") {
      return {
        className:
          "border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200",
        label: "Up to date",
        icon: <Check size={13} />,
      };
    }
    return {
      className:
        "border border-emerald-200 bg-white text-emerald-700 hover:border-emerald-300 hover:bg-emerald-50 dark:border-emerald-500/30 dark:bg-slate-900 dark:text-emerald-200 dark:hover:bg-emerald-500/10",
      label: appInfoLoading ? "Loading..." : versionLabel,
      icon: <Refresh size={13} />,
    };
  })();

  return (
    <div className="space-y-4 text-slate-600 dark:text-slate-300">
      <div
        className={
          isMobile
            ? "space-y-3"
            : "app-scroll max-h-[calc(100dvh-18rem)] space-y-3 overflow-y-auto pr-1"
        }
      >
        <div className={`${rowBase} items-start`}>
          <div className="min-w-0 flex-1">
            <p>App version</p>
            {appInfoError ? (
              <p className="mt-1 text-xs font-normal text-rose-600 dark:text-rose-300">
                {appInfoError}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={async () => {
              if (resetCheckStateTimerRef.current) {
                window.clearTimeout(resetCheckStateTimerRef.current);
                resetCheckStateTimerRef.current = null;
              }
              setCheckState({
                status: "checking",
                latestVersion: "",
                latestTag: "",
              });
              try {
                const payload = await checkAppVersion(appInfo);
                setCheckState({
                  status: payload?.status || "up-to-date",
                  latestVersion: String(payload?.latestVersion || ""),
                  latestTag: String(payload?.latestTag || ""),
                });
                scheduleCheckStateReset();
              } catch {
                setCheckState({
                  status: "error",
                  latestVersion: "",
                  latestTag: "",
                });
                scheduleCheckStateReset();
              }
            }}
            disabled={checkState.status === "checking"}
            className={`${actionButtonBase} ${currentButtonStyle.className}`}
          >
            {currentButtonStyle.icon}
            <span className="ml-1">{currentButtonStyle.label}</span>
          </button>
        </div>

        <div className="rounded-2xl border border-emerald-200/70 bg-white/90 p-4 dark:border-emerald-500/30 dark:bg-slate-900/50">
          <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-200">
            Support the project
          </p>
          <p className="mt-1.5 text-sm leading-6 text-slate-600 dark:text-slate-300">
            {ABOUT_CONTENT.supportIntro}
          </p>
          <div className="mt-3 space-y-2.5">
            <DonationLinkRow donationLink={ABOUT_CONTENT.donationLink} />
            {ABOUT_CONTENT.wallets.map((wallet) => (
              <WalletRow
                key={wallet.label}
                label={wallet.label}
                address={wallet.address}
              />
            ))}
          </div>
        </div>

        <div className="border-t border-emerald-100/80 pt-4 dark:border-emerald-500/20">
          <div className="flex flex-wrap items-center justify-center gap-1.5">
            {ABOUT_CONTENT.socials.map((item) => {
              const Icon = SOCIAL_ICONS[item.icon];
              return (
                <a
                  key={`${item.icon}-${item.href}`}
                  href={item.href}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={item.icon}
                  title={item.icon}
                  className="group inline-flex items-center justify-center p-1 text-slate-500 transition hover:text-emerald-700 dark:text-slate-400 dark:hover:text-emerald-200"
                >
                  <span className="inline-flex items-center justify-center text-slate-600 transition group-hover:text-emerald-700 dark:text-slate-300 dark:group-hover:text-emerald-200">
                    {Icon ? <Icon size={24} /> : null}
                  </span>
                </a>
              );
            })}
          </div>

          <p className="mt-4 text-center text-xs text-slate-500 dark:text-slate-400">
            {"\u00A9"} {year}{" "}
            <a
              href={ownerHref}
              target="_blank"
              rel="noreferrer"
              className="font-semibold text-slate-600 underline-offset-4 transition hover:text-emerald-700 hover:underline dark:text-slate-300 dark:hover:text-emerald-200"
            >
              {ownerLabel}
            </a>
          </p>
          <p className="mt-1 text-center text-[11px] text-slate-500 dark:text-slate-400">
            All rights reserved. Songbird is a free and open-source project,
            licensed under the MIT License.
          </p>
          <p className="mt-1 text-center text-[11px] text-slate-500 dark:text-slate-400">
            For Freedom ❤️
          </p>
        </div>
      </div>

      {!isMobile ? (
        <div className="flex items-center justify-end pt-1">
          <button
            type="button"
            onClick={() => onDone?.()}
            className="rounded-full bg-emerald-500 px-4 py-2 text-xs font-semibold text-white transition hover:bg-emerald-400"
          >
            Done
          </button>
        </div>
      ) : null}
    </div>
  );
}
