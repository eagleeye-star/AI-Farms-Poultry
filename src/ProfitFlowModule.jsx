import { useMemo, useState } from 'react';
import { DESTS, getUnits, unitRecords, rangeFlow, feedPeriods, wholeFarmCosts, flowId, addDays, allAllocations } from './flowLogic';

const money = (v) => (Number(v) || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money0 = (v) => (Number(v) || 0).toLocaleString('en-GB', { maximumFractionDigits: 0 });
const today = () => new Date().toISOString().slice(0, 10);
const fmt = (iso) => (iso ? new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '');
const DEST_COLOR = { reinvest: '#C97B2A', savings: '#7A9A66', owner: '#8B6FB5', eagleeye: '#3E7CB1', transfer: '#D4A537', other: '#9A9080' };

const CSS = `
.pf-card{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:16px;margin-bottom:14px}
.pf-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px;margin-bottom:14px}
.pf-unit{text-align:left;background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:12px;color:var(--text);cursor:pointer}
.pf-unit.on{border-color:var(--gold);background:rgba(212,165,55,.10)}
.pf-row{display:flex;justify-content:space-between;gap:10px;padding:7px 0;border-bottom:1px solid var(--border);font-size:14px}
.pf-row:last-child{border-bottom:none}
.pf-pos{color:var(--green)} .pf-neg{color:var(--rust)}
.pf-tip{font-size:12.5px;color:var(--text-faint);line-height:1.5}
.pf-bar{display:flex;height:22px;border-radius:6px;overflow:hidden;background:var(--bg-alt);margin:8px 0}
.pf-step{display:grid;grid-template-columns:1fr;gap:4px}
.pf-chips{display:flex;gap:6px;flex-wrap:wrap;margin:6px 0 14px}
.pf-chips button{border:1px solid var(--border);background:transparent;color:var(--text-dim);border-radius:16px;padding:6px 12px;font-size:13px}
.pf-chips button.on{background:rgba(212,165,55,.15);border-color:var(--gold);color:var(--gold);font-weight:600}
.pf-form{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.pf-form label{display:block;font-size:12.5px;color:var(--text-dim);margin-bottom:3px;font-weight:600}
.pf-form input,.pf-form select{width:100%}
@media (max-width:560px){.pf-form{grid-template-columns:1fr}}
`;

function Lines({ lines, neg }) {
  if (!lines.length) return <div className="pf-tip">Nothing in this period.</div>;
  return lines.map((l) => <div className="pf-row" key={l.cat}><span>{l.cat}</span><span className={neg ? 'pf-neg' : ''}>{money(l.amount)}</span></div>);
}

function FlowStrip({ f }) {
  // one bar for the money: costs | profit split into where it went | held
  const base = Math.max(f.income, f.cost, 1);
  const segs = [{ w: f.cost, c: '#C15F41', t: 'Costs' }];
  DESTS.forEach((d) => { if (f.out[d.id]) segs.push({ w: f.out[d.id], c: DEST_COLOR[d.id], t: d.label }); });
  if (f.held > 0) segs.push({ w: f.held, c: '#B8B09E', t: 'Held (not yet placed)' });
  return (
    <>
      <div className="pf-bar" role="img" aria-label="Where the sales money went">
        {segs.map((s) => <span key={s.t} title={`${s.t}: ${money(s.w)}`} style={{ width: `${(s.w / base) * 100}%`, background: s.c }} />)}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px', fontSize: 12.5 }}>
        {segs.map((s) => <span key={s.t}><span style={{ color: s.c }}>■</span> {s.t} {money0(s.w)}</span>)}
      </div>
    </>
  );
}

function AllocateForm({ units, unit, held, onSave, onCancel }) {
  const [f, setF] = useState({ date: today(), dest: 'reinvest', amount: '', toUnitId: unit.id, note: '', item: '', kind: 'input', alreadyLogged: false });
  const [err, setErr] = useState('');
  const set = (p) => { setF((x) => ({ ...x, ...p })); setErr(''); };
  const others = units.filter((u) => u.id !== unit.id);
  function submit(e) {
    e.preventDefault();
    const amt = Number(f.amount);
    if (!(amt > 0)) return setErr('Enter an amount.');
    if (f.dest === 'transfer' && !f.toUnitId) return setErr('Choose which farm receives it.');
    if (f.dest === 'reinvest' && !f.item.trim()) return setErr('Say what was bought, for example “spray machine”.');
    const re = f.dest === 'reinvest';
    onSave({ id: flowId(), date: f.date, unitId: unit.id, dest: f.dest, amount: amt, toUnitId: (re || f.dest === 'transfer') ? f.toUnitId : null, note: f.note.trim(), ...(re ? { item: f.item.trim(), kind: f.kind, alreadyLogged: f.kind === 'input' && f.alreadyLogged } : {}) });
  }
  return (
    <form className="pf-card" onSubmit={submit}>
      <h4 style={{ margin: '0 0 4px' }}>Place profit from {unit.name}</h4>
      <p className="pf-tip" style={{ margin: '0 0 10px' }}>Cash held for {unit.name} so far: <strong>GH₵ {money(held)}</strong></p>
      <div className="pf-form">
        <div><label htmlFor="pa-amt">Amount (GH₵)</label><input id="pa-amt" type="number" step="0.01" min="0" inputMode="decimal" value={f.amount} onChange={(e) => set({ amount: e.target.value })} /></div>
        <div><label htmlFor="pa-date">Date</label><input id="pa-date" type="date" value={f.date} onChange={(e) => set({ date: e.target.value })} /></div>
        <div style={{ gridColumn: '1/-1' }}><label htmlFor="pa-dest">Where did it go?</label>
          <select id="pa-dest" value={f.dest} onChange={(e) => set({ dest: e.target.value })}>{DESTS.map((d) => <option key={d.id} value={d.id}>{d.icon} {d.label}</option>)}</select></div>
        {f.dest === 'reinvest' && (<>
          <div style={{ gridColumn: '1/-1' }}><label htmlFor="pa-item">What did you buy?</label>
            <input id="pa-item" value={f.item} onChange={(e) => set({ item: e.target.value })} placeholder="e.g. spray machine, pesticides, seed" /></div>
          <div style={{ gridColumn: '1/-1' }}><label htmlFor="pa-for">Which farm or field is it for?</label>
            <select id="pa-for" value={f.toUnitId} onChange={(e) => set({ toUnitId: e.target.value })}>
              {units.map((u) => <option key={u.id} value={u.id}>{u.name}{u.id === unit.id ? ' (same farm)' : ''}</option>)}
              <option value="crops">All crops (shared)</option>
              <option value="poultry">All poultry (shared)</option>
              <option value="shared">Whole farm (shared tools)</option>
            </select></div>
          <div style={{ gridColumn: '1/-1' }}><label>What kind of purchase?</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" className={`btn ${f.kind === 'input' ? 'btn-gold' : 'btn-ghost'}`} onClick={() => set({ kind: 'input' })}>Used up: pesticides, seed, fertiliser</button>
              <button type="button" className={`btn ${f.kind === 'asset' ? 'btn-gold' : 'btn-ghost'}`} onClick={() => set({ kind: 'asset' })}>Lasts years: machines, tools, structures</button>
            </div>
            <p className="pf-tip" style={{ margin: '6px 0 0' }}>{f.kind === 'input' ? 'Counted as a cost of that farm.' : 'Kept as an investment in that farm, not a running cost, so it does not make that farm look like it lost money.'}</p></div>
          {f.kind === 'input' && <label style={{ gridColumn: '1/-1', display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
            <input type="checkbox" style={{ width: 'auto' }} checked={f.alreadyLogged} onChange={(e) => set({ alreadyLogged: e.target.checked })} />
            I already entered this purchase in the spray or expense log (so do not count it twice)</label>}
        </>)}
        {f.dest === 'transfer' && <div style={{ gridColumn: '1/-1' }}><label htmlFor="pa-to">Which farm receives it?</label>
          <select id="pa-to" value={f.toUnitId} onChange={(e) => set({ toUnitId: e.target.value })}><option value="">Choose…</option>{others.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></div>}
        <div style={{ gridColumn: '1/-1' }}><label htmlFor="pa-note">Note (optional)</label><input id="pa-note" value={f.note} onChange={(e) => set({ note: e.target.value })} placeholder="e.g. paid for pepper seedlings" /></div>
      </div>
      {err && <p className="pf-neg" style={{ margin: '10px 0 0', fontSize: 13.5 }}>{err}</p>}
      <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
        <button className="btn btn-gold" type="submit">Save</button>
        <button className="btn btn-ghost" type="button" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

export default function ProfitFlowModule({ data, flow, onChange, askConfirm, showToast }) {
  const wfLine = (() => {
    const t = wholeFarmCosts(data); const m = (flow.settings || {}).wholeFarmSplit || 'none';
    return `Whole-farm costs recorded: GH₵ ${money(t)}. ${m === 'none' ? 'Not included in any farm above.' : m === 'sales' ? 'Shared in proportion to each farm\'s total sales.' : 'Shared equally between all units.'}`;
  })();
  const units = useMemo(() => getUnits(data), [data]);
  const recs = useMemo(() => Object.fromEntries(units.map((u) => [u.id, unitRecords(data, u, units, flow)])), [data, units, flow]);
  const [unitId, setUnitId] = useState(units[0] ? units[0].id : null);
  const unit = units.find((u) => u.id === unitId) || units[0];
  const [range, setRange] = useState('batch');
  const [custom, setCustom] = useState({ from: today().slice(0, 8) + '01', to: today() });
  const [batchIdx, setBatchIdx] = useState(-1);
  const [adding, setAdding] = useState(false);

  if (!unit) return <div className="pf-card">No farms yet.</div>;
  const rec = recs[unit.id];
  const t = today();
  const periods = feedPeriods(data, unit, t);
  const isFlock = unit.kind === 'flock';
  const mode = range === 'batch' && !isFlock ? 'month' : range;
  let from = null; let to = null; let label = 'All time';
  if (mode === 'batch' && periods.length) {
    const p = periods[batchIdx >= 0 && batchIdx < periods.length ? batchIdx : periods.length - 1];
    from = p.from; to = p.to; label = `Feed batch ${fmt(p.from)} to ${p.open ? 'today' : fmt(p.to)}`;
  } else if (mode === 'month') { from = t.slice(0, 7) + '-01'; to = t; label = 'This month'; }
  else if (mode === '30') { from = addDays(t, -29); to = t; label = 'Last 30 days'; }
  else if (mode === 'custom') { from = custom.from; to = custom.to; label = `${fmt(from)} to ${fmt(to)}`; }
  else if (mode === 'batch') { label = 'All time'; }
  const f = rangeFlow(data, rec, unit, from, to, flow);
  const all = rangeFlow(data, rec, unit, null, null, flow);
  const feed = rec.feed;
  const allocs = allAllocations(data, flow).filter((a) => a.unitId === unit.id || a.toUnitId === unit.id).sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const nm = (id) => (id === 'shared' ? 'Whole farm' : id === 'crops' ? 'All crops' : id === 'poultry' ? 'All poultry' : (units.find((u) => u.id === id) || { name: '—' }).name);

  function save(a) { onChange({ ...flow, allocations: [...(flow.allocations || []), a] }); setAdding(false); showToast('Saved.', 'green'); }
  async function del(a) {
    if (!(await askConfirm(`Remove this GH₵ ${money(a.amount)} entry?`))) return;
    onChange({ ...flow, allocations: flow.allocations.filter((x) => x.id !== a.id) });
  }

  const wf = wholeFarmCosts(data);
  return (
    <div style={{ maxWidth: 940 }}>
      <style>{CSS}</style>
      <div className="panel-head" style={{ marginBottom: 8 }}><h3 style={{ fontSize: 20 }}>Profit Flow</h3></div>
      <p className="pf-tip" style={{ margin: '0 0 12px' }}>Follow the money for each flock and field: sales in, what it cost (feed counted as it is used, not when bought), the profit, and where the profit went.</p>

      <div className="pf-card" style={{ padding: 12 }}>
        <label htmlFor="pf-share" style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Whole-farm costs (fuel, general labour…)</label>
        <select id="pf-share" value={(flow.settings || {}).wholeFarmSplit || 'none'} onChange={(e) => onChange({ ...flow, settings: { ...(flow.settings || {}), wholeFarmSplit: e.target.value } })}>
          <option value="none">Leave out of each farm's profit</option>
          <option value="sales">Share by each farm's sales</option>
          <option value="equal">Share equally between farms</option>
        </select>
        <p className="pf-tip" style={{ margin: '6px 0 0' }}>{wfLine}</p>
      </div>

      <div className="pf-grid">
        {units.map((u) => {
          const a = rangeFlow(data, recs[u.id], u, null, null, flow);
          return (
            <button key={u.id} className={`pf-unit${u.id === unit.id ? ' on' : ''}`} onClick={() => { setUnitId(u.id); setAdding(false); setBatchIdx(-1); }}>
              <strong>{u.name}</strong>
              <div className={a.profit >= 0 ? 'pf-pos' : 'pf-neg'} style={{ fontSize: 18, fontWeight: 700 }}>{a.profit < 0 ? '− ' : ''}GH₵ {money0(Math.abs(a.profit))}</div>
              <div className="pf-tip">Held cash {money0(a.held)} · all time</div>
            </button>
          );
        })}
      </div>

      <div className="pf-chips">
        {isFlock && periods.length > 0 && <button className={mode === 'batch' ? 'on' : ''} onClick={() => setRange('batch')}>By feed batch</button>}
        <button className={mode === 'month' ? 'on' : ''} onClick={() => setRange('month')}>This month</button>
        <button className={mode === '30' ? 'on' : ''} onClick={() => setRange('30')}>Last 30 days</button>
        <button className={mode === 'all' ? 'on' : ''} onClick={() => setRange('all')}>All time</button>
        <button className={mode === 'custom' ? 'on' : ''} onClick={() => setRange('custom')}>Pick dates</button>
      </div>
      {mode === 'batch' && periods.length > 0 && (
        <div className="pf-chips" style={{ marginTop: -6 }}>
          {periods.map((p, i) => <button key={p.from} className={(batchIdx < 0 ? i === periods.length - 1 : i === batchIdx) ? 'on' : ''} onClick={() => setBatchIdx(i)}>{fmt(p.from)}{p.open ? ' → now' : ''}</button>)}
        </div>
      )}
      {mode === 'custom' && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          <input type="date" value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} />
          <input type="date" value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} />
        </div>
      )}

      <div className="pf-card" style={{ background: '#1F3D2B', borderColor: '#1F3D2B', color: '#F6F1E7' }}>
        <div style={{ fontSize: 13, opacity: .85 }}>{unit.name} · {label}</div>
        <div style={{ display: 'flex', gap: 14, alignItems: 'baseline', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 32, fontWeight: 700, color: f.profit < 0 ? '#F2B29B' : '#F6F1E7' }}>{f.profit < 0 ? '− ' : ''}GH₵ {money0(Math.abs(f.profit))}</span>
          <span style={{ fontSize: 13 }}>profit{f.margin != null ? ` · ${f.margin}% margin` : ''}</span>
        </div>
        <div style={{ display: 'flex', gap: 18, fontSize: 13.5, marginTop: 6, flexWrap: 'wrap' }}><span>Sales <b>{money0(f.income)}</b></span><span>Costs <b>{money0(f.cost)}</b></span></div>
      </div>

      <div className="pf-card">
        <h4 style={{ margin: '0 0 2px' }}>Where the sales money went</h4>
        <FlowStrip f={f} />
      </div>

      <div className="pf-card"><h4 style={{ margin: 0 }}>1. Money in (sales)</h4><Lines lines={f.incomeLines} />
        <div className="pf-row"><b>Total sales</b><b>GH₵ {money(f.income)}</b></div></div>
      <div className="pf-card"><h4 style={{ margin: 0 }}>2. Costs this period</h4><Lines lines={f.costLines} neg />
        <div className="pf-row"><b>Total costs</b><b className="pf-neg">GH₵ {money(f.cost)}</b></div></div>
      <div className="pf-card"><h4 style={{ margin: 0 }}>3. Profit and where it went</h4>
        <div className="pf-row"><span>Profit</span><b className={f.profit >= 0 ? 'pf-pos' : 'pf-neg'}>GH₵ {money(f.profit)}</b></div>
        {DESTS.filter((d) => f.out[d.id]).map((d) => <div className="pf-row" key={d.id}><span><span style={{ color: DEST_COLOR[d.id] }}>■</span> {d.label}</span><span>− {money(f.out[d.id])}</span></div>)}
        {f.received > 0 && <div className="pf-row"><span>Received from other farms</span><span>+ {money(f.received)}</span></div>}
        {f.groupInvestments.length > 0 && <div className="pf-row pf-tip"><span>Shared equipment for all {unit.farm === 'pepper' ? 'crops' : 'poultry'} ({f.groupInvestments.map((g) => g.item).join(', ')}), not split between units</span><span>{money(f.groupInvestments.reduce((t, g) => t + g.amount, 0))}</span></div>}
        {f.invested > 0 && <div className="pf-row pf-tip"><span>Equipment and tools bought for this farm (investment, not in costs)</span><span>{money(f.invested)}</span></div>}
        <div className="pf-row"><b>Held, not yet placed</b><b>GH₵ {money(f.held)}</b></div>
        {!adding && <button className="btn btn-gold" style={{ marginTop: 10 }} onClick={() => setAdding(true)}>+ Place some profit</button>}
      </div>
      {adding && <AllocateForm units={units} unit={unit} held={all.held} onSave={save} onCancel={() => setAdding(false)} />}

      {isFlock && feed && (
        <div className="pf-card">
          <h4 style={{ margin: '0 0 2px' }}>Feed batches</h4>
          <p className="pf-tip" style={{ margin: '0 0 8px' }}>Each purchase is used up oldest first, day by day, from your Daily Log. Its cost counts as it is eaten.</p>
          {feed.batches.length === 0 ? <p className="pf-tip">No feed purchases for this flock yet. Add them in the Feed tab.</p> : (
            <div className="table-wrap"><table className="data">
              <thead><tr><th>Bought</th><th style={{ textAlign: 'right' }}>Kg</th><th style={{ textAlign: 'right' }}>Cost</th><th style={{ textAlign: 'right' }}>Used</th><th style={{ textAlign: 'right' }}>Left</th><th>Used between</th></tr></thead>
              <tbody>{feed.batches.map((b) => (
                <tr key={b.id}><td>{fmt(b.date)}</td><td className="mono" style={{ textAlign: 'right' }}>{money0(b.kg)}</td><td className="mono" style={{ textAlign: 'right' }}>{money(b.cost)}</td>
                  <td className="mono" style={{ textAlign: 'right' }}>{money(b.usedCost)}</td><td className="mono" style={{ textAlign: 'right' }}>{money(b.remainingValue)}</td>
                  <td>{b.firstUse ? `${fmt(b.firstUse)} to ${fmt(b.lastUse)}` : 'not started'}</td></tr>
              ))}</tbody></table></div>
          )}
          <p className="pf-tip" style={{ margin: '8px 0 0' }}>Feed still in the store: <strong>GH₵ {money(feed.stockValue)}</strong> (paid for, not yet a cost).{feed.unpricedKg > 0 ? ` ${money0(feed.unpricedKg)} kg was fed with no matching purchase on record, so it has no cost here.` : ''}</p>
        </div>
      )}

      {allocs.length > 0 && (
        <div className="pf-card"><h4 style={{ margin: '0 0 4px' }}>Profit placed</h4>
          {allocs.map((a) => (
            <div className="pf-row" key={a.id} style={{ alignItems: 'center' }}>
              <span>{fmt(a.date)} · {nm(a.unitId)} → {a.dest === 'transfer' ? nm(a.toUnitId) : a.dest === 'reinvest' ? `${a.item || 'items'} for ${nm(a.toUnitId)}` : (DESTS.find((d) => d.id === a.dest) || {}).label}{a.note ? ` · ${a.note}` : ''}</span>
              <span style={{ whiteSpace: 'nowrap' }}>{money(a.amount)} {a.derived ? <span className="pf-tip">(edit in Whole Farm)</span> : <button className="link-btn rust" onClick={() => del(a)}>Delete</button>}</span>
            </div>
          ))}
        </div>
      )}

    </div>
  );
}
