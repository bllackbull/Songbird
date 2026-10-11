import { memo, useEffect } from "react";
import {
  Mic,
  Video,
  Phone,
  PhoneOff,
  MicOff,
  VideoOff,
} from "../../icons/lucide.js";
import Avatar from "../common/Avatar.jsx";
import { getAvatarInitials } from "../../utils/avatarInitials.js";

function formatDuration(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export const CallScreen = memo(function CallScreen({
  callState,
  callType,
  callPeer,
  callDuration,
  isMuted,
  isCameraOff,
  localVideoRef,
  remoteVideoRef,
  onAccept,
  onReject,
  onEnd,
  onToggleMute,
  onToggleCamera,
}) {
  const isVideo = callType === "video";
  const peerName = callPeer?.nickname || callPeer?.username || "Unknown";
  const peerInitials = getAvatarInitials(peerName);

  // Prevent body scroll while call screen is open
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  const stateLabel =
    callState === "calling"
      ? "Calling..."
      : callState === "ringing"
        ? "Incoming call"
        : callState === "connected"
          ? formatDuration(callDuration)
          : "";

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-between bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900">
      {/* Video elements */}
      {isVideo && callState === "connected" ? (
        <>
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className="absolute inset-0 h-full w-full object-cover"
          />
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className="absolute bottom-24 right-4 z-10 h-36 w-28 rounded-xl border-2 border-white/20 object-cover shadow-lg"
          />
        </>
      ) : null}

      {/* Top section - peer info */}
      <div className="relative z-20 flex flex-col items-center pt-20">
        <Avatar
          src={callPeer?.avatar || ""}
          alt={peerName}
          name={peerName}
          color="#10b981"
          initials={peerInitials}
          className="h-24 w-24 text-2xl shadow-xl ring-4 ring-white/10"
        />
        <h2 className="mt-4 text-xl font-semibold text-white">{peerName}</h2>
        <p className="mt-1 text-sm text-white/60">
          {isVideo ? "Video call" : "Voice call"}
        </p>
        <p className="mt-2 text-sm font-medium text-emerald-400">
          {stateLabel}
        </p>
      </div>

      {/* Controls */}
      <div className="relative z-20 flex items-center gap-6 pb-16">
        {/* Mute button */}
        {callState === "connected" ? (
          <button
            type="button"
            onClick={onToggleMute}
            className={`flex h-14 w-14 items-center justify-center rounded-full transition ${
              isMuted
                ? "bg-red-500/20 text-red-400"
                : "bg-white/10 text-white hover:bg-white/20"
            }`}
            aria-label={isMuted ? "Unmute" : "Mute"}
          >
            {isMuted ? <MicOff size={22} /> : <Mic size={22} />}
          </button>
        ) : null}

        {/* Camera toggle (video calls only) */}
        {callState === "connected" && isVideo ? (
          <button
            type="button"
            onClick={onToggleCamera}
            className={`flex h-14 w-14 items-center justify-center rounded-full transition ${
              isCameraOff
                ? "bg-red-500/20 text-red-400"
                : "bg-white/10 text-white hover:bg-white/20"
            }`}
            aria-label={isCameraOff ? "Turn camera on" : "Turn camera off"}
          >
            {isCameraOff ? <VideoOff size={22} /> : <Video size={22} />}
          </button>
        ) : null}

        {/* Accept button (ringing state) */}
        {callState === "ringing" ? (
          <button
            type="button"
            onClick={onAccept}
            className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg shadow-emerald-500/30 transition hover:bg-emerald-400"
            aria-label="Accept call"
          >
            <Phone size={26} />
          </button>
        ) : null}

        {/* End / Reject button */}
        <button
          type="button"
          onClick={callState === "ringing" ? onReject : onEnd}
          className="flex h-16 w-16 items-center justify-center rounded-full bg-red-500 text-white shadow-lg shadow-red-500/30 transition hover:bg-red-400"
          aria-label={callState === "ringing" ? "Reject call" : "End call"}
        >
          <PhoneOff size={26} />
        </button>
      </div>
    </div>
  );
});
