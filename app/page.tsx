import Link from "next/link";

export default function Home() {
  return (
    <main className="flex-1 flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-2xl bg-white dark:bg-zinc-900 rounded-2xl shadow-lg p-6 sm:p-8 space-y-6 text-center">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-100">Livestock Surveillance — SIH 2026</h1>
          <p className="text-zinc-600 dark:text-zinc-400">
            Mobile-friendly disease reporting for farmers. Works offline, auto-captures GPS, and syncs to Supabase.
          </p>
        </div>
        <div className="grid sm:grid-cols-2 gap-3 text-left text-sm bg-zinc-50 dark:bg-zinc-800 rounded-xl p-4">
          <div>✓ Farmer profile auto-saved</div>
          <div>✓ Photo upload to `report-photos`</div>
          <div>✓ GPS auto-capture + manual fallback</div>
          <div>✓ Offline queue + retry</div>
          <div>✓ Hindi / English toggle</div>
          <div>✓ Tailwind mobile-first UI</div>
        </div>
        <Link
          href="/report"
          className="inline-flex w-full justify-center bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-lg py-4 rounded-2xl shadow"
        >
          Go to Report Form →
        </Link>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Set <code className="bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
          <code className="bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> in{" "}
          <code className="bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded">.env.local</code> to enable Supabase.
        </p>
      </div>
    </main>
  );
}
