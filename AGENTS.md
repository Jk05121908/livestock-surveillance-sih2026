<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# AGENTS.md — livestock-surveillance-sih2026

> Every line = something an agent would miss without help. Keep it verified.

## Snapshot (verified 2026-08-23 post-merge)
- Stack: Next.js `16.3.2` (App Router), React `19.2.8`, TypeScript `^5`, Tailwind `^4` via `@tailwindcss/postcss`, ESLint `^9` with `eslint-config-next`. Created via `npx create-next-app@latest . --typescript --tailwind --eslint --app --import-alias "@/*" --use-npm --disable-git`.
- History: `56e9468 Initial` -> `cffa75b agents` -> remote `815edb3 supabase schema` -> `5ba5f74 triage` -> `6d13009 align schema` -> `1c7dd75 reporting form` (rebased, branch `main` tracks `origin/main`).
- Remote `origin` `https://github.com/Jk05121908/livestock-surveillance-sih2026.git`. No `src/`; code in `app/`, `components/`, `lib/`, `public/`, `supabase/`.
- Supabase: `@supabase/supabase-js` `^2.112.3` for `reports` table + Storage `report-photos` + Edge Functions (`supabase/functions/*` Deno). Env `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (see `lib/supabase.ts:1`, `.env.example:1`).

## Repo boundaries / entrypoints
- `app/layout.tsx` — root layout, `next/font` Geist, `LanguageProvider` + `Header` with Hindi/English toggle persisted to `localStorage`.
- `app/page.tsx` — landing with link to `/report`.
- `app/report/page.tsx` — farmer disease reporting form (`components/ReportForm.tsx`).
- `app/vet-dashboard/page.tsx` — vet triage dashboard (remote: uses `lib/triage.ts`, `lib/vet-assignment.ts`, `components/CaseCard.tsx`).
- `components/ReportForm.tsx` — farmer form: profile auto-save, animal/symptoms/notes/photo/GPS, offline queue, validation, Tailwind mobile-first, Hindi/English.
- `components/Header.tsx` — top nav + language toggle; `components/CaseCard.tsx` — vet case card.
- `lib/supabase.ts` — `createClient(url, anonKey)` — warns if env missing, fails gracefully to offline queue.
- `lib/types.ts` — `Farmer`, `Report`, `AnimalType`, `Symptom` (reporting); `lib/triage.ts` + `lib/vet-assignment.ts` — triage scoring & assignment (remote).
- `lib/offline-queue.ts` — `localStorage` queue `offline_reports`, `fileToBase64` for photos, retry on `online`/load.
- `lib/language-context.tsx` — `LanguageProvider`, `useLanguage`, translations, `app_lang` persistence.
- `supabase/schema.sql` — canonical DB schema; `supabase/functions/triage-report/` + `supabase/functions/assign-case/` — Deno Edge Functions (see gotchas).

## Path quirk — space in parent
- Absolute path contains space: `/Users/kavyasingh/Documents/Default Project/livestock-surveillance-sih2026`.
- Bash tool: use `workdir="/Users/kavyasingh/Documents/Default Project/livestock-surveillance-sih2026"` not `cd ... &&`. Quote inline paths.

## Commands (npm, not yarn/pnpm)
- `npm run dev` — dev server at `http://localhost:3000` (Turbopack/next dev regenerates `AGENTS.md` header — don't remove the `BEGIN` block).
- `npm run build` — production build + typecheck (runs `next build` which also generates route types).
- `npm run lint` — `eslint` (config `eslint.config.mjs:1`).
- `npm install @supabase/supabase-js` — add Supabase client (already in `package.json:11` after setup).
- Single-file check: `npx tsc --noEmit --pretty` or `npx eslint app/report/page.tsx`.

## Env & services
- Create `.env.local` from `.env.example` (if present) with Supabase URL/anon key. Without it, `lib/supabase.ts` throws — app shows config error, photo/upload will fail and queue offline.
- Storage bucket `report-photos` must exist and allow `insert` for anon (or RLS policy). Reports table columns: `farmer_id`, `animal_type`, `symptoms` (JSON array), `notes`, `photo_url`, `latitude`, `longitude`, `created_at`.

## Conventions / gotchas
- `components/ReportForm.tsx` is `"use client"` — uses `navigator.geolocation`, `localStorage`, `navigator.onLine`, `URL.createObjectURL` for preview. Must handle SSR guard (`typeof window !== "undefined"`).
- Farmer profile auto-saves to `localStorage` key `farmer_profile` on every change; herd size is `number`.
- GPS auto-captured on mount via `navigator.geolocation.getCurrentPosition`; on error show manual `latitude`/`longitude` inputs fallback. Show coords before submit.
- Photo preview before upload, upload to `report-photos` with `storage.from(...).upload()`, retry button on failure.
- Offline: if `!navigator.onLine` or Supabase insert/upload fails, `lib/offline-queue.ts` saves to `localStorage` key `offline_reports`. On next load + `online` event, `retryQueuedReports` re-uploads photos from base64.
- Language toggle: at least button labels in Hindi/English; persisted via `app_lang`, mobile-first large buttons (see `app/layout.tsx`, `components/Header.tsx`).
- `supabase/functions/*` are **Deno** Edge Functions (`https://deno.land/std`, `Deno` global) — **excluded** from Next.js build via `tsconfig.json:33` (`exclude supabase`) and `eslint.config.mjs:15` (`globalIgnores supabase/**`). Don't import them in `app/`/`lib/`.
- `lib/triage.ts` + `lib/vet-assignment.ts` + `app/vet-dashboard/` are vet-side; reporting form is farmer-side at `/report`. Keep boundaries.
- Don't run `create-next-app` again in `.` — conflicts with `README.md`/`AGENTS.md`. Use manual file creation.
- Generated: `.next/`, `node_modules/` — not committed. `next-env.d.ts:1` generated, don't edit manually.

## Workflow
- Verify before commit: `npm run lint` then `npm run build` (build does typecheck).
- Commit: `git add -A && git commit -m "..." && git push` to `origin/main`. Until CI, manual `git status`/`git diff`.
