import { useState, useMemo } from 'react';

/* ============================================================
   AI Farms — Financials Module  v2.0
   Reads directly from App.jsx data props — no own localStorage.
   Theme: dark gold (#1a1a1a / #242424 bg, #D4A537 gold accent)
   ============================================================ */

const GOLD   = '#D4A537';
const BG1    = '#1a1a1a';
const BG2    = '#242424';
const BG3    = '#2e2e2e';
const BORDER = 'rgba(212,165,55,0.18)';
const MUTED  = '#888';
const GREEN  = '#7a9a66';
const RED    = '#c0392b';

/* ---------- tiny helpers ---------- */
function todayISO() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}`;
}
function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric',timeZone:'UTC'});
}
function num(v, d=0) {
  if (v===null||v===undefined||v===''||isNaN(v)) return '—';
  return Number(v).toLocaleString('en-GB',{maximumFractionDigits:d,minimumFractionDigits:d});
}
function ghc(v) {
  if (v===null||v===undefined||isNaN(v)) return '—';
  return `GH₵ ${num(v,2)}`;
}
function addDays(iso,n) {
  const d = new Date(iso); d.setUTCDate(d.getUTCDate()+n);
  return d.toISOString().slice(0,10);
}
function newId() { return Math.random().toString(36).slice(2,10); }

/* --------- inline styles (no extra CSS file needed) --------- */
const S = {
  wrap: { background:BG1, minHeight:'100vh', color:'#e8e0d0', fontFamily:'inherit' },
  header: { padding:'20px 20px 0', borderBottom:`1px solid ${BORDER}`, marginBottom:0 },
  eyebrow: { fontSize:11, textTransform:'uppercase', letterSpacing:'0.12em', color:GOLD, margin:'0 0 4px' },
  title: { fontSize:24, fontWeight:700, color:'#f5ead8', margin:'0 0 4px' },
  sub: { fontSize:13, color:MUTED, margin:'0 0 16px' },

  tabs: { display:'flex', gap:4, padding:'0 20px', background:BG2, borderBottom:`1px solid ${BORDER}`, overflowX:'auto' },
  tab: (active) => ({
    padding:'10px 16px', fontSize:13, fontWeight:600, border:'none', cursor:'pointer',
    background:'transparent', borderBottom: active ? `2px solid ${GOLD}` : '2px solid transparent',
    color: active ? GOLD : MUTED, whiteSpace:'nowrap', transition:'color .15s',
  }),

  section: { padding:'20px' },
  grid: (cols) => ({ display:'grid', gridTemplateColumns:`repeat(${cols},1fr)`, gap:12, marginBottom:20 }),
  card: { background:BG2, border:`1px solid ${BORDER}`, borderRadius:8, padding:'14px 16px' },
  cardTitle: { fontSize:11, textTransform:'uppercase', letterSpacing:'0.1em', color:MUTED, margin:'0 0 6px' },
  cardValue: (tone) => ({
    fontSize:22, fontWeight:700,
    color: tone==='green' ? GREEN : tone==='red' ? RED : GOLD,
    margin:'0 0 2px',
  }),
  cardFoot: { fontSize:12, color:MUTED, margin:0 },

  table: { width:'100%', borderCollapse:'collapse', fontSize:13 },
  th: { textAlign:'left', padding:'8px 10px', fontSize:11, textTransform:'uppercase',
        letterSpacing:'0.08em', color:MUTED, borderBottom:`1px solid ${BORDER}`, background:BG2 },
  td: { padding:'9px 10px', borderBottom:`1px solid rgba(255,255,255,0.05)`, verticalAlign:'middle' },
  trHover: { background:'rgba(212,165,55,0.05)' },

  btn: { padding:'7px 14px', borderRadius:6, border:`1px solid ${GOLD}`, background:'transparent',
         color:GOLD, fontSize:13, fontWeight:600, cursor:'pointer' },
  btnGold: { padding:'7px 14px', borderRadius:6, border:'none', background:GOLD,
              color:'#1a1a1a', fontSize:13, fontWeight:700, cursor:'pointer' },
  btnGhost: { padding:'7px 14px', borderRadius:6, border:`1px solid ${BORDER}`, background:'transparent',
               color:MUTED, fontSize:13, cursor:'pointer' },
  btnRust: { padding:'6px 10px', borderRadius:5, border:'none', background:'#7a2a2a',
              color:'#f5c5c5', fontSize:12, cursor:'pointer' },

  badge: (tone) => ({
    display:'inline-block', padding:'2px 8px', borderRadius:12, fontSize:11, fontWeight:600,
    background: tone==='green' ? 'rgba(122,154,102,0.2)' : tone==='red' ? 'rgba(192,57,43,0.2)' : 'rgba(212,165,55,0.15)',
    color: tone==='green' ? GREEN : tone==='red' ? '#e07070' : GOLD,
  }),

  empty: { textAlign:'center', padding:'40px 20px', color:MUTED, fontSize:13 },

  modal: { position:'fixed', inset:0, background:'rgba(0,0,0,0.7)', display:'flex',
           alignItems:'center', justifyContent:'center', zIndex:1000 },
  modalBox: { background:BG2, border:`1px solid ${BORDER}`, borderRadius:12,
               padding:'24px', width:'min(95vw,440px)', maxHeight:'90vh', overflowY:'auto' },
  modalTitle: { fontSize:17, fontWeight:700, color:'#f5ead8', margin:'0 0 4px' },
  modalSub: { fontSize:12, color:MUTED, margin:'0 0 18px' },
  formGrid: { display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 },
  field: { display:'flex', flexDirection:'column', gap:4 },
  label: { fontSize:11, textTransform:'uppercase', letterSpacing:'0.08em', color:MUTED },
  input: { padding:'8px 10px', background:BG3, border:`1px solid ${BORDER}`, borderRadius:6,
           color:'#e8e0d0', fontSize:13, outline:'none' },
  span2: { gridColumn:'span 2' },
  modalActions: { display:'flex', justifyContent:'flex-end', gap:8, marginTop:20 },

  divider: { border:'none', borderTop:`1px solid ${BORDER}`, margin:'16px 0' },
  tag: (tone) => ({
    display:'inline-block', padding:'1px 7px', borderRadius:10, fontSize:11,
    background: tone==='green'?'rgba(122,154,102,0.15)':tone==='red'?'rgba(192,57,43,0.15)':'rgba(212,165,55,0.12)',
    color: tone==='green'?GREEN:tone==='red'?'#e07070':GOLD,
  }),
};

/* ============================================================
   HELPER: derive summary numbers from existing app data
   ============================================================ */
function buildSummary(data, sales, expenses, pepperHarvests) {
  const CRATE = 30;

  /* --- egg revenue from poultry sales --- */
  const eggSales = (sales||[]).filter(s => s.item==='Eggs (crates)'||s.item==='Eggs (pieces)');
  const eggRevenue = eggSales.reduce((s,r)=>s+(Number(r.amount)||0),0);

  /* --- bird / poultry sales --- */
  const birdSales = (sales||[]).filter(s=>s.item&&!s.item.toLowerCase().includes('egg'));
  const birdRevenue = birdSales.reduce((s,r)=>s+(Number(r.amount)||0),0);

  /* --- pepper / crop revenue --- */
  const pepperRevenue = (pepperHarvests||[]).reduce((s,h)=>{
    const kg = Number(h.weightKg)||0;
    const price = Number(h.pricePerKg)||0;
    return s + (h.totalRevenue ? Number(h.totalRevenue) : kg*price);
  },0);

  /* --- total expenses from whole-farm expenses --- */
  const totalExpenses = (expenses||[]).reduce((s,e)=>s+(Number(e.amount)||0),0);

  /* --- total revenue --- */
  const totalRevenue = eggRevenue + birdRevenue + pepperRevenue;

  /* --- net profit --- */
  const netProfit = totalRevenue - totalExpenses;

  /* --- this month --- */
  const thisMonth = todayISO().slice(0,7);
  const monthRevenue = [
    ...(sales||[]).filter(s=>s.date&&s.date.startsWith(thisMonth)),
    ...(pepperHarvests||[]).filter(h=>h.date&&h.date.startsWith(thisMonth)),
  ].reduce((s,r)=>s+(Number(r.amount)||Number(r.totalRevenue)||(Number(r.weightKg||0)*Number(r.pricePerKg||0))),0);
  const monthExpenses = (expenses||[]).filter(e=>e.date&&e.date.startsWith(thisMonth))
    .reduce((s,e)=>s+(Number(e.amount)||0),0);

  return { eggRevenue, birdRevenue, pepperRevenue, totalRevenue, totalExpenses, netProfit, monthRevenue, monthExpenses };
}

/* ============================================================
   OVERVIEW TAB
   ============================================================ */
function OverviewTab({ data, sales, expenses, pepperHarvests }) {
  const s = buildSummary(data, sales, expenses, pepperHarvests);

  /* monthly trend — last 6 months */
  const months = useMemo(()=>{
    const result = [];
    for (let i=5; i>=0; i--) {
      const d = new Date(); d.setMonth(d.getMonth()-i);
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
      const label = d.toLocaleDateString('en-GB',{month:'short',year:'2-digit'});
      const rev = [
        ...(sales||[]).filter(r=>r.date&&r.date.startsWith(key)),
        ...(pepperHarvests||[]).filter(h=>h.date&&h.date.startsWith(key)),
      ].reduce((a,r)=>a+(Number(r.amount)||Number(r.totalRevenue)||(Number(r.weightKg||0)*Number(r.pricePerKg||0))),0);
      const exp = (expenses||[]).filter(e=>e.date&&e.date.startsWith(key))
        .reduce((a,e)=>a+(Number(e.amount)||0),0);
      result.push({key,label,rev,exp,profit:rev-exp});
    }
    return result;
  },[sales,expenses,pepperHarvests]);

  const maxVal = Math.max(...months.map(m=>Math.max(m.rev,m.exp)),1);

  return (
    <div style={S.section}>
      {/* KPI row */}
      <div style={S.grid(2)}>
        <div style={S.card}>
          <p style={S.cardTitle}>Total Revenue (All-time)</p>
          <p style={S.cardValue('gold')}>{ghc(s.totalRevenue)}</p>
          <p style={S.cardFoot}>Eggs + Poultry + Pepper</p>
        </div>
        <div style={S.card}>
          <p style={S.cardTitle}>Total Expenses (All-time)</p>
          <p style={S.cardValue('red')}>{ghc(s.totalExpenses)}</p>
          <p style={S.cardFoot}>All farm costs logged</p>
        </div>
        <div style={S.card}>
          <p style={S.cardTitle}>Net Profit / Loss</p>
          <p style={S.cardValue(s.netProfit>=0?'green':'red')}>{ghc(Math.abs(s.netProfit))}</p>
          <p style={S.cardFoot}>{s.netProfit>=0?'Profit':'Loss'} to date</p>
        </div>
        <div style={S.card}>
          <p style={S.cardTitle}>This Month</p>
          <p style={S.cardValue(s.monthRevenue-s.monthExpenses>=0?'green':'red')}>
            {ghc(Math.abs(s.monthRevenue-s.monthExpenses))}
          </p>
          <p style={S.cardFoot}>Rev {ghc(s.monthRevenue)} · Exp {ghc(s.monthExpenses)}</p>
        </div>
      </div>

      {/* Revenue breakdown */}
      <div style={{...S.card, marginBottom:16}}>
        <p style={S.cardTitle}>Revenue breakdown</p>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:12,marginTop:8}}>
          {[
            {label:'🥚 Egg Sales', val:s.eggRevenue},
            {label:'🐔 Bird Sales', val:s.birdRevenue},
            {label:'🌶 Pepper Sales', val:s.pepperRevenue},
          ].map(item=>(
            <div key={item.label} style={{textAlign:'center'}}>
              <p style={{fontSize:12,color:MUTED,margin:'0 0 4px'}}>{item.label}</p>
              <p style={{fontSize:17,fontWeight:700,color:GOLD,margin:0}}>{ghc(item.val)}</p>
              <p style={{fontSize:11,color:MUTED,margin:'2px 0 0'}}>
                {s.totalRevenue>0?`${Math.round((item.val/s.totalRevenue)*100)}%`:'—'}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* 6-month bar chart */}
      <div style={S.card}>
        <p style={S.cardTitle}>Revenue vs Expenses — last 6 months</p>
        <div style={{display:'flex',alignItems:'flex-end',gap:8,height:100,marginTop:12}}>
          {months.map(m=>(
            <div key={m.key} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',gap:2}}>
              <div style={{width:'100%',display:'flex',gap:2,alignItems:'flex-end',height:80}}>
                <div style={{flex:1,background:GOLD,borderRadius:'3px 3px 0 0',
                  height:`${Math.round((m.rev/maxVal)*80)}px`,minHeight:m.rev>0?2:0,transition:'height .3s'}}/>
                <div style={{flex:1,background:RED,borderRadius:'3px 3px 0 0',
                  height:`${Math.round((m.exp/maxVal)*80)}px`,minHeight:m.exp>0?2:0,opacity:0.7,transition:'height .3s'}}/>
              </div>
              <p style={{fontSize:9,color:MUTED,margin:0,textAlign:'center'}}>{m.label}</p>
            </div>
          ))}
        </div>
        <div style={{display:'flex',gap:16,marginTop:8}}>
          <span style={{fontSize:11,color:MUTED}}><span style={{color:GOLD}}>■</span> Revenue</span>
          <span style={{fontSize:11,color:MUTED}}><span style={{color:RED}}>■</span> Expenses</span>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   INCOME TAB  — shows all sales (egg + bird + pepper)
   ============================================================ */
function IncomeTab({ sales, pepperHarvests, flocks }) {
  const CRATE = 30;

  const allIncome = useMemo(()=>{
    const rows = [];
    (sales||[]).forEach(s=>{
      const flock = (flocks||[]).find(f=>f.id===s.flockId);
      rows.push({
        id: s.id||newId(),
        date: s.date,
        source: flock ? flock.flockName : 'Poultry',
        category: (s.item||'').toLowerCase().includes('egg') ? 'Eggs' : 'Poultry sale',
        description: s.item || '—',
        qty: s.quantity,
        unit: (s.item||'').includes('crates') ? 'crates' : (s.item||'').includes('pieces') ? 'pcs' : 'birds',
        price: s.unitPrice,
        amount: Number(s.amount)||0,
        buyer: s.buyer || '—',
      });
    });
    (pepperHarvests||[]).forEach(h=>{
      const amt = Number(h.totalRevenue)||(Number(h.weightKg||0)*Number(h.pricePerKg||0));
      rows.push({
        id: h.id||newId(),
        date: h.date,
        source: h.fieldName || 'Bell Pepper',
        category: 'Pepper',
        description: `${num(h.weightKg,1)} kg${h.grade?' ('+h.grade+')':''}`,
        qty: h.weightKg,
        unit: 'kg',
        price: h.pricePerKg,
        amount: amt,
        buyer: h.buyer || '—',
      });
    });
    return rows.sort((a,b)=>new Date(b.date)-new Date(a.date));
  },[sales,pepperHarvests,flocks]);

  const total = allIncome.reduce((s,r)=>s+r.amount,0);

  return (
    <div style={S.section}>
      <div style={S.grid(3)}>
        <div style={S.card}>
          <p style={S.cardTitle}>Total Income</p>
          <p style={S.cardValue('gold')}>{ghc(total)}</p>
          <p style={S.cardFoot}>{allIncome.length} records</p>
        </div>
        <div style={S.card}>
          <p style={S.cardTitle}>Egg Revenue</p>
          <p style={S.cardValue()}>{ghc(allIncome.filter(r=>r.category==='Eggs').reduce((s,r)=>s+r.amount,0))}</p>
        </div>
        <div style={S.card}>
          <p style={S.cardTitle}>Pepper Revenue</p>
          <p style={S.cardValue()}>{ghc(allIncome.filter(r=>r.category==='Pepper').reduce((s,r)=>s+r.amount,0))}</p>
        </div>
      </div>

      <div style={{overflowX:'auto'}}>
        <table style={S.table}>
          <thead>
            <tr>
              {['Date','Source','Category','Description','Qty','Price/unit','Amount','Buyer'].map(h=>(
                <th key={h} style={S.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {allIncome.length===0 && (
              <tr><td colSpan={8} style={S.empty}>
                No income records yet. Record egg sales in Poultry → Sales, and pepper harvests in Bell Pepper Fields → the harvest tab.
              </td></tr>
            )}
            {allIncome.map(r=>(
              <tr key={r.id}>
                <td style={S.td}>{fmtDate(r.date)}</td>
                <td style={S.td}>{r.source}</td>
                <td style={S.td}><span style={S.tag(r.category==='Eggs'?'gold':r.category==='Pepper'?'green':'gold')}>{r.category}</span></td>
                <td style={S.td}>{r.description}</td>
                <td style={{...S.td,fontFamily:'monospace'}}>{r.qty!=null?num(r.qty,1):'—'} {r.unit}</td>
                <td style={{...S.td,fontFamily:'monospace'}}>{r.price!=null?ghc(r.price):'—'}</td>
                <td style={{...S.td,fontFamily:'monospace',color:GOLD,fontWeight:600}}>{ghc(r.amount)}</td>
                <td style={S.td}>{r.buyer}</td>
              </tr>
            ))}
          </tbody>
          {allIncome.length>0 && (
            <tfoot>
              <tr>
                <td colSpan={6} style={{...S.td,fontWeight:700,color:'#e8e0d0'}}>Total</td>
                <td style={{...S.td,fontFamily:'monospace',color:GOLD,fontWeight:700}}>{ghc(total)}</td>
                <td style={S.td}/>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

/* ============================================================
   EXPENSES TAB — shows all whole-farm expenses
   ============================================================ */
function ExpensesTab({ expenses, data }) {
  const [showAdd, setShowAdd] = useState(false);
  const [f, setF] = useState({ date:todayISO(), category:'Feed', description:'', amount:'', notes:'' });

  const CATEGORIES = ['Feed','Labour','Transport','Agrochemicals','Equipment','Veterinary','Seeds & Inputs','Utilities','Maintenance','Other'];

  const rows = useMemo(()=>
    [...(expenses||[])].sort((a,b)=>new Date(b.date)-new Date(a.date))
  ,[expenses]);

  const total = rows.reduce((s,r)=>s+(Number(r.amount)||0),0);

  /* group by category */
  const byCategory = useMemo(()=>{
    const m={};
    rows.forEach(r=>{ const k=r.category||'Other'; m[k]=(m[k]||0)+(Number(r.amount)||0); });
    return Object.entries(m).sort((a,b)=>b[1]-a[1]);
  },[rows]);

  return (
    <div style={S.section}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
        <div>
          <p style={{...S.cardTitle,margin:0}}>All Expenses</p>
          <p style={{fontSize:11,color:MUTED,margin:'2px 0 0'}}>Logged in Whole Farm → Expenses</p>
        </div>
      </div>

      <div style={S.grid(2)}>
        <div style={S.card}>
          <p style={S.cardTitle}>Total Expenses</p>
          <p style={S.cardValue('red')}>{ghc(total)}</p>
          <p style={S.cardFoot}>{rows.length} records</p>
        </div>
        <div style={S.card}>
          <p style={S.cardTitle}>Top Category</p>
          <p style={S.cardValue()}>{byCategory[0]?byCategory[0][0]:'—'}</p>
          <p style={S.cardFoot}>{byCategory[0]?ghc(byCategory[0][1]):''}</p>
        </div>
      </div>

      {/* Category breakdown */}
      {byCategory.length>0 && (
        <div style={{...S.card,marginBottom:16}}>
          <p style={S.cardTitle}>By Category</p>
          <div style={{display:'flex',flexDirection:'column',gap:6,marginTop:8}}>
            {byCategory.map(([cat,amt])=>(
              <div key={cat} style={{display:'flex',alignItems:'center',gap:8}}>
                <span style={{width:120,fontSize:12,color:'#e8e0d0',flexShrink:0}}>{cat}</span>
                <div style={{flex:1,height:6,background:BG3,borderRadius:3,overflow:'hidden'}}>
                  <div style={{width:`${Math.round((amt/total)*100)}%`,height:'100%',background:GOLD,borderRadius:3}}/>
                </div>
                <span style={{width:90,fontSize:12,fontFamily:'monospace',color:GOLD,textAlign:'right',flexShrink:0}}>{ghc(amt)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{overflowX:'auto'}}>
        <table style={S.table}>
          <thead>
            <tr>
              {['Date','Category','Description','Amount','Notes'].map(h=>(
                <th key={h} style={S.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length===0 && (
              <tr><td colSpan={5} style={S.empty}>
                No expenses logged yet. Add them in Whole Farm → Expenses and they will appear here automatically.
              </td></tr>
            )}
            {rows.map(r=>(
              <tr key={r.id}>
                <td style={S.td}>{fmtDate(r.date)}</td>
                <td style={S.td}><span style={S.tag('gold')}>{r.category||'—'}</span></td>
                <td style={S.td}>{r.description||r.note||'—'}</td>
                <td style={{...S.td,fontFamily:'monospace',color:'#e07070',fontWeight:600}}>{ghc(r.amount)}</td>
                <td style={{...S.td,color:MUTED,fontSize:12}}>{r.notes||'—'}</td>
              </tr>
            ))}
          </tbody>
          {rows.length>0 && (
            <tfoot>
              <tr>
                <td colSpan={3} style={{...S.td,fontWeight:700,color:'#e8e0d0'}}>Total</td>
                <td style={{...S.td,fontFamily:'monospace',color:'#e07070',fontWeight:700}}>{ghc(total)}</td>
                <td style={S.td}/>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

/* ============================================================
   PROFIT & LOSS TAB
   ============================================================ */
function ProfitLossTab({ data, sales, expenses, pepperHarvests }) {
  const [period, setPeriod] = useState('all');

  const periods = [
    {id:'all',label:'All time'},
    {id:'thismonth',label:'This month'},
    {id:'lastmonth',label:'Last month'},
    {id:'thisyear',label:'This year'},
  ];

  function inPeriod(date) {
    if (!date) return false;
    const d = date.slice(0,7);
    const now = todayISO();
    const thisMonth = now.slice(0,7);
    const lastMonthDate = new Date(now.slice(0,4),Number(now.slice(5,7))-2,1);
    const lastMonth = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth()+1).padStart(2,'0')}`;
    if (period==='all') return true;
    if (period==='thismonth') return d===thisMonth;
    if (period==='lastmonth') return d===lastMonth;
    if (period==='thisyear') return date.startsWith(now.slice(0,4));
    return true;
  }

  const filteredSales = (sales||[]).filter(r=>inPeriod(r.date));
  const filteredHarvests = (pepperHarvests||[]).filter(r=>inPeriod(r.date));
  const filteredExp = (expenses||[]).filter(r=>inPeriod(r.date));

  const eggRev  = filteredSales.filter(s=>s.item&&(s.item.includes('Eggs')||s.item.includes('egg'))).reduce((a,r)=>a+(Number(r.amount)||0),0);
  const birdRev = filteredSales.filter(s=>s.item&&!s.item.toLowerCase().includes('egg')).reduce((a,r)=>a+(Number(r.amount)||0),0);
  const pepperRev = filteredHarvests.reduce((a,h)=>a+(Number(h.totalRevenue)||(Number(h.weightKg||0)*Number(h.pricePerKg||0))),0);
  const totalRev = eggRev + birdRev + pepperRev;

  /* group expenses */
  const expByCategory = {};
  filteredExp.forEach(e=>{ const k=e.category||'Other'; expByCategory[k]=(expByCategory[k]||0)+(Number(e.amount)||0); });
  const totalExp = filteredExp.reduce((a,e)=>a+(Number(e.amount)||0),0);
  const grossProfit = totalRev - totalExp;

  return (
    <div style={S.section}>
      {/* Period picker */}
      <div style={{display:'flex',gap:6,marginBottom:16,flexWrap:'wrap'}}>
        {periods.map(p=>(
          <button key={p.id} style={period===p.id?S.btnGold:S.btn} onClick={()=>setPeriod(p.id)}>{p.label}</button>
        ))}
      </div>

      {/* P&L Statement */}
      <div style={S.card}>
        <p style={{fontSize:15,fontWeight:700,color:'#f5ead8',margin:'0 0 16px'}}>
          AI Farms — Profit & Loss Statement
        </p>

        {/* Revenue section */}
        <p style={{fontSize:11,textTransform:'uppercase',letterSpacing:'0.1em',color:GOLD,margin:'0 0 8px'}}>Revenue</p>
        {[
          {label:'Egg sales', val:eggRev},
          {label:'Bird / poultry sales', val:birdRev},
          {label:'Bell pepper sales', val:pepperRev},
        ].map(row=>(
          <div key={row.label} style={{display:'flex',justifyContent:'space-between',padding:'5px 0',borderBottom:`1px solid rgba(255,255,255,0.04)`}}>
            <span style={{fontSize:13,color:'#e8e0d0',paddingLeft:12}}>{row.label}</span>
            <span style={{fontSize:13,fontFamily:'monospace',color:GOLD}}>{ghc(row.val)}</span>
          </div>
        ))}
        <div style={{display:'flex',justifyContent:'space-between',padding:'8px 0',marginTop:4,borderTop:`1px solid ${BORDER}`}}>
          <span style={{fontSize:14,fontWeight:700,color:'#f5ead8'}}>Total Revenue</span>
          <span style={{fontSize:14,fontFamily:'monospace',fontWeight:700,color:GOLD}}>{ghc(totalRev)}</span>
        </div>

        <hr style={S.divider}/>

        {/* Expenses section */}
        <p style={{fontSize:11,textTransform:'uppercase',letterSpacing:'0.1em',color:'#e07070',margin:'0 0 8px'}}>Expenses</p>
        {Object.entries(expByCategory).sort((a,b)=>b[1]-a[1]).map(([cat,amt])=>(
          <div key={cat} style={{display:'flex',justifyContent:'space-between',padding:'5px 0',borderBottom:`1px solid rgba(255,255,255,0.04)`}}>
            <span style={{fontSize:13,color:'#e8e0d0',paddingLeft:12}}>{cat}</span>
            <span style={{fontSize:13,fontFamily:'monospace',color:'#e07070'}}>{ghc(amt)}</span>
          </div>
        ))}
        {Object.keys(expByCategory).length===0 && (
          <p style={{fontSize:12,color:MUTED,paddingLeft:12}}>No expenses in this period</p>
        )}
        <div style={{display:'flex',justifyContent:'space-between',padding:'8px 0',marginTop:4,borderTop:`1px solid ${BORDER}`}}>
          <span style={{fontSize:14,fontWeight:700,color:'#f5ead8'}}>Total Expenses</span>
          <span style={{fontSize:14,fontFamily:'monospace',fontWeight:700,color:'#e07070'}}>{ghc(totalExp)}</span>
        </div>

        <hr style={S.divider}/>

        {/* Net */}
        <div style={{display:'flex',justifyContent:'space-between',padding:'10px 0',background:grossProfit>=0?'rgba(122,154,102,0.08)':'rgba(192,57,43,0.08)',borderRadius:6,paddingLeft:12,paddingRight:12}}>
          <span style={{fontSize:16,fontWeight:700,color:'#f5ead8'}}>
            {grossProfit>=0?'Net Profit':'Net Loss'}
          </span>
          <span style={{fontSize:16,fontFamily:'monospace',fontWeight:700,color:grossProfit>=0?GREEN:RED}}>
            {ghc(Math.abs(grossProfit))}
          </span>
        </div>

        {totalRev>0 && (
          <p style={{fontSize:12,color:MUTED,margin:'8px 0 0',textAlign:'right'}}>
            Profit margin: {num(grossProfit/totalRev*100,1)}%
          </p>
        )}
      </div>
    </div>
  );
}

