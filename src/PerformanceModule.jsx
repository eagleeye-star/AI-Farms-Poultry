import { useMemo, useState } from 'react';
import { proposeImport, toEntries } from './trackerImport';
import {
  newId, activeFarms, equalSplit, ruleFor, splitTotal, allocate, computeMonth, findDuplicate,
  addMonth, monthLabel, lastMonths, FARM_COLORS,
} from './performanceLogic';

const money = (v) => (Number(v) || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money0 = (v) => (Number(v) || 0).toLocaleString('en-GB', { maximumFractionDigits: 0 });
const pct = (v) => (v == null ? '—' : `${v}%`);
const today = () => new Date().toISOString().slice(0, 10);

const STYLE = `
.perf-nav{display:flex;gap:6px;flex-wrap:wrap;margin:10px 0 14px}
.perf-nav button{background:transparent;border:1px solid var(--border);color:var(--text-dim);border-radius:8px;padding:8px 14px;font-size:13.5px;font-weight:600}
.perf-nav button.on{background:rgba(212,165,55,.15);border-color:var(--gold);color:var(--gold)}
.perf-nav button.add{background:var(--gold);border-color:var(--gold);color:#1F1B16}
.perf-card{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:16px;margin-bottom:14px}
.perf-big{font-family:var(--font-display);font-size:34px;font-weight:700;line-height:1.1}
.perf-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:12px}
.perf-farm{text-align:left;width:100%;background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:14px;color:var(--text);cursor:pointer}
.perf-farm:hover{border-color:var(--gold-dim)}
.perf-bar{display:flex;height:10px;border-radius:5px;overflow:hidden;background:var(--bg-alt);margin:10px 0 8px}
.perf-row{display:flex;justify-content:space-between;gap:10px;padding:8px 0;border-bottom:1px solid var(--border);font-size:14px}
.perf-row:last-child{border-bottom:none}
.perf-row.tot{font-weight:700;font-size:15px}
.perf-pos{color:var(--green)} .perf-neg{color:var(--rust)}
.perf-form{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.perf-form .full{grid-column:1/-1}
.perf-form label{display:block;font-size:12.5px;color:var(--text-dim);margin-bottom:4px;font-weight:600}
.perf-form input,.perf-form select{width:100%}
.perf-seg{display:flex;gap:8px}
.perf-seg button{flex:1;min-height:42px;border-radius:10px;border:1px solid var(--border);background:var(--bg-alt);color:var(--text);font-weight:600;font-size:14px}
.perf-seg button.on{background:var(--gold);border-color:var(--gold);color:#1F1B16}
.perf-tip{font-size:12.5px;color:var(--text-faint);line-height:1.5}
.perf-trend{display:flex;align-items:flex-end;justify-content:space-between;gap:8px;height:220px;border-bottom:1px solid var(--border);padding:0 4px}
.perf-trend .col{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%}
.perf-report{background:#fff;color:#1F1B16;padding:28px;border-radius:10px;max-width:820px;font-family:Georgia,serif}
.perf-report h2{font-family:Georgia,serif;color:#1F3D2B;margin:0}
.perf-report table{width:100%;border-collapse:collapse;font-size:13.5px;margin:6px 0 18px}
.perf-report th{background:#EFE6D2;text-align:right;padding:7px 9px} .perf-report th:first-child{text-align:left}
.perf-report td{padding:7px 9px;text-align:right;border-bottom:1px solid #E4DAC6} .perf-report td:first-child{text-align:left}
.perf-report tr.tot td{font-weight:700}
@media (max-width:560px){.perf-form{grid-template-columns:1fr}}
@media print{
  body *{visibility:hidden}
  .perf-report,.perf-report *{visibility:visible}
  .perf-report{position:absolute;left:0;top:0;width:100%;max-width:none;box-shadow:none;border-radius:0}
}
`;

function Delta({ v }) { return <span className={v >= 0 ? 'perf-pos' : 'perf-neg'}>{v >= 0 ? '' : '− '}{money(Math.abs(v))}</span>; }

/* ───────────────────────── Overview ───────────────────────── */
function Overview({ m, onFarm, goShared, goAdd }) {
  if (!m.count) {
    return (
      <div className="perf-card" style={{ textAlign: 'center', padding: 32 }}>
        <p style={{ fontSize: 16, margin: '0 0 6px', fontWeight: 600 }}>Nothing recorded for {monthLabel(m.ym)}</p>
        <p className="perf-tip" style={{ margin: '0 0 14px' }}>Add your sales and costs and each farm&apos;s profit appears here, with shared costs like pump fuel split between the farms.</p>
        <button className="btn btn-gold" onClick={goAdd}>+ Add the first entry</button>
      </div>
    );
  }
  const t = m.totals;
  return (
    <>
      <div className="perf-card" style={{ background: '#1F3D2B', borderColor: '#1F3D2B', color: '#F6F1E7' }}>
        <div style={{ fontSize: 13, opacity: .85 }}>Profit this month, all farms</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', marginTop: 4 }}>
          <div className="perf-big" style={{ color: t.profit < 0 ? '#F2B29B' : '#F6F1E7' }}>{t.profit < 0 ? '− ' : ''}GH₵ {money0(Math.abs(t.profit))}</div>
          <span style={{ background: '#F6F1E7', color: '#1F3D2B', borderRadius: 12, padding: '3px 10px', fontSize: 13, fontWeight: 700 }}>{pct(t.margin)} margin</span>
        </div>
        <div style={{ display: 'flex', gap: 22, marginTop: 10, fontSize: 13.5, flexWrap: 'wrap' }}>
          <span>Income <strong>{money0(t.income)}</strong></span>
          <span>Costs <strong>{money0(t.cost)}</strong></span>
          <span>of which shared <strong>{money0(t.shared)}</strong></span>
        </div>
      </div>
      {m.unassigned > 0 && <div className="perf-card perf-neg" style={{ fontSize: 13.5 }}>GH₵ {money(m.unassigned)} is recorded against a farm that no longer exists and is not counted.</div>}
      <div className="perf-grid">
        {m.farms.map((f) => {
          const base = Math.max(f.income, f.cost, 1);
          const profitPos = Math.max(f.profit, 0);
          return (
            <button key={f.id} className="perf-farm" onClick={() => onFarm(f.id)}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 12, height: 12, borderRadius: '50%', background: f.color }} />
                <strong style={{ fontSize: 15 }}>{f.name}</strong>
              </div>
              <div className="perf-bar" title="Direct costs, shared costs, profit">
                <span style={{ width: `${(f.direct / base) * 100}%`, background: '#C15F41' }} />
                <span style={{ width: `${(f.shared / base) * 100}%`, background: '#D4A537' }} />
                <span style={{ width: `${(profitPos / base) * 100}%`, background: '#7A9A66' }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--text-dim)' }}>
                <span>Income {money0(f.income)}</span><span>Costs {money0(f.cost)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 6 }}>
                <span className={f.profit >= 0 ? 'perf-pos' : 'perf-neg'} style={{ fontSize: 20, fontWeight: 700 }}>{f.profit < 0 ? '− ' : ''}{money0(Math.abs(f.profit))}</span>
                <span style={{ fontSize: 13, color: 'var(--text-dim)' }}>{pct(f.margin)} margin</span>
              </div>
            </button>
          );
        })}
      </div>
      <p className="perf-tip" style={{ margin: '10px 2px' }}>
        <span style={{ color: '#C15F41' }}>■</span> direct costs · <span style={{ color: '#D4A537' }}>■</span> share of shared costs · <span style={{ color: '#7A9A66' }}>■</span> profit
      </p>
      <button className="perf-farm" onClick={goShared} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span><strong>Shared costs</strong><br /><span className="perf-tip">Pump fuel, water, labour split between farms</span></span>
        <span style={{ fontSize: 18, fontWeight: 700 }}>GH₵ {money0(t.shared)}</span>
      </button>
    </>
  );
}

