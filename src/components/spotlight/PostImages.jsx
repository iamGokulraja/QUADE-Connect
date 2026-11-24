import { useState } from "react";
import { X } from "lucide-react";
import { useSignedUrl } from "../../hooks/spotlight";

function Img({ path, className, onClick }) {
  const url = useSignedUrl(path);
  return url ? (
    <img src={url} alt="" loading="lazy" onClick={onClick} className={`cursor-zoom-in object-cover ${className}`} />
  ) : (
    <div className={`animate-pulse bg-slate-800 ${className}`} />
  );
}

// Responsive layout: 1 image full width, 2 side by side, 3+ a grid with "+N" on the last tile.
export default function PostImages({ paths = [] }) {
  const [view, setView] = useState(null);
  if (!paths.length) return null;
  const shown = paths.slice(0, 4);
  const extra = paths.length - 4;
  const grid = shown.length === 1 ? "grid-cols-1" : "grid-cols-2";
  return (
    <>
      <div className={`mt-3 grid gap-1 overflow-hidden rounded-xl ${grid}`}>
        {shown.map((p, i) => (
          <div key={p} className={`relative ${shown.length === 3 && i === 0 ? "col-span-2" : ""}`}>
            <Img path={p} onClick={() => setView(p)} className={`w-full ${shown.length === 1 ? "max-h-[28rem]" : "h-48 sm:h-56"}`} />
            {i === 3 && extra > 0 && (
              <button onClick={() => setView(p)} className="absolute inset-0 grid place-items-center bg-black/55 text-2xl font-bold text-white">+{extra}</button>
            )}
          </div>
        ))}
      </div>
      {view && (
        <div className="fixed inset-0 z-[60] flex flex-col items-center gap-3 overflow-y-auto bg-black/85 p-4" onClick={() => setView(null)}>
          <button className="fixed right-4 top-4 rounded-full bg-slate-800 p-2 text-white" aria-label="Close"><X size={20} /></button>
          {paths.map((p) => <Img key={p} path={p} className="max-h-[85vh] max-w-full rounded-lg" />)}
        </div>
      )}
    </>
  );
}
