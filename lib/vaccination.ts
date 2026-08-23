/**
 * Vaccination Coverage Calculation — SIH 2026
 * lib/vaccination.ts
 *
 * Spec:
 *  - Input: village name (or block)
 *  - Query: COUNT(DISTINCT farmer_id) where vaccinations.village = input_village
 *  - Also COUNT(DISTINCT farmer_id) from reports table (total animals reported) in that village
 *  - Output: { village, vaccinated_count, total_count, coverage_percentage }
 *  - Handle division by zero (if no reports yet, return 0%)
 *
 * Canonical schema compatibility:
 *  - Upstream supabase/schema.sql defines vaccinations without village/block
 *    and reports without village (village lives on farmers via farmer_id).
 *  - This module therefore implements DUAL MODE:
 *    1) Try direct `vaccinations.village = X` / `reports.village = X` (spec extended schema)
 *    2) On column-missing error, fallback to JOIN via farmers(id -> village/block)
 *  - Admin heatmap works in either mode. No migration required, but extended
 *    schema (adding village/block to vaccinations/reports) will be faster.
 */

import { createClient, createServerClient, createServiceClient } from "./supabase";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./supabase";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CoverageResult = {
  village: string;
  block?: string;
  district?: string;
  vaccinated_count: number;
  total_count: number;
  coverage_percentage: number; // 0-100, rounded to 1 decimal
};

export type BlockCoverageResult = {
  block: string;
  district?: string;
  vaccinated_count: number;
  total_count: number;
  coverage_percentage: number;
  villages: CoverageResult[];
};

// ---------------------------------------------------------------------------
// Internal helpers — COUNT DISTINCT via dedup
// ---------------------------------------------------------------------------

function isMissingColumnError(err: unknown): boolean {
  const msg = String((err as { message?: string })?.message || err || "").toLowerCase();
  return msg.includes("does not exist") || msg.includes("column") || msg.includes("42703") || msg.includes("could not find");
}

async function buildFarmerVillageMap(
  client: SupabaseClient<Database>
): Promise<Map<string, { village: string; block: string; district?: string }>> {
  const { data, error } = await client.from("farmers").select("id, village, block");
  if (error) throw new Error(`Failed to query farmers: ${error.message}`);
  const map = new Map<string, { village: string; block: string; district?: string }>();
  for (const r of (data as unknown as { id: string; village: string; block: string; district?: string }[]) || []) {
    map.set(r.id, { village: r.village, block: r.block, district: (r as unknown as { district?: string }).district });
  }
  return map;
}

async function distinctFarmerCountDirect(
  client: SupabaseClient<Database>,
  table: "vaccinations" | "reports",
  column: "village" | "block",
  value: string
): Promise<number | null> {
  // Returns null if column missing (signals fallback)
  const { data, error } = await client.from(table).select("farmer_id").eq(column, value);
  if (error) {
    if (isMissingColumnError(error)) return null;
    console.error(`[vaccination] distinctFarmerCount ${table}.${column}=${value} error:`, error.message);
    throw new Error(`Failed to query ${table}: ${error.message}`);
  }
  if (!data || data.length === 0) return 0;
  return new Set((data as { farmer_id: string }[]).map((r) => r.farmer_id)).size;
}

async function distinctFarmerCountViaFarmers(
  client: SupabaseClient<Database>,
  table: "vaccinations" | "reports",
  column: "village" | "block",
  value: string
): Promise<number> {
  // Fallback: resolve village via farmers table
  const [tableRows, farmerMap] = await Promise.all([
    client.from(table).select("farmer_id"),
    buildFarmerVillageMap(client),
  ]);
  if (tableRows.error) throw new Error(`Failed to query ${table}: ${tableRows.error.message}`);
  const ids = (tableRows.data as { farmer_id: string }[] | null) || [];
  const filtered = ids.filter((r) => {
    const f = farmerMap.get(r.farmer_id);
    if (!f) return false;
    return column === "village" ? f.village === value : f.block === value;
  });
  return new Set(filtered.map((r) => r.farmer_id)).size;
}

