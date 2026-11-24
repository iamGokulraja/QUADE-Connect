import { useEffect, useMemo, useRef, useState } from "react";
import { Track } from "livekit-client";
import { MicOff } from "lucide-react";

import { fmtDuration, initials } from "../../lib/chat";
import { useCall } from "./GlobalCallProvider";

// All people currently in the room (me first). Re-evaluated whenever the room reports a change (tick).
export function useParticipants() {
  const { room, tick } = useCall();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => (room ? [room.localParticipant, ...room.remoteParticipants.values()] : []), [room, tick]);
}

export function useDuration(since) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!since) return undefined;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [since]);
  return since ? fmtDuration((now - since) / 1000) : "00:00";
}

export const displayName = (p) => (p?.name || p?.identity || "Guest") + (p?.isLocal ? " (You)" : "");
export const cameraTrack = (p) => {
  const pub = p?.getTrackPublication(Track.Source.Camera);
  return pub && !pub.isMuted ? pub.track : null;
};
export const screenTrack = (p) => p?.getTrackPublication(Track.Source.ScreenShare)?.track || null;

// Attaches a LiveKit video track to a <video>. Detaching on unmount keeps the track alive in the room,
// so the same track simply re-attaches when the call view changes between full screen and floating.
export function VideoSurface({ track, mirror = false, contain = false, className = "" }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !track) return undefined;
    track.attach(el);
    return () => { track.detach(el); };
  }, [track]);
  return (
    <video ref={ref} autoPlay playsInline muted
      className={`h-full w-full ${contain ? "object-contain" : "object-cover"} ${mirror ? "-scale-x-100" : ""} ${className}`} />
  );
}

export function ParticipantTile({ p, track, label, audioOnly = false, compact = false }) {
  const video = track || (audioOnly ? null : cameraTrack(p));
  const isScreen = track && track === screenTrack(p);
  const speaking = p.isSpeaking;
  const muted = !p.isMicrophoneEnabled;
  return (
    <div className={`relative overflow-hidden rounded-2xl border bg-[#0D172A] ${speaking ? "border-emerald-400 shadow-[0_0_0_2px_rgba(52,211,153,0.5)]" : "border-slate-700"} ${compact ? "min-h-[7rem]" : "min-h-[10rem]"}`}>
      {video ? (
        <VideoSurface track={video} mirror={p.isLocal && !isScreen} contain={isScreen} />
      ) : (
        <div className="grid h-full w-full place-items-center p-4">
          <span className={`grid place-items-center rounded-full bg-blue-600/30 font-bold text-blue-100 ${compact ? "h-14 w-14 text-lg" : "h-20 w-20 text-2xl"} ${speaking ? "ring-4 ring-emerald-400/70" : ""}`}>
            {initials(p.name || p.identity)}
          </span>
        </div>
      )}
      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-gradient-to-t from-black/70 to-transparent px-3 py-2">
        <span className="truncate text-xs font-semibold text-white">{label || displayName(p)}{isScreen ? " · screen" : ""}</span>
        {muted && <span title="Microphone off" className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-red-600/80 text-white"><MicOff size={12} /></span>}
      </div>
    </div>
  );
}

export const RoundBtn = ({ icon: Icon, onClick, active = true, danger = false, label, size = 44, disabled }) => (
  <button type="button" onClick={onClick} title={label} aria-label={label} disabled={disabled}
    style={{ width: size, height: size }}
    className={`grid shrink-0 place-items-center rounded-full transition disabled:opacity-40 ${
      danger ? "bg-red-600 text-white hover:bg-red-500"
      : active ? "bg-slate-700/80 text-white hover:bg-slate-600" : "bg-white text-slate-900 hover:bg-slate-200"}`}>
    <Icon size={size / 2.4} />
  </button>
);
