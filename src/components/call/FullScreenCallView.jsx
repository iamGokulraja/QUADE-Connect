import { useEffect, useState } from "react";
import { Room } from "livekit-client";
import { Camera, CameraOff, Headphones, Loader, Mic, MicOff, Minimize2, MonitorUp, PhoneOff, PictureInPicture2, Settings, Users, Volume2, X } from "lucide-react";

import { useCall } from "./GlobalCallProvider";
import { ParticipantTile, RoundBtn, screenTrack, useDuration, useParticipants } from "./callParts";

function DevicePicker({ onClose }) {
  const { room, switchDevice } = useCall();
  const [lists, setLists] = useState({ audioinput: [], videoinput: [], audiooutput: [] });
  useEffect(() => {
    let alive = true;
    (async () => {
      const out = {};
      for (const kind of ["audioinput", "videoinput", "audiooutput"]) {
        try { out[kind] = await Room.getLocalDevices(kind); } catch { out[kind] = []; }
      }
      if (alive) setLists(out);
    })();
    return () => { alive = false; };
  }, []);
  const Row = ({ kind, title }) => (
    <label className="block text-xs">
      <span className="mb-1 block font-semibold uppercase tracking-wider text-slate-400">{title}</span>
      <select value={room?.getActiveDevice(kind) || ""} onChange={(e) => switchDevice(kind, e.target.value)}
        disabled={!lists[kind].length}
        className="w-full rounded-lg border border-slate-700 bg-[#0D172A] px-2 py-2 text-sm text-white">
        {!lists[kind].length && <option value="">{kind === "audiooutput" ? "Default (not selectable here)" : "No device found"}</option>}
        {lists[kind].map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label || d.deviceId.slice(0, 8)}</option>)}
      </select>
    </label>
  );
  return (
    <div className="absolute bottom-20 left-1/2 z-10 w-[min(20rem,92vw)] -translate-x-1/2 space-y-3 rounded-2xl border border-slate-700 bg-[#111C32] p-4 shadow-2xl">
      <div className="flex items-center justify-between"><strong className="text-sm text-white">Devices</strong>
        <button onClick={onClose} aria-label="Close devices" className="text-slate-400 hover:text-white"><X size={16} /></button></div>
      <Row kind="audioinput" title="Microphone" />
      <Row kind="videoinput" title="Camera" />
      <Row kind="audiooutput" title="Speaker" />
    </div>
  );
}

const gridCols = (n) => (n <= 1 ? "grid-cols-1" : n === 2 ? "grid-cols-1 md:grid-cols-2" : n <= 4 ? "grid-cols-2" : n <= 9 ? "grid-cols-2 md:grid-cols-3" : "grid-cols-2 md:grid-cols-3 xl:grid-cols-4");

