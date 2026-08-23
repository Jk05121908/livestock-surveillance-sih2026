/**
 * Triage Engine - Rule-based livestock disease risk assessment
 * Merged: original Member 3 triage + vaccination coverage integration
 * Location: /lib/triage.ts:1
 *
 * Original risk engine (low/medium/high) + coverage-aware bump:
 *  - If coverage <60% AND risk_level == 'low' => bump to 'medium'
 *  - Adds reasoning: "Low vaccination coverage in this area elevates risk"
 */

import { getVaccinationCoverage, getCoverageByBlock } from "./vaccination";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./supabase";

// ---------------------------------------------------------------------------
// Original types (canonical)
// ---------------------------------------------------------------------------

export type RiskLevel = 'low' | 'medium' | 'high';

export interface TriageResult {
  risk_level: RiskLevel;
  confidence: number;
  reasoning: string;
}

// For coverage-aware triage we need a wrapper that preserves coverage info
export type CoverageAwareTriageResult = TriageResult & {
  coverage?: {
    vaccinated_count: number;
    total_count: number;
    coverage_percentage: number;
  };
  bumped_due_to_coverage?: boolean;
  village?: string;
  block?: string;
};

// Keep uppercase alias for spec compatibility (Member 2 spec used LOW/MEDIUM)
export type RiskLevelUpper = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export function toUpper(r: RiskLevel): RiskLevelUpper {
  return r.toUpperCase() as RiskLevelUpper;
}
export function toLower(r: string): RiskLevel {
  return r.toLowerCase() as RiskLevel;
}

// ---------------------------------------------------------------------------
// Original helpers — preserve Member 3's logic
// ---------------------------------------------------------------------------

