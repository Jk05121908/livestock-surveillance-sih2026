/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { Language } from "./types";

type Translations = Record<string, { en: string; hi: string }>;

export const translations: Translations = {
  appTitle: { en: "Livestock Disease Report", hi: "पशु रोग रिपोर्ट" },
  appSubtitle: {
    en: "SIH 2026 — Field reporting for farmers",
    hi: "एसआईएच 2026 — किसानों के लिए फील्ड रिपोर्टिंग",
  },
  farmerProfile: { en: "Farmer Profile", hi: "किसान प्रोफाइल" },
  name: { en: "Name", hi: "नाम" },
  phone: { en: "Phone", hi: "फोन" },
  village: { en: "Village", hi: "गांव" },
  block: { en: "Block", hi: "ब्लॉक" },
  herdSize: { en: "Herd Size", hi: "पशु संख्या" },
  reportDetails: { en: "Report Details", hi: "रिपोर्ट विवरण" },
  animalType: { en: "Animal Type", hi: "पशु प्रकार" },
  selectAnimal: { en: "Select animal", hi: "पशु चुनें" },
  cow: { en: "Cow", hi: "गाय" },
  buffalo: { en: "Buffalo", hi: "भैंस" },
  goat: { en: "Goat", hi: "बकरी" },
  sheep: { en: "Sheep", hi: "भेड़" },
  symptoms: { en: "Symptoms", hi: "लक्षण" },
  notes: { en: "Notes", hi: "टिप्पणी" },
  notesPlaceholder: {
    en: "Describe condition, duration, etc.",
    hi: "स्थिति, अवधि आदि का वर्णन करें",
  },
  photo: { en: "Photo", hi: "फोटो" },
  photoHelp: {
    en: "Upload clear photo (stored in report-photos)",
    hi: "स्पष्ट फोटो अपलोड करें (report-photos में स्टोर)",
  },
  location: { en: "Location (GPS)", hi: "स्थान (जीपीएस)" },
  latitude: { en: "Latitude", hi: "अक्षांश" },
  longitude: { en: "Longitude", hi: "देशांतर" },
  gpsCapturing: { en: "Capturing GPS...", hi: "जीपीएस ले रहा है..." },
  gpsSuccess: { en: "GPS captured", hi: "जीपीएस प्राप्त" },
  gpsError: {
    en: "GPS failed — enter manually",
    hi: "जीपीएस विफल — मैन्युअल दर्ज करें",
  },
  gpsRetry: { en: "Retry GPS", hi: "पुनः प्रयास करें" },
  offline: {
    en: "You are offline — report will be queued",
    hi: "आप ऑफलाइन हैं — रिपोर्ट कतार में जाएगी",
  },
  online: { en: "Online", hi: "ऑनलाइन" },
  submit: { en: "Submit Report", hi: "रिपोर्ट जमा करें" },
  submitting: { en: "Submitting...", hi: "जमा हो रहा है..." },
  success: {
    en: "Report submitted successfully!",
    hi: "रिपोर्ट सफलतापूर्वक जमा हुई!",
  },
  queued: {
    en: "No connection — saved offline, will retry",
    hi: "कनेक्शन नहीं — ऑफलाइन सहेजा, पुनः प्रयास होगा",
  },
  retry: { en: "Retry", hi: "पुनः प्रयास" },
  retryQueued: {
    en: "Retry queued reports",
    hi: "कतार रिपोर्ट पुनः प्रयास",
  },
  queuedCount: {
    en: "queued report(s)",
    hi: "कतार रिपोर्ट",
  },
  required: { en: "Required", hi: "आवश्यक" },
  validation: {
    en: "Please fill all required fields",
    hi: "कृपया सभी आवश्यक फ़ील्ड भरें",
  },
  photoPreview: { en: "Photo preview", hi: "फोटो पूर्वावलोकन" },
  removePhoto: { en: "Remove", hi: "हटाएं" },
  supabaseMissing: {
    en: "Supabase not configured — check .env.local",
    hi: "सुपाबेस कॉन्फ़िगर नहीं — .env.local देखें",
  },
  toggleToHindi: { en: "हिंदी", hi: "English" },
};

interface LanguageContextType {
  lang: Language;
  toggle: () => void;
  t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextType | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLang] = useState<Language>("en");

  useEffect(() => {
    const saved = localStorage.getItem("app_lang") as Language | null;
    if (saved === "en" || saved === "hi") setLang(saved);
  }, []);

  const toggle = () => {
    setLang((prev) => {
      const next = prev === "en" ? "hi" : "en";
      localStorage.setItem("app_lang", next);
      return next;
    });
  };

  const t = (key: string) => {
    const entry = translations[key];
    if (!entry) return key;
    return entry[lang];
  };

  return (
    <LanguageContext.Provider value={{ lang, toggle, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be inside LanguageProvider");
  return ctx;
}
