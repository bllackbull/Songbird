import { memo, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Chat,
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
  minimized: controlledMinimized,
  onMinimizeChange,
}) {
  const [internalMinimized, setInternalMinimized] = useState(false);
  const minimized =
    controlledMinimized !== undefined ? controlledMinimized : internalMinimized;
  const setMinimized = useCallback(
    (val) => {
      setInternalMinimized(val);
      onMinimizeChange?.(val);
    },
    [onMinimizeChange],
  );

  const [position, setPosition] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [restoredFromPip, setRestoredFromPip] = useState(false);
  const [pipOriginStyle, setPipOriginStyle] = useState(undefined);
  const boxRef = useRef(null);
  const isDraggingRef = useRef(false);
  const remoteStreamRef = useRef(null);
  const localStreamRef = useRef(null);

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
  const peerColor = callPeer?.color || "#10b981";

  // Reset minimized state and dragged position if call disconnects
  useEffect(() => {
    if (callState !== "connected") {
      setRestoredFromPip(false);
      setPipOriginStyle(undefined);
      setMinimized(false);
      setPosition(null);
    }
  }, [callState, setMinimized]);

  // Prevent body scroll only while call screen is in fullscreen mode
  useEffect(() => {
    if (minimized) {
      document.body.style.overflow = "";
      return;
    }
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [minimized]);

  // Clamp and anchor dragged box to its corner on window resize
  useEffect(() => {
    if (!position) return;
    const handleResize = () => {
      setPosition((prev) => {
        if (!prev) return null;
        const CORNER_MARGIN = 24;
        const width = 176;
        const height = 235;
        const cornerRight = Math.max(
          CORNER_MARGIN,
          window.innerWidth - width - CORNER_MARGIN,
        );
        const cornerBottom = Math.max(
          CORNER_MARGIN,
          window.innerHeight - height - CORNER_MARGIN,
        );
        return {
          x: prev.x < window.innerWidth / 2 ? CORNER_MARGIN : cornerRight,
          y: prev.y < window.innerHeight / 2 ? CORNER_MARGIN : cornerBottom,
        };
      });
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [position]);

  // Maintain active media stream references so switching between fullscreen
  // and floating PiP doesn't lose audio/video feeds.
  const handleRemoteVideoRef = (node) => {
    if (remoteVideoRef) {
      if (typeof remoteVideoRef === "function") {
        remoteVideoRef(node);
      } else {
        if (remoteVideoRef.current?.srcObject) {
          remoteStreamRef.current = remoteVideoRef.current.srcObject;
        }
        remoteVideoRef.current = node;
      }
    }
    if (node) {
      if (remoteStreamRef.current && node.srcObject !== remoteStreamRef.current) {
        node.srcObject = remoteStreamRef.current;
      }
      node.muted = !isSpeakerOn;
      node.play?.().catch(() => {});
    }
  };

  const handleRemoteAudioRef = (node) => {
    if (remoteAudioRef) {
      if (typeof remoteAudioRef === "function") {
        remoteAudioRef(node);
      } else {
        if (remoteAudioRef.current?.srcObject) {
          remoteStreamRef.current = remoteAudioRef.current.srcObject;
        }
        remoteAudioRef.current = node;
      }
    }
    if (node) {
      if (remoteStreamRef.current && node.srcObject !== remoteStreamRef.current) {
        node.srcObject = remoteStreamRef.current;
      }
      node.muted = !isSpeakerOn;
      node.play?.().catch(() => {});
    }
  };

  const handleLocalVideoRef = (node) => {
    if (localVideoRef) {
      if (typeof localVideoRef === "function") {
        localVideoRef(node);
      } else {
        if (localVideoRef.current?.srcObject) {
          localStreamRef.current = localVideoRef.current.srcObject;
        }
        localVideoRef.current = node;
      }
    }
    if (node) {
      if (localStreamRef.current && node.srcObject !== localStreamRef.current) {
        node.srcObject = localStreamRef.current;
      }
      node.play?.().catch(() => {});
    }
  };

  const handlePointerDown = (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    const box = boxRef.current;
    if (!box) return;
    const rect = box.getBoundingClientRect();
    const startX = e.clientX;
    const startY = e.clientY;
    const origX = rect.left;
    const origY = rect.top;
    const rectWidth = rect.width;
    const rectHeight = rect.height;
    let moved = false;
    let currentX = origX;
    let currentY = origY;

    const onPointerMove = (moveEvent) => {
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;
      if (!moved && Math.hypot(dx, dy) > 4) {
        moved = true;
        isDraggingRef.current = true;
        setIsDragging(true);
      }
      if (moved) {
        const maxX = Math.max(0, window.innerWidth - rectWidth);
        const maxY = Math.max(0, window.innerHeight - rectHeight);
        currentX = Math.min(Math.max(0, origX + dx), maxX);
        currentY = Math.min(Math.max(0, origY + dy), maxY);
        setPosition({ x: currentX, y: currentY });
      }
    };

    const onPointerUp = () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      if (moved) {
        setIsDragging(false);

        // Always snap to the nearest corner on release
        const CORNER_MARGIN = 24;
        const cornerLeft = CORNER_MARGIN;
        const cornerRight = Math.max(
          CORNER_MARGIN,
          window.innerWidth - rectWidth - CORNER_MARGIN,
        );
        const cornerTop = CORNER_MARGIN;
        const cornerBottom = Math.max(
          CORNER_MARGIN,
          window.innerHeight - rectHeight - CORNER_MARGIN,
        );

        const snapX =
          currentX + rectWidth / 2 < window.innerWidth / 2
            ? cornerLeft
            : cornerRight;
        const snapY =
          currentY + rectHeight / 2 < window.innerHeight / 2
            ? cornerTop
            : cornerBottom;

        setPosition({ x: snapX, y: snapY });

        setTimeout(() => {
          isDraggingRef.current = false;
        }, 50);
      }
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
  };

  const handleBoxClick = () => {
    if (isDraggingRef.current) return;
    const box = boxRef.current;
    if (box) {
      const rect = box.getBoundingClientRect();
      const targetDeltaX = rect.left + rect.width / 2 - window.innerWidth / 2;
      const targetDeltaY = rect.top + rect.height / 2 - window.innerHeight / 2;
      setPipOriginStyle({
        "--pip-origin-x": `${targetDeltaX}px`,
        "--pip-origin-y": `${targetDeltaY}px`,
      });
    } else {
      setPipOriginStyle(undefined);
    }
    setRestoredFromPip(true);
    setMinimized(false);
  };

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

  return createPortal(
    minimized ? (
      <div
        ref={boxRef}
        data-testid="floating-call-box"
        role="button"
        tabIndex={0}
        aria-label="Return to call"
        title="Click to expand"
        onPointerDown={handlePointerDown}
        onClick={handleBoxClick}
        className={`fixed z-[9999] sb-pip-enter select-none touch-none aspect-[3/4] w-36 sm:w-44 rounded-2xl border-2 border-white/20 shadow-2xl overflow-hidden bg-slate-900 cursor-grab active:cursor-grabbing ${
          isDragging
            ? "transition-none"
            : "transition-[left,top] duration-200 ease-out"
        } ${position ? "" : "top-6 right-6"}`}
        style={position ? { left: `${position.x}px`, top: `${position.y}px` } : undefined}
      >
        {remoteOn ? (
          <video
            ref={handleRemoteVideoRef}
            autoPlay
            playsInline
            aria-label="Remote video"
            className="h-full w-full object-cover pointer-events-none"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center bg-gradient-to-b from-slate-800 to-slate-900 p-3 select-none pointer-events-none">
            <Avatar
              src={callPeer?.avatar || ""}
              alt={peerName}
              name={peerName}
              color={peerColor}
              initials={peerInitials}
              className="h-16 w-16 text-xl shadow-lg ring-2 ring-white/10"
            />
            <span
              className={`mt-2 max-w-[90%] truncate text-xs font-semibold text-white/90 ${
                hasPersian(peerName) ? "font-fa sb-fa-baseline-fix" : ""
              }`}
              dir="auto"
            >
              {peerName}
            </span>
          </div>
        )}
        {!remoteOn ? (
          <audio ref={handleRemoteAudioRef} autoPlay playsInline className="hidden" />
        ) : null}
      </div>
    ) : (
      <div
        className={`fixed inset-0 z-[9999] flex items-center justify-center md:bg-black/45 md:px-5 ${
          restoredFromPip ? "sb-backdrop-enter" : ""
        }`}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Call"
          className={`relative flex h-full w-full flex-col items-center justify-between overflow-hidden bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 md:h-[min(800px,calc(100dvh-2rem))] md:max-w-[400px] md:rounded-3xl md:shadow-xl ${
            restoredFromPip ? "sb-call-modal-enter" : ""
          }`}
          style={restoredFromPip ? pipOriginStyle : undefined}
        >
        {isConnected && !remoteOn ? (
          <audio ref={handleRemoteAudioRef} autoPlay playsInline className="hidden" />
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
          <div className="relative z-20 flex w-full shrink-0 items-center justify-between px-10 sm:px-14 pb-6 pt-14">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <Avatar
                src={callPeer?.avatar || ""}
                alt={peerName}
                name={peerName}
                color={peerColor}
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
            <button
              type="button"
              onClick={() => {
                setRestoredFromPip(false);
                setPipOriginStyle(undefined);
                setPosition(null);
                setMinimized(true);
              }}
              className="ml-3 flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-transparent text-white/90 transition hover:bg-white/10 hover:text-white cursor-pointer"
              aria-label="Chat"
            >
              <Chat size={26} />
            </button>
          </div>
        ) : (
        <div className="relative z-20 flex shrink-0 flex-col items-center pt-14">
          <Avatar
            src={callPeer?.avatar || ""}
            alt={peerName}
            name={peerName}
            color={peerColor}
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
            ref={handleRemoteVideoRef}
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
            ref={handleLocalVideoRef}
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
    ),
    document.body,
  );
});
