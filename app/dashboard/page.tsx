"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import dynamic from "next/dynamic";
import { createClient } from "@/lib/supabase";
import { getAllVillageCoverageClient } from "@/lib/vaccination";
import type { DashboardCase } from "@/components/DashboardMap";

// Dynamic import for SSR safety
const DashboardMap = dynamic(() => import("@/components/DashboardMap"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-[400px] lg:h-full bg-gray-100 animate-pulse flex items-center justify-center text-gray-500 text-sm rounded-xl border">
      Loading map…
    </div>
  ),
});

// ---------------------------------------------------------------------------
// Mock fallback when Supabase not configured / empty
// Uses Maharashtra villages (seed data) with realistic coords around Ahmednagar
// ---------------------------------------------------------------------------
const MOCK_CASES: DashboardCase[] = [
  {
    id: "case-mock-001",
    report_id: "rep-001",
    risk_level: "HIGH",
    status: "assigned",
    animal_type: "cow",
    farmer_name: "Sunil Pawar",
    farmer_phone: "+919987372106",
    village: "Hiware Bazar",
    block: "Parner",
    latitude: 19.0698,
    longitude: 74.4332,
    created_at: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
    updated_at: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
    symptoms: ["fever", "swelling", "not_eating"],
    photo_url: "https://images.unsplash.com/photo-1527153857715-3908f2bae5e8?w=600&h=400&fit=crop",
    notes: "High fever, swollen neck, not eating for 2 days",
  },
  {
    id: "case-mock-002",
    report_id: "rep-002",
    risk_level: "HIGH",
    status: "assigned",
    animal_type: "buffalo",
    farmer_name: "Eknath Pawar",
    farmer_phone: "+917518700497",
    village: "Takali Dhokeshwar",
    block: "Parner",
    latitude: 19.1512,
    longitude: 74.4221,
    created_at: new Date(Date.now() - 1000 * 60 * 90).toISOString(),
    updated_at: new Date(Date.now() - 1000 * 60 * 90).toISOString(),
    symptoms: ["fever", "bleeding", "lethargy"],
    photo_url: null,
    notes: "Bleeding from nose, lethargic",
  },
  {
    id: "case-mock-003",
    report_id: "rep-003",
    risk_level: "MEDIUM",
    status: "pending",
    animal_type: "goat",
    farmer_name: "Suresh Mhaske",
    farmer_phone: "+917540243603",
    village: "Ralegan Siddhi",
    block: "Parner",
    latitude: 18.9234,
    longitude: 74.3856,
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
    updated_at: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
    symptoms: ["cough", "fever"],
    photo_url: "https://images.unsplash.com/photo-1500595046743-cd271d694d30?w=600&h=400&fit=crop",
    notes: "Persistent cough, mild fever",
  },
  {
    id: "case-mock-004",
    report_id: "rep-004",
    risk_level: "LOW",
    status: "confirmed",
    animal_type: "sheep",
    farmer_name: "Baban Gholap",
    farmer_phone: "+917640451237",
    village: "Ralegan Siddhi",
    block: "Parner",
    latitude: 18.9189,
    longitude: 74.3912,
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(),
    updated_at: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
    symptoms: ["diarrhea"],
    photo_url: null,
    notes: "Loose motion observed",
  },
  {
    id: "case-mock-005",
    report_id: "rep-005",
    risk_level: "MEDIUM",
    status: "assigned",
    animal_type: "cow",
    farmer_name: "Namdev Ghule",
    farmer_phone: "+917714334694",
    village: "Takali Dhokeshwar",
    block: "Parner",
    latitude: 19.1489,
    longitude: 74.4188,
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString(),
    updated_at: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString(),
    symptoms: ["swelling", "discharge"],
    photo_url: null,
    notes: "Udder swelling",
  },
  {
    id: "case-mock-006",
    report_id: "rep-006",
    risk_level: "HIGH",
    status: "pending",
    animal_type: "buffalo",
    farmer_name: "Sanjay Bankar",
    farmer_phone: "+919571713002",
    village: "Kolhewadi",
    block: "Sangamner",
    latitude: 19.4212,
    longitude: 74.2411,
    created_at: new Date(Date.now() - 1000 * 60 * 20).toISOString(),
    updated_at: new Date(Date.now() - 1000 * 60 * 20).toISOString(),
    symptoms: ["fever", "swelling", "discharge", "not_eating"],
    photo_url: "https://images.unsplash.com/photo-1518717758536-85ae29035b6d?w=600&h=400&fit=crop",
    notes: "Critical - multiple symptoms",
  },
  {
    id: "case-mock-007",
    report_id: "rep-007",
    risk_level: "LOW",
    status: "assigned",
    animal_type: "goat",
    farmer_name: "Shankar Gaikwad",
    farmer_phone: "+917565462612",
    village: "Shani Shingnapur",
    block: "Nevasa",
    latitude: 19.3567,
    longitude: 74.7298,
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 8).toISOString(),
    updated_at: new Date(Date.now() - 1000 * 60 * 60 * 8).toISOString(),
    symptoms: ["cough"],
    photo_url: null,
    notes: "Mild cough",
  },
  {
    id: "case-mock-008",
    report_id: "rep-008",
    risk_level: "MEDIUM",
    status: "treated",
    animal_type: "cow",
    farmer_name: "Tukaram Darade",
    farmer_phone: "+917481152553",
    village: "Hiware Bazar",
    block: "Parner",
    latitude: 19.0721,
    longitude: 74.4298,
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 12).toISOString(),
    updated_at: new Date(Date.now() - 1000 * 60 * 60 * 1).toISOString(),
    symptoms: ["fever", "not_eating"],
    photo_url: null,
    notes: "Recovering after treatment",
  },
  {
    id: "case-mock-009",
    report_id: "rep-009",
    risk_level: "HIGH",
    status: "assigned",
    animal_type: "goat",
    farmer_name: "Ramesh Jadhav",
    farmer_phone: "+919764685448",
    village: "Takali Dhokeshwar",
    block: "Parner",
    latitude: 19.1445,
    longitude: 74.4255,
    created_at: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
    updated_at: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
    symptoms: ["fever", "bleeding", "diarrhea"],
    photo_url: null,
    notes: "Severe diarrhea with blood",
  },
  {
    id: "case-mock-010",
    report_id: "rep-010",
    risk_level: "LOW",
    status: "pending",
    animal_type: "buffalo",
    farmer_name: "Vijay Ghule",
    farmer_phone: "+918947911102",
    village: "Kolhewadi",
    block: "Sangamner",
    latitude: 19.4189,
    longitude: 74.2389,
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 6).toISOString(),
    updated_at: new Date(Date.now() - 1000 * 60 * 60 * 6).toISOString(),
    symptoms: ["lethargy"],
    photo_url: null,
    notes: "Lethargic but eating",
  },
  {
    id: "case-mock-011",
    report_id: "rep-011",
    risk_level: "MEDIUM",
    status: "assigned",
    animal_type: "sheep",
    farmer_name: "Ashok Pardhi",
    farmer_phone: "+918024008979",
    village: "Shani Shingnapur",
    block: "Nevasa",
    latitude: 19.3521,
    longitude: 74.7356,
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 4).toISOString(),
    updated_at: new Date(Date.now() - 1000 * 60 * 60 * 4).toISOString(),
    symptoms: ["swelling", "fever"],
    photo_url: null,
    notes: "Leg swelling",
  },
  {
    id: "case-mock-012",
    report_id: "rep-012",
    risk_level: "LOW",
    status: "false_alarm",
    animal_type: "cow",
    farmer_name: "Ganesh Pawar",
    farmer_phone: "+917531845424",
    village: "Hiware Bazar",
    block: "Parner",
    latitude: 19.0654,
    longitude: 74.4367,
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
    updated_at: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
    symptoms: ["not_eating"],
    photo_url: null,
    notes: "False alarm - recovered",
  },
];

