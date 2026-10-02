import { useState, useMemo } from 'react';

/* ============================================================
   AI Farms — Financials Module  v2.1
   Reads directly from App.jsx data props — no own localStorage.
   Theme: dark gold (#1a1a1a / #242424 bg, #D4A537 gold accent)

   Revenue sources:
     • data.sales[]          — poultry: eggs + bird sales  (amount field)
     • data.pepper.harvests[]— bell pepper: weightKg × pricePerKg  (no totalRevenue)
     • data.goats.sales[]    — goat sales  (price field, NOT amount)
     • data.customFarms[]    — "My Farms":
         crop farms  → farm.harvests[]   (quantityKg only, no price → revenue = 0 unless noted)
         livestock   → farm.salesLog[]   (amount field)
   ============================================================ */

const GOLD   = '#D4A537';
const BG1    = '#1a1a1a';
const BG2    = '#242424';
const BG3    = '#2e2e2e';
const BORDER = 'rgba(212,165,55,0.18)';
const MUTED  = '#888';
const GREEN  = '#7a9a66';
const RED    = '#c0392b';

/* ---------- helpers ---------- */
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
  if (v===null||v===undefined||isNaN(Number(v))) return '—';
  return `GH₵ ${Number(v).toLocaleString('en-GB',{maximumFractionDigits:2,minimumFractionDigits:2})}`;
}
function newId() { return Math.random().toString(36).slice(2,10); }

/* ============================================================
   CANONICAL INCOME ROW BUILDER
   Converts every source into a uniform shape:
   { id, date, source, category, description, qty, unit, price, amount, buyer }
   ============================================================ */
function buildIncomeRows({ sales, pepperHarvests, goatSales, customFarms, flocks }) {
  const rows = [];

  /* 1. Poultry sales (eggs + bird sales) — revenue field: amount */
  (sales || []).forEach(s => {
    const flock = (flocks || []).find(f => f.id === s.flockId);
    const isEgg = (s.item || '').toLowerCase().includes('egg');
    rows.push({
      id: s.id || newId(),
      date: s.date,
      source: flock?.flockName || 'Poultry',
      category: isEgg ? 'Eggs' : 'Poultry sale',
      description: s.item || 'Poultry sale',
      qty: s.quantity,
      unit: isEgg ? ((s.item||'').includes('crates')?'crates':'pcs') : 'birds',
      price: s.unitPrice,
      amount: Number(s.amount) || 0,
      buyer: s.buyer || '—',
    });
  });

  /* 2. Bell pepper harvests — revenue = weightKg × pricePerKg (NO totalRevenue field) */
  (pepperHarvests || []).forEach(h => {
    const kg  = Number(h.weightKg)  || 0;
    const ppk = Number(h.pricePerKg) || 0;
    const amt = kg * ppk;           // ← correct calculation
    rows.push({
      id: h.id || newId(),
      date: h.date,
      source: h.fieldName || 'Bell Pepper',
      category: 'Pepper',
      description: `${num(kg,1)} kg${h.grade ? ` (${h.grade})` : ''}`,
      qty: kg,
      unit: 'kg',
      price: ppk || null,
      amount: amt,
      buyer: h.buyer || '—',
    });
  });

  /* 3. Goat sales — revenue field is `price`, NOT `amount` */
  (goatSales || []).forEach(s => {
    rows.push({
      id: s.id || newId(),
      date: s.date,
      source: 'Goats',
      category: 'Goat sale',
      description: `Goat${s.weightKg ? ` (${num(s.weightKg,1)} kg)` : ''}`,
      qty: s.weightKg || null,
      unit: 'kg',
      price: null,
      amount: Number(s.price) || 0,   // ← uses `price`, not `amount`
      buyer: s.buyer || '—',
    });
  });

  /* 4. Custom farms (My Farms)
       - Livestock farms: salesLog[].amount
       - Crop farms:      harvests[].quantityKg (no price → amount = 0, shown as "—")
  */
  (customFarms || []).forEach(farm => {
    if (farm.category === 'livestock') {
      (farm.salesLog || []).forEach(s => {
        rows.push({
          id: s.id || newId(),
          date: s.date,
          source: farm.name || 'My Farm',
          category: farm.subtype || 'Livestock',
          description: s.notes || `${farm.name} sale`,
          qty: s.quantity || null,
          unit: null,
          price: null,
          amount: Number(s.amount) || 0,
          buyer: s.buyer || '—',
        });
      });
    } else {
      /* crop farm — harvests have quantityKg but no price,
         so we include the row with amount=0 so the harvest is visible */
      (farm.harvests || []).forEach(h => {
        rows.push({
          id: h.id || newId(),
          date: h.date,
          source: farm.name || 'My Farm',
          category: farm.subtype || 'Crop',
          description: `Harvest${h.quantityKg ? ` — ${num(h.quantityKg,1)} kg` : ''}${h.notes ? ` (${h.notes})` : ''}`,
          qty: h.quantityKg || null,
          unit: 'kg',
          price: null,
          amount: 0,   // crop farms don't record a sale price
          buyer: '—',
          noRevenue: true,
        });
      });
    }
  });

  return rows.sort((a, b) => new Date(b.date) - new Date(a.date));
}

