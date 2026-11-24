
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Search,
  RefreshCw,
  Users,
  UserRound,
  Mail,
  CalendarDays,
  AlertCircle,
} from "lucide-react";

import { supabase } from "../../lib/supabaseClient";

function People({ role, title, description }) {
  const [people, setPeople] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchPeople = useCallback(async () => {
    setLoading(true);
    setError("");

    const { data, error: fetchError } = await supabase
      .from("profiles")
      .select("id, full_name, email, is_active, created_at")
      .eq("role", role)
      .order("created_at", { ascending: false });

    if (fetchError) {
      setError(fetchError.message);
      setPeople([]);
    } else {
      setPeople(data || []);
    }

    setLoading(false);
  }, [role]);

  useEffect(() => {
    fetchPeople();
  }, [fetchPeople]);

  const filteredPeople = useMemo(() => {
    const searchValue = search.trim().toLowerCase();

    return people.filter((person) => {
      const matchesSearch =
        !searchValue ||
        (person.full_name || "").toLowerCase().includes(searchValue) ||
        (person.email || "").toLowerCase().includes(searchValue);

      return matchesSearch;
    });
  }, [people, search]);


  const formatDate = (date) => {
    if (!date) return "Not available";

    return new Date(date).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  return (
    <>
      <div className="min-h-screen p-5 text-slate-100 sm:p-8">

        {/* HEADER */}
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="mb-2 text-sm font-medium text-blue-400">
              HR WORKSPACE / {title.toUpperCase()}
            </p>

            <h1 className="text-2xl font-bold text-white sm:text-3xl">
              {title}
            </h1>

            <p className="mt-2 text-sm text-slate-400">
              {description}
            </p>
          </div>

          <button
            type="button"
            onClick={fetchPeople}
            disabled={loading}
            className="flex items-center gap-2 rounded-xl border border-slate-700 bg-[#17243D] px-4 py-3 text-sm font-medium text-slate-300 transition hover:border-blue-500/50 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw
              size={16}
              className={loading ? "animate-spin" : ""}
            />
            Refresh
          </button>
        </div>

        {/* SUMMARY CARDS */}
        <div className="mb-8 grid gap-5 sm:max-w-sm">

          <div className="rounded-2xl border border-blue-900/40 bg-[#101B35] p-6">
            <div className="mb-4 flex items-center justify-between">
              <Users size={24} className="text-blue-400" />
              <span className="text-xs text-slate-500">All accounts</span>
            </div>

            <p className="text-sm text-slate-400">
              Total {title}
            </p>

            <h2 className="mt-2 text-3xl font-bold text-white">
              {loading ? "..." : people.length}
            </h2>
          </div>
        </div>

        {/* DIRECTORY TABLE */}
        <section className="overflow-hidden rounded-2xl border border-blue-900/40 bg-[#101B35]">

          <div className="flex flex-col gap-4 border-b border-slate-700/70 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-white">
                {title} Directory
              </h2>

              <p className="mt-1 text-xs text-slate-400">
                Account records from your workspace.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">

              {/* SEARCH */}
              <div className="relative">
                <Search
                  size={17}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
                />

                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={`Search ${title.toLowerCase()}...`}
                  className="w-full rounded-xl border border-slate-700 bg-[#0B1428] py-3 pl-10 pr-4 text-sm text-white outline-none placeholder:text-slate-500 focus:border-blue-500 sm:w-64"
                />
              </div>
            </div>
          </div>

          {/* ERROR */}
          {error && (
            <div
              role="alert"
              className="m-5 flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300"
            >
              <AlertCircle size={18} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* TABLE */}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-left">
              <thead className="bg-[#0B1428] text-xs uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="px-6 py-4 font-semibold">Name</th>
                  <th className="px-6 py-4 font-semibold">Email</th>
                  <th className="px-6 py-4 font-semibold">Joined Date</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-700/60">
                {loading ? (
                  <tr>
                    <td colSpan="3" className="px-6 py-12 text-center text-sm text-slate-400">
                      Loading records...
                    </td>
                  </tr>
                ) : error ? null : filteredPeople.length === 0 ? (
                  <tr>
                    <td colSpan="3" className="px-6 py-16 text-center">
                      <Users size={32} className="mx-auto mb-3 text-slate-600" />

                      <p className="font-medium text-slate-300">
                        No records found
                      </p>

                      <p className="mt-1 text-sm text-slate-500">
                        Try changing your search or status filter.
                      </p>
                    </td>
                  </tr>
                ) : (
                  filteredPeople.map((person) => (
                    <tr
                      key={person.id}
                      className="transition hover:bg-white/[0.025]"
                    >
                      <td className="px-6 py-5">
                        <div className="flex items-center gap-3">
                          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-blue-400/20 bg-blue-500/10 font-semibold text-blue-300">
                            {(person.full_name || title.charAt(0))
                              .charAt(0)
                              .toUpperCase()}
                          </div>

                          <div>
                            <p className="font-medium text-white">
                              {person.full_name || "Name not provided"}
                            </p>

                            <p className="mt-1 text-xs text-slate-500">
                              {title}
                            </p>
                          </div>
                        </div>
                      </td>

                      <td className="px-6 py-5">
                        <div className="flex items-center gap-2 text-sm text-slate-300">
                          <Mail size={15} className="text-slate-500" />
                          {person.email || "Not available"}
                        </div>
                      </td>

                      <td className="px-6 py-5">
                        <div className="flex items-center gap-2 text-sm text-slate-400">
                          <CalendarDays size={15} />
                          {formatDate(person.created_at)}
                        </div>
                      </td>

                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* FOOTER */}
          {!loading && !error && (
            <div className="border-t border-slate-700/70 px-6 py-4">
              <p className="text-xs text-slate-500">
                Showing {filteredPeople.length} of {people.length} accounts
              </p>
            </div>
          )}
        </section>
      </div>
    </>
  );
}

export default People;
