"use client";

import { useEffect, useState, useMemo } from "react";
import { createClient } from "../../lib/supabase";
import { getCoverageColor, type CoverageResult } from "../../lib/vaccination";

// ---------------------------------------------------------------------------
// Admin: Vaccination Coverage Heatmap
// Table: village | total animals | vaccinated | coverage %
// Color-code: GREEN (>70%), YELLOW (60-70%), RED (<60%)
// Sortable by coverage % ascending (lowest first default)
// Filter: show only under-vaccinated (<60%)
// ---------------------------------------------------------------------------

type SortKey = "coverage" | "village" | "total" | "vaccinated";
type SortDir = "asc" | "desc";

export default function VaccinationAdminPage() {
  const supabase = createClient();
  const [data, setData] = useState<CoverageResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterUnderVaccinated, setFilterUnderVaccinated] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("coverage");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [searchVillage, setSearchVillage] = useState("");
  const [useEdgeFunction, setUseEdgeFunction] = useState(false);

  async function fetchViaClient() {
    // Try direct village columns (extended schema); fallback via farmers join (canonical schema)
    const vaccRes = await supabase.from("vaccinations").select("farmer_id, village, block, district");
    const reportRes = await supabase.from("reports").select("farmer_id, village, block, district");

    const missingColumn = (e: unknown) => {
      const m = String((e as { message?: string })?.message || e || "").toLowerCase();
      return m.includes("does not exist") || m.includes("column") || m.includes("42703") || m.includes("could not find");
    };

    const isMissing = (vaccRes.error && missingColumn(vaccRes.error)) || (reportRes.error && missingColumn(reportRes.error));

    if (!isMissing) {
      if (vaccRes.error) throw new Error(`vaccinations: ${vaccRes.error.message}`);
      if (reportRes.error) throw new Error(`reports: ${reportRes.error.message}`);

      const vaccByVillage = new Map<string, { farmers: Set<string>; block?: string; district?: string }>();
      for (const r of (vaccRes.data as unknown as { farmer_id: string; village: string; block: string; district: string }[]) || []) {
        if (!vaccByVillage.has(r.village)) vaccByVillage.set(r.village, { farmers: new Set(), block: r.block, district: r.district });
        vaccByVillage.get(r.village)!.farmers.add(r.farmer_id);
      }
      const reportByVillage = new Map<string, { farmers: Set<string>; block?: string; district?: string }>();
      for (const r of (reportRes.data as unknown as { farmer_id: string; village: string; block: string; district: string }[]) || []) {
        if (!reportByVillage.has(r.village)) reportByVillage.set(r.village, { farmers: new Set(), block: r.block, district: r.district });
        reportByVillage.get(r.village)!.farmers.add(r.farmer_id);
      }
      const all = new Set<string>([...vaccByVillage.keys(), ...reportByVillage.keys()]);
      const rows: CoverageResult[] = [];
      for (const village of all) {
        const v = vaccByVillage.get(village);
        const r = reportByVillage.get(village);
        const vaccinated_count = v ? v.farmers.size : 0;
        const total_count = r ? r.farmers.size : 0;
        rows.push({
          village,
          block: v?.block || r?.block,
          district: v?.district || r?.district,
          vaccinated_count,
          total_count,
          coverage_percentage: total_count === 0 ? 0 : Math.round((vaccinated_count / total_count) * 100 * 10) / 10,
        });
      }
      return rows;
    }

    // Fallback: derive village via farmers (canonical schema)
    const [vaccIds, reportIds, farmersRes] = await Promise.all([
      supabase.from("vaccinations").select("farmer_id"),
      supabase.from("reports").select("farmer_id"),
      supabase.from("farmers").select("id, village, block"),
    ]);
    if (vaccIds.error) throw new Error(`vaccinations: ${vaccIds.error.message}`);
    if (reportIds.error) throw new Error(`reports: ${reportIds.error.message}`);
    if (farmersRes.error) throw new Error(`farmers: ${farmersRes.error.message}`);

    const farmerMap = new Map<string, { village: string; block: string }>();
    for (const f of (farmersRes.data as unknown as { id: string; village: string; block: string }[]) || []) farmerMap.set(f.id, { village: f.village, block: f.block });

    const vaccByVillage = new Map<string, { farmers: Set<string>; block?: string }>();
    for (const r of (vaccIds.data as { farmer_id: string }[] | null) || []) {
      const fm = farmerMap.get(r.farmer_id);
      if (!fm) continue;
      if (!vaccByVillage.has(fm.village)) vaccByVillage.set(fm.village, { farmers: new Set(), block: fm.block });
      vaccByVillage.get(fm.village)!.farmers.add(r.farmer_id);
    }
    const reportByVillage = new Map<string, { farmers: Set<string>; block?: string }>();
    for (const r of (reportIds.data as { farmer_id: string }[] | null) || []) {
      const fm = farmerMap.get(r.farmer_id);
      if (!fm) continue;
      if (!reportByVillage.has(fm.village)) reportByVillage.set(fm.village, { farmers: new Set(), block: fm.block });
      reportByVillage.get(fm.village)!.farmers.add(r.farmer_id);
    }

    const all = new Set<string>([...vaccByVillage.keys(), ...reportByVillage.keys()]);
    const rows: CoverageResult[] = [];
    for (const village of all) {
      const v = vaccByVillage.get(village);
      const r = reportByVillage.get(village);
      const vaccinated_count = v ? v.farmers.size : 0;
      const total_count = r ? r.farmers.size : 0;
      rows.push({
        village,
        block: v?.block || r?.block,
        vaccinated_count,
        total_count,
        coverage_percentage: total_count === 0 ? 0 : Math.round((vaccinated_count / total_count) * 100 * 10) / 10,
      });
    }
    return rows;
  }

  async function fetchViaEdge() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !anonKey) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL / ANON_KEY for edge function");
    const res = await fetch(`${supabaseUrl}/functions/v1/get-coverage`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
    });
    if (!res.ok) throw new Error(`Edge function ${res.status}: ${await res.text()}`);
    const json = await res.json();
    return (json.data as CoverageResult[]) || [];
  }

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const rows = useEdgeFunction ? await fetchViaEdge() : await fetchViaClient();
        if (mounted) setData(rows);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        if (mounted) setError(msg);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [useEdgeFunction]); // eslint-disable-line react-hooks/exhaustive-deps

  const filteredSorted = useMemo(() => {
    let rows = [...data];
    if (filterUnderVaccinated) rows = rows.filter((r) => r.coverage_percentage < 60);
    if (searchVillage.trim()) {
      const q = searchVillage.toLowerCase();
      rows = rows.filter((r) => r.village.toLowerCase().includes(q) || (r.block && r.block.toLowerCase().includes(q)));
    }
    rows.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "coverage") cmp = a.coverage_percentage - b.coverage_percentage;
      else if (sortKey === "village") cmp = a.village.localeCompare(b.village);
      else if (sortKey === "total") cmp = a.total_count - b.total_count;
      else if (sortKey === "vaccinated") cmp = a.vaccinated_count - b.vaccinated_count;
      return sortDir === "asc" ? cmp : -cmp;
    });
    return rows;
  }, [data, filterUnderVaccinated, sortKey, sortDir, searchVillage]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      // default dirs: coverage asc (lowest first), others asc too except maybe village
      setSortDir("asc");
    }
  }

  function CoverageBadge({ pct }: { pct: number }) {
    const color = getCoverageColor(pct);
    const bg = color === "green" ? "bg-green-100 text-green-800 border-green-200" : color === "yellow" ? "bg-yellow-100 text-yellow-800 border-yellow-200" : "bg-red-100 text-red-800 border-red-200";
    return <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${bg}`}>{pct}%</span>;
  }

  const stats = useMemo(() => {
    const totalVillages = data.length;
    const under = data.filter((d) => d.coverage_percentage < 60).length;
    const good = data.filter((d) => d.coverage_percentage > 70).length;
    const avg = totalVillages ? Math.round((data.reduce((s, d) => s + d.coverage_percentage, 0) / totalVillages) * 10) / 10 : 0;
    return { totalVillages, under, good, avg };
  }, [data]);

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="mx-auto max-w-5xl">
        {/* Header */}
        <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Vaccination Coverage — Admin</h1>
            <p className="mt-1 text-sm text-gray-600">
              Coverage = <code className="rounded bg-gray-100 px-1">DISTINCT farmers vaccinated / DISTINCT farmers reported</code> per village. Below{" "}
              <code className="rounded bg-gray-100 px-1">60%</code> flagged red.
            </p>
          </div>
          <a
            href="/vaccination"
            className="inline-flex h-9 items-center rounded-lg border bg-white px-4 text-sm font-medium text-gray-700 hover:bg-gray-100"
          >
            + Log Vaccination
          </a>
        </div>

        {/* Stats bar */}
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border bg-white p-4">
            <div className="text-xs text-gray-500">Villages tracked</div>
            <div className="mt-1 text-xl font-bold">{stats.totalVillages}</div>
          </div>
          <div className="rounded-xl border bg-white p-4">
            <div className="text-xs text-gray-500">Avg coverage</div>
            <div className="mt-1 text-xl font-bold">{stats.avg}%</div>
          </div>
          <div className="rounded-xl border bg-white p-4">
            <div className="text-xs text-gray-500">Good (&gt;70%)</div>
            <div className="mt-1 text-xl font-bold text-green-700">{stats.good}</div>
          </div>
          <div className="rounded-xl border bg-red-50 p-4">
            <div className="text-xs text-red-700">Under-vaccinated (&lt;60%)</div>
            <div className="mt-1 text-xl font-bold text-red-700">{stats.under}</div>
          </div>
        </div>

        {/* Controls */}
        <div className="mb-4 flex flex-col gap-3 rounded-xl border bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={filterUnderVaccinated}
                onChange={(e) => setFilterUnderVaccinated(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
              />
              <span className="font-medium">Only under-vaccinated (&lt;60%)</span>
            </label>

            <div className="h-6 w-px bg-gray-200 hidden sm:block" />

            <input
              type="text"
              value={searchVillage}
              onChange={(e) => setSearchVillage(e.target.value)}
              placeholder="Filter village / block…"
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-green-600 focus:outline-none focus:ring-2 focus:ring-green-100"
            />
          </div>

          <div className="flex items-center gap-3">
            <label className="inline-flex items-center gap-2 text-xs text-gray-600">
              <input type="checkbox" checked={useEdgeFunction} onChange={(e) => setUseEdgeFunction(e.target.checked)} className="h-3.5 w-3.5 rounded" />
              Use edge function
            </label>
            <span className="text-xs text-gray-400 hidden sm:inline">{useEdgeFunction ? "/functions/v1/get-coverage" : "direct Supabase"}</span>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
          {loading ? (
            <div className="p-10 text-center text-sm text-gray-500">Loading coverage data…</div>
          ) : error ? (
            <div className="p-6">
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">Error: {error}</div>
              <div className="mt-3 text-xs text-gray-600">
                Hint: ensure <code className="rounded bg-gray-100 px-1">vaccinations</code> and <code className="rounded bg-gray-100 px-1">reports</code> tables exist and env is set. If using edge, deploy supabase/functions/get-coverage.
              </div>
            </div>
          ) : filteredSorted.length === 0 ? (
            <div className="p-10 text-center">
              <div className="text-sm font-medium text-gray-700">No villages match filter</div>
              <div className="mt-1 text-xs text-gray-500">{data.length === 0 ? "No villages found — seed vaccinations & reports first." : "Try clearing filters."}</div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold">
                      <button onClick={() => toggleSort("village")} className="inline-flex items-center gap-1 hover:text-gray-700">
                        Village {sortKey === "village" ? (sortDir === "asc" ? "↑" : "↓") : "↕"}
                      </button>
                    </th>
                    <th className="px-4 py-3 text-left font-semibold">Block</th>
                    <th className="px-4 py-3 text-right font-semibold">
                      <button onClick={() => toggleSort("total")} className="inline-flex items-center gap-1 hover:text-gray-700">
                        Total animals {sortKey === "total" ? (sortDir === "asc" ? "↑" : "↓") : "↕"}
                      </button>
                    </th>
                    <th className="px-4 py-3 text-right font-semibold">
                      <button onClick={() => toggleSort("vaccinated")} className="inline-flex items-center gap-1 hover:text-gray-700">
                        Vaccinated {sortKey === "vaccinated" ? (sortDir === "asc" ? "↑" : "↓") : "↕"}
                      </button>
                    </th>
                    <th className="px-4 py-3 text-right font-semibold">
                      <button onClick={() => toggleSort("coverage")} className="inline-flex items-center gap-1 hover:text-gray-700">
                        Coverage % {sortKey === "coverage" ? (sortDir === "asc" ? "↑" : "↓") : "↕"}
                      </button>
                    </th>
                    <th className="px-4 py-3 text-left font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredSorted.map((row) => {
                    const color = getCoverageColor(row.coverage_percentage);
                    const rowBg = color === "green" ? "bg-green-50/50" : color === "yellow" ? "bg-yellow-50/60" : "bg-red-50/70";
                    // left border indicator for heatmap feel
                    const border = color === "green" ? "border-l-green-500" : color === "yellow" ? "border-l-yellow-500" : "border-l-red-500";
                    return (
                      <tr key={row.village} className={`${rowBg} border-l-4 ${border} hover:brightness-[0.98]`}>
                        <td className="px-4 py-3 font-medium text-gray-900">{row.village}</td>
                        <td className="px-4 py-3 text-gray-600">{row.block || "—"}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{row.total_count}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{row.vaccinated_count}</td>
                        <td className="px-4 py-3 text-right">
                          <CoverageBadge pct={row.coverage_percentage} />
                        </td>
                        <td className="px-4 py-3">
                          {color === "green" && <span className="text-xs font-medium text-green-700">● Good &gt;70%</span>}
                          {color === "yellow" && <span className="text-xs font-medium text-yellow-700">● Moderate 60–70%</span>}
                          {color === "red" && <span className="text-xs font-medium text-red-700">● Low &lt;60% — Priority</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Legend */}
          <div className="flex flex-wrap gap-4 border-t bg-gray-50 px-4 py-3 text-xs">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-3 w-3 rounded bg-green-500" /> GREEN &gt;70%
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-3 w-3 rounded bg-yellow-400" /> YELLOW 60–70%
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-3 w-3 rounded bg-red-500" /> RED &lt;60%
            </span>
            <span className="ml-auto text-gray-500">Default sort: coverage % ascending (lowest first)</span>
          </div>
        </div>

        <div className="mt-4 rounded-lg border bg-white p-4 text-xs text-gray-600">
          <div className="font-medium text-gray-800">Notes</div>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            <li>
              Vaccinated = <code className="rounded bg-gray-100 px-1">COUNT(DISTINCT farmer_id)</code> in <code className="rounded bg-gray-100 px-1">vaccinations</code> for that village.
            </li>
            <li>
              Total = <code className="rounded bg-gray-100 px-1">COUNT(DISTINCT farmer_id)</code> in <code className="rounded bg-gray-100 px-1">reports</code> (animals reported) for that village. Returns 0% if no reports yet (division-by-zero handled).
            </li>
            <li>
              Edge endpoint: <code className="rounded bg-gray-100 px-1">/functions/v1/get-coverage?village=Hiware%20Bazar</code> or{" "}
              <code className="rounded bg-gray-100 px-1">?block=Parner</code> or no param for all.
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
