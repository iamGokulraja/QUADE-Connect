import { useRef, useState } from "react";
import { Newspaper, UserRound, Camera, Search, ImagePlus, SlidersHorizontal, LayoutGrid, X } from "lucide-react";
import { useMe } from "../../hooks/queries";
import { Loading, ErrorBox, Empty, inputCls } from "../../components/ui";
import toast from "../../lib/toast";
import Avatar from "../../components/spotlight/Avatar";
import CreatePost from "../../components/spotlight/CreatePost";
import PostCard from "../../components/spotlight/PostCard";
import {
  CATEGORIES, CATEGORY_STYLE, PHOTO_TYPES, uploadAvatar, useFeed, useAuthors, useSpotlightRefresh, roleLabel,
} from "../../hooks/spotlight";

const EMPTY = { q: "", category: "", author: "", from: "", to: "", sort: "newest" };

export default function Spotlight() {
  const { data: me, isLoading, error } = useMe();
  const [f, setF] = useState(EMPTY);
  const feed = useFeed(f);
  const { data: authors = [] } = useAuthors();
  const refresh = useSpotlightRefresh();
  const avatarInput = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [composer, setComposer] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  if (isLoading) return <Loading />;
  if (error || !me) return <ErrorBox error={error || new Error("Could not load your profile.")} />;

  const mine = authors.find((a) => a.id === me.id);
  const set = (patch) => setF((s) => ({ ...s, ...patch }));
  const posts = feed.data?.pages.flat() || [];
  const filtered = JSON.stringify({ ...f, sort: "" }) !== JSON.stringify({ ...EMPTY, sort: "" });

  const changeAvatar = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      await uploadAvatar(me.id, mine?.avatar_path, file);
      toast.success("Profile photo updated.");
      refresh("sp-authors", "sp-feed", "my-profile");
    } catch (e) { toast.error(e.message || "Could not update the photo."); }
    finally { setUploading(false); if (avatarInput.current) avatarInput.current.value = ""; }
  };

  const navBtn = (active) => `flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm ${active ? "bg-blue-600/20 text-blue-300" : "text-slate-300 hover:bg-slate-800"}`;

  return (
    <div className="min-h-screen bg-[#0B1120] p-4 text-slate-100 md:p-6">
      <div className="mx-auto grid max-w-7xl gap-5 lg:grid-cols-[240px_minmax(0,1fr)] xl:grid-cols-[240px_minmax(0,1fr)_260px]">
        {/* LEFT */}
        <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <section className="overflow-hidden rounded-2xl border border-slate-700/70 bg-[#111C32] text-center">
            <div className="h-16 bg-gradient-to-r from-blue-600/60 via-indigo-500/40 to-fuchsia-500/40" />
            <div className="-mt-9 px-4 pb-4">
            <div className="relative mx-auto w-fit rounded-full ring-4 ring-[#111C32]">
              <Avatar name={me.full_name} path={mine?.avatar_path} size={72} />
              <button onClick={() => avatarInput.current?.click()} disabled={uploading} aria-label="Change profile photo"
                className="absolute -bottom-1 -right-1 rounded-full bg-blue-600 p-1.5 text-white hover:bg-blue-700 disabled:opacity-50"><Camera size={13} /></button>
              <input ref={avatarInput} type="file" hidden accept={PHOTO_TYPES.join(",")} onChange={(e) => changeAvatar(e.target.files?.[0])} />
            </div>
            <p className="mt-3 font-semibold text-white">{me.full_name}</p>
            <p className="text-xs text-slate-400">{mine?.designation || roleLabel(me.role)}</p>
            </div>
          </section>

          <nav className="rounded-2xl border border-slate-700/70 bg-[#111C32] p-2">
            <button className={navBtn(!f.author)} onClick={() => set({ author: "" })}><Newspaper size={16} /> All posts</button>
            <button className={navBtn(f.author === me.id)} onClick={() => set({ author: me.id })}><UserRound size={16} /> My posts</button>
          </nav>

        </aside>

        {/* CENTER */}
        <main className="min-w-0 space-y-4">
          <div>
            <h1 className="text-2xl font-bold text-white">QUADE Spotlight</h1>
            <p className="text-sm text-slate-400">Share moments, wins and celebrations with the whole company.</p>
          </div>

          <section className="rounded-2xl border border-slate-700/70 bg-[#111C32] p-4">
            <div className="flex items-center gap-3">
              <Avatar name={me.full_name} path={mine?.avatar_path} size={44} />
              <button onClick={() => setComposer(true)}
                className="flex-1 rounded-full border border-slate-600 bg-[#0D172A] px-5 py-3 text-left text-sm text-slate-400 transition hover:border-blue-500 hover:bg-slate-800">
                What's on your mind, {me.full_name?.split(" ")[0] || "there"}?
              </button>
            </div>
            <div className="mt-3 flex items-center gap-2 border-t border-slate-700/60 pt-3">
              <button onClick={() => setComposer(true)} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800">
                <ImagePlus size={18} className="text-emerald-400" /> Photos
              </button>
              <button onClick={() => setComposer(true)} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800">
                <Newspaper size={18} className="text-blue-400" /> Write a post
              </button>
            </div>
          </section>
          {composer && (
            <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/70 p-4" >
              <div className="my-8 w-full max-w-xl overflow-hidden rounded-2xl border border-slate-700 bg-[#111C32] shadow-2xl" >
                <div className="flex items-center justify-between border-b border-slate-700 px-5 py-4">
                  <strong className="text-lg text-white">Create a post</strong>
                  <button onClick={() => setComposer(false)} aria-label="Close" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-700 hover:text-white"><X size={18} /></button>
                </div>
                <CreatePost me={me} avatarPath={mine?.avatar_path} onDone={() => setComposer(false)} />
              </div>
            </div>
          )}

          {/* categories as chips on small screens (the right column shows them on wide screens) */}
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 xl:hidden">
            {["", ...CATEGORIES].map((c) => (
              <button key={c || "all"} onClick={() => set({ category: c })}
                className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium ${f.category === c ? "border-blue-500 bg-blue-600 text-white" : "border-slate-700 bg-[#111C32] text-slate-300 hover:border-slate-500"}`}>
                {c || "All"}
              </button>
            ))}
          </div>

          <div className="rounded-2xl border border-slate-700/70 bg-[#111C32] p-3">
            <div className="relative">
              <Search size={15} className="absolute left-3 top-3 text-slate-500" />
              <input value={f.q} onChange={(e) => set({ q: e.target.value })} placeholder="Search posts…" className={`${inputCls} !pl-9 !pr-28`} />
              <button onClick={() => setShowFilters(!showFilters)} aria-expanded={showFilters}
                className={`absolute right-1.5 top-1.5 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium ${showFilters || filtered ? "bg-blue-600/20 text-blue-300" : "text-slate-300 hover:bg-slate-800"}`}>
                <SlidersHorizontal size={14} /> Filters
              </button>
            </div>
            {showFilters && <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              <select value={f.author} onChange={(e) => set({ author: e.target.value })} className={inputCls} aria-label="Author">
                <option value="">All authors</option>
                {authors.filter((a) => a.is_active !== false).map((a) => <option key={a.id} value={a.id}>{a.full_name}</option>)}
              </select>
              <input type="date" value={f.from} max={f.to || undefined} onChange={(e) => set({ from: e.target.value })} className={inputCls} aria-label="From date" />
              <input type="date" value={f.to} min={f.from || undefined} onChange={(e) => set({ to: e.target.value })} className={inputCls} aria-label="To date" />
              <select value={f.sort} onChange={(e) => set({ sort: e.target.value })} className={inputCls} aria-label="Sort">
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
              </select>
            </div>}
            {filtered && <button onClick={() => setF({ ...EMPTY, sort: f.sort })} className="mt-2 text-xs text-blue-400">Clear filters</button>}
          </div>

          {feed.isLoading && <Loading />}
          {feed.error && <ErrorBox error={feed.error} />}
          {!feed.isLoading && !feed.error && posts.length === 0 && (
            <Empty icon={Newspaper} title={filtered ? "No posts match your filters" : "No posts yet"} text={filtered ? "Try clearing some filters." : "Share the first one!"} />
          )}
          {posts.map((p) => <PostCard key={p.id} post={p} me={me} authors={authors} />)}
          {feed.hasNextPage && (
            <button onClick={() => feed.fetchNextPage()} disabled={feed.isFetchingNextPage}
              className="w-full rounded-xl border border-slate-700 py-3 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-50">
              {feed.isFetchingNextPage ? "Loading…" : "Load more"}
            </button>
          )}
        </main>

        {/* RIGHT: categories */}
        <aside className="hidden xl:sticky xl:top-6 xl:block xl:self-start">
          <section className="rounded-2xl border border-slate-700/70 bg-[#111C32] p-3">
            <h3 className="flex items-center gap-2 px-2 pb-2 pt-1 text-sm font-semibold text-white"><LayoutGrid size={16} className="text-blue-400" /> Categories</h3>
            <ul className="space-y-1">
              {["", ...CATEGORIES].map((c) => {
                const active = f.category === c;
                return (
                  <li key={c || "all"}>
                    <button onClick={() => set({ category: c })}
                      className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition ${active ? "bg-blue-600/20 font-semibold text-blue-200" : "text-slate-300 hover:bg-slate-800"}`}>
                      <span className={`h-2.5 w-2.5 shrink-0 rounded-full border ${c ? CATEGORY_STYLE[c] : "border-slate-500 bg-slate-500/30"}`} />
                      {c || "All categories"}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}
