
import { useState } from "react";
import {
  ArrowRight,
  Menu,
  X,
  Layers3,
  Users,
  Clock3,
  ChartNoAxesCombined,
  MessageSquare,
  FileCheck2,
  ShieldCheck,
  Boxes,
  DraftingCompass,
  Ruler,
  Building2,
  Sparkles,
  CheckCircle2,
  MoveUpRight,
  Workflow,
  MonitorCheck,
} from "lucide-react";

export default function LandingPage({ onLogin }) {
  const [menuOpen, setMenuOpen] = useState(false);

  const features = [
    {
      icon: Users,
      title: "People Management",
      description:
        "Manage employees, roles, teams and daily responsibilities in one connected workspace.",
      number: "01",
    },
    {
      icon: Clock3,
      title: "Smart Attendance",
      description:
        "Track check-in, check-out, working hours and remote attendance with GPS verification.",
      number: "02",
    },
    {
      icon: Layers3,
      title: "Project Operations",
      description:
        "Monitor CAD projects, project stages, deadlines, workloads and delivery progress.",
      number: "03",
    },
    {
      icon: ChartNoAxesCombined,
      title: "KPI Intelligence",
      description:
        "Understand employee performance, productivity and project contribution.",
      number: "04",
    },
    {
      icon: FileCheck2,
      title: "RFI Management",
      description:
        "Raise drawing-related questions, manage revisions and track approvals.",
      number: "05",
    },
    {
      icon: MessageSquare,
      title: "Team Collaboration",
      description:
        "Keep project discussions, notifications and team communication connected.",
      number: "06",
    },
  ];

  const projects = [
    {
      category: "ARCHITECTURAL MILLWORK",
      title: "Custom Reception Design",
      image:
        "https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?w=1000",
      description: "Reception and commercial interior detailing",
    },
    {
      category: "CUSTOM CABINETRY",
      title: "Modern Cabinet Design",
      image:
        "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=1000",
      description: "Detailed cabinetry and interior design",
    },
    {
      category: "INTERIOR DETAILING",
      title: "Premium Wall Panels",
      image:
        "https://images.unsplash.com/photo-1600566753086-00f18fb6b3ea?w=1000",
      description: "Architectural wall and panel detailing",
    },
  ];

  return (
    <main className="min-h-screen bg-[#070b14] text-white overflow-hidden">

      {/* BACKGROUND EFFECTS */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-64 left-1/4 w-[650px] h-[650px] bg-blue-600/10 blur-[150px] rounded-full" />
        <div className="absolute top-[45%] -right-60 w-[600px] h-[600px] bg-indigo-600/10 blur-[150px] rounded-full" />
        <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-cyan-500/[0.06] blur-[140px] rounded-full" />
      </div>

      {/* NAVIGATION */}
      <nav className="relative z-30 border-b border-white/[0.08] bg-[#080d19]/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 lg:px-10 h-20 flex items-center justify-between">

          <a href="#" className="flex items-center gap-3">
            <img
              src="/quadelogo.png"
              alt="Quade Logo"
              className="h-12 w-auto max-w-[150px] object-contain"
            />  

            <div className="border-l border-white/20 pl-3">
              <h2 className="font-bold tracking-wide text-lg">
                QUADE CONNECT
              </h2>
              <p className="text-[9px] tracking-[3px] text-slate-500">
                DIGITAL WORKSPACE
              </p>
            </div>
          </a>

          <div className="hidden lg:flex items-center gap-9 text-sm text-slate-400">
            <a href="#about" className="hover:text-white transition">About</a>
            <a href="#projects" className="hover:text-white transition">Millwork</a>
            <a href="#features" className="hover:text-white transition">Features</a>
            <a href="#workflow" className="hover:text-white transition">Workflow</a>
          </div>

          <div className="hidden lg:flex items-center gap-4">
           
            <button
              onClick={onLogin}
              className="px-5 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-sm font-semibold shadow-lg shadow-blue-600/25 transition"
            >
              Enter Workspace <ArrowRight className="inline ml-1" size={16} />
            </button>
          </div>

          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="lg:hidden p-2 text-white"
          >
            {menuOpen ? <X /> : <Menu />}
          </button>
        </div>

        {menuOpen && (
          <div className="lg:hidden px-6 pb-6 space-y-4 bg-[#0b1221]">
            <a onClick={() => setMenuOpen(false)} href="#about" className="block text-slate-300">About</a>
            <a onClick={() => setMenuOpen(false)} href="#projects" className="block text-slate-300">Millwork</a>
            <a onClick={() => setMenuOpen(false)} href="#features" className="block text-slate-300">Features</a>
            <button
              onClick={onLogin}
              className="w-full p-3 rounded-xl bg-blue-600 font-semibold"
            >
              Employee Login
            </button>
          </div>
        )}
      </nav>

      {/* HERO SECTION */}
      <section className="relative z-10 max-w-7xl mx-auto px-6 lg:px-10 pt-20 lg:pt-28 pb-24">
        <div className="grid lg:grid-cols-2 gap-16 items-center">

          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-blue-400/20 bg-blue-500/[0.08] px-4 py-2 mb-8">
              <Sparkles size={15} className="text-blue-400" />
              <span className="text-xs tracking-widest text-blue-300">
                CONNECTING PEOPLE. PROJECTS. PERFORMANCE.
              </span>
            </div>

            <h1 className="text-5xl sm:text-6xl xl:text-7xl font-bold leading-[1.08] tracking-tight">
              Design better.
              <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-cyan-300 to-indigo-400">
                Work smarter.
              </span>
              <br />
              Stay connected.
            </h1>

            <p className="mt-8 max-w-xl text-slate-400 text-base lg:text-lg leading-8">
              A connected digital workspace for architectural millwork
              and CAD operations. Bring your people, projects, attendance
              and performance together in one intelligent platform.
            </p>

            <div className="flex flex-wrap gap-4 mt-10">
              <button
                onClick={onLogin}
                className="group flex items-center gap-3 px-7 py-4 rounded-xl bg-blue-600 hover:bg-blue-500 font-semibold shadow-xl shadow-blue-600/25 transition hover:-translate-y-1"
              >
                Explore Workspace
                <ArrowRight size={19} className="group-hover:translate-x-1 transition" />
              </button>

              <a
                href="#projects"
                className="flex items-center gap-2 px-7 py-4 rounded-xl border border-white/15 text-slate-200 hover:bg-white/[0.06] transition"
              >
                Discover Millwork
                <MoveUpRight size={17} />
              </a>
            </div>

            <div className="flex flex-wrap gap-8 mt-14 pt-8 border-t border-white/10">
              <div>
                <p className="text-2xl font-bold text-white">01</p>
                <p className="text-xs text-slate-500 mt-1">Connected workspace</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-white">360°</p>
                <p className="text-xs text-slate-500 mt-1">Project visibility</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-white">AI</p>
                <p className="text-xs text-slate-500 mt-1">Ready intelligence</p>
              </div>
            </div>
          </div>

          {/* 3D WORKSPACE PREVIEW */}
          <div className="relative perspective-[1200px]">

            <div className="absolute inset-10 bg-blue-500/20 blur-[100px] rounded-full" />

            <div className="relative transform-gpu rotate-y-[-8deg] rotate-x-[4deg] hover:rotate-y-0 hover:rotate-x-0 transition-all duration-700">

              <div className="rounded-3xl border border-white/15 bg-gradient-to-br from-[#17243b] to-[#090f1e] p-4 sm:p-6 shadow-[0_35px_100px_rgba(0,0,0,0.65)]">

                <div className="flex justify-between items-center pb-5 border-b border-white/10">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center">
                      <Layers3 size={19} />
                    </div>
                    <div>
                      <p className="text-sm font-bold">QUADE CONNECT</p>
                      <p className="text-[10px] text-slate-500">PROJECT OVERVIEW</p>
                    </div>
                  </div>
                  <div className="flex gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-red-400" />
                    <span className="w-2 h-2 rounded-full bg-yellow-400" />
                    <span className="w-2 h-2 rounded-full bg-green-400" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 mt-5">
                  <div className="rounded-xl bg-blue-500/10 border border-blue-400/20 p-4">
                    <Clock3 size={20} className="text-blue-400 mb-3" />
                    <p className="text-xs text-slate-400">Attendance</p>
                    <p className="text-xl font-bold mt-1">Active</p>
                  </div>
                  <div className="rounded-xl bg-indigo-500/10 border border-indigo-400/20 p-4">
                    <ChartNoAxesCombined size={20} className="text-indigo-400 mb-3" />
                    <p className="text-xs text-slate-400">Performance</p>
                    <p className="text-xl font-bold mt-1">Insights</p>
                  </div>
                </div>

                <div className="mt-4 rounded-xl overflow-hidden border border-white/10 bg-[#0b1425]">
                  <div className="flex justify-between p-4">
                    <div>
                      <p className="text-sm font-semibold">Millwork Project</p>
                      <p className="text-xs text-slate-500 mt-1">Architectural CAD workspace</p>
                    </div>
                    <span className="text-[10px] text-emerald-300 bg-emerald-500/10 rounded-full px-3 py-1 h-fit">
                      In Progress
                    </span>
                  </div>

                  <div className="px-4 pb-4">
                    <div className="relative h-40 rounded-lg overflow-hidden bg-gradient-to-br from-[#203754] to-[#0c1628]">
                      <img
                        src="https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?w=900"
                        alt="Architectural millwork interior design"
                        className="w-full h-full object-cover opacity-60"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-[#07101e] via-transparent to-transparent" />
                      <div className="absolute bottom-3 left-3">
                        <p className="text-xs font-semibold">Custom Interior Detailing</p>
                        <p className="text-[10px] text-slate-300">CAD project visualization</p>
                      </div>
                      <div className="absolute top-3 right-3 border border-white/30 bg-black/30 backdrop-blur px-2 py-1 rounded text-[9px]">
                        PROJECT 3D VIEW
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex justify-between items-center text-xs text-slate-400">
                  <span className="flex items-center gap-2">
                    <CheckCircle2 size={14} className="text-emerald-400" />
                    Workspace connected
                  </span>
                  <span>QUADE SYSTEM</span>
                </div>
              </div>

              {/* FLOATING CARD */}
              <div className="absolute -left-7 top-24 hidden sm:block rounded-2xl border border-blue-400/30 bg-[#111d31]/95 backdrop-blur-xl p-4 shadow-2xl shadow-blue-950/60 animate-[float_5s_ease-in-out_infinite]">
                <DraftingCompass size={22} className="text-cyan-300 mb-2" />
                <p className="text-xs font-semibold">CAD Operations</p>
                <p className="text-[10px] text-slate-400 mt-1">Precision & coordination</p>
              </div>

              <div className="absolute -right-5 bottom-20 hidden sm:block rounded-2xl border border-indigo-400/30 bg-[#111d31]/95 backdrop-blur-xl p-4 shadow-2xl animate-[float_6s_ease-in-out_infinite]">
                <ShieldCheck size={22} className="text-indigo-300 mb-2" />
                <p className="text-xs font-semibold">Smart Monitoring</p>
                <p className="text-[10px] text-slate-400 mt-1">People & performance</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* TRUST STRIP */}
      <section className="relative z-10 border-y border-white/[0.08] bg-white/[0.02]">
        <div className="max-w-7xl mx-auto px-6 lg:px-10 py-7 flex flex-wrap justify-center lg:justify-between gap-6 text-sm text-slate-400">
          <span className="flex items-center gap-2"><DraftingCompass size={18} className="text-blue-400" /> CAD Operations</span>
          <span className="flex items-center gap-2"><Ruler size={18} className="text-blue-400" /> Millwork Detailing</span>
          <span className="flex items-center gap-2"><Workflow size={18} className="text-blue-400" /> Project Coordination</span>
          <span className="flex items-center gap-2"><MonitorCheck size={18} className="text-blue-400" /> Digital Workspace</span>
        </div>
      </section>

      {/* ABOUT */}
      <section id="about" className="relative z-10 max-w-7xl mx-auto px-6 lg:px-10 py-28">
        <div className="grid lg:grid-cols-2 gap-16 items-center">

          <div>
            <p className="text-blue-400 text-xs font-bold tracking-[4px] mb-5">
              ABOUT QUADE CONNECT
            </p>
            <h2 className="text-4xl lg:text-5xl font-bold leading-tight">
              More than a workspace.
              <br />
              <span className="text-slate-500">A connected way to work.</span>
            </h2>
            <p className="text-slate-400 leading-8 mt-7">
              From architectural millwork detailing to project coordination,
              Quade Connect brings everyday operations into one organized
              digital environment. Teams can manage people, monitor progress
              and communicate with clarity.
            </p>
            <div className="mt-8 space-y-4">
              {[
                "Centralized employee and team management",
                "Clear project visibility and progress tracking",
                "Connected attendance and performance insights",
              ].map((item) => (
                <div key={item} className="flex items-center gap-3 text-sm text-slate-300">
                  <CheckCircle2 size={18} className="text-cyan-400 shrink-0" />
                  {item}
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-[#182941] to-[#0b1220] p-7 min-h-48 flex flex-col justify-between transform hover:-translate-y-2 transition duration-500">
              <Building2 className="text-cyan-300" size={30} />
              <div>
                <p className="text-2xl font-bold">Design</p>
                <p className="text-xs text-slate-400 mt-2">Architectural detailing</p>
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-[#1d2540] to-[#0b1220] p-7 min-h-48 flex flex-col justify-between mt-10 transform hover:-translate-y-2 transition duration-500">
              <Users className="text-indigo-300" size={30} />
              <div>
                <p className="text-2xl font-bold">People</p>
                <p className="text-xs text-slate-400 mt-2">Connected teams</p>
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-[#172d3a] to-[#0b1220] p-7 min-h-48 flex flex-col justify-between transform hover:-translate-y-2 transition duration-500">
              <Boxes className="text-blue-300" size={30} />
              <div>
                <p className="text-2xl font-bold">Projects</p>
                <p className="text-xs text-slate-400 mt-2">Organized delivery</p>
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-[#292342] to-[#0b1220] p-7 min-h-48 flex flex-col justify-between mt-10 transform hover:-translate-y-2 transition duration-500">
              <Sparkles className="text-purple-300" size={30} />
              <div>
                <p className="text-2xl font-bold">Insights</p>
                <p className="text-xs text-slate-400 mt-2">Smarter decisions</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* MILLWORK SHOWCASE */}
      <section id="projects" className="relative z-10 py-24 border-y border-white/[0.08] bg-[#0b1220]">
        <div className="max-w-7xl mx-auto px-6 lg:px-10">

          <div className="flex flex-wrap justify-between items-end gap-6 mb-12">
            <div>
              <p className="text-blue-400 text-xs font-bold tracking-[4px] mb-4">
                DESIGN & DETAILING
              </p>
              <h2 className="text-4xl lg:text-5xl font-bold">
                Architectural Millwork
              </h2>
              <p className="text-slate-400 mt-4 max-w-xl leading-7">
                Explore the design environments and architectural detailing
                that inspire our project workflows.
              </p>
            </div>
            <div className="text-sm text-slate-500">
              DESIGN VISUALIZATION / CAD COORDINATION
            </div>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {projects.map((project, index) => (
              <div
                key={project.title}
                className="group rounded-2xl overflow-hidden border border-white/10 bg-[#101a2b] hover:border-blue-400/40 transition-all duration-500 hover:-translate-y-2 hover:shadow-[0_25px_60px_rgba(30,90,200,0.16)]"
              >
                <div className="relative h-64 overflow-hidden">
                  <img
                    src={project.image}
                    alt={project.title}
                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#08101e] via-transparent to-transparent" />
                  <span className="absolute top-4 left-4 text-[10px] tracking-wider bg-black/50 backdrop-blur px-3 py-2 rounded-full border border-white/20">
                    {project.category}
                  </span>
                  <span className="absolute bottom-4 right-4 text-xs text-white/80">
                    0{index + 1}
                  </span>
                </div>
                <div className="p-6">
                  <h3 className="text-xl font-semibold">{project.title}</h3>
                  <p className="text-sm text-slate-400 mt-2">{project.description}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-500 mt-5">
            Illustrative design imagery. These images are not representations of completed Quade projects.
          </p>
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" className="relative z-10 max-w-7xl mx-auto px-6 lg:px-10 py-28">

        <div className="text-center max-w-2xl mx-auto mb-16">
          <p className="text-blue-400 text-xs font-bold tracking-[4px] mb-5">
            ONE CONNECTED PLATFORM
          </p>
          <h2 className="text-4xl lg:text-5xl font-bold">
            Everything working
            <span className="text-blue-400"> together.</span>
          </h2>
          <p className="text-slate-400 mt-5 leading-7">
            Bring your employee operations, project delivery and
            team collaboration into one intelligent workspace.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {features.map((feature) => {
            const Icon = feature.icon;
            return (
              <div
                key={feature.number}
                className="group relative rounded-2xl border border-white/10 bg-gradient-to-br from-[#131f33] to-[#0b1220] p-7 overflow-hidden transition-all duration-500 hover:-translate-y-2 hover:border-blue-400/40 hover:shadow-[0_25px_60px_rgba(20,70,180,0.15)]"
              >
                <span className="absolute top-5 right-6 text-5xl font-bold text-white/[0.035]">
                  {feature.number}
                </span>
                <div className="w-14 h-14 rounded-2xl bg-blue-500/10 border border-blue-400/20 flex items-center justify-center mb-7 group-hover:bg-blue-600 transition">
                  <Icon size={25} className="text-blue-300 group-hover:text-white" />
                </div>
                <h3 className="text-xl font-semibold">{feature.title}</h3>
                <p className="text-sm leading-7 text-slate-400 mt-3">
                  {feature.description}
                </p>
                <div className="mt-7 flex items-center gap-2 text-xs text-blue-400">
                  <span>Connected capability</span>
                  <ArrowRight size={14} />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* WORKFLOW */}
      <section id="workflow" className="relative z-10 py-24 border-y border-white/[0.08] bg-gradient-to-b from-[#0d1728] to-[#080d19]">
        <div className="max-w-7xl mx-auto px-6 lg:px-10">

          <div className="text-center mb-16">
            <p className="text-blue-400 text-xs font-bold tracking-[4px] mb-4">
              SIMPLE. CONNECTED. ORGANIZED.
            </p>
            <h2 className="text-4xl font-bold">A better way to work</h2>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                n: "01",
                title: "Connect Your People",
                desc: "Bring employees, managers and teams into one workspace.",
              },
              {
                n: "02",
                title: "Coordinate Projects",
                desc: "Organize CAD projects, responsibilities and communication.",
              },
              {
                n: "03",
                title: "Track Performance",
                desc: "Monitor attendance, progress and productivity insights.",
              },
            ].map((step) => (
              <div key={step.n} className="relative text-center p-8 rounded-2xl border border-white/10 bg-white/[0.025] hover:bg-white/[0.05] transition">
                <div className="mx-auto w-16 h-16 rounded-2xl bg-blue-600/15 border border-blue-400/20 flex items-center justify-center text-2xl font-bold text-blue-300 mb-7">
                  {step.n}
                </div>
                <h3 className="text-xl font-semibold">{step.title}</h3>
                <p className="text-sm text-slate-400 leading-7 mt-4">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="relative z-10 max-w-7xl mx-auto px-6 lg:px-10 py-28">
        <div className="relative rounded-3xl overflow-hidden border border-blue-400/20 bg-gradient-to-br from-[#142b50] via-[#10213b] to-[#11152a] p-10 lg:p-16 text-center shadow-[0_25px_90px_rgba(20,70,180,0.15)]">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-40 bg-blue-500/20 blur-[100px]" />
          <div className="relative">
            <div className="inline-flex p-4 rounded-2xl bg-white/10 border border-white/10 mb-7">
              <Sparkles size={30} className="text-cyan-300" />
            </div>
            <h2 className="text-4xl lg:text-5xl font-bold">
              Your workspace.
              <br />
              <span className="text-cyan-300">All connected.</span>
            </h2>
            <p className="text-slate-300 max-w-xl mx-auto mt-6 leading-7">
              Sign in to your QUADE CONNECT workspace and stay connected
              with your team, attendance and projects.
            </p>
            <button
              onClick={onLogin}
              className="mt-9 inline-flex items-center gap-3 rounded-xl bg-white text-[#10213b] font-bold px-8 py-4 hover:bg-cyan-100 hover:-translate-y-1 transition shadow-xl"
            >
               Login
              <ArrowRight size={19} />
            </button>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="relative z-10 border-t border-white/10 bg-[#070b14]">
        <div className="max-w-7xl mx-auto px-6 lg:px-10 py-9 flex flex-col sm:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-3">
            <img
              src="/quadelogo.png"
              alt="Quade Logo"
              className="h-10 w-auto max-w-[120px] object-contain"
            />
            <div>
              <p className="font-bold tracking-wide">QUADE CONNECT</p>
              <p className="text-[9px] tracking-[2px] text-slate-500">
                CONNECTED WORKSPACE
              </p>
            </div>
          </div>
          <p className="text-xs text-slate-500">
            © {new Date().getFullYear()} QUADE CONNECT. All rights reserved.
          </p>
          <button onClick={onLogin} className="text-sm text-blue-400 hover:text-white transition">
            Employee Login <ArrowRight className="inline ml-1" size={14} />
          </button>
        </div>
      </footer>

      {/* FLOAT ANIMATION */}
      <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-13px); }
        }
        html { scroll-behavior: smooth; }
      `}</style>

    </main>
  );
}
