'use client';

import { useEffect, useState } from 'react';
import CaseCard, { CaseData } from '../../components/CaseCard';

// --- Demo vet list (hardcoded for demo) ---
const DEMO_VETS = [
  { id: 'vet-001', name: 'Dr. Sharma', village: 'Rampur', block: 'Bilaspur', phone: '+91 98765 43210' },
  { id: 'vet-002', name: 'Dr. Patel', village: 'Bilaspur', block: 'Bilaspur', phone: '+91 98765 43211' },
  { id: 'vet-003', name: 'Dr. Singh', village: 'Kheri', block: 'Kheri', phone: '+91 98765 43212' },
  { id: 'vet-004', name: 'Dr. Verma', village: 'Rampur', block: 'Rampur', phone: '+91 98765 43213' },
];

// Mock cases for demo when Supabase not configured
const MOCK_CASES: CaseData[] = [
  {
    id: 'case-001',
    report_id: 'rep-001',
    animal_type: 'cow',
    symptoms: ['fever', 'swelling', 'not eating'],
    photo_url: 'https://images.unsplash.com/photo-1527153857715-3908f2bae5e8?w=600&h=400&fit=crop',
    farmer_name: 'Ramesh Kumar',
    farmer_phone: '+91 98765 00001',
    village: 'Rampur',
    block: 'Bilaspur',
    latitude: 28.6139,
    longitude: 77.209,
    risk_level: 'high',
    status: 'pending',
    created_at: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
    updated_at: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
    assigned_vet_id: 'vet-001',
    confirmed_disease: null,
  },
  {
    id: 'case-002',
    report_id: 'rep-002',
    animal_type: 'buffalo',
    symptoms: ['fever', 'cough'],
    photo_url: 'https://images.unsplash.com/photo-1500595046743-cd271d694d30?w=600&h=400&fit=crop',
    farmer_name: 'Sunita Devi',
    farmer_phone: '+91 98765 00002',
    village: 'Bilaspur',
    block: 'Bilaspur',
    latitude: 28.6209,
    longitude: 77.219,
    risk_level: 'medium',
    status: 'pending',
    created_at: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
    updated_at: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
    assigned_vet_id: 'vet-002',
    confirmed_disease: null,
  },
  {
    id: 'case-003',
    report_id: 'rep-003',
    animal_type: 'goat',
    symptoms: ['swelling', 'discharge'],
    photo_url: null,
    farmer_name: 'Amit Singh',
    farmer_phone: '+91 98765 00003',
    village: 'Kheri',
    block: 'Kheri',
    latitude: 28.535,
    longitude: 77.391,
    risk_level: 'medium',
    status: 'confirmed',
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(),
    updated_at: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
    assigned_vet_id: 'vet-003',
    confirmed_disease: 'HS',
  },
  {
    id: 'case-004',
    report_id: 'rep-004',
    animal_type: 'cow',
    symptoms: ['fever', 'swelling', 'discharge', 'not eating'],
    photo_url: 'https://images.unsplash.com/photo-1518717758536-85ae29035b6d?w=600&h=400&fit=crop',
    farmer_name: 'Geeta Yadav',
    farmer_phone: '+91 98765 00004',
    village: 'Rampur',
    block: 'Rampur',
    latitude: 28.6145,
    longitude: 77.21,
    risk_level: 'high',
    status: 'pending',
    created_at: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
    updated_at: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
    assigned_vet_id: 'vet-001',
    confirmed_disease: null,
  },
];

function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  // dynamic import to avoid hard dependency if not installed
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createClient } = require('@supabase/supabase-js');
    return createClient(url, anonKey);
  } catch {
    return null;
  }
}

