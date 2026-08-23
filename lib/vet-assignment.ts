/**
 * Vet Assignment Logic - Find nearest vet for a case
 * Location: /lib/vet-assignment.ts:1
 */

export interface Vet {
  id: string;
  name: string;
  phone?: string;
  village: string;
  block?: string;
  latitude?: number | null;
  longitude?: number | null;
  specialization?: string;
}

export interface ReportLocation {
  id?: string;
  latitude?: number | null;
  longitude?: number | null;
  village?: string | null;
  block?: string | null;
}

/**
 * Haversine distance in kilometers between two lat/lng points
 */
export function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371; // Earth radius in km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function normalizeVillage(v?: string | null): string {
  return (v || '').toLowerCase().trim();
}

/**
 * Find nearest vet for a given report.
 * Logic:
 * 1. Prefer vets in same village (case-insensitive exact match)
 * 2. If multiple in same village, pick nearest by distance (if coords available)
 * 3. Else try same block
 * 4. Else find nearest by haversine distance using lat/lng
 * 5. Fallback: first vet in list if no coordinates
 *
 * @param vets - array of Vet records from `vets` table
 * @param report - report with latitude, longitude, village, block
 * @returns nearest Vet or null if no vets
 */
export function findNearestVet(vets: Vet[], report: ReportLocation): Vet | null {
  if (!vets || vets.length === 0) return null;
  if (!report) return vets[0];

  const reportVillage = normalizeVillage(report.village);
  const reportBlock = normalizeVillage(report.block);
  const hasCoords =
    typeof report.latitude === 'number' &&
    typeof report.longitude === 'number' &&
    !isNaN(report.latitude) &&
    !isNaN(report.longitude);

  // 1. Same village
  if (reportVillage) {
    const villageVets = vets.filter((v) => normalizeVillage(v.village) === reportVillage);
    if (villageVets.length === 1) return villageVets[0];
    if (villageVets.length > 1) {
      if (hasCoords) {
        // pick nearest among village vets
        let nearest = villageVets[0];
        let minDist = Infinity;
        for (const vet of villageVets) {
          if (typeof vet.latitude === 'number' && typeof vet.longitude === 'number' && vet.latitude !== null && vet.longitude !== null) {
            const d = haversineDistance(report.latitude!, report.longitude!, vet.latitude, vet.longitude);
            if (d < minDist) {
              minDist = d;
              nearest = vet;
            }
          }
        }
        // if none had coords, return first village vet
        return nearest;
      }
      return villageVets[0];
    }
  }

  // 2. Same block (if village didn't match)
  if (reportBlock) {
    const blockVets = vets.filter((v) => normalizeVillage(v.block) === reportBlock);
    if (blockVets.length === 1) return blockVets[0];
    if (blockVets.length > 1 && hasCoords) {
      let nearest = blockVets[0];
      let minDist = Infinity;
      for (const vet of blockVets) {
        if (typeof vet.latitude === 'number' && typeof vet.longitude === 'number' && vet.latitude !== null && vet.longitude !== null) {
          const d = haversineDistance(report.latitude!, report.longitude!, vet.latitude, vet.longitude);
          if (d < minDist) {
            minDist = d;
            nearest = vet;
          }
        }
      }
      return nearest;
    }
    if (blockVets.length > 0) return blockVets[0];
  }

  // 3. Nearest by distance (requires report coords)
  if (hasCoords) {
    let nearest: Vet | null = null;
    let minDist = Infinity;
    for (const vet of vets) {
      if (typeof vet.latitude === 'number' && typeof vet.longitude === 'number' && vet.latitude !== null && vet.longitude !== null) {
        const d = haversineDistance(report.latitude!, report.longitude!, vet.latitude, vet.longitude);
        if (d < minDist) {
          minDist = d;
          nearest = vet;
        }
      }
    }
    if (nearest) return nearest;
  }

  // 4. Fallback: first vet
  return vets[0];
}

/**
 * Assign case to nearest vet (DB-aware helper)
 * Queries `vets` table, finds nearest vet for report, updates `cases` table.
 *
 * @param supabase - Supabase client (from @supabase/supabase-js)
 * @param caseId - case id to update
 * @param report - report location object with latitude, longitude, village, block
 * @returns assigned Vet details or null
 */
export async function assignNearestVet(
  supabase: any,
  caseId: string,
  report: ReportLocation
): Promise<Vet | null> {
  // Query vets table
  const { data: vets, error: vetsError } = await supabase.from('vets').select('*');

  if (vetsError) {
    console.error('[vet-assignment] Failed to fetch vets:', vetsError);
    throw new Error(`Failed to fetch vets: ${vetsError.message}`);
  }

  if (!vets || vets.length === 0) {
    console.warn('[vet-assignment] No vets found in database');
    return null;
  }

  const nearest = findNearestVet(vets as Vet[], report);

  if (!nearest) {
    console.warn('[vet-assignment] Could not determine nearest vet');
    return null;
  }

  // Update cases table
  const { error: updateError } = await supabase
    .from('cases')
    .update({ assigned_vet_id: nearest.id, updated_at: new Date().toISOString() })
    .eq('id', caseId);

  if (updateError) {
    console.error('[vet-assignment] Failed to update case:', updateError);
    throw new Error(`Failed to assign vet: ${updateError.message}`);
  }

  console.log(`[vet-assignment] Case ${caseId} assigned to vet ${nearest.id} (${nearest.name}) in ${nearest.village} | report village: ${report.village} | distance: ${
    report.latitude && report.longitude && nearest.latitude && nearest.longitude
      ? haversineDistance(report.latitude, report.longitude, nearest.latitude, nearest.longitude).toFixed(2) + ' km'
      : 'N/A (village/block match)'
  }`);

  return nearest;
}

export default findNearestVet;
