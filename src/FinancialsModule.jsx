// ─────────────────────────────────────────────────────────────
// AI Farms — Financial Module v1.0
// Drop into App.jsx: import FinancialsModule from './FinancialsModule'
// Add tab: {tab === 'financials' && <FinancialsModule />}
// ─────────────────────────────────────────────────────────────

import { useState, useEffect, useMemo } from "react";

// ── Constants ─────────────────────────────────────────────────
const FARMS = [
  { id: "all",        label: "All Farms",      icon: "🏡", type: "all" },
  { id: "poultry",   label: "Poultry",         icon: "🐔", type: "poultry" },
  { id: "pepper_s1", label: "Pepper Section 1",icon: "🌶", type: "crop", field: true },
  { id: "pepper_s2", label: "Pepper Section 2",icon: "🌶", type: "crop", field: true },
  { id: "pepper_s3", label: "Pepper Section 3",icon: "🌶", type: "crop", field: true },
  { id: "cucumber",  label: "Cucumber",        icon: "🥒", type: "crop", field: true },
  { id: "goats",     label: "Goats",           icon: "🐐", type: "livestock" },
  { id: "hydro",     label: "Hydro Towers",    icon: "💧", type: "crop", field: true },
];

const EXPENSE_CATS = [
  "Feed","Medication","Fertilizer","Pesticide","Fungicide",
  "Labour","Fuel","Equipment","Transport","Packaging","Other"
];

const FUNDED_FROM = ["Egg Sales","Crop Sales","Personal Funds","External/Loan","Other"];

const PAYMENT_METHODS = ["Cash","Mobile Money","Bank Transfer","Credit"];

const EGG_PRICE_DEFAULT = 28; // GHS per crate of 30

// ── Storage helpers ───────────────────────────────────────────
const KEYS = {
  eggLogs:     "aif_egg_logs",
  cropSales:   "aif_crop_sales",
  expenses:    "aif_expenses",
  batches:     "aif_batches",
  otherSales:  "aif_other_sales",
};

function load(key) {
  try { return JSON.parse(localStorage.getItem(key) || "[]"); } catch { return []; }
}
function save(key, data) {
  try { localStorage.setItem(key, JSON.stringify(data)); } catch {}
}
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2,6); }
function today() { return new Date().toISOString().slice(0,10); }
function fmt(n) { return "GHS " + Number(n||0).toLocaleString("en-GH",{minimumFractionDigits:2,maximumFractionDigits:2}); }
function fmtShort(n) { return "GHS " + Number(n||0).toFixed(2); }

function startOfWeek(d) {
  const dt = new Date(d); dt.setDate(dt.getDate() - dt.getDay() + 1); return dt.toISOString().slice(0,10);
}
function endOfWeek(d) {
  const dt = new Date(d); dt.setDate(dt.getDate() - dt.getDay() + 7); return dt.toISOString().slice(0,10);
}
function startOfMonth(d) { return d.slice(0,7) + "-01"; }
function endOfMonth(d) {
  const dt = new Date(d.slice(0,7) + "-01");
  dt.setMonth(dt.getMonth()+1); dt.setDate(0);
  return dt.toISOString().slice(0,10);
}

// ── Styles ────────────────────────────────────────────────────
const C = {
  GRN:  "#1A5276", GRN2: "#1E8449", GRN3: "#D5F5E3",
  ORG:  "#E67E22", RED:  "#C0392B", RED2: "#FADBD8",
  YEL:  "#F39C12", YEL2: "#FEF9E7", PUR:  "#6C3483",
  TEAL: "#148F77", GREY: "#F4F6F8", WHT:  "#FFFFFF",
  TXT:  "#1a1a1a", TXT2: "#555",    BRD:  "#e4e4e4",
};

