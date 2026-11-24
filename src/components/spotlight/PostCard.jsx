import { useState } from "react";
import { Heart, MessageCircle, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import toast from "../../lib/toast";
import { supabase } from "../../lib/supabaseClient";
import { Modal, inputCls, btnPrimary, btnGhost } from "../ui";
import { CATEGORIES, CATEGORY_STYLE, canModerate, roleLabel, timeAgo, useSpotlightRefresh } from "../../hooks/spotlight";
import LikesModal from "./LikesModal";
import Avatar from "./Avatar";
import PostImages from "./PostImages";
import Comments from "./Comments";

export default function PostCard({ post, me, authors }) {
  const refresh = useSpotlightRefresh();
  const [menu, setMenu] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [edit, setEdit] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [likesOpen, setLikesOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState({ content: post.content, category: post.category });
  const mine = post.user_id === me.id;
  const mod = canModerate(me);

  const toggleLike = async () => {
    const { error } = post.liked_by_me
      ? await supabase.from("spotlight_likes").delete().eq("post_id", post.id).eq("user_id", me.id)
      : await supabase.from("spotlight_likes").insert({ post_id: post.id, user_id: me.id });
    if (error && error.code !== "23505") return toast.error(error.message);
    refresh("sp-feed", "sp-likers");
  };

  const saveEdit = async () => {
    if (!draft.content.trim() && !post.images?.length) return toast.error("A post needs some text.");
    setBusy(true);
    const { error } = await supabase.from("spotlight_posts").update({ content: draft.content.trim(), category: draft.category }).eq("id", post.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Post updated."); setEdit(false); refresh("sp-feed", "sp-highlights");
  };

  const remove = async () => {
    setBusy(true);
    const { error } = await supabase.from("spotlight_posts").delete().eq("id", post.id);
    if (error) { setBusy(false); return toast.error(error.message); }
    if (post.images?.length) await supabase.storage.from("spotlight").remove(post.images); // best-effort cleanup
    setBusy(false); setConfirm(false);
    toast.success("Post deleted."); refresh("sp-feed", "sp-highlights");
  };

  return (
    <article className="overflow-hidden rounded-2xl border border-slate-700/70 bg-[#111C32] p-4 shadow-lg shadow-black/10 transition hover:border-slate-600">
      <header className="flex items-start gap-3">
        <Avatar name={post.author_name} path={post.author_avatar} size={44} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-white">{post.author_name}</p>
          <p className="truncate text-xs text-slate-400">{post.author_designation || roleLabel(post.author_role)}</p>
          <p className="text-[11px] text-slate-500" title={new Date(post.created_at).toLocaleString("en-IN")}>
            {timeAgo(post.created_at)}{post.updated_at > post.created_at && " · edited"}
          </p>
        </div>
        <span className={`hidden shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-medium sm:inline ${CATEGORY_STYLE[post.category] || CATEGORY_STYLE["General Updates"]}`}>{post.category}</span>
        {(mine || mod) && (
          <div className="relative">
            <button onClick={() => setMenu(!menu)} aria-label="More options" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-700"><MoreHorizontal size={18} /></button>
            {menu && (
              <div className="absolute right-0 z-10 mt-1 w-40 overflow-hidden rounded-xl border border-slate-700 bg-[#0D172A] text-sm shadow-xl" onMouseLeave={() => setMenu(false)}>
                {mine && <button onClick={() => { setMenu(false); setEdit(true); }} className="flex w-full items-center gap-2 px-3 py-2 text-slate-200 hover:bg-slate-800"><Pencil size={14} /> Edit post</button>}
                <button onClick={() => { setMenu(false); setConfirm(true); }} className="flex w-full items-center gap-2 px-3 py-2 text-red-400 hover:bg-slate-800"><Trash2 size={14} /> {mine ? "Delete post" : "Remove (moderate)"}</button>
              </div>
            )}
          </div>
        )}
      </header>

      {post.content && <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-200">{post.content}</p>}
      <PostImages paths={post.images || []} />

      {(post.like_count > 0 || post.comment_count > 0) && (
        <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
          {post.like_count > 0 ? (
            <button onClick={() => setLikesOpen(true)} className="group inline-flex items-center gap-1.5 hover:text-white" title="See who liked this">
              <span className="grid h-5 w-5 place-items-center rounded-full bg-pink-500"><Heart size={11} className="fill-white text-white" /></span>
              <span className="group-hover:underline">{post.liked_by_me ? (post.like_count === 1 ? "You" : `You and ${post.like_count - 1} ${post.like_count === 2 ? "other" : "others"}`) : `${post.like_count} ${post.like_count === 1 ? "like" : "likes"}`}</span>
            </button>
          ) : <span />}
          {post.comment_count > 0 && (
            <button onClick={() => setShowComments(!showComments)} className="hover:text-white hover:underline">
              {post.comment_count} {post.comment_count === 1 ? "comment" : "comments"}
            </button>
          )}
        </div>
      )}
      <footer className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-700/60 pt-2 text-sm font-medium">
        <button onClick={toggleLike} aria-pressed={post.liked_by_me}
          className={`flex items-center justify-center gap-2 rounded-lg py-2 transition hover:bg-slate-800 ${post.liked_by_me ? "text-pink-400" : "text-slate-400 hover:text-pink-400"}`}>
          <Heart size={18} fill={post.liked_by_me ? "currentColor" : "none"} /> {post.liked_by_me ? "Liked" : "Like"}
        </button>
        <button onClick={() => setShowComments(!showComments)}
          className={`flex items-center justify-center gap-2 rounded-lg py-2 transition hover:bg-slate-800 ${showComments ? "text-blue-400" : "text-slate-400 hover:text-blue-400"}`}>
          <MessageCircle size={18} /> Comment
        </button>
      </footer>
      {showComments && <Comments post={post} me={me} authors={authors} />}

      {likesOpen && <LikesModal post={post} authors={authors} me={me} onClose={() => setLikesOpen(false)} />}

      {edit && (
        <Modal title="Edit post" onClose={() => setEdit(false)}
          footer={<><button className={btnGhost} onClick={() => setEdit(false)}>Cancel</button><button className={btnPrimary} disabled={busy} onClick={saveEdit}>Save changes</button></>}>
          <textarea rows={5} maxLength={5000} value={draft.content} onChange={(e) => setDraft({ ...draft, content: e.target.value })} className={inputCls} />
          <select value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} className={inputCls}>
            {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </Modal>
      )}
      {confirm && (
        <Modal title="Delete this post?" subtitle="This also removes its photos, likes and comments. It cannot be undone." onClose={() => setConfirm(false)}
          footer={<><button className={btnGhost} onClick={() => setConfirm(false)}>Cancel</button><button className="rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50" disabled={busy} onClick={remove}>{busy ? "Deleting…" : "Delete"}</button></>}>
          <p className="line-clamp-3 text-sm text-slate-400">{post.content || "Photo post"}</p>
        </Modal>
      )}
    </article>
  );
}
