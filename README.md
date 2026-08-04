# AI Farms — Poultry Tracker

A dashboard for tracking the layer flock: daily log, feed & inventory,
vaccinations and medications, seeded from the current tracker spreadsheet.

## Run locally
```
npm install
npm run dev
```

## Deploy to Vercel (same flow as your other EagleEye apps)
1. Push this folder to a new GitHub repo (e.g. `eagleeye-star/ai-farms-poultry`).
2. In Vercel, "Add New Project" → import that repo.
3. Framework preset: Vite. Build command `npm run build`, output dir `dist` (Vercel detects this automatically).
4. Deploy — you'll get a `*.vercel.app` URL you can open from your phone or PC.

## Notes
- Data is saved to your browser's local storage on whichever device you use it on
  (same as most of your other apps). It is *not* synced across devices yet —
  say the word if you want this hooked up to a Supabase project like EduSmart/TWS
  so your phone and PC stay in sync.
- Seeded with the daily log, feed inventory, medication and vaccination records
  from `advanced_poultry_tracker_Current_Updated.xlsx` (through 6 June 2026).
  Use the "+" buttons in each tab to log new entries going forward.
- Flock is Hy-Line layers, arrived 1 May 2026. Day/week counters on the header
  are based on today's date, not the last log entry.
- New in this pass: hen-day egg %, egg crack tracking, feed cost in GH₵,
  water & light-hours logging, cause-of-death tagging on mortality, a
  "Growth" tab for weekly weight sampling against the breed's own feeding/
  growth standard (pulled from your "Quantity to feed per week" sheet), a
  point-of-lay countdown, and a "Export weekly report" button on the
  Dashboard that downloads a plain-text summary.