/* ============================================================
   MAIN COMPONENT
   ============================================================ */
export default function FinancialsModule({ data, sales, expenses, pepperHarvests }) {
  const [tab, setTab] = useState('overview');

  /* safe fallbacks if props not yet passed */
  const _data         = data || {};
  const _sales        = sales || [];
  const _expenses     = expenses || [];
  const _pepperHarvests = pepperHarvests || [];
  const _flocks       = (_data.flocks) || [];

  const TABS = [
    {id:'overview',   label:'📊 Overview'},
    {id:'income',     label:'💵 Income'},
    {id:'expenses',   label:'📤 Expenses'},
    {id:'pnl',        label:'📋 Profit & Loss'},
  ];

  return (
    <div style={S.wrap}>
      <div style={S.header}>
        <p style={S.eyebrow}>AI Farms</p>
        <h1 style={S.title}>Financials</h1>
        <p style={S.sub}>All figures pulled live from your farm records — no re-entry needed.</p>
      </div>

      <nav style={S.tabs}>
        {TABS.map(t=>(
          <button key={t.id} style={S.tab(tab===t.id)} onClick={()=>setTab(t.id)}>{t.label}</button>
        ))}
      </nav>

      {tab==='overview'  && <OverviewTab  data={_data} sales={_sales} expenses={_expenses} pepperHarvests={_pepperHarvests}/>}
      {tab==='income'    && <IncomeTab    sales={_sales} pepperHarvests={_pepperHarvests} flocks={_flocks}/>}
      {tab==='expenses'  && <ExpensesTab  expenses={_expenses} data={_data}/>}
      {tab==='pnl'       && <ProfitLossTab data={_data} sales={_sales} expenses={_expenses} pepperHarvests={_pepperHarvests}/>}
    </div>
  );
}