export default function VetDashboardPage() {
  const [selectedVetId, setSelectedVetId] = useState<string>('');
  const [cases, setCases] = useState<CaseData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isMock, setIsMock] = useState(false);

  const selectedVet = DEMO_VETS.find((v) => v.id === selectedVetId) || null;

  const fetchCases = async (vetId: string) => {
    if (!vetId) {
      setCases([]);
      return;
    }
    setLoading(true);
    setError(null);
    const supabase = getSupabaseClient();
    if (!supabase) {
      // Use mock data
      setIsMock(true);
      // Simulate network delay
      await new Promise((r) => setTimeout(r, 300));
      const filtered = MOCK_CASES.filter((c) => c.assigned_vet_id === vetId);
      setCases(filtered);
      setLoading(false);
      return;
    }

    setIsMock(false);
    try {
      // Query cases where assigned_vet_id = current_vet_id, join report for details?
      // Assuming `cases` has FK to `reports` with embedded report data or we fetch separately
      // Try to fetch cases with report join: select *, reports(*)
      const { data, error: fetchError } = await supabase
        .from('cases')
        .select(
          `
          id, report_id, status, risk_level, assigned_vet_id, confirmed_disease, created_at, updated_at,
          reports (
            animal_type, symptoms, photo_url, farmer_name, farmer_phone, village, block, latitude, longitude
          )
        `
        )
        .eq('assigned_vet_id', vetId)
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;

      // Normalize to CaseData[]
      const normalized: CaseData[] = (data || []).map((row: any) => ({
        id: row.id,
        report_id: row.report_id,
        animal_type: row.reports?.animal_type ?? row.animal_type ?? 'unknown',
        symptoms: Array.isArray(row.reports?.symptoms) ? row.reports.symptoms : Array.isArray(row.symptoms) ? row.symptoms : [],
        photo_url: row.reports?.photo_url ?? row.photo_url ?? null,
        farmer_name: row.reports?.farmer_name ?? row.farmer_name ?? null,
        farmer_phone: row.reports?.farmer_phone ?? row.farmer_phone ?? null,
        village: row.reports?.village ?? row.village ?? null,
        block: row.reports?.block ?? row.block ?? null,
        latitude: row.reports?.latitude ?? row.latitude ?? null,
        longitude: row.reports?.longitude ?? row.longitude ?? null,
        risk_level: row.risk_level ?? 'low',
        status: row.status,
        created_at: row.created_at,
        updated_at: row.updated_at,
        assigned_vet_id: row.assigned_vet_id,
        confirmed_disease: row.confirmed_disease ?? null,
      }));

      setCases(normalized);
    } catch (err: any) {
      console.error('[vet-dashboard] fetch error', err);
      setError(err.message ?? String(err));
      // fallback to mock
      const filtered = MOCK_CASES.filter((c) => c.assigned_vet_id === vetId);
      setCases(filtered);
      setIsMock(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedVetId) fetchCases(selectedVetId);
    else setCases([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedVetId]);

  const handleStatusChange = async (caseId: string, status: string, confirmedDisease?: string | null) => {
    const supabase = getSupabaseClient();
    const updatePayload: Record<string, unknown> = {
      status,
      updated_at: new Date().toISOString(),
    };
    if (status === 'confirmed') {
      updatePayload.confirmed_disease = confirmedDisease ?? null;
    }
    if (status === 'false_alarm') {
      // normalize false alarm string for DB
      updatePayload.status = 'false_alarm';
    }

    // Optimistic update
    setCases((prev) =>
      prev.map((c) =>
        c.id === caseId ? { ...c, status: (updatePayload.status as string) ?? status, confirmed_disease: (updatePayload.confirmed_disease as string) ?? c.confirmed_disease, updated_at: updatePayload.updated_at as string } : c
      )
    );

    // Mock mode: no DB call
    const needsMock = !supabase || isMock;
    if (needsMock) {
      // update mock array for persistence within session
      const idx = MOCK_CASES.findIndex((c) => c.id === caseId);
      if (idx !== -1) {
        MOCK_CASES[idx] = { ...MOCK_CASES[idx], status: (updatePayload.status as string) ?? status, confirmed_disease: (updatePayload.confirmed_disease as string) ?? MOCK_CASES[idx].confirmed_disease, updated_at: updatePayload.updated_at as string };
      }
      return;
    }

    try {
      const { error: updateError } = await supabase.from('cases').update(updatePayload).eq('id', caseId);
      if (updateError) throw updateError;
      // Re-fetch to ensure consistency
      // await fetchCases(selectedVetId);
    } catch (err: any) {
      console.error('[vet-dashboard] update error', err);
      setError(`Failed to update case ${caseId}: ${err.message}`);
      // revert on error? refetch
      fetchCases(selectedVetId);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto p-4 md:p-6">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Vet Dashboard</h1>
          <p className="text-sm text-gray-600">Triage & case escalation — SIH 2026 Livestock Surveillance</p>
        </div>

        {/* Vet Login */}
        <div className="bg-white border rounded-xl p-4 mb-6 shadow-sm">
          <label className="block text-sm font-medium text-gray-700 mb-2">Select Vet (Demo Login)</label>
          <div className="flex flex-col sm:flex-row gap-3">
            <select
              value={selectedVetId}
              onChange={(e) => setSelectedVetId(e.target.value)}
              className="flex-1 border rounded-lg px-3 py-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">— Choose vet —</option>
              {DEMO_VETS.map((vet) => (
                <option key={vet.id} value={vet.id}>
                  {vet.name} — {vet.village} ({vet.block}) — {vet.id}
                </option>
              ))}
            </select>
            {selectedVet && (
              <div className="sm:w-auto bg-blue-50 border border-blue-200 rounded-lg px-4 py-2.5 text-sm">
                <p className="font-semibold text-blue-900">{selectedVet.name}</p>
                <p className="text-blue-700 text-xs">
                  {selectedVet.village}, {selectedVet.block} • {selectedVet.phone}
                </p>
              </div>
            )}
          </div>
          {!selectedVetId && <p className="text-xs text-gray-500 mt-2">Pre-populated for demo; no password required.</p>}
        </div>

        {/* Cases Section */}
        {!selectedVetId ? (
          <div className="bg-white border border-dashed rounded-xl p-12 text-center">
            <p className="text-gray-500">Select a vet to view assigned cases.</p>
            <p className="text-xs text-gray-400 mt-1">High-risk cases are auto-assigned via triage → assign-case edge functions.</p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">
                Assigned Cases{' '}
                <span className="text-sm font-normal text-gray-500">
                  ({cases.length} {cases.length === 1 ? 'case' : 'cases'})
                </span>
              </h2>
              <div className="flex gap-2">
                <button
                  onClick={() => fetchCases(selectedVetId)}
                  disabled={loading}
                  className="px-3 py-1.5 text-sm border rounded-lg bg-white hover:bg-gray-50 disabled:opacity-50"
                >
                  {loading ? 'Loading...' : 'Refresh'}
                </button>
                {isMock && <span className="px-2 py-1 text-[10px] bg-yellow-100 border border-yellow-300 rounded-full">MOCK DATA — connect Supabase to see live</span>}
              </div>
            </div>

            {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}

            {loading ? (
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="border rounded-xl p-4 bg-white animate-pulse">
                    <div className="h-6 bg-gray-100 rounded mb-3 w-1/2"></div>
                    <div className="h-32 bg-gray-100 rounded mb-3"></div>
                    <div className="h-4 bg-gray-100 rounded mb-2"></div>
                    <div className="h-4 bg-gray-100 rounded w-3/4"></div>
                  </div>
                ))}
              </div>
            ) : cases.length === 0 ? (
              <div className="bg-white border rounded-xl p-8 text-center">
                <p className="text-gray-600">No cases assigned to {selectedVet?.name}.</p>
                <p className="text-xs text-gray-400 mt-1">New HIGH-risk reports will appear here automatically after triage & assignment.</p>
              </div>
            ) : (
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {cases.map((c) => (
                  <CaseCard key={c.id} caseData={c} onStatusChange={handleStatusChange} />
                ))}
              </div>
            )}

            {/* History summary */}
            {cases.length > 0 && (
              <div className="mt-8 bg-white border rounded-xl p-4">
                <h3 className="text-sm font-semibold mb-3">Case History (timeline)</h3>
                <div className="space-y-2 text-xs font-mono">
                  {[...cases]
                    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
                    .map((c) => (
                      <div key={c.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 border-b last:border-0 py-2">
                        <span className="text-gray-700">
                          <span className="font-semibold">{c.id.slice(0, 8)}</span> — {c.animal_type} — {c.status}
                          {c.confirmed_disease ? ` (${c.confirmed_disease})` : ''}
                        </span>
                        <span className="text-gray-500">
                          created {new Date(c.created_at).toLocaleString()} → updated {new Date(c.updated_at).toLocaleString()}
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </>
        )}

        <p className="text-center text-[11px] text-gray-400 mt-8">
          SIH2026 • Triage engine: /lib/triage.ts • Assignment: /lib/vet-assignment.ts • Edge functions: /supabase/functions/*
        </p>
      </div>
    </div>
  );
}
