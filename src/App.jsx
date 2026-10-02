import { useState, useMemo } from 'react';

/* ============================================================
   AI Farms — Financials Module  v3.0
   One tab per farm section, each with Income / Expenses / P&L.
   Buyer / detail columns hidden by default, toggleable.
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

/* ---- helpers ---- */
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
  if (v===null||v===undefined||v===''||isNaN(Number(v))) return '—';
  return Number(v).toLocaleString('en-GB',{maximumFractionDigits:d,minimumFractionDigits:d});
}
function ghc(v) {
  const n = Number(v);
  if (isNaN(n)) return '—';
  return `GH₵ ${n.toLocaleString('en-GB',{maximumFractionDigits:2,minimumFractionDigits:2})}`;
}
function newId() { return Math.random().toString(36).slice(2,10); }

/* ---- styles ---- */
const S = {
  wrap:  { background:BG1, minHeight:'100vh', color:'#e8e0d0', fontFamily:'inherit' },
  hdr:   { padding:'18px 20px 0', borderBottom:`1px solid ${BORDER}` },
  eye:   { fontSize:11, textTransform:'uppercase', letterSpacing:'0.12em', color:GOLD, margin:'0 0 3px' },
  ttl:   { fontSize:22, fontWeight:700, color:'#f5ead8', margin:'0 0 14px' },

  /* outer tabs (farm sections) */
  outerTabs: {
    display:'flex', gap:0, background:BG2,
    borderBottom:`1px solid ${BORDER}`, overflowX:'auto', flexShrink:0,
  },
  outerTab: (a) => ({
    padding:'11px 16px', fontSize:13, fontWeight:600, border:'none', cursor:'pointer',
    background: a ? BG3 : 'transparent',
    borderBottom: a ? `2px solid ${GOLD}` : '2px solid transparent',
    color: a ? GOLD : MUTED, whiteSpace:'nowrap', transition:'color .15s, background .15s',
  }),

  /* inner sub-tabs (Income / Expenses / P&L) */
  innerTabs: {
    display:'flex', gap:4, padding:'12px 20px 0', borderBottom:`1px solid ${BORDER}`,
  },
  innerTab: (a) => ({
    padding:'7px 14px', fontSize:12, fontWeight:600, border:'none', cursor:'pointer',
    background:'transparent',
    borderBottom: a ? `2px solid ${GOLD}` : '2px solid transparent',
    color: a ? GOLD : MUTED, whiteSpace:'nowrap',
  }),

  sec:  { padding:'16px 20px' },
  grid: (n) => ({ display:'grid', gridTemplateColumns:`repeat(${n},1fr)`, gap:10, marginBottom:16 }),
  card: { background:BG2, border:`1px solid ${BORDER}`, borderRadius:8, padding:'12px 14px' },
  ct:   { fontSize:11, textTransform:'uppercase', letterSpacing:'0.1em', color:MUTED, margin:'0 0 5px' },
  cv:   (tone) => ({
    fontSize:20, fontWeight:700, margin:'0 0 2px',
    color: tone==='green'?GREEN : tone==='red'?RED : GOLD,
  }),
  cf:   { fontSize:11, color:MUTED, margin:0 },

  tbl:  { width:'100%', borderCollapse:'collapse', fontSize:13 },
  th:   { textAlign:'left', padding:'7px 10px', fontSize:11, textTransform:'uppercase',
          letterSpacing:'0.08em', color:MUTED, borderBottom:`1px solid ${BORDER}`, background:BG2 },
  td:   { padding:'8px 10px', borderBottom:`1px solid rgba(255,255,255,0.05)`, verticalAlign:'middle' },

  btn:  { padding:'6px 12px', borderRadius:5, border:`1px solid ${GOLD}`, background:'transparent',
          color:GOLD, fontSize:12, fontWeight:600, cursor:'pointer' },
  btnG: { padding:'6px 12px', borderRadius:5, border:'none', background:GOLD,
          color:'#1a1a1a', fontSize:12, fontWeight:700, cursor:'pointer' },
  btnS: { padding:'5px 10px', borderRadius:5, border:`1px solid ${BORDER}`, background:'transparent',
          color:MUTED, fontSize:11, cursor:'pointer' },

  tag:  (c) => ({
    display:'inline-block', padding:'1px 7px', borderRadius:10, fontSize:11,
    background: c==='green'?'rgba(122,154,102,0.15)':c==='red'?'rgba(192,57,43,0.15)':'rgba(212,165,55,0.12)',
    color: c==='green'?GREEN:c==='red'?'#e07070':GOLD,
  }),
  empty:{ textAlign:'center', padding:'32px 16px', color:MUTED, fontSize:13 },
  div:  { border:'none', borderTop:`1px solid ${BORDER}`, margin:'14px 0' },

  toggleRow: { display:'flex', justifyContent:'flex-end', marginBottom:8 },
};

