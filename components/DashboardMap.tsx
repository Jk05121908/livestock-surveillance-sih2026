"use client";

import { useMemo, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Fix default icon issue if needed (we use divIcons, but leaflet still tries to load)
if (typeof window !== "undefined") {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (L.Icon.Default.prototype as any)._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
    iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
    shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  });
}

export type DashboardCase = {
  id: string;
  report_id?: string | null;
  risk_level: string; // HIGH | MEDIUM | LOW | high | medium | low | pending
  status: string; // assigned, pending, confirmed, treated, etc
  animal_type: string;
  farmer_name?: string | null;
  farmer_phone?: string | null;
  village?: string | null;
  block?: string | null;
  latitude: number | null;
  longitude: number | null;
  created_at: string;
  updated_at?: string;
  symptoms?: string[] | unknown;
  photo_url?: string | null;
  notes?: string | null;
};

function normalizeRisk(risk: string | null | undefined): "HIGH" | "MEDIUM" | "LOW" {
  if (!risk) return "LOW";
  const up = risk.toUpperCase();
  if (up === "HIGH") return "HIGH";
  if (up === "MEDIUM") return "MEDIUM";
  if (up === "LOW") return "LOW";
  // pending or other -> LOW (green) but we could grey
  if (up === "PENDING") return "LOW";
  return "LOW";
}

function riskStyle(risk: string) {
  const n = normalizeRisk(risk);
  if (n === "HIGH") return { bg: "#dc2626", label: "HIGH", border: "#991b1b", text: "white" };
  if (n === "MEDIUM") return { bg: "#eab308", label: "MEDIUM", border: "#a16207", text: "#422006" };
  return { bg: "#16a34a", label: "LOW", border: "#14532d", text: "white" };
}

function getPinIcon(risk: string, isSelected: boolean) {
  const style = riskStyle(risk);
  const size = isSelected ? 36 : 28;
  const border = isSelected ? `3px solid #111827` : `2px solid ${style.border}`;
  const shadow = isSelected ? "0 0 0 4px rgba(59,130,246,0.4), 0 4px 8px rgba(0,0,0,0.3)" : "0 2px 6px rgba(0,0,0,0.35)";
  const html = `
    <div style="
      width:${size}px;
      height:${size}px;
      background:${style.bg};
      border:${border};
      border-radius:50% 50% 50% 0;
      transform: rotate(-45deg);
      display:flex;
      align-items:center;
      justify-content:center;
      box-shadow:${shadow};
      position:relative;
    ">
      <div style="
        width:${isSelected ? 14 : 10}px;
        height:${isSelected ? 14 : 10}px;
        background:white;
        border-radius:50%;
        transform: rotate(45deg);
        opacity:0.95;
      "></div>
      ${isSelected ? `<div style="position:absolute;inset:-6px;border:2px solid #3b82f6;border-radius:50% 50% 50% 0;transform:rotate(45deg);opacity:0.6;"></div>` : ""}
    </div>
  `;
  return L.divIcon({
    html,
    className: "custom-pin",
    iconSize: [size, size],
    iconAnchor: [size / 2, size],
    popupAnchor: [0, -size],
  });
}

