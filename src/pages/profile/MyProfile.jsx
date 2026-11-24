import { useEffect, useRef, useState } from "react";
import { Briefcase, Building2, Cake, CalendarCheck, Camera, Check, Hash, Lock, Mail, MapPin, Moon, Pencil, Phone, Sun, UserRound, X } from "lucide-react";

import { PHOTO_ROLES, ROLE_LABEL } from "../../lib/constants";
import { applyTheme } from "../../lib/theme";
import toast from "../../lib/toast";
import { useMe } from "../../hooks/queries";
import { saveMyProfile, saveMyTheme, useMyProfile, useProfileRefresh } from "../../hooks/profile";
import { PHOTO_TYPES, uploadAvatar } from "../../hooks/spotlight";
import Avatar from "../../components/spotlight/Avatar";
import { ErrorBox, Loading, inputCls, btnGhost, btnPrimary } from "../../components/ui";

const long = (d) => (d ? new Date(`${String(d).slice(0, 10)}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }) : "");
const todayIso = () => new Date().toISOString().slice(0, 10);

function tenure(iso) {
  if (!iso) return "";
  const from = new Date(iso);
  const now = new Date();
  let months = (now.getFullYear() - from.getFullYear()) * 12 + now.getMonth() - from.getMonth();
  if (now.getDate() < from.getDate()) months -= 1;
  if (months < 1) return "Joined this month";
  const y = Math.floor(months / 12);
  const m = months % 12;
  return [y && `${y} year${y > 1 ? "s" : ""}`, m && `${m} month${m > 1 ? "s" : ""}`].filter(Boolean).join(" ") + " with QUADE";
}

function Row({ icon: Icon, label, children, locked }) {
  return (
    <div className="flex items-start gap-3 py-3">
      <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-blue-500/10 text-blue-300"><Icon size={17} /></span>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}{locked && <Lock size={10} />}</p>
        <div className="mt-0.5 break-words text-sm text-slate-100">{children}</div>
      </div>
    </div>
  );
}
const Empty = () => <span className="text-slate-500">Not added yet</span>;

export default function MyProfile() {
  const { data: me } = useMe();
  const { data: p, isLoading, error } = useMyProfile(!!me);
  const refresh = useProfileRefresh();
  const fileRef = useRef(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [f, setF] = useState({ full_name: "", phone: "", date_of_birth: "", about: "", city: "", theme: "dark" });

  useEffect(() => {
    if (p && !editing) setF({ full_name: p.full_name || "", phone: p.phone || "", date_of_birth: p.date_of_birth || "", about: p.about || "", city: p.city || "", theme: p.theme || "dark" });
  }, [p, editing]);

  if (isLoading || !me) return <Loading />;
  if (error || !p) {
    return (
      <div className="p-8">
        <ErrorBox error={error || new Error("Could not load your profile.")} />
        <p className="mt-3 text-sm text-slate-400">If this keeps happening, ask your admin to run the "My Profile" database script (20261123000000_my_profile.sql).</p>
      </div>
    );
  }

  const set = (patch) => setF((s) => ({ ...s, ...patch }));
  const save = async () => {
    setBusy(true);
    try {
      await saveMyProfile(f);
      if (f.theme !== (p.theme || "dark")) await saveMyTheme(f.theme);
      await refresh();
      setEditing(false);
      toast.success("Profile updated.");
    } catch (e) { toast.error(e.message || "Could not save your profile."); } finally { setBusy(false); }
  };
  // Theme buttons inside the edit form preview straight away; Cancel puts the saved theme back.
  const previewTheme = (theme) => { set({ theme }); applyTheme(theme); };
  const cancel = () => { applyTheme(p.theme || "dark"); setEditing(false); };

  const changePhoto = async (file) => {
    if (!file) return;
    setPhotoBusy(true);
    try { await uploadAvatar(p.id, p.avatar_path, file); await refresh(); toast.success("Profile photo updated."); }
    catch (e) { toast.error(e.message || "Could not update the photo."); }
    finally { setPhotoBusy(false); if (fileRef.current) fileRef.current.value = ""; }
  };

  const canPhoto = PHOTO_ROLES.includes(p.role);
  const name = p.full_name || p.email;

  return (
    <div className="min-h-screen bg-[#0B1120] p-4 text-slate-100 md:p-8">
      <div className="mx-auto max-w-5xl space-y-6">
        {/* hero */}
        <section className="overflow-hidden rounded-2xl border border-slate-700/70 bg-[#111C32]">
          <div className="h-32 bg-gradient-to-r from-blue-600/70 via-indigo-500/50 to-fuchsia-500/40 md:h-40" data-keep-colors />
          <div className="flex flex-wrap items-end gap-4 px-5 pb-5 md:px-8">
            <div className="relative -mt-14 rounded-full ring-4 ring-[#111C32]">
              {p.avatar_path ? <Avatar name={name} path={p.avatar_path} size={104} /> : (
                <span className="grid h-[104px] w-[104px] place-items-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-700 text-4xl font-bold text-white">{name.charAt(0).toUpperCase()}</span>
              )}
              {canPhoto && (
                <>
                  <button onClick={() => fileRef.current?.click()} disabled={photoBusy} aria-label="Change profile photo"
                    className="absolute bottom-0 right-0 rounded-full border-2 border-[#111C32] bg-blue-600 p-2 text-white hover:bg-blue-700 disabled:opacity-50"><Camera size={14} /></button>
                  <input ref={fileRef} type="file" hidden accept={PHOTO_TYPES.join(",")} onChange={(e) => changePhoto(e.target.files?.[0])} />
                </>
              )}
            </div>
            <div className="min-w-0 flex-1 pt-3">
              <h1 className="truncate text-2xl font-bold text-white md:text-3xl">{name}</h1>
              <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-400">
                <span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-2.5 py-0.5 text-xs font-medium text-blue-300">{ROLE_LABEL[p.role] || p.role}</span>
                {p.designation && <span>{p.designation}</span>}
                {p.city && <span className="inline-flex items-center gap-1"><MapPin size={13} className="text-red-400" /> {p.city}</span>}
              </p>
            </div>
            {!editing && <button onClick={() => setEditing(true)} className={btnPrimary}><Pencil size={15} /> Edit profile</button>}
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          {/* personal information */}
          <section className="rounded-2xl border border-slate-700/70 bg-[#111C32] p-5 md:p-6">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">Personal information</h2>
              {editing && <span className="text-xs text-blue-300">Editing</span>}
            </div>

            {!editing ? (
              <div className="divide-y divide-slate-700/50">
                <Row icon={UserRound} label="Full name">{p.full_name || <Empty />}</Row>
                <Row icon={Cake} label="Date of birth">{p.date_of_birth ? long(p.date_of_birth) : <Empty />}</Row>
                <Row icon={Phone} label="Phone number">{p.phone || <Empty />}</Row>
                <Row icon={Mail} label="Email (login)" locked>{p.email}</Row>
                <Row icon={MapPin} label="City">{p.city || <Empty />}</Row>
                <Row icon={p.theme === "light" ? Sun : Moon} label="Theme">{p.theme === "light" ? "Light" : "Dark"}</Row>
                <Row icon={Pencil} label="About me"><span className="whitespace-pre-wrap">{p.about || <Empty />}</span></Row>
              </div>
            ) : (
              <div className="space-y-4">
                <label className="block text-sm text-slate-300">Full name
                  <input className={`${inputCls} mt-1`} value={f.full_name} maxLength={80} onChange={(e) => set({ full_name: e.target.value })} />
                </label>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block text-sm text-slate-300">Date of birth
                    <input type="date" className={`${inputCls} mt-1`} value={f.date_of_birth} min="1940-01-01" max={todayIso()} onChange={(e) => set({ date_of_birth: e.target.value })} />
                  </label>
                  <label className="block text-sm text-slate-300">Phone number
                    <input type="tel" className={`${inputCls} mt-1`} value={f.phone} maxLength={20} onChange={(e) => set({ phone: e.target.value })} />
                  </label>
                </div>
                <label className="block text-sm text-slate-300">Email (login)
                  <input className={`${inputCls} mt-1`} value={p.email} disabled />
                  <span className="mt-1 block text-xs text-slate-500">This is your sign-in email. Ask HR or Admin if it must change.</span>
                </label>
                <label className="block text-sm text-slate-300">City
                  <input className={`${inputCls} mt-1`} value={f.city} maxLength={80} onChange={(e) => set({ city: e.target.value })} />
                </label>
                <div className="text-sm text-slate-300">Theme
                  <div className="mt-1 inline-flex rounded-lg border border-slate-700 bg-[#0D172A] p-1">
                    {[["dark", Moon, "Dark"], ["light", Sun, "Light"]].map(([id, Icon, text]) => (
                      <button key={id} type="button" onClick={() => previewTheme(id)} aria-pressed={f.theme === id}
                        className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition ${f.theme === id ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white"}`}>
                        <Icon size={13} /> {text}
                      </button>
                    ))}
                  </div>
                </div>
                <label className="block text-sm text-slate-300">About me <span className="text-slate-500">({f.about.length}/300)</span>
                  <textarea rows={4} className={`${inputCls} mt-1 resize-none`} value={f.about} maxLength={300} onChange={(e) => set({ about: e.target.value })} />
                </label>
                <div className="flex justify-end gap-2 pt-1">
                  <button className={btnGhost} onClick={cancel} disabled={busy}><X size={15} /> Cancel</button>
                  <button className={btnPrimary} onClick={save} disabled={busy || f.full_name.trim().length < 2}><Check size={15} /> {busy ? "Saving…" : "Save changes"}</button>
                </div>
              </div>
            )}
          </section>

          <div className="space-y-6">
            {/* work details (read only) */}
            <section className="rounded-2xl border border-slate-700/70 bg-[#111C32] p-5 md:p-6">
              <h2 className="mb-1 flex items-center gap-2 text-lg font-semibold text-white">Work details <Lock size={13} className="text-slate-500" /></h2>
              <p className="text-xs text-slate-500">Set by HR. You cannot change these.</p>
              <div className="mt-2 divide-y divide-slate-700/50">
                <Row icon={CalendarCheck} label="Joined" locked>
                  {p.joined_at ? long(p.joined_at) : <Empty />}
                  {p.joined_at && <span className="mt-0.5 block text-xs text-slate-400">{tenure(p.joined_at)}</span>}
                </Row>
                <Row icon={Hash} label="Employee code" locked>{p.employee_code || <Empty />}</Row>
                <Row icon={Briefcase} label="Role" locked>{ROLE_LABEL[p.role] || p.role}</Row>
                <Row icon={Building2} label="Department" locked>{p.department || <Empty />}</Row>
                <Row icon={Briefcase} label="Designation" locked>{p.designation || <Empty />}</Row>
              </div>
            </section>

          </div>
        </div>
      </div>
    </div>
  );
}