function normalizeSymptoms(symptoms: string[]): string[] {
  if (!Array.isArray(symptoms)) return [];
  return symptoms
    .map((s) => String(s).toLowerCase().trim())
    .map((s) => s.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function hasSymptom(normalized: string[], target: string): boolean {
  const t = target.toLowerCase().trim();
  return normalized.some((s) => s === t || s.includes(t));
}

function hasNotEating(normalized: string[]): boolean {
  const synonyms = [
    'not eating',
    'loss of appetite',
    'anorexia',
    'off feed',
    'inappetence',
    'refusal to eat',
  ];
  return synonyms.some((syn) => hasSymptom(normalized, syn));
}

function hasFever(normalized: string[]): boolean {
  return hasSymptom(normalized, 'fever') || hasSymptom(normalized, 'high temperature') || hasSymptom(normalized, 'pyrexia');
}

function hasSwelling(normalized: string[]): boolean {
  return hasSymptom(normalized, 'swelling') || hasSymptom(normalized, 'edema') || hasSymptom(normalized, 'swollen');
}

function hasCough(normalized: string[]): boolean {
  return hasSymptom(normalized, 'cough') || hasSymptom(normalized, 'coughing');
}

function hasDischarge(normalized: string[]): boolean {
  return hasSymptom(normalized, 'discharge') || hasSymptom(normalized, 'nasal discharge') || hasSymptom(normalized, 'ocular discharge');
}

function hasBleeding(normalized: string[]): boolean {
  return hasSymptom(normalized, 'bleeding') || hasSymptom(normalized, 'blood') || hasSymptom(normalized, 'hemorrhage');
}

function hasLethargy(normalized: string[]): boolean {
  return hasSymptom(normalized, 'lethargy') || hasSymptom(normalized, 'lethargic') || hasSymptom(normalized, 'weakness') || hasSymptom(normalized, 'dullness');
}

/**
 * Original rule-based triage function (Member 3).
 * DO NOT MODIFY BEHAVIOR — kept for backward compatibility.
 */
export function triage(symptoms: string[], animal_type: string): TriageResult {
  const normalized = normalizeSymptoms(symptoms);
  const count = normalized.length;
  const animal = (animal_type || 'animal').toLowerCase().trim() || 'animal';

  const fever = hasFever(normalized);
  const swelling = hasSwelling(normalized);
  const notEating = hasNotEating(normalized);
  const cough = hasCough(normalized);
  const discharge = hasDischarge(normalized);
  const bleeding = hasBleeding(normalized);
  const lethargy = hasLethargy(normalized);

  if (fever && (swelling || notEating)) {
    const trigger = swelling && notEating ? 'fever with swelling and loss of appetite' : swelling ? 'fever with swelling' : 'fever with loss of appetite/not eating';
    return {
      risk_level: 'high',
      confidence: 0.92,
      reasoning: `HIGH RISK: ${trigger} in ${animal} indicates potential systemic infection or inflammatory disease requiring urgent veterinary attention. Fever combined with ${swelling ? 'swelling' : 'anorexia'} is a red-flag combination. Symptoms: [${normalized.join(', ')}].`,
    };
  }

  if (count >= 3) {
    const confidence = count >= 4 ? 0.90 : 0.85;
    return {
      risk_level: 'high',
      confidence,
      reasoning: `HIGH RISK: Multiple symptoms (${count}) observed in ${animal} — [${normalized.join(', ')}]. Three or more concurrent clinical signs suggest high probability of infectious disease outbreak; immediate isolation and vet examination recommended.`,
    };
  }

  if (fever && cough) {
    return {
      risk_level: 'medium',
      confidence: 0.65,
      reasoning: `MEDIUM RISK: Fever with cough in ${animal} suggests respiratory infection (e.g., viral/bacterial). Monitor closely for progression to high risk. Symptoms: [${normalized.join(', ')}].`,
    };
  }

  if (swelling && discharge) {
    return {
      risk_level: 'medium',
      confidence: 0.68,
      reasoning: `MEDIUM RISK: Swelling combined with discharge in ${animal} indicates localized infection or early systemic involvement. Requires veterinary follow-up within 24 hours. Symptoms: [${normalized.join(', ')}].`,
    };
  }

  if (bleeding && count === 1) {
    return {
      risk_level: 'low',
      confidence: 0.45,
      reasoning: `LOW RISK: Isolated bleeding in ${animal} is more consistent with mechanical injury/wound than infectious disease. Clean, observe, and provide first-aid; escalate if additional symptoms appear. Symptoms: [${normalized.join(', ')}].`,
    };
  }

  if (bleeding && count <= 2) {
    return {
      risk_level: 'low',
      confidence: 0.50,
      reasoning: `LOW RISK: Bleeding observed in ${animal} with ${count - 1} additional symptom(s) — likely traumatic origin. Monitor for fever or systemic signs. Symptoms: [${normalized.join(', ')}].`,
    };
  }

  if (count === 1 && (cough || lethargy)) {
    const symptom = cough ? 'cough' : 'lethargy';
    return {
      risk_level: 'low',
      confidence: 0.55,
      reasoning: `LOW RISK: Single mild symptom (${symptom}) in ${animal}. May be environmental stress or early mild illness; observe for 24-48 hours. Symptoms: [${normalized.join(', ')}].`,
    };
  }

  if (count === 0) {
    return {
      risk_level: 'low',
      confidence: 0.30,
      reasoning: `LOW RISK: No symptoms reported for ${animal}. No immediate concern; continue routine surveillance.`,
    };
  }

  if (count === 1) {
    return {
      risk_level: 'low',
      confidence: 0.50,
      reasoning: `LOW RISK: Single symptom (${normalized[0]}) in ${animal} without red-flag combinations. Likely mild/self-limiting; monitor for additional signs. Symptoms: [${normalized.join(', ')}].`,
    };
  }

  return {
    risk_level: 'low',
    confidence: 0.52,
    reasoning: `LOW RISK: ${count} mild/non-specific symptom(s) in ${animal} without high/medium-risk combinations. Keep under observation and re-triage if condition worsens. Symptoms: [${normalized.join(', ')}].`,
  };
}

export default triage;

// ---------------------------------------------------------------------------
// Coverage-aware integration (SPEC: bump LOW->MEDIUM when coverage <60%)
// ---------------------------------------------------------------------------

/**
 * Adjust a pre-computed triage result based on vaccination coverage.
 * Designed to be dropped into Member 3's pipeline:
 *
 *   let result = triage(symptoms, animalType);
 *   result = await adjustRiskForVaccinationCoverage(result, village, { client });
 *
 * Spec: If coverage <60% AND risk_level == 'low' => bump to 'medium'
 *       Add reasoning: "Low vaccination coverage in this area elevates risk"
 * Handles division-by-zero: total==0 => coverage 0% => bumps 'low'
 * Fail-open: if coverage query fails, returns original result with warning appended.
 */
export async function adjustRiskForVaccinationCoverage(
  base: TriageResult,
  village: string,
  opts?: { client?: SupabaseClient<Database> }
): Promise<CoverageAwareTriageResult> {
  if (!village) return base as CoverageAwareTriageResult;

  try {
    const coverage = await getVaccinationCoverage(village, { client: opts?.client });

    const updated: CoverageAwareTriageResult = {
      ...base,
      village,
      coverage: {
        vaccinated_count: coverage.vaccinated_count,
        total_count: coverage.total_count,
        coverage_percentage: coverage.coverage_percentage,
      },
    };

    if (coverage.coverage_percentage < 60 && base.risk_level === 'low') {
      updated.risk_level = 'medium';
      updated.bumped_due_to_coverage = true;
      updated.reasoning = `${base.reasoning} Low vaccination coverage in ${village} (${coverage.coverage_percentage}% — ${coverage.vaccinated_count}/${coverage.total_count} farmers) elevates risk.`;
    } else if (coverage.coverage_percentage < 60 && base.risk_level !== 'low') {
      updated.reasoning = `${base.reasoning} Note: low vaccination coverage in ${village} (${coverage.coverage_percentage}%) — area is under-vaccinated.`;
    }

    return updated;
  } catch (err) {
    console.warn("[triage] coverage check failed, returning original risk:", err);
    return {
      ...base,
      reasoning: `${base.reasoning} Vaccination coverage check unavailable — risk not adjusted for coverage.`,
    };
  }
}

/**
 * Uppercase wrapper for spec that used LOW/MEDIUM (Member 2).
 * Compatible with lib/vaccination.ts expectations.
 */
export async function adjustRiskForVaccinationCoverageUpper(
  triageUpper: { risk_level: RiskLevelUpper; reasoning: string[]; report_id: string; village: string; block?: string },
  village: string,
  opts?: { client?: SupabaseClient<Database> }
): Promise<{ risk_level: RiskLevelUpper; reasoning: string[]; coverage?: CoverageAwareTriageResult["coverage"]; bumped_due_to_coverage?: boolean }> {
  // Map to lower, run, map back
  const base: TriageResult = {
    risk_level: toLower(triageUpper.risk_level),
    confidence: 0.5,
    reasoning: triageUpper.reasoning.join(" "),
  };
  const adjusted = await adjustRiskForVaccinationCoverage(base, village, opts);
  const riskUpper: RiskLevelUpper = toUpper(adjusted.risk_level) as RiskLevelUpper;
  const reasoningArr = [adjusted.reasoning];
  return {
    risk_level: riskUpper,
    reasoning: reasoningArr,
    coverage: adjusted.coverage,
    bumped_due_to_coverage: adjusted.bumped_due_to_coverage,
  };
}

/**
 * Variant that also checks block coverage when village sample is small.
 */
export async function adjustRiskForVaccinationCoverageWithBlock(
  base: TriageResult,
  village: string,
  block?: string,
  opts?: { client?: SupabaseClient<Database> }
): Promise<CoverageAwareTriageResult> {
  const villageResult = await adjustRiskForVaccinationCoverage(base, village, opts);
  if (villageResult.bumped_due_to_coverage || !block) return villageResult;

  try {
    const blockCoverage = await getCoverageByBlock(block, { client: opts?.client });
    if (blockCoverage.coverage_percentage < 60 && base.risk_level === 'low' && (villageResult.coverage?.total_count ?? 0) < 5) {
      return {
        ...villageResult,
        reasoning: `${villageResult.reasoning} Block ${block} coverage is low (${blockCoverage.coverage_percentage}%) — monitor area risk.`,
      };
    }
  } catch {}
  return villageResult;
}

/**
 * Full coverage-aware triage: runs original triage then applies coverage bump.
 * Convenience for new callers.
 */
export async function triageWithCoverage(
  symptoms: string[],
  animal_type: string,
  village: string,
  opts?: { client?: SupabaseClient<Database>; block?: string }
): Promise<CoverageAwareTriageResult> {
  const base = triage(symptoms, animal_type);
  return adjustRiskForVaccinationCoverage(base, village, { client: opts?.client });
}

/**
 * Example report-level wrapper (for supabase edge triage-report):
 *
 *   const base = triage(symptoms, animal_type);
 *   const withCoverage = await adjustRiskForVaccinationCoverage(base, reportVillage, { client: supabase });
 *   // then update reports.risk_level = withCoverage.risk_level
 */

// ---------------------------------------------------------------------------
// Backward compatibility for spec's uppercase ReportInput/TriageReport types
// ---------------------------------------------------------------------------

export type ReportInput = {
  id: string;
  village: string;
  block?: string;
  symptoms?: string[];
  species?: string;
};

export type TriageReportResult = {
  report_id: string;
  village: string;
  block?: string;
  risk_level: RiskLevelUpper;
  reasoning: string[];
  coverage?: { vaccinated_count: number; total_count: number; coverage_percentage: number };
  bumped_due_to_coverage?: boolean;
};

export async function triageReport(
  report: ReportInput,
  opts?: { client?: SupabaseClient<Database>; precomputedRisk?: RiskLevel }
): Promise<TriageReportResult> {
  const symptoms = report.symptoms || [];
  const animal = report.species || "animal";
  const base: TriageResult = opts?.precomputedRisk ? { risk_level: opts.precomputedRisk, confidence: 0.5, reasoning: "Precomputed risk" } : triage(symptoms, animal);
  const adjusted = await adjustRiskForVaccinationCoverage(base, report.village, { client: opts?.client });
  return {
    report_id: report.id,
    village: report.village,
    block: report.block,
    risk_level: toUpper(adjusted.risk_level) as RiskLevelUpper,
    reasoning: [adjusted.reasoning],
    coverage: adjusted.coverage,
    bumped_due_to_coverage: adjusted.bumped_due_to_coverage,
  };
}
