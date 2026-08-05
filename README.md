# AI Farms — Farm Tracker

Two workspaces under one AI Farms roof, switched from the toggle at the top:

- **Poultry** — now **multi-flock**: switch between your Ross 308 broilers and
  Hy-Line layers (or add a new batch), each with its own daily log, feed,
  growth curve, breed standard, sales and vaccinations. Broiler flocks show
  **FCR** (feed conversion) against a Ross 308 target; layers keep hen-day %
  and point-of-lay. A **Sales & Profit** tab and dashboard cards track
  revenue, cost (feed + setup), and margin per flock.
- **Bell Pepper Fields** — two-field pepper operation with a Dashboard,
  Crop Cycle, Scouting (pest & disease), Spray & Fertigation, and
  Harvest & Sales. A Field A / Field B / Both selector filters every view.

Both workspaces have a **Reminders** tab (vaccinations, harvest holds, and
scouting show up automatically; add your own one-off or repeating tasks), and
the poultry header has **Backup / Restore** buttons that save or reload the
whole farm's data as a `.json` file — a safety net until cloud sync is added.

### Pepper workspace highlights
- Per-field days-after-transplant counter and expected first-harvest date.
- Scouting log with a pest-pressure trend chart (aphids, whitefly, CMV, etc.).
- Spray log with an automatic **pre-harvest interval** hold — a field won't
  read "safe to harvest" until enough days have passed since the last spray.
- Resistance nudge if the last two insecticides on a field share the same
  active ingredient.
- Harvest & sales feeding revenue, cost (inputs + setup), and margin cards.

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
