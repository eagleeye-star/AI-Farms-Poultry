import { useState, useEffect, useMemo, useRef } from 'react';
import {
  ResponsiveContainer, ComposedChart, Line, Bar, Area, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, AreaChart,
} from 'recharts';
import { SEED } from './data/seed';
import ROSS308 from './data/ross308_standard.json';
import { pullRemote, pushRemote, getSyncSettings, saveSyncSettings, isSyncConfigured } from './sync';
import './App.css';

const STORAGE_KEY = 'aifarms_poultry_tracker_v1';

const STANDARDS = {
  hyline_layer: SEED.feedStandard,
  ross308_broiler: ROSS308,
};

/* ---------------- utils ---------------- */

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function daysBetween(a, b) {
  const d1 = new Date(a);
  const d2 = new Date(b);
  return Math.round((d2 - d1) / 86400000);
}

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function num(v, digits = 0) {
  if (v === null || v === undefined || v === '' || isNaN(v)) return '—';
  return Number(v).toLocaleString('en-GB', { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

function feedPhaseForWeek(week, standard) {
  const list = standard || FEED_STANDARD;
  let phase = null;
  for (const r of list) {
    if (r.week > week) break;
    if (r.feedType) phase = r.feedType;
  }
  return phase;
}

function standardWeightForWeek(week, standard) {
  const list = standard || FEED_STANDARD;
  const exact = list.find((r) => r.week === week);
  if (exact) return exact.estWeightG;
  if (week < list[0].week) return null;
  if (week > list[list.length - 1].week) return list[list.length - 1].estWeightG;
  return null;
}

function polWeek(standard) {
  const list = standard || FEED_STANDARD;
  const layer = list.find((r) => (r.feedType || '').toLowerCase().includes('layer'));
  return layer ? layer.week : 21;
}

function defaultPepper() {
  return {
    fields: [
      { id: 'A', name: 'Field A', variety: '', transplantDate: '', plantCount: null, spacing: '', expectedHarvestDAT: 70, setupCost: null, notes: '' },
      { id: 'B', name: 'Field B', variety: '', transplantDate: '', plantCount: null, spacing: '', expectedHarvestDAT: 70, setupCost: null, notes: '' },
    ],
    scouting: [],
    sprays: [],
    harvests: [],
    inputs: [],       // agrochemical / fertiliser stock
  };
}

function tagEntries(arr, flockId) {
  return (arr || []).map((e) => (e.flockId ? e : { ...e, flockId }));
}

function makeLayerFlock(meta) {
  return { type: 'layer', standardKey: 'hyline_layer', setupCost: null, ...(meta || SEED.flock), id: 'layers' };
}

function makeBroilerFlock() {
  return {
    id: 'broilers', flockName: 'Broiler Batch — Ross 308', breed: 'Ross 308 (+ cockerels)', type: 'broiler',
    startDate: '2026-06-15', initialBirds: 69, location: 'Eikwe, Western Region',
    standardKey: 'ross308_broiler', setupCost: null,
  };
}

function freshData() {
  return {
    flocks: [makeLayerFlock(), makeBroilerFlock()],
    dailyLog: tagEntries(SEED.dailyLog, 'layers'),
    meds: tagEntries(SEED.meds, 'layers'),
    vax: tagEntries(SEED.vax, 'layers'),
    feed: tagEntries(SEED.feed, 'layers'),
    weightSamples: tagEntries(SEED.weightSamples, 'layers'),
    sales: [],
    reminders: [],
    litter: [],       // litter laid / topped up / changed / harvested as manure
    expenses: [],     // whole-farm general costs (labour, transport, utilities)
    recipes: [],      // saved home-mix feed formulations
    pepper: defaultPepper(),
    updatedAt: new Date().toISOString(),
  };
}

function migrate(saved) {
  let flocks = saved.flocks;
  if (!flocks || !flocks.length) {
    // Old single-flock save: the existing flock becomes the layer flock.
    flocks = [makeLayerFlock(saved.flock), makeBroilerFlock()];
  }
  const pepper = saved.pepper || defaultPepper();
  return {
    flocks,
    dailyLog: tagEntries(saved.dailyLog || SEED.dailyLog, 'layers'),
    meds: tagEntries(saved.meds || SEED.meds, 'layers'),
    vax: tagEntries(saved.vax || SEED.vax, 'layers'),
    feed: tagEntries(saved.feed || SEED.feed, 'layers'),
    weightSamples: tagEntries(saved.weightSamples || [], 'layers'),
    sales: saved.sales || [],
    reminders: saved.reminders || [],
    litter: saved.litter || [],
    expenses: saved.expenses || [],
    recipes: saved.recipes || [],
    pepper: { ...defaultPepper(), ...pepper, inputs: pepper.inputs || [] },
    updatedAt: saved.updatedAt || new Date().toISOString(),
  };
}

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return migrate(JSON.parse(raw));
  } catch (e) { /* ignore corrupt storage */ }
  return freshData();
}

const FEED_STANDARD = SEED.feedStandard;

const LITTER_CHANGE_DAYS = 42;      // typical deep-litter interval before a full change
const LITTER_MATERIALS = ['Sawdust', 'Wood shavings', 'Rice husk', 'Groundnut shell', 'Other'];
const LITTER_ACTIONS = ['Laid fresh', 'Top-up', 'Turned / stirred', 'Full change', 'Removed to field'];
const LITTER_CONDITIONS = ['Dry', 'Damp', 'Caked', 'Wet'];

/* Standard vaccination programmes. Dates are calculated from the flock start
   date. These are typical Ghanaian schedules — always confirm against your
   hatchery's advice and your vet, since local disease pressure varies. */
const VAX_TEMPLATES = {
  hyline_layer: [
    { day: 7, disease: 'Newcastle + IB', vaccine: 'NDV/IB (Ma5 + Clone30)', route: 'Eye drop' },
    { day: 14, disease: 'Gumboro (IBD)', vaccine: 'IBD intermediate', route: 'Drinking water' },
    { day: 21, disease: 'Gumboro (IBD)', vaccine: 'IBD booster', route: 'Drinking water' },
    { day: 28, disease: 'Newcastle', vaccine: 'Lasota', route: 'Drinking water' },
    { day: 42, disease: 'Fowl Pox', vaccine: 'Fowl pox', route: 'Wing web' },
    { day: 56, disease: 'Newcastle', vaccine: 'Lasota booster', route: 'Drinking water' },
    { day: 70, disease: 'Fowl Typhoid', vaccine: 'Fowl typhoid 9R', route: 'Injection' },
    { day: 112, disease: 'Newcastle', vaccine: 'ND killed (pre-lay)', route: 'Injection' },
  ],
  ross308_broiler: [
    { day: 7, disease: 'Newcastle + IB', vaccine: 'NDV/IB (Ma5 + Clone30)', route: 'Eye drop' },
    { day: 14, disease: 'Gumboro (IBD)', vaccine: 'IBD intermediate', route: 'Drinking water' },
    { day: 21, disease: 'Gumboro (IBD)', vaccine: 'IBD booster', route: 'Drinking water' },
    { day: 28, disease: 'Newcastle', vaccine: 'Lasota booster', route: 'Drinking water' },
  ],
};

/* Feed-mix ingredients. Nutrient values are typical book figures for Ghanaian
   inputs — good enough to compare blends and catch a bad ratio, but the
   concentrate bag's own label always wins. */
const INGREDIENTS = [
  { id: 'maize', name: 'Maize', protein: 8.5, calcium: 0.02, energy: 3350, defaultPrice: 5.5 },
  { id: 'bran', name: 'Wheat bran', protein: 15.0, calcium: 0.14, energy: 1300, defaultPrice: 3.5 },
  { id: 'layerconc', name: 'Layer concentrate', protein: 38.0, calcium: 9.0, energy: 2000, defaultPrice: 14.0 },
  { id: 'broilerconc', name: 'Broiler concentrate', protein: 40.0, calcium: 3.0, energy: 2100, defaultPrice: 15.0 },
  { id: 'soya', name: 'Soya meal', protein: 44.0, calcium: 0.3, energy: 2230, defaultPrice: 9.0 },
  { id: 'fishmeal', name: 'Fish meal', protein: 60.0, calcium: 5.0, energy: 2800, defaultPrice: 18.0 },
  { id: 'oil', name: 'Palm / vegetable oil', protein: 0, calcium: 0, energy: 8800, defaultPrice: 16.0 },
  { id: 'oyster', name: 'Oyster shell / limestone', protein: 0, calcium: 38.0, energy: 0, defaultPrice: 2.0 },
  { id: 'salt', name: 'Salt / premix', protein: 0, calcium: 0, energy: 0, defaultPrice: 6.0 },
];

const RATION_TARGETS = {
  layer: { label: 'Layer (in lay)', protein: [16, 18], calcium: [3.4, 4.2], energy: [2600, 2800] },
  grower: { label: 'Grower / pullet', protein: [14.5, 16.5], calcium: [0.9, 1.3], energy: [2500, 2750] },
  broiler_starter: { label: 'Broiler starter', protein: [21, 23], calcium: [0.8, 1.2], energy: [2800, 3050] },
  broiler_finisher: { label: 'Broiler finisher', protein: [18, 20], calcium: [0.8, 1.2], energy: [2900, 3200] },
};

/* ---------------- small building blocks ---------------- */

function DayRing({ pct, size = 52, color = '#D4A537' }) {
  const r = (size - 6) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(1, pct));
  return (
    <svg className="ring" viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#423827" strokeWidth="4" />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke={color} strokeWidth="4" strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c * (1 - clamped)}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  );
}

function StatCard({ title, value, tone, foot }) {
  return (
    <div className="card">
      <p className="card-title">{title}</p>
      <div className={`stat-value ${tone || ''}`}>{value}</div>
      {foot && <p className="stat-foot">{foot}</p>}
    </div>
  );
}

function Modal({ title, sub, onClose, children }) {
  return (
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal">
        <h3>{title}</h3>
        {sub && <p className="modal-sub">{sub}</p>}
        {children}
      </div>
    </div>
  );
}

function Field({ label, span2, children }) {
  return <div className={`field${span2 ? ' span-2' : ''}`}>{label && <label>{label}</label>}{children}</div>;
}

/* ---------------- main app ---------------- */

export default function App() {
  const [data, setData] = useState(loadData);
  const [workspace, setWorkspace] = useState('poultry');
  const [tab, setTab] = useState('dashboard');
  const [modal, setModal] = useState(null); // 'log' | 'feed' | 'med' | 'vax' | 'flock' | 'sale' | 'reminder' | null
  const [activeFlockId, setActiveFlockId] = useState(data.flocks[0].id);
  const restoreInputRef = useRef(null);
  const [sync, setSync] = useState({ status: 'idle', message: '', lastSync: null });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }, [data]);

  const activeFlock = data.flocks.find((f) => f.id === activeFlockId) || data.flocks[0];
  const flockStandard = STANDARDS[activeFlock.standardKey] || FEED_STANDARD;
  const POL_WEEK = polWeek(flockStandard);

  const dailyLog = useMemo(
    () => data.dailyLog.filter((r) => r.flockId === activeFlock.id).sort((a, b) => new Date(a.date) - new Date(b.date)),
    [data.dailyLog, activeFlock.id]
  );
  const feed = useMemo(
    () => data.feed.filter((r) => r.flockId === activeFlock.id).sort((a, b) => new Date(a.date) - new Date(b.date)),
    [data.feed, activeFlock.id]
  );
  const meds = useMemo(
    () => data.meds.filter((r) => r.flockId === activeFlock.id).sort((a, b) => new Date(b.date) - new Date(a.date)),
    [data.meds, activeFlock.id]
  );
  const vax = useMemo(
    () => data.vax.filter((r) => r.flockId === activeFlock.id).sort((a, b) => new Date(a.date) - new Date(b.date)),
    [data.vax, activeFlock.id]
  );
  const weightSamples = useMemo(
    () => (data.weightSamples || []).filter((r) => r.flockId === activeFlock.id).sort((a, b) => new Date(a.date) - new Date(b.date)),
    [data.weightSamples, activeFlock.id]
  );
  const sales = useMemo(
    () => (data.sales || []).filter((r) => r.flockId === activeFlock.id).sort((a, b) => new Date(a.date) - new Date(b.date)),
    [data.sales, activeFlock.id]
  );
  const litter = useMemo(
    () => (data.litter || []).filter((r) => r.flockId === activeFlock.id).sort((a, b) => new Date(a.date) - new Date(b.date)),
    [data.litter, activeFlock.id]
  );

  const latest = dailyLog[dailyLog.length - 1];
  const currentBirds = latest ? latest.closing : activeFlock.initialBirds;
  const totalMortality = dailyLog.reduce((s, r) => s + (Number(r.mortality) || 0), 0);
  const survivalRate = activeFlock.initialBirds
    ? (currentBirds / activeFlock.initialBirds) * 100
    : null;
  const totalFeed = dailyLog.reduce((s, r) => s + (Number(r.feedGiven) || 0), 0);
  const dayNumber = daysBetween(activeFlock.startDate, todayISO()) + 1;
  const weekNumber = Math.ceil(dayNumber / 7);
  const daysSinceLastEntry = latest ? daysBetween(latest.date, todayISO()) : null;
  const isStale = daysSinceLastEntry !== null && daysSinceLastEntry > 3;

  const feedBalance = feed.length ? feed[feed.length - 1].balance : null;
  const totalFeedCost = feed.reduce((s, r) => s + (Number(r.cost) || 0), 0);
  const feedCostPerBird = currentBirds ? totalFeedCost / currentBirds : null;

  const totalEggs = dailyLog.reduce((s, r) => s + (Number(r.eggs) || 0), 0);
  const totalCracked = dailyLog.reduce((s, r) => s + (Number(r.eggsCracked) || 0), 0);
  const henDayPct = latest && latest.closing
    ? ((Number(latest.eggs) || 0) / latest.closing) * 100
    : null;
  const weeksToPOL = POL_WEEK - weekNumber;
  const currentFeedPhase = feedPhaseForWeek(weekNumber, flockStandard);
  const standardWeight = standardWeightForWeek(weekNumber, flockStandard);
  const latestSample = weightSamples[weightSamples.length - 1];

  // Feed conversion ratio — meaningful for broilers: kg feed per kg liveweight to date.
  const fcr = (activeFlock.type === 'broiler' && latestSample && latestSample.avgWeightG && currentBirds && totalFeed)
    ? totalFeed / (currentBirds * (latestSample.avgWeightG / 1000))
    : null;
  const fcrTarget = activeFlock.type === 'broiler' ? 1.6 : null;

  // Sales & simple profit for this flock.
  const totalRevenue = sales.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const litterCost = litter.reduce((s, r) => s + (Number(r.cost) || 0), 0);
  const flockCost = totalFeedCost + litterCost + (Number(activeFlock.setupCost) || 0);
  const flockMargin = totalRevenue - flockCost;

  // Feed run-out projection: average daily use over the last 7 logged days.
  const recentLog = dailyLog.slice(-7);
  const avgDailyFeed = recentLog.length
    ? recentLog.reduce((s, r) => s + (Number(r.feedGiven) || 0), 0) / recentLog.length
    : null;
  const feedDaysLeft = (feedBalance != null && avgDailyFeed > 0)
    ? Math.floor(feedBalance / avgDailyFeed)
    : null;

  // Litter: how long since the house was last laid or fully changed.
  const lastChange = [...litter].reverse().find((r) => r.action === 'Laid fresh' || r.action === 'Full change');
  const daysSinceLitterChange = lastChange ? daysBetween(lastChange.date, todayISO()) : null;
  const litterCondition = litter.length ? litter[litter.length - 1].condition : null;
  const litterDue = daysSinceLitterChange != null && daysSinceLitterChange >= LITTER_CHANGE_DAYS;
  // Manure banked from cleared litter — the reason the poultry exists.
  const manureHarvested = litter
    .filter((r) => r.action === 'Removed to field')
    .reduce((s, r) => s + (Number(r.quantity) || 0), 0);

  const mortalityByCause = useMemo(() => {
    const m = {};
    dailyLog.forEach((r) => {
      if (Number(r.mortality) > 0 && r.mortalityCause) {
        m[r.mortalityCause] = (m[r.mortalityCause] || 0) + Number(r.mortality);
      }
    });
    return m;
  }, [dailyLog]);

  const growthChartData = useMemo(() => {
    const sampleByWeek = {};
    weightSamples.forEach((s) => {
      const wk = Math.ceil((daysBetween(activeFlock.startDate, s.date) + 1) / 7);
      sampleByWeek[wk] = s.avgWeightG;
    });
    return flockStandard.filter((r) => r.week <= Math.max(weekNumber, POL_WEEK)).map((r) => ({
      week: `W${r.week}`,
      standard: r.estWeightG,
      actual: sampleByWeek[r.week] ?? null,
    }));
  }, [weightSamples, weekNumber, activeFlock.startDate, flockStandard, POL_WEEK]);

  // vaccine status: latest occurrence of each vaccine family + its next-due date
  const vaxStatus = useMemo(() => {
    const map = {};
    vax.forEach((v) => {
      const key = v.disease || v.vaccine;
      if (!map[key] || new Date(v.date) > new Date(map[key].date)) map[key] = v;
    });
    return Object.values(map).map((v) => {
      const daysLeft = v.nextDue ? daysBetween(todayISO(), v.nextDue) : null;
      return { ...v, daysLeft };
    });
  }, [vax]);

  const chartData = dailyLog.map((r) => ({
    date: fmtDate(r.date).slice(0, 6),
    closing: r.closing,
    mortality: Number(r.mortality) || 0,
    feedGiven: r.feedGiven ?? null,
    eggs: r.eggs ?? null,
    water: r.waterGiven ?? null,
    henDay: r.closing ? Math.round(((Number(r.eggs) || 0) / r.closing) * 1000) / 10 : null,
  }));

  const feedChartData = feed
    .filter((f) => f.balance !== null && f.balance !== undefined)
    .map((f) => ({ date: fmtDate(f.date).slice(0, 6), balance: f.balance, used: f.used, purchased: f.purchased }));

  function addDailyLog(entry) {
    setData((d) => ({ ...d, dailyLog: [...d.dailyLog, { ...entry, flockId: activeFlock.id }] }));
  }
  function addFeed(entry) {
    setData((d) => ({ ...d, feed: [...d.feed, { ...entry, flockId: activeFlock.id }] }));
  }
  function addMed(entry) {
    setData((d) => ({ ...d, meds: [...d.meds, { ...entry, flockId: activeFlock.id }] }));
  }
  function addVax(entry) {
    setData((d) => ({ ...d, vax: [...d.vax, { ...entry, flockId: activeFlock.id }] }));
  }
  function addWeightSample(entry) {
    setData((d) => ({ ...d, weightSamples: [...(d.weightSamples || []), { ...entry, flockId: activeFlock.id }] }));
  }
  function addSale(entry) {
    setData((d) => ({ ...d, sales: [...(d.sales || []), { ...entry, flockId: activeFlock.id }] }));
  }
  function addLitter(entry) {
    setData((d) => ({ ...d, litter: [...(d.litter || []), { ...entry, flockId: activeFlock.id }] }));
  }
  function addExpense(entry) {
    setData((d) => ({ ...d, expenses: [...(d.expenses || []), entry] }));
  }
  function deleteExpense(id) {
    setData((d) => ({ ...d, expenses: (d.expenses || []).filter((r) => r.id !== id) }));
  }
  function saveRecipe(entry) {
    setData((d) => ({ ...d, recipes: [...(d.recipes || []), entry] }));
  }
  function deleteRecipe(id) {
    setData((d) => ({ ...d, recipes: (d.recipes || []).filter((r) => r.id !== id) }));
  }
  function addInput(entry) {
    setData((d) => ({ ...d, pepper: { ...d.pepper, inputs: [...(d.pepper.inputs || []), entry] } }));
  }
  function updateInput(id, patch) {
    setData((d) => ({ ...d, pepper: { ...d.pepper, inputs: (d.pepper.inputs || []).map((i) => (i.id === id ? { ...i, ...patch } : i)) } }));
  }
  function deleteInput(id) {
    setData((d) => ({ ...d, pepper: { ...d.pepper, inputs: (d.pepper.inputs || []).filter((i) => i.id !== id) } }));
  }

  /** Load a breed vaccination programme, skipping any shot already recorded. */
  function applyVaxTemplate() {
    const tpl = VAX_TEMPLATES[activeFlock.standardKey] || [];
    const existing = new Set(data.vax.filter((v) => v.flockId === activeFlock.id).map((v) => `${v.disease}|${v.date}`));
    const rows = tpl.map((t) => {
      const date = addDaysISO(activeFlock.startDate, t.day);
      return {
        id: newId(), flockId: activeFlock.id, date, disease: t.disease, vaccine: t.vaccine,
        route: t.route, nextDue: null, notes: `Day ${t.day} — from ${activeFlock.type} programme`,
        planned: true,
      };
    }).filter((r) => !existing.has(`${r.disease}|${r.date}`));
    if (!rows.length) {
      alert('This programme is already loaded for this flock.');
      return;
    }
    setData((d) => ({ ...d, vax: [...d.vax, ...rows] }));
    alert(`Loaded ${rows.length} vaccination dates for ${activeFlock.flockName}. Check them against your vet's advice.`);
  }

  function saveFlock(flock) {
    setData((d) => {
      const exists = d.flocks.some((f) => f.id === flock.id);
      return { ...d, flocks: exists ? d.flocks.map((f) => (f.id === flock.id ? flock : f)) : [...d.flocks, flock] };
    });
    setActiveFlockId(flock.id);
  }
  function addReminder(entry) {
    setData((d) => ({ ...d, reminders: [...(d.reminders || []), entry] }));
  }
  function toggleReminder(id) {
    setData((d) => ({ ...d, reminders: (d.reminders || []).map((r) => (r.id === id ? { ...r, done: !r.done } : r)) }));
  }
  function deleteReminder(id) {
    setData((d) => ({ ...d, reminders: (d.reminders || []).filter((r) => r.id !== id) }));
  }

  /* ---- cloud sync ---- */

  async function syncNow(mode = 'auto') {
    if (!isSyncConfigured()) { setModal('sync'); return; }
    setSync({ status: 'syncing', message: 'Syncing…', lastSync: sync.lastSync });
    try {
      const remote = await pullRemote();
      const localTime = data.updatedAt ? new Date(data.updatedAt).getTime() : 0;
      const remoteTime = remote ? new Date(remote.updatedAt).getTime() : 0;

      if (mode === 'pull' || (mode === 'auto' && remote && remoteTime > localTime)) {
        // Cloud copy is newer — take it.
        const merged = migrate(remote.state);
        setData(merged);
        setActiveFlockId(merged.flocks[0].id);
        setSync({ status: 'ok', message: 'Pulled latest from cloud', lastSync: new Date().toISOString() });
        return;
      }
      const at = await pushRemote(data);
      setData((d) => ({ ...d, updatedAt: at }));
      setSync({ status: 'ok', message: 'Saved to cloud', lastSync: at });
    } catch (err) {
      setSync({ status: 'error', message: err.message || 'Sync failed', lastSync: sync.lastSync });
    }
  }

  function backupData() {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ai-farms-backup-${todayISO()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
  function restoreData(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        const merged = migrate(parsed);
        setData(merged);
        setActiveFlockId(merged.flocks[0].id);
        alert('Backup restored successfully.');
      } catch (err) {
        alert('Could not read that file — make sure it is an AI Farms backup (.json).');
      }
    };
    reader.readAsText(file);
  }

  function exportWeeklyReport() {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 7);
    const recent = dailyLog.filter((r) => new Date(r.date) >= cutoff);
    const weekMortality = recent.reduce((s, r) => s + (Number(r.mortality) || 0), 0);
    const weekFeed = recent.reduce((s, r) => s + (Number(r.feedGiven) || 0), 0);
    const weekEggs = recent.reduce((s, r) => s + (Number(r.eggs) || 0), 0);
    const lines = [
      `AI FARMS — ${activeFlock.flockName} — Weekly Report`,
      `Generated ${fmtDate(todayISO())} · Day ${dayNumber} · Week ${weekNumber}`,
      '',
      `Current flock: ${num(currentBirds)} birds (${num(survivalRate, 1)}% survival)`,
      `Mortality (last 7 days logged): ${num(weekMortality)}`,
      `Feed used (last 7 days logged): ${num(weekFeed, 1)} kg`,
      `Eggs collected (last 7 days logged): ${num(weekEggs)}`,
      `Feed store balance: ${feedBalance != null ? num(feedBalance, 1) + ' kg' : '—'}`,
      `Total feed cost to date: ${totalFeedCost ? 'GH₵ ' + num(totalFeedCost, 2) : '—'}`,
      `Current feed phase: ${currentFeedPhase || '—'}`,
      `Weeks to point-of-lay (standard): ${weeksToPOL > 0 ? weeksToPOL : 'reached'}`,
      '',
      'Vaccination status:',
      ...vaxStatus.map((v) => `  - ${v.disease || v.vaccine}: last ${fmtDate(v.date)}, next due ${fmtDate(v.nextDue)}`),
      '',
      `Entries logged this week: ${recent.length}`,
      ...recent.map((r) => `  ${fmtDate(r.date)} — closing ${num(r.closing)}, deaths ${num(r.mortality)}, feed ${r.feedGiven ?? '—'}kg, eggs ${r.eggs ?? '—'}${r.notes ? ' — ' + r.notes : ''}`),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ai-farms-weekly-report-${todayISO()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function updateField(id, patch) {
    setData((d) => ({ ...d, pepper: { ...d.pepper, fields: d.pepper.fields.map((f) => (f.id === id ? { ...f, ...patch } : f)) } }));
  }
  function addScouting(entry) {
    setData((d) => ({ ...d, pepper: { ...d.pepper, scouting: [...d.pepper.scouting, entry] } }));
  }
  function addSpray(entry) {
    setData((d) => ({ ...d, pepper: { ...d.pepper, sprays: [...d.pepper.sprays, entry] } }));
  }
  function addHarvest(entry) {
    setData((d) => ({ ...d, pepper: { ...d.pepper, harvests: [...d.pepper.harvests, entry] } }));
  }

  return (
    <div className="app">
      <div className="workspace-switch">
        <button
          className={`ws-btn${workspace === 'poultry' ? ' active' : ''}`}
          onClick={() => { setWorkspace('poultry'); setModal(null); }}
        >Poultry</button>
        <button
          className={`ws-btn${workspace === 'pepper' ? ' active pepper' : ''}`}
          onClick={() => { setWorkspace('pepper'); setModal(null); }}
        >Bell Pepper Fields</button>
        <button
          className={`ws-btn${workspace === 'farm' ? ' active' : ''}`}
          onClick={() => { setWorkspace('farm'); setModal(null); }}
        >Whole Farm</button>
      </div>

      <SyncBar sync={sync} onSync={() => syncNow('auto')} onPull={() => syncNow('pull')} onSettings={() => setModal('sync')} />

      {workspace === 'poultry' && (<>
      <header className="header">
        <div>
          <p className="brand-eyebrow">AI Farms · Poultry Operations</p>
          <h1 className="brand-title">{activeFlock.flockName}</h1>
          <p className="brand-sub">{activeFlock.breed} · started {fmtDate(activeFlock.startDate)} · {activeFlock.location}</p>
        </div>
        <div className="day-stamp">
          <DayRing pct={survivalRate ? survivalRate / 100 : 1} />
          <div>
            <div className="num">Day {dayNumber} <span className="week-chip">Wk {weekNumber}</span></div>
            <div className="label">{num(survivalRate, 1)}% survival</div>
          </div>
        </div>
      </header>

      <div className="seg-row">
        <div className="flock-seg">
          {data.flocks.map((f) => (
            <button key={f.id} className={activeFlockId === f.id ? 'active' : ''} onClick={() => { setActiveFlockId(f.id); setModal(null); }}>
              {f.flockName}
            </button>
          ))}
          <button className="seg-add" onClick={() => setModal('flock:new')} title="Add a flock / new batch">+ Flock</button>
        </div>
        <div className="data-tools">
          <button className="btn" onClick={backupData} title="Download all data as a backup file">⤓ Backup</button>
          <button className="btn" onClick={() => restoreInputRef.current && restoreInputRef.current.click()} title="Restore from a backup file">⤒ Restore</button>
          <input
            ref={restoreInputRef} type="file" accept="application/json,.json" style={{ display: 'none' }}
            onChange={(e) => { if (e.target.files[0]) restoreData(e.target.files[0]); e.target.value = ''; }}
          />
        </div>
      </div>

      {isStale && (
        <div className="stale-banner">
          ⚠ <span>No daily log entries in <strong>{daysSinceLastEntry} days</strong> (last entry {fmtDate(latest.date)}). Numbers below may be out of date — log today's count to catch up.</span>
        </div>
      )}

      <nav className="tabs">
        {[
          ['dashboard', 'Dashboard'],
          ['log', 'Daily Log'],
          ['feed', 'Feed & Inventory'],
          ['mix', 'Feed Mix'],
          ['litter', 'Litter & Manure'],
          ['growth', 'Growth'],
          ['sales', 'Sales & Profit'],
          ['health', 'Health'],
          ['reminders', 'Reminders'],
        ].map(([id, label]) => (
          <button key={id} className={`tab${tab === id ? ' active' : ''}`} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </nav>

      {tab === 'dashboard' && (
        <DashboardTab
          currentBirds={currentBirds}
          totalMortality={totalMortality}
          survivalRate={survivalRate}
          totalFeed={totalFeed}
          feedBalance={feedBalance}
          totalFeedCost={totalFeedCost}
          feedCostPerBird={feedCostPerBird}
          henDayPct={henDayPct}
          totalEggs={totalEggs}
          totalCracked={totalCracked}
          weeksToPOL={weeksToPOL}
          polWeek={POL_WEEK}
          currentFeedPhase={currentFeedPhase}
          standardWeight={standardWeight}
          latestSample={latestSample}
          flockType={activeFlock.type}
          fcr={fcr}
          fcrTarget={fcrTarget}
          totalRevenue={totalRevenue}
          flockCost={flockCost}
          flockMargin={flockMargin}
          feedDaysLeft={feedDaysLeft}
          avgDailyFeed={avgDailyFeed}
          daysSinceLitterChange={daysSinceLitterChange}
          litterCondition={litterCondition}
          litterDue={litterDue}
          manureHarvested={manureHarvested}
          mortalityByCause={mortalityByCause}
          chartData={chartData}
          feedChartData={feedChartData}
          growthChartData={growthChartData}
          vaxStatus={vaxStatus}
          onExport={exportWeeklyReport}
        />
      )}

      {tab === 'log' && (
        <LogTab dailyLog={[...dailyLog].reverse()} onAdd={() => setModal('log')} />
      )}

      {tab === 'feed' && (
        <FeedTab feed={[...feed].reverse()} feedDaysLeft={feedDaysLeft} avgDailyFeed={avgDailyFeed} feedBalance={feedBalance} onAdd={() => setModal('feed')} />
      )}

      {tab === 'mix' && (
        <FeedMixTab
          recipes={data.recipes || []}
          flock={activeFlock}
          onSave={saveRecipe}
          onDelete={deleteRecipe}
        />
      )}

      {tab === 'litter' && (
        <LitterTab
          rows={[...litter].reverse()}
          fields={data.pepper.fields}
          daysSinceChange={daysSinceLitterChange}
          condition={litterCondition}
          due={litterDue}
          manureHarvested={manureHarvested}
          litterCost={litterCost}
          onAdd={() => setModal('litter')}
        />
      )}

      {tab === 'growth' && (
        <GrowthTab
          weightSamples={[...weightSamples].reverse()}
          growthChartData={growthChartData}
          feedStandard={flockStandard}
          flockType={activeFlock.type}
          onAdd={() => setModal('weight')}
        />
      )}

      {tab === 'sales' && (
        <SalesTab
          sales={[...sales].reverse()}
          flock={activeFlock}
          totalRevenue={totalRevenue}
          flockCost={flockCost}
          flockMargin={flockMargin}
          totalFeedCost={totalFeedCost}
          litterCost={litterCost}
          onAdd={() => setModal('sale')}
          onEditFlock={() => setModal(`flock:${activeFlock.id}`)}
        />
      )}

      {tab === 'reminders' && (
        <RemindersTab
          reminders={data.reminders || []}
          scope="poultry"
          autoItems={[
            ...vaxStatus.filter((v) => v.daysLeft !== null).map((v) => ({
              id: `vax-${v.disease || v.vaccine}`,
              title: `${v.disease || v.vaccine} vaccination`,
              dueDate: v.nextDue,
              daysLeft: v.daysLeft,
              source: activeFlock.flockName,
            })),
            ...(feedDaysLeft != null && feedDaysLeft <= 7 ? [{
              id: 'feed-runout',
              title: `Reorder feed — about ${feedDaysLeft} day(s) left in store`,
              dueDate: addDaysISO(todayISO(), Math.max(feedDaysLeft - 2, 0)),
              source: activeFlock.flockName,
            }] : []),
            ...(litterDue ? [{
              id: 'litter-due',
              title: `Litter change due (${daysSinceLitterChange} days since last)`,
              dueDate: todayISO(),
              source: activeFlock.flockName,
            }] : []),
            ...(litterCondition === 'Wet' || litterCondition === 'Caked' ? [{
              id: 'litter-condition',
              title: `Litter logged as ${litterCondition.toLowerCase()} — turn or top up to avoid ammonia`,
              dueDate: todayISO(),
              source: activeFlock.flockName,
            }] : []),
          ]}
          onAdd={() => setModal('reminder')}
          onToggle={toggleReminder}
          onDelete={deleteReminder}
        />
      )}

      {tab === 'health' && (
        <HealthTab
          meds={meds}
          vax={[...vax].reverse()}
          vaxStatus={vaxStatus}
          flock={activeFlock}
          onLoadTemplate={applyVaxTemplate}
          onAddMed={() => setModal('med')}
          onAddVax={() => setModal('vax')}
        />
      )}

      {modal === 'log' && (
        <LogForm
          lastClosing={latest ? latest.closing : activeFlock.initialBirds}
          flockType={activeFlock.type}
          onClose={() => setModal(null)}
          onSave={(e) => { addDailyLog(e); setModal(null); }}
        />
      )}
      {modal === 'feed' && (
        <FeedForm
          lastBalance={feedBalance}
          onClose={() => setModal(null)}
          onSave={(e) => { addFeed(e); setModal(null); }}
        />
      )}
      {modal === 'med' && (
        <MedForm onClose={() => setModal(null)} onSave={(e) => { addMed(e); setModal(null); }} />
      )}
      {modal === 'vax' && (
        <VaxForm onClose={() => setModal(null)} onSave={(e) => { addVax(e); setModal(null); }} />
      )}
      {modal === 'weight' && (
        <WeightForm onClose={() => setModal(null)} onSave={(e) => { addWeightSample(e); setModal(null); }} />
      )}
      {modal === 'sale' && (
        <SaleForm flock={activeFlock} onClose={() => setModal(null)} onSave={(e) => { addSale(e); setModal(null); }} />
      )}
      {modal === 'litter' && (
        <LitterForm
          fields={data.pepper.fields}
          onClose={() => setModal(null)}
          onSave={(e) => { addLitter(e); setModal(null); }}
        />
      )}
      {modal === 'reminder' && (
        <ReminderForm scope="poultry" onClose={() => setModal(null)} onSave={(e) => { addReminder(e); setModal(null); }} />
      )}
      {modal && modal.startsWith('flock:') && (
        <FlockForm
          flock={modal === 'flock:new' ? null : data.flocks.find((f) => f.id === modal.split(':')[1])}
          existingIds={data.flocks.map((f) => f.id)}
          onClose={() => setModal(null)}
          onSave={(f) => { saveFlock(f); setModal(null); }}
        />
      )}
      </>)}

      {workspace === 'pepper' && (
        <PepperWorkspace
          pepper={data.pepper}
          reminders={data.reminders || []}
          onUpdateField={updateField}
          onAddScouting={addScouting}
          onAddSpray={addSpray}
          onAddHarvest={addHarvest}
          onAddInput={addInput}
          onUpdateInput={updateInput}
          onDeleteInput={deleteInput}
          onAddReminder={addReminder}
          onToggleReminder={toggleReminder}
          onDeleteReminder={deleteReminder}
        />
      )}

      {workspace === 'farm' && (
        <FarmWorkspace
          data={data}
          onAddExpense={addExpense}
          onDeleteExpense={deleteExpense}
        />
      )}

      {modal === 'sync' && (
        <SyncSettingsForm
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); syncNow('auto'); }}
        />
      )}
    </div>
  );
}

/* ---------------- Dashboard ---------------- */

function DashboardTab({
  currentBirds, totalMortality, survivalRate, totalFeed, feedBalance,
  totalFeedCost, feedCostPerBird, henDayPct, totalEggs, totalCracked,
  weeksToPOL, polWeek, currentFeedPhase, standardWeight, latestSample,
  flockType, fcr, fcrTarget, totalRevenue, flockCost, flockMargin,
  feedDaysLeft, avgDailyFeed, daysSinceLitterChange, litterCondition, litterDue, manureHarvested,
  mortalityByCause, chartData, feedChartData, growthChartData, vaxStatus, onExport,
}) {
  const causeEntries = Object.entries(mortalityByCause);
  const isBroiler = flockType === 'broiler';
  const feedTone = feedDaysLeft == null ? undefined : feedDaysLeft <= 3 ? 'rust' : feedDaysLeft <= 7 ? 'gold' : 'green';
  const litterTone = litterCondition === 'Wet' || litterCondition === 'Caked' ? 'rust'
    : litterDue ? 'gold' : litterCondition ? 'green' : undefined;
  return (
    <>
      <div className="panel-head" style={{ marginBottom: 14 }}>
        <h3 style={{ fontSize: 18 }}>Overview</h3>
        <button className="btn" onClick={onExport}>⤓ Export weekly report</button>
      </div>

      <div className="grid grid-4">
        <StatCard title="Current Flock" value={num(currentBirds)} tone="gold" foot="birds on hand" />
        <StatCard title="Total Mortality" value={num(totalMortality)} tone="rust" foot={`${num(survivalRate, 1)}% survival`} />
        <StatCard title="Feed Used" value={`${num(totalFeed, 1)} kg`} foot={totalFeedCost ? `GH₵ ${num(totalFeedCost, 2)} spent` : 'cumulative to date'} />
        <StatCard title="Feed Balance" value={feedBalance !== null ? `${num(feedBalance, 1)} kg` : '—'} tone="green" foot="in store" />
      </div>

      <div className="grid grid-4" style={{ marginTop: 16 }}>
        {isBroiler ? (
          <StatCard
            title="FCR (to date)"
            value={fcr != null ? num(fcr, 2) : '—'}
            tone={fcr != null ? (fcr <= fcrTarget ? 'green' : 'rust') : undefined}
            foot={fcr != null ? `target ≤ ${num(fcrTarget, 2)} · kg feed / kg bird` : 'log feed + a weight sample'}
          />
        ) : (
          <StatCard
            title="Hen-Day Egg %"
            value={henDayPct !== null ? `${num(henDayPct, 1)}%` : '—'}
            tone="green"
            foot={totalEggs ? `${num(totalEggs)} eggs total, ${num(totalCracked)} cracked` : 'not laying yet'}
          />
        )}
        {isBroiler ? (
          <StatCard
            title="Avg Weight"
            value={latestSample ? `${num(latestSample.avgWeightG)} g` : '—'}
            tone={latestSample && standardWeight ? (latestSample.avgWeightG >= standardWeight ? 'green' : 'rust') : undefined}
            foot={standardWeight ? `target ${num(standardWeight)} g this week` : 'weigh a sample to compare'}
          />
        ) : (
          <StatCard
            title="Point of Lay"
            value={weeksToPOL > 0 ? `${weeksToPOL} wks away` : 'Reached'}
            tone="gold"
            foot={`standard ~week ${polWeek}`}
          />
        )}
        <StatCard
          title="Feed Phase"
          value={currentFeedPhase || '—'}
          foot="per breed feeding standard"
        />
        {isBroiler ? (
          <StatCard title="Feed / Bird" value={feedCostPerBird ? `GH₵ ${num(feedCostPerBird, 2)}` : '—'} foot="feed cost per bird" />
        ) : (
          <StatCard
            title="Weight vs Standard"
            value={latestSample ? `${num(latestSample.avgWeightG)} g` : '—'}
            tone={latestSample && standardWeight ? (latestSample.avgWeightG >= standardWeight ? 'green' : 'rust') : undefined}
            foot={standardWeight ? `target ${num(standardWeight)} g this week` : 'no standard for this week'}
          />
        )}
      </div>

      <div className="grid grid-4" style={{ marginTop: 16 }}>
        <StatCard title="Revenue" value={`GH₵ ${num(totalRevenue, 2)}`} tone="green" foot="sales logged for this flock" />
        <StatCard title="Cost" value={`GH₵ ${num(flockCost, 2)}`} tone="rust" foot="feed + litter + setup" />
        <StatCard title="Margin" value={`GH₵ ${num(flockMargin, 2)}`} tone={flockMargin >= 0 ? 'green' : 'rust'} foot={flockMargin >= 0 ? 'in profit' : 'below break-even'} />
        <StatCard title="Break-even" value={totalRevenue >= flockCost ? 'Reached' : `GH₵ ${num(flockCost - totalRevenue, 2)}`} foot={totalRevenue >= flockCost ? 'sales cover costs' : 'more sales to break even'} />
      </div>

      <div className="grid grid-4" style={{ marginTop: 16 }}>
        <StatCard
          title="Feed Runs Out"
          value={feedDaysLeft != null ? `${feedDaysLeft} days` : '—'}
          tone={feedTone}
          foot={avgDailyFeed ? `using ~${num(avgDailyFeed, 1)} kg/day` : 'log feed use to project'}
        />
        <StatCard
          title="Litter Age"
          value={daysSinceLitterChange != null ? `${daysSinceLitterChange} days` : '—'}
          tone={litterTone}
          foot={litterDue ? 'change due' : (litterCondition ? `last logged ${litterCondition.toLowerCase()}` : 'no litter logged')}
        />
        <StatCard
          title="Manure Banked"
          value={manureHarvested ? `${num(manureHarvested, 1)} bags` : '—'}
          tone="green"
          foot="cleared litter sent to fields"
        />
        <StatCard title="Feed / Bird" value={feedCostPerBird ? `GH₵ ${num(feedCostPerBird, 2)}` : '—'} foot="feed cost per bird" />
      </div>

      <div className="panel">
        <div className="panel-head"><h3>Flock population &amp; daily mortality</h3></div>
        <div className="chart-card">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid stroke="#423827" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="date" tickLine={false} axisLine={{ stroke: '#423827' }} />
              <YAxis yAxisId="left" tickLine={false} axisLine={false} />
              <YAxis yAxisId="right" orientation="right" tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ background: '#241F18', border: '1px solid #423827', borderRadius: 8, fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 12, color: '#B9AD9A' }} />
              <Area yAxisId="left" type="monotone" dataKey="closing" name="Birds" fill="#D4A53722" stroke="#D4A537" strokeWidth={2} />
              <Bar yAxisId="right" dataKey="mortality" name="Deaths" fill="#C15F41" barSize={10} radius={[3, 3, 0, 0]} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-2">
        <div className="panel">
          <div className="panel-head"><h3>Feed given per day (kg)</h3></div>
          <div className="chart-card">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid stroke="#423827" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" tickLine={false} axisLine={{ stroke: '#423827' }} />
                <YAxis tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ background: '#241F18', border: '1px solid #423827', borderRadius: 8, fontSize: 12 }} />
                <Area type="monotone" dataKey="feedGiven" name="Feed (kg)" fill="#7A9A6622" stroke="#7A9A66" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="panel">
          <div className="panel-head"><h3>Feed store balance (kg)</h3></div>
          <div className="chart-card">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={feedChartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid stroke="#423827" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" tickLine={false} axisLine={{ stroke: '#423827' }} />
                <YAxis tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ background: '#241F18', border: '1px solid #423827', borderRadius: 8, fontSize: 12 }} />
                <Area type="monotone" dataKey="balance" name="Balance (kg)" fill="#D4A53722" stroke="#D4A537" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid grid-2">
        <div className="panel">
          <div className="panel-head"><h3>Growth vs. breed standard (g)</h3></div>
          <div className="chart-card">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={growthChartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid stroke="#423827" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="week" tickLine={false} axisLine={{ stroke: '#423827' }} />
                <YAxis tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ background: '#241F18', border: '1px solid #423827', borderRadius: 8, fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 12, color: '#B9AD9A' }} />
                <Line type="monotone" dataKey="standard" name="Standard" stroke="#83786A" strokeWidth={2} dot={false} strokeDasharray="4 3" />
                <Line type="monotone" dataKey="actual" name="Your sample" stroke="#D4A537" strokeWidth={2} connectNulls dot={{ r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="panel">
          <div className="panel-head"><h3>Mortality by cause</h3></div>
          {causeEntries.length === 0 ? (
            <p className="empty">No cause-of-death tags recorded yet — add one next time you log a death.</p>
          ) : (
            <div className="table-wrap">
              <table className="data">
                <thead><tr><th>Cause</th><th>Birds lost</th></tr></thead>
                <tbody>
                  {causeEntries.map(([cause, n]) => (
                    <tr key={cause}><td>{cause}</td><td className="mono">{num(n)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <p className="section-title">Vaccination status</p>
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr><th>Disease</th><th>Last given</th><th>Method</th><th>Next due</th><th>Status</th></tr>
          </thead>
          <tbody>
            {vaxStatus.map((v, i) => (
              <tr key={i}>
                <td>{v.disease || v.vaccine}</td>
                <td className="mono">{fmtDate(v.date)}</td>
                <td>{v.method || '—'}</td>
                <td className="mono">{fmtDate(v.nextDue)}</td>
                <td>
                  {v.daysLeft === null ? <span className="tag">—</span>
                    : v.daysLeft < 0 ? <span className="tag rust">Overdue {Math.abs(v.daysLeft)}d</span>
                    : v.daysLeft <= 5 ? <span className="tag gold">Due in {v.daysLeft}d</span>
                    : <span className="tag green">OK · {v.daysLeft}d</span>}
                </td>
              </tr>
            ))}
            {vaxStatus.length === 0 && <tr><td colSpan={5} className="empty">No vaccination records yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}

/* ---------------- Daily Log tab ---------------- */

function LogTab({ dailyLog, onAdd }) {
  return (
    <>
      <div className="panel-head" style={{ marginBottom: 14 }}>
        <h3 style={{ fontSize: 18 }}>Daily Log</h3>
        <button className="btn btn-gold" onClick={onAdd}>+ Log today's entry</button>
      </div>
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Date</th><th>Age (d)</th><th>Opening</th><th>Mortality</th><th>Cause</th><th>Culls</th>
              <th>Closing</th><th>Feed (kg)</th><th>Water (L)</th><th>Light (h)</th><th>Eggs</th><th>Cracked</th><th>Meds/Vax</th><th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {dailyLog.map((r, i) => (
              <tr key={i}>
                <td className="mono">{fmtDate(r.date)}</td>
                <td className="mono">{r.birdAge ?? '—'}</td>
                <td className="mono">{num(r.opening)}</td>
                <td className="mono">{r.mortality ? <span style={{ color: 'var(--rust)' }}>{num(r.mortality)}</span> : num(r.mortality)}</td>
                <td>{r.mortalityCause ? <span className="tag rust">{r.mortalityCause}</span> : '—'}</td>
                <td className="mono">{num(r.culls)}</td>
                <td className="mono">{num(r.closing)}</td>
                <td className="mono">{r.feedGiven != null ? num(r.feedGiven, 2) : '—'}</td>
                <td className="mono">{r.waterGiven != null ? num(r.waterGiven, 1) : '—'}</td>
                <td className="mono">{r.lightHours != null ? num(r.lightHours, 1) : '—'}</td>
                <td className="mono">{num(r.eggs)}</td>
                <td className="mono">{num(r.eggsCracked)}</td>
                <td>{r.medication || '—'}</td>
                <td className="notes">{r.notes || ''}</td>
              </tr>
            ))}
            {dailyLog.length === 0 && <tr><td colSpan={14} className="empty">No entries yet — log the first day.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}

function LogForm({ lastClosing, onClose, onSave }) {
  const [f, setF] = useState({
    date: todayISO(), birdAge: '', opening: lastClosing ?? '', mortality: 0, mortalityCause: '', culls: 0,
    feedGiven: '', waterGiven: '', lightHours: '', eggs: '', eggsCracked: '', medication: '', notes: '',
  });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const closing = (Number(f.opening) || 0) - (Number(f.mortality) || 0) - (Number(f.culls) || 0);

  function submit() {
    if (!f.date || f.opening === '') return;
    onSave({
      date: f.date,
      birdAge: f.birdAge === '' ? null : Number(f.birdAge),
      opening: Number(f.opening),
      mortality: Number(f.mortality) || 0,
      mortalityCause: Number(f.mortality) > 0 ? (f.mortalityCause || null) : null,
      culls: Number(f.culls) || 0,
      closing,
      feedGiven: f.feedGiven === '' ? null : Number(f.feedGiven),
      waterGiven: f.waterGiven === '' ? null : Number(f.waterGiven),
      lightHours: f.lightHours === '' ? null : Number(f.lightHours),
      eggs: f.eggs === '' ? null : Number(f.eggs),
      eggsCracked: f.eggsCracked === '' ? null : Number(f.eggsCracked),
      medication: f.medication || null,
      notes: f.notes || null,
    });
  }

  return (
    <Modal title="Log today's entry" sub="Opening count defaults to yesterday's closing." onClose={onClose}>
      <div className="form-grid">
        <Field label="Date"><input type="date" value={f.date} onChange={set('date')} /></Field>
        <Field label="Bird age (days)"><input type="number" value={f.birdAge} onChange={set('birdAge')} /></Field>
        <Field label="Opening birds"><input type="number" value={f.opening} onChange={set('opening')} /></Field>
        <Field label="Mortality"><input type="number" value={f.mortality} onChange={set('mortality')} /></Field>
        <Field label="Cause of death">
          <select value={f.mortalityCause} onChange={set('mortalityCause')} disabled={!Number(f.mortality)}>
            <option value="">—</option>
            <option>Disease</option>
            <option>Predator</option>
            <option>Heat/cold stress</option>
            <option>Injury</option>
            <option>Unknown</option>
            <option>Other</option>
          </select>
        </Field>
        <Field label="Culls"><input type="number" value={f.culls} onChange={set('culls')} /></Field>
        <Field label="Closing (auto)"><input value={closing} disabled /></Field>
        <Field label="Feed given (kg)"><input type="number" step="0.01" value={f.feedGiven} onChange={set('feedGiven')} /></Field>
        <Field label="Water given (L)"><input type="number" step="0.1" value={f.waterGiven} onChange={set('waterGiven')} /></Field>
        <Field label="Light hours"><input type="number" step="0.5" value={f.lightHours} onChange={set('lightHours')} /></Field>
        <Field label="Eggs collected"><input type="number" value={f.eggs} onChange={set('eggs')} /></Field>
        <Field label="Eggs cracked/broken"><input type="number" value={f.eggsCracked} onChange={set('eggsCracked')} /></Field>
        <Field label="Medication / vaccine given" span2><input value={f.medication} onChange={set('medication')} /></Field>
        <Field label="Notes / observations" span2><textarea rows={3} value={f.notes} onChange={set('notes')} /></Field>
      </div>
      <div className="modal-actions">
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-gold" onClick={submit}>Save entry</button>
      </div>
    </Modal>
  );
}

/* ---------------- Feed tab ---------------- */

function FeedTab({ feed, feedDaysLeft, avgDailyFeed, feedBalance, onAdd }) {
  const totalCost = feed.reduce((s, r) => s + (Number(r.cost) || 0), 0);
  return (
    <>
      {feedDaysLeft != null && feedDaysLeft <= 7 && (
        <div className="stale-banner" style={{ marginBottom: 12 }}>
          ⚠ <span>
            Feed store down to <strong>{num(feedBalance, 1)} kg</strong> — about <strong>{feedDaysLeft} day(s)</strong> left
            at ~{num(avgDailyFeed, 1)} kg/day. Reorder now so you don&apos;t run out.
          </span>
        </div>
      )}
      <div className="panel-head" style={{ marginBottom: 14 }}>
        <h3 style={{ fontSize: 18 }}>Feed &amp; Inventory</h3>
        <button className="btn btn-gold" onClick={onAdd}>+ Add feed record</button>
      </div>
      {totalCost > 0 && (
        <p className="stat-foot" style={{ marginBottom: 10 }}>Total feed spend logged: <strong style={{ color: 'var(--gold)' }}>GH₵ {num(totalCost, 2)}</strong></p>
      )}
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr><th>Date</th><th>Feed type</th><th>Purchased (kg)</th><th>Cost (GH₵)</th><th>Used (kg)</th><th>Balance (kg)</th><th>Supplier</th><th>Notes</th></tr>
          </thead>
          <tbody>
            {feed.map((r, i) => (
              <tr key={i}>
                <td className="mono">{fmtDate(r.date)}</td>
                <td>{r.feedType || '—'}</td>
                <td className="mono">{r.purchased != null ? num(r.purchased, 1) : '—'}</td>
                <td className="mono">{r.cost != null ? num(r.cost, 2) : '—'}</td>
                <td className="mono">{r.used != null ? num(r.used, 2) : '—'}</td>
                <td className="mono">{r.balance != null ? num(r.balance, 1) : '—'}</td>
                <td>{r.supplier || '—'}</td>
                <td className="notes">{r.notes || ''}</td>
              </tr>
            ))}
            {feed.length === 0 && <tr><td colSpan={8} className="empty">No feed records yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}

function FeedForm({ lastBalance, onClose, onSave }) {
  const [f, setF] = useState({ date: todayISO(), feedType: '', purchased: '', cost: '', used: '', supplier: '', notes: '' });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const balance = (Number(lastBalance) || 0) + (Number(f.purchased) || 0) - (Number(f.used) || 0);

  function submit() {
    if (!f.date) return;
    onSave({
      date: f.date,
      feedType: f.feedType || null,
      purchased: f.purchased === '' ? null : Number(f.purchased),
      cost: f.cost === '' ? null : Number(f.cost),
      used: f.used === '' ? null : Number(f.used),
      balance,
      supplier: f.supplier || null,
      notes: f.notes || null,
    });
  }

  return (
    <Modal title="Add feed record" sub={`Running balance starts from ${lastBalance != null ? num(lastBalance, 1) : 0} kg.`} onClose={onClose}>
      <div className="form-grid">
        <Field label="Date"><input type="date" value={f.date} onChange={set('date')} /></Field>
        <Field label="Feed type"><input value={f.feedType} onChange={set('feedType')} placeholder="e.g. Grower Mash" /></Field>
        <Field label="Purchased (kg)"><input type="number" step="0.1" value={f.purchased} onChange={set('purchased')} /></Field>
        <Field label="Cost (GH₵)"><input type="number" step="0.01" value={f.cost} onChange={set('cost')} placeholder="if purchased today" /></Field>
        <Field label="Used (kg)"><input type="number" step="0.01" value={f.used} onChange={set('used')} /></Field>
        <Field label="Supplier"><input value={f.supplier} onChange={set('supplier')} /></Field>
        <Field label="Balance (auto)"><input value={num(balance, 1)} disabled /></Field>
        <Field label="Notes" span2><textarea rows={2} value={f.notes} onChange={set('notes')} /></Field>
      </div>
      <div className="modal-actions">
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-gold" onClick={submit}>Save record</button>
      </div>
    </Modal>
  );
}

/* ---------------- Health tab ---------------- */

function HealthTab({ meds, vax, vaxStatus, flock, onLoadTemplate, onAddMed, onAddVax }) {
  return (
    <>
      <div className="panel-head" style={{ marginBottom: 14 }}>
        <h3 style={{ fontSize: 18 }}>Health</h3>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className="btn" onClick={onLoadTemplate}>⤓ Load {flock?.type === 'broiler' ? 'Ross 308' : 'Hy-Line'} programme</button>
          <button className="btn" onClick={onAddVax}>+ Vaccination</button>
          <button className="btn btn-gold" onClick={onAddMed}>+ Medication</button>
        </div>
      </div>

      <p className="stat-foot" style={{ marginTop: 0, marginBottom: 14 }}>
        Loading a programme fills in the standard schedule from this flock&apos;s start date. These are typical
        Ghanaian schedules — confirm them with your vet or hatchery, since local disease pressure varies.
      </p>

      <p className="section-title" style={{ marginTop: 0 }}>Vaccination schedule</p>
      <div className="table-wrap">
        <table className="data">
          <thead><tr><th>Date</th><th>Vaccine</th><th>Disease</th><th>Bird age</th><th>Method</th><th>Next due</th><th>Notes</th></tr></thead>
          <tbody>
            {vax.map((v, i) => (
              <tr key={i}>
                <td className="mono">{fmtDate(v.date)}</td>
                <td>{v.vaccine}</td>
                <td>{v.disease}</td>
                <td className="mono">{v.birdAge ?? '—'}</td>
                <td>{v.method || '—'}</td>
                <td className="mono">{fmtDate(v.nextDue)}</td>
                <td className="notes">{v.notes || ''}</td>
              </tr>
            ))}
            {vax.length === 0 && <tr><td colSpan={7} className="empty">No vaccinations logged yet.</td></tr>}
          </tbody>
        </table>
      </div>

      <p className="section-title">Medications</p>
      <div className="table-wrap">
        <table className="data">
          <thead><tr><th>Date</th><th>Drug</th><th>Purpose</th><th>Dosage</th><th>Duration</th><th>By</th><th>Notes</th></tr></thead>
          <tbody>
            {meds.map((m, i) => (
              <tr key={i}>
                <td className="mono">{fmtDate(m.date)}</td>
                <td>{m.drug}</td>
                <td>{m.purpose || '—'}</td>
                <td>{m.dosage || '—'}</td>
                <td className="mono">{m.duration ? `${m.duration}d` : '—'}</td>
                <td>{m.by || '—'}</td>
                <td className="notes">{m.notes || ''}</td>
              </tr>
            ))}
            {meds.length === 0 && <tr><td colSpan={7} className="empty">No medications logged yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}

function MedForm({ onClose, onSave }) {
  const [f, setF] = useState({ date: todayISO(), drug: '', purpose: '', dosage: '', duration: '', by: 'Oscar', notes: '' });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  function submit() {
    if (!f.date || !f.drug) return;
    onSave({
      date: f.date, drug: f.drug, purpose: f.purpose || null, dosage: f.dosage || null,
      duration: f.duration === '' ? null : Number(f.duration), start: f.date, end: f.date,
      by: f.by || null, notes: f.notes || null,
    });
  }
  return (
    <Modal title="Add medication" onClose={onClose}>
      <div className="form-grid">
        <Field label="Date"><input type="date" value={f.date} onChange={set('date')} /></Field>
        <Field label="Drug name"><input value={f.drug} onChange={set('drug')} /></Field>
        <Field label="Purpose"><input value={f.purpose} onChange={set('purpose')} /></Field>
        <Field label="Dosage"><input value={f.dosage} onChange={set('dosage')} placeholder="e.g. 3g per 3L water" /></Field>
        <Field label="Duration (days)"><input type="number" value={f.duration} onChange={set('duration')} /></Field>
        <Field label="Administered by"><input value={f.by} onChange={set('by')} /></Field>
        <Field label="Notes" span2><textarea rows={2} value={f.notes} onChange={set('notes')} /></Field>
      </div>
      <div className="modal-actions">
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-gold" onClick={submit}>Save</button>
      </div>
    </Modal>
  );
}

function VaxForm({ onClose, onSave }) {
  const [f, setF] = useState({ date: todayISO(), vaccine: '', disease: '', birdAge: '', method: 'Water', nextDue: '', notes: '' });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  function submit() {
    if (!f.date || !f.vaccine) return;
    onSave({
      date: f.date, vaccine: f.vaccine, disease: f.disease || f.vaccine,
      birdAge: f.birdAge === '' ? null : Number(f.birdAge), method: f.method || null,
      nextDue: f.nextDue || null, notes: f.notes || null,
    });
  }
  return (
    <Modal title="Add vaccination" onClose={onClose}>
      <div className="form-grid">
        <Field label="Date given"><input type="date" value={f.date} onChange={set('date')} /></Field>
        <Field label="Vaccine name"><input value={f.vaccine} onChange={set('vaccine')} /></Field>
        <Field label="Disease"><input value={f.disease} onChange={set('disease')} /></Field>
        <Field label="Bird age (days)"><input type="number" value={f.birdAge} onChange={set('birdAge')} /></Field>
        <Field label="Method">
          <select value={f.method} onChange={set('method')}>
            <option>Water</option><option>Injection</option><option>Eye drop</option><option>Spray</option>
          </select>
        </Field>
        <Field label="Next due date"><input type="date" value={f.nextDue} onChange={set('nextDue')} /></Field>
        <Field label="Notes" span2><textarea rows={2} value={f.notes} onChange={set('notes')} /></Field>
      </div>
      <div className="modal-actions">
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-gold" onClick={submit}>Save</button>
      </div>
    </Modal>
  );
}

/* ---------------- Growth tab ---------------- */

function GrowthTab({ weightSamples, growthChartData, feedStandard, onAdd }) {
  return (
    <>
      <div className="panel-head" style={{ marginBottom: 14 }}>
        <h3 style={{ fontSize: 18 }}>Growth &amp; Weight Sampling</h3>
        <button className="btn btn-gold" onClick={onAdd}>+ Add weight sample</button>
      </div>

      <div className="panel">
        <div className="panel-head"><h3>Sample average vs. breed standard (g)</h3></div>
        <div className="chart-card">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={growthChartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid stroke="#423827" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="week" tickLine={false} axisLine={{ stroke: '#423827' }} />
              <YAxis tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ background: '#241F18', border: '1px solid #423827', borderRadius: 8, fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 12, color: '#B9AD9A' }} />
              <Line type="monotone" dataKey="standard" name="Standard" stroke="#83786A" strokeWidth={2} dot={false} strokeDasharray="4 3" />
              <Line type="monotone" dataKey="actual" name="Your sample" stroke="#D4A537" strokeWidth={2} connectNulls dot={{ r: 3 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      <p className="section-title">Weight samples logged</p>
      <div className="table-wrap">
        <table className="data">
          <thead><tr><th>Date</th><th>Sample size</th><th>Avg weight (g)</th><th>Notes</th></tr></thead>
          <tbody>
            {weightSamples.map((s, i) => (
              <tr key={i}>
                <td className="mono">{fmtDate(s.date)}</td>
                <td className="mono">{num(s.sampleSize)}</td>
                <td className="mono">{num(s.avgWeightG)}</td>
                <td className="notes">{s.notes || ''}</td>
              </tr>
            ))}
            {weightSamples.length === 0 && <tr><td colSpan={4} className="empty">No weight samples yet — weigh 10–20 birds and log the average weekly.</td></tr>}
          </tbody>
        </table>
      </div>

      <p className="section-title">Breed feeding &amp; growth standard (Hy-Line)</p>
      <div className="table-wrap">
        <table className="data">
          <thead><tr><th>Week</th><th>Feed type</th><th>Feed intake (g/bird/day)</th><th>Target weight (g)</th></tr></thead>
          <tbody>
            {feedStandard.map((r) => (
              <tr key={r.week}>
                <td className="mono">W{r.week}</td>
                <td>{r.feedType || '—'}</td>
                <td className="mono">{num(r.feedIntakePerBirdG)}</td>
                <td className="mono">{num(r.estWeightG)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function WeightForm({ onClose, onSave }) {
  const [f, setF] = useState({ date: todayISO(), sampleSize: '', avgWeightG: '', notes: '' });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  function submit() {
    if (!f.date || f.avgWeightG === '') return;
    onSave({
      date: f.date,
      sampleSize: f.sampleSize === '' ? null : Number(f.sampleSize),
      avgWeightG: Number(f.avgWeightG),
      notes: f.notes || null,
    });
  }
  return (
    <Modal title="Add weight sample" sub="Weigh 10–20 birds and enter the average — the more you sample, the more reliable the trend." onClose={onClose}>
      <div className="form-grid">
        <Field label="Date"><input type="date" value={f.date} onChange={set('date')} /></Field>
        <Field label="Sample size (birds weighed)"><input type="number" value={f.sampleSize} onChange={set('sampleSize')} /></Field>
        <Field label="Average weight (g)" span2><input type="number" step="1" value={f.avgWeightG} onChange={set('avgWeightG')} /></Field>
        <Field label="Notes" span2><textarea rows={2} value={f.notes} onChange={set('notes')} /></Field>
      </div>
      <div className="modal-actions">
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-gold" onClick={submit}>Save sample</button>
      </div>
    </Modal>
  );
}

/* ============================================================= */
/* ==================== PEPPER FIELDS WORKSPACE ================= */
/* ============================================================= */

const PEST_OPTIONS = [
  'Aphids', 'Whitefly', 'CMV symptoms', 'Thrips', 'Spider mites',
  'Fruit / blossom rot', 'Bacterial spot', 'Leaf miner', 'Caterpillars', 'Healthy check', 'Other',
];
const SEVERITY = ['Low', 'Medium', 'High'];
const SPRAY_TYPES = ['Insecticide', 'Fungicide', 'Foliar feed', 'Fertigation', 'Other'];
const GRADES = ['Grade A', 'Grade B', 'Reject / off-grade'];

function sev2num(s) { return s === 'High' ? 3 : s === 'Medium' ? 2 : s === 'Low' ? 1 : 0; }
function addDaysISO(iso, days) {
  const d = new Date(iso);
  d.setDate(d.getDate() + (Number(days) || 0));
  return d.toISOString().slice(0, 10);
}
function newId() { return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`; }

function PepperWorkspace({ pepper, reminders, onUpdateField, onAddScouting, onAddSpray, onAddHarvest, onAddInput, onUpdateInput, onDeleteInput, onAddReminder, onToggleReminder, onDeleteReminder }) {
  const [ptab, setPtab] = useState('dashboard');
  const [scope, setScope] = useState('all');   // 'all' | 'A' | 'B'
  const [modal, setModal] = useState(null);      // 'field:A' | 'scout' | 'spray' | 'harvest'

  const fields = pepper.fields;
  const inScope = (fieldId) => scope === 'all' || fieldId === scope;
  const fieldName = (id) => (fields.find((f) => f.id === id) || {}).name || id;

  const scouting = useMemo(() => [...pepper.scouting].sort((a, b) => new Date(a.date) - new Date(b.date)), [pepper.scouting]);
  const sprays = useMemo(() => [...pepper.sprays].sort((a, b) => new Date(a.date) - new Date(b.date)), [pepper.sprays]);
  const harvests = useMemo(() => [...pepper.harvests].sort((a, b) => new Date(a.date) - new Date(b.date)), [pepper.harvests]);

  const scoutScoped = scouting.filter((s) => inScope(s.fieldId));
  const sprayScoped = sprays.filter((s) => inScope(s.fieldId));
  const harvestScoped = harvests.filter((s) => inScope(s.fieldId));
  const fieldsScoped = fields.filter((f) => inScope(f.id));

  const activeField = scope === 'all' ? null : fields.find((f) => f.id === scope);
  const datOf = (f) => (f && f.transplantDate ? daysBetween(f.transplantDate, todayISO()) : null);
  const headerDat = datOf(activeField);
  const headerRingPct = activeField && headerDat != null && activeField.expectedHarvestDAT
    ? headerDat / activeField.expectedHarvestDAT : 1;

  const totalPlants = fieldsScoped.reduce((s, f) => s + (Number(f.plantCount) || 0), 0);
  const totalKg = harvestScoped.reduce((s, h) => s + (Number(h.weightKg) || 0), 0);
  const revenue = harvestScoped.reduce((s, h) => s + (Number(h.weightKg) || 0) * (Number(h.pricePerKg) || 0), 0);
  const inputCost = sprayScoped.reduce((s, r) => s + (Number(r.cost) || 0), 0);
  const setupCost = fieldsScoped.reduce((s, f) => s + (Number(f.setupCost) || 0), 0);
  const totalCost = inputCost + setupCost;
  const margin = revenue - totalCost;
  const avgPrice = totalKg ? revenue / totalKg : null;

  const latestScout = scoutScoped[scoutScoped.length - 1];
  const pressureTone = latestScout
    ? (latestScout.severity === 'High' ? 'rust' : latestScout.severity === 'Medium' ? 'gold' : 'green')
    : undefined;

  // Pre-harvest interval: is any field still inside its "don't harvest yet" window?
  const phiWindows = fields.map((f) => {
    const fs = sprays.filter((s) => s.fieldId === f.id && s.phiDays);
    if (!fs.length) return null;
    const last = fs[fs.length - 1];
    const safe = addDaysISO(last.date, last.phiDays);
    const daysLeft = daysBetween(todayISO(), safe);
    return daysLeft > 0 ? { field: f, safe, daysLeft, product: last.product } : null;
  }).filter(Boolean);
  const scopePhi = phiWindows.filter((w) => inScope(w.field.id));
  const soonestClear = scopePhi.length ? Math.min(...scopePhi.map((w) => w.daysLeft)) : null;

  // Resistance nudge: last two insecticides on a field sharing the same active ingredient.
  const resistanceFlags = fields.map((f) => {
    const ins = sprays.filter((s) => s.fieldId === f.id && s.type === 'Insecticide' && s.activeIngredient);
    if (ins.length < 2) return null;
    const a = ins[ins.length - 1], b = ins[ins.length - 2];
    if (a.activeIngredient.trim().toLowerCase() === b.activeIngredient.trim().toLowerCase()) {
      return { field: f, ai: a.activeIngredient };
    }
    return null;
  }).filter(Boolean);
  const scopeResistance = resistanceFlags.filter((w) => inScope(w.field.id));

  // Auto reminders for the pepper side: active harvest holds + scouting overdue.
  const lastScoutByField = {};
  scouting.forEach((s) => { lastScoutByField[s.fieldId] = s.date; });
  const pepperAuto = [
    ...phiWindows.map((w) => ({ id: `phi-${w.field.id}`, title: `${w.field.name}: harvest hold (${w.product || 'spray'})`, dueDate: w.safe, source: w.field.name })),
    ...fields.map((f) => {
      const last = lastScoutByField[f.id];
      const days = last ? daysBetween(last, todayISO()) : null;
      if (last && days <= 4) return null;
      return { id: `scout-${f.id}`, title: `Scout ${f.name}${last ? ` (last ${days}d ago)` : ' (not scouted yet)'}`, dueDate: todayISO(), source: f.name };
    }).filter(Boolean),
  ];

  const harvestChart = harvestScoped.map((h) => ({
    date: fmtDate(h.date).slice(0, 6),
    kg: Number(h.weightKg) || 0,
    revenue: Math.round((Number(h.weightKg) || 0) * (Number(h.pricePerKg) || 0)),
  }));
  const pressureChart = scoutScoped.map((s) => ({
    date: fmtDate(s.date).slice(0, 6),
    pressure: sev2num(s.severity),
    pest: s.pest,
  }));

  const scopeOptions = [['all', 'Both fields'], ...fields.map((f) => [f.id, f.name])];

  return (
    <>
      <header className="header">
        <div>
          <p className="brand-eyebrow pepper">AI Farms · Bell Pepper</p>
          <h1 className="brand-title">Bell Pepper Fields</h1>
          <p className="brand-sub">
            Eikwe, Western Region · {fields.length} fields
            {activeField ? ` · viewing ${activeField.name}` : ' · all fields combined'}
          </p>
        </div>
        <div className="day-stamp">
          <DayRing pct={headerRingPct} color="#7A9A66" />
          <div>
            <div className="num pepper">
              {activeField
                ? (headerDat != null ? `DAT ${headerDat}` : '—')
                : num(totalPlants)}
              <span className="week-chip">
                {activeField
                  ? (headerDat != null ? `Wk ${Math.ceil((headerDat + 1) / 7)}` : 'set date')
                  : 'plants'}
              </span>
            </div>
            <div className="label">
              {activeField
                ? (activeField.variety || 'no variety set')
                : 'total in ground'}
            </div>
          </div>
        </div>
      </header>

      <div className="field-seg">
        {scopeOptions.map(([id, label]) => (
          <button key={id} className={scope === id ? 'active' : ''} onClick={() => setScope(id)}>{label}</button>
        ))}
      </div>

      <nav className="tabs pepper">
        {[
          ['dashboard', 'Dashboard'],
          ['cycle', 'Crop Cycle'],
          ['scout', 'Scouting'],
          ['spray', 'Spray & Fertigation'],
          ['inputs', 'Input Stock'],
          ['harvest', 'Harvest & Sales'],
          ['reminders', 'Reminders'],
        ].map(([id, label]) => (
          <button key={id} className={`tab${ptab === id ? ' active' : ''}`} onClick={() => setPtab(id)}>{label}</button>
        ))}
      </nav>

      {ptab === 'dashboard' && (
        <PepperDashboard
          scope={scope} fieldsScoped={fieldsScoped} totalPlants={totalPlants} totalKg={totalKg}
          revenue={revenue} totalCost={totalCost} inputCost={inputCost} setupCost={setupCost}
          margin={margin} avgPrice={avgPrice} latestScout={latestScout} pressureTone={pressureTone}
          scopePhi={scopePhi} soonestClear={soonestClear} scopeResistance={scopeResistance}
          harvestChart={harvestChart} pressureChart={pressureChart} harvestScoped={harvestScoped}
          datOf={datOf}
        />
      )}

      {ptab === 'cycle' && (
        <CropCycleTab fields={fieldsScoped} datOf={datOf} onEdit={(id) => setModal(`field:${id}`)} />
      )}

      {ptab === 'scout' && (
        <ScoutingTab rows={[...scoutScoped].reverse()} fieldName={fieldName} onAdd={() => setModal('scout')} />
      )}

      {ptab === 'spray' && (
        <SprayTab
          rows={[...sprayScoped].reverse()} fieldName={fieldName}
          scopePhi={scopePhi} scopeResistance={scopeResistance} onAdd={() => setModal('spray')}
        />
      )}

      {ptab === 'harvest' && (
        <HarvestTab rows={[...harvestScoped].reverse()} fieldName={fieldName} totalKg={totalKg} revenue={revenue} onAdd={() => setModal('harvest')} />
      )}

      {ptab === 'inputs' && (
        <InputsTab
          inputs={pepper.inputs || []}
          onAdd={() => setModal('input')}
          onUpdate={onUpdateInput}
          onDelete={onDeleteInput}
        />
      )}

      {ptab === 'reminders' && (
        <RemindersTab
          reminders={reminders}
          scope="pepper"
          accent="green"
          autoItems={[
            ...pepperAuto,
            ...(pepper.inputs || [])
              .filter((i) => i.reorderAt != null && Number(i.quantity) <= Number(i.reorderAt))
              .map((i) => ({
                id: `input-${i.id}`,
                title: `Restock ${i.name} — ${num(i.quantity, 1)} ${i.unit} left`,
                dueDate: todayISO(),
                source: 'Input stock',
              })),
          ]}
          onAdd={() => setModal('reminder')}
          onToggle={onToggleReminder}
          onDelete={onDeleteReminder}
        />
      )}

      {modal && modal.startsWith('field:') && (
        <FieldForm
          field={fields.find((f) => f.id === modal.split(':')[1])}
          onClose={() => setModal(null)}
          onSave={(patch) => { onUpdateField(modal.split(':')[1], patch); setModal(null); }}
        />
      )}
      {modal === 'scout' && (
        <ScoutForm fields={fields} defaultField={scope === 'all' ? fields[0].id : scope}
          onClose={() => setModal(null)} onSave={(e) => { onAddScouting(e); setModal(null); }} />
      )}
      {modal === 'spray' && (
        <SprayForm fields={fields} defaultField={scope === 'all' ? fields[0].id : scope}
          onClose={() => setModal(null)} onSave={(e) => { onAddSpray(e); setModal(null); }} />
      )}
      {modal === 'harvest' && (
        <HarvestForm fields={fields} defaultField={scope === 'all' ? fields[0].id : scope}
          onClose={() => setModal(null)} onSave={(e) => { onAddHarvest(e); setModal(null); }} />
      )}
      {modal === 'reminder' && (
        <ReminderForm scope="pepper" onClose={() => setModal(null)} onSave={(e) => { onAddReminder(e); setModal(null); }} />
      )}
      {modal === 'input' && (
        <InputForm onClose={() => setModal(null)} onSave={(e) => { onAddInput(e); setModal(null); }} />
      )}
    </>
  );
}

/* ---------------- Pepper dashboard ---------------- */

function PepperDashboard({
  scope, fieldsScoped, totalPlants, totalKg, revenue, totalCost, inputCost, setupCost,
  margin, avgPrice, latestScout, pressureTone, scopePhi, soonestClear, scopeResistance,
  harvestChart, pressureChart, harvestScoped, datOf,
}) {
  const alerts = [];
  scopePhi.forEach((w) => alerts.push({ tone: 'rust', text: `${w.field.name}: don't harvest for ${w.daysLeft} more day(s) — pre-harvest interval after ${w.product || 'last spray'} clears ${fmtDate(w.safe)}.` }));
  scopeResistance.forEach((w) => alerts.push({ tone: 'gold', text: `${w.field.name}: last two insecticides both used "${w.ai}". Rotate to a different active ingredient to slow resistance.` }));
  if (latestScout && latestScout.severity === 'High') {
    alerts.push({ tone: 'rust', text: `High pest pressure last logged (${latestScout.pest}) on ${fmtDate(latestScout.date)}. Act before it spreads — aphids/whitefly drive CMV.` });
  }

  return (
    <>
      <div className="grid grid-4">
        <StatCard title="Plant Stand" value={num(totalPlants)} tone="green" foot={scope === 'all' ? 'both fields' : 'in this field'} />
        <StatCard
          title="Pest Pressure"
          value={latestScout ? latestScout.severity : 'None yet'}
          tone={pressureTone}
          foot={latestScout ? `${latestScout.pest} · ${fmtDate(latestScout.date)}` : 'log a scouting round'}
        />
        <StatCard
          title="Harvest Hold"
          value={soonestClear != null ? `${soonestClear}d` : 'Clear'}
          tone={soonestClear != null ? 'rust' : 'green'}
          foot={soonestClear != null ? 'within pre-harvest interval' : 'safe to pick'}
        />
        <StatCard title="Harvested" value={`${num(totalKg, 1)} kg`} tone="gold" foot={`${harvestScoped.length} pick(s) logged`} />
      </div>

      <div className="grid grid-4" style={{ marginTop: 16 }}>
        <StatCard title="Revenue" value={`GH₵ ${num(revenue, 2)}`} tone="green" foot="from harvest sales" />
        <StatCard title="Cost" value={`GH₵ ${num(totalCost, 2)}`} tone="rust" foot={`inputs ${num(inputCost, 0)} + setup ${num(setupCost, 0)}`} />
        <StatCard title="Margin" value={`GH₵ ${num(margin, 2)}`} tone={margin >= 0 ? 'green' : 'rust'} foot={margin >= 0 ? 'in profit' : 'below break-even'} />
        <StatCard title="Avg Price" value={avgPrice != null ? `GH₵ ${num(avgPrice, 2)}` : '—'} foot="per kg sold" />
      </div>

      <div className="panel" style={{ marginTop: 20 }}>
        <div className="panel-head"><h3>Alerts &amp; actions</h3></div>
        {alerts.length === 0 ? (
          <p className="empty" style={{ padding: '18px 0' }}>All clear — no active harvest holds, resistance nudges, or high-pressure flags in this view.</p>
        ) : (
          <div style={{ paddingBottom: 10 }}>
            {alerts.map((a, i) => (
              <div className="alert-row" key={i}>
                <span className={`tag ${a.tone}`}>{a.tone === 'rust' ? '!' : '•'}</span>
                <span>{a.text}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-2">
        <div className="panel">
          <div className="panel-head"><h3>Harvest (kg) &amp; revenue (GH₵)</h3></div>
          <div className="chart-card">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={harvestChart} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid stroke="#423827" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" tickLine={false} axisLine={{ stroke: '#423827' }} />
                <YAxis yAxisId="left" tickLine={false} axisLine={false} />
                <YAxis yAxisId="right" orientation="right" tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ background: '#241F18', border: '1px solid #423827', borderRadius: 8, fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 12, color: '#B9AD9A' }} />
                <Bar yAxisId="left" dataKey="kg" name="Harvest (kg)" fill="#7A9A66" barSize={12} radius={[3, 3, 0, 0]} />
                <Line yAxisId="right" type="monotone" dataKey="revenue" name="Revenue (GH₵)" stroke="#D4A537" strokeWidth={2} dot={{ r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="panel">
          <div className="panel-head"><h3>Pest pressure trend</h3></div>
          <div className="chart-card">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={pressureChart} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid stroke="#423827" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" tickLine={false} axisLine={{ stroke: '#423827' }} />
                <YAxis domain={[0, 3]} ticks={[0, 1, 2, 3]} tickFormatter={(v) => ['–', 'Low', 'Med', 'High'][v]} tickLine={false} axisLine={false} width={44} />
                <Tooltip
                  contentStyle={{ background: '#241F18', border: '1px solid #423827', borderRadius: 8, fontSize: 12 }}
                  formatter={(v, n, p) => [['–', 'Low', 'Medium', 'High'][v], p.payload.pest]}
                />
                <Area type="monotone" dataKey="pressure" name="Pressure" fill="#C15F4122" stroke="#C15F41" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <p className="section-title">Field snapshot</p>
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr><th>Field</th><th>Variety</th><th>DAT</th><th>Plants</th><th>Setup cost</th><th>Expected 1st harvest</th></tr>
          </thead>
          <tbody>
            {fieldsScoped.map((f) => {
              const dat = datOf(f);
              const firstHarvest = f.transplantDate && f.expectedHarvestDAT ? addDaysISO(f.transplantDate, f.expectedHarvestDAT) : null;
              return (
                <tr key={f.id}>
                  <td>{f.name}</td>
                  <td>{f.variety || '—'}</td>
                  <td className="mono">{dat != null ? dat : '—'}</td>
                  <td className="mono">{num(f.plantCount)}</td>
                  <td className="mono">{f.setupCost != null ? `GH₵ ${num(f.setupCost, 2)}` : '—'}</td>
                  <td className="mono">{firstHarvest ? fmtDate(firstHarvest) : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

/* ---------------- Crop cycle ---------------- */

function CropCycleTab({ fields, datOf, onEdit }) {
  return (
    <>
      <div className="panel-head" style={{ marginBottom: 14 }}>
        <h3 style={{ fontSize: 18 }}>Crop Cycle</h3>
      </div>
      <div className="field-card-grid">
        {fields.map((f) => {
          const dat = datOf(f);
          const week = dat != null ? Math.ceil((dat + 1) / 7) : null;
          const firstHarvest = f.transplantDate && f.expectedHarvestDAT ? addDaysISO(f.transplantDate, f.expectedHarvestDAT) : null;
          const toHarvest = firstHarvest ? daysBetween(todayISO(), firstHarvest) : null;
          return (
            <div className="panel" key={f.id} style={{ marginBottom: 0 }}>
              <div className="panel-head">
                <h3>{f.name}</h3>
                <button className="btn" onClick={() => onEdit(f.id)}>Edit</button>
              </div>
              <div style={{ padding: '4px 0 10px' }}>
                <div className="kv"><span className="k">Variety</span><span className="v">{f.variety || '—'}</span></div>
                <div className="kv"><span className="k">Transplanted</span><span className="v">{f.transplantDate ? fmtDate(f.transplantDate) : '—'}</span></div>
                <div className="kv"><span className="k">Days after transplant</span><span className="v">{dat != null ? `${dat} (Wk ${week})` : '—'}</span></div>
                <div className="kv"><span className="k">Plants in ground</span><span className="v">{num(f.plantCount)}</span></div>
                <div className="kv"><span className="k">Spacing</span><span className="v">{f.spacing || '—'}</span></div>
                <div className="kv"><span className="k">Expected 1st harvest</span><span className="v">{firstHarvest ? `${fmtDate(firstHarvest)}${toHarvest != null ? (toHarvest > 0 ? ` (${toHarvest}d)` : ' (due)') : ''}` : '—'}</span></div>
                <div className="kv"><span className="k">Setup cost</span><span className="v">{f.setupCost != null ? `GH₵ ${num(f.setupCost, 2)}` : '—'}</span></div>
                {f.notes && <div className="kv"><span className="k">Notes</span><span className="v" style={{ textAlign: 'right' }}>{f.notes}</span></div>}
              </div>
            </div>
          );
        })}
      </div>
      <p className="stat-foot" style={{ marginTop: 14 }}>
        Bell peppers usually reach first harvest around 60–90 days after transplant; the default is set to 70. Adjust per field once you see how your crop runs.
      </p>
    </>
  );
}

function FieldForm({ field, onClose, onSave }) {
  const [f, setF] = useState({
    variety: field.variety || '', transplantDate: field.transplantDate || '',
    plantCount: field.plantCount ?? '', spacing: field.spacing || '',
    expectedHarvestDAT: field.expectedHarvestDAT ?? 70, setupCost: field.setupCost ?? '', notes: field.notes || '',
  });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  function submit() {
    onSave({
      variety: f.variety || '', transplantDate: f.transplantDate || '',
      plantCount: f.plantCount === '' ? null : Number(f.plantCount),
      spacing: f.spacing || '',
      expectedHarvestDAT: f.expectedHarvestDAT === '' ? null : Number(f.expectedHarvestDAT),
      setupCost: f.setupCost === '' ? null : Number(f.setupCost),
      notes: f.notes || '',
    });
  }
  return (
    <Modal title={`Edit ${field.name}`} sub="Crop cycle details for this field." onClose={onClose}>
      <div className="form-grid">
        <Field label="Variety"><input value={f.variety} onChange={set('variety')} placeholder="e.g. California Wonder" /></Field>
        <Field label="Transplant date"><input type="date" value={f.transplantDate} onChange={set('transplantDate')} /></Field>
        <Field label="Plants in ground"><input type="number" value={f.plantCount} onChange={set('plantCount')} /></Field>
        <Field label="Spacing"><input value={f.spacing} onChange={set('spacing')} placeholder="e.g. 45cm × 60cm" /></Field>
        <Field label="Expected 1st harvest (DAT)"><input type="number" value={f.expectedHarvestDAT} onChange={set('expectedHarvestDAT')} /></Field>
        <Field label="Setup cost (GH₵)"><input type="number" step="0.01" value={f.setupCost} onChange={set('setupCost')} placeholder="seedlings, land prep, drip, labour" /></Field>
        <Field label="Notes" span2><textarea rows={2} value={f.notes} onChange={set('notes')} /></Field>
      </div>
      <div className="modal-actions">
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-green" onClick={submit}>Save field</button>
      </div>
    </Modal>
  );
}

/* ---------------- Scouting ---------------- */

function ScoutingTab({ rows, fieldName, onAdd }) {
  return (
    <>
      <div className="panel-head" style={{ marginBottom: 14 }}>
        <h3 style={{ fontSize: 18 }}>Scouting — Pest &amp; Disease</h3>
        <button className="btn btn-green" onClick={onAdd}>+ Log scouting round</button>
      </div>
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr><th>Date</th><th>Field</th><th>Pest / issue</th><th>Severity</th><th>% affected</th><th>Action taken</th><th>Notes</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="mono">{fmtDate(r.date)}</td>
                <td>{fieldName(r.fieldId)}</td>
                <td>{r.pest}</td>
                <td>
                  <span className={`tag ${r.severity === 'High' ? 'rust' : r.severity === 'Medium' ? 'gold' : 'green'}`}>{r.severity}</span>
                </td>
                <td className="mono">{r.pctAffected != null ? `${num(r.pctAffected)}%` : '—'}</td>
                <td>{r.action || '—'}</td>
                <td className="notes">{r.notes || ''}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={7} className="empty">No scouting logged yet — walk the rows and record what you see, even a clean check.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="stat-foot">Scout at least twice a week. Catching aphids and whitefly early is your best defence against CMV — the trend chart on the dashboard shows whether pressure is building.</p>
    </>
  );
}

function ScoutForm({ fields, defaultField, onClose, onSave }) {
  const [f, setF] = useState({ date: todayISO(), fieldId: defaultField, pest: PEST_OPTIONS[0], severity: 'Low', pctAffected: '', action: '', notes: '' });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  function submit() {
    if (!f.date || !f.fieldId) return;
    onSave({
      id: newId(), date: f.date, fieldId: f.fieldId, pest: f.pest, severity: f.severity,
      pctAffected: f.pctAffected === '' ? null : Number(f.pctAffected),
      action: f.action || null, notes: f.notes || null,
    });
  }
  return (
    <Modal title="Log scouting round" sub="What you saw walking the field today." onClose={onClose}>
      <div className="form-grid">
        <Field label="Date"><input type="date" value={f.date} onChange={set('date')} /></Field>
        <Field label="Field">
          <select value={f.fieldId} onChange={set('fieldId')}>
            {fields.map((fl) => <option key={fl.id} value={fl.id}>{fl.name}</option>)}
          </select>
        </Field>
        <Field label="Pest / issue">
          <select value={f.pest} onChange={set('pest')}>
            {PEST_OPTIONS.map((p) => <option key={p}>{p}</option>)}
          </select>
        </Field>
        <Field label="Severity">
          <select value={f.severity} onChange={set('severity')}>
            {SEVERITY.map((s) => <option key={s}>{s}</option>)}
          </select>
        </Field>
        <Field label="% plants affected"><input type="number" value={f.pctAffected} onChange={set('pctAffected')} /></Field>
        <Field label="Action taken"><input value={f.action} onChange={set('action')} placeholder="e.g. sprayed, rogued plants" /></Field>
        <Field label="Notes" span2><textarea rows={2} value={f.notes} onChange={set('notes')} /></Field>
      </div>
      <div className="modal-actions">
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-green" onClick={submit}>Save</button>
      </div>
    </Modal>
  );
}

/* ---------------- Spray & fertigation ---------------- */

function SprayTab({ rows, fieldName, scopePhi, scopeResistance, onAdd }) {
  return (
    <>
      <div className="panel-head" style={{ marginBottom: 14 }}>
        <h3 style={{ fontSize: 18 }}>Spray &amp; Fertigation</h3>
        <button className="btn btn-green" onClick={onAdd}>+ Log spray / feed</button>
      </div>

      {scopePhi.map((w) => (
        <div className="stale-banner" key={`phi-${w.field.id}`} style={{ marginBottom: 10 }}>
          ⚠ <span><strong>{w.field.name}</strong> — hold harvest {w.daysLeft} more day(s). Pre-harvest interval clears {fmtDate(w.safe)}.</span>
        </div>
      ))}
      {scopeResistance.map((w) => (
        <div className="stale-banner" key={`res-${w.field.id}`} style={{ marginBottom: 10 }}>
          ⚠ <span><strong>{w.field.name}</strong> — last two insecticides both "{w.ai}". Rotate the active ingredient to slow resistance.</span>
        </div>
      ))}

      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr><th>Date</th><th>Field</th><th>Type</th><th>Product</th><th>Active ingredient</th><th>Rate</th><th>Cost (GH₵)</th><th>PHI (d)</th><th>Safe to harvest</th><th>Notes</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const safe = r.phiDays ? addDaysISO(r.date, r.phiDays) : null;
              const held = safe && daysBetween(todayISO(), safe) > 0;
              return (
                <tr key={r.id}>
                  <td className="mono">{fmtDate(r.date)}</td>
                  <td>{fieldName(r.fieldId)}</td>
                  <td>{r.type}</td>
                  <td>{r.product || '—'}</td>
                  <td>{r.activeIngredient || '—'}</td>
                  <td className="mono">{r.rate || '—'}</td>
                  <td className="mono">{r.cost != null ? num(r.cost, 2) : '—'}</td>
                  <td className="mono">{r.phiDays != null ? r.phiDays : '—'}</td>
                  <td className="mono">{safe ? <span className={held ? 'tag rust' : 'tag green'}>{fmtDate(safe)}</span> : '—'}</td>
                  <td className="notes">{r.notes || ''}</td>
                </tr>
              );
            })}
            {rows.length === 0 && <tr><td colSpan={10} className="empty">No sprays or feeds logged yet.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="stat-foot">Log the pre-harvest interval (PHI) from the product label — the app then blocks that field from "safe to harvest" until enough days have passed.</p>
    </>
  );
}

function SprayForm({ fields, defaultField, onClose, onSave }) {
  const [f, setF] = useState({ date: todayISO(), fieldId: defaultField, type: 'Insecticide', product: '', activeIngredient: '', rate: '', cost: '', phiDays: '', notes: '' });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const safePreview = f.phiDays !== '' ? addDaysISO(f.date, f.phiDays) : null;
  function submit() {
    if (!f.date || !f.fieldId) return;
    onSave({
      id: newId(), date: f.date, fieldId: f.fieldId, type: f.type,
      product: f.product || null, activeIngredient: f.activeIngredient || null, rate: f.rate || null,
      cost: f.cost === '' ? null : Number(f.cost),
      phiDays: f.phiDays === '' ? null : Number(f.phiDays), notes: f.notes || null,
    });
  }
  return (
    <Modal title="Log spray / feed" sub={safePreview ? `Safe to harvest from ${fmtDate(safePreview)}.` : 'Set a PHI to auto-flag the harvest hold.'} onClose={onClose}>
      <div className="form-grid">
        <Field label="Date"><input type="date" value={f.date} onChange={set('date')} /></Field>
        <Field label="Field">
          <select value={f.fieldId} onChange={set('fieldId')}>
            {fields.map((fl) => <option key={fl.id} value={fl.id}>{fl.name}</option>)}
          </select>
        </Field>
        <Field label="Type">
          <select value={f.type} onChange={set('type')}>
            {SPRAY_TYPES.map((t) => <option key={t}>{t}</option>)}
          </select>
        </Field>
        <Field label="Product"><input value={f.product} onChange={set('product')} placeholder="e.g. Imida Super" /></Field>
        <Field label="Active ingredient"><input value={f.activeIngredient} onChange={set('activeIngredient')} placeholder="e.g. Imidacloprid" /></Field>
        <Field label="Rate"><input value={f.rate} onChange={set('rate')} placeholder="e.g. 5ml / 15L" /></Field>
        <Field label="Cost (GH₵)"><input type="number" step="0.01" value={f.cost} onChange={set('cost')} /></Field>
        <Field label="Pre-harvest interval (days)"><input type="number" value={f.phiDays} onChange={set('phiDays')} placeholder="from label" /></Field>
        <Field label="Notes" span2><textarea rows={2} value={f.notes} onChange={set('notes')} /></Field>
      </div>
      <div className="modal-actions">
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-green" onClick={submit}>Save</button>
      </div>
    </Modal>
  );
}

/* ---------------- Harvest & sales ---------------- */

function HarvestTab({ rows, fieldName, totalKg, revenue, onAdd }) {
  return (
    <>
      <div className="panel-head" style={{ marginBottom: 14 }}>
        <h3 style={{ fontSize: 18 }}>Harvest &amp; Sales</h3>
        <button className="btn btn-green" onClick={onAdd}>+ Log harvest</button>
      </div>
      {rows.length > 0 && (
        <p className="stat-foot" style={{ marginBottom: 10 }}>
          Totals in view: <strong style={{ color: 'var(--green)' }}>{num(totalKg, 1)} kg</strong> ·
          revenue <strong style={{ color: 'var(--gold)' }}>GH₵ {num(revenue, 2)}</strong>
        </p>
      )}
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr><th>Date</th><th>Field</th><th>Weight (kg)</th><th>Grade</th><th>Price/kg</th><th>Revenue</th><th>Buyer</th><th>Notes</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const rev = (Number(r.weightKg) || 0) * (Number(r.pricePerKg) || 0);
              return (
                <tr key={r.id}>
                  <td className="mono">{fmtDate(r.date)}</td>
                  <td>{fieldName(r.fieldId)}</td>
                  <td className="mono">{num(r.weightKg, 1)}</td>
                  <td>{r.grade ? <span className={`tag ${r.grade.startsWith('Grade A') ? 'green' : r.grade.startsWith('Grade B') ? 'gold' : 'rust'}`}>{r.grade}</span> : '—'}</td>
                  <td className="mono">{r.pricePerKg != null ? num(r.pricePerKg, 2) : '—'}</td>
                  <td className="mono">{rev ? `GH₵ ${num(rev, 2)}` : '—'}</td>
                  <td>{r.buyer || '—'}</td>
                  <td className="notes">{r.notes || ''}</td>
                </tr>
              );
            })}
            {rows.length === 0 && <tr><td colSpan={8} className="empty">No harvest logged yet — record each pick to build your yield and revenue picture.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}

function HarvestForm({ fields, defaultField, onClose, onSave }) {
  const [f, setF] = useState({ date: todayISO(), fieldId: defaultField, weightKg: '', grade: GRADES[0], pricePerKg: '', buyer: '', notes: '' });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const rev = (Number(f.weightKg) || 0) * (Number(f.pricePerKg) || 0);
  function submit() {
    if (!f.date || !f.fieldId || f.weightKg === '') return;
    onSave({
      id: newId(), date: f.date, fieldId: f.fieldId, weightKg: Number(f.weightKg),
      grade: f.grade || null, pricePerKg: f.pricePerKg === '' ? null : Number(f.pricePerKg),
      buyer: f.buyer || null, notes: f.notes || null,
    });
  }
  return (
    <Modal title="Log harvest" sub={rev ? `Revenue: GH₵ ${num(rev, 2)}.` : 'Enter weight and price to see revenue.'} onClose={onClose}>
      <div className="form-grid">
        <Field label="Date"><input type="date" value={f.date} onChange={set('date')} /></Field>
        <Field label="Field">
          <select value={f.fieldId} onChange={set('fieldId')}>
            {fields.map((fl) => <option key={fl.id} value={fl.id}>{fl.name}</option>)}
          </select>
        </Field>
        <Field label="Weight (kg)"><input type="number" step="0.1" value={f.weightKg} onChange={set('weightKg')} /></Field>
        <Field label="Grade">
          <select value={f.grade} onChange={set('grade')}>
            {GRADES.map((g) => <option key={g}>{g}</option>)}
          </select>
        </Field>
        <Field label="Price per kg (GH₵)"><input type="number" step="0.01" value={f.pricePerKg} onChange={set('pricePerKg')} /></Field>
        <Field label="Buyer"><input value={f.buyer} onChange={set('buyer')} placeholder="market, aggregator, etc." /></Field>
        <Field label="Revenue (auto)"><input value={rev ? `GH₵ ${num(rev, 2)}` : '—'} disabled /></Field>
        <Field label="Notes" span2><textarea rows={2} value={f.notes} onChange={set('notes')} /></Field>
      </div>
      <div className="modal-actions">
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-green" onClick={submit}>Save harvest</button>
      </div>
    </Modal>
  );
}

/* ============================================================= */
/* ============= FLOCK / SALES / REMINDERS COMPONENTS ========== */
/* ============================================================= */

const SALE_ITEMS = ['Eggs (crates)', 'Eggs (pieces)', 'Spent hens', 'Broilers', 'Cockerels', 'Other'];

function FlockForm({ flock, onClose, onSave }) {
  const isNew = !flock;
  const [f, setF] = useState({
    flockName: flock?.flockName || '', type: flock?.type || 'broiler',
    breed: flock?.breed || '', startDate: flock?.startDate || todayISO(),
    initialBirds: flock?.initialBirds ?? '', location: flock?.location || 'Eikwe, Western Region',
    setupCost: flock?.setupCost ?? '',
  });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  function submit() {
    if (!f.flockName || f.initialBirds === '') return;
    onSave({
      id: flock?.id || newId(),
      flockName: f.flockName,
      type: f.type,
      breed: f.breed || (f.type === 'broiler' ? 'Ross 308' : 'Layers'),
      startDate: f.startDate,
      initialBirds: Number(f.initialBirds),
      location: f.location || '',
      standardKey: f.type === 'broiler' ? 'ross308_broiler' : 'hyline_layer',
      setupCost: f.setupCost === '' ? null : Number(f.setupCost),
    });
  }
  return (
    <Modal title={isNew ? 'Add flock / new batch' : `Edit ${flock.flockName}`} sub={isNew ? 'Start a new broiler batch or layer flock — each keeps its own log and standard.' : 'Flock details and setup cost.'} onClose={onClose}>
      <div className="form-grid">
        <Field label="Flock name" span2><input value={f.flockName} onChange={set('flockName')} placeholder="e.g. Broilers — Aug batch" /></Field>
        <Field label="Type">
          <select value={f.type} onChange={set('type')}>
            <option value="broiler">Broiler (Ross 308 standard)</option>
            <option value="layer">Layer (Hy-Line standard)</option>
          </select>
        </Field>
        <Field label="Breed"><input value={f.breed} onChange={set('breed')} placeholder={f.type === 'broiler' ? 'Ross 308' : 'Hy-Line'} /></Field>
        <Field label="Start / arrival date"><input type="date" value={f.startDate} onChange={set('startDate')} /></Field>
        <Field label="Birds placed"><input type="number" value={f.initialBirds} onChange={set('initialBirds')} /></Field>
        <Field label="Location"><input value={f.location} onChange={set('location')} /></Field>
        <Field label="Setup cost (GH₵)"><input type="number" step="0.01" value={f.setupCost} onChange={set('setupCost')} placeholder="chicks, brooding, etc." /></Field>
        <Field label="Notes" span2><textarea rows={2} value={f.notes} onChange={set('notes')} /></Field>
      </div>
      <div className="modal-actions">
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-gold" onClick={submit}>{isNew ? 'Create flock' : 'Save flock'}</button>
      </div>
    </Modal>
  );
}

/* ---------------- Sales & profit ---------------- */

function SalesTab({ sales, flock, totalRevenue, flockMargin, totalFeedCost, litterCost, onAdd, onEditFlock }) {
  const setup = Number(flock.setupCost) || 0;
  return (
    <>
      <div className="panel-head" style={{ marginBottom: 14 }}>
        <h3 style={{ fontSize: 18 }}>Sales &amp; Profit — {flock.flockName}</h3>
        <button className="btn btn-gold" onClick={onAdd}>+ Log sale</button>
      </div>

      <div className="grid grid-4">
        <StatCard title="Revenue" value={`GH₵ ${num(totalRevenue, 2)}`} tone="green" foot={`${sales.length} sale(s)`} />
        <StatCard title="Feed Cost" value={`GH₵ ${num(totalFeedCost, 2)}`} tone="rust" foot="from feed records" />
        <StatCard title="Litter + Setup" value={`GH₵ ${num((litterCost || 0) + setup, 2)}`} foot={`litter ${num(litterCost || 0, 0)} + setup ${num(setup, 0)}`} />
        <StatCard title="Margin" value={`GH₵ ${num(flockMargin, 2)}`} tone={flockMargin >= 0 ? 'green' : 'rust'} foot={flockMargin >= 0 ? 'in profit' : 'below break-even'} />
      </div>

      <p className="stat-foot" style={{ margin: '12px 0 18px' }}>
        Profit = revenue − (feed GH₵ {num(totalFeedCost, 2)} + litter GH₵ {num(litterCost || 0, 2)} + setup GH₵ {num(setup, 2)}).
        {' '}<button className="link-btn" onClick={onEditFlock}>Edit setup cost</button> to include chick purchase, brooding, and other one-off costs.
      </p>

      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr><th>Date</th><th>Item</th><th>Qty</th><th>Unit price</th><th>Amount</th><th>Buyer</th><th>Notes</th></tr>
          </thead>
          <tbody>
            {sales.map((r) => (
              <tr key={r.id}>
                <td className="mono">{fmtDate(r.date)}</td>
                <td>{r.item}</td>
                <td className="mono">{num(r.quantity)}</td>
                <td className="mono">{r.unitPrice != null ? num(r.unitPrice, 2) : '—'}</td>
                <td className="mono">GH₵ {num(r.amount, 2)}</td>
                <td>{r.buyer || '—'}</td>
                <td className="notes">{r.notes || ''}</td>
              </tr>
            ))}
            {sales.length === 0 && <tr><td colSpan={7} className="empty">No sales logged yet — record egg or bird sales to build your profit picture.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}

function SaleForm({ flock, onClose, onSave }) {
  const layer = flock.type === 'layer';
  const [f, setF] = useState({ date: todayISO(), item: layer ? 'Eggs (crates)' : 'Broilers', quantity: '', unitPrice: '', amount: '', buyer: '', notes: '' });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const autoAmount = (Number(f.quantity) || 0) * (Number(f.unitPrice) || 0);
  const amount = f.amount !== '' ? Number(f.amount) : autoAmount;
  function submit() {
    if (!f.date || (f.quantity === '' && f.amount === '')) return;
    onSave({
      id: newId(), date: f.date, item: f.item,
      quantity: f.quantity === '' ? null : Number(f.quantity),
      unitPrice: f.unitPrice === '' ? null : Number(f.unitPrice),
      amount, buyer: f.buyer || null, notes: f.notes || null,
    });
  }
  return (
    <Modal title="Log sale" sub={amount ? `Amount: GH₵ ${num(amount, 2)}.` : 'Enter quantity × unit price, or type the amount directly.'} onClose={onClose}>
      <div className="form-grid">
        <Field label="Date"><input type="date" value={f.date} onChange={set('date')} /></Field>
        <Field label="Item">
          <select value={f.item} onChange={set('item')}>
            {SALE_ITEMS.map((i) => <option key={i}>{i}</option>)}
          </select>
        </Field>
        <Field label="Quantity"><input type="number" step="0.01" value={f.quantity} onChange={set('quantity')} /></Field>
        <Field label="Unit price (GH₵)"><input type="number" step="0.01" value={f.unitPrice} onChange={set('unitPrice')} /></Field>
        <Field label="Amount (GH₵)"><input type="number" step="0.01" value={f.amount} onChange={set('amount')} placeholder={autoAmount ? `auto ${num(autoAmount, 2)}` : 'or type total'} /></Field>
        <Field label="Buyer"><input value={f.buyer} onChange={set('buyer')} /></Field>
        <Field label="Notes" span2><textarea rows={2} value={f.notes} onChange={set('notes')} /></Field>
      </div>
      <div className="modal-actions">
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-gold" onClick={submit}>Save sale</button>
      </div>
    </Modal>
  );
}

/* ---------------- Reminders ---------------- */

function reminderStatusTag(d) {
  if (d == null) return <span className="tag">no date</span>;
  if (d < 0) return <span className="tag rust">Overdue {Math.abs(d)}d</span>;
  if (d === 0) return <span className="tag gold">Today</span>;
  if (d <= 5) return <span className="tag gold">In {d}d</span>;
  return <span className="tag green">In {d}d</span>;
}

function RemindersTab({ reminders, scope, autoItems, onAdd, onToggle, onDelete, accent }) {
  const withDays = (iso) => (iso ? daysBetween(todayISO(), iso) : null);
  const custom = (reminders || []).filter((r) => r.scope === scope || r.scope === 'general');
  const items = [
    ...(autoItems || []).map((a) => ({ ...a, kind: 'auto', done: false, daysLeft: a.daysLeft != null ? a.daysLeft : withDays(a.dueDate) })),
    ...custom.map((c) => ({ ...c, kind: 'custom', daysLeft: withDays(c.dueDate) })),
  ];
  const active = items.filter((i) => !i.done).sort((a, b) => {
    if (a.dueDate && b.dueDate) return new Date(a.dueDate) - new Date(b.dueDate);
    if (a.dueDate) return -1;
    if (b.dueDate) return 1;
    return 0;
  });
  const done = items.filter((i) => i.done);
  const btnClass = accent === 'green' ? 'btn btn-green' : 'btn btn-gold';

  return (
    <>
      <div className="panel-head" style={{ marginBottom: 14 }}>
        <h3 style={{ fontSize: 18 }}>Reminders</h3>
        <button className={btnClass} onClick={onAdd}>+ Add reminder</button>
      </div>

      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr><th>Status</th><th>Task</th><th>Due</th><th>Source / repeat</th><th></th></tr>
          </thead>
          <tbody>
            {active.map((i) => (
              <tr key={i.id}>
                <td>{reminderStatusTag(i.daysLeft)}</td>
                <td>{i.title}</td>
                <td className="mono">{i.dueDate ? fmtDate(i.dueDate) : '—'}</td>
                <td>{i.kind === 'auto' ? <span className="tag">{i.source || 'auto'}</span> : (i.repeatDays ? `every ${i.repeatDays}d` : (i.source || 'one-off'))}</td>
                <td>
                  {i.kind === 'custom' ? (
                    <span style={{ display: 'flex', gap: 8 }}>
                      <button className="link-btn" onClick={() => onToggle(i.id)}>Done</button>
                      <button className="link-btn rust" onClick={() => onDelete(i.id)}>Delete</button>
                    </span>
                  ) : <span className="stat-foot" style={{ margin: 0 }}>auto</span>}
                </td>
              </tr>
            ))}
            {active.length === 0 && <tr><td colSpan={5} className="empty">Nothing due — add a reminder, or vaccinations and harvest holds will show here automatically.</td></tr>}
          </tbody>
        </table>
      </div>

      {done.length > 0 && (
        <>
          <p className="section-title">Completed</p>
          <div className="table-wrap">
            <table className="data">
              <tbody>
                {done.map((i) => (
                  <tr key={i.id}>
                    <td style={{ width: 90 }}><span className="tag green">Done</span></td>
                    <td style={{ textDecoration: 'line-through', color: 'var(--text-faint)' }}>{i.title}</td>
                    <td className="mono">{i.dueDate ? fmtDate(i.dueDate) : '—'}</td>
                    <td>
                      <span style={{ display: 'flex', gap: 8 }}>
                        <button className="link-btn" onClick={() => onToggle(i.id)}>Undo</button>
                        <button className="link-btn rust" onClick={() => onDelete(i.id)}>Delete</button>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}

function ReminderForm({ scope, onClose, onSave }) {
  const [f, setF] = useState({ title: '', dueDate: todayISO(), repeatDays: '', scope: scope || 'general', notes: '' });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  function submit() {
    if (!f.title) return;
    onSave({
      id: newId(), title: f.title, dueDate: f.dueDate || null,
      repeatDays: f.repeatDays === '' ? null : Number(f.repeatDays),
      scope: f.scope, notes: f.notes || null, done: false,
    });
  }
  return (
    <Modal title="Add reminder" sub="A one-off or repeating task — it shows up here when due." onClose={onClose}>
      <div className="form-grid">
        <Field label="Task" span2><input value={f.title} onChange={set('title')} placeholder="e.g. Fertigate Field A, deworm layers" /></Field>
        <Field label="Due date"><input type="date" value={f.dueDate} onChange={set('dueDate')} /></Field>
        <Field label="Repeat every (days)"><input type="number" value={f.repeatDays} onChange={set('repeatDays')} placeholder="optional" /></Field>
        <Field label="Applies to">
          <select value={f.scope} onChange={set('scope')}>
            <option value="poultry">Poultry</option>
            <option value="pepper">Bell pepper</option>
            <option value="general">General / whole farm</option>
          </select>
        </Field>
        <Field label="Notes" span2><textarea rows={2} value={f.notes} onChange={set('notes')} /></Field>
      </div>
      <div className="modal-actions">
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-gold" onClick={submit}>Save reminder</button>
      </div>
    </Modal>
  );
}

/* ============================================================= */
/* ======================== CLOUD SYNC UI ====================== */
/* ============================================================= */

function SyncBar({ sync, onSync, onPull, onSettings }) {
  const configured = isSyncConfigured();
  const when = sync.lastSync ? new Date(sync.lastSync) : null;
  const label = !configured
    ? 'Cloud sync not set up'
    : sync.status === 'syncing' ? 'Syncing…'
    : sync.status === 'error' ? sync.message
    : when ? `${sync.message || 'Synced'} · ${when.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
    : 'Not synced yet this session';

  return (
    <div className={`sync-bar${sync.status === 'error' ? ' error' : ''}`}>
      <span className={`sync-dot ${configured ? sync.status : 'off'}`} />
      <span className="sync-label">{label}</span>
      <span className="sync-actions">
        {configured && <button className="link-btn" onClick={onSync} disabled={sync.status === 'syncing'}>Sync now</button>}
        {configured && <button className="link-btn" onClick={onPull} disabled={sync.status === 'syncing'}>Pull from cloud</button>}
        <button className="link-btn" onClick={onSettings}>{configured ? 'Settings' : 'Set up'}</button>
      </span>
    </div>
  );
}

function SyncSettingsForm({ onClose, onSaved }) {
  const current = getSyncSettings();
  const [f, setF] = useState({ url: current.url, key: current.key, farmId: current.farmId, autoSync: current.autoSync });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  function submit() {
    saveSyncSettings({ ...f, url: f.url.trim(), key: f.key.trim(), farmId: f.farmId.trim() || 'ai-farms-eikwe' });
    onSaved();
  }
  return (
    <Modal
      title="Cloud sync setup"
      sub="Connect your Supabase project so the same data follows you between phone and PC."
      onClose={onClose}
    >
      <div className="form-grid">
        <Field label="Supabase project URL" span2>
          <input value={f.url} onChange={set('url')} placeholder="https://xxxx.supabase.co" />
        </Field>
        <Field label="Anon public key" span2>
          <input value={f.key} onChange={set('key')} placeholder="eyJhbGciOi..." />
        </Field>
        <Field label="Farm ID" span2>
          <input value={f.farmId} onChange={set('farmId')} placeholder="ai-farms-eikwe" />
        </Field>
      </div>
      <p className="stat-foot" style={{ marginTop: 4 }}>
        Use the <strong>anon public</strong> key, never the service role key. Run the SQL in
        <code> supabase-setup.sql</code> first to create the table. Use the same Farm ID on every
        device so they share one record.
      </p>
      <div className="modal-actions">
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-gold" onClick={submit}>Save &amp; sync</button>
      </div>
    </Modal>
  );
}

/* ============================================================= */
/* ==================== LITTER & MANURE ======================== */
/* ============================================================= */

function LitterTab({ rows, fields, daysSinceChange, condition, due, manureHarvested, litterCost, onAdd }) {
  const conditionTone = condition === 'Wet' || condition === 'Caked' ? 'rust' : condition === 'Damp' ? 'gold' : 'green';
  const toManure = rows.filter((r) => r.action === 'Removed to field');
  const byField = {};
  toManure.forEach((r) => {
    const key = r.toField || 'Unassigned';
    byField[key] = (byField[key] || 0) + (Number(r.quantity) || 0);
  });

  return (
    <>
      <div className="panel-head" style={{ marginBottom: 14 }}>
        <h3 style={{ fontSize: 18 }}>Litter &amp; Manure</h3>
        <button className="btn btn-gold" onClick={onAdd}>+ Log litter</button>
      </div>

      <div className="grid grid-4">
        <StatCard
          title="Litter Age"
          value={daysSinceChange != null ? `${daysSinceChange} days` : '—'}
          tone={due ? 'rust' : daysSinceChange != null ? 'green' : undefined}
          foot={due ? `change overdue (${LITTER_CHANGE_DAYS}d guide)` : `guide: change by ${LITTER_CHANGE_DAYS} days`}
        />
        <StatCard
          title="Condition"
          value={condition || '—'}
          tone={condition ? conditionTone : undefined}
          foot={condition === 'Wet' || condition === 'Caked' ? 'ammonia / footpad risk' : 'last logged condition'}
        />
        <StatCard title="Manure to Fields" value={manureHarvested ? `${num(manureHarvested, 1)} bags` : '—'} tone="green" foot="cleared litter used as manure" />
        <StatCard title="Litter Cost" value={`GH₵ ${num(litterCost, 2)}`} tone="rust" foot="counts toward flock cost" />
      </div>

      {(condition === 'Wet' || condition === 'Caked') && (
        <div className="stale-banner" style={{ marginTop: 16 }}>
          ⚠ <span>
            Litter last logged as <strong>{condition.toLowerCase()}</strong>. Wet or caked litter drives ammonia,
            footpad burn and coccidiosis — turn it, top up with dry material, and check for leaking drinkers.
          </span>
        </div>
      )}

      {Object.keys(byField).length > 0 && (
        <>
          <p className="section-title">Manure sent to fields</p>
          <div className="grid grid-4">
            {Object.entries(byField).map(([field, qty]) => (
              <StatCard key={field} title={field} value={`${num(qty, 1)} bags`} tone="green" foot="manure applied" />
            ))}
          </div>
        </>
      )}

      <p className="section-title">Litter records</p>
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr><th>Date</th><th>Action</th><th>Material</th><th>Qty (bags)</th><th>Condition</th><th>Cost</th><th>To field</th><th>Notes</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="mono">{fmtDate(r.date)}</td>
                <td>{r.action === 'Removed to field'
                  ? <span className="tag green">{r.action}</span>
                  : r.action}
                </td>
                <td>{r.material || '—'}</td>
                <td className="mono">{r.quantity != null ? num(r.quantity, 1) : '—'}</td>
                <td>{r.condition ? <span className={`tag ${r.condition === 'Wet' || r.condition === 'Caked' ? 'rust' : r.condition === 'Damp' ? 'gold' : 'green'}`}>{r.condition}</span> : '—'}</td>
                <td className="mono">{r.cost != null ? `GH₵ ${num(r.cost, 2)}` : '—'}</td>
                <td>{r.toField || '—'}</td>
                <td className="notes">{r.notes || ''}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={8} className="empty">No litter logged yet — record the material laid, top-ups, condition checks, and manure cleared to your fields.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="stat-foot">
        Log a condition check whenever you walk the house. Dry litter keeps ammonia down and coccidiosis
        pressure low; caked or wet litter is the early warning that something needs fixing.
      </p>
    </>
  );
}

function LitterForm({ fields, onClose, onSave }) {
  const [f, setF] = useState({
    date: todayISO(), action: 'Top-up', material: 'Sawdust', quantity: '',
    condition: 'Dry', cost: '', toField: '', notes: '',
  });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const isManure = f.action === 'Removed to field';
  function submit() {
    if (!f.date) return;
    onSave({
      id: newId(), date: f.date, action: f.action,
      material: isManure ? (f.material || null) : f.material,
      quantity: f.quantity === '' ? null : Number(f.quantity),
      condition: isManure ? null : f.condition,
      cost: f.cost === '' ? null : Number(f.cost),
      toField: isManure ? (f.toField || null) : null,
      notes: f.notes || null,
    });
  }
  return (
    <Modal
      title="Log litter"
      sub={isManure ? 'Cleared litter going to the fields as manure.' : 'Litter laid, topped up, turned, or checked.'}
      onClose={onClose}
    >
      <div className="form-grid">
        <Field label="Date"><input type="date" value={f.date} onChange={set('date')} /></Field>
        <Field label="Action">
          <select value={f.action} onChange={set('action')}>
            {LITTER_ACTIONS.map((a) => <option key={a}>{a}</option>)}
          </select>
        </Field>
        <Field label="Material">
          <select value={f.material} onChange={set('material')}>
            {LITTER_MATERIALS.map((m) => <option key={m}>{m}</option>)}
          </select>
        </Field>
        <Field label="Quantity (bags)"><input type="number" step="0.5" value={f.quantity} onChange={set('quantity')} /></Field>
        {isManure ? (
          <Field label="To field">
            <select value={f.toField} onChange={set('toField')}>
              <option value="">— choose field —</option>
              {fields.map((fl) => <option key={fl.id} value={fl.name}>{fl.name}</option>)}
              <option value="Stored / composting">Stored / composting</option>
            </select>
          </Field>
        ) : (
          <Field label="Condition">
            <select value={f.condition} onChange={set('condition')}>
              {LITTER_CONDITIONS.map((c) => <option key={c}>{c}</option>)}
            </select>
          </Field>
        )}
        <Field label="Cost (GH₵)"><input type="number" step="0.01" value={f.cost} onChange={set('cost')} placeholder={isManure ? 'cartage, optional' : 'sawdust purchase'} /></Field>
        <Field label="Notes" span2><textarea rows={2} value={f.notes} onChange={set('notes')} /></Field>
      </div>
      {isManure && (
        <p className="stat-foot" style={{ marginTop: 4 }}>
          Compost or age poultry manure before applying near young plants — fresh litter is high in
          ammonia and can scorch roots.
        </p>
      )}
      <div className="modal-actions">
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-gold" onClick={submit}>Save</button>
      </div>
    </Modal>
  );
}

/* ============================================================= */
/* ================= FEED MIX / RATION CALCULATOR ============== */
/* ============================================================= */

function starterMix(flockType) {
  // Sensible opening blend per 100 kg — the farmer tunes from here.
  // Both land inside their target protein/calcium/energy bands.
  if (flockType === 'broiler') {
    return { maize: 63, bran: 1, broilerconc: 28, soya: 5, oil: 2, salt: 1 };
  }
  return { maize: 58, bran: 8, layerconc: 30, oyster: 3, salt: 1 };
}

function FeedMixTab({ recipes, flock, onSave, onDelete }) {
  const [target, setTarget] = useState(flock.type === 'broiler' ? 'broiler_finisher' : 'layer');
  const [batchKg, setBatchKg] = useState(100);
  const [parts, setParts] = useState(() => starterMix(flock.type));
  const [prices, setPrices] = useState(() => {
    const p = {};
    INGREDIENTS.forEach((i) => { p[i.id] = i.defaultPrice; });
    return p;
  });
  const [bagPrice, setBagPrice] = useState(400);   // what a 50kg bag of compound feed costs
  const [recipeName, setRecipeName] = useState('');

  const used = INGREDIENTS.filter((i) => Number(parts[i.id]) > 0);
  const totalParts = used.reduce((s, i) => s + Number(parts[i.id] || 0), 0);

  // Weighted nutrient values across the blend.
  const calc = useMemo(() => {
    if (!totalParts) return null;
    let protein = 0, calcium = 0, energy = 0, cost = 0;
    used.forEach((i) => {
      const share = Number(parts[i.id]) / totalParts;
      protein += i.protein * share;
      calcium += i.calcium * share;
      energy += i.energy * share;
      cost += (Number(prices[i.id]) || 0) * share;
    });
    return { protein, calcium, energy, costPerKg: cost };
  }, [parts, prices, totalParts, used]);

  const t = RATION_TARGETS[target];
  const inRange = (v, [lo, hi]) => v >= lo && v <= hi;
  const tone = (v, range) => (inRange(v, range) ? 'green' : 'rust');

  const bagCostPerKg = Number(bagPrice) / 50;
  const savingPerKg = calc ? bagCostPerKg - calc.costPerKg : null;
  const batchCost = calc ? calc.costPerKg * Number(batchKg || 0) : null;
  const batchSaving = savingPerKg != null ? savingPerKg * Number(batchKg || 0) : null;

  const scale = totalParts ? Number(batchKg || 0) / totalParts : 0;

  function setPart(id, v) { setParts({ ...parts, [id]: v }); }
  function setPrice(id, v) { setPrices({ ...prices, [id]: v }); }

  function saveThis() {
    if (!recipeName.trim() || !calc) return;
    onSave({
      id: newId(), name: recipeName.trim(), target, batchKg: Number(batchKg),
      parts: { ...parts }, prices: { ...prices },
      protein: calc.protein, calcium: calc.calcium, energy: calc.energy,
      costPerKg: calc.costPerKg, savedOn: todayISO(), flockId: flock.id,
    });
    setRecipeName('');
  }

  function loadRecipe(r) {
    setTarget(r.target); setBatchKg(r.batchKg); setParts(r.parts); setPrices(r.prices);
  }

  return (
    <>
      <div className="panel-head" style={{ marginBottom: 14 }}>
        <h3 style={{ fontSize: 18 }}>Feed Mix Calculator</h3>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <select value={target} onChange={(e) => setTarget(e.target.value)} className="inline-select">
            {Object.entries(RATION_TARGETS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <button className="btn" onClick={() => setParts(starterMix(flock.type))}>Reset blend</button>
        </div>
      </div>

      <div className="grid grid-4">
        <StatCard
          title="Protein"
          value={calc ? `${num(calc.protein, 1)}%` : '—'}
          tone={calc ? tone(calc.protein, t.protein) : undefined}
          foot={`target ${t.protein[0]}–${t.protein[1]}%`}
        />
        <StatCard
          title="Calcium"
          value={calc ? `${num(calc.calcium, 2)}%` : '—'}
          tone={calc ? tone(calc.calcium, t.calcium) : undefined}
          foot={`target ${t.calcium[0]}–${t.calcium[1]}%`}
        />
        <StatCard
          title="Energy (ME)"
          value={calc ? `${num(calc.energy)} Kcal` : '—'}
          tone={calc ? tone(calc.energy, t.energy) : undefined}
          foot={`target ${t.energy[0]}–${t.energy[1]}`}
        />
        <StatCard
          title="Your Cost / kg"
          value={calc ? `GH₵ ${num(calc.costPerKg, 2)}` : '—'}
          tone={savingPerKg > 0 ? 'green' : 'rust'}
          foot={savingPerKg != null ? `bagged feed: GH₵ ${num(bagCostPerKg, 2)}/kg` : ''}
        />
      </div>

      <div className="panel" style={{ marginTop: 18 }}>
        <div className="panel-head"><h3>What you save</h3></div>
        <div className="mix-compare">
          <div className="field" style={{ maxWidth: 220 }}>
            <label>Bagged feed price (GH₵ / 50kg bag)</label>
            <input type="number" value={bagPrice} onChange={(e) => setBagPrice(e.target.value)} />
          </div>
          <div className="field" style={{ maxWidth: 180 }}>
            <label>Batch size (kg)</label>
            <input type="number" value={batchKg} onChange={(e) => setBatchKg(e.target.value)} />
          </div>
          <div className="mix-saving">
            {savingPerKg != null && (
              savingPerKg > 0 ? (
                <>
                  <div className="stat-value green">GH₵ {num(batchSaving, 2)}</div>
                  <p className="stat-foot">
                    saved on a {num(batchKg)} kg batch (GH₵ {num(savingPerKg, 2)}/kg cheaper).
                    Batch costs you GH₵ {num(batchCost, 2)}.
                  </p>
                </>
              ) : (
                <>
                  <div className="stat-value rust">GH₵ {num(Math.abs(batchSaving), 2)} more</div>
                  <p className="stat-foot">
                    Mixing is costing more than bagged feed right now — usually means maize prices are high.
                  </p>
                </>
              )
            )}
          </div>
        </div>
      </div>

      <p className="section-title">Blend &amp; ingredient prices</p>
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr><th>Ingredient</th><th>Parts (per 100)</th><th>Price GH₵/kg</th><th>Weigh out</th><th>Protein %</th><th>Calcium %</th><th>Cost in batch</th></tr>
          </thead>
          <tbody>
            {INGREDIENTS.map((i) => {
              const p = Number(parts[i.id]) || 0;
              const kg = p * scale;
              return (
                <tr key={i.id}>
                  <td>{i.name}</td>
                  <td>
                    <input
                      className="mini-input" type="number" step="0.5" value={parts[i.id] ?? ''}
                      onChange={(e) => setPart(i.id, e.target.value)} placeholder="0"
                    />
                  </td>
                  <td>
                    <input
                      className="mini-input" type="number" step="0.1" value={prices[i.id] ?? ''}
                      onChange={(e) => setPrice(i.id, e.target.value)}
                    />
                  </td>
                  <td className="mono">{p > 0 ? `${num(kg, 1)} kg` : '—'}</td>
                  <td className="mono">{num(i.protein, 1)}</td>
                  <td className="mono">{num(i.calcium, 2)}</td>
                  <td className="mono">{p > 0 ? `GH₵ ${num(kg * (Number(prices[i.id]) || 0), 2)}` : '—'}</td>
                </tr>
              );
            })}
            <tr>
              <td><strong>Total</strong></td>
              <td className="mono"><strong>{num(totalParts, 1)}</strong></td>
              <td></td>
              <td className="mono"><strong>{num(Number(batchKg) || 0, 1)} kg</strong></td>
              <td colSpan={2}></td>
              <td className="mono"><strong>{batchCost != null ? `GH₵ ${num(batchCost, 2)}` : '—'}</strong></td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="panel" style={{ marginTop: 18 }}>
        <div className="panel-head"><h3>Save this recipe</h3></div>
        <div className="mix-compare">
          <div className="field" style={{ maxWidth: 300 }}>
            <label>Recipe name</label>
            <input value={recipeName} onChange={(e) => setRecipeName(e.target.value)} placeholder="e.g. Layer mix — Aug maize price" />
          </div>
          <button className="btn btn-gold" onClick={saveThis} style={{ alignSelf: 'flex-end' }}>Save recipe</button>
        </div>
        {recipes.length > 0 && (
          <div className="table-wrap" style={{ marginTop: 14 }}>
            <table className="data">
              <thead>
                <tr><th>Recipe</th><th>Target</th><th>Protein</th><th>Calcium</th><th>Cost/kg</th><th>Saved</th><th></th></tr>
              </thead>
              <tbody>
                {recipes.map((r) => (
                  <tr key={r.id}>
                    <td>{r.name}</td>
                    <td>{RATION_TARGETS[r.target]?.label || r.target}</td>
                    <td className="mono">{num(r.protein, 1)}%</td>
                    <td className="mono">{num(r.calcium, 2)}%</td>
                    <td className="mono">GH₵ {num(r.costPerKg, 2)}</td>
                    <td className="mono">{fmtDate(r.savedOn)}</td>
                    <td>
                      <span style={{ display: 'flex', gap: 8 }}>
                        <button className="link-btn" onClick={() => loadRecipe(r)}>Load</button>
                        <button className="link-btn rust" onClick={() => onDelete(r.id)}>Delete</button>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="stale-banner" style={{ marginTop: 18 }}>
        ⚠ <span>
          Nutrient figures here are typical book values used to compare blends and catch a bad ratio —
          they are not a lab analysis. <strong>Always follow the inclusion rate printed on your concentrate bag</strong>,
          since brands differ. And check your maize: mouldy maize carries aflatoxin, which quietly cuts
          laying, weakens shells, and can kill birds — no calculator can see that.
        </span>
      </div>
    </>
  );
}

/* ============================================================= */
/* =================== WHOLE FARM WORKSPACE ==================== */
/* ============================================================= */

const EXPENSE_CATEGORIES = ['Labour', 'Transport', 'Utilities', 'Repairs & maintenance', 'Equipment', 'Rent', 'Other'];

function FarmWorkspace({ data, onAddExpense, onDeleteExpense }) {
  const [modal, setModal] = useState(null);

  // ---- Poultry side ----
  const poultryRevenue = (data.sales || []).reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const feedCost = (data.feed || []).reduce((s, r) => s + (Number(r.cost) || 0), 0);
  const litterCost = (data.litter || []).reduce((s, r) => s + (Number(r.cost) || 0), 0);
  const flockSetup = (data.flocks || []).reduce((s, f) => s + (Number(f.setupCost) || 0), 0);
  const medCost = (data.meds || []).reduce((s, r) => s + (Number(r.cost) || 0), 0);
  const poultryCost = feedCost + litterCost + flockSetup + medCost;
  const poultryMargin = poultryRevenue - poultryCost;

  // ---- Pepper side ----
  const p = data.pepper || {};
  const pepperRevenue = (p.harvests || []).reduce((s, h) => s + (Number(h.weightKg) || 0) * (Number(h.pricePerKg) || 0), 0);
  const sprayCost = (p.sprays || []).reduce((s, r) => s + (Number(r.cost) || 0), 0);
  const fieldSetup = (p.fields || []).reduce((s, f) => s + (Number(f.setupCost) || 0), 0);
  const pepperCost = sprayCost + fieldSetup;
  const pepperMargin = pepperRevenue - pepperCost;

  // ---- General ----
  const expenses = [...(data.expenses || [])].sort((a, b) => new Date(b.date) - new Date(a.date));
  const generalCost = expenses.reduce((s, r) => s + (Number(r.amount) || 0), 0);

  const totalRevenue = poultryRevenue + pepperRevenue;
  const totalCost = poultryCost + pepperCost + generalCost;
  const netProfit = totalRevenue - totalCost;

  // Manure moved from poultry to fields — the internal value the farm captures.
  const manureBags = (data.litter || [])
    .filter((r) => r.action === 'Removed to field')
    .reduce((s, r) => s + (Number(r.quantity) || 0), 0);

  const enterpriseChart = [
    { name: 'Poultry', revenue: Math.round(poultryRevenue), cost: Math.round(poultryCost) },
    { name: 'Bell pepper', revenue: Math.round(pepperRevenue), cost: Math.round(pepperCost) },
    { name: 'General', revenue: 0, cost: Math.round(generalCost) },
  ];

  const byCategory = {};
  expenses.forEach((e) => { byCategory[e.category] = (byCategory[e.category] || 0) + (Number(e.amount) || 0); });

  return (
    <>
      <header className="header">
        <div>
          <p className="brand-eyebrow">AI Farms · Whole Farm</p>
          <h1 className="brand-title">Farm Profit &amp; Loss</h1>
          <p className="brand-sub">Eikwe, Western Region · poultry + bell pepper combined</p>
        </div>
        <div className="day-stamp">
          <DayRing pct={totalRevenue ? Math.max(0, Math.min(1, netProfit / Math.max(totalRevenue, 1))) : 0} color={netProfit >= 0 ? '#7A9A66' : '#C15F41'} />
          <div>
            <div className={`num ${netProfit >= 0 ? 'pepper' : ''}`}>GH₵ {num(netProfit, 2)}</div>
            <div className="label">net {netProfit >= 0 ? 'profit' : 'loss'} to date</div>
          </div>
        </div>
      </header>

      <div className="grid grid-4">
        <StatCard title="Total Revenue" value={`GH₵ ${num(totalRevenue, 2)}`} tone="green" foot="poultry + pepper sales" />
        <StatCard title="Total Cost" value={`GH₵ ${num(totalCost, 2)}`} tone="rust" foot="inputs + setup + general" />
        <StatCard title="Net Profit" value={`GH₵ ${num(netProfit, 2)}`} tone={netProfit >= 0 ? 'green' : 'rust'} foot={netProfit >= 0 ? 'farm is in profit' : 'farm below break-even'} />
        <StatCard title="Manure Recycled" value={manureBags ? `${num(manureBags, 1)} bags` : '—'} tone="green" foot="poultry litter to fields" />
      </div>

      <div className="grid grid-2" style={{ marginTop: 18 }}>
        <div className="panel">
          <div className="panel-head"><h3>Revenue vs cost by enterprise</h3></div>
          <div className="chart-card">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={enterpriseChart} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid stroke="#423827" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" tickLine={false} axisLine={{ stroke: '#423827' }} />
                <YAxis tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ background: '#241F18', border: '1px solid #423827', borderRadius: 8, fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 12, color: '#B9AD9A' }} />
                <Bar dataKey="revenue" name="Revenue (GH₵)" fill="#7A9A66" barSize={18} radius={[3, 3, 0, 0]} />
                <Bar dataKey="cost" name="Cost (GH₵)" fill="#C15F41" barSize={18} radius={[3, 3, 0, 0]} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="panel">
          <div className="panel-head"><h3>Enterprise breakdown</h3></div>
          <div style={{ padding: '4px 0 10px' }}>
            <div className="kv"><span className="k">Poultry revenue</span><span className="v">GH₵ {num(poultryRevenue, 2)}</span></div>
            <div className="kv"><span className="k">Poultry cost</span><span className="v">GH₵ {num(poultryCost, 2)}</span></div>
            <div className="kv">
              <span className="k">Poultry margin</span>
              <span className="v" style={{ color: poultryMargin >= 0 ? 'var(--green)' : 'var(--rust)' }}>GH₵ {num(poultryMargin, 2)}</span>
            </div>
            <div className="kv"><span className="k">Pepper revenue</span><span className="v">GH₵ {num(pepperRevenue, 2)}</span></div>
            <div className="kv"><span className="k">Pepper cost</span><span className="v">GH₵ {num(pepperCost, 2)}</span></div>
            <div className="kv">
              <span className="k">Pepper margin</span>
              <span className="v" style={{ color: pepperMargin >= 0 ? 'var(--green)' : 'var(--rust)' }}>GH₵ {num(pepperMargin, 2)}</span>
            </div>
            <div className="kv"><span className="k">General expenses</span><span className="v">GH₵ {num(generalCost, 2)}</span></div>
            <div className="kv">
              <span className="k">Net profit</span>
              <span className="v" style={{ color: netProfit >= 0 ? 'var(--green)' : 'var(--rust)', fontWeight: 600 }}>GH₵ {num(netProfit, 2)}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="panel-head" style={{ margin: '22px 0 14px' }}>
        <h3 style={{ fontSize: 18 }}>General farm expenses</h3>
        <button className="btn btn-gold" onClick={() => setModal('expense')}>+ Add expense</button>
      </div>

      {Object.keys(byCategory).length > 0 && (
        <div className="grid grid-4" style={{ marginBottom: 16 }}>
          {Object.entries(byCategory).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([cat, amt]) => (
            <StatCard key={cat} title={cat} value={`GH₵ ${num(amt, 2)}`} tone="rust" foot="spent to date" />
          ))}
        </div>
      )}

      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr><th>Date</th><th>Category</th><th>Description</th><th>Applies to</th><th>Amount</th><th></th></tr>
          </thead>
          <tbody>
            {expenses.map((r) => (
              <tr key={r.id}>
                <td className="mono">{fmtDate(r.date)}</td>
                <td>{r.category}</td>
                <td>{r.description || '—'}</td>
                <td>{r.scope === 'poultry' ? 'Poultry' : r.scope === 'pepper' ? 'Bell pepper' : 'Whole farm'}</td>
                <td className="mono">GH₵ {num(r.amount, 2)}</td>
                <td><button className="link-btn rust" onClick={() => onDeleteExpense(r.id)}>Delete</button></td>
              </tr>
            ))}
            {expenses.length === 0 && <tr><td colSpan={6} className="empty">No general expenses yet — add labour, transport, utilities and repairs for a true farm P&amp;L.</td></tr>}
          </tbody>
        </table>
      </div>

      <p className="stat-foot">
        Feed, litter, sprays and setup costs are pulled automatically from the poultry and pepper
        workspaces. Add here only what those don&apos;t already capture.
      </p>

      {modal === 'expense' && (
        <ExpenseForm onClose={() => setModal(null)} onSave={(e) => { onAddExpense(e); setModal(null); }} />
      )}
    </>
  );
}

function ExpenseForm({ onClose, onSave }) {
  const [f, setF] = useState({ date: todayISO(), category: 'Labour', description: '', amount: '', scope: 'general', notes: '' });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  function submit() {
    if (!f.date || f.amount === '') return;
    onSave({
      id: newId(), date: f.date, category: f.category, description: f.description || null,
      amount: Number(f.amount), scope: f.scope, notes: f.notes || null,
    });
  }
  return (
    <Modal title="Add farm expense" sub="Costs the poultry and pepper logs don't already capture." onClose={onClose}>
      <div className="form-grid">
        <Field label="Date"><input type="date" value={f.date} onChange={set('date')} /></Field>
        <Field label="Category">
          <select value={f.category} onChange={set('category')}>
            {EXPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Description"><input value={f.description} onChange={set('description')} placeholder="e.g. casual labour, 3 days" /></Field>
        <Field label="Amount (GH₵)"><input type="number" step="0.01" value={f.amount} onChange={set('amount')} /></Field>
        <Field label="Applies to">
          <select value={f.scope} onChange={set('scope')}>
            <option value="general">Whole farm</option>
            <option value="poultry">Poultry</option>
            <option value="pepper">Bell pepper</option>
          </select>
        </Field>
        <Field label="Notes" span2><textarea rows={2} value={f.notes} onChange={set('notes')} /></Field>
      </div>
      <div className="modal-actions">
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-gold" onClick={submit}>Save expense</button>
      </div>
    </Modal>
  );
}

/* ============================================================= */
/* ============= AGROCHEMICAL / INPUT STOCK (PEPPER) =========== */
/* ============================================================= */

const INPUT_UNITS = ['ml', 'L', 'g', 'kg', 'sachets', 'bags'];
const INPUT_TYPES = ['Insecticide', 'Fungicide', 'Fertiliser', 'Foliar feed', 'Herbicide', 'Other'];

function InputsTab({ inputs, onAdd, onUpdate, onDelete }) {
  const low = inputs.filter((i) => i.reorderAt != null && Number(i.quantity) <= Number(i.reorderAt));
  return (
    <>
      <div className="panel-head" style={{ marginBottom: 14 }}>
        <h3 style={{ fontSize: 18 }}>Agrochemical &amp; Input Stock</h3>
        <button className="btn btn-green" onClick={onAdd}>+ Add input</button>
      </div>

      {low.map((i) => (
        <div className="stale-banner" key={i.id} style={{ marginBottom: 10 }}>
          ⚠ <span><strong>{i.name}</strong> is low — {num(i.quantity, 1)} {i.unit} left (reorder at {num(i.reorderAt, 1)}). Restock before you need it mid-outbreak.</span>
        </div>
      ))}

      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr><th>Input</th><th>Type</th><th>Active ingredient</th><th>In stock</th><th>Reorder at</th><th>Unit cost</th><th>Adjust</th><th></th></tr>
          </thead>
          <tbody>
            {inputs.map((i) => {
              const isLow = i.reorderAt != null && Number(i.quantity) <= Number(i.reorderAt);
              return (
                <tr key={i.id}>
                  <td>{i.name}</td>
                  <td>{i.type}</td>
                  <td>{i.activeIngredient || '—'}</td>
                  <td className="mono">
                    <span className={isLow ? 'tag rust' : 'tag green'}>{num(i.quantity, 1)} {i.unit}</span>
                  </td>
                  <td className="mono">{i.reorderAt != null ? `${num(i.reorderAt, 1)} ${i.unit}` : '—'}</td>
                  <td className="mono">{i.unitCost != null ? `GH₵ ${num(i.unitCost, 2)}` : '—'}</td>
                  <td>
                    <span style={{ display: 'flex', gap: 6 }}>
                      <button className="link-btn" onClick={() => onUpdate(i.id, { quantity: Math.max(0, Number(i.quantity) - 1) })}>−1</button>
                      <button className="link-btn" onClick={() => onUpdate(i.id, { quantity: Number(i.quantity) + 1 })}>+1</button>
                    </span>
                  </td>
                  <td><button className="link-btn rust" onClick={() => onDelete(i.id)}>Delete</button></td>
                </tr>
              );
            })}
            {inputs.length === 0 && <tr><td colSpan={8} className="empty">No inputs tracked yet — add your sprays and fertilisers with a reorder level so you never run dry mid-season.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="stat-foot">
        Set a reorder level a little above what one full spray round uses, so a warning gives you time
        to buy before the next application is due.
      </p>
    </>
  );
}

function InputForm({ onClose, onSave }) {
  const [f, setF] = useState({ name: '', type: 'Insecticide', activeIngredient: '', quantity: '', unit: 'L', reorderAt: '', unitCost: '', notes: '' });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  function submit() {
    if (!f.name || f.quantity === '') return;
    onSave({
      id: newId(), name: f.name, type: f.type, activeIngredient: f.activeIngredient || null,
      quantity: Number(f.quantity), unit: f.unit,
      reorderAt: f.reorderAt === '' ? null : Number(f.reorderAt),
      unitCost: f.unitCost === '' ? null : Number(f.unitCost),
      notes: f.notes || null,
    });
  }
  return (
    <Modal title="Add input to stock" sub="Sprays, fertilisers and foliar feeds you keep on hand." onClose={onClose}>
      <div className="form-grid">
        <Field label="Name" span2><input value={f.name} onChange={set('name')} placeholder="e.g. Imida Super" /></Field>
        <Field label="Type">
          <select value={f.type} onChange={set('type')}>
            {INPUT_TYPES.map((t) => <option key={t}>{t}</option>)}
          </select>
        </Field>
        <Field label="Active ingredient"><input value={f.activeIngredient} onChange={set('activeIngredient')} placeholder="e.g. Imidacloprid" /></Field>
        <Field label="Quantity in stock"><input type="number" step="0.1" value={f.quantity} onChange={set('quantity')} /></Field>
        <Field label="Unit">
          <select value={f.unit} onChange={set('unit')}>
            {INPUT_UNITS.map((u) => <option key={u}>{u}</option>)}
          </select>
        </Field>
        <Field label="Warn me at"><input type="number" step="0.1" value={f.reorderAt} onChange={set('reorderAt')} placeholder="reorder level" /></Field>
        <Field label="Unit cost (GH₵)"><input type="number" step="0.01" value={f.unitCost} onChange={set('unitCost')} /></Field>
        <Field label="Notes" span2><textarea rows={2} value={f.notes} onChange={set('notes')} /></Field>
      </div>
      <div className="modal-actions">
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-green" onClick={submit}>Save input</button>
      </div>
    </Modal>
  );
}