async function distinctFarmerCount(
  client: SupabaseClient<Database>,
  table: "vaccinations" | "reports",
  column: "village" | "block",
  value: string
): Promise<number> {
  const direct = await distinctFarmerCountDirect(client, table, column, value);
  if (direct !== null) return direct;
  return distinctFarmerCountViaFarmers(client, table, column, value);
}

// ---------------------------------------------------------------------------
// Helpers for bulk aggregation (all villages)
// ---------------------------------------------------------------------------

async function getAllViaDirect(
  client: SupabaseClient<Database>
): Promise<CoverageResult[] | null> {
  const [vaccRows, reportRows] = await Promise.all([
    client.from("vaccinations").select("farmer_id, village, block, district"),
    client.from("reports").select("farmer_id, village, block, district"),
  ]);

  // If either table lacks village column, fallback
  if (vaccRows.error && isMissingColumnError(vaccRows.error)) return null;
  if (reportRows.error && isMissingColumnError(reportRows.error)) return null;
  if (vaccRows.error) throw new Error(vaccRows.error.message);
  if (reportRows.error) throw new Error(reportRows.error.message);

  const vaccByVillage = new Map<string, { farmers: Set<string>; block?: string; district?: string }>();
  for (const r of (vaccRows.data as unknown as { farmer_id: string; village: string; block: string; district: string }[]) || []) {
    if (!vaccByVillage.has(r.village))
      vaccByVillage.set(r.village, { farmers: new Set(), block: r.block, district: r.district });
    vaccByVillage.get(r.village)!.farmers.add(r.farmer_id);
  }

  const reportByVillage = new Map<string, { farmers: Set<string>; block?: string; district?: string }>();
  for (const r of (reportRows.data as unknown as { farmer_id: string; village: string; block: string; district: string }[]) || []) {
    if (!reportByVillage.has(r.village))
      reportByVillage.set(r.village, { farmers: new Set(), block: r.block, district: r.district });
    reportByVillage.get(r.village)!.farmers.add(r.farmer_id);
  }

  const allVillages = new Set<string>([...vaccByVillage.keys(), ...reportByVillage.keys()]);
  const results: CoverageResult[] = [];
  for (const village of allVillages) {
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

async function getAllViaFarmers(client: SupabaseClient<Database>): Promise<CoverageResult[]> {
  // Fallback: derive village via farmers
  const [vaccRows, reportRows, farmerMap] = await Promise.all([
    client.from("vaccinations").select("farmer_id"),
    client.from("reports").select("farmer_id"),
    buildFarmerVillageMap(client),
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

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Calculate vaccination coverage for a single village.
 */
export async function getVaccinationCoverage(
  village: string,
  opts?: { client?: SupabaseClient<Database> }
): Promise<CoverageResult> {
  if (!village || !village.trim()) throw new Error("village is required");
  const client = opts?.client ?? createServerClient();

  const [vaccinated_count, total_count] = await Promise.all([
    distinctFarmerCount(client, "vaccinations", "village", village),
    distinctFarmerCount(client, "reports", "village", village),
  ]);

  const coverage_percentage = total_count === 0 ? 0 : Math.round((vaccinated_count / total_count) * 100 * 10) / 10;

  // Enrich block/district — try direct, then farmers map
  let block: string | undefined;
  let district: string | undefined;
  try {
    const { data, error } = await client.from("vaccinations").select("block, district").eq("village", village).limit(1).maybeSingle();
    if (!error && data) {
      block = (data as unknown as { block: string }).block;
      district = (data as unknown as { district: string }).district;
    } else if (error && isMissingColumnError(error)) {
      const map = await buildFarmerVillageMap(client);
      for (const v of map.values()) {
        if (v.village === village) {
          block = v.block;
          district = v.district;
          break;
        }
      }
    } else {
      // Try reports direct, then farmer fallback
      const { data: r, error: re } = await client.from("reports").select("block, district").eq("village", village).limit(1).maybeSingle();
      if (!re && r) {
        block = (r as unknown as { block: string }).block;
        district = (r as unknown as { district: string }).district;
      } else if (re && isMissingColumnError(re)) {
        const map = await buildFarmerVillageMap(client);
        for (const val of map.values()) if (val.village === village) { block = val.block; break; }
      }
    }
  } catch {}

  return { village, block, district, vaccinated_count, total_count, coverage_percentage };
}

/**
 * Coverage for a block — aggregates DISTINCT farmers across all villages in block.
 */
export async function getCoverageByBlock(
  block: string,
  opts?: { client?: SupabaseClient<Database> }
): Promise<BlockCoverageResult> {
  if (!block || !block.trim()) throw new Error("block is required");
  const client = opts?.client ?? createServerClient();

  const [vaccinated_count, total_count] = await Promise.all([
    distinctFarmerCount(client, "vaccinations", "block", block),
    distinctFarmerCount(client, "reports", "block", block),
  ]);

  const coverage_percentage = total_count === 0 ? 0 : Math.round((vaccinated_count / total_count) * 100 * 10) / 10;

  // Per-village breakdown — try direct, else fallback via farmers
  let villages: CoverageResult[] = [];
  try {
    const direct = await getAllViaDirect(client);
    if (direct) {
      villages = direct.filter((r) => r.block === block);
    } else {
      const all = await getAllViaFarmers(client);
      villages = all.filter((r) => r.block === block);
    }
  } catch {
    const all = await getAllViaFarmers(client);
    villages = all.filter((r) => r.block === block);
  }
  villages.sort((a, b) => a.coverage_percentage - b.coverage_percentage);

  // District enrichment
  let district: string | undefined;
  try {
    const { data, error } = await client.from("farmers").select("district").eq("block", block).limit(1).maybeSingle();
    if (!error && data) district = (data as unknown as { district: string }).district;
  } catch {}

  return { block, district, vaccinated_count, total_count, coverage_percentage, villages };
}

/**
 * Coverage for ALL villages — for admin heatmap.
 * Sorted by coverage ascending (lowest first) by default.
 */
export async function getAllVillageCoverage(opts?: {
  client?: SupabaseClient<Database>;
  sortBy?: "coverage" | "village" | "total";
  sortDir?: "asc" | "desc";
}): Promise<CoverageResult[]> {
  const client = opts?.client ?? createServerClient();

  let results: CoverageResult[] | null = null;
  try {
    results = await getAllViaDirect(client);
  } catch {}
  if (results === null) {
    results = await getAllViaFarmers(client);
  }

  const sortBy = opts?.sortBy || "coverage";
  const dir = opts?.sortDir || "asc";
  results.sort((a, b) => {
    let cmp = 0;
    if (sortBy === "coverage") cmp = a.coverage_percentage - b.coverage_percentage;
    else if (sortBy === "village") cmp = a.village.localeCompare(b.village);
    else if (sortBy === "total") cmp = a.total_count - b.total_count;
    return dir === "asc" ? cmp : -cmp;
  });

  return results;
}

/**
 * Browser-safe wrappers
 */
export async function getVaccinationCoverageClient(village: string): Promise<CoverageResult> {
  const client = createClient();
  return getVaccinationCoverage(village, { client });
}

export async function getAllVillageCoverageClient(): Promise<CoverageResult[]> {
  const client = createClient();
  return getAllVillageCoverage({ client });
}

// ---------------------------------------------------------------------------
// Utility — color coding for heatmap (matches spec)
// ---------------------------------------------------------------------------

export function getCoverageColor(coverage: number): "green" | "yellow" | "red" {
  if (coverage > 70) return "green";
  if (coverage >= 60) return "yellow";
  return "red";
}

export function getCoverageLabel(coverage: number): string {
  if (coverage > 70) return "Good";
  if (coverage >= 60) return "Moderate";
  return "Low — Intervention Needed";
}

// ---------------------------------------------------------------------------
// Service convenience
// ---------------------------------------------------------------------------

export async function getVaccinationCoverageService(village: string): Promise<CoverageResult> {
  const client = createServiceClient();
  return getVaccinationCoverage(village, { client });
}

export async function getCoverageByBlockService(block: string): Promise<BlockCoverageResult> {
  const client = createServiceClient();
  return getCoverageByBlock(block, { client });
}

export async function getAllVillageCoverageService(): Promise<CoverageResult[]> {
  const client = createServiceClient();
  return getAllVillageCoverage({ client });
}