/* ───────────────────────── Farm page ───────────────────────── */
function FarmPage({ perf, m, farmId, onBack, goShared }) {
  const f = m.farms.find((x) => x.id === farmId);
  const cname = (id) => (perf.categories.find((c) => c.id === id) || { name: 'Other' }).name;
  if (!f) return <div className="perf-card">Farm not found. <button className="link-btn" onClick={onBack}>Back</button></div>;
  const Lines = ({ obj, extra }) => Object.entries(obj).sort((a, b) => b[1] - a[1]).map(([id, v]) => (
    <div className="perf-row" key={id}><span>{cname(id)}{extra && m.sharedCats.find((c) => c.categoryId === id) ? ` · ${m.sharedCats.find((c) => c.categoryId === id).pct[f.id] || 0}%` : ''}</span><span>{money(v)}</span></div>
  ));
  return (
    <>
      <button className="link-btn" onClick={onBack}>‹ All farms</button>
      <div className="perf-card" style={{ background: '#1F3D2B', borderColor: '#1F3D2B', color: '#F6F1E7', marginTop: 8 }}>
        <div style={{ fontSize: 13, opacity: .85 }}>{f.name} · {monthLabel(m.ym)}</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
          <div className="perf-big" style={{ color: f.profit < 0 ? '#F2B29B' : '#F6F1E7' }}>{f.profit < 0 ? '− ' : ''}GH₵ {money0(Math.abs(f.profit))}</div>
          <span style={{ background: '#F6F1E7', color: '#1F3D2B', borderRadius: 12, padding: '3px 10px', fontSize: 13, fontWeight: 700 }}>{pct(f.margin)} margin</span>
        </div>
      </div>
      <div className="perf-card"><h4 style={{ margin: '0 0 4px' }}>Income</h4>
        {Object.keys(f.incomeLines).length ? <Lines obj={f.incomeLines} /> : <p className="perf-tip">No income recorded.</p>}
        <div className="perf-row tot"><span>Total income</span><span>GH₵ {money(f.income)}</span></div></div>
      <div className="perf-card"><h4 style={{ margin: '0 0 4px' }}>Direct costs <span className="perf-tip">· only for this farm</span></h4>
        {Object.keys(f.directLines).length ? <Lines obj={f.directLines} /> : <p className="perf-tip">No direct costs recorded.</p>}
        <div className="perf-row tot"><span>Direct costs</span><span>GH₵ {money(f.direct)}</span></div></div>
      <div className="perf-card"><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h4 style={{ margin: 0 }}>Share of shared costs</h4><button className="link-btn" onClick={goShared}>See split ›</button></div>
        {Object.keys(f.sharedLines).length ? <Lines obj={f.sharedLines} extra /> : <p className="perf-tip">No shared costs this month.</p>}
        <div className="perf-row tot"><span>Shared share</span><span>GH₵ {money(f.shared)}</span></div></div>
      <div className="perf-card" style={{ display: 'flex', justifyContent: 'space-between' }}>
        <div><div className="perf-tip">Total costs</div><strong className="perf-neg" style={{ fontSize: 18 }}>GH₵ {money(f.cost)}</strong></div>
        <div style={{ textAlign: 'right' }}><div className="perf-tip">Income − costs</div><strong style={{ fontSize: 18 }}><Delta v={f.profit} /></strong></div>
      </div>
    </>
  );
}