const s = {
  wrap:  { fontFamily:"Arial,sans-serif", background:C.GREY, minHeight:"100vh", paddingBottom:40 },
  hdr:   { background:C.GRN, color:C.WHT, padding:"14px 14px 10px" },
  hdrT:  { fontSize:17, fontWeight:700, margin:"0 0 2px" },
  hdrS:  { fontSize:11, opacity:.75, margin:0 },
  tabs:  { display:"flex", overflowX:"auto", background:C.WHT,
           borderBottom:"1px solid "+C.BRD, padding:"0 12px" },
  tab:   (a)=>({ padding:"10px 14px", fontSize:12, fontWeight:600, cursor:"pointer",
                 border:"none", background:"transparent", whiteSpace:"nowrap",
                 color:a?C.GRN:C.TXT2, borderBottom:a?"3px solid "+C.GRN:"3px solid transparent" }),
  body:  { padding:"10px 12px 0" },
  card:  { background:C.WHT, borderRadius:10, border:"1px solid "+C.BRD,
           padding:"12px 14px", marginBottom:10 },
  cardT: { fontSize:13, fontWeight:700, color:C.GRN, marginBottom:8 },
  row:   { display:"flex", gap:8, marginBottom:8, flexWrap:"wrap" },
  col:   { flex:1, minWidth:120 },
  lbl:   { fontSize:11, color:C.TXT2, marginBottom:3, display:"block", fontWeight:600 },
  inp:   { width:"100%", padding:"7px 8px", borderRadius:7, border:"1px solid "+C.BRD,
           fontSize:13, color:C.TXT, background:C.WHT, boxSizing:"border-box" },
  sel:   { width:"100%", padding:"7px 8px", borderRadius:7, border:"1px solid "+C.BRD,
           fontSize:13, color:C.TXT, background:C.WHT, boxSizing:"border-box" },
  btn:   (bg,col)=>({ padding:"8px 18px", borderRadius:8, border:"none", cursor:"pointer",
                      background:bg||C.GRN, color:col||C.WHT, fontSize:13, fontWeight:600 }),
  smBtn: (bg)=>({ padding:"4px 10px", borderRadius:6, border:"none", cursor:"pointer",
                  background:bg||C.GRN, color:C.WHT, fontSize:11, fontWeight:600 }),
  metric:(bg)=>({ background:bg||C.GRN3, borderRadius:8, padding:"10px 12px", flex:1, minWidth:100 }),
  mLabel:{ fontSize:10, color:C.TXT2, margin:"0 0 2px" },
  mVal:  { fontSize:17, fontWeight:700, color:C.TXT, margin:0 },
  mSub:  { fontSize:9, color:C.TXT2, margin:"2px 0 0" },
  badge: (bg,col)=>({ display:"inline-block", background:bg||C.GRN3, color:col||C.GRN,
                      borderRadius:4, padding:"2px 7px", fontSize:10, fontWeight:700 }),
  tbl:   { width:"100%", borderCollapse:"collapse", fontSize:12 },
  th:    { padding:"6px 8px", background:C.GRN, color:C.WHT, textAlign:"left", fontWeight:600, fontSize:11 },
  td:    { padding:"6px 8px", borderBottom:"1px solid "+C.BRD, color:C.TXT },
  divider:{ border:"none", borderTop:"1px solid "+C.BRD, margin:"10px 0" },
  filterBar:{ display:"flex", gap:6, overflowX:"auto", padding:"8px 12px",
              background:C.WHT, borderBottom:"1px solid "+C.BRD },
  fChip:(a,bg)=>({ padding:"4px 12px", borderRadius:20, fontSize:11, fontWeight:600,
                   cursor:"pointer", border:`1px solid ${a?bg||C.GRN:C.BRD}`,
                   background:a?bg||C.GRN:C.WHT, color:a?C.WHT:C.TXT2, whiteSpace:"nowrap" }),
  warn:  { background:C.RED2, border:"1px solid "+C.RED, borderRadius:8,
           padding:"8px 12px", fontSize:12, color:C.RED, marginBottom:8 },
  info:  { background:C.YEL2, border:"1px solid "+C.YEL, borderRadius:8,
           padding:"8px 12px", fontSize:12, color:"#7D6608", marginBottom:8 },
};

// ── Sub-forms ─────────────────────────────────────────────────

