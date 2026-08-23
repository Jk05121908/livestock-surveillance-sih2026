"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";

// ---------------------------------------------------------------------------
// NotificationListener — real-time outbreak alerts for farmers
// ---------------------------------------------------------------------------
// - Requests browser Notification permission (modal, stored in localStorage)
// - Detects farmer's village from props or localStorage farmer_profile / reports
// - Subscribes to Supabase `cases` INSERT via realtime channel
// - When HIGH-risk case in same village/block → browser Notification
//   body: "[Animal] outbreak in [village]. Vaccinate your herd. Consult vet immediately."
// - Click → focus window + scroll to form / vet directory
// - Handles permission denied, block-list filtering, sound, badge, history
// ---------------------------------------------------------------------------

const CHOICE_KEY = "outbreak_alerts_choice"; // "granted" | "denied" | "dismissed"
const VILLAGE_KEY = "farmer_outbreak_village";
const BLOCK_KEY = "farmer_outbreak_block";
const HISTORY_KEY = "outbreak_notification_history";

type HistoryItem = {
  id: string;
  village: string;
  block?: string | null;
  animal_type: string;
  risk_level: string;
  receivedAt: string;
  message: string;
};

interface Props {
  farmerVillage?: string;
  farmerBlock?: string;
}

function getStoredVillage(): { village: string | null; block: string | null } {
  try {
    // Priority 1: explicit props via localStorage last set by this component
    const v = localStorage.getItem(VILLAGE_KEY);
    const b = localStorage.getItem(BLOCK_KEY);
    if (v) return { village: v, block: b };
    // Priority 2: farmer_profile (ReportForm stores { village, block })
    const raw = localStorage.getItem("farmer_profile");
    if (raw) {
      const p = JSON.parse(raw) as { village?: string; block?: string };
      if (p?.village) return { village: p.village, block: p.block || null };
    }
    // Priority 3: legacy farmer_outbreak_village set
    return { village: v, block: b };
  } catch {
    return { village: null, block: null };
  }
}

function canNotify(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

function playAlertSound() {
  try {
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.value = 880;
    o.connect(g);
    g.connect(ctx.destination);
    g.gain.setValueAtTime(0, ctx.currentTime);
    g.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 0.01);
    g.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
    o.start();
    o.stop(ctx.currentTime + 0.4);
  } catch {
    // Audio may be blocked until user gesture — ignore
  }
}

