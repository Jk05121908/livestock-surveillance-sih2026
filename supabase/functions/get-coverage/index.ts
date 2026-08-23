// Supabase Edge Function: get-coverage
// Endpoint: /functions/v1/get-coverage?village=VillageName  or  ?block=BlockName
// Returns coverage data: { village, vaccinated_count, total_count, coverage_percentage }
// If no param provided, returns all villages sorted by coverage ascending.
//
// Canonical schema compat: vaccinations/reports may not have village column;
// fallback resolves village via farmers table (farmer_id -> farmers.village).
//
// Deploy: supabase functions deploy get-coverage
// Local:  supabase functions serve get-coverage --env-file .env

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

type CoverageResult = {
  village: string;
  block?: string;
  district?: string;
  vaccinated_count: number;
  total_count: number;
  coverage_percentage: number;
};

type BlockCoverageResult = {
  block: string;
  district?: string;
  vaccinated_count: number;
  total_count: number;
  coverage_percentage: number;
  villages: CoverageResult[];
};

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isMissingColumnError(err: unknown): boolean {
  const msg = String((err as { message?: string })?.message || err || "").toLowerCase();
  return msg.includes("does not exist") || msg.includes("column") || msg.includes("42703") || msg.includes("could not find");
}

async function buildFarmerMap(supabase: ReturnType<typeof createClient>): Promise<Map<string, { village: string; block: string }>> {
  const { data, error } = await supabase.from("farmers").select("id, village, block");
  if (error) throw new Error(`farmers query failed: ${error.message}`);
  const m = new Map<string, { village: string; block: string }>();
  for (const r of (data as { id: string; village: string; block: string }[] | null) || []) m.set(r.id, { village: r.village, block: r.block });
  return m;
}

async function distinctCountDirect(
  supabase: ReturnType<typeof createClient>,
  table: string,
  column: string,
  value: string
): Promise<number | null> {
  const { data, error } = await supabase.from(table).select("farmer_id").eq(column, value);
  if (error) {
    if (isMissingColumnError(error)) return null;
    throw new Error(`${table} query failed: ${error.message}`);
  }
  if (!data || data.length === 0) return 0;
  return new Set((data as { farmer_id: string }[]).map((r) => r.farmer_id)).size;
}

async function distinctCountViaFarmers(
  supabase: ReturnType<typeof createClient>,
  table: string,
  column: "village" | "block",
  value: string
): Promise<number> {
  const [rows, farmerMap] = await Promise.all([
    supabase.from(table).select("farmer_id"),
    buildFarmerMap(supabase),
  ]);
  if (rows.error) throw new Error(`${table} query failed: ${rows.error.message}`);
  const filtered = ((rows.data as { farmer_id: string }[] | null) || []).filter((r) => {
    const fm = farmerMap.get(r.farmer_id);
    if (!fm) return false;
    return column === "village" ? fm.village === value : fm.block === value;
  });
  return new Set(filtered.map((r) => r.farmer_id)).size;
}

async function distinctCount(
  supabase: ReturnType<typeof createClient>,
  table: string,
  column: string,
  value: string
): Promise<number> {
  const direct = await distinctCountDirect(supabase, table, column as "village" | "block", value);
  if (direct !== null) return direct;
  return distinctCountViaFarmers(supabase, table, column as "village" | "block", value);
}

async function getVaccinationCoverage(
  supabase: ReturnType<typeof createClient>,
  village: string
): Promise<CoverageResult> {
  const [vaccinated_count, total_count] = await Promise.all([
    distinctCount(supabase, "vaccinations", "village", village),
    distinctCount(supabase, "reports", "village", village),
  ]);
  const coverage_percentage = total_count === 0 ? 0 : Math.round((vaccinated_count / total_count) * 100 * 10) / 10;

  // Enrich block/district
  let block: string | undefined;
  let district: string | undefined;
  // Try vaccinations direct; fallback via farmers
  const { data: vMeta, error: vErr } = await supabase.from("vaccinations").select("block, district").eq("village", village).limit(1).maybeSingle();
  if (!vErr && vMeta) {
    block = (vMeta as { block: string }).block;
    district = (vMeta as { district: string }).district;
  } else if (vErr && isMissingColumnError(vErr)) {
    const map = await buildFarmerMap(supabase);
    for (const val of map.values()) if (val.village === village) { block = val.block; break; }
  } else {
    const { data: fMeta } = await supabase.from("farmers").select("block").eq("village", village).limit(1).maybeSingle();
    if (fMeta) block = (fMeta as { block: string }).block;
  }

  return { village, block, district, vaccinated_count, total_count, coverage_percentage };
}

