# livestock-surveillance-sih2026

Livestock disease surveillance & farmer reporting — SIH 2026. Mobile-first Next.js app for field reporting with offline support and Supabase backend.

## Reporting form — `/report`

- **Farmer profile** (auto-saved to `localStorage`): name, phone, village, block, herd size
- **Report**: animal type (cow/buffalo/goat/sheep), symptoms (fever, swelling, not eating, cough, diarrhea, discharge, lethargy, bleeding), notes, photo upload to Supabase Storage `report-photos`, auto GPS via `navigator.geolocation`
- **Submit**: validates, uploads photo → `photo_url`, inserts into `reports` table (`farmer_id`, `animal_type`, `symptoms` JSON, `notes`, `photo_url`, `latitude`, `longitude`, `timestamp`), shows success and clears form
- **Offline**: queues to `localStorage` on network failure, retries on next load/online, shows offline indicator
- **UI**: Tailwind mobile-first, Hindi/English toggle, GPS coords + photo preview before submit, manual lat/lng fallback, retry on upload failure

## Getting Started

```bash
npm install
# set Supabase env — see .env.example
cp .env.example .env.local  # then edit NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY
npm run dev
```

Open [http://localhost:3000/report](http://localhost:3000/report)

## Env

```
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

Supabase setup: create table `reports` and Storage bucket `report-photos` (anon insert). See `lib/supabase.ts`.

## Project structure

```
app/
  layout.tsx      # root layout + language toggle
  page.tsx        # landing
  report/page.tsx # report form route
components/
  ReportForm.tsx  # main form
lib/
  supabase.ts     # Supabase client
  types.ts        # Farmer, Report interfaces
  offline-queue.ts# localStorage queue
  language-context.tsx
```

## Scripts

- `npm run dev` — dev server
- `npm run build` — production build
- `npm run lint` — ESLint

---

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Learn More

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

## Deploy on Vercel

Check out [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying).