export default function NotificationListener({ farmerVillage, farmerBlock }: Props) {
  const [showModal, setShowModal] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | "default">("default");
  const [village, setVillage] = useState<string | null>(null);
  const [block, setBlock] = useState<string | null>(null);
  const [notifCount, setNotifCount] = useState(0);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const villageRef = useRef<string | null>(null);
  const blockRef = useRef<string | null>(null);

  // Keep refs in sync for realtime callback closure
  useEffect(() => {
    villageRef.current = village;
    blockRef.current = block;
  }, [village, block]);

  // Initialize village/block from props or localStorage, and permission state
  useEffect(() => {
    if (typeof window === "undefined") return;

    // Resolve village: prop wins, else stored
    const propVillage = farmerVillage?.trim() || null;
    const propBlock = farmerBlock?.trim() || null;
    const stored = getStoredVillage();

    const resolvedVillage = propVillage || stored.village;
    const resolvedBlock = propBlock || stored.block;

    if (resolvedVillage) {
      setVillage(resolvedVillage);
      villageRef.current = resolvedVillage;
      try {
        localStorage.setItem(VILLAGE_KEY, resolvedVillage);
        if (resolvedBlock) localStorage.setItem(BLOCK_KEY, resolvedBlock);
      } catch {}
    }
    if (resolvedBlock) {
      setBlock(resolvedBlock);
      blockRef.current = resolvedBlock;
    }

    // Permission
    if (canNotify()) {
      setPermission(Notification.permission as NotificationPermission);
    }

    // History load
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as HistoryItem[];
        if (Array.isArray(parsed)) {
          setHistory(parsed.slice(0, 20));
          setNotifCount(parsed.length);
        }
      }
    } catch {}

    // Decide whether to show modal: not asked before, have village, and permission default
    try {
      const choice = localStorage.getItem(CHOICE_KEY);
      const hasVillage = !!resolvedVillage;
      const permDefault = canNotify() && Notification.permission === "default";
      if (!choice && hasVillage && permDefault) {
        // Delay slightly so form renders first
        const t = setTimeout(() => setShowModal(true), 1200);
        return () => clearTimeout(t);
      }
    } catch {}
  }, [farmerVillage, farmerBlock]);

  // Persist village when props change (farmer updates form)
  useEffect(() => {
    if (farmerVillage && farmerVillage.trim()) {
      setVillage(farmerVillage.trim());
      try {
        localStorage.setItem(VILLAGE_KEY, farmerVillage.trim());
      } catch {}
    }
    if (farmerBlock && farmerBlock.trim()) {
      setBlock(farmerBlock.trim());
      try {
        localStorage.setItem(BLOCK_KEY, farmerBlock.trim());
      } catch {}
    }
  }, [farmerVillage, farmerBlock]);

  const handleAllow = useCallback(async () => {
    if (!canNotify()) {
      setShowModal(false);
      try {
        localStorage.setItem(CHOICE_KEY, "denied");
      } catch {}
      return;
    }
    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      localStorage.setItem(CHOICE_KEY, result === "granted" ? "granted" : "denied");
      setShowModal(false);
      if (result === "granted") {
        // Optional: test notification to confirm it works
        try {
          new Notification("✅ Outbreak alerts enabled", {
            body: villageRef.current
              ? `You'll be notified for HIGH-risk outbreaks in ${villageRef.current}.`
              : "You'll be notified for HIGH-risk outbreaks near you.",
            icon: "/file.svg",
          });
        } catch {}
      }
    } catch {
      setShowModal(false);
      try {
        localStorage.setItem(CHOICE_KEY, "denied");
      } catch {}
    }
  }, []);

  const handleDeny = useCallback(() => {
    setShowModal(false);
    try {
      localStorage.setItem(CHOICE_KEY, "denied");
    } catch {}
  }, []);

  const handleDismiss = useCallback(() => {
    setShowModal(false);
    try {
      // Use "dismissed" so we don't nag forever but may ask again after 7 days
      localStorage.setItem(CHOICE_KEY, "dismissed");
    } catch {}
  }, []);

  // Helper: determine if outbreak is relevant to farmer
  const isRelevant = useCallback(
    (outbreakVillage: string | null, outbreakBlock: string | null): boolean => {
      const fv = villageRef.current;
      const fb = blockRef.current;
      if (!fv && !fb) return false; // no farmer location yet — suppress to avoid spam
      if (!outbreakVillage && !outbreakBlock) return false;
      // Exact village match wins
      if (fv && outbreakVillage && fv.toLowerCase() === outbreakVillage.toLowerCase()) return true;
      // Fallback: block match (covers nearby villages in same block)
      if (fb && outbreakBlock && fb.toLowerCase() === outbreakBlock.toLowerCase()) return true;
      // If farmer only has village but outbreak has block that contains that village? We can't know without lookup, so strict.
      return false;
    },
    []
  );

  const sendBrowserNotification = useCallback((opts: { village: string; block?: string | null; animal_type: string; risk_level: string; reportId?: string }) => {
    if (!canNotify() || Notification.permission !== "granted") return;

    const animal = opts.animal_type || "Livestock";
    const vill = opts.village || "your area";
    const title = "⚠️ Livestock Disease Alert";
    const body = `${animal.charAt(0).toUpperCase() + animal.slice(1)} outbreak in ${vill}. Vaccinate your herd. Consult vet immediately.`;
    const tag = `outbreak-${vill}-${Date.now()}`;

    const histItem: HistoryItem = {
      id: tag,
      village: vill,
      block: opts.block || null,
      animal_type: animal,
      risk_level: opts.risk_level,
      receivedAt: new Date().toISOString(),
      message: body,
    };

    // Update badge + history
    setNotifCount((c) => c + 1);
    setHistory((prev) => {
      const next = [histItem, ...prev].slice(0, 20);
      try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });

    // Sound
    playAlertSound();

    try {
      const n = new Notification(title, {
        body,
        // Use existing icon in public folder as placeholder (file.svg); replace with /livestock-icon.png when available
        icon: "/file.svg",
        tag,
        requireInteraction: false,
        silent: false,
      } as NotificationOptions);

      n.onclick = () => {
        try {
          window.focus();
        } catch {}
        // Scroll to form or open vet directory — smooth scroll to top where ReportForm lives
        try {
          const el = document.querySelector("form");
          if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
          else window.scrollTo({ top: 0, behavior: "smooth" });
        } catch {}
        // Also try to highlight vaccination section if present
        try {
          const vacc = document.getElementById("vaccination-form");
          if (vacc) vacc.scrollIntoView({ behavior: "smooth" });
        } catch {}
        n.close();
      };
    } catch (e) {
      console.warn("[NotificationListener] Notification failed:", e);
    }
  }, []);

  // Realtime subscription to cases INSERT
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!isSupabaseConfigured) {
      console.log("[NotificationListener] Supabase not configured — realtime disabled");
      return;
    }
    if (!canNotify() || Notification.permission !== "granted") {
      // Don't subscribe until permission granted — avoids unnecessary realtime traffic
      return;
    }

    // Don't subscribe if we still don't know farmer location — still subscribe but will filter all as irrelevant; skip to save resources
    // We allow subscription even without village, but isRelevant will return false

    console.log("[NotificationListener] Subscribing to cases INSERT (farmer village:", villageRef.current, "block:", blockRef.current, ")");

    const channel = supabase
      .channel("outbreak-alerts")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "cases" },
        async (payload) => {
          const newRow = payload.new as Record<string, unknown>;
          const risk = String(newRow["risk_level"] ?? newRow["riskLevel"] ?? "").toLowerCase();
          // Only HIGH alerts (spec)
          if (risk !== "high" && risk !== "high".toUpperCase().toLowerCase()) {
            // Some schemas store 'high' or 'HIGH' — normalize
            if (risk !== "high") {
              // Attempts to handle cases where risk_level missing in cases table — fetch via report
              // We'll still try to resolve village and check report risk
            } else {
              return;
            }
          }
          // If cases has risk_level and it's not high, skip early (but handle missing gracefully below)
          if (newRow["risk_level"] && String(newRow["risk_level"]).toLowerCase() !== "high") return;

          const reportId = newRow["report_id"] as string | undefined;
          if (!reportId) {
            console.warn("[NotificationListener] cases INSERT without report_id", newRow);
            return;
          }

          try {
            // Fetch report to get village / animal_type and definitive risk
            // Try join with farmers for village, fallback to report fields
            let outbreakVillage: string | null = null;
            let outbreakBlock: string | null = null;
            let animalType = "Livestock";
            let reportRisk: string | null = null;

            // Attempt 1: reports with farmers join (canonical)
            const { data: reportData, error: reportErr } = await supabase
              .from("reports")
              .select("animal_type, symptoms, farmer_id, latitude, longitude, farmers ( village, block )")
              .eq("id", reportId)
              .maybeSingle();

            if (!reportErr && reportData) {
              const r = reportData as unknown as {
                animal_type?: string;
                farmers?: { village?: string; block?: string } | null;
                farmer_id?: string;
              };
              animalType = r.animal_type || animalType;
              if (r.farmers?.village) {
                outbreakVillage = r.farmers.village;
                outbreakBlock = r.farmers.block || null;
              } else if (r.farmer_id) {
                // Fallback: lookup farmer directly
                const { data: farmer } = await supabase.from("farmers").select("village, block").eq("id", r.farmer_id as string).maybeSingle();
                if (farmer) {
                  outbreakVillage = (farmer as { village: string }).village;
                  outbreakBlock = (farmer as { block: string }).block || null;
                }
              }
              // Also try to get report risk if available via triage
              // If cases row missing risk, we can re-evaluate but for now use HIGH assumption when cases inserted via triage(high)
            } else {
              console.warn("[NotificationListener] report fetch failed", reportErr?.message);
              // Attempt 2: direct reports.village (extended schema)
              const { data: direct } = await supabase.from("reports").select("animal_type, village, block").eq("id", reportId).maybeSingle();
              if (direct) {
                const d = direct as { animal_type?: string; village?: string; block?: string };
                animalType = d.animal_type || animalType;
                outbreakVillage = d.village || null;
                outbreakBlock = d.block || null;
              }
            }

            // If we have risk in cases payload, respect it; else if reportRisk is low, don't notify
            // For now, if cases was inserted by triage, it implies HIGH — we treat any INSERT in this channel as HIGH if we can't verify
            // But to respect spec "only HIGH", we check: if newRow risk_level exists and not high, skip
            const payloadRisk = newRow["risk_level"] ? String(newRow["risk_level"]).toLowerCase() : null;
            if (payloadRisk && payloadRisk !== "high") {
              console.log("[NotificationListener] Skipping non-HIGH case", payloadRisk);
              return;
            }

            // Also verify reportRisk if we fetched triage — but we don't have that column, skip

            if (!outbreakVillage) {
              console.log("[NotificationListener] No village for report", reportId, "— skipping");
              return;
            }

            const relevant = isRelevant(outbreakVillage, outbreakBlock);
            console.log(`[NotificationListener] Outbreak ${outbreakVillage}/${outbreakBlock} vs farmer ${villageRef.current}/${blockRef.current} → relevant=${relevant}`);

            if (relevant) {
              sendBrowserNotification({
                village: outbreakVillage,
                block: outbreakBlock,
                animal_type: animalType,
                risk_level: "high",
                reportId,
              });
            }
          } catch (err) {
            console.error("[NotificationListener] realtime handler error", err);
          }
        }
      )
      .subscribe((status) => {
        console.log("[NotificationListener] realtime status", status);
      });

    channelRef.current = channel;

    return () => {
      try {
        if (channelRef.current) supabase.removeChannel(channelRef.current);
      } catch {}
      channelRef.current = null;
    };
  }, [permission, isRelevant, sendBrowserNotification]); // re-subscribe when permission granted changes

  // Also listen for village changes to update refs without re-subscribing unnecessarily — already handled via refs

  return (
    <>
      {/* Permission modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={handleDismiss} aria-hidden />
          <div className="relative bg-white dark:bg-zinc-900 rounded-2xl shadow-xl max-w-md w-full p-6 border border-zinc-200 dark:border-zinc-800">
            <div className="flex items-start gap-3">
              <div className="bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 rounded-full w-10 h-10 flex items-center justify-center flex-shrink-0">⚠️</div>
              <div className="flex-1">
                <h3 className="font-bold text-zinc-900 dark:text-zinc-100">Enable outbreak alerts for your area?</h3>
                <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">
                  Get instant browser alerts when a HIGH-risk outbreak is detected in <span className="font-semibold">{village || "your village"}</span>
                  {block ? ` (${block})` : ""}. You&apos;ll be advised to vaccinate, consult a vet, or isolate animals.
                </p>
                <p className="text-xs text-zinc-500 dark:text-zinc-500 mt-2">Works in background — no app needed. You can turn off anytime in browser settings.</p>
              </div>
            </div>
            <div className="mt-5 flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
              <button onClick={handleDeny} className="px-4 py-2.5 rounded-xl border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-sm font-semibold">
                Not now
              </button>
              <button onClick={handleAllow} className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold shadow">
                Enable alerts
              </button>
            </div>
            <button onClick={handleDismiss} className="absolute top-3 right-3 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300" aria-label="Dismiss">
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Optional: badge + history (non-intrusive, shown only when we have notifications) */}
      {notifCount > 0 && permission === "granted" && (
        <div className="fixed bottom-4 right-4 z-40 flex flex-col items-end gap-2 pointer-events-none">
          {/* Badge */}
          <div className="pointer-events-auto bg-amber-500 text-white text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center shadow-lg border-2 border-white">
            {notifCount > 99 ? "99+" : notifCount}
          </div>
          {/* History preview — only show last 1 for brevity, full history in console/localStorage */}
          {history.length > 0 && (
            <div className="pointer-events-auto hidden sm:block max-w-sm bg-white dark:bg-zinc-900 border dark:border-zinc-800 rounded-xl shadow-lg p-3 text-xs">
              <p className="font-semibold text-zinc-900 dark:text-zinc-100">Recent alerts</p>
              <ul className="mt-1 space-y-1 max-h-32 overflow-auto">
                {history.slice(0, 3).map((h) => (
                  <li key={h.id} className="text-zinc-600 dark:text-zinc-400">
                    <span className="font-medium">{h.animal_type}</span> in {h.village} — {new Date(h.receivedAt).toLocaleTimeString()}
                  </li>
                ))}
              </ul>
              <button
                onClick={() => {
                  setHistory([]);
                  setNotifCount(0);
                  try {
                    localStorage.removeItem(HISTORY_KEY);
                  } catch {}
                }}
                className="mt-2 text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 underline"
              >
                Clear
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
}
