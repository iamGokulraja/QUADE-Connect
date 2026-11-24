import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";

import App from "./App.jsx";
import { queryClient } from "./lib/queryClient";
import { configMissing } from "./lib/supabaseClient";

import { initTheme } from "./lib/theme";

import "./App.css";

initTheme();

createRoot(document.getElementById("root")).render(
  <StrictMode>
    {configMissing ? (
      <div className="flex min-h-screen items-center justify-center bg-[#0B1120] p-8 text-slate-200">
        <div className="max-w-lg rounded-2xl border border-red-500/30 bg-red-500/10 p-6">
          <h1 className="mb-2 text-xl font-bold text-red-300">Supabase is not configured</h1>
          <p className="text-sm">
            Create a file named <code>.env</code> next to <code>package.json</code> with
            <code> VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_PUBLISHABLE_KEY</code>, then stop and
            restart <code>npm.cmd run dev</code>.
          </p>
        </div>
      </div>
    ) : (
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    )}
  </StrictMode>
);
