import { useEffect, useRef, useState } from "react";
import { Send, Trash2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

import { supabase } from "../../lib/supabaseClient";
import { ROLE_LABEL } from "../../lib/constants";
import { personName } from "../../hooks/queries";
import { useBoardMessages } from "../../hooks/boards";
import { ErrorBox, inputCls } from "../ui";
import { avatarColor } from "./chatUtils";

// Discussion thread of one board. Everyone who can open the board can read and write;
// the other people on the board get a notification for every message.
export default function BoardChat({ board, me, people }) {
  const client = useQueryClient();
  const { data: messages = [], error: loadError } = useBoardMessages(board.id);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef(null);

  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [messages.length]);

  const send = async () => {
    const body = text.trim();
    if (!body) return;
    setBusy(true);
    const { error: err } = await supabase.from("board_messages").insert({ board_id: board.id, sender_id: me.id, body });
    setBusy(false);
    if (err) return setError(err.message);
    setError(""); setText("");
    client.invalidateQueries({ queryKey: ["board-messages", board.id] });
  };
  const remove = async (m) => {
    const { error: err } = await supabase.from("board_messages").delete().eq("id", m.id);
    if (err) return setError(err.message);
    client.invalidateQueries({ queryKey: ["board-messages", board.id] });
  };

  return (
    <div className="flex h-[480px] flex-col p-4">
      <ErrorBox error={error || loadError?.message} />
      <div className="flex-1 space-y-3 overflow-y-auto rounded-xl bg-[#0D172A] p-4">
        {messages.length === 0 && <p className="py-10 text-center text-sm text-slate-500">No messages yet. Start the discussion for “{board.name}”.</p>}
        {messages.map((m) => {
          const mine = m.sender_id === me.id;
          const name = personName(people, m.sender_id);
          return (
            <div key={m.id} className={`flex gap-3 ${mine ? "flex-row-reverse" : ""}`}>
              <span style={{ background: avatarColor(m.sender_id) }} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white">{name[0]}</span>
              <div className={`group max-w-[75%] rounded-xl px-3 py-2 text-sm ${mine ? "bg-blue-600/30 text-white" : "bg-[#17243D] text-slate-200"}`}>
                <p className="mb-0.5 text-[11px] text-slate-400">
                  {mine ? "You" : name} · {ROLE_LABEL[people[m.sender_id]?.role] || ""} · {new Date(m.created_at).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                  {mine && <button onClick={() => remove(m)} aria-label="Delete message" className="ml-2 hidden text-slate-500 hover:text-red-400 group-hover:inline"><Trash2 size={11} /></button>}
                </p>
                <p className="whitespace-pre-wrap break-words">{m.body}</p>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
      <div className="mt-3 flex gap-2">
        <input className={inputCls} placeholder="Write a message to everyone on this board" value={text} maxLength={2000}
          onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()} />
        <button onClick={send} disabled={busy || !text.trim()} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"><Send size={15} /> Send</button>
      </div>
    </div>
  );
}