/* ───────────────────────── Shared costs ───────────────────────── */
function SharedPage({ perf, m, goAdd, goSetup }) {
  const farms = m.farms;
  return (
    <>
      <div className="perf-card" style={{ background: '#1F3D2B', borderColor: '#1F3D2B', color: '#F6F1E7' }}>
        <div style={{ fontSize: 13, opacity: .85 }}>Total shared costs, {monthLabel(m.ym)}</div>
        <div className="perf-big">GH₵ {money0(m.totals.shared)}</div>
      </div>
      {m.sharedCats.length === 0 && <div className="perf-card"><p className="perf-tip">No shared costs this month. When you add an expense, choose “Shared by farms” and it is split between the farms by your rule.</p></div>}
      {m.sharedCats.map((c) => (
        <div className="perf-card" key={c.categoryId}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}><h4 style={{ margin: 0 }}>{c.name}</h4><strong>GH₵ {money(c.total)}</strong></div>
          <div className="perf-bar">{farms.map((f) => <span key={f.id} style={{ width: `${c.pct[f.id] || 0}%`, background: f.color }} />)}</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 14px', fontSize: 13.5 }}>
            {farms.filter((f) => c.alloc[f.id]).map((f) => (
              <div key={f.id} style={{ display: 'flex', justifyContent: 'space-between' }}><span><span style={{ color: f.color }}>●</span> {f.name} · {c.pct[f.id]}%</span><b>{money(c.alloc[f.id])}</b></div>
            ))}
          </div>
        </div>
      ))}
      {m.sharedCats.length > 0 && (
        <div className="perf-card" style={{ background: 'var(--bg-alt)' }}>
          <h4 style={{ margin: '0 0 8px' }}>Each farm carries</h4>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 14px', fontSize: 14 }}>
            {farms.map((f) => <div key={f.id} style={{ display: 'flex', justifyContent: 'space-between' }}><span><span style={{ color: f.color }}>●</span> {f.name}</span><b>{money(f.shared)}</b></div>)}
          </div>
        </div>
      )}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button className="btn btn-gold" onClick={goAdd}>+ Add a shared expense</button>
        <button className="btn" onClick={goSetup}>Change the split rules</button>
      </div>
    </>
  );
}