/* ============================================================
   REUSABLE: mini P&L block
   ============================================================ */
function MiniPL({ revenue, expenses, label }) {
  const profit = revenue - expenses;
  return (
    <div style={{...S.card, marginTop:16}}>
      <p style={{fontSize:13,fontWeight:700,color:'#f5ead8',margin:'0 0 12px'}}>
        {label || 'Profit & Loss'}
      </p>
      {[
        {l:'Revenue', v:revenue, c:GOLD},
        {l:'Expenses', v:expenses, c:'#e07070'},
      ].map(r=>(
        <div key={r.l} style={{display:'flex',justifyContent:'space-between',padding:'5px 0',borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
          <span style={{fontSize:13,color:'#e8e0d0',paddingLeft:8}}>{r.l}</span>
          <span style={{fontSize:13,fontFamily:'monospace',color:r.c}}>{ghc(r.v)}</span>
        </div>
      ))}
      <div style={{display:'flex',justifyContent:'space-between',padding:'9px 8px',marginTop:6,
        background:profit>=0?'rgba(122,154,102,0.08)':'rgba(192,57,43,0.08)',borderRadius:6}}>
        <span style={{fontSize:14,fontWeight:700,color:'#f5ead8'}}>{profit>=0?'Net Profit':'Net Loss'}</span>
        <span style={{fontSize:14,fontFamily:'monospace',fontWeight:700,color:profit>=0?GREEN:RED}}>
          {ghc(Math.abs(profit))}
        </span>
      </div>
      {revenue>0&&<p style={{fontSize:11,color:MUTED,margin:'6px 0 0',textAlign:'right'}}>
        Margin: {num(profit/revenue*100,1)}%
      </p>}
    </div>
  );
}

/* ============================================================
   REUSABLE: income table with hideable detail columns
   ============================================================ */
function IncomeTable({ rows, detailCols = [], emptyMsg }) {
  const [showDetail, setShowDetail] = useState(false);
  const total = rows.reduce((s,r)=>s+(Number(r.amount)||0),0);

  return (
    <>
      <div style={S.toggleRow}>
        <button style={S.btnS} onClick={()=>setShowDetail(v=>!v)}>
          {showDetail ? '🙈 Hide details' : '👁 Show details'}
        </button>
      </div>
      <div style={{overflowX:'auto'}}>
        <table style={S.tbl}>
          <thead>
            <tr>
              <th style={S.th}>Date</th>
              <th style={S.th}>Description</th>
              {showDetail && detailCols.map(c=><th key={c.key} style={S.th}>{c.label}</th>)}
              <th style={{...S.th,textAlign:'right'}}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {rows.length===0 && (
              <tr><td colSpan={showDetail?3+detailCols.length:3} style={S.empty}>{emptyMsg||'No records yet.'}</td></tr>
            )}
            {rows.map(r=>(
              <tr key={r.id}>
                <td style={S.td}>{fmtDate(r.date)}</td>
                <td style={S.td}>{r.description}</td>
                {showDetail && detailCols.map(c=>(
                  <td key={c.key} style={{...S.td,color:MUTED,fontSize:12}}>{r[c.key]||'—'}</td>
                ))}
                <td style={{...S.td,fontFamily:'monospace',color:GOLD,fontWeight:600,textAlign:'right'}}>
                  {r.noPrice ? <span style={{color:MUTED}}>no price</span> : ghc(r.amount)}
                </td>
              </tr>
            ))}
          </tbody>
          {rows.filter(r=>!r.noPrice).length>0&&(
            <tfoot>
              <tr>
                <td colSpan={showDetail?2+detailCols.length:2} style={{...S.td,fontWeight:700,color:'#e8e0d0'}}>Total</td>
                <td style={{...S.td,fontFamily:'monospace',color:GOLD,fontWeight:700,textAlign:'right'}}>{ghc(total)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </>
  );
}

/* ============================================================
   REUSABLE: expenses table with hideable detail columns
   ============================================================ */
function ExpensesTable({ rows, emptyMsg }) {
  const [showDetail, setShowDetail] = useState(false);
  const total = rows.reduce((s,r)=>s+(Number(r.amount)||0),0);

  const byCategory = useMemo(()=>{
    const m={};
    rows.forEach(r=>{ const k=r.category||'Other'; m[k]=(m[k]||0)+(Number(r.amount)||0); });
    return Object.entries(m).sort((a,b)=>b[1]-a[1]);
  },[rows]);

  return (
    <>
      {byCategory.length>1&&(
        <div style={{...S.card,marginBottom:12}}>
          <p style={S.ct}>By category</p>
          <div style={{display:'flex',flexDirection:'column',gap:5,marginTop:6}}>
            {byCategory.map(([cat,amt])=>(
              <div key={cat} style={{display:'flex',alignItems:'center',gap:8}}>
                <span style={{width:120,fontSize:12,color:'#e8e0d0',flexShrink:0}}>{cat}</span>
                <div style={{flex:1,height:5,background:BG3,borderRadius:3,overflow:'hidden'}}>
                  <div style={{width:`${total>0?Math.round((amt/total)*100):0}%`,height:'100%',background:GOLD,borderRadius:3}}/>
                </div>
                <span style={{width:80,fontSize:12,fontFamily:'monospace',color:GOLD,textAlign:'right',flexShrink:0}}>{ghc(amt)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      <div style={S.toggleRow}>
        <button style={S.btnS} onClick={()=>setShowDetail(v=>!v)}>
          {showDetail ? '🙈 Hide details' : '👁 Show details'}
        </button>
      </div>
      <div style={{overflowX:'auto'}}>
        <table style={S.tbl}>
          <thead>
            <tr>
              <th style={S.th}>Date</th>
              <th style={S.th}>Category</th>
              {showDetail&&<th style={S.th}>Description</th>}
              {showDetail&&<th style={S.th}>Scope</th>}
              <th style={{...S.th,textAlign:'right'}}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {rows.length===0&&(
              <tr><td colSpan={showDetail?5:3} style={S.empty}>{emptyMsg||'No expenses yet.'}</td></tr>
            )}
            {rows.map(r=>(
              <tr key={r.id}>
                <td style={S.td}>{fmtDate(r.date)}</td>
                <td style={S.td}><span style={S.tag('gold')}>{r.category||'—'}</span></td>
                {showDetail&&<td style={{...S.td,color:MUTED,fontSize:12}}>{r.description||r.note||'—'}</td>}
                {showDetail&&<td style={{...S.td,color:MUTED,fontSize:12}}>{r.scope||'—'}</td>}
                <td style={{...S.td,fontFamily:'monospace',color:'#e07070',fontWeight:600,textAlign:'right'}}>{ghc(r.amount)}</td>
              </tr>
            ))}
          </tbody>
          {rows.length>0&&(
            <tfoot>
              <tr>
                <td colSpan={showDetail?4:2} style={{...S.td,fontWeight:700,color:'#e8e0d0'}}>Total</td>
                <td style={{...S.td,fontFamily:'monospace',color:'#e07070',fontWeight:700,textAlign:'right'}}>{ghc(total)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </>
  );
}

/* ============================================================
   OVERVIEW TAB — whole-farm summary
   ============================================================ */
function OverviewTab({ sections }) {
  const totalRev = sections.reduce((s,sec)=>s+sec.revenue,0);
  const totalExp = sections.reduce((s,sec)=>s+sec.expenses,0);
  const netProfit = totalRev - totalExp;

  /* 6-month chart across all sections */
  const months = useMemo(()=>{
    const result=[];
    for(let i=5;i>=0;i--){
      const d=new Date(); d.setMonth(d.getMonth()-i);
      const key=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
      const label=d.toLocaleDateString('en-GB',{month:'short',year:'2-digit'});
      const rev=sections.reduce((a,sec)=>a+sec.incomeRows.filter(r=>r.date&&r.date.startsWith(key)&&!r.noPrice).reduce((b,r)=>b+(Number(r.amount)||0),0),0);
      const exp=sections.reduce((a,sec)=>a+sec.expenseRows.filter(r=>r.date&&r.date.startsWith(key)).reduce((b,r)=>b+(Number(r.amount)||0),0),0);
      result.push({key,label,rev,exp});
    }
    return result;
  },[sections]);
  const maxVal=Math.max(...months.map(m=>Math.max(m.rev,m.exp)),1);

  return (
    <div style={S.sec}>
      {/* KPI row */}
      <div style={S.grid(3)}>
        <div style={S.card}>
          <p style={S.ct}>Total Revenue</p>
          <p style={S.cv('gold')}>{ghc(totalRev)}</p>
          <p style={S.cf}>All farm sections</p>
        </div>
        <div style={S.card}>
          <p style={S.ct}>Total Expenses</p>
          <p style={S.cv('red')}>{ghc(totalExp)}</p>
        </div>
        <div style={S.card}>
          <p style={S.ct}>Net {netProfit>=0?'Profit':'Loss'}</p>
          <p style={S.cv(netProfit>=0?'green':'red')}>{ghc(Math.abs(netProfit))}</p>
          <p style={S.cf}>{totalRev>0?`${num(netProfit/totalRev*100,1)}% margin`:''}</p>
        </div>
      </div>

      {/* Per-section summary cards */}
      <p style={{...S.ct,margin:'4px 0 10px'}}>By farm section</p>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(180px,1fr))',gap:10,marginBottom:16}}>
        {sections.map(sec=>(
          <div key={sec.id} style={S.card}>
            <p style={{...S.ct,margin:'0 0 6px'}}>{sec.icon} {sec.label}</p>
            <p style={{fontSize:15,fontWeight:700,color:GOLD,margin:'0 0 2px'}}>{ghc(sec.revenue)}</p>
            <p style={{fontSize:11,color:'#e07070',margin:'0 0 2px'}}>Exp: {ghc(sec.expenses)}</p>
            <p style={{fontSize:12,fontWeight:600,color:sec.revenue-sec.expenses>=0?GREEN:RED}}>
              {sec.revenue-sec.expenses>=0?'+':''}{ghc(sec.revenue-sec.expenses)}
            </p>
          </div>
        ))}
      </div>

      {/* 6-month bar chart */}
      <div style={S.card}>
        <p style={S.ct}>Revenue vs Expenses — last 6 months</p>
        <div style={{display:'flex',alignItems:'flex-end',gap:8,height:100,marginTop:12}}>
          {months.map(m=>(
            <div key={m.key} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',gap:2}}>
              <div style={{width:'100%',display:'flex',gap:2,alignItems:'flex-end',height:80}}>
                <div style={{flex:1,background:GOLD,borderRadius:'3px 3px 0 0',
                  height:`${Math.round((m.rev/maxVal)*80)}px`,minHeight:m.rev>0?2:0}}/>
                <div style={{flex:1,background:RED,opacity:0.7,borderRadius:'3px 3px 0 0',
                  height:`${Math.round((m.exp/maxVal)*80)}px`,minHeight:m.exp>0?2:0}}/>
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
   SECTION TAB — income + expenses + P&L for one farm section
   ============================================================ */
function SectionTab({ section, allExpenses }) {
  const [sub, setSub] = useState('income');

  const { incomeRows, expenseRows, revenue, expenses, detailCols, emptyIncomeMsg } = section;

  return (
    <>
      {/* inner sub-tabs */}
      <div style={S.innerTabs}>
        {[
          {id:'income',   label:'💵 Income'},
          {id:'expenses', label:'📤 Expenses'},
          {id:'pnl',      label:'📋 P&L'},
        ].map(t=>(
          <button key={t.id} style={S.innerTab(sub===t.id)} onClick={()=>setSub(t.id)}>{t.label}</button>
        ))}
      </div>

      <div style={S.sec}>
        {/* KPI row always visible */}
        <div style={S.grid(3)}>
          <div style={S.card}>
            <p style={S.ct}>Revenue</p>
            <p style={S.cv('gold')}>{ghc(revenue)}</p>
            <p style={S.cf}>{incomeRows.filter(r=>!r.noPrice).length} sales</p>
          </div>
          <div style={S.card}>
            <p style={S.ct}>Expenses</p>
            <p style={S.cv('red')}>{ghc(expenses)}</p>
            <p style={S.cf}>{expenseRows.length} records</p>
          </div>
          <div style={S.card}>
            <p style={S.ct}>Net {revenue-expenses>=0?'Profit':'Loss'}</p>
            <p style={S.cv(revenue-expenses>=0?'green':'red')}>{ghc(Math.abs(revenue-expenses))}</p>
            <p style={S.cf}>{revenue>0?`${num((revenue-expenses)/revenue*100,1)}% margin`:''}</p>
          </div>
        </div>

        {sub==='income' && (
          <IncomeTable
            rows={incomeRows}
            detailCols={detailCols}
            emptyMsg={emptyIncomeMsg}
          />
        )}
        {sub==='expenses' && (
          <ExpensesTable
            rows={expenseRows}
            emptyMsg={`No expenses tagged to ${section.label} yet.`}
          />
        )}
        {sub==='pnl' && (
          <MiniPL revenue={revenue} expenses={expenses} label={`${section.icon} ${section.label} — Profit & Loss`} />
        )}
      </div>
    </>
  );
}

/* ============================================================
   MAIN COMPONENT
   ============================================================ */
export default function FinancialsModule({ data, sales, expenses, pepperHarvests, goatSales, customFarms, flocks }) {
  const [outerTab, setOuterTab] = useState('overview');

  /* ---- pull everything directly from data (authoritative source) ---- */
  const d             = data || {};
  const _sales        = d.sales            || sales            || [];
  const _expenses     = d.expenses         || expenses         || [];
  const _pepperHarvs  = d.pepper?.harvests || pepperHarvests   || [];
  const _goatSales    = d.goats?.sales     || goatSales        || [];
  const _customFarms  = d.customFarms      || customFarms      || [];
  const _flocks       = d.flocks           || flocks           || [];

  /* ---- expenses partitioned by scope ---- */
  /* The expense scope field (if present) may say 'Poultry', 'Pepper', 'Goats', etc.
     If no scope, we put it in "Whole Farm" bucket and include it in the overview total
     but not in a specific section.                                               */
  function expFor(scopeKeywords) {
    return _expenses.filter(e => {
      const sc = (e.scope || '').toLowerCase();
      return scopeKeywords.some(kw => sc.includes(kw));
    }).sort((a,b)=>new Date(b.date)-new Date(a.date));
  }
  const poultryExp  = expFor(['poultry','layer','broiler','bird','egg','flock','chick']);
  const pepperExp   = expFor(['pepper','crop','field','agro','spray']);
  const goatExp     = expFor(['goat']);
  // "whole farm" = any expense not matched above
  const matchedIds  = new Set([...poultryExp,...pepperExp,...goatExp].map(e=>e.id));
  const wholeExp    = _expenses.filter(e=>!matchedIds.has(e.id)).sort((a,b)=>new Date(b.date)-new Date(a.date));

  /* ---- POULTRY section ---- */
  const poultryIncomeRows = useMemo(()=>{
    return _sales.map(s=>{
      const flock = _flocks.find(f=>f.id===s.flockId);
      const isEgg = (s.item||'').toLowerCase().includes('egg');
      return {
        id: s.id||newId(),
        date: s.date,
        description: `${s.item||'Poultry sale'}${flock?' — '+flock.flockName:''}`,
        amount: Number(s.amount)||0,
        buyer: s.buyer||'—',
        qty: s.quantity ? `${num(s.quantity,1)} ${(s.item||'').includes('crates')?'crates':'pcs'}` : '—',
        unitPrice: s.unitPrice ? ghc(s.unitPrice) : '—',
        flock: flock?.flockName||'—',
      };
    }).sort((a,b)=>new Date(b.date)-new Date(a.date));
  },[_sales,_flocks]);

  /* ---- PEPPER section ---- */
  const pepperIncomeRows = useMemo(()=>{
    return _pepperHarvs.map(h=>{
      const kg  = Number(h.weightKg)||0;
      const ppk = Number(h.pricePerKg)||0;
      return {
        id: h.id||newId(),
        date: h.date,
        description: `${num(kg,1)} kg${h.grade?' ('+h.grade+')':''}${h.fieldName?' — '+h.fieldName:''}`,
        amount: kg*ppk,
        buyer: h.buyer||'—',
        qty: `${num(kg,1)} kg`,
        unitPrice: ppk ? ghc(ppk)+'/kg' : '—',
        field: h.fieldName||'—',
        noPrice: !ppk,
      };
    }).sort((a,b)=>new Date(b.date)-new Date(a.date));
  },[_pepperHarvs]);

  /* ---- GOATS section ---- */
  const goatIncomeRows = useMemo(()=>{
    return _goatSales.map(s=>({
      id: s.id||newId(),
      date: s.date,
      description: `Goat sale${s.weightKg?' ('+num(s.weightKg,1)+' kg)':''}`,
      amount: Number(s.price)||0,   // revenue field is `price`
      buyer: s.buyer||'—',
      weight: s.weightKg ? num(s.weightKg,1)+' kg' : '—',
      notes: s.notes||'—',
    })).sort((a,b)=>new Date(b.date)-new Date(a.date));
  },[_goatSales]);

  /* ---- MY FARMS custom sections ---- */
  const customSections = useMemo(()=>{
    return _customFarms.map(farm=>{
      let incomeRows = [];
      if (farm.category==='livestock') {
        incomeRows = (farm.salesLog||[]).map(s=>({
          id: s.id||newId(),
          date: s.date,
          description: s.notes||`${farm.name} sale`,
          amount: Number(s.amount)||0,
          buyer: s.buyer||'—',
          qty: s.quantity||'—',
        }));
      } else {
        incomeRows = (farm.harvests||[]).map(h=>({
          id: h.id||newId(),
          date: h.date,
          description: `Harvest${h.quantityKg?' — '+num(h.quantityKg,1)+' kg':''}${h.notes?' ('+h.notes+')':''}`,
          amount: 0,
          buyer: '—',
          noPrice: true,
        }));
      }
      const expRows = expFor([farm.name.toLowerCase()]);
      return {
        id: farm.id,
        label: farm.name,
        icon: farm.category==='livestock'?'🐾':'🌾',
        incomeRows: incomeRows.sort((a,b)=>new Date(b.date)-new Date(a.date)),
        expenseRows: expRows,
        revenue: incomeRows.reduce((s,r)=>s+(r.noPrice?0:r.amount),0),
        expenses: expRows.reduce((s,r)=>s+(Number(r.amount)||0),0),
        detailCols: farm.category==='livestock'
          ? [{key:'buyer',label:'Buyer'},{key:'qty',label:'Qty'}]
          : [{key:'buyer',label:'Buyer'}],
        emptyIncomeMsg: farm.category==='livestock'
          ? `No sales logged for ${farm.name} yet.`
          : `No harvests logged for ${farm.name} yet. Crop farms don’t record a sale price — log revenue through Whole Farm expenses if needed.`,
        isCustom: true,
        farmId: farm.id,
      };
    });
  },[_customFarms,_expenses]);

  /* ---- whole-farm expenses section ---- */
  const wholeFarmSection = {
    id: 'wholefarm',
    label: 'Whole Farm',
    icon: '🏠',
    incomeRows: [],
    expenseRows: wholeExp,
    revenue: 0,
    expenses: wholeExp.reduce((s,r)=>s+(Number(r.amount)||0),0),
    detailCols: [],
    emptyIncomeMsg: '',
  };

  /* ---- assemble sections list ---- */
  const builtInSections = [
    {
      id:'poultry', label:'Poultry', icon:'🐔',
      incomeRows: poultryIncomeRows,
      expenseRows: poultryExp,
      revenue: poultryIncomeRows.reduce((s,r)=>s+r.amount,0),
      expenses: poultryExp.reduce((s,r)=>s+(Number(r.amount)||0),0),
      detailCols:[{key:'flock',label:'Flock'},{key:'qty',label:'Qty'},{key:'unitPrice',label:'Unit price'},{key:'buyer',label:'Buyer'}],
      emptyIncomeMsg:'No poultry or egg sales recorded yet.',
    },
    {
      id:'pepper', label:'Bell Pepper', icon:'🌶',
      incomeRows: pepperIncomeRows,
      expenseRows: pepperExp,
      revenue: pepperIncomeRows.reduce((s,r)=>s+(r.noPrice?0:r.amount),0),
      expenses: pepperExp.reduce((s,r)=>s+(Number(r.amount)||0),0),
      detailCols:[{key:'field',label:'Field'},{key:'qty',label:'Weight'},{key:'unitPrice',label:'Price/kg'},{key:'buyer',label:'Buyer'}],
      emptyIncomeMsg:'No pepper harvests recorded yet.',
    },
    {
      id:'goats', label:'Goats', icon:'🐐',
      incomeRows: goatIncomeRows,
      expenseRows: goatExp,
      revenue: goatIncomeRows.reduce((s,r)=>s+r.amount,0),
      expenses: goatExp.reduce((s,r)=>s+(Number(r.amount)||0),0),
      detailCols:[{key:'weight',label:'Weight'},{key:'buyer',label:'Buyer'},{key:'notes',label:'Notes'}],
      emptyIncomeMsg:'No goat sales recorded yet.',
    },
  ];

  const allSections = [...builtInSections, ...customSections, wholeFarmSection];

  /* ---- outer tab list ---- */
  const outerTabList = [
    {id:'overview', label:'📊 Overview'},
    ...allSections.map(s=>({id:s.id, label:`${s.icon} ${s.label}`})),
  ];

  const activeSection = allSections.find(s=>s.id===outerTab);

  return (
    <div style={S.wrap}>
      <div style={S.hdr}>
        <p style={S.eye}>AI Farms</p>
        <h1 style={S.ttl}>Financials</h1>
      </div>

      {/* Outer tabs */}
      <nav style={S.outerTabs}>
        {outerTabList.map(t=>(
          <button key={t.id} style={S.outerTab(outerTab===t.id)} onClick={()=>setOuterTab(t.id)}>
            {t.label}
          </button>
        ))}
      </nav>

      {outerTab==='overview' && <OverviewTab sections={allSections}/>}
      {activeSection && outerTab!=='overview' && (
        <SectionTab section={activeSection} allExpenses={_expenses}/>
      )}
    </div>
  );
}