/* ---------- inline styles ---------- */
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

  btn: { padding:'7px 14px', borderRadius:6, border:`1px solid ${GOLD}`, background:'transparent',
         color:GOLD, fontSize:13, fontWeight:600, cursor:'pointer' },
  btnGold: { padding:'7px 14px', borderRadius:6, border:'none', background:GOLD,
              color:'#1a1a1a', fontSize:13, fontWeight:700, cursor:'pointer' },

  tag: (tone) => ({
    display:'inline-block', padding:'1px 7px', borderRadius:10, fontSize:11,
    background: tone==='green'?'rgba(122,154,102,0.15)':tone==='red'?'rgba(192,57,43,0.15)':'rgba(212,165,55,0.12)',
    color: tone==='green'?GREEN:tone==='red'?'#e07070':GOLD,
  }),

  empty: { textAlign:'center', padding:'40px 20px', color:MUTED, fontSize:13 },
  divider: { border:'none', borderTop:`1px solid ${BORDER}`, margin:'16px 0' },
};

/* category colour */
function catTone(cat) {
  if (!cat) return 'gold';
  const c = cat.toLowerCase();
  if (c.includes('egg')) return 'gold';
  if (c.includes('pepper')||c.includes('crop')) return 'green';
  if (c.includes('goat')) return 'green';
  return 'gold';
}

/* ============================================================
   OVERVIEW TAB
   ============================================================ */
