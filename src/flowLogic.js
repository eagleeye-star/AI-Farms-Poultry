// Profit flow: where each farm's money comes from, what it was spent on, and where the profit went.
// Reads the records the app already keeps. Only the "where did the profit go" step is entered by hand.

export const DESTS = [
  { id: 'reinvest', label: 'Reinvested in the farm (items bought)', icon: '🔧' },
  { id: 'savings', label: 'Savings', icon: '🏦' },
  { id: 'owner', label: 'Owner withdrawal', icon: '👤' },
  { id: 'eagleeye', label: 'EagleEyE (investing)', icon: '📈' },
  { id: 'transfer', label: 'Transfer to another farm', icon: '🔁' },
  { id: 'other', label: 'Other', icon: '•' },
];

const n = (v) => Number(v) || 0;
const r2 = (v) => Math.round((v + Number.EPSILON) * 100) / 100;
const d10 = (s) => String(s || '').slice(0, 10);
export const flowId = () => 'a' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);

export function normalizeFlow(f) {
  const a = f && Array.isArray(f.allocations) ? f.allocations : [];
  const ws = f && f.settings && ['none', 'sales', 'equal'].includes(f.settings.wholeFarmSplit) ? f.settings.wholeFarmSplit : 'none';
  return { version: 1, allocations: a.filter((x) => x && x.id && n(x.amount) > 0), settings: { wholeFarmSplit: ws } };
}

export function harvestRevenue(h) {
  const u = h.unit || 'kg';
  if (u === 'kg') return n(h.weightKg) * n(h.pricePerKg);
  if (u === 'sack') {
    // sold as Size 5 sacks (2.5 small 50 kg sacks = 1); price is per Size 5 sack
    const s5 = h.size5Manual && n(h.size5Sacks) > 0 ? n(h.size5Sacks) : (n(h.quantity) * (n(h.sackWeightKg) || 50)) / 125;
    return s5 * n(h.pricePerUnit);
  }
  return n(h.quantity) * n(h.pricePerUnit);
}

export function getUnits(data) {
  const units = [];
  (data.flocks || []).forEach((f) => units.push({ id: 'flock:' + f.id, rawId: f.id, kind: 'flock', farm: 'poultry', name: f.flockName || f.id }));
  const p = data.pepper || {};
  (p.fields || []).forEach((f) => units.push({ id: 'field:' + f.id, rawId: f.id, kind: 'field', farm: 'pepper', name: f.name || ('Field ' + f.id) }));
  units.push({ id: 'goats', rawId: 'goats', kind: 'goats', farm: 'goats', name: 'Goats' });
  (data.customFarms || []).forEach((f) => units.push({ id: 'custom:' + f.id, rawId: f.id, kind: 'custom', farm: 'custom', name: f.name || 'My farm' }));
  return units;
}

/** Feed bought as batches, used up in order (oldest first) day by day from the daily log. */
export function feedForFlock(data, flockId, today) {
  const buys = (data.feed || []).filter((r) => r.flockId === flockId && n(r.purchased) > 0)
    .sort((a, b) => d10(a.date).localeCompare(d10(b.date)));
  const use = (data.dailyLog || []).filter((r) => r.flockId === flockId && n(r.feedGiven) > 0)
    .sort((a, b) => d10(a.date).localeCompare(d10(b.date)));
  const batches = buys.map((b) => ({ id: b.id, date: d10(b.date), kg: n(b.purchased), cost: n(b.cost), perKg: n(b.purchased) ? n(b.cost) / n(b.purchased) : 0, feedType: b.feedType || '', usedKg: 0, usedCost: 0, firstUse: null, lastUse: null }));
  const costs = []; let unpricedKg = 0;
  let bi = 0;
  use.forEach((u) => {
    let need = n(u.feedGiven); const date = d10(u.date);
    // only batches already bought by that day
    while (need > 1e-9) {
      while (bi < batches.length && batches[bi].usedKg >= batches[bi].kg - 1e-9) bi++;
      const b = batches[bi];
      if (!b || b.date > date) { unpricedKg += need; need = 0; break; }
      const take = Math.min(need, b.kg - b.usedKg);
      const c = take * b.perKg;
      b.usedKg += take; b.usedCost += c; need -= take;
      if (!b.firstUse) b.firstUse = date; b.lastUse = date;
      costs.push({ date, amount: c, cat: 'Feed', batchId: b.id });
    }
  });
  batches.forEach((b) => { b.remainingKg = r2(b.kg - b.usedKg); b.remainingValue = r2(b.cost - b.usedCost); b.usedCost = r2(b.usedCost); b.usedKg = r2(b.usedKg); });
  return { batches, costs, unpricedKg: r2(unpricedKg), stockValue: r2(batches.reduce((s, b) => s + b.remainingValue, 0)) };
}

function shareOf(units, scopeFarm, target, unit) {
  // expense booked to a farm: direct if it names this unit, else equal split across the farm's units
  const mine = units.filter((u) => u.farm === scopeFarm);
  if (!mine.length) return 0;
  const named = mine.find((u) => u.rawId === target);
  if (named) return named.id === unit.id ? 1 : 0;
  return 1 / mine.length;
}