function EggLogForm({ onSave }) {
  const [f, setF] = useState({
    date: today(), collected:"", sold_crates:"", sold_loose:"",
    price_per_crate: EGG_PRICE_DEFAULT, eaten:"", dashed:"", broken:"",
    buyer:"", payment: "Cash", notes:""
  });
  const up = (k,v) => setF(p=>({...p,[k]:v}));

  const cratesVal   = Number(f.sold_crates||0);
  const looseVal    = Number(f.sold_loose||0);
  const saleAmt     = cratesVal * Number(f.price_per_crate||0) + (looseVal * Number(f.price_per_crate||0)/30);
  const totalOut    = cratesVal*30 + looseVal + Number(f.eaten||0) + Number(f.dashed||0) + Number(f.broken||0);
  const balance     = Number(f.collected||0) - totalOut;

  function submit() {
    if (!f.collected) return alert("Enter eggs collected");
    const rec = { ...f, id:uid(), sale_amount: +saleAmt.toFixed(2),
                  total_eggs_out: totalOut, stock_balance: balance };
    const logs = load(KEYS.eggLogs);
    logs.unshift(rec); save(KEYS.eggLogs, logs);
    onSave && onSave();
    setF(p=>({...p, collected:"", sold_crates:"", sold_loose:"", eaten:"", dashed:"", broken:"", buyer:"", notes:""}));
  }

  return (
    <div style={s.card}>
      <p style={s.cardT}>🥚 Record Egg Collection & Sales</p>
      <div style={s.row}>
        <div style={s.col}><label style={s.lbl}>Date</label>
          <input style={s.inp} type="date" value={f.date} onChange={e=>up("date",e.target.value)}/></div>
        <div style={s.col}><label style={s.lbl}>Eggs Collected</label>
          <input style={s.inp} type="number" placeholder="e.g. 120" value={f.collected} onChange={e=>up("collected",e.target.value)}/></div>
      </div>
      <p style={{fontSize:11,color:C.TXT2,margin:"0 0 8px"}}>📦 1 crate = 30 eggs</p>
      <div style={s.row}>
        <div style={s.col}><label style={s.lbl}>Crates Sold</label>
          <input style={s.inp} type="number" placeholder="0" value={f.sold_crates} onChange={e=>up("sold_crates",e.target.value)}/></div>
        <div style={s.col}><label style={s.lbl}>Loose Eggs Sold</label>
          <input style={s.inp} type="number" placeholder="0" value={f.sold_loose} onChange={e=>up("sold_loose",e.target.value)}/></div>
        <div style={s.col}><label style={s.lbl}>Price/Crate (GHS)</label>
          <input style={s.inp} type="number" value={f.price_per_crate} onChange={e=>up("price_per_crate",e.target.value)}/></div>
      </div>
      <div style={s.row}>
        <div style={s.col}><label style={s.lbl}>🍳 Eaten (eggs)</label>
          <input style={s.inp} type="number" placeholder="0" value={f.eaten} onChange={e=>up("eaten",e.target.value)}/></div>
        <div style={s.col}><label style={s.lbl}>🎁 Dashed Out (eggs)</label>
          <input style={s.inp} type="number" placeholder="0" value={f.dashed} onChange={e=>up("dashed",e.target.value)}/></div>
        <div style={s.col}><label style={s.lbl}>💔 Broken (eggs)</label>
          <input style={s.inp} type="number" placeholder="0" value={f.broken} onChange={e=>up("broken",e.target.value)}/></div>
      </div>
      <div style={s.row}>
        <div style={s.col}><label style={s.lbl}>Buyer Name</label>
          <input style={s.inp} placeholder="Optional" value={f.buyer} onChange={e=>up("buyer",e.target.value)}/></div>
        <div style={s.col}><label style={s.lbl}>Payment</label>
          <select style={s.sel} value={f.payment} onChange={e=>up("payment",e.target.value)}>
            {PAYMENT_METHODS.map(m=><option key={m}>{m}</option>)}</select></div>
      </div>
      <input style={{...s.inp,marginBottom:8}} placeholder="Notes (optional)" value={f.notes} onChange={e=>up("notes",e.target.value)}/>
      <div style={{...s.row, background:C.GRN3, borderRadius:8, padding:"8px 10px", marginBottom:8}}>
        <div><span style={s.mLabel}>Sale Amount</span><br/><b style={{color:C.GRN2}}>{fmtShort(saleAmt)}</b></div>
        <div><span style={s.mLabel}>Total Out</span><br/><b>{totalOut} eggs</b></div>
        <div><span style={s.mLabel}>Stock Balance</span><br/>
          <b style={{color:balance<0?C.RED:C.GRN2}}>{balance} eggs</b></div>
      </div>
      {balance < 0 && <div style={s.warn}>⚠️ Eggs out ({totalOut}) exceeds collected ({f.collected}). Check numbers.</div>}
      <button style={s.btn()} onClick={submit}>Save Egg Record</button>
    </div>
  );
}

