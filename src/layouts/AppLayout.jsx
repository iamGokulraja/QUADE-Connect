import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { LogOut } from "lucide-react";

import { NAV } from "../config/nav";
import { ROLE_LABEL, profilePath } from "../lib/constants";
import { applyTheme } from "../lib/theme";
import { signOut } from "../lib/auth";
import { useMe } from "../hooks/queries";
import { useRealtimeSync } from "../hooks/realtime";
import NotificationBell from "../components/NotificationBell";
import ToastHost from "../components/ToastHost";
import { useChatUnread } from "../hooks/chat";
import { useMyProfile } from "../hooks/profile";
import Avatar from "../components/spotlight/Avatar";

// Sidebar item: a muted icon that lights up (glowing tile + accent bar) on the page you are in.
const linkCls = ({ isActive }) =>
  `group relative flex items-center gap-3 rounded-xl px-1.5 py-1.5 text-sm font-medium transition-all duration-200 sm:px-2 ${
    isActive ? "bg-white/[0.07] text-white" : "text-slate-400 hover:bg-white/[0.04] hover:text-slate-100"
  }`;
const iconCls = (isActive) =>
  `grid h-9 w-9 shrink-0 place-items-center rounded-xl transition-all duration-200 ${
    isActive
      ? "bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-[0_0_18px_rgba(59,130,246,0.55)]"
      : "text-slate-500 group-hover:bg-white/[0.06] group-hover:text-sky-300"
  }`;

// One sidebar layout for every role. Menus come from config/nav.js.
export default function AppLayout() {
  const navigate = useNavigate();
  const { data: me } = useMe();
  const [busy, setBusy] = useState(false);
  useRealtimeSync(!!me && me.role !== "client");
  const chatUnread = useChatUnread(!!me && me.role !== "client");

  const { data: profile } = useMyProfile(!!me);
  // Follow the theme saved in the profile (a new device starts from the browser's own choice until this loads).
  useEffect(() => { if (profile?.theme) applyTheme(profile.theme); }, [profile?.theme]);

  const name = profile?.full_name || me?.full_name || me?.email || "User";

  const logout = async () => {
    setBusy(true);
    try {
      await signOut();
      navigate("/login", { replace: true });
    } catch (err) {
      window.alert(err.message);
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen w-full bg-[#0B1120] text-slate-100">
      <aside className="sticky top-0 flex h-screen w-16 shrink-0 flex-col overflow-y-auto border-r border-blue-900/40 bg-[#101B35] px-2 py-5 [scrollbar-width:none] sm:w-64 sm:px-4 sm:py-6 [&::-webkit-scrollbar]:hidden">
        <div className="mb-10 flex items-center justify-center gap-3 sm:justify-start">
          <img src="/quadelogo.png" alt="QUADE" className="h-10 w-10 shrink-0 object-contain" />
          <span className="hidden whitespace-nowrap text-sm font-bold tracking-wider text-white sm:block">
            QUADE CONNECT
          </span>
        </div>

        {(NAV[me?.role] || []).map((section, i) => (
          <div key={section.title} className={i ? "mt-7" : ""}>
            <p className="mb-2.5 hidden items-center gap-3 px-2 text-[11px] font-bold uppercase tracking-[0.2em] text-blue-400/90 sm:flex">
              {section.title}
              <span className="h-px flex-1 bg-blue-900/50" />
            </p>
            {i > 0 && <div className="mx-2 mb-3 h-px bg-blue-900/40 sm:hidden" />}
            <nav className="grid gap-2" aria-label={section.title}>
              {section.items.map(({ label, to, icon: Icon, end, soon, badge }) =>
                soon ? (
                  <span key={to} title="Coming soon" className="flex cursor-not-allowed items-center gap-3 rounded-xl px-1.5 py-1.5 text-sm font-medium text-slate-600 sm:px-2">
                    <span className="grid h-9 w-9 shrink-0 place-items-center"><Icon size={19} /></span>
                    <span className="hidden sm:block">{label}</span>
                    <span className="ml-auto hidden rounded-full bg-slate-800 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-slate-500 sm:block">Soon</span>
                  </span>
                ) : (
                  <NavLink key={to} to={to} end={end} title={label} className={linkCls}>
                    {({ isActive }) => (
                      <>
                        {isActive && <span className="absolute -left-2 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-blue-400 sm:-left-4" />}
                        <span className={`${iconCls(isActive)} relative`}>
                          <Icon size={19} strokeWidth={isActive ? 2.3 : 1.9} />
                          {badge === "chat" && chatUnread > 0 && (
                            <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white sm:hidden">{chatUnread > 9 ? "9+" : chatUnread}</span>
                          )}
                        </span>
                        <span className={`hidden truncate sm:block ${isActive ? "font-semibold" : ""}`}>{label}</span>
                        {badge === "chat" && chatUnread > 0 && (
                          <span className="ml-auto hidden h-5 min-w-5 place-items-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white sm:grid">{chatUnread > 99 ? "99+" : chatUnread}</span>
                        )}
                      </>
                    )}
                  </NavLink>
                )
              )}
            </nav>
          </div>
        ))}

        <div className="mt-auto border-t border-blue-900/60 pt-5">
          <NavLink
            to={profilePath(me?.role)}
            title="My profile"
            className={({ isActive }) =>
              `mb-5 flex min-w-0 items-center justify-center gap-3 rounded-xl p-2 transition sm:justify-start ${isActive ? "bg-blue-600/20" : "hover:bg-white/[0.06]"}`}
          >
            {profile?.avatar_path ? (
              <Avatar name={name} path={profile.avatar_path} size={40} />
            ) : (
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-blue-400/30 bg-gradient-to-br from-blue-500 to-indigo-700 font-bold text-white">
                {name.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="hidden min-w-0 sm:block">
              <strong className="block truncate text-sm text-white">{name}</strong>
              <small className="text-xs text-blue-400">{ROLE_LABEL[me?.role]} · View profile</small>
            </div>
          </NavLink>

          <button
            type="button"
            onClick={logout}
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-700 bg-[#17243D] px-2 py-3 text-sm font-medium text-slate-300 transition hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-400 disabled:opacity-50"
          >
            <LogOut size={16} />
            <span className="hidden sm:inline">{busy ? "Signing out..." : "Logout"}</span>
          </button>
        </div>
      </aside>

      <main className="min-h-screen min-w-0 flex-1 bg-[#0B1120]">
        {me && me.role !== "client" && (
          <div className="sticky top-0 z-40 flex justify-end bg-[#0B1120]/90 px-5 pt-3 backdrop-blur md:px-8">
            <NotificationBell me={me} />
          </div>
        )}
        <div className="overflow-x-hidden">
          <Outlet />
        </div>
      </main>
      <ToastHost />
    </div>
  );
}