const addTo = (arr, date, amount, cat, label) => { if (n(amount) && date) arr.push({ date: d10(date), amount: n(amount), cat, label }); };

/** Sales money that belongs to one unit, from the app's own sales and harvest records. */
export function unitIncome(data, unit) {
  const income = [];
  const add = (...a) => addTo(income, ...a);
  if (unit.kind === 'flock') {
    (data.sales || []).filter((s) => s.flockId === unit.rawId).forEach((s) => add(s.date, s.amount, s.item || 'Sales', s.buyer || ''));
  } else if (unit.kind === 'field') {
    const p = data.pepper || {};
    (p.harvests || []).filter((h) => h.fieldId === unit.rawId).forEach((h) => add(h.date, harvestRevenue(h), 'Harvest sales', h.buyer || ''));
  } else if (unit.kind === 'goats') {
    ((data.goats || {}).sales || []).forEach((s) => add(s.date, s.price, 'Goat sales', s.buyer || ''));
  } else if (unit.kind === 'custom') {
    const farm = (data.customFarms || []).find((x) => x.id === unit.rawId) || {};
    (farm.salesLog || []).forEach((s) => add(s.date, s.amount, s.item || 'Sales', s.buyer || ''));
  }
  return income;
}

const WHOLE_SCOPES = (e) => !e.scope || e.scope === 'general' || e.scope === 'shared' || e.scope === 'whole farm';

export function unitRecords(data, unit, units, flow) {
  const income = unitIncome(data, unit); const costs = []; let extra = {};
  const add = (arr, date, amount, cat, label) => addTo(arr, date, amount, cat, label);
  if (unit.kind === 'flock') {
    const fd = feedForFlock(data, unit.rawId);
    fd.costs.forEach((c) => costs.push(c));
    extra = { feed: fd };
    (data.meds || []).filter((r) => r.flockId === unit.rawId).forEach((r) => add(costs, r.date, r.cost, 'Medication'));
    (data.vax || []).filter((r) => r.flockId === unit.rawId).forEach((r) => add(costs, r.date, r.cost, 'Vaccines'));
  } else if (unit.kind === 'field') {
    const p = data.pepper || {};
    (p.sprays || []).filter((s) => s.fieldId === unit.rawId).forEach((s) => add(costs, s.date, s.cost, 'Sprays & inputs'));
    (p.cropExpenses || []).filter((e) => e.fieldId === unit.rawId).forEach((e) => add(costs, e.date, e.amount, e.category || 'Field costs'));
  } else if (unit.kind === 'goats') {
    const g = data.goats || {};
    (g.health || []).forEach((h) => add(costs, h.date, h.cost, 'Health'));
    (g.animals || []).filter((a) => a.source === 'Purchased').forEach((a) => add(costs, a.dateAcquired || a.acquiredDate || a.dob, a.cost, 'Animals bought'));
  }
  if (unit.kind === 'custom') {
    const farm = (data.customFarms || []).find((x) => x.id === unit.rawId) || {};
    (farm.feedLog || []).forEach((e) => add(costs, e.date, e.cost, 'Feed'));
  }
  // whole-farm running costs, shared out if the user chose a sharing rule
  const mode = flow && flow.settings && flow.settings.wholeFarmSplit;
  if (mode === 'sales' || mode === 'equal') {
    let share = 1 / Math.max(units.length, 1);
    if (mode === 'sales') {
      const tot = units.map((u) => unitIncome(data, u).reduce((s, x) => s + x.amount, 0));
      const sum = tot.reduce((a, b) => a + b, 0);
      const mine = unitIncome(data, unit).reduce((s, x) => s + x.amount, 0);
      share = sum > 0 ? mine / sum : share;
    }
    (data.expenses || []).filter((e) => !e.capital && WHOLE_SCOPES(e)).forEach((e) => add(costs, e.date, n(e.amount) * share, 'Share of whole-farm costs'));
  }
  // consumables bought with profit (pesticides, seed...) count as a cost of the farm they were bought for,
  // unless the user says they already entered the purchase in the app's own logs
  ((flow && flow.allocations) || []).filter((a) => a.dest === 'reinvest' && a.kind === 'input' && !a.alreadyLogged && a.toUnitId === unit.id)
    .forEach((a) => add(costs, a.date, a.amount, a.item || 'Inputs (reinvested)'));
  // running expenses and petty costs booked to this farm
  const pools = [
    ...(data.expenses || []).filter((e) => !e.capital && e.scope && e.scope !== 'shared' && e.scope !== 'whole farm').map((e) => ({ date: e.date, amount: e.amount, farm: e.scope, target: e.target, cat: e.category || 'Running costs' })),
    ...(data.pettyCosts || []).map((e) => ({ date: e.date, amount: e.amount, farm: e.farm, target: e.target, cat: e.item || 'Petty costs' })),
  ];
  pools.forEach((e) => {
    const farm = String(e.farm || '').toLowerCase();
    const fkey = farm === 'poultry' || farm === 'pepper' || farm === 'goats' ? farm : null;
    if (!fkey || fkey !== unit.farm) return;
    const sh = shareOf(units, fkey, e.target, unit);
    if (sh > 0) add(costs, e.date, n(e.amount) * sh, e.cat);
  });
  return { income, costs, ...extra };
}

