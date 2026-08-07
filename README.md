# AI Farms — Farm Tracker

Three workspaces under one roof, switched from the toggle at the top:
**Poultry**, **Bell Pepper Fields**, and **Whole Farm**.

---

## Poultry

Multi-flock: switch between your Ross 308 broilers and Hy-Line layers, or add a
new batch. Each flock keeps its own daily log, feed, growth curve, breed
standard, sales, litter and vaccinations.

- **Dashboard** — birds, mortality, survival, hen-day % (layers) or **FCR**
  against a Ross 308 target (broilers), revenue / cost / margin, **feed
  run-out projection**, litter age and condition, manure banked.
- **Feed & Inventory** — feed records with a low-stock banner projecting how
  many days of feed remain from recent usage.
- **Feed Mix** — home-mix ration calculator (see below).
- **Litter & Manure** — litter laid, topped up, turned, changed, and
  **removed to field** as manure, with condition tracking.
- **Growth** — weight samples charted against the flock's breed standard.
- **Sales & Profit** — egg/bird sales, with cost broken into feed, litter and setup.
- **Health** — medications and vaccinations, plus one-click loading of the
  standard Hy-Line or Ross 308 vaccination programme.
- **Reminders** — vaccinations due, feed reorder, litter change, plus your own tasks.

### Feed Mix calculator
Enter your ingredient prices and blend; it returns finished **protein,
calcium and energy** against the target band for the ration type, your
**cost per kg**, the saving versus bagged feed, and the exact **weigh-out in
kg** for your batch size. Recipes save so you can compare blends as maize
prices move.

> The nutrient figures are typical book values for comparing blends and
> catching a bad ratio — not a lab analysis. **Always follow the inclusion
> rate printed on your concentrate bag**, since brands differ. And check your
> maize: mouldy maize carries aflatoxin, which quietly cuts laying, weakens
> shells and can kill birds.

---

## Bell Pepper Fields

Two-field operation with a Field A / Field B / Both selector filtering every view.

- **Dashboard** — plant stand, pest pressure, harvest-hold status, yield,
  revenue / cost / margin, plus alerts.
- **Crop Cycle** — variety, transplant date, live days-after-transplant counter,
  plant count, expected first harvest.
- **Scouting** — pest and disease logging with a pressure trend chart.
- **Spray & Fertigation** — products with **pre-harvest interval** enforcement
  and an active-ingredient rotation warning.
- **Input Stock** — agrochemicals and fertilisers with reorder levels.
- **Harvest & Sales** — kg, grade, price, buyer.
- **Reminders** — harvest holds, scouting due, low input stock.

---

## Whole Farm

Combined profit and loss: poultry margin + pepper margin + a general expense
log (labour, transport, utilities, repairs), plus manure recycled from the
poultry house to the fields. Feed, litter, spray and setup costs are pulled
in automatically — add only what those don't already capture.

---

## Cloud sync (phone ↔ PC)

Data lives in the browser by default. Cloud sync keeps every device in step.

1. Create a free project at supabase.com.
2. Open **SQL Editor → New query**, paste all of `supabase-setup.sql`, and Run.
3. In **Project Settings → API**, copy the **Project URL** and the
   **anon public** key. Never use the `service_role` key.
4. In the app, click **Set up** on the sync bar and paste both, plus a
   hard-to-guess **Farm ID** (e.g. `aifarms-eikwe-7f3a91c2`).
5. Use the **same Farm ID** on your phone and PC.

Optionally set the same values as `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
and `VITE_FARM_ID` in Vercel (see `.env.example`) so devices don't need typing.

**How syncing behaves:** the whole farm state is one record, last-write-wins.
Hit **Sync now** when you arrive at the farm and again when you finish. If the
cloud copy is newer, syncing pulls it down; otherwise it pushes yours up. If you
log on two devices without syncing in between, the last one to push wins — so
sync before you start logging on a different device.

**Backup / Restore** buttons remain as an offline safety net.

---

## Deploy

```bash
npm install
npm run dev      # local
npm run build    # production
```

Push to GitHub and import in Vercel as a Vite project.
