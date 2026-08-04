import { useState, useEffect, useMemo } from 'react';
import {
  ResponsiveContainer, ComposedChart, Line, Bar, Area, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, AreaChart,
} from 'recharts';
import { SEED } from './data/seed';
import './App.css';

const STORAGE_KEY = 'aifarms_poultry_tracker_v1';

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

function feedPhaseForWeek(week) {
  let phase = null;
  for (const r of FEED_STANDARD) {
    if (r.week > week) break;
    if (r.feedType) phase = r.feedType;
  }
  return phase;
}

function standardWeightForWeek(week) {
  const list = FEED_STANDARD;
  const exact = list.find((r) => r.week === week);
  if (exact) return exact.estWeightG;
  if (week < list[0].week) return null;
  if (week > list[list.length - 1].week) return list[list.length - 1].estWeightG;
  return null;
}

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      // Flock metadata (name/breed/start date) always comes from the app's
      // current defaults, so corrections ship without wiping logged entries.
      return { weightSamples: [], ...saved, flock: SEED.flock };
    }
  } catch (e) { /* ignore corrupt storage */ }
  return {
    flock: SEED.flock,
    dailyLog: SEED.dailyLog,
    meds: SEED.meds,
    vax: SEED.vax,
    feed: SEED.feed,
    weightSamples: SEED.weightSamples,
  };
}

const FEED_STANDARD = SEED.feedStandard;
const POINT_OF_LAY_WEEK = (FEED_STANDARD.find((r) => (r.feedType || '').toLowerCase().includes('layer')) || {}).week || 21;

/* ---------------- small building blocks ---------------- */

function DayRing({ pct, size = 52 }) {
  const r = (size - 6) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(1, pct));
  return (
    <svg className="ring" viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#423827" strokeWidth="4" />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke="#D4A537" strokeWidth="4" strokeLinecap="round"
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
  const [tab, setTab] = useState('dashboard');
  const [modal, setModal] = useState(null); // 'log' | 'feed' | 'med' | 'vax' | null

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }, [data]);

  const dailyLog = useMemo(
    () => [...data.dailyLog].sort((a, b) => new Date(a.date) - new Date(b.date)),
    [data.dailyLog]
  );
  const feed = useMemo(
    () => [...data.feed].sort((a, b) => new Date(a.date) - new Date(b.date)),
    [data.feed]
  );
  const meds = useMemo(
    () => [...data.meds].sort((a, b) => new Date(b.date) - new Date(a.date)),
    [data.meds]
  );
  const vax = useMemo(
    () => [...data.vax].sort((a, b) => new Date(a.date) - new Date(b.date)),
    [data.vax]
  );
  const weightSamples = useMemo(
    () => [...(data.weightSamples || [])].sort((a, b) => new Date(a.date) - new Date(b.date)),
    [data.weightSamples]
  );

  const latest = dailyLog[dailyLog.length - 1];
  const currentBirds = latest ? latest.closing : data.flock.initialBirds;
  const totalMortality = dailyLog.reduce((s, r) => s + (Number(r.mortality) || 0), 0);
  const survivalRate = data.flock.initialBirds
    ? (currentBirds / data.flock.initialBirds) * 100
    : null;
  const totalFeed = dailyLog.reduce((s, r) => s + (Number(r.feedGiven) || 0), 0);
  const dayNumber = daysBetween(data.flock.startDate, todayISO()) + 1;
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
  const weeksToPOL = POINT_OF_LAY_WEEK - weekNumber;
  const currentFeedPhase = feedPhaseForWeek(weekNumber);
  const standardWeight = standardWeightForWeek(weekNumber);
  const latestSample = weightSamples[weightSamples.length - 1];

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
      const wk = Math.ceil((daysBetween(data.flock.startDate, s.date) + 1) / 7);
      sampleByWeek[wk] = s.avgWeightG;
    });
    return FEED_STANDARD.filter((r) => r.week <= Math.max(weekNumber, POINT_OF_LAY_WEEK)).map((r) => ({
      week: `W${r.week}`,
      standard: r.estWeightG,
      actual: sampleByWeek[r.week] ?? null,
    }));
  }, [weightSamples, weekNumber, data.flock.startDate]);

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
    setData((d) => ({ ...d, dailyLog: [...d.dailyLog, entry] }));
  }
  function addFeed(entry) {
    setData((d) => ({ ...d, feed: [...d.feed, entry] }));
  }
  function addMed(entry) {
    setData((d) => ({ ...d, meds: [...d.meds, entry] }));
  }
  function addVax(entry) {
    setData((d) => ({ ...d, vax: [...d.vax, entry] }));
  }
  function addWeightSample(entry) {
    setData((d) => ({ ...d, weightSamples: [...(d.weightSamples || []), entry] }));
  }

  function exportWeeklyReport() {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 7);
    const recent = dailyLog.filter((r) => new Date(r.date) >= cutoff);
    const weekMortality = recent.reduce((s, r) => s + (Number(r.mortality) || 0), 0);
    const weekFeed = recent.reduce((s, r) => s + (Number(r.feedGiven) || 0), 0);
    const weekEggs = recent.reduce((s, r) => s + (Number(r.eggs) || 0), 0);
    const lines = [
      `AI FARMS — ${data.flock.flockName} — Weekly Report`,
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

  return (
    <div className="app">
      <header className="header">
        <div>
          <p className="brand-eyebrow">AI Farms · Poultry Operations</p>
          <h1 className="brand-title">{data.flock.flockName}</h1>
          <p className="brand-sub">{data.flock.breed} · started {fmtDate(data.flock.startDate)} · {data.flock.location}</p>
        </div>
        <div className="day-stamp">
          <DayRing pct={survivalRate ? survivalRate / 100 : 1} />
          <div>
            <div className="num">Day {dayNumber} <span className="week-chip">Wk {weekNumber}</span></div>
            <div className="label">{num(survivalRate, 1)}% survival</div>
          </div>
        </div>
      </header>

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
          ['growth', 'Growth'],
          ['health', 'Health'],
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
          currentFeedPhase={currentFeedPhase}
          standardWeight={standardWeight}
          latestSample={latestSample}
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
        <FeedTab feed={[...feed].reverse()} onAdd={() => setModal('feed')} />
      )}

      {tab === 'growth' && (
        <GrowthTab
          weightSamples={[...weightSamples].reverse()}
          growthChartData={growthChartData}
          feedStandard={FEED_STANDARD}
          onAdd={() => setModal('weight')}
        />
      )}

      {tab === 'health' && (
        <HealthTab
          meds={meds}
          vax={[...vax].reverse()}
          vaxStatus={vaxStatus}
          onAddMed={() => setModal('med')}
          onAddVax={() => setModal('vax')}
        />
      )}

      {modal === 'log' && (
        <LogForm
          lastClosing={latest ? latest.closing : data.flock.initialBirds}
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
    </div>
  );
}

