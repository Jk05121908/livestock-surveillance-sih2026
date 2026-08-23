"use client";

import Link from "next/link";
import { useLanguage } from "@/lib/language-context";

export default function Header() {
  const { lang, toggle, t } = useLanguage();

  return (
    <header className="sticky top-0 z-10 bg-white/90 dark:bg-zinc-900/90 backdrop-blur border-b border-zinc-200 dark:border-zinc-800">
      <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
        <Link href="/" className="flex flex-col">
          <span className="font-bold text-zinc-900 dark:text-zinc-100 leading-tight text-base sm:text-lg">
            {t("appTitle")}
          </span>
          <span className="text-xs text-zinc-500 dark:text-zinc-400 hidden sm:block">{t("appSubtitle")}</span>
        </Link>
        <div className="flex items-center gap-2">
          <Link
            href="/report"
            className="bg-emerald-600 text-white px-4 py-2 rounded-full text-sm font-semibold hover:bg-emerald-700"
          >
            {lang === "hi" ? "रिपोर्ट" : "Report"}
          </Link>
          <button
            type="button"
            onClick={toggle}
            className="border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-100 px-4 py-2 rounded-full text-sm font-semibold hover:bg-zinc-50 dark:hover:bg-zinc-700 min-w-[80px]"
            aria-label="Toggle language"
          >
            {t("toggleToHindi")}
          </button>
        </div>
      </div>
    </header>
  );
}
