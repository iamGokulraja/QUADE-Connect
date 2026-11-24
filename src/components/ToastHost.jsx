import { useEffect, useState } from "react";

export default function ToastHost() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    const on = (e) => {
      const t = { id: Math.random(), ...e.detail };
      setItems((l) => [...l, t]);
      setTimeout(() => setItems((l) => l.filter((x) => x.id !== t.id)), 4000);
    };
    window.addEventListener("qc-toast", on);
    return () => window.removeEventListener("qc-toast", on);
  }, []);
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[70] space-y-2">
      {items.map((t) => (
        <div key={t.id} role="status" className={`rounded-xl border px-4 py-3 text-sm shadow-xl ${t.type === "error" ? "border-red-500/40 bg-red-950 text-red-200" : "border-emerald-500/40 bg-emerald-950 text-emerald-200"}`}>
          {t.message}
        </div>
      ))}
    </div>
  );
}
