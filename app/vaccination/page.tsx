"use client";

import { useEffect, useState, useRef } from "react";
import { createClient } from "../../lib/supabase";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type FarmerOption = {
  id: string;
  name: string;
  village: string;
  block: string;
  district?: string;
  phone?: string;
};

const VACCINE_TYPES = ["FMD", "mastitis", "brucellosis", "anthrax"] as const;
type VaccineType = typeof VACCINE_TYPES[number];

const VILLAGES = [
  "Hiware Bazar",
  "Ralegan Siddhi",
  "Shani Shingnapur",
  "Kolhewadi",
  "Takali Dhokeshwar",
] as const;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function VaccinationPage() {
  const supabase = createClient();

  // Form state
  const [farmerQuery, setFarmerQuery] = useState("");
  const [farmerOptions, setFarmerOptions] = useState<FarmerOption[]>([]);
  const [selectedFarmer, setSelectedFarmer] = useState<FarmerOption | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [animalId, setAnimalId] = useState("");
  const [vaccineType, setVaccineType] = useState<VaccineType | "">("");
  const [date, setDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [notes, setNotes] = useState("");
  const [villageOverride, setVillageOverride] = useState("");
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const dropdownRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  // Autocomplete: search farmers table via ilike
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    // If user has selected a farmer and query matches selection, don't search
    if (selectedFarmer && farmerQuery === `${selectedFarmer.name} (${selectedFarmer.id.slice(0, 8)})`) {
      setFarmerOptions([]);
      return;
    }

    if (!farmerQuery.trim() || farmerQuery.length < 2) {
      setFarmerOptions([]);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        // Search by name OR id prefix
        const { data, error } = await supabase
          .from("farmers")
          .select("id, name, village, block, district, phone")
          .or(`name.ilike.%${farmerQuery}%,id.ilike.%${farmerQuery}%`)
          .limit(8);

        if (error) {
          console.error("[vaccination] farmer search error:", error.message);
          setFarmerOptions([]);
        } else {
          setFarmerOptions((data as unknown as FarmerOption[]) || []);
          setShowDropdown(true);
        }
      } catch (err) {
        console.error(err);
        setFarmerOptions([]);
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [farmerQuery, selectedFarmer, supabase]);

  function handleSelectFarmer(f: FarmerOption) {
    setSelectedFarmer(f);
    setFarmerQuery(`${f.name} (${f.id.slice(0, 8)})`);
    setVillageOverride(f.village);
    setShowDropdown(false);
    setMessage(null);
  }

  function clearFarmer() {
    setSelectedFarmer(null);
    setFarmerQuery("");
    setVillageOverride("");
    setFarmerOptions([]);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);

    if (!selectedFarmer) {
      setMessage({ type: "error", text: "Please select a farmer from the autocomplete list." });
      return;
    }
    if (!animalId.trim()) {
      setMessage({ type: "error", text: "Animal ID is required." });
      return;
    }
    if (!vaccineType) {
      setMessage({ type: "error", text: "Please select a vaccine type." });
      return;
    }
    if (!date) {
      setMessage({ type: "error", text: "Date is required." });
      return;
    }
    // Prevent future dates
    const today = new Date().toISOString().split("T")[0];
    if (date > today) {
      setMessage({ type: "error", text: "Vaccination date cannot be in the future." });
      return;
    }

    setLoading(true);
    try {
      // Derive village/block/district from selected farmer (or override if edited)
      const village = villageOverride || selectedFarmer.village;
      const block = selectedFarmer.block;
      const district = selectedFarmer.district || "Ahmednagar";

      // Extended schema includes village/block/district for fast heatmap queries;
      // canonical schema (supabase/schema.sql) does not — fallback gracefully.
      const fullPayload = {
        farmer_id: selectedFarmer.id,
        animal_id: animalId.trim(),
        vaccine_type: vaccineType,
        village,
        block,
        district,
        date,
        notes: notes.trim() || null,
      };
      const minimalPayload = {
        farmer_id: selectedFarmer.id,
        animal_id: animalId.trim(),
        vaccine_type: vaccineType,
        date,
        notes: notes.trim() || null,
      };

      let { error } = await supabase.from("vaccinations").insert(fullPayload as never);

      // If extended columns missing (canonical schema), retry with minimal payload
      if (error && /column|does not exist|42703|schema cache/i.test(error.message)) {
        console.warn("[vaccination] extended columns missing, retrying minimal insert:", error.message);
        const retry = await supabase.from("vaccinations").insert(minimalPayload as never);
        error = retry.error as typeof error;
      }

      if (error) throw error;

      setMessage({
        type: "success",
        text: `✓ Vaccination logged: ${vaccineType} for ${animalId.trim()} (Farmer ${selectedFarmer.name}, ${village}) on ${date}.`,
      });

      // Reset animal-specific fields but keep farmer for quick batch entry
      setAnimalId("");
      setNotes("");
      // Keep vaccineType/date for convenience? Reset vaccineType to encourage intentional.
      // setVaccineType("");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : typeof err === "object" && err !== null && "message" in err ? String((err as { message: string }).message) : String(err);
      console.error("[vaccination] insert error:", msg);
      setMessage({ type: "error", text: `Failed to log vaccination: ${msg}` });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="mx-auto max-w-2xl">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Log Vaccination</h1>
          <p className="mt-1 text-sm text-gray-600">
            Record a new vaccination for a farmer&apos;s animal. Fields map directly to the{" "}
            <code className="rounded bg-gray-100 px-1 py-0.5">vaccinations</code> table.
          </p>
        </div>

        {/* Message */}
        {message && (
          <div
            className={`mb-4 rounded-lg border px-4 py-3 text-sm ${
              message.type === "success"
                ? "border-green-200 bg-green-50 text-green-800"
                : "border-red-200 bg-red-50 text-red-800"
            }`}
            role="alert"
          >
            {message.text}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="rounded-xl border bg-white p-6 shadow-sm">
          {/* Farmer lookup */}
          <div className="mb-5" ref={dropdownRef}>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Farmer ID or Name <span className="text-red-500">*</span>
            </label>
            <p className="mb-2 text-xs text-gray-500">Type at least 2 characters to search farmers table (autocomplete).</p>
            <div className="relative">
              <input
                type="text"
                value={farmerQuery}
                onChange={(e) => {
                  setFarmerQuery(e.target.value);
                  if (selectedFarmer) setSelectedFarmer(null);
                }}
                onFocus={() => farmerQuery.length >= 2 && setShowDropdown(true)}
                placeholder="Search by farmer name or ID (e.g. Ramesh, f00f...)"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 pr-10 text-sm focus:border-green-600 focus:outline-none focus:ring-2 focus:ring-green-100"
                autoComplete="off"
              />
              <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                {searching ? (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-green-600 inline-block" />
                ) : (
                  "⌕"
                )}
              </div>

              {showDropdown && farmerOptions.length > 0 && (
                <ul className="absolute z-10 mt-1 max-h-56 w-full overflow-auto rounded-lg border bg-white shadow-lg">
                  {farmerOptions.map((f) => (
                    <li
                      key={f.id}
                      onClick={() => handleSelectFarmer(f)}
                      className="cursor-pointer px-3 py-2 hover:bg-green-50"
                    >
                      <div className="text-sm font-medium text-gray-900">{f.name}</div>
                      <div className="text-xs text-gray-500">
                        {f.village} • {f.block} • {f.id.slice(0, 8)} {f.phone ? `• ${f.phone}` : ""}
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              {showDropdown && farmerQuery.length >= 2 && farmerOptions.length === 0 && !searching && (
                <div className="absolute z-10 mt-1 w-full rounded-lg border bg-white px-3 py-3 text-sm text-gray-500 shadow-lg">
                  No farmers found for &quot;{farmerQuery}&quot;. Check spelling or seed farmers table.
                </div>
              )}
            </div>

            {selectedFarmer && (
              <div className="mt-2 flex items-center justify-between rounded-lg border border-green-200 bg-green-50 px-3 py-2">
                <div>
                  <div className="text-sm font-medium text-green-900">{selectedFarmer.name}</div>
                  <div className="text-xs text-green-700">
                    {selectedFarmer.village} • {selectedFarmer.block} • ID {selectedFarmer.id}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={clearFarmer}
                  className="rounded px-2 py-1 text-xs font-medium text-green-700 hover:bg-green-100"
                >
                  Clear
                </button>
              </div>
            )}
          </div>

          {/* Village override (auto-filled from farmer) */}
          {selectedFarmer && (
            <div className="mb-5">
              <label className="mb-1 block text-sm font-medium text-gray-700">Village (auto-filled)</label>
              <select
                value={villageOverride}
                onChange={(e) => setVillageOverride(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-green-600 focus:outline-none focus:ring-2 focus:ring-green-100"
              >
                {VILLAGES.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-gray-500">Derived from farmer record; override if animal is in different village.</p>
            </div>
          )}

          {/* Animal ID */}
          <div className="mb-5">
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Animal ID <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={animalId}
              onChange={(e) => setAnimalId(e.target.value)}
              placeholder="e.g. BOV-1234, BUF-5678, GOAT-9012"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-green-600 focus:outline-none focus:ring-2 focus:ring-green-100"
            />
          </div>

          {/* Vaccine type */}
          <div className="mb-5">
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Vaccine Type <span className="text-red-500">*</span>
            </label>
            <select
              value={vaccineType}
              onChange={(e) => setVaccineType(e.target.value as VaccineType)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-green-600 focus:outline-none focus:ring-2 focus:ring-green-100"
            >
              <option value="">Select vaccine</option>
              {VACCINE_TYPES.map((v) => (
                <option key={v} value={v}>
                  {v.toUpperCase()} — {v}
                </option>
              ))}
            </select>
          </div>

          {/* Date */}
          <div className="mb-5">
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Date <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              max={new Date().toISOString().split("T")[0]}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-green-600 focus:outline-none focus:ring-2 focus:ring-green-100"
            />
          </div>

          {/* Notes */}
          <div className="mb-6">
            <label className="mb-1 block text-sm font-medium text-gray-700">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional: batch no, vet name, observations..."
              rows={3}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-green-600 focus:outline-none focus:ring-2 focus:ring-green-100"
            />
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-green-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Submitting…" : "Log Vaccination"}
          </button>

          <p className="mt-3 text-center text-xs text-gray-500">
            Inserts into <code className="rounded bg-gray-100 px-1">vaccinations</code> — ensure Supabase env is set.
          </p>
        </form>

        {/* Help card */}
        <div className="mt-6 rounded-lg border bg-white p-4 text-xs text-gray-600">
          <div className="font-medium text-gray-800">Seed hint</div>
          <div className="mt-1">
            If autocomplete shows no farmers, run <code className="rounded bg-gray-100 px-1">npx tsx scripts/seed-vaccinations.ts</code> then import{" "}
            <code className="rounded bg-gray-100 px-1">seed-data/seed.sql</code> in Supabase SQL Editor.
          </div>
        </div>
      </div>
    </div>
  );
}
