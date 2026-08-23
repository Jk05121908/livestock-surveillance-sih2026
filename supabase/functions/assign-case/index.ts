// Supabase Edge Function: assign-case
// Triggered when new case is created -> assign to nearest vet
// Location: /supabase/functions/assign-case/index.ts:1
// Deno runtime

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ---- Vet assignment helpers (self-contained) ----
interface Vet {
  id: string;
  name: string;
  phone?: string;
  village: string;
  block?: string;
  latitude?: number | null;
  longitude?: number | null;
}
interface ReportLocation {
  id?: string;
  latitude?: number | null;
  longitude?: number | null;
  village?: string | null;
  block?: string | null;
}

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}
function normalizeVillage(v?: string | null) { return (v||'').toLowerCase().trim(); }

function findNearestVet(vets: Vet[], report: ReportLocation): Vet | null {
  if (!vets || vets.length===0) return null;
  const reportVillage = normalizeVillage(report.village);
  const reportBlock = normalizeVillage(report.block);
  const hasCoords = typeof report.latitude==='number' && typeof report.longitude==='number' && !isNaN(report.latitude) && !isNaN(report.longitude);

  if (reportVillage) {
    const villageVets = vets.filter(v => normalizeVillage(v.village)===reportVillage);
    if (villageVets.length===1) return villageVets[0];
    if (villageVets.length>1) {
      if (hasCoords) {
        let nearest=villageVets[0]; let min=Infinity;
        for (const vet of villageVets) {
          if (typeof vet.latitude==='number' && typeof vet.longitude==='number' && vet.latitude!==null && vet.longitude!==null) {
            const d=haversineDistance(report.latitude!,report.longitude!,vet.latitude,vet.longitude);
            if (d<min){min=d; nearest=vet;}
          }
        }
        return nearest;
      }
      return villageVets[0];
    }
  }
  if (reportBlock) {
    const blockVets = vets.filter(v => normalizeVillage(v.block)===reportBlock);
    if (blockVets.length===1) return blockVets[0];
    if (blockVets.length>1 && hasCoords) {
      let nearest=blockVets[0]; let min=Infinity;
      for (const vet of blockVets) {
        if (typeof vet.latitude==='number' && typeof vet.longitude==='number' && vet.latitude!==null && vet.longitude!==null) {
          const d=haversineDistance(report.latitude!,report.longitude!,vet.latitude,vet.longitude);
          if (d<min){min=d; nearest=vet;}
        }
      }
      return nearest;
    }
    if (blockVets.length>0) return blockVets[0];
  }
  if (hasCoords) {
    let nearest: Vet|null=null; let min=Infinity;
    for (const vet of vets) {
      if (typeof vet.latitude==='number' && typeof vet.longitude==='number' && vet.latitude!==null && vet.longitude!==null) {
        const d=haversineDistance(report.latitude!,report.longitude!,vet.latitude,vet.longitude);
        if (d<min){min=d; nearest=vet;}
      }
    }
    if (nearest) return nearest;
  }
  return vets[0];
}
// ---- End helpers ----

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    if (!supabaseUrl || !supabaseServiceKey) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json().catch(()=> ({}));
    const record = body.record ?? body;
    const caseId: string | undefined = record.id ?? body.case_id;
    const reportId: string | undefined = record.report_id ?? body.report_id ?? body.report?.id;

    if (!caseId) {
      return new Response(JSON.stringify({ error: 'Missing case id (record.id)' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    console.log(`[assign-case] Triggered for case ${caseId} | report_id: ${reportId}`);

    // Fetch report details for location (latitude, longitude, village, block)
    let report: ReportLocation | null = null;
    if (reportId) {
      const { data, error } = await supabase.from('reports').select('id, latitude, longitude, village, block, animal_type, symptoms, farmer_name, farmer_phone').eq('id', reportId).single();
      if (error) {
        console.warn(`[assign-case] Could not fetch report ${reportId}:`, error.message);
        // fallback to record embedded report
        report = body.report ?? record.report ?? null;
      } else {
        report = data as ReportLocation;
      }
    } else {
      // No report_id, try embedded report location
      report = body.report ?? record.report ?? record;
    }

    if (!report) {
      return new Response(JSON.stringify({ error: 'Could not resolve report location for case', case_id: caseId }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    console.log(`[assign-case] Report location:`, { village: report.village, block: report.block, lat: report.latitude, lng: report.longitude });

    // Query vets table
    const { data: vets, error: vetsError } = await supabase.from('vets').select('*');
    if (vetsError) throw vetsError;
    if (!vets || vets.length===0) {
      console.warn('[assign-case] No vets in table');
      return new Response(JSON.stringify({ case_id: caseId, assigned: null, reason: 'no vets found' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const nearest = findNearestVet(vets as Vet[], report);
    if (!nearest) {
      return new Response(JSON.stringify({ case_id: caseId, assigned: null, reason: 'could not determine nearest vet' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Update cases table: assigned_vet_id = nearest vet
    const { error: updateError } = await supabase.from('cases').update({ assigned_vet_id: nearest.id, updated_at: new Date().toISOString() }).eq('id', caseId);
    if (updateError) throw updateError;

    // Notification (log for now, SMS/email later)
    const farmerInfo = (report as any).farmer_name ? `farmer ${(report as any).farmer_name} (${(report as any).farmer_phone ?? 'no phone'})` : 'unknown farmer';
    const dist = (report.latitude && report.longitude && nearest.latitude && nearest.longitude)
      ? `${haversineDistance(report.latitude, report.longitude, nearest.latitude, nearest.longitude).toFixed(2)} km`
      : 'N/A (village/block match)';
    console.log(`[assign-case] ✅ Case ${caseId} assigned to vet ${nearest.id} — ${nearest.name} (${nearest.village}) | Distance: ${dist} | Report: ${farmerInfo} @ ${report.village ?? 'unknown village'} [${report.latitude ?? '?'}, ${report.longitude ?? '?'}]`);
    console.log(`[assign-case] 📲 Notification: Vet ${nearest.name} (${nearest.phone ?? 'no phone'}) — New high-risk case ${caseId} assigned. Village: ${report.village}, Animal: ${(report as any).animal_type ?? 'unknown'}. Please review in vet dashboard.`);
    // TODO: Integrate SMS/email via Twilio/SendGrid here

    return new Response(JSON.stringify({ case_id: caseId, assigned_vet: nearest, distance: dist, report }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('[assign-case] Error:', err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