export default function FullScreenCallView() {
  const { active, room, setView, leave, endForAll, toggleMic, toggleCam, toggleScreen, audioBlocked, startAudio } = useCall();
  const people = useParticipants();
  const [devices, setDevices] = useState(false);
  const duration = useDuration(active.connectedAt);
  const video = active.type === "video";
  const lp = room?.localParticipant;
  const sharer = people.find((p) => screenTrack(p));
  const remote = people.filter((p) => !p.isLocal);
  const oneToOne = video && !!lp && remote.length === 1;
  const canShare = !!navigator.mediaDevices?.getDisplayMedia;

  const pip = async () => {
    const el = document.querySelector("[data-call-stage] video");
    try { await el?.requestPictureInPicture(); } catch { /* not supported or blocked */ }
  };

  const status = active.state === "connecting" ? "Connecting..." : active.state === "reconnecting" ? "Reconnecting..." : null;
  const waiting = active.state === "connected" && people.length === 1;

  return (
    <div data-keep-colors className="fixed inset-0 z-[100] flex flex-col bg-[#070D1A] text-white" role="dialog" aria-label="Call">
      <header className="flex items-center justify-between gap-3 border-b border-slate-800 px-4 py-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 truncate text-base font-bold">
            {video ? <Camera size={16} className="text-blue-400" /> : <Headphones size={16} className="text-blue-400" />}
            <span className="truncate">{active.title || "Call"}</span>
          </h2>
          <p className="flex flex-wrap items-center gap-x-3 text-xs text-slate-400">
            <span className="font-mono text-slate-200">{duration}</span>
            <span className="flex items-center gap-1"><Users size={12} /> {people.length} in call</span>
            {status && <span className="flex items-center gap-1 text-amber-300"><Loader size={12} className="animate-spin" /> {status}</span>}
          </p>
        </div>
        <button onClick={() => setView("mini")} className="flex items-center gap-2 rounded-xl border border-slate-700 bg-[#111C32] px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800">
          <Minimize2 size={15} /> Minimize
        </button>
      </header>

      {audioBlocked && (
        <button onClick={startAudio} className="mx-4 mt-3 flex items-center justify-center gap-2 rounded-xl bg-amber-500/20 px-4 py-2 text-sm font-semibold text-amber-200">
          <Volume2 size={16} /> Click to hear the other participants
        </button>
      )}

      <div data-call-stage className="min-h-0 flex-1 overflow-y-auto p-4">
        {active.state === "connecting" ? (
          <div className="grid h-full place-items-center text-slate-400"><span className="flex items-center gap-2"><Loader className="animate-spin" /> Joining the call...</span></div>
        ) : sharer ? (
          <div className="grid h-full gap-3 lg:grid-cols-[1fr_16rem]">
            <ParticipantTile p={sharer} track={screenTrack(sharer)} />
            <div className="grid auto-rows-[8rem] content-start gap-3 overflow-y-auto">
              {people.map((p) => <ParticipantTile key={p.identity} p={p} compact audioOnly={!video} />)}
            </div>
          </div>
        ) : oneToOne ? (
          <div className="relative h-full min-h-[16rem]">
            <div className="grid h-full"><ParticipantTile p={remote[0]} /></div>
            <div className="absolute bottom-3 right-3 grid h-28 w-40 overflow-hidden rounded-2xl shadow-2xl shadow-black/60 sm:h-36 sm:w-52">
              <ParticipantTile p={lp} compact />
            </div>
          </div>
        ) : (
          <div className={`grid h-full auto-rows-fr gap-3 ${gridCols(people.length)}`}>
            {people.map((p) => <ParticipantTile key={p.identity} p={p} audioOnly={!video} />)}
          </div>
        )}
        {waiting && <p className="mt-3 text-center text-sm text-slate-400">Waiting for others to join...</p>}
      </div>

      <footer className="relative flex flex-wrap items-center justify-center gap-3 border-t border-slate-800 bg-[#0B1120] px-4 py-4">
        {devices && <DevicePicker onClose={() => setDevices(false)} />}
        <RoundBtn icon={lp?.isMicrophoneEnabled ? Mic : MicOff} active={!!lp?.isMicrophoneEnabled} onClick={toggleMic} label={lp?.isMicrophoneEnabled ? "Mute microphone" : "Unmute microphone"} />
        {video && <RoundBtn icon={lp?.isCameraEnabled ? Camera : CameraOff} active={!!lp?.isCameraEnabled} onClick={toggleCam} label={lp?.isCameraEnabled ? "Turn camera off" : "Turn camera on"} />}
        {video && canShare && <RoundBtn icon={MonitorUp} active={!lp?.isScreenShareEnabled} onClick={toggleScreen} label={lp?.isScreenShareEnabled ? "Stop sharing" : "Share screen"} />}
        <RoundBtn icon={Settings} onClick={() => setDevices((v) => !v)} label="Devices" />
        {video && document.pictureInPictureEnabled && <RoundBtn icon={PictureInPicture2} onClick={pip} label="Pop out (picture-in-picture)" />}
        <RoundBtn icon={PhoneOff} danger onClick={leave} label="Leave call" size={52} />
        {!active.isDirect && (
          <button onClick={() => window.confirm("End this call for everyone?") && endForAll()}
            className="rounded-xl border border-red-500/40 px-3 py-2 text-xs font-semibold text-red-300 hover:bg-red-500/10">End for everyone</button>
        )}
      </footer>
    </div>
  );
}