/* ---------------- Dashboard ---------------- */

function DashboardTab({
  currentBirds, totalMortality, survivalRate, totalFeed, feedBalance,
  totalFeedCost, feedCostPerBird, henDayPct, totalEggs, totalCracked,
  weeksToPOL, currentFeedPhase, standardWeight, latestSample,
  mortalityByCause, chartData, feedChartData, growthChartData, vaxStatus, onExport,
}) {
  const causeEntries = Object.entries(mortalityByCause);
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
        <StatCard
          title="Hen-Day Egg %"
          value={henDayPct !== null ? `${num(henDayPct, 1)}%` : '—'}
          tone="green"
          foot={totalEggs ? `${num(totalEggs)} eggs total, ${num(totalCracked)} cracked` : 'not laying yet'}
        />
        <StatCard
          title="Point of Lay"
          value={weeksToPOL > 0 ? `${weeksToPOL} wks away` : 'Reached'}
          tone="gold"
          foot={`standard ~week ${POINT_OF_LAY_WEEK}`}
        />
        <StatCard
          title="Feed Phase"
          value={currentFeedPhase || '—'}
          foot="per breed feeding standard"
        />
        <StatCard
          title="Weight vs Standard"
          value={latestSample ? `${num(latestSample.avgWeightG)} g` : '—'}
          tone={latestSample && standardWeight ? (latestSample.avgWeightG >= standardWeight ? 'green' : 'rust') : undefined}
          foot={standardWeight ? `target ${num(standardWeight)} g this week` : 'no standard for this week'}
        />
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

function FeedTab({ feed, onAdd }) {
  const totalCost = feed.reduce((s, r) => s + (Number(r.cost) || 0), 0);
  return (
    <>
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

function HealthTab({ meds, vax, vaxStatus, onAddMed, onAddVax }) {
  return (
    <>
      <div className="panel-head" style={{ marginBottom: 14 }}>
        <h3 style={{ fontSize: 18 }}>Health</h3>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn" onClick={onAddVax}>+ Vaccination</button>
          <button className="btn btn-gold" onClick={onAddMed}>+ Medication</button>
        </div>
      </div>

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