function getClusterIcon(count: number, dominantRisk: string) {
  // Determine dominant color by most severe in cluster
  const style = riskStyle(dominantRisk);
  const size = count > 20 ? 52 : count > 10 ? 46 : count > 5 ? 42 : 38;
  const html = `
    <div style="
      width:${size}px;
      height:${size}px;
      background:${style.bg};
      border:3px solid white;
      border-radius:50%;
      display:flex;
      align-items:center;
      justify-content:center;
      flex-direction:column;
      box-shadow:0 4px 12px rgba(0,0,0,0.35), 0 0 0 3px ${style.border}30;
      color:${style.text};
      font-weight:800;
      font-size:${count > 99 ? 11 : 13}px;
      line-height:1;
      position:relative;
    ">
      <span>${count}</span>
      <span style="font-size:8px;font-weight:600;opacity:0.9;letter-spacing:0.5px">CASES</span>
    </div>
  `;
  return L.divIcon({
    html,
    className: "custom-cluster",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

function getCellSize(zoom: number): number {
  if (zoom <= 5) return 2.0;
  if (zoom === 6) return 1.0;
  if (zoom === 7) return 0.6;
  if (zoom === 8) return 0.3;
  if (zoom === 9) return 0.15;
  if (zoom === 10) return 0.08;
  if (zoom === 11) return 0.04;
  if (zoom === 12) return 0.02;
  if (zoom === 13) return 0.01;
  return 0.005; // 14+ -> tiny, will be bypassed anyway
}

function clusterCases(cases: DashboardCase[], zoom: number) {
  const withCoords = cases.filter((c) => c.latitude != null && c.longitude != null && Number.isFinite(c.latitude) && Number.isFinite(c.longitude));
  if (zoom >= 14) {
    return withCoords.map((c) => ({
      center: [c.latitude as number, c.longitude as number] as [number, number],
      count: 1,
      cases: [c],
      dominantRisk: c.risk_level,
    }));
  }
  const cellSize = getCellSize(zoom);
  const groups = new Map<string, DashboardCase[]>();
  for (const c of withCoords) {
    const lat = c.latitude as number;
    const lng = c.longitude as number;
    const key = `${Math.floor(lat / cellSize)}_${Math.floor(lng / cellSize)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(c);
  }
  const clusters: { center: [number, number]; count: number; cases: DashboardCase[]; dominantRisk: string }[] = [];
  for (const group of groups.values()) {
    const avgLat = group.reduce((s, c) => s + (c.latitude as number), 0) / group.length;
    const avgLng = group.reduce((s, c) => s + (c.longitude as number), 0) / group.length;
    // Determine dominant risk: HIGH > MEDIUM > LOW
    let dominant = "LOW";
    if (group.some((g) => normalizeRisk(g.risk_level) === "HIGH")) dominant = "HIGH";
    else if (group.some((g) => normalizeRisk(g.risk_level) === "MEDIUM")) dominant = "MEDIUM";
    clusters.push({ center: [avgLat, avgLng], count: group.length, cases: group, dominantRisk: dominant });
  }
  return clusters;
}

function ClusteredMarkers({
  cases,
  selectedId,
  onSelect,
}: {
  cases: DashboardCase[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const map = useMap();
  const [zoom, setZoom] = useState<number>(map.getZoom());

  useMapEvents({
    zoomend: () => setZoom(map.getZoom()),
  });

  const clusters = useMemo(() => clusterCases(cases, zoom), [cases, zoom]);

  return (
    <>
      {clusters.map((cluster, idx) => {
        if (cluster.count === 1) {
          const c = cluster.cases[0];
          const isSelected = selectedId === c.id;
          return (
            <Marker
              key={c.id}
              position={[c.latitude as number, c.longitude as number]}
              icon={getPinIcon(c.risk_level, isSelected)}
              eventHandlers={{
                click: () => onSelect(c.id),
              }}
            >
              <Popup maxWidth={300} minWidth={240}>
                <CasePopupContent c={c} />
              </Popup>
            </Marker>
          );
        }
        // Cluster marker
        return (
          <Marker
            key={`cluster-${idx}-${cluster.center[0]}-${cluster.center[1]}`}
            position={cluster.center}
            icon={getClusterIcon(cluster.count, cluster.dominantRisk)}
            eventHandlers={{
              click: () => {
                // Zoom in to cluster
                const nextZoom = Math.min(map.getZoom() + 2, 16);
                map.setView(cluster.center, nextZoom, { animate: true });
              },
            }}
          >
            <Popup maxWidth={320} minWidth={260}>
              <div className="text-sm">
                <div className="font-bold text-gray-900 mb-2 flex items-center justify-between">
                  <span>{cluster.count} cases in this area</span>
                  <span
                    className="text-[10px] px-2 py-0.5 rounded-full border font-semibold"
                    style={{
                      background: riskStyle(cluster.dominantRisk).bg,
                      color: riskStyle(cluster.dominantRisk).text,
                      borderColor: riskStyle(cluster.dominantRisk).border,
                    }}
                  >
                    {cluster.dominantRisk}
                  </span>
                </div>
                <div className="space-y-1.5 max-h-48 overflow-auto pr-1">
                  {cluster.cases.slice(0, 8).map((c) => (
                    <button
                      key={c.id}
                      onClick={() => onSelect(c.id)}
                      className="w-full text-left border rounded-lg px-2.5 py-1.5 hover:bg-gray-50 flex items-center justify-between gap-2"
                    >
                      <span className="flex flex-col">
                        <span className="font-medium text-xs text-gray-900 truncate">{c.farmer_name || "Unknown farmer"} • {c.animal_type}</span>
                        <span className="text-[11px] text-gray-500 truncate">{c.village || "Unknown"} {c.block ? `, ${c.block}` : ""}</span>
                      </span>
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded-full font-bold shrink-0"
                        style={{ background: riskStyle(c.risk_level).bg, color: riskStyle(c.risk_level).text }}
                      >
                        {normalizeRisk(c.risk_level)}
                      </span>
                    </button>
                  ))}
                  {cluster.count > 8 && <div className="text-[11px] text-gray-500 text-center">+{cluster.count - 8} more — zoom in to see</div>}
                </div>
                <div className="text-[11px] text-gray-500 mt-2 text-center">Click cluster to zoom in</div>
              </div>
            </Popup>
          </Marker>
        );
      })}
    </>
  );
}

function CasePopupContent({ c }: { c: DashboardCase }) {
  const style = riskStyle(c.risk_level);
  const symptoms = Array.isArray(c.symptoms) ? (c.symptoms as string[]) : [];
  return (
    <div className="space-y-2 text-sm min-w-[220px]">
      <div className="flex items-center justify-between gap-2">
        <span
          className="px-2 py-0.5 rounded-full text-[11px] font-bold border"
          style={{ background: style.bg, color: style.text, borderColor: style.border }}
        >
          {normalizeRisk(c.risk_level)} RISK
        </span>
        <span className="text-[10px] font-mono text-gray-500">#{c.id.slice(0, 8)}</span>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <div className="text-gray-500 uppercase tracking-wide text-[10px]">Animal</div>
          <div className="font-semibold capitalize">{c.animal_type}</div>
        </div>
        <div>
          <div className="text-gray-500 uppercase tracking-wide text-[10px]">Status</div>
          <div className="font-medium capitalize">{c.status}</div>
        </div>
        <div>
          <div className="text-gray-500 uppercase tracking-wide text-[10px]">Farmer</div>
          <div className="font-medium truncate">{c.farmer_name || "—"}</div>
          {c.farmer_phone && <div className="text-[11px] text-blue-600">{c.farmer_phone}</div>}
        </div>
        <div>
          <div className="text-gray-500 uppercase tracking-wide text-[10px]">Location</div>
          <div className="font-medium truncate">
            {c.village || "Unknown village"}
            {c.block ? `, ${c.block}` : ""}
          </div>
          {c.latitude != null && c.longitude != null && (
            <div className="text-[10px] font-mono text-gray-600">
              {Number(c.latitude).toFixed(4)}, {Number(c.longitude).toFixed(4)}
            </div>
          )}
        </div>
      </div>
      {symptoms.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-wide text-gray-500 mb-1">Symptoms</div>
          <div className="flex flex-wrap gap-1">
            {symptoms.slice(0, 6).map((s, i) => (
              <span key={i} className="px-1.5 py-0.5 bg-gray-100 border rounded-full text-[11px]">
                {s}
              </span>
            ))}
          </div>
        </div>
      )}
      {c.notes && <div className="text-xs text-gray-700 border-t pt-2 line-clamp-2">{c.notes}</div>}
      <div className="text-[11px] text-gray-500 flex justify-between border-t pt-1.5">
        <span>Created {new Date(c.created_at).toLocaleDateString()}</span>
        {c.latitude != null && c.longitude != null && (
          <a
            href={`https://maps.google.com/?q=${c.latitude},${c.longitude}`}
            target="_blank"
            rel="noreferrer"
            className="text-blue-600 hover:underline"
          >
            Open maps ↗
          </a>
        )}
      </div>
    </div>
  );
}

function MapCenterController({ selectedCase }: { selectedCase: DashboardCase | null }) {
  const map = useMap();
  // When selected case changes, fly to it if has coords
  // Use effect via useMap's context - we need useEffect here
  const lat = selectedCase?.latitude;
  const lng = selectedCase?.longitude;
  // Only fly if coords valid and not already centered close
  // Use a simple effect with ref to avoid continuous fly
  // We'll do it imperatively: if selectedCase changes, setView
  // To avoid missing dependency, we use a tiny component that reacts
  if (selectedCase && lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng)) {
    // Check current center distance - if far, fly
    const center = map.getCenter();
    const dist = Math.hypot(center.lat - lat, center.lng - lng);
    if (dist > 0.001) {
      // Use setTimeout to avoid render-phase setView warning
      setTimeout(() => {
        map.flyTo([lat, lng], Math.max(map.getZoom(), 13), { duration: 0.8 });
      }, 0);
    }
  }
  return null;
}