export function wholeFarmCosts(data) {
  return (data.expenses || []).filter((e) => !e.capital && WHOLE_SCOPES(e)).reduce((s, e) => s + n(e.amount), 0);
}

/** Where an equipment or structure purchase is for, as a Profit Flow unit id. */
function expenseTargetUnit(e) {
  if (e.scope === 'pepper') return e.target && e.target !== 'shared' ? 'field:' + e.target : 'crops';
  if (e.scope === 'poultry') return e.target && e.target !== 'shared' ? 'flock:' + e.target : 'poultry';
  if (e.scope === 'goats') return 'goats';
  return 'shared';
}

/** Manual entries plus equipment (Whole Farm > Structure / equipment) paid from a farm's profit. */
export function allAllocations(data, flow) {
  const derived = (data.expenses || []).filter((e) => e.capital && e.fundSource === 'profit' && e.fundUnitId && n(e.amount) > 0)
    .map((e) => ({ id: 'exp:' + e.id, derived: true, date: d10(e.date), unitId: e.fundUnitId, dest: 'reinvest', kind: 'asset', item: e.description || e.category || 'Equipment', amount: n(e.amount), toUnitId: expenseTargetUnit(e), note: 'From Whole Farm records' }));
  return [...((flow && flow.allocations) || []), ...derived];
}

const inRange = (d, from, to) => (!from || d >= from) && (!to || d <= to);

export function rangeFlow(data, rec, unit, from, to, flow) {
  const inc = rec.income.filter((x) => inRange(x.date, from, to));
  const cos = rec.costs.filter((x) => inRange(x.date, from, to));
  const sum = (a) => a.reduce((s, x) => s + x.amount, 0);
  const by = (a) => { const m = {}; a.forEach((x) => { m[x.cat] = (m[x.cat] || 0) + x.amount; }); return Object.entries(m).map(([cat, amount]) => ({ cat, amount: r2(amount) })).sort((x, y) => y.amount - x.amount); };
  const income = r2(sum(inc)); const cost = r2(sum(cos)); const profit = r2(income - cost);
  const every = allAllocations(data, flow);
  const all = every.filter((a) => inRange(d10(a.date), from, to));
  // spending on consumables for the SAME farm is already inside costs, so it is not taken off the cash a second time
  const sameFarmInput = (a) => a.dest === 'reinvest' && a.kind === 'input' && a.toUnitId === a.unitId;
  const allocs = all.filter((a) => a.unitId === unit.id && !sameFarmInput(a));
  const out = {}; allocs.forEach((a) => { out[a.dest] = r2((out[a.dest] || 0) + n(a.amount)); });
  const allocated = r2(allocs.reduce((s, a) => s + n(a.amount), 0));
  // cash arriving from other farms: transfers, and consumables another farm's profit paid for
  const received = r2(all.filter((a) => a.unitId !== unit.id && a.toUnitId === unit.id && (a.dest === 'transfer' || (a.dest === 'reinvest' && a.kind === 'input'))).reduce((s, a) => s + n(a.amount), 0));
  // equipment and structures bought for this farm (an investment, not a running cost)
  const investments = all.filter((a) => a.dest === 'reinvest' && a.kind !== 'input' && a.toUnitId === unit.id);
  const invested = r2(investments.reduce((s, a) => s + n(a.amount), 0));
  // equipment bought for a whole group (all crops, all poultry), not split between its units
  const groupKey = unit.farm === 'pepper' ? 'crops' : unit.farm === 'poultry' ? 'poultry' : null;
  const groupInvestments = groupKey ? all.filter((a) => a.dest === 'reinvest' && a.kind !== 'input' && a.toUnitId === groupKey) : [];
  return { income, cost, profit, margin: income ? Math.round((profit / income) * 1000) / 10 : null, incomeLines: by(inc), costLines: by(cos), allocated, out, received, invested, investments, groupInvestments, held: r2(profit - allocated + received) };
}

/** Periods for a flock follow its feed purchases: each purchase starts a new period that runs until the next one. */
export function feedPeriods(data, unit, today) {
  if (unit.kind !== 'flock') return [];
  const dates = (data.feed || []).filter((r) => r.flockId === unit.rawId && n(r.purchased) > 0).map((r) => d10(r.date)).sort();
  const uniq = [...new Set(dates)];
  return uniq.map((d, i) => {
    const next = uniq[i + 1];
    const to = next ? addDays(next, -1) : today;
    return { from: d, to, open: !next };
  });
}
export function addDays(iso, k) { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + k); return d.toISOString().slice(0, 10); }

export function walletBalance(data, rec, unit, flow) {
  const f = rangeFlow(data, rec, unit, null, null, flow);
  return { ...f };
}
