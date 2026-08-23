'use client';

import { useState } from 'react';

export interface CaseData {
  id: string;
  report_id?: string;
  animal_type: string;
  symptoms: string[];
  photo_url?: string | null;
  farmer_name?: string | null;
  farmer_phone?: string | null;
  village?: string | null;
  block?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  risk_level: 'low' | 'medium' | 'high';
  status: string;
  created_at: string;
  updated_at: string;
  assigned_vet_id?: string | null;
  confirmed_disease?: string | null;
}

interface Props {
  caseData: CaseData;
  onStatusChange: (caseId: string, status: string, confirmedDisease?: string | null) => Promise<void> | void;
}

const riskColor: Record<string, string> = {
  high: 'bg-red-100 text-red-800 border-red-300',
  medium: 'bg-yellow-100 text-yellow-800 border-yellow-300',
  low: 'bg-green-100 text-green-800 border-green-300',
};

const statusColor: Record<string, string> = {
  pending: 'bg-gray-100 text-gray-800',
  confirmed: 'bg-orange-100 text-orange-800',
  treated: 'bg-blue-100 text-blue-800',
  false_alarm: 'bg-gray-100 text-gray-600 line-through',
  'false alarm': 'bg-gray-100 text-gray-600',
};

export default function CaseCard({ caseData, onStatusChange }: Props) {
  const [loading, setLoading] = useState<string | null>(null);
  const [showConfirmInput, setShowConfirmInput] = useState(false);
  const [diseaseInput, setDiseaseInput] = useState(caseData.confirmed_disease || '');

  const handleAction = async (status: string, disease?: string | null) => {
    try {
      setLoading(status);
      await onStatusChange(caseData.id, status, disease ?? null);
    } finally {
      setLoading(null);
      setShowConfirmInput(false);
    }
  };

  const handleConfirmedClick = () => {
    if (!showConfirmInput) {
      setShowConfirmInput(true);
      return;
    }
    // submit with disease
    handleAction('confirmed', diseaseInput.trim() || null);
  };

  return (
    <div className="border rounded-xl shadow-sm bg-white p-4 flex flex-col gap-3 hover:shadow-md transition-shadow">
      {/* Header: risk + status + id */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap gap-2 items-center">
          <span className={`px-2 py-1 rounded-full text-xs font-semibold border ${riskColor[caseData.risk_level] ?? 'bg-gray-100'}`}>
            {caseData.risk_level.toUpperCase()} RISK
          </span>
          <span className={`px-2 py-1 rounded-full text-xs border ${statusColor[caseData.status] ?? 'bg-gray-50'}`}>
            {caseData.status}
          </span>
          {caseData.confirmed_disease && (
            <span className="px-2 py-1 rounded bg-purple-50 text-purple-700 text-xs border border-purple-200">
              {caseData.confirmed_disease}
            </span>
          )}
        </div>
        <span className="text-[10px] text-gray-400 font-mono">#{caseData.id.slice(0, 8)}</span>
      </div>

      {/* Photo */}
      {caseData.photo_url ? (
        <img src={caseData.photo_url} alt={`${caseData.animal_type} photo`} className="w-full h-48 object-cover rounded-lg border" />
      ) : (
        <div className="w-full h-32 bg-gray-50 border border-dashed rounded-lg flex items-center justify-center text-gray-400 text-sm">No photo</div>
      )}

      {/* Details */}
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div>
          <p className="text-gray-500 text-xs uppercase tracking-wide">Animal</p>
          <p className="font-medium capitalize">{caseData.animal_type}</p>
        </div>
        <div>
          <p className="text-gray-500 text-xs uppercase tracking-wide">Location</p>
          <p className="font-medium">
            {caseData.village || 'Unknown village'}
            {caseData.block ? `, ${caseData.block}` : ''}
          </p>
          {caseData.latitude && caseData.longitude && (
            <a
              href={`https://maps.google.com/?q=${caseData.latitude},${caseData.longitude}`}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-blue-600 hover:underline"
            >
              {caseData.latitude.toFixed(4)}, {caseData.longitude.toFixed(4)} ↗
            </a>
          )}
        </div>
        <div>
          <p className="text-gray-500 text-xs uppercase tracking-wide">Farmer</p>
          <p className="font-medium">{caseData.farmer_name || '—'}</p>
          {caseData.farmer_phone && (
            <a href={`tel:${caseData.farmer_phone}`} className="text-xs text-blue-600 hover:underline">
              {caseData.farmer_phone}
            </a>
          )}
        </div>
        <div>
          <p className="text-gray-500 text-xs uppercase tracking-wide">Assigned Vet</p>
          <p className="font-mono text-xs">{caseData.assigned_vet_id?.slice(0, 8) || '—'}</p>
        </div>
      </div>

      {/* Symptoms */}
      <div>
        <p className="text-gray-500 text-xs uppercase tracking-wide mb-1">Symptoms</p>
        <div className="flex flex-wrap gap-1.5">
          {Array.isArray(caseData.symptoms) && caseData.symptoms.length > 0 ? (
            caseData.symptoms.map((s, i) => (
              <span key={i} className="px-2 py-1 bg-gray-100 border rounded-full text-xs">
                {s}
              </span>
            ))
          ) : (
            <span className="text-xs text-gray-400">No symptoms listed</span>
          )}
        </div>
      </div>

      {/* History */}
      <div className="text-xs text-gray-500 border-t pt-2 flex flex-col gap-1">
        <div className="flex justify-between">
          <span>Created:</span>
          <span className="font-mono">{new Date(caseData.created_at).toLocaleString()}</span>
        </div>
        <div className="flex justify-between">
          <span>Updated:</span>
          <span className="font-mono">{new Date(caseData.updated_at).toLocaleString()}</span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-2 pt-2 border-t">
        {showConfirmInput && (
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Confirmed disease (e.g. FMD, HS)"
              value={diseaseInput}
              onChange={(e) => setDiseaseInput(e.target.value)}
              className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
            />
            <button
              onClick={() => setShowConfirmInput(false)}
              className="px-3 py-2 text-sm border rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        )}
        <div className="grid grid-cols-3 gap-2">
          <button
            onClick={handleConfirmedClick}
            disabled={!!loading}
            className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${showConfirmInput ? 'bg-orange-600 text-white border-orange-600 hover:bg-orange-700' : 'bg-orange-50 text-orange-700 border-orange-200 hover:bg-orange-100'} disabled:opacity-50`}
            title="Mark as confirmed disease"
          >
            {loading === 'confirmed' ? '...' : showConfirmInput ? 'Confirm ✓' : 'Confirmed'}
          </button>
          <button
            onClick={() => handleAction('treated')}
            disabled={!!loading}
            className="px-3 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {loading === 'treated' ? '...' : 'Treated'}
          </button>
          <button
            onClick={() => handleAction('false_alarm')}
            disabled={!!loading}
            className="px-3 py-2 rounded-lg text-sm font-medium bg-gray-100 text-gray-700 border hover:bg-gray-200 disabled:opacity-50"
          >
            {loading === 'false_alarm' ? '...' : 'False Alarm'}
          </button>
        </div>
      </div>
    </div>
  );
}
