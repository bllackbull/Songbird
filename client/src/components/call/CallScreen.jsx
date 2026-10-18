import { memo, useEffect, useRef } from "react";
import {
  Mic,
  Video,
  Phone,
  MicOff,
  VideoOff,
  Volume2,
  VolumeX,
  Lock,
  SignalHigh,
  SignalMedium,
  SignalLow,
  SignalZero,
} from "../../icons/lucide.js";
import Avatar from "../common/Avatar.jsx";
import Tooltip from "../common/Tooltip.jsx";
import { getAvatarInitials } from "../../utils/avatarInitials.js";
import { hasPersian } from "../../utils/fontUtils.js";

function formatDuration(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

const SIGNAL_LEVELS = {
  1: { Icon: SignalZero, color: "text-red-400", name: "Bad" },
  2: { Icon: SignalLow, color: "text-yellow-400", name: "Medium" },
  3: { Icon: SignalMedium, color: "text-emerald-400", name: "Good" },
  4: { Icon: SignalHigh, color: "text-emerald-300", name: "Excellent" },
};

function SignalIndicator({ quality }) {
  const level = quality?.level ?? 0;
  const entry = SIGNAL_LEVELS[level];
  const parts = [];
  if (Number.isFinite(quality?.rttMs)) parts.push(`${Math.round(quality.rttMs)}ms ping`);
  if (Number.isFinite(quality?.packetLossPct))
    parts.push(`${quality.packetLossPct.toFixed(1)}% loss`);
  const label = entry
    ? `Connection ${entry.name.toLowerCase()}${parts.length ? ` — ${parts.join(", ")}` : ""}`
    : "Measuring connection…";
  return (
    <Tooltip label={label}>
      <span
        className="relative inline-flex -translate-y-[2px]"
        role="img"
        aria-label={entry ? `Connection: ${entry.name}` : "Connection: measuring"}
      >
        <SignalHigh size={22} className="text-white/20" />
        {entry ? (
          <span className="absolute inset-0 inline-flex" aria-hidden="true">
            <entry.Icon size={22} className={entry.color} />
          </span>
        ) : null}
      </span>
    </Tooltip>
  );
}

export const CallScreen = memo(function CallScreen({
  callState,
  callType,
  callPeer,
  callDuration,
  callQuality,
  isMuted,
  isCameraOff,
  isRemoteCameraOff,
  isSpeakerOn,
  localVideoRef,
  remoteVideoRef,
  remoteAudioRef,
  onAccept,
  onReject,
  onEnd,
  onToggleMute,
  onToggleCamera,
  onToggleSpeaker,
}) {
  const isVideo = callType === "video";
  const remoteCameraOff =
    isRemoteCameraOff === undefined ? !isVideo : isRemoteCameraOff;
  const localOn = !isCameraOff;
  const remoteOn = !remoteCameraOff;
  const isConnected = callState === "connected";
  const hasVideo = isConnected && (localOn || remoteOn);
  const bothOn = isConnected && localOn && remoteOn;
  const peerName = callPeer?.nickname || callPeer?.username || "Unknown";
  const peerInitials = getAvatarInitials(peerName);

  // Prevent body scroll while call screen is open
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  const ringtoneRef = useRef(null);

  // Play ringtone while calling / ringing, stop on connected / unmount
  useEffect(() => {
    if (callState !== "calling" && callState !== "ringing") {
      ringtoneRef.current?.pause();
      ringtoneRef.current = null;
      return;
    }
    const audio = new Audio("/sounds/ringtone.mp3");
    audio.loop = true;
    ringtoneRef.current = audio;
    void audio.play().catch(() => {});
    return () => {
      audio.pause();
      if (ringtoneRef.current === audio) ringtoneRef.current = null;
    };
  }, [callState]);

  const stateLabel =
    callState === "calling"
      ? "Calling..."
      : callState === "ringing"
        ? "Incoming call"
        : callState === "connected"
          ? formatDuration(callDuration)
          : "";

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center md:bg-black/45 md:px-5">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Call"
        className="relative flex h-full w-full flex-col items-center justify-between overflow-hidden bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 md:h-[min(800px,calc(100dvh-2rem))] md:max-w-[400px] md:rounded-3xl md:shadow-xl"
      >
      {isConnected && !remoteOn ? (
        <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />
      ) : null}

      {/* Secure badge - very top */}
      <div className="absolute inset-x-0 top-0 z-30 flex justify-center pt-4">
        <Tooltip label="Peer-to-peer encrypted">
          <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-400">
            <Lock size={12} />
            Secure
          </span>
        </Tooltip>
      </div>

      {/* Top section - peer info */}
      {callState === "connected" ? (
        <div className="relative z-20 flex w-full shrink-0 justify-center pb-6 pt-14">
          <div className="flex w-60 flex-row items-center gap-3">
            <Avatar
              src={callPeer?.avatar || ""}
              alt={peerName}
              name={peerName}
              color="#10b981"
              initials={peerInitials}
              className="h-14 w-14 shrink-0 text-lg shadow-xl ring-4 ring-white/10"
            />
            <div className="flex min-w-0 flex-col">
              <h2
                className={`truncate text-lg font-semibold text-white ${
                  hasPersian(peerName) ? "font-fa sb-fa-baseline-fix" : ""
                }`}
                dir="auto"
              >
                {peerName}
              </h2>
              <p className="mt-0.5 flex items-center gap-1.5 text-sm font-medium text-emerald-400">
                <SignalIndicator quality={callQuality} />
                {stateLabel}
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="relative z-20 flex shrink-0 flex-col items-center pt-14">
          <Avatar
            src={callPeer?.avatar || ""}
            alt={peerName}
            name={peerName}
            color="#10b981"
            initials={peerInitials}
            className="h-24 w-24 text-2xl shadow-xl ring-4 ring-white/10"
          />
          <h2
            className={`mt-4 max-w-[20rem] truncate text-xl font-semibold text-white ${
              hasPersian(peerName) ? "font-fa sb-fa-baseline-fix" : ""
            }`}
            dir="auto"
          >
            {peerName}
          </h2>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-white/60">
            {isVideo ? <Video size={14} /> : <Phone size={14} />}
            {isVideo ? "Video call" : "Voice call"}
          </p>
          <p className="mt-2 text-sm font-medium text-emerald-400">
            {stateLabel}
          </p>
        </div>
      )}

      {/* Video stage */}
      {isConnected && hasVideo ? (
        <div className="relative z-0 mx-2 min-h-0 w-[calc(100%-1rem)] flex-1 overflow-hidden rounded-2xl">
          {/* Placeholder tile behind live video. */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div
              data-testid="main-video-placeholder"
              className="aspect-[4/5] max-h-[85%] w-[min(70%,16rem)] rounded-xl border-2 border-white/20 shadow-lg"
            />
          </div>
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            aria-label="Remote video"
            className={
              remoteOn
                ? "absolute inset-0 h-full w-full object-cover"
                : "hidden"
            }
          />
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            aria-label="Local video"
            className={
              bothOn
                ? "absolute bottom-4 right-4 z-10 aspect-[3/4] w-[28%] max-w-32 rounded-xl border-2 border-white/20 object-cover shadow-lg"
                : localOn
                  ? "absolute inset-0 h-full w-full object-cover"
                  : "hidden"
            }
          />
        </div>
      ) : null}

      {/* Controls */}
      <div
        className={`relative z-20 flex shrink-0 flex-col items-center gap-6 ${
          callState === "connected" ? "pb-8 pt-6" : "pb-48"
        }`}
      >
        {/* Incoming call: accept + reject with wide gap */}
        {callState === "ringing" ? (
          <div className="flex items-center gap-24">
            <button
              type="button"
              onClick={onAccept}
              className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg shadow-emerald-500/30 cursor-pointer transition hover:bg-emerald-400"
              aria-label="Accept call"
            >
              <Phone size={26} />
            </button>
            <button
              type="button"
              onClick={onReject}
              className="flex h-16 w-16 items-center justify-center rounded-full bg-red-500 text-white shadow-lg shadow-red-500/30 cursor-pointer transition hover:bg-red-400"
              aria-label="Reject call"
            >
              <Phone size={26} className="rotate-[135deg]" />
            </button>
          </div>
        ) : (
          <>
            {/* Secondary controls row */}
            {callState === "connected" ? (
              <div className="flex items-center gap-6">
                <button
                  type="button"
                  onClick={onToggleSpeaker}
                  className={`flex h-16 w-16 items-center justify-center rounded-full cursor-pointer transition ${
                    isSpeakerOn
                      ? "bg-white/10 text-white hover:bg-white/20"
                      : "bg-white text-gray-500 hover:bg-white/90"
                  }`}
                  aria-label={isSpeakerOn ? "Turn speaker off" : "Turn speaker on"}
                >
                  {isSpeakerOn ? <Volume2 size={26} /> : <VolumeX size={26} />}
                </button>

                <button
                  type="button"
                  onClick={onToggleMute}
                  className={`flex h-16 w-16 items-center justify-center rounded-full cursor-pointer transition ${
                    isMuted
                      ? "bg-white text-gray-500 hover:bg-white/90"
                      : "bg-white/10 text-white hover:bg-white/20"
                  }`}
                  aria-label={isMuted ? "Unmute" : "Mute"}
                >
                  {isMuted ? <MicOff size={26} /> : <Mic size={26} />}
                </button>

                <button
                  type="button"
                  onClick={onToggleCamera}
                  className={`flex h-16 w-16 items-center justify-center rounded-full cursor-pointer transition ${
                    isCameraOff
                      ? "bg-white text-gray-500 hover:bg-white/90"
                      : "bg-white/10 text-white hover:bg-white/20"
                  }`}
                  aria-label={isCameraOff ? "Turn camera on" : "Turn camera off"}
                >
                  {isCameraOff ? <VideoOff size={26} /> : <Video size={26} />}
                </button>
              </div>
            ) : null}

            {/* End button (centered) */}
            <button
              type="button"
              onClick={onEnd}
              className="flex h-16 w-16 items-center justify-center rounded-full bg-red-500 text-white shadow-lg shadow-red-500/30 cursor-pointer transition hover:bg-red-400"
              aria-label="End call"
            >
              <Phone size={26} className="rotate-[135deg]" />
            </button>
          </>
        )}
      </div>
      </div>
    </div>
  );
});
