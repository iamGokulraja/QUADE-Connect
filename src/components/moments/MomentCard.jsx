import { Images, Lock } from "lucide-react";
import { fmtMomentDate } from "../../lib/moments";
import MediaThumb from "./MediaThumb";

export const CATEGORY_PILL = {
  "Team Moments": "bg-blue-100 text-blue-700",
  "Team Celebration": "bg-orange-100 text-orange-700",
  "Project Achievement": "bg-emerald-100 text-emerald-700",
  Appreciation: "bg-rose-100 text-rose-700",
  "Awards & Rewards": "bg-amber-100 text-amber-700",
  Promotion: "bg-violet-100 text-violet-700",
  "Goal Achieved": "bg-teal-100 text-teal-700",
  Motivation: "bg-sky-100 text-sky-700",
};

export default function MomentCard({ moment, onOpen }) {
  const media = [...(moment.moment_media || [])].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const first = media[0];
  return (
    <button onClick={() => onOpen(moment)} data-keep-colors
      className="group flex flex-col overflow-hidden rounded-2xl bg-white text-left shadow-lg shadow-black/10 transition hover:-translate-y-0.5 hover:shadow-xl">
      {first ? (
        <div className="relative">
          <MediaThumb path={first.storage_path} type={first.media_type} name={first.file_name} className="aspect-[4/3] w-full" />
          {media.length > 1 && (
            <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-1 text-[11px] font-semibold text-white"><Images size={12} /> {media.length}</span>
          )}
        </div>
      ) : (
        <div className="grid aspect-[4/3] place-items-center bg-gradient-to-br from-blue-50 to-indigo-100 p-5">
          <p className="line-clamp-5 text-center text-base font-semibold italic leading-snug text-slate-700">“{moment.caption}”</p>
        </div>
      )}
      <div className="flex flex-1 flex-col gap-2 p-4">
        {first && moment.caption && <p className="line-clamp-3 whitespace-pre-wrap text-sm text-slate-700">{moment.caption}</p>}
        <div className="mt-auto flex items-center justify-between gap-2 pt-1">
          <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${CATEGORY_PILL[moment.category] || CATEGORY_PILL["Team Moments"]}`}>{moment.category}</span>
          <span className="text-xs text-slate-500">{fmtMomentDate(moment.moment_date)}</span>
        </div>
        <p className="flex items-center gap-1 text-[11px] text-slate-400"><Lock size={10} /> Only you can see this</p>
      </div>
    </button>
  );
}
