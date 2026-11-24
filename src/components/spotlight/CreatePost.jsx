import { useRef, useState, useEffect } from "react";
import { ImagePlus, X, Send } from "lucide-react";
import toast from "../../lib/toast";
import { supabase } from "../../lib/supabaseClient";
import { inputCls, btnPrimary } from "../ui";
import { CATEGORIES, MAX_PHOTOS, MAX_PHOTO_MB, PHOTO_TYPES, useSpotlightRefresh } from "../../hooks/spotlight";
import Avatar from "./Avatar";

const ext = (f) => ({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" })[f.type];

export default function CreatePost({ me, avatarPath, onDone }) {
  const refresh = useSpotlightRefresh();
  const input = useRef(null);
  const [content, setContent] = useState("");
  const [category, setCategory] = useState("General Updates");
  const [files, setFiles] = useState([]); // [{file, url}]
  const [busy, setBusy] = useState(false);

  useEffect(() => () => files.forEach((f) => URL.revokeObjectURL(f.url)), []); // eslint-disable-line

  const pick = (list) => {
    const ok = [];
    for (const file of Array.from(list)) {
      if (!PHOTO_TYPES.includes(file.type)) { toast.error(`${file.name}: only JPG, PNG, WebP or GIF images.`); continue; }
      if (file.size > MAX_PHOTO_MB * 1024 * 1024) { toast.error(`${file.name}: larger than ${MAX_PHOTO_MB} MB.`); continue; }
      ok.push({ file, url: URL.createObjectURL(file) });
    }
    const room = MAX_PHOTOS - files.length;
    if (ok.length > room) { toast.error(`You can add up to ${MAX_PHOTOS} photos.`); ok.slice(room).forEach((o) => URL.revokeObjectURL(o.url)); }
    setFiles((f) => [...f, ...ok.slice(0, Math.max(room, 0))]);
    if (input.current) input.current.value = "";
  };
  const drop = (i) => { URL.revokeObjectURL(files[i].url); setFiles((f) => f.filter((_, x) => x !== i)); };

  const publish = async () => {
    if (!content.trim() && !files.length) return toast.error("Write something or add a photo.");
    setBusy(true);
    const uploaded = [];
    let postId = null;
    try {
      const { data: post, error } = await supabase.from("spotlight_posts")
        .insert({ user_id: me.id, content: content.trim(), category }).select("id").single();
      if (error) throw error;
      postId = post.id;
      for (const { file } of files) {
        const path = `${me.id}/posts/${postId}/${crypto.randomUUID()}.${ext(file)}`;
        const { error: upErr } = await supabase.storage.from("spotlight").upload(path, file, { contentType: file.type });
        if (upErr) throw upErr;
        uploaded.push(path);
      }
      if (uploaded.length) {
        const { error: imgErr } = await supabase.from("spotlight_post_images").insert(uploaded.map((image_path) => ({ post_id: postId, image_path })));
        if (imgErr) throw imgErr;
      }
      files.forEach((f) => URL.revokeObjectURL(f.url));
      setFiles([]); setContent(""); setCategory("General Updates");
      toast.success("Post published.");
      refresh("sp-feed", "sp-highlights");
      onDone?.();
    } catch (e) {
      // roll back so no half-published post is left behind
      if (uploaded.length) await supabase.storage.from("spotlight").remove(uploaded);
      if (postId) await supabase.from("spotlight_posts").delete().eq("id", postId);
      toast.error(e.message || "Could not publish the post.");
    } finally { setBusy(false); }
  };

  return (
    <div className="p-4">
      <div className="flex gap-3">
        <Avatar name={me.full_name} path={avatarPath} />
        <textarea value={content} onChange={(e) => setContent(e.target.value)} maxLength={5000} rows={3}
          placeholder={`What's on your mind, ${me.full_name?.split(" ")[0] || "there"}?`} className={`${inputCls} resize-none`} />
      </div>
      {files.length > 0 && (
        <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">
          {files.map((f, i) => (
            <div key={f.url} className="group relative aspect-square overflow-hidden rounded-lg">
              <img src={f.url} alt="" className="h-full w-full object-cover" />
              <button onClick={() => drop(i)} aria-label="Remove photo" className="absolute right-1 top-1 rounded-full bg-black/70 p-1 text-white"><X size={14} /></button>
            </div>
          ))}
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input ref={input} type="file" accept={PHOTO_TYPES.join(",")} multiple hidden onChange={(e) => pick(e.target.files)} />
        <button type="button" onClick={() => input.current?.click()} disabled={busy || files.length >= MAX_PHOTOS}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-600 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-50">
          <ImagePlus size={16} /> Photos {files.length > 0 && `(${files.length}/${MAX_PHOTOS})`}
        </button>
        <select value={category} onChange={(e) => setCategory(e.target.value)} className={`${inputCls} !w-auto`}>
          {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
        </select>
        <button onClick={publish} disabled={busy} className={`${btnPrimary} ml-auto`}><Send size={15} /> {busy ? "Publishing…" : "Post"}</button>
      </div>
    </div>
  );
}