/* ───────────────────────── Add / edit entry ───────────────────────── */
function EntryForm({ perf, edit, ym, onSave, onCancel, askConfirm, showToast }) {
  const farms = activeFarms(perf);
  const init = edit || { type: 'expense', date: ym === today().slice(0, 7) ? today() : `${ym}-01`, amount: '', categoryId: '', farmId: farms[0]?.id || '', shared: false, note: '', split: null };
  const [f, setF] = useState({ ...init, amount: init.amount === '' ? '' : String(init.amount) });
  const [custom, setCustom] = useState(false);
  const [err, setErr] = useState('');

  const cats = perf.categories.filter((c) => c.kind === f.type);
  const cat = perf.categories.find((c) => c.id === f.categoryId);
  const rule = useMemo(() => (f.shared ? (custom && f.split ? f.split : (edit && edit.shared && edit.split && !custom ? edit.split : ruleFor(perf, f.categoryId))) : null), [f.shared, f.categoryId, f.split, custom, perf, edit]);
  const amt = Number(f.amount) || 0;
  const preview = f.shared && rule ? allocate(amt, rule) : null;

  function set(patch) { setF((p) => ({ ...p, ...patch })); setErr(''); }
  function setType(type) {
    const first = perf.categories.find((c) => c.kind === type);
    set({ type, categoryId: first ? first.id : '', shared: type === 'expense' && first ? !!first.shared : false });
    setCustom(false);
  }
  function pickCategory(id) {
    const c = perf.categories.find((x) => x.id === id);
    set({ categoryId: id, shared: f.type === 'expense' && c ? !!c.shared : false, split: null });
    setCustom(false);
  }
  function setPct(farmId, v) {
    const base = rule || {};
    set({ split: { ...base, [farmId]: v === '' ? 0 : Number(v) } });
  }

  async function submit(e) {
    e.preventDefault();
    if (!f.categoryId) return setErr('Choose what this is for.');
    if (!(amt > 0)) return setErr('Enter an amount greater than zero.');
    if (!f.date) return setErr('Choose a date.');
    if (!f.shared && !f.farmId) return setErr('Choose which farm.');
    let split = null;
    if (f.shared) {
      split = rule;
      if (Math.abs(splitTotal(split) - 100) > 0.01) return setErr(`The split adds up to ${splitTotal(split)}%. It must add up to 100%.`);
    }
    const draft = { ...f, amount: amt, shared: !!f.shared, farmId: f.shared ? null : f.farmId, split };
    const dup = findDuplicate(perf, draft, edit && edit.id);
    if (dup) {
      const ok = await askConfirm('An entry with the same date, type, amount and farm is already saved. Is this a second, real entry? Choose Cancel if you pressed save twice.', { confirmLabel: 'Save anyway', danger: false });
      if (!ok) return;
    }
    onSave({ ...(edit || {}), id: edit ? edit.id : newId('e'), date: f.date, type: f.type, categoryId: f.categoryId, farmId: draft.farmId, shared: draft.shared, amount: amt, note: f.note.trim(), split: split ? Object.fromEntries(Object.entries(split).filter(([, v]) => Number(v) > 0)) : null, createdAt: edit ? edit.createdAt : new Date().toISOString() });
    showToast(edit ? 'Entry updated.' : 'Entry saved.', 'green');
  }

  return (
    <form className="perf-card" onSubmit={submit}>
      <h4 style={{ margin: '0 0 12px' }}>{edit ? 'Edit entry' : 'Add an entry'}</h4>
      <div className="perf-form">
        <div className="full"><label>Is this money in or money out?</label>
          <div className="perf-seg">
            <button type="button" className={f.type === 'expense' ? 'on' : ''} onClick={() => setType('expense')}>Cost (money out)</button>
            <button type="button" className={f.type === 'income' ? 'on' : ''} onClick={() => setType('income')}>Sale / income</button>
          </div></div>
        <div><label htmlFor="pf-amt">Amount (GH₵)</label><input id="pf-amt" inputMode="decimal" type="number" step="0.01" min="0" value={f.amount} onChange={(e) => set({ amount: e.target.value })} placeholder="0.00" /></div>
        <div><label htmlFor="pf-date">Date</label><input id="pf-date" type="date" value={f.date} onChange={(e) => set({ date: e.target.value })} /></div>
        <div className="full"><label htmlFor="pf-cat">{f.type === 'income' ? 'What was sold?' : 'What was it for?'}</label>
          <select id="pf-cat" value={f.categoryId} onChange={(e) => pickCategory(e.target.value)}>
            <option value="">Choose…</option>
            {cats.map((c) => <option key={c.id} value={c.id}>{c.name}{c.shared ? ' (usually shared)' : ''}</option>)}
          </select></div>
        {f.type === 'expense' && (
          <div className="full"><label>Who is this cost for?</label>
            <div className="perf-seg">
              <button type="button" className={f.shared ? 'on' : ''} onClick={() => { set({ shared: true }); }}>Shared by farms</button>
              <button type="button" className={!f.shared ? 'on' : ''} onClick={() => set({ shared: false })}>One farm only</button>
            </div></div>
        )}
        {!f.shared && (
          <div className="full"><label htmlFor="pf-farm">Which farm?</label>
            <select id="pf-farm" value={f.farmId || ''} onChange={(e) => set({ farmId: e.target.value })}>
              {farms.map((fm) => <option key={fm.id} value={fm.id}>{fm.name}</option>)}
            </select></div>
        )}
        <div className="full"><label htmlFor="pf-note">Note (optional)</label><input id="pf-note" value={f.note} onChange={(e) => set({ note: e.target.value })} placeholder="e.g. diesel for the pump" /></div>
      </div>

      {f.shared && preview && (
        <div style={{ marginTop: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <strong style={{ fontSize: 14 }}>Who carries what{cat ? ` · ${cat.name} rule` : ''}</strong>
            <button type="button" className="link-btn" onClick={() => { setCustom((c) => !c); if (!custom) set({ split: { ...rule } }); }}>{custom ? 'Use the usual rule' : 'Change for this one'}</button>
          </div>
          <div style={{ marginTop: 6 }}>
            {farms.map((fm) => (
              <div className="perf-row" key={fm.id} style={{ alignItems: 'center' }}>
                <span>{fm.name}{custom ? (
                  <> · <input type="number" min="0" max="100" step="0.5" style={{ width: 74, padding: '4px 6px' }} value={(f.split || rule)[fm.id] ?? 0} onChange={(e) => setPct(fm.id, e.target.value)} aria-label={`${fm.name} percent`} />%</>
                ) : ` · ${rule[fm.id] || 0}%`}</span>
                <span style={{ fontWeight: 600 }}>{money(preview[fm.id] || 0)}</span>
              </div>
            ))}
            <div className="perf-row tot"><span>Total {custom && Math.abs(splitTotal(rule) - 100) > 0.01 ? <span className="perf-neg">({splitTotal(rule)}% — must be 100%)</span> : ''}</span><span>GH₵ {money(amt)}</span></div>
          </div>
        </div>
      )}
      {err && <p className="perf-neg" style={{ margin: '12px 0 0', fontSize: 13.5 }}>{err}</p>}
      <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
        <button className="btn btn-gold" type="submit">{edit ? 'Save changes' : 'Save entry'}</button>
        <button className="btn btn-ghost" type="button" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

/* ───────────────────────── Entries list ───────────────────────── */
function EntriesPage({ perf, ym, onEdit, onDelete }) {
  const cname = (id) => (perf.categories.find((c) => c.id === id) || { name: 'Other' }).name;
  const fname = (id) => (perf.farms.find((f) => f.id === id) || { name: '—' }).name;
  const rows = perf.entries.filter((e) => e.date && e.date.startsWith(ym)).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : String(b.createdAt || '').localeCompare(String(a.createdAt || ''))));
  if (!rows.length) return <div className="perf-card"><p className="perf-tip" style={{ margin: 0 }}>No entries in {monthLabel(ym)}.</p></div>;
  return (
    <div className="perf-card" style={{ padding: 0 }}>
      <div className="table-wrap">
        <table className="data">
          <thead><tr><th>Date</th><th>What</th><th>Farm</th><th style={{ textAlign: 'right' }}>Amount</th><th>Note</th><th /></tr></thead>
          <tbody>
            {rows.map((e) => (
              <tr key={e.id}>
                <td className="mono">{e.date}</td>
                <td>{e.type === 'income' ? '＋ ' : '− '}{cname(e.categoryId)}</td>
                <td>{e.shared ? 'Shared' : fname(e.farmId)}</td>
                <td className="mono" style={{ textAlign: 'right' }}>{money(e.amount)}</td>
                <td className="notes">{e.note || ''}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <button className="link-btn" onClick={() => onEdit(e)}>Edit</button>{' '}
                  <button className="link-btn rust" onClick={() => onDelete(e)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ───────────────────────── Trends ───────────────────────── */
function Trends({ perf, ym }) {
  const months = lastMonths(ym, 6).map((x) => computeMonth(perf, x));
  const max = Math.max(1, ...months.map((x) => Math.abs(x.totals.profit)));
  const cur = months[5]; const prev = months[4];
  const best = [...cur.farms].sort((a, b) => b.profit - a.profit)[0];
  const bestMonth = [...months].sort((a, b) => b.totals.profit - a.totals.profit)[0];
  return (
    <>
      <div className="perf-card">
        <h4 style={{ margin: '0 0 6px' }}>Profit each month, all farms</h4>
        <div className="perf-trend">
          {months.map((x, i) => {
            const v = x.totals.profit; const h = (Math.abs(v) / max) * 170;
            return (
              <div className="col" key={x.ym}>
                <span style={{ fontSize: 11.5, fontWeight: 600, marginBottom: 4 }}>{v === 0 ? '0' : `${v < 0 ? '−' : ''}${(Math.abs(v) / 1000).toFixed(1)}k`}</span>
                <span style={{ width: '70%', maxWidth: 44, height: Math.max(h, v === 0 ? 2 : 4), background: v < 0 ? '#C15F41' : i === 5 ? '#D4A537' : 'var(--gold-dim)', borderRadius: '6px 6px 0 0' }} />
              </div>
            );
          })}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 4px 0', fontSize: 12, color: 'var(--text-dim)' }}>
          {months.map((x) => <span key={x.ym} style={{ flex: 1, textAlign: 'center' }}>{monthLabel(x.ym, true)}</span>)}
        </div>
        <p className="perf-tip" style={{ margin: '10px 0 0' }}>Amounts in GH₵ thousands.</p>
      </div>
      <div className="perf-card" style={{ background: 'var(--bg-alt)' }}>
        <div className="perf-row"><span>This month vs last month</span><b><Delta v={cur.totals.profit - prev.totals.profit} /></b></div>
        <div className="perf-row"><span>Best of these 6 months</span><b>{bestMonth.totals.profit > 0 ? monthLabel(bestMonth.ym) : '—'}</b></div>
        <div className="perf-row"><span>Best farm this month</span><b>{best && cur.count ? `${best.name} · ${money0(best.profit)}` : '—'}</b></div>
      </div>
      <div className="perf-card">
        <h4 style={{ margin: '0 0 4px' }}>Margin by farm, {monthLabel(ym)}</h4>
        {cur.farms.map((f) => <div className="perf-row" key={f.id}><span><span style={{ color: f.color }}>●</span> {f.name}</span><b>{pct(f.margin)}</b></div>)}
      </div>
    </>
  );
}

/* ───────────────────────── Report ───────────────────────── */
function Report({ perf, ym, farmName }) {
  const m = computeMonth(perf, ym);
  const months = lastMonths(ym, 6).map((x) => computeMonth(perf, x));
  const cname = (id) => (perf.categories.find((c) => c.id === id) || { name: 'Other' }).name;
  return (
    <>
      <div style={{ margin: '0 0 12px', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <button className="btn btn-gold" onClick={() => window.print()}>🖨 Print or save as PDF</button>
        <span className="perf-tip">In the print window, choose “Save as PDF” as the printer.</span>
      </div>
      <div className="perf-report">
        <div style={{ borderBottom: '2px solid #1F3D2B', paddingBottom: 10, marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
          <div><div style={{ color: '#6B6256', fontSize: 13 }}>{farmName || 'AI Farms'}</div><h2>Farm Performance Report</h2></div>
          <strong>{monthLabel(ym)}</strong>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 18 }}>
          {[['Income', money(m.totals.income), '#1F1B16'], ['Costs', money(m.totals.cost), '#A8481F'], [`Profit · ${pct(m.totals.margin)}`, `GH₵ ${money(m.totals.profit)}`, '#1F3D2B']].map(([k, v, c]) => (
            <div key={k} style={{ border: '1px solid #CFC3AB', borderRadius: 8, padding: '8px 10px' }}><div style={{ fontSize: 12, color: '#6B6256' }}>{k}</div><div style={{ fontSize: 18, fontWeight: 700, color: c }}>{v}</div></div>
          ))}
        </div>
        <h3 style={{ margin: '0 0 4px', color: '#1F1B16' }}>Profit per farm</h3>
        <table><thead><tr><th>Farm</th><th>Income</th><th>Direct costs</th><th>Shared share</th><th>Profit</th><th>Margin</th></tr></thead>
          <tbody>
            {m.farms.map((f) => <tr key={f.id}><td>{f.name}</td><td>{money(f.income)}</td><td>{money(f.direct)}</td><td>{money(f.shared)}</td><td><b>{money(f.profit)}</b></td><td>{pct(f.margin)}</td></tr>)}
            <tr className="tot"><td>All farms</td><td>{money(m.totals.income)}</td><td>{money(m.totals.direct)}</td><td>{money(m.totals.shared)}</td><td>{money(m.totals.profit)}</td><td>{pct(m.totals.margin)}</td></tr>
          </tbody></table>
        <h3 style={{ margin: '0 0 4px', color: '#1F1B16' }}>Shared costs and how they were split</h3>
        <table><thead><tr><th>Cost</th><th>Total</th>{m.farms.map((f) => <th key={f.id}>{f.name.split(' ')[0]}</th>)}</tr></thead>
          <tbody>
            {m.sharedCats.length === 0 && <tr><td colSpan={2 + m.farms.length} style={{ textAlign: 'left' }}>No shared costs this month.</td></tr>}
            {m.sharedCats.map((c) => <tr key={c.categoryId}><td>{cname(c.categoryId)}</td><td>{money(c.total)}</td>{m.farms.map((f) => <td key={f.id}>{money(c.alloc[f.id] || 0)}</td>)}</tr>)}
            {m.sharedCats.length > 0 && <tr className="tot"><td>Total</td><td>{money(m.totals.shared)}</td>{m.farms.map((f) => <td key={f.id}>{money(f.shared)}</td>)}</tr>}
          </tbody></table>
        <h3 style={{ margin: '0 0 4px', color: '#1F1B16' }}>Profit by month, all farms</h3>
        <table><thead><tr>{months.map((x) => <th key={x.ym} style={{ textAlign: 'right' }}>{monthLabel(x.ym, true)}</th>)}</tr></thead>
          <tbody><tr>{months.map((x) => <td key={x.ym}><b>{money0(x.totals.profit)}</b></td>)}</tr></tbody></table>
        <p style={{ fontSize: 12, color: '#6B6256', margin: 0 }}>All amounts in Ghana cedis (GH₵). Printed {new Date().toLocaleDateString('en-GB')}.</p>
      </div>
    </>
  );
}

/* ───────────────────────── Import from farm records ───────────────────────── */
function ImportPage({ data, perf, ym, onChange, showToast, goEntries }) {
  const prop = useMemo(() => proposeImport(data, perf, ym), [data, perf, ym]);
  const inc = prop.items.filter((i) => i.type === 'income').reduce((s, i) => s + i.amount, 0);
  const exp = prop.items.filter((i) => i.type === 'expense').reduce((s, i) => s + i.amount, 0);
  const cname = (id) => (perf.categories.find((c) => c.id === id) || { name: 'Other' }).name;
  const fname = (id) => (perf.farms.find((f) => f.id === id) || { name: '' }).name;
  function run() {
    onChange({ ...perf, entries: [...perf.entries, ...toEntries(prop.items, perf)] });
    showToast(`${prop.items.length} entries imported.`, 'green');
    goEntries();
  }
  return (
    <>
      <div className="perf-card">
        <h4 style={{ margin: '0 0 4px' }}>Pull from your farm records · {monthLabel(ym)}</h4>
        <p className="perf-tip" style={{ margin: 0 }}>This copies sales and costs you already logged (eggs and bird sales, harvests, goat sales, feed, medication, sprays, farm expenses) into Performance, so you do not type them again. Use the arrows at the top to pick another month. Anything already imported is skipped, and equipment and structures are left out.</p>
      </div>
      {prop.items.length === 0 ? (
        <div className="perf-card"><p className="perf-tip" style={{ margin: 0 }}>Nothing new to import for {monthLabel(ym)}.{prop.already ? ` ${prop.already} already imported.` : ''}</p></div>
      ) : (
        <>
          <div className="perf-card" style={{ display: 'flex', gap: 22, flexWrap: 'wrap' }}>
            <span>Sales <b>GH₵ {money(inc)}</b></span><span>Costs <b>GH₵ {money(exp)}</b></span><span>{prop.items.length} entries</span>
            <button className="btn btn-gold" style={{ marginLeft: 'auto' }} onClick={run}>Import {prop.items.length} entries</button>
          </div>
          <div className="perf-card" style={{ padding: 0 }}><div className="table-wrap"><table className="data">
            <thead><tr><th>Date</th><th>What</th><th>Farm</th><th style={{ textAlign: 'right' }}>Amount</th><th>Note</th></tr></thead>
            <tbody>{[...prop.items].sort((a, b) => a.date.localeCompare(b.date)).map((i) => (
              <tr key={i.src}><td className="mono">{i.date}</td><td>{i.type === 'income' ? '＋ ' : '− '}{cname(i.categoryId)}</td><td>{i.shared ? 'Shared' : fname(i.farmId)}</td><td className="mono" style={{ textAlign: 'right' }}>{money(i.amount)}</td><td className="notes">{i.note}</td></tr>
            ))}</tbody></table></div></div>
        </>
      )}
      {prop.skipped > 0 && <p className="perf-tip">{prop.skipped} record(s) were left out because the farm or cost type they belong to was renamed or removed in Setup.</p>}
    </>
  );
}

/* ───────────────────────── Setup ───────────────────────── */
function Setup({ perf, onChange, askConfirm, showToast }) {
  const farms = activeFarms(perf);
  const [newFarm, setNewFarm] = useState('');
  const [newCat, setNewCat] = useState({ name: '', kind: 'expense', shared: false });
  const used = new Set(perf.entries.map((e) => e.categoryId));
  const usedFarm = new Set(perf.entries.map((e) => e.farmId).filter(Boolean));

  function renameFarm(id, name) { onChange({ ...perf, farms: perf.farms.map((f) => (f.id === id ? { ...f, name } : f)) }); }
  function addFarm() {
    const name = newFarm.trim(); if (!name) return;
    onChange({ ...perf, farms: [...perf.farms, { id: newId('f'), name, color: FARM_COLORS[perf.farms.length % FARM_COLORS.length], active: true }] });
    setNewFarm('');
  }
  async function retireFarm(f) {
    if (usedFarm.has(f.id)) {
      if (!(await askConfirm(`Stop using “${f.name}”? Its past entries stay in your records and reports, but it won't get new shared costs.`, { confirmLabel: 'Stop using', danger: false }))) return;
      onChange({ ...perf, farms: perf.farms.map((x) => (x.id === f.id ? { ...x, active: false } : x)) });
    } else if (await askConfirm(`Remove “${f.name}”? It has no entries.`)) {
      onChange({ ...perf, farms: perf.farms.filter((x) => x.id !== f.id) });
    }
  }
  function reactivate(f) { onChange({ ...perf, farms: perf.farms.map((x) => (x.id === f.id ? { ...x, active: true } : x)) }); }
  function addCategory() {
    const name = newCat.name.trim(); if (!name) return;
    onChange({ ...perf, categories: [...perf.categories, { id: newId('c'), name, kind: newCat.kind, shared: newCat.kind === 'expense' && newCat.shared }] });
    setNewCat({ name: '', kind: 'expense', shared: false });
  }
  function renameCat(id, name) { onChange({ ...perf, categories: perf.categories.map((c) => (c.id === id ? { ...c, name } : c)) }); }
  function toggleCatShared(id) { onChange({ ...perf, categories: perf.categories.map((c) => (c.id === id ? { ...c, shared: !c.shared } : c)) }); }
  async function delCat(c) {
    if (used.has(c.id)) { showToast('That type has entries, so it cannot be removed. Rename it instead.', 'rust'); return; }
    if (await askConfirm(`Remove “${c.name}”?`)) onChange({ ...perf, categories: perf.categories.filter((x) => x.id !== c.id), rules: Object.fromEntries(Object.entries(perf.rules).filter(([k]) => k !== c.id)) });
  }
  function setRule(catId, farmId, v) {
    const cur = { ...(perf.rules[catId] || ruleFor(perf, catId)) };
    cur[farmId] = v === '' ? 0 : Number(v);
    onChange({ ...perf, rules: { ...perf.rules, [catId]: cur } });
  }
  function equalRule(catId) { onChange({ ...perf, rules: { ...perf.rules, [catId]: equalSplit(farms.map((f) => f.id)) } }); }

  const sharedCats = perf.categories.filter((c) => c.kind === 'expense' && c.shared);
  return (
    <>
      <div className="perf-card">
        <h4 style={{ margin: '0 0 8px' }}>Your farms</h4>
        {perf.farms.map((f) => (
          <div className="perf-row" key={f.id} style={{ alignItems: 'center' }}>
            <span style={{ display: 'flex', gap: 8, alignItems: 'center', flex: 1 }}><span style={{ width: 12, height: 12, borderRadius: '50%', background: f.color, flexShrink: 0 }} />
              <input value={f.name} onChange={(e) => renameFarm(f.id, e.target.value)} style={{ flex: 1, minWidth: 0 }} aria-label="Farm name" /></span>
            {f.active === false ? <button className="link-btn" onClick={() => reactivate(f)}>Use again</button> : <button className="link-btn rust" onClick={() => retireFarm(f)}>Remove</button>}
          </div>
        ))}
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <input value={newFarm} onChange={(e) => setNewFarm(e.target.value)} placeholder="New farm, e.g. Tilapia" style={{ flex: 1 }} onKeyDown={(e) => { if (e.key === 'Enter') addFarm(); }} />
          <button className="btn" onClick={addFarm}>Add farm</button>
        </div>
      </div>

      <div className="perf-card">
        <h4 style={{ margin: '0 0 4px' }}>How shared costs are split</h4>
        <p className="perf-tip" style={{ margin: '0 0 10px' }}>Set the percentage each farm carries for each shared cost. New entries use these. Entries you already saved keep the split they were saved with.</p>
        {sharedCats.map((c) => {
          const r = perf.rules[c.id] || ruleFor(perf, c.id);
          const total = splitTotal(Object.fromEntries(farms.map((f) => [f.id, r[f.id] || 0])));
          return (
            <div key={c.id} style={{ borderTop: '1px solid var(--border)', padding: '10px 0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <strong>{c.name}</strong>
                <span style={{ fontSize: 13 }} className={Math.abs(total - 100) > 0.01 ? 'perf-neg' : 'perf-pos'}>Total {total}%{Math.abs(total - 100) > 0.01 ? ' — must be 100%' : ' ✓'}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))', gap: 8, marginTop: 8 }}>
                {farms.map((f) => (
                  <label key={f.id} style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ flex: 1 }}>{f.name}</span>
                    <input type="number" min="0" max="100" step="0.5" value={r[f.id] ?? 0} onChange={(e) => setRule(c.id, f.id, e.target.value)} style={{ width: 70, padding: '5px 6px' }} />%
                  </label>
                ))}
              </div>
              <button className="link-btn" style={{ marginTop: 6 }} onClick={() => equalRule(c.id)}>Split equally</button>
            </div>
          );
        })}
        {sharedCats.length === 0 && <p className="perf-tip">No shared cost types yet. Tick “shared” on a cost type below.</p>}
      </div>

      <div className="perf-card">
        <h4 style={{ margin: '0 0 8px' }}>Sales and cost types</h4>
        {['income', 'expense'].map((kind) => (
          <div key={kind} style={{ marginBottom: 10 }}>
            <div className="perf-tip" style={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: .5, margin: '6px 0' }}>{kind === 'income' ? 'Sales / income' : 'Costs'}</div>
            {perf.categories.filter((c) => c.kind === kind).map((c) => (
              <div className="perf-row" key={c.id} style={{ alignItems: 'center' }}>
                <input value={c.name} onChange={(e) => renameCat(c.id, e.target.value)} style={{ flex: 1, minWidth: 0 }} aria-label="Type name" />
                {kind === 'expense' && <label style={{ fontSize: 12.5, whiteSpace: 'nowrap' }}><input type="checkbox" checked={!!c.shared} onChange={() => toggleCatShared(c.id)} style={{ width: 'auto', marginRight: 5 }} />shared</label>}
                <button className="link-btn rust" onClick={() => delCat(c)}>Remove</button>
              </div>
            ))}
          </div>
        ))}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
          <input value={newCat.name} onChange={(e) => setNewCat({ ...newCat, name: e.target.value })} placeholder="New type, e.g. Medication" style={{ flex: 1, minWidth: 160 }} />
          <select value={newCat.kind} onChange={(e) => setNewCat({ ...newCat, kind: e.target.value })}><option value="expense">Cost</option><option value="income">Sale / income</option></select>
          {newCat.kind === 'expense' && <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 5 }}><input type="checkbox" checked={newCat.shared} onChange={(e) => setNewCat({ ...newCat, shared: e.target.checked })} style={{ width: 'auto' }} />shared</label>}
          <button className="btn" onClick={addCategory}>Add type</button>
        </div>
      </div>
    </>
  );
}

/* ───────────────────────── Main ───────────────────────── */
export default function PerformanceModule({ perf, onChange, askConfirm, showToast, farmName, data }) {
  const [ym, setYm] = useState(today().slice(0, 7));
  const [view, setView] = useState('overview');
  const [farmId, setFarmId] = useState(null);
  const [editing, setEditing] = useState(null);
  const m = useMemo(() => computeMonth(perf, ym), [perf, ym]);

  function go(v) { setView(v); setEditing(null); }
  function save(entry) {
    const exists = perf.entries.some((e) => e.id === entry.id);
    onChange({ ...perf, entries: exists ? perf.entries.map((e) => (e.id === entry.id ? entry : e)) : [...perf.entries, entry] });
    if (entry.date && entry.date.slice(0, 7) !== ym) setYm(entry.date.slice(0, 7));
    setEditing(null); setView('entries');
  }
  async function del(e) {
    if (!(await askConfirm(`Delete this ${e.type === 'income' ? 'sale' : 'cost'} of GH₵ ${money(e.amount)} (${e.date})? Use this to remove a duplicate.`))) return;
    onChange({ ...perf, entries: perf.entries.filter((x) => x.id !== e.id) });
    showToast('Entry deleted.', 'green');
  }

  const tabs = [['overview', 'Overview'], ['shared', 'Shared costs'], ['entries', 'Entries'], ['trends', 'Trends'], ['report', 'Report'], ['import', 'Import'], ['setup', 'Setup']];
  const showMonth = !['setup'].includes(view);
  return (
    <div style={{ maxWidth: 940 }}>
      <style>{STYLE}</style>
      <div className="panel-head" style={{ marginBottom: 4 }}>
        <h3 style={{ fontSize: 20 }}>Farm Performance</h3>
        {showMonth && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button className="btn btn-ghost" onClick={() => setYm(addMonth(ym, -1))} aria-label="Previous month">‹</button>
            <strong style={{ minWidth: 130, textAlign: 'center' }}>{monthLabel(ym)}</strong>
            <button className="btn btn-ghost" onClick={() => setYm(addMonth(ym, 1))} aria-label="Next month">›</button>
          </div>
        )}
      </div>
      <div className="perf-nav">
        {tabs.map(([k, label]) => <button key={k} className={view === k || (k === 'overview' && view === 'farm') ? 'on' : ''} onClick={() => go(k)}>{label}</button>)}
        <button className="add" onClick={() => go('add')}>+ Add entry</button>
      </div>

      {view === 'overview' && <Overview m={m} onFarm={(id) => { setFarmId(id); setView('farm'); }} goShared={() => go('shared')} goAdd={() => go('add')} />}
      {view === 'farm' && <FarmPage perf={perf} m={m} farmId={farmId} onBack={() => go('overview')} goShared={() => go('shared')} />}
      {view === 'shared' && <SharedPage perf={perf} m={m} goAdd={() => go('add')} goSetup={() => go('setup')} />}
      {view === 'add' && <EntryForm key={editing ? editing.id : 'new'} perf={perf} edit={editing} ym={ym} onSave={save} onCancel={() => go('entries')} askConfirm={askConfirm} showToast={showToast} />}
      {view === 'entries' && <EntriesPage perf={perf} ym={ym} onEdit={(e) => { setEditing(e); setView('add'); }} onDelete={del} />}
      {view === 'trends' && <Trends perf={perf} ym={ym} />}
      {view === 'report' && <Report perf={perf} ym={ym} farmName={farmName} />}
      {view === 'import' && data && <ImportPage data={data} perf={perf} ym={ym} onChange={onChange} showToast={showToast} goEntries={() => go('entries')} />}
      {view === 'setup' && <Setup perf={perf} onChange={onChange} askConfirm={askConfirm} showToast={showToast} />}
    </div>
  );
}
