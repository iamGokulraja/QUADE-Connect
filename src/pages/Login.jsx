
import { useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { useNavigate } from "react-router-dom";
import { queryClient } from "../lib/queryClient";
import { ROLE_HOME } from "../lib/constants";

import {
  ArrowRight,
  Eye,
  EyeOff,
  ShieldCheck,
  Clock3,
  AlertCircle,
} from "lucide-react";

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const navigate = useNavigate();

  // Supabase Authentication
  const handleLogin = async (e) => {
    e.preventDefault();

    setError("");
    setLoading(true);
    queryClient.clear();

    try {
      // 1. Authenticate user
      const { data, error: loginError } =
        await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

      if (loginError) throw loginError;

      // 2. Fetch user profile
      const { data: profile, error: profileError } =
        await supabase
          .from("profiles")
          .select("role, full_name, is_active")
          .eq("id", data.user.id)
          .single();

      if (profileError || !profile) {
        throw new Error("Unable to find your user profile.");
      }

      // 3. Check account status
      if (!profile.is_active) {
        throw new Error(
          "Your account is inactive. Please contact the administrator."
        );
      }

      // 4. Identify role
      const destination = ROLE_HOME[profile.role];

      if (!destination) {
        throw new Error(
          "Your account does not have access to an available dashboard."
        );
      }

      // 5. Navigate to role dashboard
      navigate(destination, { replace: true });

    } catch (err) {
      await supabase.auth.signOut();

      setError(
        err.message || "Login failed. Please try again."
      );

    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#070b14] p-4 text-white lg:p-8">

      {/* BACKGROUND LIGHTING */}

      <div className="pointer-events-none absolute -left-40 -top-40 h-[500px] w-[500px] rounded-full bg-blue-600/20 blur-[130px]" />

      <div className="pointer-events-none absolute -bottom-40 -right-40 h-[500px] w-[500px] rounded-full bg-indigo-600/20 blur-[130px]" />

      {/* MAIN LOGIN CONTAINER */}

      <div className="relative grid min-h-[680px] w-full max-w-7xl grid-cols-1 overflow-hidden rounded-[30px] border border-white/10 bg-[#0c1423] shadow-[0_30px_100px_rgba(0,0,0,0.6)] lg:grid-cols-2">

        {/* LEFT VISUAL PANEL */}

        <section className="relative hidden flex-col justify-between overflow-hidden p-12 lg:flex">

          {/* BACKGROUND IMAGE */}

          <img
            src="https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?w=1400"
            alt="Architectural millwork interior"
            className="absolute inset-0 h-full w-full object-cover opacity-35"
          />

          {/* DARK OVERLAY */}

          <div className="absolute inset-0 bg-gradient-to-br from-[#07101f]/90 via-[#101d35]/65 to-[#07101f]/95" />

          {/* DECORATIVE LIGHTING */}

          <div className="absolute right-10 top-20 h-60 w-60 rounded-full bg-blue-500/20 blur-[90px]" />

          {/* BRANDING AND CONTENT */}

          <div className="relative z-10">

            <div className="flex items-center gap-3">

              <img
                src="/quadelogo.png"
                alt="QUADE Logo"
                className="h-14 max-w-[180px] object-contain"
              />

              <div className="border-l border-white/20 pl-3">
                <h2 className="text-lg font-bold tracking-wide">
                  QUADE CONNECT
                </h2>

                <p className="text-[9px] tracking-[3px] text-slate-400">
                  DIGITAL WORKSPACE
                </p>
              </div>

            </div>

            <div className="mt-24">

              <p className="mb-6 text-xs font-bold tracking-[5px] text-blue-300">
                WELCOME TO THE FUTURE OF WORK
              </p>

              <h1 className="text-5xl font-bold leading-[1.15] xl:text-6xl">
                One vision.
                <br />

                One team.
                <br />

                <span className="bg-gradient-to-r from-blue-400 to-cyan-300 bg-clip-text text-transparent">
                  One connection.
                </span>
              </h1>

              <p className="mt-7 max-w-md leading-8 text-slate-300">
                Your connected workspace for architectural
                millwork, CAD operations, employee management
                and project delivery.
              </p>

            </div>

          </div>

          {/* BOTTOM FEATURE CARDS */}

          <div className="relative z-10 mt-12 grid grid-cols-2 gap-3">

            <div className="rounded-2xl border border-white/15 bg-white/[0.07] p-5 backdrop-blur-xl">

              <ShieldCheck
                className="mb-3 text-cyan-300"
                size={25}
              />

              <p className="text-sm font-semibold">
                Secure Workspace
              </p>

              <p className="mt-1 text-xs text-slate-400">
                Protected employee access
              </p>

            </div>

            <div className="rounded-2xl border border-white/15 bg-white/[0.07] p-5 backdrop-blur-xl">

              <Clock3
                className="mb-3 text-blue-300"
                size={25}
              />

              <p className="text-sm font-semibold">
                Smart Attendance
              </p>

              <p className="mt-1 text-xs text-slate-400">
                Track your working hours
              </p>

            </div>

          </div>

          <p className="relative z-10 mt-8 text-xs text-slate-500">
            QUADE CONNECT · CONNECTED WORKSPACE
          </p>

        </section>

        {/* RIGHT LOGIN PANEL */}

        <section className="relative flex items-center justify-center p-6 sm:p-10 lg:p-14">

          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-blue-500/[0.04] to-transparent" />

          <div className="relative w-full max-w-md">

            {/* MOBILE LOGO */}

            <div className="mb-10 flex justify-center lg:hidden">

              <img
                src="/quadelogo.png"
                alt="QUADE Logo"
                className="h-14 max-w-[180px] object-contain"
              />

            </div>

            {/* HEADING */}

            <div className="mb-9">

              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-blue-400/20 bg-blue-500/10 px-4 py-2">

                <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />

                <span className="text-xs tracking-wider text-blue-300">
                  SECURE WORKSPACE ACCESS
                </span>

              </div>

              <h2 className="text-4xl font-bold tracking-tight">
                Welcome <span className="text-blue-400">back.</span>
              </h2>

              <p className="mt-3 leading-6 text-slate-400">
                Sign in to continue your workday and connect
                with your team.
              </p>

            </div>

            {/* LOGIN CARD */}

            <form
              onSubmit={handleLogin}
              className="rounded-3xl border border-white/10 bg-[#111c2e]/90 p-6 shadow-2xl backdrop-blur-xl sm:p-8"
            >

              <div className="mb-7">

                <p className="text-sm font-semibold text-white">
                  Workspace Login
                </p>

                <p className="mt-1 text-xs text-slate-500">
                  Enter your registered account details.
                </p>

              </div>

              {/* EMAIL */}

              <label className="mb-2 block text-sm text-slate-300">
                Work email address
              </label>

              <div className="relative mb-6">

                <input
                  type="email"
                  required
                  autoComplete="username"
                  placeholder="Enter your work email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-[#080f1d] px-4 py-4 text-white outline-none transition placeholder:text-slate-600 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                />

              </div>

              {/* PASSWORD */}

              <label className="mb-2 block text-sm text-slate-300">
                Password
              </label>

              <div className="relative mb-6">

                <input
                  type={showPassword ? "text" : "password"}
                  required
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-[#080f1d] px-4 py-4 pr-14 text-white outline-none transition placeholder:text-slate-600 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                />

                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 transition hover:text-white"
                  aria-label={
                    showPassword ? "Hide password" : "Show password"
                  }
                >
                  {showPassword ? (
                    <EyeOff size={19} />
                  ) : (
                    <Eye size={19} />
                  )}
                </button>

              </div>

              {/* ERROR MESSAGE */}

              {error && (

                <div
                  role="alert"
                  className="mb-5 flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-300"
                >

                  <AlertCircle
                    size={18}
                    className="mt-0.5 shrink-0"
                  />

                  <span>{error}</span>

                </div>

              )}

              {/* LOGIN BUTTON */}

              <button
                type="submit"
                disabled={loading}
                className="group w-full rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 py-4 font-bold text-white shadow-lg shadow-blue-600/20 transition-all duration-300 hover:-translate-y-1 hover:from-blue-500 hover:to-indigo-500 hover:shadow-blue-600/40 disabled:cursor-not-allowed disabled:opacity-50"
              >

                <span className="flex items-center justify-center gap-3">

                  {loading
                    ? "Signing in..."
                    : "Sign In to Workspace"}

                  {!loading && (
                    <ArrowRight
                      size={19}
                      className="transition group-hover:translate-x-1"
                    />
                  )}

                </span>

              </button>

              {/* SECURE ACCESS DIVIDER */}

              <div className="my-7 flex items-center gap-3">

                <div className="h-px flex-1 bg-white/10" />

                <span className="text-[10px] tracking-widest text-slate-500">
                  SECURE ACCESS
                </span>

                <div className="h-px flex-1 bg-white/10" />

              </div>

              {/* SECURITY NOTE */}

              <div className="flex items-center justify-center gap-2 text-xs text-slate-400">

                <ShieldCheck
                  size={16}
                  className="text-emerald-400"
                />

                Protected account authentication

              </div>

            </form>

            {/* FOOTER */}

            <p className="mt-8 text-center text-xs text-slate-600">
              © {new Date().getFullYear()} QUADE CONNECT.
              All rights reserved.
            </p>

          </div>

        </section>

      </div>

    </main>
  );
}

export default Login;
