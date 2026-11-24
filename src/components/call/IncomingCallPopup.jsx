import { Phone, PhoneOff, Video } from "lucide-react";

import ChatAvatar from "../chat/ChatAvatar";
import { useCall } from "./GlobalCallProvider";

export function IncomingCallPopup({ call, busy }) {
  const { accept, decline } = useCall();
  const group = call.conversation_type === "group";
  const video = call.call_type === "video";
  return (
    <div data-keep-colors role="alertdialog" aria-label="Incoming call"
      className="overflow-hidden rounded-2xl border border-blue-500/40 bg-[#111C32] p-4 shadow-2xl shadow-blue-900/40">
      <div className="flex items-center gap-3">
        <ChatAvatar name={call.caller_name} path={call.caller_avatar} size={52} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-white">{call.caller_name}</p>
          <p className="flex items-center gap-1.5 text-xs text-blue-300">
            {video ? <Video size={13} /> : <Phone size={13} />}
            Incoming {video ? "video" : "audio"} call
          </p>
          {group && <p className="truncate text-xs text-slate-400">in {call.conversation_name || "group"}</p>}
        </div>
      </div>
      {busy && <p className="mt-2 text-[11px] text-amber-300">You are in another call. Leave it to answer.</p>}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <button onClick={() => decline(call)}
          className="flex items-center justify-center gap-2 rounded-xl bg-red-600 py-2.5 text-sm font-semibold text-white transition hover:bg-red-500">
          <PhoneOff size={16} /> Decline
        </button>
        <button onClick={() => accept(call)} disabled={busy}
          className="flex items-center justify-center gap-2 rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-40">
          {video ? <Video size={16} /> : <Phone size={16} />} Accept
        </button>
      </div>
    </div>
  );
}
