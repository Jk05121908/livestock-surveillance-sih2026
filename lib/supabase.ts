/**
 * Supabase helpers for livestock-surveillance-sih2026
 * Merged: canonical minimal client (farmer reporting) + typed vaccination helpers
 */

import { createClient as createSupabaseClient, SupabaseClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Canonical simple client (used by farmer reporting / existing code)
// ---------------------------------------------------------------------------

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = !!supabaseUrl && !!supabaseAnonKey;

if (!isSupabaseConfigured) {
  console.warn(
    "Supabase not configured: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local"
  );
}

// Singleton for backward compat — existing imports: `import { supabase } from '@/lib/supabase'`
export const supabase = createSupabaseClient(
  supabaseUrl || "https://placeholder.supabase.co",
  supabaseAnonKey || "placeholder-key"
);

// ---------------------------------------------------------------------------
// Types — mirror Member 2's schema + vaccination/vet/report tables
// ---------------------------------------------------------------------------

export type Farmer = {
  id: string;
  name: string;
  village: string;
  block: string;
  district?: string;
  phone?: string;
  created_at?: string;
};

export type Vet = {
  id: string;
  name: string;
  phone: string;
  village: string;
  block: string;
  specialization: string;
  created_at?: string;
};

export type Vaccination = {
  id: string;
  farmer_id: string;
  animal_id: string;
  vaccine_type: "FMD" | "mastitis" | "brucellosis" | "anthrax";
  village: string;
  block: string;
  district?: string;
  date: string; // YYYY-MM-DD
  notes?: string | null;
  vet_id?: string | null;
  created_at?: string;
};

export type Report = {
  id: string;
  farmer_id: string | null;
  animal_type: string;
  symptoms: unknown;
  notes: string | null;
  photo_url: string | null;
  latitude: number | null;
  longitude: number | null;
  risk_level?: string | null;
  escalated?: boolean | null;
  timestamp?: string;
  created_at?: string;
};

export type Database = {
  public: {
    Tables: {
      farmers: { Row: Farmer; Insert: Partial<Farmer>; Update: Partial<Farmer> };
      vets: { Row: Vet; Insert: Partial<Vet>; Update: Partial<Vet> };
      vaccinations: { Row: Vaccination; Insert: Partial<Vaccination>; Update: Partial<Vaccination> };
      reports: { Row: Report; Insert: Partial<Report>; Update: Partial<Report> };
    };
  };
};

// ---------------------------------------------------------------------------
// Client factories (vaccination & edge helpers)
// ---------------------------------------------------------------------------

function getEnv(name: string, fallback = ""): string {
  try {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore — Deno global
    if (typeof Deno !== "undefined" && Deno.env?.get) return Deno.env.get(name) || fallback;
  } catch {}
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  if (typeof process !== "undefined" && process.env?.[name]) return process.env[name] as string;
  return fallback;
}

export function getSupabaseEnv() {
  const url = getEnv("NEXT_PUBLIC_SUPABASE_URL") || getEnv("SUPABASE_URL") || supabaseUrl || "";
  const anonKey = getEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY") || getEnv("SUPABASE_ANON_KEY") || supabaseAnonKey || "";
  const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");
  return { url, anonKey, serviceRoleKey };
}

/**
 * Browser / client-side supabase (uses anon key)
 * Returns singleton if already configured, else creates new placeholder client.
 * Used in 'use client' components (vaccination form / admin)
 */
export function createClient(): SupabaseClient<Database> {
  // Reuse singleton if it matches env; otherwise create fresh
  const { url, anonKey } = getSupabaseEnv();
  if (isSupabaseConfigured) return supabase as unknown as SupabaseClient<Database>;
  if (!url || !anonKey) {
    console.warn("[supabase] Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }
  return createSupabaseClient<Database>(url || "https://placeholder.supabase.co", anonKey || "placeholder-key");
}

/**
 * Server-side client (anon) — for Next.js route handlers / server components.
 */
export function createServerClient(): SupabaseClient<Database> {
  const { url, anonKey } = getSupabaseEnv();
  if (!url || !anonKey) console.warn("[supabase] Missing env for server client");
  return createSupabaseClient<Database>(url || "https://placeholder.supabase.co", anonKey || "placeholder-key");
}

/**
 * Service-role client — for edge functions / admin tasks (bypasses RLS).
 * Never expose service key to browser.
 */
export function createServiceClient(): SupabaseClient<Database> {
  const { url, serviceRoleKey, anonKey } = getSupabaseEnv();
  const key = serviceRoleKey || anonKey;
  if (!url || !key) console.warn("[supabase] Missing env for service client");
  return createSupabaseClient<Database>(url || "https://placeholder.supabase.co", key || "placeholder-key");
}
