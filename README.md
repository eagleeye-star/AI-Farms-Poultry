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

## Structures & assets (net houses, coops)

Big builds — an insect net house, a poultry coop, a drip system, a borehole —
are tracked in **Whole Farm → Structures & assets**, not as ordinary expenses.

Add one with **+ Add structure**, then set:

- **What is it** — net house, coop, irrigation, fencing, etc.
- **Enterprise** — poultry or bell pepper.
- **Which field / flock** — assign it to Field A, Field B, a specific flock, or shared.
- **Amount** and **useful life in years** (sensible defaults are filled in).

The cost is then **spread over its useful life** rather than charged entirely to
the season it was built. A GH₵25,000 net house on a 4-year life charges about
GH₵6,250 a year — so one build doesn't make an otherwise good season look like a
disaster. The assets table shows what you invested, what's been written off, and
what value is left.

Because structures are assigned to a field or flock, **Field A and Field B are
directly comparable** — the pepper field snapshot shows structures and charged
cost per field, so once the second net house is up you can see whether the
netting actually paid for itself.

> Don't enter the same money twice. If you log a net house here, leave that
> field's **Setup cost** in Crop Cycle blank — otherwise it's counted in both
> places and your margin will look worse than it is.

---

## Install on your phone

The tracker is a PWA, so it installs like a normal app — its own icon, no
browser address bar, and it opens offline.

- **Android / Chrome:** an "Install" bar appears in the app; tap it. Or use
  the browser menu → *Install app* / *Add to Home screen*.
- **iPhone / Safari:** tap the **Share** button, then **Add to Home Screen**.
  (iOS gives no install button, so the app shows this instruction instead.)

Once installed it works with no signal: your data is saved on the device and
syncs whenever you're back online.

---

## Login & cloud sync

You sign in with an email and password. The Supabase URL and key are built
into the app, so there is nothing to type on each device — install, sign in,
and your farm data is there.

### If the app says "Saved on this device only"

That means the build had no Supabase details. Either:

- **Best:** set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in Vercel and
  **redeploy** — env vars are read at build time, so adding them without a
  redeploy changes nothing. Then close and reopen the installed app.
- **Or, right now:** tap **Set up cloud sync** on the sync bar and paste the
  Project URL and anon key. It checks the connection before saving, and stores
  them on that device.

Installed app still showing the old version after a redeploy? Close it fully and
reopen — the service worker fetches a fresh copy on launch. On Android you can
also clear the app's cache from the browser's site settings.

### One-time setup

1. Create a free project at supabase.com.
2. **SQL Editor → New query**, paste all of `supabase-setup.sql`, and Run.
3. **Authentication → Providers → Email**: make sure Email is enabled.
   If you'd rather skip confirmation emails, turn **Confirm email** off under
   *Authentication → Sign In / Up*.
4. **Project Settings → API**: copy the **Project URL** and the
   **anon public** key. Never use the `service_role` key.
5. In Vercel, add them as `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
   (see `.env.example`), then redeploy.
6. Open the app, choose **Create an account**, and sign in.
7. Once your account exists, go to **Authentication → Sign In / Up** and turn
   **Allow new users to sign up** OFF, so nobody else can register.

### Vaccinations

Loading a programme creates **scheduled** shots — the app never assumes one was
given. Each appears under **To confirm** in the Health tab with **Done** and
**Not given** buttons, and stays there until you say which. Confirming Done
stamps it with today's date. You can undo a confirmation at any time.

### Security

Each row in `farm_state` is tied to your user id, and row-level security means
the database only ever returns rows belonging to whoever is signed in. The
anon key in the bundle cannot read your records without a valid login.

### How syncing behaves

The whole farm state is one record per user, last-write-wins. Signing in pulls
your data down. Hit **Sync now** when you arrive at the farm and again when you
finish. If you log on two devices without syncing in between, the last one to
push wins — so sync before you start logging on a different device.

**Backup / Restore** buttons remain as an offline safety net.

If no Supabase keys are configured, the app skips the login screen entirely and
runs purely on-device.

---

## Deploy

```bash
npm install
npm run dev      # local
npm run build    # production
```

Push to GitHub and import in Vercel as a Vite project.
