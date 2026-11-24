import { useState } from "react";
import { Pencil, Trash2, CornerDownRight } from "lucide-react";
import toast from "../../lib/toast";
import { supabase } from "../../lib/supabaseClient";
import { inputCls, btnPrimary, Loading } from "../ui";
import { useComments, canModerate, timeAgo, useSpotlightRefresh } from "../../hooks/spotlight";
import Avatar from "./Avatar";

function Composer({ placeholder, initial = "", onSubmit, onCancel, submitLabel = "Send" }) {
  const [v, setV] = useState(initial);
  const [busy, setBusy] = useState(false);
  const go = async () => {
    if (!v.trim()) return;
    setBusy(true);
    try { await onSubmit(v.trim()); setV(""); } finally { setBusy(false); }
  };
  return (
    <div className="flex gap-2">
      <input value={v} maxLength={2000} onChange={(e) => setV(e.target.value)} placeholder={placeholder} className={inputCls}
        onKeyDown={(e) => e.key === "Enter" && go()} />
      <button onClick={go} disabled={busy || !v.trim()} className={btnPrimary}>{submitLabel}</button>
      {onCancel && <button onClick={onCancel} className="text-xs text-slate-400">Cancel</button>}
    </div>
  );
}

export default function Comments({ post, me, authors }) {
  const { data = [], isLoading } = useComments(post.id, true);
  const refresh = useSpotlightRefresh();
  const [replyTo, setReplyTo] = useState(null);
  const [editing, setEditing] = useState(null);
  const byId = Object.fromEntries(authors.map((a) => [a.id, a]));
  const mod = canModerate(me);
  const done = () => { refresh("sp-comments", "sp-feed"); };

  const add = async (content, parent = null) => {
    const { error } = await supabase.from("spotlight_comments").insert({ post_id: post.id, user_id: me.id, content, parent_comment_id: parent });
    if (error) return toast.error(error.message);
    setReplyTo(null); done();
  };
  const save = async (id, content) => {
    const { error } = await supabase.from("spotlight_comments").update({ content }).eq("id", id);
    if (error) return toast.error(error.message);
    setEditing(null); toast.success("Comment updated."); done();
  };
  const remove = async (c) => {
    if (!window.confirm("Delete this comment?")) return;
    const { error } = await supabase.from("spotlight_comments").delete().eq("id", c.id);
    if (error) return toast.error(error.message);
    toast.success("Comment deleted."); done();
  };

  const Row = ({ c, reply }) => {
    const a = byId[c.user_id];
    const mine = c.user_id === me.id;
    return (
      <div className={`flex gap-2 ${reply ? "ml-10" : ""}`}>
        <Avatar name={a?.full_name} path={a?.avatar_path} size={reply ? 28 : 32} />
        <div className="min-w-0 flex-1">
          {editing === c.id ? (
            <Composer initial={c.content} submitLabel="Save" onSubmit={(v) => save(c.id, v)} onCancel={() => setEditing(null)} />
          ) : (
            <div className="rounded-xl bg-[#0D172A] px-3 py-2">
              <p className="text-xs font-semibold text-white">{a?.full_name || "Former member"} <span className="font-normal text-slate-500">· {timeAgo(c.created_at)}{c.updated_at > c.created_at && " · edited"}</span></p>
              <p className="whitespace-pre-wrap break-words text-sm text-slate-300">{c.content}</p>
            </div>
          )}
          <div className="mt-1 flex gap-3 px-1 text-[11px] text-slate-500">
            <button onClick={() => setReplyTo(replyTo === c.id ? null : (c.parent_comment_id || c.id))} className="hover:text-blue-400"><CornerDownRight size={11} className="mr-1 inline" />Reply</button>
            {mine && <button onClick={() => setEditing(c.id)} className="hover:text-blue-400"><Pencil size={11} className="mr-1 inline" />Edit</button>}
            {(mine || mod) && <button onClick={() => remove(c)} className="hover:text-red-400"><Trash2 size={11} className="mr-1 inline" />Delete</button>}
          </div>
        </div>
      </div>
    );
  };

  if (isLoading) return <Loading />;
  const top = data.filter((c) => !c.parent_comment_id);
  return (
    <div className="mt-3 space-y-3 border-t border-slate-700/60 pt-3">
      {top.map((c) => (
        <div key={c.id} className="space-y-2">
          <Row c={c} />
          {data.filter((r) => r.parent_comment_id === c.id).map((r) => <Row key={r.id} c={r} reply />)}
          {replyTo === c.id && <div className="ml-10"><Composer placeholder="Write a reply…" onSubmit={(v) => add(v, c.id)} onCancel={() => setReplyTo(null)} submitLabel="Reply" /></div>}
        </div>
      ))}
      {top.length === 0 && <p className="text-xs text-slate-500">No comments yet. Be the first.</p>}
      <Composer placeholder="Write a comment…" onSubmit={(v) => add(v)} />
    </div>
  );
}
