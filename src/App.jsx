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

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) { /* ignore corrupt storage */ }
  return {
    flock: SEED.flock,
    dailyLog: SEED.dailyLog,
    meds: SEED.meds,
    vax: SEED.vax,
    feed: SEED.feed,
  };
}

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

  const latest = dailyLog[dailyLog.length - 1];
  const currentBirds = latest ? latest.closing : data.flock.initialBirds;
  const totalMortality = dailyLog.reduce((s, r) => s + (Number(r.mortality) || 0), 0);
  const survivalRate = data.flock.initialBirds
    ? (currentBirds / data.flock.initialBirds) * 100
    : null;
  const totalFeed = dailyLog.reduce((s, r) => s + (Number(r.feedGiven) || 0), 0);
  const dayNumber = daysBetween(data.flock.startDate, latest ? latest.date : todayISO()) + 1;
  const daysSinceLastEntry = latest ? daysBetween(latest.date, todayISO()) : null;
  const isStale = daysSinceLastEntry !== null && daysSinceLastEntry > 3;

  const feedBalance = feed.length ? feed[feed.length - 1].balance : null;

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
    feedPerBird: r.closing ? Math.round(((r.feedGiven || 0) * 1000) / r.closing) : null,
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
            <div className="num">Day {dayNumber}</div>
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
          chartData={chartData}
          feedChartData={feedChartData}
          vaxStatus={vaxStatus}
        />
      )}

      {tab === 'log' && (
        <LogTab dailyLog={[...dailyLog].reverse()} onAdd={() => setModal('log')} />
      )}

      {tab === 'feed' && (
        <FeedTab feed={[...feed].reverse()} onAdd={() => setModal('feed')} />
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
    </div>
  );
}

/* ---------------- Dashboard ---------------- */

function DashboardTab({ currentBirds, totalMortality, survivalRate, totalFeed, feedBalance, chartData, feedChartData, vaxStatus }) {
  return (
    <>
      <div className="grid grid-4">
        <StatCard title="Current Flock" value={num(currentBirds)} tone="gold" foot="birds on hand" />
        <StatCard title="Total Mortality" value={num(totalMortality)} tone="rust" foot={`${num(survivalRate, 1)}% survival`} />
        <StatCard title="Feed Used" value={`${num(totalFeed, 1)} kg`} foot="cumulative to date" />
        <StatCard title="Feed Balance" value={feedBalance !== null ? `${num(feedBalance, 1)} kg` : '—'} tone="green" foot="in store" />
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
              <th>Date</th><th>Age (d)</th><th>Opening</th><th>Mortality</th><th>Culls</th>
              <th>Closing</th><th>Feed (kg)</th><th>Eggs</th><th>Meds/Vax</th><th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {dailyLog.map((r, i) => (
              <tr key={i}>
                <td className="mono">{fmtDate(r.date)}</td>
                <td className="mono">{r.birdAge ?? '—'}</td>
                <td className="mono">{num(r.opening)}</td>
                <td className="mono">{r.mortality ? <span style={{ color: 'var(--rust)' }}>{num(r.mortality)}</span> : num(r.mortality)}</td>
                <td className="mono">{num(r.culls)}</td>
                <td className="mono">{num(r.closing)}</td>
                <td className="mono">{r.feedGiven != null ? num(r.feedGiven, 2) : '—'}</td>
                <td className="mono">{num(r.eggs)}</td>
                <td>{r.medication || '—'}</td>
                <td className="notes">{r.notes || ''}</td>
              </tr>
            ))}
            {dailyLog.length === 0 && <tr><td colSpan={10} className="empty">No entries yet — log the first day.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}

function LogForm({ lastClosing, onClose, onSave }) {
  const [f, setF] = useState({
    date: todayISO(), birdAge: '', opening: lastClosing ?? '', mortality: 0, culls: 0,
    feedGiven: '', eggs: '', medication: '', notes: '',
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
      culls: Number(f.culls) || 0,
      closing,
      feedGiven: f.feedGiven === '' ? null : Number(f.feedGiven),
      eggs: f.eggs === '' ? null : Number(f.eggs),
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
        <Field label="Culls"><input type="number" value={f.culls} onChange={set('culls')} /></Field>
        <Field label="Feed given (kg)"><input type="number" step="0.01" value={f.feedGiven} onChange={set('feedGiven')} /></Field>
        <Field label="Eggs collected"><input type="number" value={f.eggs} onChange={set('eggs')} /></Field>
        <Field label="Closing (auto)"><input value={closing} disabled /></Field>
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
  return (
    <>
      <div className="panel-head" style={{ marginBottom: 14 }}>
        <h3 style={{ fontSize: 18 }}>Feed &amp; Inventory</h3>
        <button className="btn btn-gold" onClick={onAdd}>+ Add feed record</button>
      </div>
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr><th>Date</th><th>Feed type</th><th>Purchased (kg)</th><th>Used (kg)</th><th>Balance (kg)</th><th>Supplier</th><th>Notes</th></tr>
          </thead>
          <tbody>
            {feed.map((r, i) => (
              <tr key={i}>
                <td className="mono">{fmtDate(r.date)}</td>
                <td>{r.feedType || '—'}</td>
                <td className="mono">{r.purchased != null ? num(r.purchased, 1) : '—'}</td>
                <td className="mono">{r.used != null ? num(r.used, 2) : '—'}</td>
                <td className="mono">{r.balance != null ? num(r.balance, 1) : '—'}</td>
                <td>{r.supplier || '—'}</td>
                <td className="notes">{r.notes || ''}</td>
              </tr>
            ))}
            {feed.length === 0 && <tr><td colSpan={7} className="empty">No feed records yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}

function FeedForm({ lastBalance, onClose, onSave }) {
  const [f, setF] = useState({ date: todayISO(), feedType: '', purchased: '', used: '', supplier: '', notes: '' });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const balance = (Number(lastBalance) || 0) + (Number(f.purchased) || 0) - (Number(f.used) || 0);

  function submit() {
    if (!f.date) return;
    onSave({
      date: f.date,
      feedType: f.feedType || null,
      purchased: f.purchased === '' ? null : Number(f.purchased),
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