function OverviewTab({ sales, expenses, pepperHarvests, goatSales, customFarms, flocks }) {
  const allIncome = useMemo(()=>buildIncomeRows({sales,pepperHarvests,goatSales,customFarms,flocks}),[sales,pepperHarvests,goatSales,customFarms,flocks]);

  const eggRev     = allIncome.filter(r=>r.category==='Eggs').reduce((s,r)=>s+r.amount,0);
  const birdRev    = allIncome.filter(r=>r.category==='Poultry sale').reduce((s,r)=>s+r.amount,0);
  const pepperRev  = allIncome.filter(r=>r.category==='Pepper').reduce((s,r)=>s+r.amount,0);
  const goatRev    = allIncome.filter(r=>r.category==='Goat sale').reduce((s,r)=>s+r.amount,0);
  const customRev  = allIncome.filter(r=>!['Eggs','Poultry sale','Pepper','Goat sale'].includes(r.category)).reduce((s,r)=>s+r.amount,0);
  const totalRev   = allIncome.reduce((s,r)=>s+r.amount,0);
  const totalExp   = (expenses||[]).reduce((s,e)=>s+(Number(e.amount)||0),0);
  const netProfit  = totalRev - totalExp;

  /* this month */
  const thisMonth = todayISO().slice(0,7);
  const monthRev = allIncome.filter(r=>r.date&&r.date.startsWith(thisMonth)).reduce((s,r)=>s+r.amount,0);
  const monthExp = (expenses||[]).filter(e=>e.date&&e.date.startsWith(thisMonth)).reduce((s,e)=>s+(Number(e.amount)||0),0);

  /* 6-month bar chart */
  const months = useMemo(()=>{
    const result=[];
    for(let i=5;i>=0;i--){
      const d=new Date(); d.setMonth(d.getMonth()-i);
      const key=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
      const label=d.toLocaleDateString('en-GB',{month:'short',year:'2-digit'});
      const rev=allIncome.filter(r=>r.date&&r.date.startsWith(key)).reduce((a,r)=>a+r.amount,0);
      const exp=(expenses||[]).filter(e=>e.date&&e.date.startsWith(key)).reduce((a,e)=>a+(Number(e.amount)||0),0);
      result.push({key,label,rev,exp});
    }
    return result;
  },[allIncome,expenses]);
  const maxVal=Math.max(...months.map(m=>Math.max(m.rev,m.exp)),1);

  /* breakdown rows — only show sources with > 0 */
  const breakdown = [
    {label:'🥚 Egg Sales',     val:eggRev},
    {label:'🐔 Bird Sales',    val:birdRev},
    {label:'🌶 Pepper Sales',  val:pepperRev},
    {label:'🐐 Goat Sales',    val:goatRev},
    {label:'🌾 My Farms',      val:customRev},
  ].filter(r=>r.val>0);

  return (
    <div style={S.section}>
      <div style={S.grid(2)}>
        <div style={S.card}>
          <p style={S.cardTitle}>Total Revenue (All-time)</p>
          <p style={S.cardValue('gold')}>{ghc(totalRev)}</p>
          <p style={S.cardFoot}>{allIncome.filter(r=>!r.noRevenue).length} sale records</p>
        </div>
        <div style={S.card}>
          <p style={S.cardTitle}>Total Expenses (All-time)</p>
          <p style={S.cardValue('red')}>{ghc(totalExp)}</p>
          <p style={S.cardFoot}>{(expenses||[]).length} expense records</p>
        </div>
        <div style={S.card}>
          <p style={S.cardTitle}>Net Profit / Loss</p>
          <p style={S.cardValue(netProfit>=0?'green':'red')}>{ghc(Math.abs(netProfit))}</p>
          <p style={S.cardFoot}>{netProfit>=0?'Profit':'Loss'} to date</p>
        </div>
        <div style={S.card}>
          <p style={S.cardTitle}>This Month</p>
          <p style={S.cardValue(monthRev-monthExp>=0?'green':'red')}>{ghc(Math.abs(monthRev-monthExp))}</p>
          <p style={S.cardFoot}>Rev {ghc(monthRev)} · Exp {ghc(monthExp)}</p>
        </div>
      </div>

      {breakdown.length>0 && (
        <div style={{...S.card,marginBottom:16}}>
          <p style={S.cardTitle}>Revenue breakdown</p>
          <div style={{display:'grid',gridTemplateColumns:`repeat(${Math.min(breakdown.length,4)},1fr)`,gap:12,marginTop:8}}>
            {breakdown.map(item=>(
              <div key={item.label} style={{textAlign:'center'}}>
                <p style={{fontSize:12,color:MUTED,margin:'0 0 4px'}}>{item.label}</p>
                <p style={{fontSize:17,fontWeight:700,color:GOLD,margin:0}}>{ghc(item.val)}</p>
                <p style={{fontSize:11,color:MUTED,margin:'2px 0 0'}}>
                  {totalRev>0?`${Math.round((item.val/totalRev)*100)}%`:'—'}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={S.card}>
        <p style={S.cardTitle}>Revenue vs Expenses — last 6 months</p>
        <div style={{display:'flex',alignItems:'flex-end',gap:8,height:100,marginTop:12}}>
          {months.map(m=>(
            <div key={m.key} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',gap:2}}>
              <div style={{width:'100%',display:'flex',gap:2,alignItems:'flex-end',height:80}}>
                <div style={{flex:1,background:GOLD,borderRadius:'3px 3px 0 0',height:`${Math.round((m.rev/maxVal)*80)}px`,minHeight:m.rev>0?2:0}}/>
                <div style={{flex:1,background:RED,borderRadius:'3px 3px 0 0',height:`${Math.round((m.exp/maxVal)*80)}px`,minHeight:m.exp>0?2:0,opacity:0.7}}/>
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
   INCOME TAB
   ============================================================ */
function IncomeTab({ sales, pepperHarvests, goatSales, customFarms, flocks }) {
  const allIncome = useMemo(()=>buildIncomeRows({sales,pepperHarvests,goatSales,customFarms,flocks}),[sales,pepperHarvests,goatSales,customFarms,flocks]);
  const total = allIncome.filter(r=>!r.noRevenue).reduce((s,r)=>s+r.amount,0);

  /* unique categories for filter */
  const categories = ['All', ...Array.from(new Set(allIncome.map(r=>r.category)))];
  const [filter, setFilter] = useState('All');
  const visible = filter==='All' ? allIncome : allIncome.filter(r=>r.category===filter);

  return (
    <div style={S.section}>
      <div style={S.grid(4)}>
        <div style={S.card}>
          <p style={S.cardTitle}>Total Income</p>
          <p style={S.cardValue('gold')}>{ghc(total)}</p>
          <p style={S.cardFoot}>{allIncome.filter(r=>!r.noRevenue).length} records</p>
        </div>
        <div style={S.card}>
          <p style={S.cardTitle}>Egg + Poultry</p>
          <p style={S.cardValue()}>{ghc(allIncome.filter(r=>r.category==='Eggs'||r.category==='Poultry sale').reduce((s,r)=>s+r.amount,0))}</p>
        </div>
        <div style={S.card}>
          <p style={S.cardTitle}>Pepper</p>
          <p style={S.cardValue()}>{ghc(allIncome.filter(r=>r.category==='Pepper').reduce((s,r)=>s+r.amount,0))}</p>
        </div>
        <div style={S.card}>
          <p style={S.cardTitle}>Goats</p>
          <p style={S.cardValue()}>{ghc(allIncome.filter(r=>r.category==='Goat sale').reduce((s,r)=>s+r.amount,0))}</p>
        </div>
      </div>

      {/* Category filter */}
      {categories.length>2 && (
        <div style={{display:'flex',gap:6,marginBottom:14,flexWrap:'wrap'}}>
          {categories.map(c=>(
            <button key={c} style={filter===c?S.btnGold:S.btn} onClick={()=>setFilter(c)}>{c}</button>
          ))}
        </div>
      )}

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
            {visible.length===0 && (
              <tr><td colSpan={8} style={S.empty}>
                No income records yet. Sales recorded in Poultry, Bell Pepper Fields, Goats, and My Farms all appear here automatically.
              </td></tr>
            )}
            {visible.map(r=>(
              <tr key={r.id}>
                <td style={S.td}>{fmtDate(r.date)}</td>
                <td style={S.td}>{r.source}</td>
                <td style={S.td}><span style={S.tag(catTone(r.category))}>{r.category}</span></td>
                <td style={S.td}>{r.description}</td>
                <td style={{...S.td,fontFamily:'monospace'}}>{r.qty!=null?num(r.qty,1):'—'}{r.unit&&!r.noRevenue?' '+r.unit:''}</td>
                <td style={{...S.td,fontFamily:'monospace'}}>{r.price!=null?ghc(r.price):'—'}</td>
                <td style={{...S.td,fontFamily:'monospace',color:r.noRevenue?MUTED:GOLD,fontWeight:600}}>
                  {r.noRevenue ? 'no price' : ghc(r.amount)}
                </td>
                <td style={S.td}>{r.buyer}</td>
              </tr>
            ))}
          </tbody>
          {visible.filter(r=>!r.noRevenue).length>0 && (
            <tfoot>
              <tr>
                <td colSpan={6} style={{...S.td,fontWeight:700,color:'#e8e0d0'}}>Total{filter!=='All'?` (${filter})`:''}</td>
                <td style={{...S.td,fontFamily:'monospace',color:GOLD,fontWeight:700}}>
                  {ghc(visible.filter(r=>!r.noRevenue).reduce((s,r)=>s+r.amount,0))}
                </td>
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
   EXPENSES TAB
   ============================================================ */
function ExpensesTab({ expenses }) {
  const rows = useMemo(()=>[...(expenses||[])].sort((a,b)=>new Date(b.date)-new Date(a.date)),[expenses]);
  const total = rows.reduce((s,r)=>s+(Number(r.amount)||0),0);

  const byCategory = useMemo(()=>{
    const m={};
    rows.forEach(r=>{ const k=r.category||'Other'; m[k]=(m[k]||0)+(Number(r.amount)||0); });
    return Object.entries(m).sort((a,b)=>b[1]-a[1]);
  },[rows]);

  return (
    <div style={S.section}>
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

      {byCategory.length>0 && (
        <div style={{...S.card,marginBottom:16}}>
          <p style={S.cardTitle}>By Category</p>
          <div style={{display:'flex',flexDirection:'column',gap:6,marginTop:8}}>
            {byCategory.map(([cat,amt])=>(
              <div key={cat} style={{display:'flex',alignItems:'center',gap:8}}>
                <span style={{width:130,fontSize:12,color:'#e8e0d0',flexShrink:0}}>{cat}</span>
                <div style={{flex:1,height:6,background:BG3,borderRadius:3,overflow:'hidden'}}>
                  <div style={{width:`${total>0?Math.round((amt/total)*100):0}%`,height:'100%',background:GOLD,borderRadius:3}}/>
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
              {['Date','Category','Scope','Description','Amount'].map(h=>(
                <th key={h} style={S.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length===0 && (
              <tr><td colSpan={5} style={S.empty}>
                No expenses yet. Add them in Whole Farm → Expenses and they appear here automatically.
              </td></tr>
            )}
            {rows.map(r=>(
              <tr key={r.id}>
                <td style={S.td}>{fmtDate(r.date)}</td>
                <td style={S.td}><span style={S.tag('gold')}>{r.category||'—'}</span></td>
                <td style={{...S.td,color:MUTED,fontSize:12}}>{r.scope||'—'}</td>
                <td style={S.td}>{r.description||r.note||'—'}</td>
                <td style={{...S.td,fontFamily:'monospace',color:'#e07070',fontWeight:600}}>{ghc(r.amount)}</td>
              </tr>
            ))}
          </tbody>
          {rows.length>0 && (
            <tfoot>
              <tr>
                <td colSpan={4} style={{...S.td,fontWeight:700,color:'#e8e0d0'}}>Total</td>
                <td style={{...S.td,fontFamily:'monospace',color:'#e07070',fontWeight:700}}>{ghc(total)}</td>
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
function ProfitLossTab({ sales, expenses, pepperHarvests, goatSales, customFarms, flocks }) {
  const [period, setPeriod] = useState('all');

  const periods = [
    {id:'all',label:'All time'},
    {id:'thismonth',label:'This month'},
    {id:'lastmonth',label:'Last month'},
    {id:'thisyear',label:'This year'},
  ];

  function inPeriod(date) {
    if (!date) return false;
    const now = todayISO();
    const thisMonth = now.slice(0,7);
    const lmd = new Date(now.slice(0,4),Number(now.slice(5,7))-2,1);
    const lastMonth = `${lmd.getFullYear()}-${String(lmd.getMonth()+1).padStart(2,'0')}`;
    if (period==='all') return true;
    if (period==='thismonth') return date.startsWith(thisMonth);
    if (period==='lastmonth') return date.startsWith(lastMonth);
    if (period==='thisyear') return date.startsWith(now.slice(0,4));
    return true;
  }

  const allIncome = useMemo(()=>buildIncomeRows({
    sales:(sales||[]).filter(r=>inPeriod(r.date)),
    pepperHarvests:(pepperHarvests||[]).filter(r=>inPeriod(r.date)),
    goatSales:(goatSales||[]).filter(r=>inPeriod(r.date)),
    customFarms:(customFarms||[]).map(f=>({...f,
      salesLog:(f.salesLog||[]).filter(r=>inPeriod(r.date)),
      harvests:(f.harvests||[]).filter(r=>inPeriod(r.date)),
    })),
    flocks,
  }),[sales,pepperHarvests,goatSales,customFarms,flocks,period]);

  const filteredExp = (expenses||[]).filter(r=>inPeriod(r.date));

  /* group income by category */
  const incomeByCategory = {};
  allIncome.filter(r=>!r.noRevenue).forEach(r=>{ const k=r.category; incomeByCategory[k]=(incomeByCategory[k]||0)+r.amount; });
  const totalRev = Object.values(incomeByCategory).reduce((a,v)=>a+v,0);

  /* group expenses by category */
  const expByCategory = {};
  filteredExp.forEach(e=>{ const k=e.category||'Other'; expByCategory[k]=(expByCategory[k]||0)+(Number(e.amount)||0); });
  const totalExp = filteredExp.reduce((a,e)=>a+(Number(e.amount)||0),0);

  const grossProfit = totalRev - totalExp;

  return (
    <div style={S.section}>
      <div style={{display:'flex',gap:6,marginBottom:16,flexWrap:'wrap'}}>
        {periods.map(p=>(
          <button key={p.id} style={period===p.id?S.btnGold:S.btn} onClick={()=>setPeriod(p.id)}>{p.label}</button>
        ))}
      </div>

      <div style={S.card}>
        <p style={{fontSize:15,fontWeight:700,color:'#f5ead8',margin:'0 0 16px'}}>
          AI Farms — Profit & Loss Statement
        </p>

        <p style={{fontSize:11,textTransform:'uppercase',letterSpacing:'0.1em',color:GOLD,margin:'0 0 8px'}}>Revenue</p>
        {Object.entries(incomeByCategory).map(([cat,amt])=>(
          <div key={cat} style={{display:'flex',justifyContent:'space-between',padding:'5px 0',borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
            <span style={{fontSize:13,color:'#e8e0d0',paddingLeft:12}}>{cat}</span>
            <span style={{fontSize:13,fontFamily:'monospace',color:GOLD}}>{ghc(amt)}</span>
          </div>
        ))}
        {Object.keys(incomeByCategory).length===0 && (
          <p style={{fontSize:12,color:MUTED,paddingLeft:12}}>No revenue in this period</p>
        )}
        <div style={{display:'flex',justifyContent:'space-between',padding:'8px 0',marginTop:4,borderTop:`1px solid ${BORDER}`}}>
          <span style={{fontSize:14,fontWeight:700,color:'#f5ead8'}}>Total Revenue</span>
          <span style={{fontSize:14,fontFamily:'monospace',fontWeight:700,color:GOLD}}>{ghc(totalRev)}</span>
        </div>

        <hr style={S.divider}/>

        <p style={{fontSize:11,textTransform:'uppercase',letterSpacing:'0.1em',color:'#e07070',margin:'0 0 8px'}}>Expenses</p>
        {Object.entries(expByCategory).sort((a,b)=>b[1]-a[1]).map(([cat,amt])=>(
          <div key={cat} style={{display:'flex',justifyContent:'space-between',padding:'5px 0',borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
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

        <div style={{display:'flex',justifyContent:'space-between',padding:'10px 12px',background:grossProfit>=0?'rgba(122,154,102,0.08)':'rgba(192,57,43,0.08)',borderRadius:6}}>
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
export default function FinancialsModule({ data, sales, expenses, pepperHarvests, goatSales, customFarms, flocks }) {
  const [tab, setTab] = useState('overview');

  const _sales          = sales || [];
  const _expenses       = expenses || [];
  const _pepperHarvests = pepperHarvests || [];
  const _goatSales      = goatSales || [];
  const _customFarms    = customFarms || [];
  const _flocks         = flocks || (data?.flocks) || [];

  const TABS = [
    {id:'overview', label:'📊 Overview'},
    {id:'income',   label:'💵 Income'},
    {id:'expenses', label:'📤 Expenses'},
    {id:'pnl',      label:'📋 Profit & Loss'},
  ];

  return (
    <div style={S.wrap}>
      <div style={S.header}>
        <p style={S.eyebrow}>AI Farms</p>
        <h1 style={S.title}>Financials</h1>
        <p style={S.sub}>Live from your farm records — poultry, pepper, goats and My Farms, all in one place.</p>
      </div>

      <nav style={S.tabs}>
        {TABS.map(t=>(
          <button key={t.id} style={S.tab(tab===t.id)} onClick={()=>setTab(t.id)}>{t.label}</button>
        ))}
      </nav>

      {tab==='overview' && (
        <OverviewTab
          sales={_sales} expenses={_expenses}
          pepperHarvests={_pepperHarvests} goatSales={_goatSales}
          customFarms={_customFarms} flocks={_flocks}
        />
      )}
      {tab==='income' && (
        <IncomeTab
          sales={_sales} pepperHarvests={_pepperHarvests}
          goatSales={_goatSales} customFarms={_customFarms} flocks={_flocks}
        />
      )}
      {tab==='expenses' && <ExpensesTab expenses={_expenses} />}
      {tab==='pnl' && (
        <ProfitLossTab
          sales={_sales} expenses={_expenses}
          pepperHarvests={_pepperHarvests} goatSales={_goatSales}
          customFarms={_customFarms} flocks={_flocks}
        />
      )}
    </div>
  );
}