export default function DashboardMap({
  cases,
  selectedCaseId,
  onSelectCase,
}: {
  cases: DashboardCase[];
  selectedCaseId: string | null;
  onSelectCase: (id: string) => void;
}) {
  const validCases = cases.filter((c) => c.latitude != null && c.longitude != null);
  const selectedCase = cases.find((c) => c.id === selectedCaseId) || null;

  // Default center: Maharashtra (Parner area) if cases in Maharashtra, else India center
  // Approx Parner: 19.0 N, 74.44 E. We'll compute average of cases or fallback
  const defaultCenter: [number, number] = useMemo(() => {
    if (validCases.length > 0) {
      const avgLat = validCases.reduce((s, c) => s + (c.latitude as number), 0) / validCases.length;
      const avgLng = validCases.reduce((s, c) => s + (c.longitude as number), 0) / validCases.length;
      // If avg is around Delhi (28N) vs Maharashtra (19N), use computed. Clamp plausible for India 6-36, 67-98
      if (avgLat >= 6 && avgLat <= 36 && avgLng >= 67 && avgLng <= 98) return [avgLat, avgLng];
    }
    return [19.2, 74.6]; // Ahmednagar/Maharashtra default for official dashboard
  }, [validCases]);

  const defaultZoom = validCases.length > 20 ? 7 : validCases.length > 5 ? 8 : validCases.length > 0 ? 10 : 6;

  return (
    <div className="w-full h-full relative">
      <MapContainer
        center={defaultCenter}
        zoom={defaultZoom}
        style={{ height: "100%", width: "100%" }}
        className="z-0"
        scrollWheelZoom={true}
        zoomControl={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <ClusteredMarkers cases={cases} selectedId={selectedCaseId} onSelect={onSelectCase} />
        <MapCenterController selectedCase={selectedCase} />
      </MapContainer>

      {/* Legend overlay */}
      <div className="absolute bottom-3 left-3 z-[400] bg-white/95 backdrop-blur rounded-xl shadow-lg border px-3 py-2.5 text-xs space-y-1.5">
        <div className="font-bold text-gray-900 text-xs tracking-wide">Risk Legend</div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-red-600 border border-red-800 inline-block" /> <span>HIGH</span>
          <span className="w-3 h-3 rounded-full bg-yellow-400 border border-yellow-700 inline-block ml-2" /> <span>MEDIUM</span>
          <span className="w-3 h-3 rounded-full bg-green-600 border border-green-800 inline-block ml-2" /> <span>LOW</span>
        </div>
        <div className="text-[11px] text-gray-600 pt-1 border-t">● Cluster shows case count — click to zoom</div>
      </div>

      {/* Count badge */}
      <div className="absolute top-3 left-3 z-[400] bg-white/95 backdrop-blur rounded-full shadow border px-3 py-1.5 text-xs font-semibold text-gray-800">
        {validCases.length} on map • {cases.length - validCases.length > 0 ? `${cases.length - validCases.length} without GPS` : "All geolocated"}
      </div>
    </div>
  );
}
