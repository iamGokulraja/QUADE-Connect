import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ConnectionState, Room, RoomEvent, Track, VideoPresets } from "livekit-client";

import { supabase } from "../../lib/supabaseClient";
import toast from "../../lib/toast";
import { rpc } from "../../hooks/chat";
import { useChatRuntime } from "../chat/ChatRuntime";
import GlobalCallManager from "./GlobalCallManager";

const CallCtx = createContext(null);
export const useCall = () => useContext(CallCtx);

const ENDED = ["ended", "missed", "declined", "cancelled"];
const ALONE_DIRECT_MS = 4000;     // the other person hung up -> leave shortly after
const ALONE_GROUP_MS = 120000;    // everyone else left a group call -> leave after 2 minutes

const mediaMessage = (e) => {
  const n = e?.name || "";
  if (n === "NotAllowedError" || n === "SecurityError") return "Microphone / camera permission was denied. Allow access in your browser's site settings.";
  if (n === "NotFoundError" || n === "OverconstrainedError") return "No microphone or camera was found on this device.";
  if (n === "NotReadableError") return "Your microphone or camera is being used by another application.";
  return e?.message || "Could not access your microphone or camera.";
};

// Edge Function errors arrive as a Response; read the JSON message when there is one.
async function functionError(error) {
  if (error?.name === "FunctionsFetchError" || error?.name === "FunctionsRelayError") {
    return "The calling service could not be reached. Ask your admin to deploy the 'livekit-token' function in Supabase (Edge Functions) with 'Verify JWT' turned off.";
  }
  try {
    const body = await error.context.json();
    if (body?.error) return body.error;
  } catch { /* fall through */ }
  return error.message || "Could not start the call.";
}

// Two soft beeps every 2 seconds while somebody is calling. Silent if the browser blocks audio.
function useRingtone(on) {
  useEffect(() => {
    if (!on) return undefined;
    let ctx;
    let timer;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      const beep = (at, freq) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, ctx.currentTime + at);
        gain.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + at + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at + 0.35);
        osc.connect(gain).connect(ctx.destination);
        osc.start(ctx.currentTime + at);
        osc.stop(ctx.currentTime + at + 0.4);
      };
      const ring = () => { beep(0, 880); beep(0.45, 660); };
      ring();
      timer = setInterval(ring, 2000);
    } catch { /* no audio available */ }
    return () => { clearInterval(timer); ctx?.close?.().catch(() => {}); };
  }, [on]);
}

/**
 * The ONE place that owns the LiveKit room. It sits at the authenticated app root, above the router outlet,
 * so navigating between pages, minimizing or expanding never disconnects the call.
 */