function normalizeRisk(risk: string | null | undefined): "HIGH" | "MEDIUM" | "LOW" {
  if (!risk) return "LOW";
  const up = String(risk).toUpperCase();
  if (up === "HIGH") return "HIGH";
  if (up === "MEDIUM") return "MEDIUM";
  if (up === "LOW") return "LOW";
  if (up === "PENDING") return "LOW";
  return "LOW";
}

export default function DashboardPage() {
  const [cases, setCases] = useState<DashboardCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isMock, setIsMock] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [riskFilter, setRiskFilter] = useState<"ALL" | "HIGH" | "MEDIUM" | "LOW">("ALL");
  const [animalFilter, setAnimalFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [sortBy, setSortBy] = useState<"risk" | "date" | "animal">("risk");
  const [coverageAvg, setCoverageAvg] = useState<number | null>(null);
  const [coverageLoading, setCoverageLoading] = useState(true);

  const supabase = createClient();

  const fetchCases = useCallback(async () => {
    setLoading(true);
    setError(null);
    // Try Supabase if configured
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const configured = !!url && !!key && !url.includes("placeholder");

    if (!configured) {
      await new Promise((r) => setTimeout(r, 400));
      setCases(MOCK_CASES);
      setIsMock(true);
      setLoading(false);
      return;
    }

    try {
      // Attempt 1: canonical schema with farmer join
      let data: unknown[] | null = null;
      let fetchError: unknown = null;

      // Try most complete select first
      const selects = [
        // Extended with direct village fields on reports
        `id, report_id, status, assigned_vet_id, created_at, updated_at, reports ( id, animal_type, symptoms, photo_url, latitude, longitude, risk_level, notes, created_at, farmer_id, farmers ( name, phone, village, block ) )`,
        // Without farmers join (if FK not set)
        `id, report_id, status, assigned_vet_id, created_at, updated_at, reports ( id, animal_type, symptoms, photo_url, latitude, longitude, risk_level, notes, created_at )`,
        // Minimal
        `*, reports(*)`,
      ];

      let success = false;
      for (const sel of selects) {
        const res = await supabase.from("cases").select(sel).order("created_at", { ascending: false }).limit(200);
        if (!res.error) {
          data = res.data as unknown[];
          fetchError = null;
          success = true;
          break;
        }
        // If error is missing column/relation, try next select
        const msg = String((res.error as { message?: string })?.message || "");
        if (/column|relation|does not exist|not exist|schema|42501|42703/i.test(msg)) {
          fetchError = res.error;
          continue;
        }
        // For other errors (permissions, etc), break and fallback to mock
        fetchError = res.error;
        break;
      }

      if (!success || !data || data.length === 0) {
        if (data && data.length === 0) {
          // Empty but success -> show empty with mock hint? Use mock for demo still but mark
          // Prefer to show empty state, but for officer dashboard we show mock to demonstrate
          setCases(MOCK_CASES);
          setIsMock(true);
          setLoading(false);
          return;
        }
        throw fetchError || new Error("No data returned");
      }

      // Normalize to DashboardCase[]
      const normalized: DashboardCase[] = (data as unknown as Record<string, unknown>[]).map((row) => {
        const r = (row["reports"] as Record<string, unknown> | null) || {};
        // Handle case where reports is array (if select * returns array)
        const reportObj = Array.isArray(r) ? (r[0] as Record<string, unknown>) || {} : r;
        const farmerObj = (reportObj["farmers"] as Record<string, unknown> | null) || {};
        const farmerSingle = Array.isArray(farmerObj) ? (farmerObj[0] as Record<string, unknown>) || {} : farmerObj;

        // Resolve fields with multiple fallbacks
        const riskRaw = (row["risk_level"] as string) || (reportObj["risk_level"] as string) || "LOW";
        const statusRaw = (row["status"] as string) || "pending";
        const animalType = (reportObj["animal_type"] as string) || (row["animal_type"] as string) || "unknown";
        const farmerName =
          (reportObj["farmer_name"] as string) || (farmerSingle["name"] as string) || (reportObj["farmer_id"] as string)?.slice(0, 8) || null;
        const farmerPhone = (reportObj["farmer_phone"] as string) || (farmerSingle["phone"] as string) || null;
        const village = (reportObj["village"] as string) || (farmerSingle["village"] as string) || (reportObj["block"] as string) || null;
        const block = (reportObj["block"] as string) || (farmerSingle["block"] as string) || null;
        const latRaw = reportObj["latitude"] ?? row["latitude"];
        const lngRaw = reportObj["longitude"] ?? row["longitude"];
        const lat = latRaw != null ? Number(latRaw) : null;
        const lng = lngRaw != null ? Number(lngRaw) : null;
        const symptoms = reportObj["symptoms"] ?? row["symptoms"] ?? [];
        const photo = (reportObj["photo_url"] as string) || (row["photo_url"] as string) || null;
        const notes = (reportObj["notes"] as string) || (row["notes"] as string) || null;
        const created = (row["created_at"] as string) || (reportObj["created_at"] as string) || new Date().toISOString();
        const updated = (row["updated_at"] as string) || created;

        return {
          id: String(row["id"] || reportObj["id"] || Math.random().toString(36).slice(2)),
          report_id: (row["report_id"] as string) || (reportObj["id"] as string) || null,
          risk_level: normalizeRisk(riskRaw as string),
          status: String(statusRaw),
          animal_type: String(animalType),
          farmer_name: farmerName as string | null,
          farmer_phone: farmerPhone as string | null,
          village: village as string | null,
          block: block as string | null,
          latitude: Number.isFinite(lat as number) ? (lat as number) : null,
          longitude: Number.isFinite(lng as number) ? (lng as number) : null,
          created_at: created as string,
          updated_at: updated as string,
          symptoms,
          photo_url: photo as string | null,
          notes: notes as string | null,
        };
      });

      // If normalized still has no valid coords, keep anyway (list will show, map will warn)
      setCases(normalized.length > 0 ? normalized : MOCK_CASES);
      setIsMock(normalized.length === 0);
      if (normalized.length === 0) setIsMock(true);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[dashboard] fetch error:", msg, e);
      setError(msg);
      setCases(MOCK_CASES);
      setIsMock(true);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  // Initial fetch + coverage
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchCases();
  }, [fetchCases]);

  // Fetch avg vaccination coverage
  useEffect(() => {
    let mounted = true;
    (async () => {
      setCoverageLoading(true);
      try {
        const rows = await getAllVillageCoverageClient();
        if (!mounted) return;
        if (rows.length === 0) {
          setCoverageAvg(null);
        } else {
          const avg = Math.round((rows.reduce((s, r) => s + r.coverage_percentage, 0) / rows.length) * 10) / 10;
          setCoverageAvg(avg);
        }
      } catch (e) {
        console.warn("[dashboard] coverage fetch failed:", e);
        if (mounted) setCoverageAvg(null);
      } finally {
        if (mounted) setCoverageLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // Realtime: subscribe to cases and reports
  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key || url.includes("placeholder")) return;

    const channel = supabase
      .channel("dashboard-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "cases" }, () => {
        console.log("[dashboard] realtime cases change -> refetch");
        fetchCases();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "reports" }, () => {
        console.log("[dashboard] realtime reports change -> refetch");
        fetchCases();
      })
      .subscribe((status) => {
        console.log("[dashboard] realtime status:", status);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, fetchCases]);

  // Derived stats
  const stats = useMemo(() => {
    const total = cases.length;
    const high = cases.filter((c) => normalizeRisk(c.risk_level) === "HIGH").length;
    const medium = cases.filter((c) => normalizeRisk(c.risk_level) === "MEDIUM").length;
    const low = cases.filter((c) => normalizeRisk(c.risk_level) === "LOW").length;
    const pendingEscalations = cases.filter((c) => c.status === "assigned").length;
    return { total, high, medium, low, pendingEscalations };
  }, [cases]);

  // Filter + search + sort
  const filteredSorted = useMemo(() => {
    let out = [...cases];

    // Search by farmer or village
    if (search.trim()) {
      const q = search.toLowerCase();
      out = out.filter(
        (c) =>
          (c.farmer_name && c.farmer_name.toLowerCase().includes(q)) ||
          (c.village && c.village.toLowerCase().includes(q)) ||
          (c.block && c.block.toLowerCase().includes(q)) ||
          c.animal_type.toLowerCase().includes(q) ||
          c.id.toLowerCase().includes(q)
      );
    }

    if (riskFilter !== "ALL") {
      out = out.filter((c) => normalizeRisk(c.risk_level) === riskFilter);
    }
    if (animalFilter !== "ALL") {
      out = out.filter((c) => c.animal_type.toLowerCase() === animalFilter.toLowerCase());
    }
    if (statusFilter !== "ALL") {
      out = out.filter((c) => c.status.toLowerCase() === statusFilter.toLowerCase());
    }

    if (sortBy === "risk") {
      const rank = (r: string) => (normalizeRisk(r) === "HIGH" ? 0 : normalizeRisk(r) === "MEDIUM" ? 1 : 2);
      out.sort((a, b) => rank(a.risk_level) - rank(b.risk_level) || new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    } else if (sortBy === "date") {
      out.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    } else if (sortBy === "animal") {
      out.sort((a, b) => a.animal_type.localeCompare(b.animal_type));
    }

    return out;
  }, [cases, search, riskFilter, animalFilter, statusFilter, sortBy]);

  const uniqueAnimals = useMemo(() => {
    const s = new Set(cases.map((c) => c.animal_type));
    return Array.from(s);
  }, [cases]);

  const uniqueStatuses = useMemo(() => {
    const s = new Set(cases.map((c) => c.status));
    return Array.from(s);
  }, [cases]);

  const handleSelect = (id: string) => {
    setSelectedId(id);
    // On mobile, scroll list item into view? Map will fly to pin via DashboardMap
    // Also scroll list to show selected? optional
    const el = document.getElementById(`case-row-${id}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "nearest" });
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] dark:bg-black flex flex-col">
      {/* Official Government Header */}
      <div className="bg-white dark:bg-zinc-900 border-b border-slate-200 dark:border-zinc-800">
        <div className="max-w-[1600px] mx-auto px-4 py-3 sm:py-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-orange-500 via-white to-green-600 border border-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-700">
                GoI
              </div>
              <div>
                <h1 className="text-[13px] font-semibold tracking-widest text-slate-500 uppercase">Government of India • Ministry of Fisheries, Animal Husbandry & Dairying</h1>
                <p className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white leading-tight">
                  District / State Disease Surveillance Dashboard
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Ahmednagar District — Maharashtra • SIH 2026 • Livestock Surveillance System • Official Use
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 self-start sm:self-auto">
              <span className="hidden sm:inline text-xs text-slate-500 border rounded-full px-3 py-1.5 bg-slate-50">
                Last updated: {new Date().toLocaleTimeString()} • Auto-refresh via Realtime
              </span>
              <button
                onClick={() => fetchCases()}
                disabled={loading}
                className="px-4 py-2 text-sm font-semibold bg-slate-900 text-white rounded-full hover:bg-black disabled:opacity-50"
              >
                {loading ? "Refreshing…" : "Refresh"}
              </button>
            </div>
          </div>
          {isMock && (
            <div className="mt-3 bg-amber-50 border border-amber-200 text-amber-900 rounded-lg px-3 py-2 text-xs flex items-center justify-between">
              <span>⚠️ Showing demo data — connect Supabase (cases/reports) to see live district data</span>
              <span className="hidden sm:inline text-[11px] bg-amber-100 border border-amber-300 rounded-full px-2 py-0.5">MOCK</span>
            </div>
          )}
          {error && (
            <div className="mt-3 bg-red-50 border border-red-200 text-red-800 rounded-lg px-3 py-2 text-xs">Supabase error: {error} — falling back to demo</div>
          )}
        </div>
      </div>

      {/* Summary Stats Bar */}
      <div className="max-w-[1600px] w-full mx-auto px-4 py-4">
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl p-4 shadow-sm">
            <div className="text-[11px] font-semibold tracking-widest text-slate-500 uppercase">Total Cases</div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-slate-900 dark:text-white">{stats.total}</span>
              <span className="text-xs text-slate-500">COUNT(*)</span>
            </div>
            <div className="text-[11px] text-slate-500 mt-1">All reports in district</div>
          </div>

          <div className="bg-white dark:bg-zinc-900 border border-red-200 dark:border-red-900/50 rounded-xl p-4 shadow-sm relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-red-600" />
            <div className="text-[11px] font-semibold tracking-widest text-red-700 uppercase">High Risk</div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-red-700">{stats.high}</span>
              <span className="text-xs px-1.5 py-0.5 bg-red-100 text-red-700 rounded-full font-bold">● HIGH</span>
            </div>
            <div className="text-[11px] text-slate-500 mt-1">WHERE risk_level=HIGH</div>
          </div>

          <div className="bg-white dark:bg-zinc-900 border border-amber-200 dark:border-amber-900/50 rounded-xl p-4 shadow-sm relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-amber-400" />
            <div className="text-[11px] font-semibold tracking-widest text-amber-700 uppercase">Medium Risk</div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-amber-700">{stats.medium}</span>
              <span className="text-xs px-1.5 py-0.5 bg-amber-100 text-amber-800 rounded-full font-bold">● MEDIUM</span>
            </div>
            <div className="text-[11px] text-slate-500 mt-1">WHERE risk_level=MEDIUM</div>
          </div>

          <div className="bg-white dark:bg-zinc-900 border border-blue-200 dark:border-blue-900/50 rounded-xl p-4 shadow-sm relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-blue-600" />
            <div className="text-[11px] font-semibold tracking-widest text-blue-700 uppercase">Pending Escalations</div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-blue-700">{stats.pendingEscalations}</span>
              <span className="text-xs px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded-full font-bold">assigned</span>
            </div>
            <div className="text-[11px] text-slate-500 mt-1">WHERE status=assigned</div>
          </div>

          <div className="bg-white dark:bg-zinc-900 border border-emerald-200 dark:border-emerald-900/50 rounded-xl p-4 shadow-sm relative overflow-hidden col-span-2 lg:col-span-1">
            <div className="absolute top-0 left-0 w-full h-1 bg-emerald-600" />
            <div className="text-[11px] font-semibold tracking-widest text-emerald-700 uppercase">Avg Vaccination Coverage</div>
            <div className="mt-1 flex items-baseline gap-2">
              {coverageLoading ? (
                <span className="text-xl font-bold text-slate-400 animate-pulse">—</span>
              ) : coverageAvg == null ? (
                <span className="text-xl font-bold text-slate-400">—</span>
              ) : (
                <span className={`text-2xl font-bold ${coverageAvg > 70 ? "text-green-700" : coverageAvg >= 60 ? "text-amber-700" : "text-red-700"}`}>
                  {coverageAvg}%
                </span>
              )}
              <span className="text-xs text-slate-500">district avg</span>
            </div>
            <div className="text-[11px] text-slate-500 mt-1">from vaccination coverage</div>
          </div>
        </div>
      </div>

      {/* Main Content: Map + List */}
      <div className="flex-1 max-w-[1600px] w-full mx-auto px-4 pb-6 flex flex-col lg:flex-row gap-4 min-h-[600px]">
        {/* Map - 65% desktop, top on mobile */}
        <div className="w-full lg:w-[65%] xl:w-[68%] flex flex-col min-h-[420px] lg:min-h-[640px]">
          <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl shadow-sm overflow-hidden flex-1 flex flex-col">
            <div className="px-4 py-3 border-b border-slate-100 dark:border-zinc-800 flex items-center justify-between bg-slate-50/70 dark:bg-zinc-800/50">
              <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-red-600 animate-pulse" /> Disease Map — Interactive
              </h2>
              <span className="text-[11px] text-slate-500 hidden sm:inline">{filteredSorted.length} filtered • Pin colors = risk level • Click cluster to zoom</span>
            </div>
            <div className="flex-1 min-h-[400px] lg:min-h-0 relative">
              {loading ? (
                <div className="absolute inset-0 bg-gray-50 dark:bg-zinc-900 flex flex-col items-center justify-center gap-3">
                  <div className="w-8 h-8 border-3 border-slate-200 border-t-slate-900 rounded-full animate-spin" />
                  <span className="text-sm text-gray-500">Loading cases for map…</span>
                </div>
              ) : (
                <DashboardMap cases={filteredSorted} selectedCaseId={selectedId} onSelectCase={handleSelect} />
              )}
            </div>
          </div>
        </div>

        {/* Case List Panel - 35% desktop, bottom on mobile */}
        <div className="w-full lg:w-[35%] xl:w-[32%] flex flex-col min-h-[420px] lg:min-h-[640px]">
          <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl shadow-sm flex-1 flex flex-col overflow-hidden">
            {/* List Header */}
            <div className="px-4 py-3 border-b border-slate-100 dark:border-zinc-800 bg-slate-50/70 dark:bg-zinc-800/50">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-slate-900 dark:text-white">Case List</h2>
                <span className="text-xs px-2 py-1 bg-slate-900 text-white rounded-full font-bold">{filteredSorted.length} cases</span>
              </div>
              <p className="text-[11px] text-slate-500 mt-1">Click a case to highlight its pin on the map</p>
            </div>

            {/* Filters */}
            <div className="p-3 border-b border-slate-100 dark:border-zinc-800 space-y-3 bg-white dark:bg-zinc-900">
              <div className="relative">
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search farmer, village, animal, ID…"
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">⌕</span>
                {search && (
                  <button
                    onClick={() => setSearch("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 px-2 py-1 text-xs"
                  >
                    ✕
                  </button>
                )}
              </div>

              <div className="grid grid-cols-3 gap-2">
                <select
                  value={riskFilter}
                  onChange={(e) => setRiskFilter(e.target.value as typeof riskFilter)}
                  className="rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2 py-2 text-xs font-medium focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  <option value="ALL">All Risk</option>
                  <option value="HIGH">HIGH only</option>
                  <option value="MEDIUM">MEDIUM</option>
                  <option value="LOW">LOW</option>
                </select>
                <select
                  value={animalFilter}
                  onChange={(e) => setAnimalFilter(e.target.value)}
                  className="rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2 py-2 text-xs font-medium focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  <option value="ALL">All Animals</option>
                  {uniqueAnimals.map((a) => (
                    <option key={a} value={a} className="capitalize">
                      {a}
                    </option>
                  ))}
                </select>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2 py-2 text-xs font-medium focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  <option value="ALL">All Status</option>
                  {uniqueStatuses.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1 text-xs">
                  <span className="text-slate-500 font-medium">Sort:</span>
                  <button
                    onClick={() => setSortBy("risk")}
                    className={`px-2.5 py-1 rounded-full font-semibold border ${sortBy === "risk" ? "bg-slate-900 text-white border-slate-900" : "bg-white dark:bg-zinc-800 border-slate-200 dark:border-zinc-700"}`}
                  >
                    Risk (HIGH first)
                  </button>
                  <button
                    onClick={() => setSortBy("date")}
                    className={`px-2.5 py-1 rounded-full font-semibold border ${sortBy === "date" ? "bg-slate-900 text-white border-slate-900" : "bg-white dark:bg-zinc-800 border-slate-200 dark:border-zinc-700"}`}
                  >
                    Date
                  </button>
                  <button
                    onClick={() => setSortBy("animal")}
                    className={`px-2.5 py-1 rounded-full font-semibold border ${sortBy === "animal" ? "bg-slate-900 text-white border-slate-900" : "bg-white dark:bg-zinc-800 border-slate-200 dark:border-zinc-700"}`}
                  >
                    Animal
                  </button>
                </div>
                {(search || riskFilter !== "ALL" || animalFilter !== "ALL" || statusFilter !== "ALL") && (
                  <button
                    onClick={() => {
                      setSearch("");
                      setRiskFilter("ALL");
                      setAnimalFilter("ALL");
                      setStatusFilter("ALL");
                      setSortBy("risk");
                    }}
                    className="text-xs text-blue-600 hover:underline font-medium"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            {/* Scrollable List */}
            <div className="flex-1 overflow-auto divide-y divide-slate-100 dark:divide-zinc-800">
              {filteredSorted.length === 0 ? (
                <div className="p-8 text-center">
                  <div className="text-sm font-medium text-slate-700 dark:text-slate-300">No cases match filters</div>
                  <div className="text-xs text-slate-500 mt-1">Try clearing search / filters</div>
                </div>
              ) : (
                filteredSorted.map((c) => {
                  const isSelected = selectedId === c.id;
                  const risk = normalizeRisk(c.risk_level);
                  const riskStyles =
                    risk === "HIGH"
                      ? "bg-red-600 text-white border-red-700"
                      : risk === "MEDIUM"
                      ? "bg-amber-400 text-amber-950 border-amber-500"
                      : "bg-emerald-600 text-white border-emerald-700";
                  const statusStyles =
                    c.status === "assigned"
                      ? "bg-blue-100 text-blue-800 border-blue-200"
                      : c.status === "pending"
                      ? "bg-slate-100 text-slate-700 border-slate-200"
                      : c.status === "treated"
                      ? "bg-emerald-100 text-emerald-800 border-emerald-200"
                      : "bg-gray-100 text-gray-700 border-gray-200";

                  return (
                    <button
                      key={c.id}
                      id={`case-row-${c.id}`}
                      onClick={() => handleSelect(c.id)}
                      className={`w-full text-left p-3.5 flex flex-col gap-2 hover:bg-slate-50 dark:hover:bg-zinc-800/70 transition-colors ${
                        isSelected ? "bg-blue-50 dark:bg-blue-950/30 border-l-4 border-l-blue-600" : "border-l-4 border-l-transparent"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold border ${riskStyles}`}>{risk}</span>
                        <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border ${statusStyles}`}>{c.status}</span>
                      </div>

                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm font-bold text-slate-900 dark:text-white capitalize">{c.animal_type}</span>
                            <span className="text-xs text-slate-400">•</span>
                            <span className="text-xs font-mono text-slate-500">#{c.id.slice(0, 8)}</span>
                          </div>
                          <div className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">
                            {c.farmer_name || "Unknown farmer"}
                            {c.farmer_phone ? <span className="text-xs text-slate-500 font-normal ml-1.5">{c.farmer_phone}</span> : null}
                          </div>
                          <div className="text-xs text-slate-600 dark:text-slate-400 truncate">
                            {c.village || "Unknown village"}
                            {c.block ? `, ${c.block}` : ""} •{" "}
                            {c.latitude != null && c.longitude != null ? `${Number(c.latitude).toFixed(3)}, ${Number(c.longitude).toFixed(3)}` : "No GPS"}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-[11px] text-slate-500">{new Date(c.created_at).toLocaleDateString()}</div>
                          <div className="text-[10px] text-slate-400">{new Date(c.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
                          {isSelected && <div className="mt-1 text-[10px] font-bold text-blue-600">● ON MAP</div>}
                        </div>
                      </div>

                      {Array.isArray(c.symptoms) && (c.symptoms as string[]).length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {(c.symptoms as string[]).slice(0, 4).map((s, i) => (
                            <span key={i} className="px-1.5 py-0.5 bg-slate-100 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-full text-[11px]">
                              {s}
                            </span>
                          ))}
                          {(c.symptoms as string[]).length > 4 && (
                            <span className="text-[11px] text-slate-500">+{(c.symptoms as string[]).length - 4} more</span>
                          )}
                        </div>
                      )}
                    </button>
                  );
                })
              )}
            </div>

            <div className="border-t border-slate-100 dark:border-zinc-800 px-3 py-2.5 bg-slate-50 dark:bg-zinc-800/50 text-[11px] text-slate-500 flex items-center justify-between">
              <span>
                Showing {filteredSorted.length} of {cases.length}
              </span>
              <span className="hidden sm:inline">Realtime: updates instantly when vets change status</span>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-[1600px] mx-auto px-4 pb-4 text-center text-[11px] text-slate-400">
        Ahmednagar District Administration • Animal Husbandry Department • For official surveillance use only • Data updates via Supabase Realtime
      </div>
    </div>
  );
}