function CropSaleForm({ onSave }) {
  const [batches, setBatches] = useState(load(KEYS.batches));
  const [f, setF] = useState({
    date:today(), farm_id:"pepper_s1", batch_id:"", weight_kg:"",
    price_per_kg:"", buyer:"", payment:"Cash", notes:""
  });
  const up = (k,v) => setF(p=>({...p,[k]:v}));
  const amount = Number(f.weight_kg||0) * Number(f.price_per_kg||0);
  const cropFarms = FARMS.filter(fm=>fm.type==="crop");

  function addBatch() {
    const name = prompt("Batch name (e.g. 'Harvest 1 — Section 1 Oct 2026'):");
    if (!name) return;
    const b = { id:uid(), name, farm_id:f.farm_id, date:today() };
    const all = [...batches, b]; setBatches(all); save(KEYS.batches, all);
  }

  function submit() {
    if (!f.weight_kg || !f.price_per_kg) return alert("Enter weight and price");
    const rec = { ...f, id:uid(), amount:+amount.toFixed(2) };
    const all = load(KEYS.cropSales); all.unshift(rec); save(KEYS.cropSales, all);
    onSave && onSave();
    setF(p=>({...p, weight_kg:"", price_per_kg:"", buyer:"", batch_id:"", notes:""}));
  }

  const farmBatches = batches.filter(b=>b.farm_id===f.farm_id);

  return (
    <div style={s.card}>
      <p style={s.cardT}>🌶 Record Crop Sale</p>
      <div style={s.row}>
        <div style={s.col}><label style={s.lbl}>Date</label>
          <input style={s.inp} type="date" value={f.date} onChange={e=>up("date",e.target.value)}/></div>
        <div style={s.col}><label style={s.lbl}>Farm / Field</label>
          <select style={s.sel} value={f.farm_id} onChange={e=>up("farm_id",e.target.value)}>
            {cropFarms.map(fm=><option key={fm.id} value={fm.id}>{fm.icon} {fm.label}</option>)}
          </select></div>
      </div>
      <div style={s.row}>
        <div style={{flex:1}}>
          <label style={s.lbl}>Harvest Batch</label>
          <select style={s.sel} value={f.batch_id} onChange={e=>up("batch_id",e.target.value)}>
            <option value="">— Select batch —</option>
            {farmBatches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
        <div style={{alignSelf:"flex-end"}}>
          <button style={s.btn(C.TEAL)} onClick={addBatch}>+ New Batch</button></div>
      </div>
      <div style={s.row}>
        <div style={s.col}><label style={s.lbl}>Weight Sold (kg)</label>
          <input style={s.inp} type="number" placeholder="0.0" value={f.weight_kg} onChange={e=>up("weight_kg",e.target.value)}/></div>
        <div style={s.col}><label style={s.lbl}>Price per kg (GHS)</label>
          <input style={s.inp} type="number" placeholder="0.00" value={f.price_per_kg} onChange={e=>up("price_per_kg",e.target.value)}/></div>
        <div style={s.col}><label style={s.lbl}>Payment</label>
          <select style={s.sel} value={f.payment} onChange={e=>up("payment",e.target.value)}>
            {PAYMENT_METHODS.map(m=><option key={m}>{m}</option>)}</select></div>
      </div>
      <div style={s.row}>
        <div style={s.col}><label style={s.lbl}>Buyer Name</label>
          <input style={s.inp} placeholder="Optional" value={f.buyer} onChange={e=>up("buyer",e.target.value)}/></div>
      </div>
      <input style={{...s.inp,marginBottom:8}} placeholder="Notes" value={f.notes} onChange={e=>up("notes",e.target.value)}/>
      <div style={{...s.row, background:"#eafaf1", borderRadius:8, padding:"8px 10px", marginBottom:8}}>
        <b style={{color:C.GRN2}}>Sale Total: {fmtShort(amount)}</b>
      </div>
      <button style={s.btn(C.GRN2)} onClick={submit}>Save Crop Sale</button>
    </div>
  );
}

function ExpenseForm({ onSave }) {
  const [f, setF] = useState({
    date:today(), farm_id:"poultry", category:"Feed", funded_from:"Egg Sales",
    amount:"", supplier:"", description:"", receipt_no:""
  });
  const up = (k,v) => setF(p=>({...p,[k]:v}));

  function submit() {
    if (!f.amount || !f.description) return alert("Enter amount and description");
    const rec = { ...f, id:uid(), amount:+Number(f.amount).toFixed(2) };
    const all = load(KEYS.expenses); all.unshift(rec); save(KEYS.expenses, all);
    onSave && onSave();
    setF(p=>({...p, amount:"", supplier:"", description:"", receipt_no:""}));
  }

  return (
    <div style={s.card}>
      <p style={s.cardT}>💸 Record Expense</p>
      <div style={s.row}>
        <div style={s.col}><label style={s.lbl}>Date</label>
          <input style={s.inp} type="date" value={f.date} onChange={e=>up("date",e.target.value)}/></div>
        <div style={s.col}><label style={s.lbl}>Farm</label>
          <select style={s.sel} value={f.farm_id} onChange={e=>up("farm_id",e.target.value)}>
            {FARMS.filter(fm=>fm.id!=="all").map(fm=><option key={fm.id} value={fm.id}>{fm.icon} {fm.label}</option>)}
          </select></div>
      </div>
      <div style={s.row}>
        <div style={s.col}><label style={s.lbl}>Category</label>
          <select style={s.sel} value={f.category} onChange={e=>up("category",e.target.value)}>
            {EXPENSE_CATS.map(c=><option key={c}>{c}</option>)}</select></div>
        <div style={s.col}><label style={s.lbl}>Funded From</label>
          <select style={s.sel} value={f.funded_from} onChange={e=>up("funded_from",e.target.value)}>
            {FUNDED_FROM.map(f=><option key={f}>{f}</option>)}</select></div>
        <div style={s.col}><label style={s.lbl}>Amount (GHS)</label>
          <input style={s.inp} type="number" placeholder="0.00" value={f.amount} onChange={e=>up("amount",e.target.value)}/></div>
      </div>
      <div style={s.row}>
        <div style={s.col}><label style={s.lbl}>Description</label>
          <input style={s.inp} placeholder="What was it for?" value={f.description} onChange={e=>up("description",e.target.value)}/></div>
        <div style={s.col}><label style={s.lbl}>Supplier</label>
          <input style={s.inp} placeholder="Optional" value={f.supplier} onChange={e=>up("supplier",e.target.value)}/></div>
      </div>
      <input style={{...s.inp,marginBottom:8}} placeholder="Receipt No. (optional)" value={f.receipt_no} onChange={e=>up("receipt_no",e.target.value)}/>
      <button style={s.btn(C.RED)} onClick={submit}>Save Expense</button>
    </div>
  );
}

// ── Dashboard / Reports ───────────────────────────────────────
function FinancialDashboard({ refresh }) {
  const [period, setPeriod]   = useState("daily");
  const [farmFilter, setFarm] = useState("all");
  const [customStart, setCStart] = useState(today());
  const [customEnd,   setCEnd]   = useState(today());
  const [viewDate, setViewDate]  = useState(today());

  const eggLogs   = useMemo(()=>load(KEYS.eggLogs),   [refresh]);
  const cropSales = useMemo(()=>load(KEYS.cropSales),  [refresh]);
  const expenses  = useMemo(()=>load(KEYS.expenses),   [refresh]);
  const batches   = useMemo(()=>load(KEYS.batches),    [refresh]);

  function dateRange() {
    if (period==="daily")  return [viewDate, viewDate];
    if (period==="weekly") return [startOfWeek(viewDate), endOfWeek(viewDate)];
    if (period==="monthly")return [startOfMonth(viewDate), endOfMonth(viewDate)];
    return [customStart, customEnd];
  }

  const [ds, de] = dateRange();

  function inRange(d) { return d >= ds && d <= de; }
  function farmMatch(id) { return farmFilter==="all" || id===farmFilter; }

  // Filtered data
  const filtEggs = eggLogs.filter(r=>inRange(r.date));
  const filtCrop = cropSales.filter(r=>inRange(r.date) && farmMatch(r.farm_id));
  const filtExp  = expenses.filter(r=>inRange(r.date) && (farmFilter==="all"||r.farm_id===farmFilter));

  // Totals
  const eggIncome  = filtEggs.reduce((s,r)=>s+Number(r.sale_amount||0),0);
  const cropIncome = filtCrop.reduce((s,r)=>s+Number(r.amount||0),0);
  const totalIncome= eggIncome + cropIncome;
  const totalExp   = filtExp.reduce((s,r)=>s+Number(r.amount||0),0);
  const profit     = totalIncome - totalExp;
  const totalEggsCollected = filtEggs.reduce((s,r)=>s+Number(r.collected||0),0);
  const totalEggsSold = filtEggs.reduce((s,r)=>s+(Number(r.sold_crates||0)*30+Number(r.sold_loose||0)),0);
  const totalEggsEaten = filtEggs.reduce((s,r)=>s+Number(r.eaten||0),0);
  const totalEggsDashed= filtEggs.reduce((s,r)=>s+Number(r.dashed||0),0);
  const totalEggsBroken= filtEggs.reduce((s,r)=>s+Number(r.broken||0),0);

  // Expense by category
  const expByCat = EXPENSE_CATS.reduce((acc,c)=>({
    ...acc, [c]: filtExp.filter(e=>e.category===c).reduce((s,e)=>s+Number(e.amount||0),0)
  }),{});

  // Crop income by farm
  const cropByFarm = FARMS.filter(f=>f.type==="crop").map(f=>({
    ...f, income: cropSales.filter(r=>inRange(r.date)&&r.farm_id===f.id).reduce((s,r)=>s+Number(r.amount||0),0)
  })).filter(f=>f.income>0);

  function exportCSV() {
    const rows = [
      ["Date","Type","Farm","Description","Amount (GHS)"],
      ...filtEggs.map(r=>[r.date,"Egg Sale","Poultry",`${r.sold_crates} crates + ${r.sold_loose} loose`,r.sale_amount]),
      ...filtCrop.map(r=>[r.date,"Crop Sale",r.farm_id,`${r.weight_kg}kg @ GHS${r.price_per_kg}/kg`,r.amount]),
      ...filtExp.map(r=>[r.date,"Expense",r.farm_id,r.description,-r.amount]),
    ];
    const csv = rows.map(r=>r.join(",")).join("\n");
    const a = document.createElement("a");
    a.href = "data:text/csv;charset=utf-8," + encodeURIComponent(csv);
    a.download = `AI_Farms_Financials_${ds}_to_${de}.csv`;
    a.click();
  }

  const periodLabel = period==="daily" ? viewDate
    : period==="weekly" ? `${ds} to ${de}`
    : period==="monthly" ? ds.slice(0,7)
    : `${customStart} to ${customEnd}`;

  return (
    <div>
      {/* Period tabs */}
      <div style={s.tabs}>
        {[["daily","Day"],["weekly","Week"],["monthly","Month"],["custom","Custom"]].map(([v,l])=>(
          <button key={v} style={s.tab(period===v)} onClick={()=>setPeriod(v)}>{l}</button>
        ))}
      </div>

      {/* Date controls */}
      <div style={{...s.filterBar, gap:8, flexWrap:"wrap"}}>
        {period==="daily" && (
          <input style={{...s.inp, width:160}} type="date" value={viewDate} onChange={e=>setViewDate(e.target.value)}/>
        )}
        {period==="weekly" && (
          <><span style={{fontSize:12,color:C.TXT2,alignSelf:"center"}}>Week of:</span>
          <input style={{...s.inp, width:160}} type="date" value={viewDate} onChange={e=>setViewDate(e.target.value)}/></>
        )}
        {period==="monthly" && (
          <input style={{...s.inp, width:160}} type="month" value={viewDate.slice(0,7)} onChange={e=>setViewDate(e.target.value+"-01")}/>
        )}
        {period==="custom" && (<>
          <input style={{...s.inp, width:140}} type="date" value={customStart} onChange={e=>setCStart(e.target.value)}/>
          <span style={{alignSelf:"center",fontSize:12}}>to</span>
          <input style={{...s.inp, width:140}} type="date" value={customEnd} onChange={e=>setCEnd(e.target.value)}/>
        </>)}
        <button style={s.smBtn(C.TEAL)} onClick={exportCSV}>📥 Export CSV</button>
      </div>

      {/* Farm filter */}
      <div style={s.filterBar}>
        {FARMS.map(f=>(
          <button key={f.id} style={s.fChip(farmFilter===f.id)} onClick={()=>setFarm(f.id)}>
            {f.icon} {f.label}
          </button>
        ))}
      </div>

      <div style={s.body}>
        {/* Summary cards */}
        <div style={{...s.row, marginBottom:4}}>
          <div style={s.metric("d5f5e3")}>
            <p style={s.mLabel}>Total Income</p>
            <p style={s.mVal}>{fmt(totalIncome)}</p>
            <p style={s.mSub}>{periodLabel}</p>
          </div>
          <div style={s.metric(C.RED2)}>
            <p style={s.mLabel}>Total Expenses</p>
            <p style={s.mVal}>{fmt(totalExp)}</p>
            <p style={s.mSub}>{periodLabel}</p>
          </div>
          <div style={s.metric(profit>=0?"#d5f5e3":"#fadbd8")}>
            <p style={s.mLabel}>Net Profit / Loss</p>
            <p style={{...s.mVal, color:profit>=0?C.GRN2:C.RED}}>{fmt(profit)}</p>
            <p style={s.mSub}>{profit>=0?"✅ Profit":"❌ Loss"}</p>
          </div>
        </div>
        <div style={s.row}>
          <div style={s.metric(C.YEL2)}>
            <p style={s.mLabel}>Egg Sales</p>
            <p style={s.mVal}>{fmt(eggIncome)}</p>
          </div>
          <div style={s.metric("#eaf4fb")}>
            <p style={s.mLabel}>Crop Sales</p>
            <p style={s.mVal}>{fmt(cropIncome)}</p>
          </div>
        </div>

        {/* Egg summary */}
        {(farmFilter==="all"||farmFilter==="poultry") && filtEggs.length>0 && (
          <div style={s.card}>
            <p style={s.cardT}>🥚 Egg Summary</p>
            <div style={s.row}>
              <div style={s.metric()}><p style={s.mLabel}>Collected</p><p style={s.mVal}>{totalEggsCollected}</p></div>
              <div style={s.metric()}><p style={s.mLabel}>Sold</p><p style={s.mVal}>{totalEggsSold}</p>
                <p style={s.mSub}>{Math.floor(totalEggsSold/30)} crates + {totalEggsSold%30} loose</p></div>
              <div style={s.metric(C.YEL2)}><p style={s.mLabel}>🍳 Eaten</p><p style={s.mVal}>{totalEggsEaten}</p></div>
              <div style={s.metric("#e8daef")}><p style={s.mLabel}>🎁 Dashed</p><p style={s.mVal}>{totalEggsDashed}</p></div>
              <div style={s.metric(C.RED2)}><p style={s.mLabel}>💔 Broken</p><p style={s.mVal}>{totalEggsBroken}</p></div>
            </div>
          </div>
        )}

        {/* Crop income by field */}
        {cropByFarm.length>0 && (farmFilter==="all"||FARMS.find(f=>f.id===farmFilter)?.type==="crop") && (
          <div style={s.card}>
            <p style={s.cardT}>🌾 Crop Income by Field</p>
            <table style={s.tbl}>
              <thead><tr><th style={s.th}>Field</th><th style={s.th}>Income</th></tr></thead>
              <tbody>{cropByFarm.map(f=>(
                <tr key={f.id}>
                  <td style={s.td}>{f.icon} {f.label}</td>
                  <td style={s.td}><b style={{color:C.GRN2}}>{fmt(f.income)}</b></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}

        {/* Expenses by category */}
        {filtExp.length>0 && (
          <div style={s.card}>
            <p style={s.cardT}>💸 Expenses by Category</p>
            <table style={s.tbl}>
              <thead><tr><th style={s.th}>Category</th><th style={s.th}>Amount</th></tr></thead>
              <tbody>
                {EXPENSE_CATS.filter(c=>expByCat[c]>0).map(c=>(
                  <tr key={c}><td style={s.td}>{c}</td>
                    <td style={s.td}><b style={{color:C.RED}}>{fmt(expByCat[c])}</b></td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Transaction list */}
        <div style={s.card}>
          <p style={s.cardT}>📋 Transactions</p>
          {filtEggs.length===0 && filtCrop.length===0 && filtExp.length===0 && (
            <p style={{color:C.TXT2,fontSize:12}}>No records for this period.</p>
          )}
          <table style={s.tbl}>
            <thead><tr>
              <th style={s.th}>Date</th><th style={s.th}>Type</th>
              <th style={s.th}>Detail</th><th style={s.th}>Amount</th>
            </tr></thead>
            <tbody>
              {filtEggs.map(r=>(
                <tr key={r.id}>
                  <td style={s.td}>{r.date}</td>
                  <td style={s.td}><span style={s.badge(C.YEL2,"#7D6608")}>🥚 Eggs</span></td>
                  <td style={s.td}>{r.sold_crates} crates + {r.sold_loose} loose
                    {r.buyer ? ` → ${r.buyer}` : ""}
                    {r.eaten>0 ? ` | 🍳${r.eaten}` : ""}
                    {r.dashed>0 ? ` | 🎁${r.dashed}` : ""}
                  </td>
                  <td style={{...s.td,color:C.GRN2,fontWeight:700}}>{fmt(r.sale_amount)}</td>
                </tr>
              ))}
              {filtCrop.map(r=>{
                const farm = FARMS.find(f=>f.id===r.farm_id);
                const batch = batches.find(b=>b.id===r.batch_id);
                return (
                  <tr key={r.id}>
                    <td style={s.td}>{r.date}</td>
                    <td style={s.td}><span style={s.badge(C.GRN3,C.GRN)}>{farm?.icon||"🌾"} {farm?.label||r.farm_id}</span></td>
                    <td style={s.td}>{r.weight_kg}kg @ GHS{r.price_per_kg}/kg
                      {batch ? ` [${batch.name}]`:""}{r.buyer?` → ${r.buyer}`:""}</td>
                    <td style={{...s.td,color:C.GRN2,fontWeight:700}}>{fmt(r.amount)}</td>
                  </tr>
                );
              })}
              {filtExp.map(r=>{
                const farm = FARMS.find(f=>f.id===r.farm_id);
                return (
                  <tr key={r.id}>
                    <td style={s.td}>{r.date}</td>
                    <td style={s.td}><span style={s.badge(C.RED2,C.RED)}>💸 {r.category}</span></td>
                    <td style={s.td}>{r.description}{r.supplier?` (${r.supplier})`:""}
                      <span style={{fontSize:10,color:C.TXT2}}> | {farm?.icon||""} {farm?.label||r.farm_id} | {r.funded_from}</span>
                    </td>
                    <td style={{...s.td,color:C.RED,fontWeight:700}}>-{fmt(r.amount)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────
export default function FinancialsModule() {
  const [tab, setTab]       = useState("dashboard");
  const [refresh, setRefresh] = useState(0);
  const bump = () => setRefresh(r=>r+1);

  const TABS = [
    { id:"dashboard", label:"📊 Dashboard" },
    { id:"eggs",      label:"🥚 Egg Sales" },
    { id:"crops",     label:"🌶 Crop Sales" },
    { id:"expenses",  label:"💸 Expenses" },
  ];

  return (
    <div style={s.wrap}>
      <div style={s.hdr}>
        <p style={s.hdrT}>💰 AI Farms Financials</p>
        <p style={s.hdrS}>Track sales, expenses and profit across all farms</p>
      </div>
      <div style={s.tabs}>
        {TABS.map(t=>(
          <button key={t.id} style={s.tab(tab===t.id)} onClick={()=>setTab(t.id)}>{t.label}</button>
        ))}
      </div>
      <div style={tab!=="dashboard"?s.body:{}}>
        {tab==="dashboard" && <FinancialDashboard refresh={refresh}/>}
        {tab==="eggs"      && <EggLogForm onSave={bump}/>}
        {tab==="crops"     && <CropSaleForm onSave={bump}/>}
        {tab==="expenses"  && <ExpenseForm onSave={bump}/>}
      </div>
    </div>
  );
}