async function getAllViaDirect(
  supabase: ReturnType<typeof createClient>
): Promise<CoverageResult[] | null> {
  const [vaccRows, reportRows] = await Promise.all([
    supabase.from("vaccinations").select("farmer_id, village, block, district"),
    supabase.from("reports").select("farmer_id, village, block, district"),
  ]);
  if (vaccRows.error && isMissingColumnError(vaccRows.error)) return null;
  if (reportRows.error && isMissingColumnError(reportRows.error)) return null;
  if (vaccRows.error) throw new Error(vaccRows.error.message);
  if (reportRows.error) throw new Error(reportRows.error.message);

  const vaccByVillage = new Map<string, { farmers: Set<string>; block?: string; district?: string }>();
  for (const r of (vaccRows.data as { farmer_id: string; village: string; block: string; district: string }[] | null) || []) {
    if (!vaccByVillage.has(r.village)) vaccByVillage.set(r.village, { farmers: new Set(), block: r.block, district: r.district });
    vaccByVillage.get(r.village)!.farmers.add(r.farmer_id);
  }
  const reportByVillage = new Map<string, { farmers: Set<string>; block?: string; district?: string }>();
  for (const r of (reportRows.data as { farmer_id: string; village: string; block: string; district: string }[] | null) || []) {
    if (!reportByVillage.has(r.village)) reportByVillage.set(r.village, { farmers: new Set(), block: r.block, district: r.district });
    reportByVillage.get(r.village)!.farmers.add(r.farmer_id);
  }
  const all = new Set<string>([...vaccByVillage.keys(), ...reportByVillage.keys()]);
  const results: CoverageResult[] = [];
  for (const village of all) {
    const v = vaccByVillage.get(village);
    const r = reportByVillage.get(village);
    const vaccinated_count = v ? v.farmers.size : 0;
    const total_count = r ? r.farmers.size : 0;
    results.push({
      village,
      block: v?.block || r?.block,
      district: v?.district || r?.district,
      vaccinated_count,
      total_count,
      coverage_percentage: total_count === 0 ? 0 : Math.round((vaccinated_count / total_count) * 100 * 10) / 10,
    });
  }
  return results;
}

async function getAllViaFarmers(supabase: ReturnType<typeof createClient>): Promise<CoverageResult[]> {
  const [vaccRows, reportRows, farmerMap] = await Promise.all([
    supabase.from("vaccinations").select("farmer_id"),
    supabase.from("reports").select("farmer_id"),
    buildFarmerMap(supabase),
  ]);
  if (vaccRows.error) throw new Error(vaccRows.error.message);
  if (reportRows.error) throw new Error(reportRows.error.message);

  const vaccByVillage = new Map<string, { farmers: Set<string>; block?: string }>();
  for (const r of (vaccRows.data as { farmer_id: string }[] | null) || []) {
    const fm = farmerMap.get(r.farmer_id);
    if (!fm) continue;
    const key = fm.village;
    if (!vaccByVillage.has(key)) vaccByVillage.set(key, { farmers: new Set(), block: fm.block });
    vaccByVillage.get(key)!.farmers.add(r.farmer_id);
  }
  const reportByVillage = new Map<string, { farmers: Set<string>; block?: string }>();
  for (const r of (reportRows.data as { farmer_id: string }[] | null) || []) {
    const fm = farmerMap.get(r.farmer_id);
    if (!fm) continue;
    const key = fm.village;
    if (!reportByVillage.has(key)) reportByVillage.set(key, { farmers: new Set(), block: fm.block });
    reportByVillage.get(key)!.farmers.add(r.farmer_id);
  }
  const all = new Set<string>([...vaccByVillage.keys(), ...reportByVillage.keys()]);
  const results: CoverageResult[] = [];
  for (const village of all) {
    const v = vaccByVillage.get(village);
    const r = reportByVillage.get(village);
    const vaccinated_count = v ? v.farmers.size : 0;
    const total_count = r ? r.farmers.size : 0;
    results.push({
      village,
      block: v?.block || r?.block,
      vaccinated_count,
      total_count,
      coverage_percentage: total_count === 0 ? 0 : Math.round((vaccinated_count / total_count) * 100 * 10) / 10,
    });
  }
  return results;
}

async function getAllVillageCoverage(supabase: ReturnType<typeof createClient>): Promise<CoverageResult[]> {
  let results: CoverageResult[] | null = null;
  try {
    results = await getAllViaDirect(supabase);
  } catch {}
  if (results === null) results = await getAllViaFarmers(supabase);
  results.sort((a, b) => a.coverage_percentage - b.coverage_percentage);
  return results;
}

async function getCoverageByBlock(
  supabase: ReturnType<typeof createClient>,
  block: string
): Promise<BlockCoverageResult> {
  const [vaccinated_count, total_count] = await Promise.all([
    distinctCount(supabase, "vaccinations", "block", block),
    distinctCount(supabase, "reports", "block", block),
  ]);
  const coverage_percentage = total_count === 0 ? 0 : Math.round((vaccinated_count / total_count) * 100 * 10) / 10;

  let villages: CoverageResult[] = [];
  try {
    const direct = await getAllViaDirect(supabase);
    if (direct) villages = direct.filter((r) => r.block === block);
    else villages = (await getAllViaFarmers(supabase)).filter((r) => r.block === block);
  } catch {
    villages = (await getAllViaFarmers(supabase)).filter((r) => r.block === block);
  }
  villages.sort((a, b) => a.coverage_percentage - b.coverage_percentage);

  return { block, vaccinated_count, total_count, coverage_percentage, villages };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const village = url.searchParams.get("village");
    const block = url.searchParams.get("block");

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? Deno.env.get("NEXT_PUBLIC_SUPABASE_URL");
    const supabaseKey =
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
      Deno.env.get("SUPABASE_ANON_KEY") ??
      Deno.env.get("NEXT_PUBLIC_SUPABASE_ANON_KEY");

    if (!supabaseUrl || !supabaseKey) {
      return jsonResponse({ error: "Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY env" }, 500);
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    if (village) {
      const result = await getVaccinationCoverage(supabase, village);
      return jsonResponse({ data: result });
    }

    if (block) {
      const result = await getCoverageByBlock(supabase, block);
      return jsonResponse({ data: result });
    }

    const all = await getAllVillageCoverage(supabase);
    return jsonResponse({ data: all, count: all.length });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[get-coverage] error:", message);
    return jsonResponse({ error: message }, 500);
  }
});
