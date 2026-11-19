/**
 * AI Farms Performance — the maths, kept free of any screen code so it can be
 * tested on its own.
 *
 * Model
 *  - farms:      the units whose profit you want (Layers, Broilers, Crops, Goats…)
 *  - categories: income types, and expense types (each expense type is "direct"
 *                to one farm by default, or "shared" by default)
 *  - rules:      for each shared expense type, the % each farm carries
 *  - entries:    every sale or cost. A shared expense carries its own snapshot of
 *                the split, so changing a rule later never rewrites past months.
 */

let counter = 0;
export function newId(prefix = 'p') {
  counter += 1;
  return `${prefix}${Date.now().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

export const FARM_COLORS = ['#D4A537', '#C15F41', '#7A9A66', '#7FA3C7', '#B07AA1', '#C79A4B', '#6FB3A8', '#A0A0A0'];

export function defaultPerformance() {
  return {
    version: 1,
    farms: [
      { id: 'layers', name: 'Layers', color: FARM_COLORS[0], active: true },
      { id: 'broilers', name: 'Broilers & cockerels', color: FARM_COLORS[1], active: true },
      { id: 'crops', name: 'Crops (peppers, cucumber)', color: FARM_COLORS[2], active: true },
      { id: 'goats', name: 'Goats', color: FARM_COLORS[3], active: true },
    ],
    categories: [
      { id: 'inc-eggs', name: 'Egg sales', kind: 'income', shared: false },
      { id: 'inc-birds', name: 'Bird sales (spent hens, broilers)', kind: 'income', shared: false },
      { id: 'inc-manure', name: 'Manure sales', kind: 'income', shared: false },
      { id: 'inc-crops', name: 'Crop sales', kind: 'income', shared: false },
      { id: 'inc-goats', name: 'Goat sales', kind: 'income', shared: false },
      { id: 'inc-other', name: 'Other income', kind: 'income', shared: false },
      { id: 'exp-feed', name: 'Feed', kind: 'expense', shared: false },
      { id: 'exp-chicks', name: 'Chicks & pullets', kind: 'expense', shared: false },
      { id: 'exp-drugs', name: 'Vaccines & drugs', kind: 'expense', shared: false },
      { id: 'exp-litter', name: 'Litter & supplies', kind: 'expense', shared: false },
      { id: 'exp-inputs', name: 'Seeds, fertiliser & chemicals', kind: 'expense', shared: false },
      { id: 'exp-stock', name: 'Livestock purchase', kind: 'expense', shared: false },
      { id: 'exp-direct-other', name: 'Other direct cost', kind: 'expense', shared: false },
      { id: 'exp-fuel', name: 'Pump fuel', kind: 'expense', shared: true },
      { id: 'exp-water', name: 'Water & power', kind: 'expense', shared: true },
      { id: 'exp-labour', name: 'Farm labour', kind: 'expense', shared: true },
      { id: 'exp-transport', name: 'Transport', kind: 'expense', shared: true },
      { id: 'exp-shared-other', name: 'Other shared cost', kind: 'expense', shared: true },
    ],
    rules: {},
    entries: [],
  };
}

export function normalizePerformance(p) {
  const d = defaultPerformance();
  if (!p || typeof p !== 'object') return d;
  return {
    version: 1,
    farms: Array.isArray(p.farms) && p.farms.length ? p.farms.map((f, i) => ({ active: true, color: FARM_COLORS[i % FARM_COLORS.length], ...f })) : d.farms,
    categories: Array.isArray(p.categories) && p.categories.length ? p.categories : d.categories,
    rules: p.rules && typeof p.rules === 'object' ? p.rules : {},
    entries: Array.isArray(p.entries) ? p.entries : [],
  };
}

export function activeFarms(perf) { return perf.farms.filter((f) => f.active !== false); }

export function equalSplit(farmIds) {
  const n = farmIds.length;
  if (!n) return {};
  const base = Math.floor((10000 / n)) / 100;
  const out = {};
  farmIds.forEach((id) => { out[id] = base; });
  // put the leftover hundredths on the first farm so it totals exactly 100
  const total = Math.round(base * n * 100) / 100;
  out[farmIds[0]] = Math.round((out[farmIds[0]] + (100 - total)) * 100) / 100;
  return out;
}

/** The split a NEW shared entry in this category starts with. */
export function ruleFor(perf, categoryId) {
  const r = perf.rules && perf.rules[categoryId];
  const ids = activeFarms(perf).map((f) => f.id);
  if (r) {
    const filtered = {};
    ids.forEach((id) => { if (Number(r[id]) > 0) filtered[id] = Number(r[id]); });
    const sum = Object.values(filtered).reduce((s, v) => s + v, 0);
    if (Math.abs(sum - 100) < 0.01) return filtered;
  }
  return equalSplit(ids);
}

export function splitTotal(split) {
  return Math.round(Object.values(split || {}).reduce((s, v) => s + (Number(v) || 0), 0) * 100) / 100;
}

/** Share a cedi amount between farms by percentage, to the pesewa, adding up exactly. */
export function allocate(amount, split) {
  const ids = Object.keys(split || {}).filter((id) => Number(split[id]) > 0);
  const total = Math.round((Number(amount) || 0) * 100);
  const out = {};
  if (!ids.length) return out;
  let given = 0;
  ids.forEach((id) => {
    const cents = Math.floor((total * Number(split[id])) / 100 + 1e-9);
    out[id] = cents; given += cents;
  });
  let left = total - given;
  // hand the leftover pesewas to the biggest shares first
  const order = [...ids].sort((a, b) => Number(split[b]) - Number(split[a]));
  let i = 0;
  while (left > 0) { out[order[i % order.length]] += 1; left -= 1; i += 1; }
  ids.forEach((id) => { out[id] /= 100; });
  return out;
}

export const monthOf = (date) => String(date || '').slice(0, 7);
export function addMonth(ym, delta) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
export function monthLabel(ym, short = false) {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-GB', short ? { month: 'short' } : { month: 'long', year: 'numeric' });
}
export function lastMonths(ym, n) {
  const out = [];
  for (let i = n - 1; i >= 0; i -= 1) out.push(addMonth(ym, -i));
  return out;
}

const r2 = (v) => Math.round(v * 100) / 100;

/**
 * Everything the screens need for one month.
 */
export function computeMonth(perf, ym) {
  const entries = perf.entries.filter((e) => monthOf(e.date) === ym);
  const catName = (id) => (perf.categories.find((c) => c.id === id) || { name: 'Other' }).name;
  const farms = perf.farms.map((f) => ({
    id: f.id, name: f.name, color: f.color, active: f.active !== false,
    income: 0, direct: 0, shared: 0, incomeLines: {}, directLines: {}, sharedLines: {},
  }));
  const byId = Object.fromEntries(farms.map((f) => [f.id, f]));
  const sharedCats = {};
  let unassigned = 0;

  entries.forEach((e) => {
    const amt = Number(e.amount) || 0;
    if (e.type === 'income') {
      const f = byId[e.farmId];
      if (!f) { unassigned += amt; return; }
      f.income += amt;
      f.incomeLines[e.categoryId] = (f.incomeLines[e.categoryId] || 0) + amt;
    } else if (e.shared) {
      const split = e.split && Object.keys(e.split).length ? e.split : ruleFor(perf, e.categoryId);
      const parts = allocate(amt, split);
      const c = sharedCats[e.categoryId] || (sharedCats[e.categoryId] = { categoryId: e.categoryId, name: catName(e.categoryId), total: 0, alloc: {}, pct: {} });
      c.total += amt;
      Object.entries(parts).forEach(([fid, v]) => {
        const f = byId[fid]; if (!f) return;
        f.shared += v;
        f.sharedLines[e.categoryId] = (f.sharedLines[e.categoryId] || 0) + v;
        c.alloc[fid] = (c.alloc[fid] || 0) + v;
      });
    } else {
      const f = byId[e.farmId];
      if (!f) { unassigned += amt; return; }
      f.direct += amt;
      f.directLines[e.categoryId] = (f.directLines[e.categoryId] || 0) + amt;
    }
  });
  // effective % per farm for each shared category = share of the month's total
  Object.values(sharedCats).forEach((c) => {
    Object.keys(c.alloc).forEach((fid) => { c.pct[fid] = c.total ? r2((c.alloc[fid] / c.total) * 100) : 0; });
    c.total = r2(c.total);
  });
  farms.forEach((f) => {
    f.income = r2(f.income); f.direct = r2(f.direct); f.shared = r2(f.shared);
    f.cost = r2(f.direct + f.shared);
    f.profit = r2(f.income - f.cost);
    f.margin = f.income > 0 ? Math.round((f.profit / f.income) * 1000) / 10 : null;
  });
  const shown = farms.filter((f) => f.active || f.income || f.cost);
  const t = shown.reduce((a, f) => ({ income: a.income + f.income, direct: a.direct + f.direct, shared: a.shared + f.shared }), { income: 0, direct: 0, shared: 0 });
  const totals = {
    income: r2(t.income), direct: r2(t.direct), shared: r2(t.shared), cost: r2(t.direct + t.shared),
    profit: r2(t.income - t.direct - t.shared),
  };
  totals.margin = totals.income > 0 ? Math.round((totals.profit / totals.income) * 1000) / 10 : null;
  return { ym, farms: shown, totals, sharedCats: Object.values(sharedCats), count: entries.length, unassigned: r2(unassigned) };
}

/** Same-looking entry already saved? Used to stop double entries. */
export function findDuplicate(perf, draft, ignoreId) {
  return perf.entries.find((e) => e.id !== ignoreId
    && e.date === draft.date && e.type === draft.type && e.categoryId === draft.categoryId
    && Math.abs((Number(e.amount) || 0) - (Number(draft.amount) || 0)) < 0.005
    && (e.shared ? 'shared' : e.farmId) === (draft.shared ? 'shared' : draft.farmId));
}
