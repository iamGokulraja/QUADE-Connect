import { useState } from "react";
import { Camera, Heart, PartyPopper, Plus, Sparkles, Trophy } from "lucide-react";

import { MOMENT_CATEGORIES } from "../../lib/moments";
import { useMe } from "../../hooks/queries";
import { useMoments, useMomentStats } from "../../hooks/moments";
import { ErrorBox, Loading } from "../../components/ui";
import MomentCard from "../../components/moments/MomentCard";
import MomentModal from "../../components/moments/MomentModal";
import MomentViewer from "../../components/moments/MomentViewer";

function Stat({ label, value, icon: Icon, tint }) {
  return (
    <div data-keep-colors className="flex items-center justify-between rounded-2xl bg-white p-5 shadow-lg shadow-black/10">
      <div>
        <p className="text-sm text-slate-500">{label}</p>
        <p className="mt-1 text-3xl font-extrabold text-slate-900">{value ?? 0}</p>
      </div>
      <span className={`grid h-12 w-12 place-items-center rounded-xl ${tint}`}><Icon size={22} /></span>
    </div>
  );
}

export default function MyMoments() {
  const { data: me } = useMe();
  const [category, setCategory] = useState("");
  const [form, setForm] = useState(null);        // null | { moment? }
  const [viewing, setViewing] = useState(null);
  const feed = useMoments(category);
  const stats = useMomentStats();
  if (!me) return <Loading />;

  const items = feed.data?.pages.flat() || [];
  const openAdd = () => setForm({});
  // Keep the open viewer in sync after an edit / refetch
  const current = viewing && (items.find((m) => m.id === viewing.id) || viewing);

  return (
    <div className="min-h-screen bg-[#0B1120] p-4 text-slate-100 md:p-8">
      <div className="mx-auto max-w-6xl space-y-7">
        {/* hero */}
        <section data-keep-colors className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-blue-600 via-blue-600 to-indigo-600 p-7 text-white shadow-xl md:p-10">
          <Camera className="pointer-events-none absolute -bottom-6 right-8 hidden text-white/15 md:block" size={190} strokeWidth={1.2} />
          <span className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-3 py-1.5 text-xs font-bold uppercase tracking-wide"><Sparkles size={14} /> Your QUade story</span>
          <h1 className="mt-5 max-w-xl text-4xl font-extrabold leading-tight md:text-5xl">Every moment deserves to be remembered.</h1>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-blue-50/90">Celebrate achievements, share happy memories and capture the special moments that make our QUADE team unique.</p>
          <button onClick={openAdd} className="mt-7 inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-bold text-blue-700 shadow-lg transition hover:bg-blue-50">
            <Plus size={18} /> Share a Moment
          </button>
        </section>

        {/* numbers */}
        <section className="grid gap-4 sm:grid-cols-3">
          <Stat label="Shared Moments" value={stats.data?.total} icon={Camera} tint="bg-blue-100 text-blue-600" />
          <Stat label="Team Celebrations" value={stats.data?.celebrations} icon={PartyPopper} tint="bg-orange-100 text-orange-600" />
          <Stat label="Appreciations" value={stats.data?.appreciations} icon={Heart} tint="bg-rose-100 text-rose-600" />
        </section>

        {/* gallery */}
        <section>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-2xl font-extrabold text-white"><Camera size={22} className="text-blue-400" /> Moments Gallery</h2>
              <p className="mt-1 text-sm text-slate-400">A collection of memories from our workplace. Private to you.</p>
            </div>
            <button onClick={openAdd} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-blue-700"><Plus size={17} /> Add Moment</button>
          </div>

          <div className="mt-5 flex gap-2 overflow-x-auto pb-1">
            {["", ...MOMENT_CATEGORIES].map((c) => (
              <button key={c || "all"} onClick={() => setCategory(c)} data-keep-colors
                className={`shrink-0 rounded-full px-4 py-2 text-xs font-bold transition ${category === c ? "bg-blue-600 text-white" : "bg-white text-slate-800 hover:bg-blue-50"}`}>
                {c || "All Moments"}
              </button>
            ))}
          </div>

          <div className="mt-6">
            {feed.isLoading && <Loading />}
            <ErrorBox error={feed.error} />
            {!feed.isLoading && !feed.error && items.length === 0 && (
              <div data-keep-colors className="rounded-2xl bg-white p-10 text-center shadow-lg shadow-black/10">
                <Camera size={34} className="mx-auto text-blue-500" />
                <p className="mt-3 text-lg font-bold text-slate-900">{category ? `No "${category}" moments yet` : "No moments yet"}</p>
                <p className="mt-1 text-sm text-slate-500">Add your first happy moment, promotion, goal or a bit of motivation.</p>
                <button onClick={openAdd} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white hover:bg-blue-700"><Plus size={16} /> Add Moment</button>
              </div>
            )}
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((m) => <MomentCard key={m.id} moment={m} onOpen={setViewing} />)}
            </div>
            {feed.hasNextPage && (
              <button onClick={() => feed.fetchNextPage()} disabled={feed.isFetchingNextPage}
                className="mx-auto mt-6 block rounded-xl border border-slate-600 px-6 py-3 text-sm font-semibold text-slate-200 hover:bg-slate-800 disabled:opacity-50">
                {feed.isFetchingNextPage ? "Loading…" : "Load more"}
              </button>
            )}
          </div>
        </section>

        {/* awards banner */}
        <section data-keep-colors className="flex items-center gap-5 rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 to-yellow-50 p-6 shadow-lg shadow-black/10">
          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-amber-100 text-amber-600"><Trophy size={26} /></span>
          <div>
            <h3 className="text-xl font-extrabold text-slate-900">Awards &amp; Appreciation</h3>
            <p className="mt-1 text-sm text-slate-600">Recognising dedication, creativity and the people who make a difference at QUADE.</p>
          </div>
        </section>

        <p className="pb-2 text-center text-xs text-slate-500">Made with appreciation at QUADE CONNECT</p>
      </div>

      {form && <MomentModal userId={me.id} moment={form.moment} defaultCategory={category} onClose={(saved) => { setForm(null); if (saved && form.moment) setViewing(null); }} />}
      {current && !form && <MomentViewer moment={current} onEdit={(moment) => setForm({ moment })} onClose={() => setViewing(null)} />}
    </div>
  );
}
