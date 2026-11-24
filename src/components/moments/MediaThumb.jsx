import { Play } from "lucide-react";
import { MOMENT_BUCKET } from "../../lib/moments";
import { useSignedFileUrl } from "../../hooks/storage";

// One stored photo / video. `full` shows controls and full size (viewer); otherwise a cropped preview (gallery).
export default function MediaThumb({ path, type, name, full = false, className = "" }) {
  const url = useSignedFileUrl(MOMENT_BUCKET, path);
  if (!url) return <div className={`animate-pulse bg-slate-200 ${className}`} />;
  if (type === "video") {
    return full ? (
      <video src={url} controls preload="metadata" playsInline className={`bg-black ${className}`} />
    ) : (
      <div className={`relative bg-black ${className}`}>
        <video src={`${url}#t=0.1`} preload="metadata" muted playsInline className="h-full w-full object-cover" />
        <span className="absolute inset-0 grid place-items-center"><span className="grid h-12 w-12 place-items-center rounded-full bg-black/55 text-white"><Play size={22} fill="currentColor" /></span></span>
      </div>
    );
  }
  return <img src={url} alt={name || "Moment photo"} loading="lazy" className={`${full ? "object-contain" : "object-cover"} ${className}`} />;
}
