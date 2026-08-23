<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# AGENTS.md — livestock-surveillance-sih2026

> Every line = something an agent would miss without help. Keep it verified.

## Snapshot (verified 2026-08-23)
- Stack: Next.js `16.3.2` (App Router), React `19.2.8`, TypeScript `^5`, Tailwind CSS `^4` via `@tailwindcss/postcss`, ESLint `^9` with `eslint-config-next`. Created via `npx create-next-app@latest . --typescript --tailwind --eslint --app --import-alias "@/*" --use-npm --disable-git`.
- Remote `origin` `https://github.com/Jk05121908/livestock-surveillance-sih2026.git`, branch `main`. History: `56e9468 Initial commit` -> `cffa75b init: opencode agents context`.
- Supabase: `@supabase/supabase-js` for `reports` table + Storage bucket `report-photos`. Env `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (client-side, see `lib/supabase.ts:1`).
- No `src/`; code lives in `app/`, `components/`, `lib/`, `public/`.

## Repo boundaries / entrypoints
- `app/layout.tsx` — root layout, `next/font` Geist, language toggle via `LanguageContext` (`lib/language-context.tsx` if present) persisted to `localStorage`.
- `app/page.tsx` — default landing, redirect/link to `/report`.
- `app/report/page.tsx` — farmer disease reporting form (imports `components/ReportForm.tsx`).
- `components/ReportForm.tsx` — all form logic: farmer profile (localStorage auto-save), animal/symptoms/notes/photo/GPS, offline queue, validation, Tailwind mobile-first UI, Hindi/English labels.
- `lib/supabase.ts` — `createClient(url, anonKey)` — fails visibly if env missing.
- `lib/types.ts` — `Farmer`, `Report`, `AnimalType`, `Symptom` etc.
- `lib/offline-queue.ts` — `localStorage` queue for failed submissions, retry on load/online.
- `lib/language-context.tsx` — language toggle provider (if added).

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
- Offline: if `!navigator.onLine` or Supabase insert/upload fails, `lib/offline-queue.ts` saves to `localStorage` key `offline_reports` (or `offline_queue`). On next load + `online` event, retry. Show offline indicator banner.
- Language toggle: at least button labels in Hindi/English; persisted, mobile-first large buttons (see `app/layout.tsx`).
- Don't run `create-next-app` again in `.` — it will conflict with existing `README.md`/`AGENTS.md`. Use manual file creation.
- Generated: `.next/`, `node_modules/` — not committed. `next-env.d.ts:1` is generated, don't edit manually.

## Workflow
- Verify before commit: `npm run lint` then `npm run build` (build does typecheck).
- Commit: `git add -A && git commit -m "..." && git push` to `origin/main`. Until CI, manual `git status`/`git diff`.
