/**
 * Reverse Geocoding helper — SIH 2026
 * Member 3 /lib/geocoding.ts
 *
 * Provides getAddressFromCoords(lat, lng) used by CaseCard LOCATION section.
 * Uses OpenStreetMap Nominatim (no API key) with BigDataCloud fallback.
 * In-memory cache prevents duplicate lookups for same coordinates.
 *
 * Spec: display full address, not just coordinates; fail gracefully to coordinates.
 */

export type ReverseGeocodeResult = {
  displayName: string;
  village?: string;
  block?: string;
  district?: string;
  state?: string;
  postcode?: string;
  raw?: unknown;
};

// In-memory cache: "lat,lng" -> display string
const cache = new Map<string, string>();

// Also cache promises to dedupe concurrent requests for same coords
const pending = new Map<string, Promise<string | null>>();

function cacheKey(lat: number, lng: number): string {
  // Round to 4 decimals (~11m) for cache hit tolerance; spec shows 4 decimals
  return `${lat.toFixed(4)},${lng.toFixed(4)}`;
}

function isValidCoord(lat: unknown, lng: unknown): boolean {
  if (typeof lat !== "number" || typeof lng !== "number") return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat < -90 || lat > 90) return false;
  if (lng < -180 || lng > 180) return false;
  return true;
}

function formatNominatimAddress(data: unknown): string {
  if (!data || typeof data !== "object") return "";
  // Prefer display_name but build concise fallback: village, county, state
  const d = data as Record<string, unknown>;
  const addr = (d.address as Record<string, unknown>) || {};
  // Nominatim address fields vary by region (village, hamlet, suburb, town, city, county, state_district, state)
  const village =
    (addr.village as string) ||
    (addr.hamlet as string) ||
    (addr.suburb as string) ||
    (addr.town as string) ||
    (addr.city as string) ||
    (addr.municipality as string) ||
    (addr.county as string);
  const block = (addr.county as string) || (addr.state_district as string) || (addr.district as string);
  const state = (addr.state as string) || (addr.region as string);
  const parts = [village, block, state].filter(Boolean);
  if (parts.length >= 2) return parts.join(", ");
  if (typeof d.display_name === "string") return d.display_name;
  return parts.join(", ");
}

/**
 * Reverse geocode via OSM Nominatim, with timeout + fallback.
 * Returns formatted address string or null on failure.
 * Does NOT throw — caller decides fallback to coordinates.
 */
export async function getAddressFromCoords(
  lat: number,
  lng: number,
  opts?: { signal?: AbortSignal }
): Promise<string | null> {
  if (!isValidCoord(lat, lng)) return null;

  const key = cacheKey(lat, lng);
  if (cache.has(key)) return cache.get(key)!;
  if (pending.has(key)) return pending.get(key)!;

  const promise = (async (): Promise<string | null> => {
    // Timeout after 6s so card isn't blocked
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const signal = opts?.signal || controller.signal;

    const headers: Record<string, string> = {
      Accept: "application/json",
      "Accept-Language": "en",
    };
    // Nominatim requires User-Agent on server; browser fetch forbids setting it, so only set in non-browser
    try {
      if (typeof window === "undefined" && typeof (globalThis as unknown as { process?: unknown }).process !== "undefined") {
        headers["User-Agent"] = "livestock-surveillance-sih2026/1.0 (sih2026@example.com)";
      }
    } catch {}

    // Attempt 1: Nominatim
    try {
      const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`;
      const res = await fetch(url, { headers, signal });
      if (res.ok) {
        const data: unknown = await res.json();
        const formatted = formatNominatimAddress(data) || (data as Record<string, unknown>).display_name as string || null;
        if (formatted && formatted.trim()) {
          const trimmed = formatted.trim();
          cache.set(key, trimmed);
          return trimmed;
        }
      } else {
        console.warn(`[geocoding] Nominatim ${res.status} for ${key}`);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      // Abort is expected on timeout — don't log as error
      if (!msg.includes("abort") && !msg.includes("Abort")) {
        console.warn(`[geocoding] Nominatim failed for ${key}:`, msg);
      }
    } finally {
      clearTimeout(timeout);
    }

    // Attempt 2: BigDataCloud (no key, CORS-friendly)
    try {
      const bdcUrl = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=en`;
      const bdcRes = await fetch(bdcUrl, { signal: opts?.signal });
      if (bdcRes.ok) {
        const bdc = (await bdcRes.json()) as Record<string, unknown>;
        const parts = [
          (bdc.locality as string) || (bdc.city as string) || (bdc.principalSubdivision as string),
          (bdc.principalSubdivision as string) || (bdc.city as string),
          bdc.countryName as string,
        ].filter(Boolean);
        // Deduplicate consecutive same values (e.g. city==principalSubdivision)
        const deduped = parts.filter((p, i) => i === 0 || p !== parts[i - 1]);
        const formatted = deduped.join(", ") || ((bdc.localityInfo as Record<string, unknown>)?.administrative as Array<Record<string, unknown>>)?.[0]?.name as string || null;
        if (formatted) {
          cache.set(key, formatted);
          return formatted;
        }
      }
    } catch (e) {
      console.warn(`[geocoding] BigDataCloud failed for ${key}:`, e);
    }

    return null;
  })();

  pending.set(key, promise);
  try {
    const result = await promise;
    return result;
  } finally {
    pending.delete(key);
  }
}

/**
 * Synchronous cache getter — useful for testing or for rendering cached address without fetch.
 */
export function getCachedAddress(lat: number, lng: number): string | null {
  if (!isValidCoord(lat, lng)) return null;
  return cache.get(cacheKey(lat, lng)) || null;
}

/**
 * Clear cache (for tests).
 */
export function clearGeocodeCache(): void {
  cache.clear();
  pending.clear();
}

export default getAddressFromCoords;
