import { useEffect, useRef, useState } from "react";
import { Camera, CameraOff, Headphones, Maximize2, Mic, MicOff, PhoneOff } from "lucide-react";

import { initials } from "../../lib/chat";
import { useCall } from "./GlobalCallProvider";
import { RoundBtn, VideoSurface, cameraTrack, screenTrack, useDuration, useParticipants } from "./callParts";

const W = 288;
const KEY = "qc-call-window";
const readPos = () => { try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } };
const clamp = (p, h) => ({
  x: Math.min(Math.max(8, p.x), Math.max(8, window.innerWidth - W - 8)),
  y: Math.min(Math.max(8, p.y), Math.max(8, window.innerHeight - h - 8)),
});

// The minimized call: a small window that floats above every page and can be dragged anywhere.
// The LiveKit room is untouched here - only the view changes.
export default function FloatingCallWindow() {
  const { active, room, setView, leave, toggleMic, toggleCam } = useCall();
  const people = useParticipants();
  const duration = useDuration(active.connectedAt);
  const video = active.type === "video";
  const H = video ? 216 : 108;
  const [pos, setPos] = useState(() => clamp(readPos() || { x: window.innerWidth - W - 16, y: window.innerHeight - H - 16 }, H));
  const drag = useRef(null);

  useEffect(() => {
    const onResize = () => setPos((p) => clamp(p, H));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [H]);

  const down = (e) => {
    if (e.target.closest("button")) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y, sx: e.clientX, sy: e.clientY, moved: false };
  };
  const move = (e) => {
    const d = drag.current;
    if (!d) return;
    if (Math.abs(e.clientX - d.sx) + Math.abs(e.clientY - d.sy) > 4) d.moved = true;
    setPos(clamp({ x: e.clientX - d.dx, y: e.clientY - d.dy }, H));
  };
  const up = () => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (d.moved) { try { localStorage.setItem(KEY, JSON.stringify(pos)); } catch { /* storage unavailable */ } }
    else setView("full");                                  // a plain click expands the meeting
  };

  const lp = room?.localParticipant;
  const remote = people.filter((p) => !p.isLocal);
  const featured = people.find((p) => screenTrack(p))
    || remote.find((p) => p.isSpeaking && cameraTrack(p)) || remote.find((p) => cameraTrack(p)) || (cameraTrack(lp) ? lp : null);
  const track = featured ? screenTrack(featured) || cameraTrack(featured) : null;
  const speaker = remote.find((p) => p.isSpeaking) || remote[0];

  return (
    <div data-keep-colors role="dialog" aria-label="Call in progress" onPointerDown={down} onPointerMove={move} onPointerUp={up}
      style={{ left: pos.x, top: pos.y, width: W, touchAction: "none" }}
      className="fixed z-[100] cursor-grab select-none overflow-hidden rounded-2xl border border-slate-600 bg-[#0D172A] shadow-2xl shadow-black/60 active:cursor-grabbing">
      {video ? (
        <div className="relative h-[136px] bg-black">
          {track ? <VideoSurface track={track} mirror={featured?.isLocal} contain={!!featured && track === screenTrack(featured)} /> : (
            <div className="grid h-full place-items-center"><span className="grid h-14 w-14 place-items-center rounded-full bg-blue-600/30 text-lg font-bold text-blue-100">{initials(speaker?.name || active.title)}</span></div>
          )}
          <span className="absolute left-2 top-2 rounded-md bg-black/60 px-2 py-0.5 font-mono text-[11px] text-white">{duration}</span>
          <span className="absolute right-2 top-2 rounded-md bg-black/60 px-2 py-0.5 text-[11px] text-white">{people.length} in call</span>
        </div>
      ) : (
        <div className="flex items-center gap-3 px-3 pt-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-blue-600/30 text-blue-200"><Headphones size={18} /></span>
          <div className="min-w-0"><p className="truncate text-sm font-bold text-white">{active.title}</p><p className="font-mono text-xs text-slate-300">{duration} · {people.length} in call</p></div>
        </div>
      )}
      <div className="flex items-center justify-between gap-2 px-3 py-2.5">
        <p className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-200">{video ? active.title : lp?.isMicrophoneEnabled ? "Microphone on" : "Muted"}</p>
        <div className="flex items-center gap-2">
          <RoundBtn icon={lp?.isMicrophoneEnabled ? Mic : MicOff} active={!!lp?.isMicrophoneEnabled} onClick={toggleMic} label={lp?.isMicrophoneEnabled ? "Mute" : "Unmute"} size={34} />
          {video && <RoundBtn icon={lp?.isCameraEnabled ? Camera : CameraOff} active={!!lp?.isCameraEnabled} onClick={toggleCam} label="Camera" size={34} />}
          <RoundBtn icon={Maximize2} onClick={() => setView("full")} label="Expand call" size={34} />
          <RoundBtn icon={PhoneOff} danger onClick={leave} label="End call" size={34} />
        </div>
      </div>
    </div>
  );
}