export function GlobalCallProvider({ children }) {
  const { me } = useChatRuntime();
  const client = useQueryClient();

  const roomRef = useRef(null);
  const audioHost = useRef(null);
  const timers = useRef({});
  const activeRef = useRef(null);
  const hadOthers = useRef(false);

  const [active, setActive] = useState(null);       // the call I am in (or joining)
  const [view, setView] = useState("full");          // "full" | "mini"
  const [tick, setTick] = useState(0);               // bumps on every room event so tiles re-render
  const [incoming, setIncoming] = useState([]);      // calls ringing for me
  const [audioBlocked, setAudioBlocked] = useState(false);

  useEffect(() => { activeRef.current = active; }, [active]);
  const bump = useCallback(() => setTick((t) => t + 1), []);

  // Remote audio lives outside React so it keeps playing when the call window is minimized or the page changes.
  useEffect(() => {
    const host = document.createElement("div");
    host.style.display = "none";
    host.setAttribute("data-call-audio", "");
    document.body.appendChild(host);
    audioHost.current = host;
    return () => host.remove();
  }, []);

  const clearTimers = () => {
    Object.values(timers.current).forEach((t) => { clearInterval(t); clearTimeout(t); });
    timers.current = {};
  };

  // Close everything locally. `notifyServer` tells the database I left (it ends the call when nobody is left).
  const cleanup = useCallback(async (notifyServer, callId) => {
    clearTimers();
    const room = roomRef.current;
    roomRef.current = null;
    hadOthers.current = false;
    if (audioHost.current) audioHost.current.innerHTML = "";
    try { room?.removeAllListeners(); await room?.disconnect(true); } catch { /* already closed */ }
    setActive(null);
    setView("full");
    setAudioBlocked(false);
    if (notifyServer && callId) await rpc("chat_leave_call", { p_call: callId }).catch(() => {});
    client.invalidateQueries({ queryKey: ["chat-calls"] });
    client.invalidateQueries({ queryKey: ["chat-open-call"] });
    client.invalidateQueries({ queryKey: ["chat-messages"] });
  }, [client]);

  const leave = useCallback(() => {
    const a = activeRef.current;
    return a ? cleanup(true, a.callId) : undefined;
  }, [cleanup]);

  const endForAll = useCallback(async () => {
    const a = activeRef.current;
    if (!a) return;
    try { await rpc("chat_end_call", { p_call: a.callId }); } catch (e) { toast.error(e.message); }
    await cleanup(false, a.callId);
  }, [cleanup]);

  const joinCall = useCallback(async ({ callId, conversationId, type, title, accept = false, isDirect = true }) => {
    const current = activeRef.current;
    if (current) {
      if (current.callId === callId) setView("full");
      else toast.error("Leave your current call before joining another one.");
      return;
    }
    setActive({ callId, conversationId, type, title, isDirect, state: "connecting", connectedAt: null });
    setView("full");
    try {
      if (accept) await rpc("chat_respond_call", { p_call: callId, p_accept: true });
      const { data, error } = await supabase.functions.invoke("livekit-token", { body: { call_id: callId } });
      if (error) throw new Error(await functionError(error));
      if (data?.error) throw new Error(data.error);

      const room = new Room({
        adaptiveStream: true,
        dynacast: true,
        audioCaptureDefaults: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        videoCaptureDefaults: { resolution: VideoPresets.h540.resolution },
      });
      roomRef.current = room;

      room
        .on(RoomEvent.TrackSubscribed, (track) => {
          if (track.kind === Track.Kind.Audio && audioHost.current) audioHost.current.appendChild(track.attach());
          bump();
        })
        .on(RoomEvent.TrackUnsubscribed, (track) => { track.detach().forEach((el) => el.remove()); bump(); })
        .on(RoomEvent.ParticipantConnected, () => { hadOthers.current = true; bump(); })
        .on(RoomEvent.ParticipantDisconnected, bump)
        .on(RoomEvent.ActiveSpeakersChanged, bump)
        .on(RoomEvent.TrackMuted, bump)
        .on(RoomEvent.TrackUnmuted, bump)
        .on(RoomEvent.TrackPublished, bump)
        .on(RoomEvent.TrackUnpublished, bump)
        .on(RoomEvent.LocalTrackPublished, bump)
        .on(RoomEvent.LocalTrackUnpublished, bump)
        .on(RoomEvent.AudioPlaybackStatusChanged, () => setAudioBlocked(!room.canPlaybackAudio))
        .on(RoomEvent.MediaDevicesError, (e) => toast.error(mediaMessage(e)))
        .on(RoomEvent.Reconnecting, () => setActive((a) => a && { ...a, state: "reconnecting" }))
        .on(RoomEvent.Reconnected, () => setActive((a) => a && { ...a, state: "connected" }))
        .on(RoomEvent.Disconnected, () => {
          if (roomRef.current !== room) return;           // we closed it ourselves
          toast.error("Connection to the call was lost.");
          cleanup(true, callId);
        });

      await room.connect(data.url, data.token);
      hadOthers.current = room.remoteParticipants.size > 0;
      setActive((a) => a && { ...a, state: "connected", connectedAt: Date.now() });
      if (!room.canPlaybackAudio) setAudioBlocked(true);

      // Microphone (and camera for video calls). A denied permission must not drop the call: stay as a listener.
      try { await room.localParticipant.setMicrophoneEnabled(true); } catch (e) { toast.error(mediaMessage(e)); }
      if (type === "video") {
        try { await room.localParticipant.setCameraEnabled(true); } catch (e) { toast.error(mediaMessage(e)); }
      }
      bump();

      // Heartbeat: keeps my seat in the call; also learns when the call was ended or nobody answered.
      timers.current.ping = setInterval(async () => {
        try {
          const status = await rpc("chat_call_ping", { p_call: callId });
          if (status && ENDED.includes(status) && roomRef.current === room) {
            toast.success(status === "missed" ? "No answer." : "The call has ended.");
            cleanup(false, callId);
          }
        } catch { /* temporary network problem: LiveKit reconnects on its own */ }
      }, 20000);
    } catch (err) {
      toast.error(err.message || "Could not join the call.");
      await cleanup(true, callId);
    }
  }, [bump, cleanup]);

  // Before ringing anybody, make sure the calling service is deployed and has its LiveKit keys.
  const readyRef = useRef(false);
  const callingReady = useCallback(async () => {
    if (readyRef.current) return true;
    const { data, error } = await supabase.functions.invoke("livekit-token", { body: { ping: true } });
    if (error) {
      toast.error(error.name === "FunctionsHttpError"
        ? "The calling service is out of date. Deploy the latest 'livekit-token' function."
        : await functionError(error));
      return false;
    }
    if (!data?.configured) {
      toast.error("Calling is not set up yet: add LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET in Supabase, Edge Functions, Secrets.");
      return false;
    }
    readyRef.current = true;
    return true;
  }, []);

  const startCall = useCallback(async ({ conversationId, type, title, isDirect }) => {
    if (activeRef.current) {
      toast.error("You are already in a call.");
      setView("full");
      return;
    }
    try {
      if (!(await callingReady())) return;
      const callId = await rpc("chat_start_call", { p_conv: conversationId, p_type: type });
      await joinCall({ callId, conversationId, type, title, isDirect });
    } catch (e) {
      toast.error(e.message || "Could not start the call.");
    }
  }, [joinCall, callingReady]);

  /* ---------- controls ---------- */
  const guard = async (fn) => {
    try { await fn(); } catch (e) { toast.error(mediaMessage(e)); }
    bump();
  };
  const toggleMic = () => guard(() => { const lp = roomRef.current?.localParticipant; return lp?.setMicrophoneEnabled(!lp.isMicrophoneEnabled); });
  const toggleCam = () => guard(() => { const lp = roomRef.current?.localParticipant; return lp?.setCameraEnabled(!lp.isCameraEnabled); });
  const toggleScreen = () => guard(() => { const lp = roomRef.current?.localParticipant; return lp?.setScreenShareEnabled(!lp.isScreenShareEnabled); });
  const switchDevice = (kind, id) => guard(() => roomRef.current?.switchActiveDevice(kind, id));
  const startAudio = () => roomRef.current?.startAudio().then(() => setAudioBlocked(false)).catch(() => {});

  // Everyone else left: a one-to-one call closes at once, a group call after a couple of minutes.
  useEffect(() => {
    const room = roomRef.current;
    if (!room || active?.state !== "connected") return undefined;
    clearTimeout(timers.current.alone);
    if (room.remoteParticipants.size === 0 && hadOthers.current) {
      timers.current.alone = setTimeout(() => leave(), active.isDirect ? ALONE_DIRECT_MS : ALONE_GROUP_MS);
    }
    return () => clearTimeout(timers.current.alone);
  }, [tick, active?.state, active?.isDirect, leave]);

  /* ---------- incoming calls ---------- */
  const addIncoming = useCallback(async (callId) => {
    if (!me) return;
    try {
      const info = await rpc("chat_call_info", { p_call: callId });
      if (!info || info.call_status !== "ringing" || info.initiated_by === me.id) return;
      if (Date.now() - new Date(info.created_at).getTime() > 50000) return;
      setIncoming((l) => (l.some((c) => c.id === callId) ? l : [...l, info]));
    } catch { /* call vanished */ }
  }, [me]);

  const dropIncoming = useCallback((callId) => setIncoming((l) => l.filter((c) => c.id !== callId)), []);

  const accept = useCallback(async (info) => {
    dropIncoming(info.id);
    await joinCall({
      callId: info.id, conversationId: info.conversation_id, type: info.call_type, accept: true,
      title: info.conversation_type === "group" ? info.conversation_name : info.caller_name,
      isDirect: info.conversation_type === "direct",
    });
  }, [dropIncoming, joinCall]);

  const decline = useCallback(async (info) => {
    dropIncoming(info.id);
    await rpc("chat_respond_call", { p_call: info.id, p_accept: false }).catch(() => {});
  }, [dropIncoming]);

  useEffect(() => {
    if (!me) { setIncoming([]); return undefined; }
    const meId = me.id;
    const sweep = async () => {
      const { data } = await supabase.from("chat_call_participants").select("call_id").eq("user_id", meId).eq("participant_status", "ringing");
      (data || []).forEach((r) => addIncoming(r.call_id));
    };
    sweep();
    const poll = setInterval(sweep, 15000);                         // safety net if Realtime drops a message
    const onVisible = () => document.visibilityState === "visible" && sweep();
    document.addEventListener("visibilitychange", onVisible);

    const channel = supabase
      .channel(`chat-calls-${meId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_call_participants", filter: `user_id=eq.${meId}` },
        (p) => p.new?.participant_status === "ringing" && addIncoming(p.new.call_id))
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "chat_call_participants", filter: `user_id=eq.${meId}` },
        (p) => p.new?.participant_status !== "ringing" && dropIncoming(p.new.call_id))
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_calls" },
        () => client.invalidateQueries({ queryKey: ["chat-open-call"] }))
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "chat_calls" }, (p) => {
        const row = p.new || {};
        client.invalidateQueries({ queryKey: ["chat-open-call"] });
        if (!ENDED.includes(row.call_status)) return;
        dropIncoming(row.id);
        const a = activeRef.current;
        if (a && a.callId === row.id) {
          toast.success(row.call_status === "missed" ? "No answer." : row.call_status === "declined" ? "The call was declined." : "The call has ended.");
          cleanup(false, row.id);
        }
      })
      .subscribe();

    const expire = setInterval(() => setIncoming((l) => l.filter((c) => Date.now() - new Date(c.created_at).getTime() < 50000)), 2000);
    return () => {
      clearInterval(poll);
      clearInterval(expire);
      document.removeEventListener("visibilitychange", onVisible);
      supabase.removeChannel(channel);
    };
  }, [me, client, addIncoming, dropIncoming, cleanup]);

  useRingtone(incoming.length > 0 && !active);

  // Leaving the app entirely (sign-out, tab closed) must not leave a ghost in the room.
  useEffect(() => {
    if (!me && activeRef.current) cleanup(true, activeRef.current.callId);
  }, [me, cleanup]);
  useEffect(() => {
    const onHide = () => {
      const a = activeRef.current;
      if (a) rpc("chat_leave_call", { p_call: a.callId }).catch(() => {});
    };
    window.addEventListener("pagehide", onHide);
    return () => window.removeEventListener("pagehide", onHide);
  }, []);

  const value = useMemo(() => ({
    me, active, view, setView, tick, incoming, audioBlocked,
    room: roomRef.current, isConnected: roomRef.current?.state === ConnectionState.Connected,
    startCall, joinCall, leave, endForAll, accept, decline,
    toggleMic, toggleCam, toggleScreen, switchDevice, startAudio,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [me, active, view, tick, incoming, audioBlocked, startCall, joinCall, leave, endForAll, accept, decline]);

  return (
    <CallCtx.Provider value={value}>
      {children}
      {me && <GlobalCallManager />}
    </CallCtx.Provider>
  );
}
