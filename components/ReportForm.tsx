/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import {
  Farmer,
  AnimalType,
  Symptom,
  ANIMAL_TYPES,
  SYMPTOMS,
  QueuedReport,
} from "@/lib/types";
import {
  addToOfflineQueue,
  getOfflineQueue,
  removeFromOfflineQueue,
  fileToBase64,
  base64ToBlob,
} from "@/lib/offline-queue";
import { useLanguage } from "@/lib/language-context";

const FARMER_KEY = "farmer_profile";

export default function ReportForm() {
  const { t, lang } = useLanguage();

  // Farmer profile
  const [farmer, setFarmer] = useState<Farmer>({
    id: "",
    name: "",
    phone: "",
    village: "",
    block: "",
    herdSize: 0,
  });

  // Report fields
  const [animalType, setAnimalType] = useState<AnimalType | "">("");
  const [symptoms, setSymptoms] = useState<Symptom[]>([]);
  const [notes, setNotes] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);

  // UI state
  const [gpsStatus, setGpsStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [photoUploadError, setPhotoUploadError] = useState<string | null>(null);
  const [queuedCount, setQueuedCount] = useState(0);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const captureGps = useCallback(() => {
    if (!navigator.geolocation) {
      setGpsStatus("error");
      setGpsError("Geolocation not supported");
      return;
    }
    setGpsStatus("loading");
    setGpsError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLatitude(pos.coords.latitude);
        setLongitude(pos.coords.longitude);
        setGpsStatus("success");
      },
      (err) => {
        setGpsStatus("error");
        setGpsError(err.message);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  }, []);

  const uploadPhoto = async (file: File): Promise<string | null> => {
    if (!isSupabaseConfigured) throw new Error(t("supabaseMissing"));
    const ext = file.name.split(".").pop() || "jpg";
    const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const { error: uploadError } = await supabase.storage.from("report-photos").upload(path, file, {
      cacheControl: "3600",
      upsert: false,
    });
    if (uploadError) throw uploadError;
    const { data } = supabase.storage.from("report-photos").getPublicUrl(path);
    return data.publicUrl;
  };

  const insertReport = async (payload: Omit<import("@/lib/types").Report, "id">) => {
    if (!isSupabaseConfigured) throw new Error(t("supabaseMissing"));
    const { error: insertError } = await supabase.from("reports").insert([
      {
        farmer_id: payload.farmer_id,
        animal_type: payload.animal_type,
        symptoms: payload.symptoms,
        notes: payload.notes,
        photo_url: payload.photo_url,
        latitude: payload.latitude,
        longitude: payload.longitude,
        created_at: new Date().toISOString(),
      },
    ]);
    if (insertError) throw insertError;
  };

  const retryQueuedReports = useCallback(async () => {
    const queue = getOfflineQueue();
    if (queue.length === 0) return;
    if (!navigator.onLine) {
      setError(t("offline"));
      return;
    }
    if (!isSupabaseConfigured) {
      setError(t("supabaseMissing"));
      return;
    }
    setIsSubmitting(true);
    setError(null);
    setSuccess(null);
    let successCount = 0;
    for (const item of [...queue]) {
      try {
        let photo_url = item.payload.photo_url;
        if (item.photoBase64 && !photo_url) {
          const blob = base64ToBlob(item.photoBase64);
          const file = new File([blob], item.photoFileName || "photo.jpg", { type: blob.type });
          photo_url = await uploadPhoto(file);
        }
        await insertReport({ ...item.payload, photo_url });
        removeFromOfflineQueue(item.id);
        successCount++;
      } catch {
        const q = getOfflineQueue();
        const idx = q.findIndex((x) => x.id === item.id);
        if (idx !== -1) {
          q[idx].attempts += 1;
          localStorage.setItem("offline_reports", JSON.stringify(q));
        }
      }
    }
    setQueuedCount(getOfflineQueue().length);
    setIsSubmitting(false);
    if (successCount > 0) setSuccess(`${successCount} ${t("queuedCount")} ${lang === "hi" ? "भेजी गई" : "submitted"}`);
    if (getOfflineQueue().length > 0 && successCount === 0) setError("Retry failed — check connection");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang, t]);

  // Load farmer + online + queue on mount
  useEffect(() => {
    setIsOnline(typeof navigator !== "undefined" ? navigator.onLine : true);

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    try {
      const raw = localStorage.getItem(FARMER_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Farmer;
        setFarmer({
          id: parsed.id || crypto.randomUUID(),
          name: parsed.name || "",
          phone: parsed.phone || "",
          village: parsed.village || "",
          block: parsed.block || "",
          herdSize: parsed.herdSize || 0,
        });
      } else {
        setFarmer((prev) => ({ ...prev, id: crypto.randomUUID() }));
      }
    } catch {
      setFarmer((prev) => ({ ...prev, id: crypto.randomUUID() }));
    }

    setQueuedCount(getOfflineQueue().length);
    captureGps();
    if (navigator.onLine) {
      retryQueuedReports();
    }

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-save farmer to localStorage
  useEffect(() => {
    if (!farmer.id) return;
    try {
      localStorage.setItem(FARMER_KEY, JSON.stringify(farmer));
    } catch {}
  }, [farmer]);

  // Photo preview
  useEffect(() => {
    if (!photoFile) {
      setPhotoPreview(null);
      return;
    }
    const url = URL.createObjectURL(photoFile);
    setPhotoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photoFile]);

  const toggleSymptom = (s: Symptom) => {
    setSymptoms((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  };

  const validate = (): string | null => {
    if (!farmer.name.trim() || !farmer.phone.trim() || !farmer.village.trim() || !farmer.block.trim()) {
      return t("validation");
    }
    if (!farmer.herdSize || farmer.herdSize <= 0) return t("validation");
    if (!animalType) return t("validation");
    if (symptoms.length === 0) return t("validation");
    if (latitude === null || longitude === null) return t("validation");
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setPhotoUploadError(null);

    const v = validate();
    if (v) {
      setError(v);
      return;
    }

    const farmerId = farmer.id || crypto.randomUUID();
    if (!farmer.id) setFarmer((prev) => ({ ...prev, id: farmerId }));

    setIsSubmitting(true);

    let photo_url: string | null = null;

    if (photoFile) {
      try {
        photo_url = await uploadPhoto(photoFile);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Photo upload failed";
        setPhotoUploadError(msg);
        setIsSubmitting(false);
        try {
          const base64 = await fileToBase64(photoFile);
          const queued: QueuedReport = {
            id: crypto.randomUUID(),
            payload: {
              farmer_id: farmerId,
              animal_type: animalType as AnimalType,
              symptoms,
              notes,
              photo_url: null,
              latitude,
              longitude,
            },
            photoBase64: base64,
            photoFileName: photoFile.name,
            timestamp: new Date().toISOString(),
            attempts: 0,
          };
          addToOfflineQueue(queued);
          setQueuedCount(getOfflineQueue().length);
          setError(`${msg} — ${t("queued")}`);
        } catch {}
        return;
      }
    }

    const payload = {
      farmer_id: farmerId,
      animal_type: animalType as AnimalType,
      symptoms,
      notes,
      photo_url,
      latitude,
      longitude,
    };

    if (!navigator.onLine) {
      try {
        let base64: string | null = null;
        if (photoFile) base64 = await fileToBase64(photoFile);
        const queued: QueuedReport = {
          id: crypto.randomUUID(),
          payload,
          photoBase64: base64,
          photoFileName: photoFile?.name || null,
          timestamp: new Date().toISOString(),
          attempts: 0,
        };
        addToOfflineQueue(queued);
        setQueuedCount(getOfflineQueue().length);
        setSuccess(t("queued"));
        setAnimalType("");
        setSymptoms([]);
        setNotes("");
        setPhotoFile(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
      } catch {
        setError("Failed to queue offline");
      }
      setIsSubmitting(false);
      return;
    }

    try {
      await insertReport(payload);
      setSuccess(t("success"));
      setAnimalType("");
      setSymptoms([]);
      setNotes("");
      setPhotoFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setPhotoUploadError(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Submission failed";
      try {
        let base64: string | null = null;
        if (photoFile) base64 = await fileToBase64(photoFile);
        const queued: QueuedReport = {
          id: crypto.randomUUID(),
          payload,
          photoBase64: base64,
          photoFileName: photoFile?.name || null,
          timestamp: new Date().toISOString(),
          attempts: 0,
        };
        addToOfflineQueue(queued);
        setQueuedCount(getOfflineQueue().length);
        setError(`${msg} — ${t("queued")}`);
      } catch {
        setError(msg);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPhotoUploadError(null);
    const f = e.target.files?.[0] || null;
    setPhotoFile(f);
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="w-full max-w-2xl mx-auto bg-white dark:bg-zinc-900 rounded-2xl shadow-lg p-4 sm:p-6 space-y-6"
    >
      {/* Offline indicator */}
      {!isOnline && (
        <div className="bg-amber-100 border border-amber-300 text-amber-900 dark:bg-amber-900/30 dark:border-amber-700 dark:text-amber-100 rounded-xl p-3 text-center font-medium">
          {t("offline")}
        </div>
      )}
      {isOnline && queuedCount > 0 && (
        <div className="bg-blue-50 border border-blue-200 text-blue-900 dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-100 rounded-xl p-3 flex items-center justify-between gap-2">
          <span className="font-medium">
            {queuedCount} {t("queuedCount")}
          </span>
          <button
            type="button"
            onClick={retryQueuedReports}
            disabled={isSubmitting}
            className="bg-blue-600 text-white px-4 py-2 rounded-full text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
          >
            {t("retryQueued")}
          </button>
        </div>
      )}
      {!isSupabaseConfigured && (
        <div className="bg-red-50 border border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-200 rounded-xl p-3 text-center text-sm">
          {t("supabaseMissing")}
        </div>
      )}

      {/* Farmer Profile */}
      <section className="space-y-4">
        <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
          <span className="bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 rounded-full w-8 h-8 flex items-center justify-center text-sm">
            1
          </span>
          {t("farmerProfile")}
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
              {t("name")} <span className="text-red-500">*</span>
            </span>
            <input
              type="text"
              value={farmer.name}
              onChange={(e) => setFarmer({ ...farmer, name: e.target.value })}
              placeholder={lang === "hi" ? "नाम दर्ज करें" : "Enter name"}
              className="w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-4 py-3 text-base focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
              required
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
              {t("phone")} <span className="text-red-500">*</span>
            </span>
            <input
              type="tel"
              value={farmer.phone}
              onChange={(e) => setFarmer({ ...farmer, phone: e.target.value })}
              placeholder={lang === "hi" ? "फ़ोन नंबर" : "Phone number"}
              className="w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-4 py-3 text-base focus:ring-2 focus:ring-emerald-500 outline-none"
              required
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
              {t("village")} <span className="text-red-500">*</span>
            </span>
            <input
              type="text"
              value={farmer.village}
              onChange={(e) => setFarmer({ ...farmer, village: e.target.value })}
              placeholder={lang === "hi" ? "गांव" : "Village"}
              className="w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-4 py-3 text-base focus:ring-2 focus:ring-emerald-500 outline-none"
              required
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
              {t("block")} <span className="text-red-500">*</span>
            </span>
            <input
              type="text"
              value={farmer.block}
              onChange={(e) => setFarmer({ ...farmer, block: e.target.value })}
              placeholder={lang === "hi" ? "ब्लॉक" : "Block"}
              className="w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-4 py-3 text-base focus:ring-2 focus:ring-emerald-500 outline-none"
              required
            />
          </label>
          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
              {t("herdSize")} <span className="text-red-500">*</span>
            </span>
            <input
              type="number"
              min={1}
              value={farmer.herdSize || ""}
              onChange={(e) => setFarmer({ ...farmer, herdSize: parseInt(e.target.value) || 0 })}
              placeholder={lang === "hi" ? "संख्या" : "Number of animals"}
              className="w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-4 py-3 text-base focus:ring-2 focus:ring-emerald-500 outline-none"
              required
            />
          </label>
        </div>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          {lang === "hi" ? "प्रोफाइल ऑटो-सेव होता है" : "Profile auto-saved to device"}
        </p>
      </section>

      {/* Report Details */}
      <section className="space-y-4">
        <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
          <span className="bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full w-8 h-8 flex items-center justify-center text-sm">
            2
          </span>
          {t("reportDetails")}
        </h2>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
            {t("animalType")} <span className="text-red-500">*</span>
          </span>
          <select
            value={animalType}
            onChange={(e) => setAnimalType(e.target.value as AnimalType)}
            className="w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-4 py-3 text-base focus:ring-2 focus:ring-blue-500 outline-none"
            required
          >
            <option value="">{t("selectAnimal")}</option>
            {ANIMAL_TYPES.map((a) => (
              <option key={a} value={a}>
                {t(a)}
              </option>
            ))}
          </select>
        </label>

        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
            {t("symptoms")} <span className="text-red-500">*</span>
          </legend>
          <div className="grid grid-cols-2 gap-2">
            {SYMPTOMS.map((s) => (
              <label
                key={s.value}
                className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-colors ${
                  symptoms.includes(s.value)
                    ? "bg-emerald-50 border-emerald-500 dark:bg-emerald-900/20 dark:border-emerald-600"
                    : "bg-white border-zinc-200 dark:bg-zinc-800 dark:border-zinc-700 hover:border-zinc-300"
                }`}
              >
                <input
                  type="checkbox"
                  checked={symptoms.includes(s.value)}
                  onChange={() => toggleSymptom(s.value)}
                  className="w-5 h-5 rounded accent-emerald-600"
                />
                <span className="text-sm font-medium text-zinc-800 dark:text-zinc-100">
                  {lang === "hi" ? s.labelHi : s.labelEn}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">{t("notes")}</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={t("notesPlaceholder")}
            rows={3}
            className="w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-4 py-3 text-base focus:ring-2 focus:ring-blue-500 outline-none resize-none"
          />
        </label>

        <div className="space-y-2">
          <label className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 block">{t("photo")}</label>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">{t("photoHelp")}</p>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handlePhotoChange}
            className="w-full text-sm file:mr-4 file:py-3 file:px-6 file:rounded-full file:border-0 file:bg-zinc-900 file:text-white file:font-semibold file:text-sm hover:file:bg-zinc-800 dark:file:bg-white dark:file:text-zinc-900 dark:hover:file:bg-zinc-100 file:cursor-pointer cursor-pointer border border-zinc-300 dark:border-zinc-700 rounded-xl p-2 bg-white dark:bg-zinc-800"
          />
          {photoUploadError && (
            <div className="bg-red-50 border border-red-200 text-red-700 dark:bg-red-900/20 dark:border-red-800 dark:text-red-300 rounded-xl p-3 flex items-center justify-between gap-2">
              <span className="text-sm">{photoUploadError}</span>
              <button
                type="button"
                onClick={() => {
                  setPhotoUploadError(null);
                  if (photoFile) uploadPhoto(photoFile).catch(() => {});
                }}
                className="bg-red-600 text-white px-4 py-1.5 rounded-full text-sm font-semibold hover:bg-red-700"
              >
                {t("retry")}
              </button>
            </div>
          )}
          {photoPreview && (
            <div className="relative rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 p-2">
              <p className="text-xs font-semibold text-zinc-600 dark:text-zinc-300 mb-2">{t("photoPreview")}</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photoPreview} alt="preview" className="w-full max-h-64 object-contain rounded-lg" />
              <button
                type="button"
                onClick={() => {
                  setPhotoFile(null);
                  if (fileInputRef.current) fileInputRef.current.value = "";
                }}
                className="absolute top-3 right-3 bg-zinc-900/80 text-white px-3 py-1 rounded-full text-xs font-semibold hover:bg-zinc-900"
              >
                {t("removePhoto")}
              </button>
            </div>
          )}
        </div>

        <div className="space-y-2 rounded-xl border border-zinc-200 dark:border-zinc-700 p-4 bg-zinc-50 dark:bg-zinc-800/50">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
              {t("location")} <span className="text-red-500">*</span>
            </span>
            <button
              type="button"
              onClick={captureGps}
              disabled={gpsStatus === "loading"}
              className="text-xs bg-white dark:bg-zinc-700 border border-zinc-300 dark:border-zinc-600 px-3 py-1.5 rounded-full font-semibold hover:bg-zinc-50 dark:hover:bg-zinc-600 disabled:opacity-50"
            >
              {gpsStatus === "loading" ? t("gpsCapturing") : t("gpsRetry")}
            </button>
          </div>

          {gpsStatus === "loading" && <p className="text-sm text-blue-600 dark:text-blue-400">{t("gpsCapturing")}</p>}
          {gpsStatus === "success" && latitude !== null && longitude !== null && (
            <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl p-3">
              <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">{t("gpsSuccess")}</p>
              <p className="text-sm font-mono text-zinc-700 dark:text-zinc-300">
                {latitude.toFixed(6)}, {longitude.toFixed(6)}
              </p>
            </div>
          )}
          {gpsStatus === "error" && (
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-3">
              <p className="text-sm text-amber-800 dark:text-amber-200">{t("gpsError")}</p>
              {gpsError && <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">{gpsError}</p>}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">{t("latitude")}</span>
              <input
                type="number"
                step="any"
                value={latitude ?? ""}
                onChange={(e) => setLatitude(e.target.value === "" ? null : parseFloat(e.target.value))}
                placeholder="28.6139"
                className="w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2.5 text-sm font-mono focus:ring-2 focus:ring-emerald-500 outline-none"
                required
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">{t("longitude")}</span>
              <input
                type="number"
                step="any"
                value={longitude ?? ""}
                onChange={(e) => setLongitude(e.target.value === "" ? null : parseFloat(e.target.value))}
                placeholder="77.2090"
                className="w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2.5 text-sm font-mono focus:ring-2 focus:ring-emerald-500 outline-none"
                required
              />
            </label>
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {lang === "hi" ? "जीपीएस ऑटो-कैप्चर होता है, विफल होने पर मैन्युअल दर्ज करें" : "Auto-captured on load; edit manually if needed"}
          </p>
        </div>
      </section>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-200 rounded-xl p-3 text-sm font-medium">
          {error}
        </div>
      )}
      {success && (
        <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 rounded-xl p-3 text-sm font-medium">
          {success}
        </div>
      )}

      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-bold text-lg py-4 rounded-2xl shadow-lg transition-colors flex items-center justify-center gap-2"
      >
        {isSubmitting ? t("submitting") : t("submit")}
      </button>

      <p className="text-center text-xs text-zinc-500 dark:text-zinc-400">
        {lang === "hi" ? "बड़े बटन • मोबाइल-फ्रेंडली • ऑफलाइन सपोर्ट" : "Large buttons • Mobile-friendly • Offline support"}
      </p>
    </form>
  );
}
