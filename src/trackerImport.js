// Pull sales and costs from the farm records (poultry, pepper, goats, expenses) into the Performance tab,
// for one month, without entering them twice. Each imported entry remembers its source so it is never imported twice.
import { newId, ruleFor } from './performanceLogic';
import { harvestRevenue } from './flowLogic';

const n = (v) => Number(v) || 0;
const d10 = (s) => String(s || '').slice(0, 10);

const SHARED_BY_CATEGORY = (cat) => {
  const c = String(cat || '').toLowerCase();
  if (/(labour|labor|salary|wage|staff)/.test(c)) return 'exp-labour';
  if (/fuel/.test(c)) return 'exp-fuel';
  if (/transport/.test(c)) return 'exp-transport';
  if (/(utilit|water|power|electric)/.test(c)) return 'exp-water';
  return 'exp-shared-other';
};

export function proposeImport(data, perf, ym) {
  const have = new Set(perf.entries.map((e) => e.src).filter(Boolean));
  const farmIds = new Set(perf.farms.filter((f) => f.active !== false).map((f) => f.id));
  const catIds = new Set(perf.categories.map((c) => c.id));
  const flockFarm = (flockId) => {
    const fl = (data.flocks || []).find((f) => f.id === flockId);
    return fl && fl.type === 'broiler' ? 'broilers' : 'layers';
  };
  const items = []; let skipped = 0; let already = 0;
  const push = (src, date, type, categoryId, farmId, amount, note, extra) => {
    if (!(n(amount) > 0) || !date || d10(date).slice(0, 7) !== ym) return;
    if (have.has(src)) { already += 1; return; }
    if (!catIds.has(categoryId) || (farmId && !farmIds.has(farmId))) { skipped += 1; return; }
    items.push({ src, date: d10(date), type, categoryId, farmId: farmId || null, shared: !farmId, amount: Math.round(n(amount) * 100) / 100, note: note || '', ...(extra || {}) });
  };

  // ---- money in
  (data.sales || []).forEach((s) => {
    const item = String(s.item || '').toLowerCase();
    const cat = /egg/.test(item) ? 'inc-eggs' : /manure/.test(item) ? 'inc-manure' : 'inc-birds';
    push('sale:' + s.id, s.date, 'income', cat, flockFarm(s.flockId), s.amount, s.item || 'Poultry sale');
  });
  ((data.pepper || {}).harvests || []).forEach((h) => push('harv:' + h.id, h.date, 'income', 'inc-crops', 'crops', harvestRevenue(h), 'Bell pepper harvest'));
  ((data.goats || {}).sales || []).forEach((s) => push('goatsale:' + s.id, s.date, 'income', 'inc-goats', 'goats', s.price, 'Goat sale'));

  // ---- money out
  (data.feed || []).forEach((r) => push('feed:' + r.id, r.date, 'expense', 'exp-feed', flockFarm(r.flockId), r.cost, 'Feed purchase'));
  (data.meds || []).forEach((r) => push('med:' + r.id, r.date, 'expense', 'exp-drugs', flockFarm(r.flockId), r.cost, 'Medication'));
  (data.vax || []).forEach((r) => push('vax:' + r.id, r.date, 'expense', 'exp-drugs', flockFarm(r.flockId), r.cost, 'Vaccine'));
  const p = data.pepper || {};
  (p.sprays || []).forEach((r) => push('spray:' + r.id, r.date, 'expense', 'exp-inputs', 'crops', r.cost, 'Spray / input'));
  (p.cropExpenses || []).forEach((r) => push('cropx:' + r.id, r.date, 'expense', 'exp-direct-other', 'crops', r.amount, r.category || 'Field cost'));
  const g = data.goats || {};
  (g.health || []).forEach((r) => push('goathealth:' + r.id, r.date, 'expense', 'exp-drugs', 'goats', r.cost, 'Goat health'));
  (g.animals || []).filter((a) => a.source === 'Purchased').forEach((a) => push('goatbuy:' + a.id, a.dateAcquired || a.acquiredDate || a.dob, 'expense', 'exp-stock', 'goats', a.cost, 'Goat bought'));
  (data.expenses || []).filter((e) => !e.capital).forEach((e) => {
    const note = [e.category, e.description].filter(Boolean).join(': ');
    if (e.scope === 'pepper') return push('exp:' + e.id, e.date, 'expense', 'exp-direct-other', 'crops', e.amount, note);
    if (e.scope === 'goats') return push('exp:' + e.id, e.date, 'expense', 'exp-direct-other', 'goats', e.amount, note);
    if (e.scope === 'poultry') {
      if (e.target && e.target !== 'shared') return push('exp:' + e.id, e.date, 'expense', 'exp-direct-other', flockFarm(e.target), e.amount, note);
      return push('exp:' + e.id, e.date, 'expense', 'exp-shared-other', null, e.amount, note, { split: { layers: 50, broilers: 50 } });
    }
    const cat = SHARED_BY_CATEGORY(e.category);
    return push('exp:' + e.id, e.date, 'expense', cat, null, e.amount, note);
  });
  return { items, skipped, already };
}

/** Turn proposed items into real Performance entries (shared ones get today's split rule saved with them). */
export function toEntries(items, perf) {
  return items.map((it) => ({
    id: newId('e'), date: it.date, type: it.type, categoryId: it.categoryId, farmId: it.farmId, shared: it.shared,
    amount: it.amount, note: it.note, src: it.src, createdAt: new Date().toISOString(),
    split: it.shared ? (it.split || ruleFor(perf, it.categoryId)) : null,
  }));
}
