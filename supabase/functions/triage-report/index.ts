// Supabase Edge Function: triage-report
// Triggered when new report is inserted into `reports` table
// Location: /supabase/functions/triage-report/index.ts:1
// Deno runtime

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ---- Inline triage logic (self-contained for edge runtime) ----
type RiskLevel = 'low' | 'medium' | 'high';
interface TriageResult { risk_level: RiskLevel; confidence: number; reasoning: string; }

function normalizeSymptoms(symptoms: string[]): string[] {
  if (!Array.isArray(symptoms)) return [];
  return symptoms.map(s => String(s).toLowerCase().trim()).map(s => s.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim()).filter(Boolean);
}
function hasSymptom(n: string[], t: string) { return n.some(s => s === t || s.includes(t)); }
function hasNotEating(n: string[]) { return ['not eating','loss of appetite','anorexia','off feed','inappetence'].some(syn => hasSymptom(n, syn)); }

function triage(symptoms: string[], animal_type: string): TriageResult {
  const normalized = normalizeSymptoms(symptoms);
  const count = normalized.length;
  const animal = (animal_type || 'animal').toLowerCase().trim() || 'animal';
  const fever = hasSymptom(normalized,'fever') || hasSymptom(normalized,'high temperature');
  const swelling = hasSymptom(normalized,'swelling') || hasSymptom(normalized,'swollen');
  const notEating = hasNotEating(normalized);
  const cough = hasSymptom(normalized,'cough');
  const discharge = hasSymptom(normalized,'discharge');
  const bleeding = hasSymptom(normalized,'bleeding');
  const lethargy = hasSymptom(normalized,'lethargy') || hasSymptom(normalized,'weakness');

  if (fever && (swelling || notEating)) {
    const trigger = swelling && notEating ? 'fever with swelling and loss of appetite' : swelling ? 'fever with swelling' : 'fever with loss of appetite/not eating';
    return { risk_level: 'high', confidence: 0.92, reasoning: `HIGH RISK: ${trigger} in ${animal} indicates potential systemic infection requiring urgent attention. Fever combined with ${swelling ? 'swelling' : 'anorexia'} is a red-flag. Symptoms: [${normalized.join(', ')}].` };
  }
  if (count >= 3) {
    return { risk_level: 'high', confidence: count >=4 ? 0.90 : 0.85, reasoning: `HIGH RISK: Multiple symptoms (${count}) in ${animal} — [${normalized.join(', ')}]. Three+ concurrent signs suggest high probability of infectious disease; immediate isolation and vet examination recommended.` };
  }
  if (fever && cough) {
    return { risk_level: 'medium', confidence: 0.65, reasoning: `MEDIUM RISK: Fever with cough in ${animal} suggests respiratory infection. Monitor closely. Symptoms: [${normalized.join(', ')}].` };
  }
  if (swelling && discharge) {
    return { risk_level: 'medium', confidence: 0.68, reasoning: `MEDIUM RISK: Swelling combined with discharge in ${animal} indicates localized infection or early systemic involvement. Requires follow-up within 24h. Symptoms: [${normalized.join(', ')}].` };
  }
  if (bleeding && count === 1) {
    return { risk_level: 'low', confidence: 0.45, reasoning: `LOW RISK: Isolated bleeding in ${animal} is more consistent with mechanical injury/wound than infectious disease. Symptoms: [${normalized.join(', ')}].` };
  }
  if (bleeding && count <=2) {
    return { risk_level: 'low', confidence: 0.50, reasoning: `LOW RISK: Bleeding with ${count-1} additional symptom(s) in ${animal} — likely traumatic origin. Symptoms: [${normalized.join(', ')}].` };
  }
  if (count ===1 && (cough || lethargy)) {
    return { risk_level: 'low', confidence: 0.55, reasoning: `LOW RISK: Single mild symptom (${cough?'cough':'lethargy'}) in ${animal}. Observe 24-48h. Symptoms: [${normalized.join(', ')}].` };
  }
  if (count===0) return { risk_level: 'low', confidence: 0.30, reasoning: `LOW RISK: No symptoms reported for ${animal}.` };
  if (count===1) return { risk_level: 'low', confidence: 0.50, reasoning: `LOW RISK: Single symptom (${normalized[0]}) in ${animal} without red-flag combos. Symptoms: [${normalized.join(', ')}].` };
  return { risk_level: 'low', confidence: 0.52, reasoning: `LOW RISK: ${count} mild/non-specific symptom(s) in ${animal}. Keep under observation. Symptoms: [${normalized.join(', ')}].` };
}
// ---- End triage ----

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    }
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json().catch(() => ({}));
    // Supabase webhook payload: { type, table, record, old_record } or direct { record } or direct report object
    const record = body.record ?? body ?? {};
    // Support both webhook and manual POST { symptoms, animal_type, id }
    const reportId = record.id ?? body.id;
    const symptoms: string[] = record.symptoms ?? body.symptoms ?? [];
    const animal_type: string = record.animal_type ?? body.animal_type ?? record.animalType ?? 'unknown';

    if (!reportId) {
      return new Response(JSON.stringify({ error: 'Missing report id (record.id)' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    console.log(`[triage-report] Triaging report ${reportId} | animal: ${animal_type} | symptoms:`, symptoms);

    let result = triage(symptoms, animal_type);
    console.log(`[triage-report] Initial triage for ${reportId}:`, result);

    // -----------------------------------------------------------------------
    // Vaccination coverage integration (SPEC: Member 2 <-> Member 3)
    // If coverage <60% AND risk_level == 'low' => bump to 'medium' and append reasoning
    // Village is resolved via reports.farmer_id -> farmers.village (canonical schema)
    //   or directly via reports.village if extended schema has it
    // -----------------------------------------------------------------------
    try {
      // Resolve village for this report
      let village: string | null = (record as { village?: string }).village ?? (record as { block?: string }).village ?? null;
      let farmerId: string | null = (record as { farmer_id?: string }).farmer_id ?? null;

      // If village not on report, look up via farmers table
      if (!village && farmerId) {
        const { data: farmer, error: farmerErr } = await supabase.from('farmers').select('village, block').eq('id', farmerId).maybeSingle();
        if (!farmerErr && farmer) {
          village = (farmer as { village: string }).village;
        }
      } else if (!village && !farmerId) {
        // Fallback: fetch report row to get farmer_id, then lookup village
        const { data: reportRow } = await supabase.from('reports').select('farmer_id').eq('id', reportId).maybeSingle();
        const fid = (reportRow as { farmer_id?: string } | null)?.farmer_id;
        if (fid) {
          const { data: farmer } = await supabase.from('farmers').select('village, block').eq('id', fid).maybeSingle();
          if (farmer) village = (farmer as { village: string }).village;
          farmerId = fid;
        }
      }

      if (village) {
        console.log(`[triage-report] Checking vaccination coverage for village: ${village}`);

        // Helper: detect missing column error to choose join strategy
        const isMissingCol = (e: unknown) => {
          const m = String((e as { message?: string })?.message || e || "").toLowerCase();
          return m.includes("does not exist") || m.includes("column") || m.includes("42703") || m.includes("could not find");
        };

        // Build farmer->village map for fallback
        const buildFarmerMap = async () => {
          const { data, error } = await supabase.from('farmers').select('id, village');
          if (error) throw error;
          const m = new Map<string, string>();
          for (const r of (data as { id: string; village: string }[] | null) || []) m.set(r.id, r.village);
          return m;
        };

        const distinctCount = async (table: string, vill: string): Promise<number> => {
          // Try direct village column first
          const { data, error } = await supabase.from(table).select('farmer_id').eq('village', vill);
          if (!error) {
            if (!data || data.length === 0) return 0;
            return new Set((data as { farmer_id: string }[]).map((r) => r.farmer_id)).size;
          }
          if (!isMissingCol(error)) throw error;
          // Fallback via farmers
          const [rows, farmerMap] = await Promise.all([
            supabase.from(table).select('farmer_id'),
            buildFarmerMap(),
          ]);
          if (rows.error) throw rows.error;
          const filtered = ((rows.data as { farmer_id: string }[] | null) || []).filter((r) => farmerMap.get(r.farmer_id) === vill);
          return new Set(filtered.map((r) => r.farmer_id)).size;
        };

        const [vaccinated, total] = await Promise.all([
          distinctCount('vaccinations', village),
          distinctCount('reports', village),
        ]);

        const coverage = total === 0 ? 0 : Math.round((vaccinated / total) * 100 * 10) / 10;
        console.log(`[triage-report] Coverage for ${village}: ${vaccinated}/${total} = ${coverage}%`);

        if (coverage < 60 && result.risk_level === 'low') {
          const prev = result.risk_level;
          result = {
            ...result,
            risk_level: 'medium',
            reasoning: `${result.reasoning} Low vaccination coverage in ${village} (${coverage}% — ${vaccinated}/${total} farmers) elevates risk.`,
          };
          console.log(`[triage-report] Coverage bump: ${prev} -> ${result.risk_level} due to low coverage (${coverage}% < 60%)`);
        } else if (coverage < 60) {
          result = {
            ...result,
            reasoning: `${result.reasoning} Note: low vaccination coverage in ${village} (${coverage}%) — area is under-vaccinated.`,
          };
          console.log(`[triage-report] Low coverage note added (${coverage}%) — risk remains ${result.risk_level}`);
        }
      } else {
        console.log(`[triage-report] Could not resolve village for coverage check — skipping bump`);
      }
    } catch (covErr) {
      console.warn('[triage-report] Coverage check failed (fail-open, keeping original triage):', covErr);
    }

    console.log(`[triage-report] Final result for ${reportId}:`, result);

    // Update report.risk_level (and optional confidence/reasoning columns if they exist)
    const updatePayload: Record<string, unknown> = {
      risk_level: result.risk_level,
      // try to store extra triage info if columns exist; supabase will ignore unknown columns only if we handle error
      // We'll attempt with confidence/reasoning and fallback to risk_level only on error
      triage_confidence: result.confidence,
      triage_reasoning: result.reasoning,
      updated_at: new Date().toISOString(),
    };

    let { error: updateError } = await supabase.from('reports').update(updatePayload).eq('id', reportId);

    if (updateError) {
      // Fallback: try updating only risk_level (in case extra columns don't exist)
      console.warn('[triage-report] Update with extra fields failed, retrying with risk_level only:', updateError.message);
      const { error: retryError } = await supabase.from('reports').update({ risk_level: result.risk_level }).eq('id', reportId);
      if (retryError) throw retryError;
    }

    // If HIGH risk: create row in cases table with status='pending'
    // Note: schema supabase/schema.sql:44-53 has no risk_level column in cases — handle fallback
    let caseRow = null;
    if (result.risk_level === 'high') {
      let data: any = null;
      let caseError: any = null;
      // Try with risk_level first (if column exists in extended schema), fallback without
      const insertWithRisk = await supabase
        .from('cases')
        .insert({
          report_id: reportId,
          status: 'pending',
          risk_level: 'high',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select()
        .single();
      data = insertWithRisk.data;
      caseError = insertWithRisk.error;
      if (caseError && /risk_level|column.*does not exist/i.test(caseError.message)) {
        console.warn('[triage-report] cases.risk_level column missing, retrying without it:', caseError.message);
        const retry = await supabase
          .from('cases')
          .insert({
            report_id: reportId,
            status: 'pending',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .select()
          .single();
        data = retry.data;
        caseError = retry.error;
      }
      if (caseError) {
        console.error('[triage-report] Failed to create case for high-risk report:', caseError);
        throw caseError;
      }
      caseRow = data;
      console.log(`[triage-report] HIGH risk — created case ${data?.id} for report ${reportId}`);
    } else {
      console.log(`[triage-report] Risk ${result.risk_level} — no case created for report ${reportId}`);
    }

    return new Response(
      JSON.stringify({
        report_id: reportId,
        triage: result,
        case: caseRow,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('[triage-report] Error:', err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
