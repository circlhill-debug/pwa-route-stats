// Charts + visualization helpers: dashboard charts, monthly glance, mixviz, office compare, quick filter.
import { DateTime, ZONE, dowIndex, startOfWeekMonday, endOfWeekSunday } from '../utils/date.js';
import { ensureWeeklyBaselines, getWeeklyBaselines, computeAnchorBaselines } from '../utils/storage.js';

export function createCharts({
  getFlags,
  filterRowsForView,
  vacGlyph,
  routeAdjustedHours,
  boxholderAdjMinutes,
  getLastNonEmptyWeek,
  buildDayCompare
}) {
  let dowChart;
  let parcelsChart;
  let lettersChart;

  function destroyCharts(){
    [dowChart, parcelsChart, lettersChart].forEach(c => {
      if (c && typeof c.destroy === 'function') {
        try{ c.destroy(); }catch(_){ /* ignore */ }
      }
    });
    dowChart = parcelsChart = lettersChart = null;
  }

  function enableChartTap(chart, canvas){
    if (!chart || !canvas) return;
    const handler = (ev)=>{
      try{
        const rect = canvas.getBoundingClientRect();
        const touch = ev.touches && ev.touches[0];
        const cx = touch ? touch.clientX : ev.clientX;
        const cy = touch ? touch.clientY : ev.clientY;
        const x = cx - rect.left;
        const y = cy - rect.top;
        const points = chart.getElementsAtEventForMode(ev, 'nearest', { intersect:false }, true);
        if (points && points.length){
          const active = [{ datasetIndex: points[0].datasetIndex, index: points[0].index }];
          if (chart.setActiveElements) chart.setActiveElements(active);
          if (chart.tooltip && chart.tooltip.setActiveElements) chart.tooltip.setActiveElements(active, { x, y });
          chart.update();
        }
      }catch(_){ /* ignore */ }
    };
    ['click','touchstart','pointerdown'].forEach(type => {
      canvas.addEventListener(type, handler, { passive: true });
    });
  }

  function buildCharts(rows){
    rows = filterRowsForView(rows || []);
    if (!window.Chart){
      console.warn('Chart.js missing — skipping charts');
      return;
    }
    destroyCharts();
    const workRows = rows.filter(r=> r.status !== 'off');
    const byDow = Array.from({length:7}, () => ({ h:0, c:0 }));
    for (const r of workRows){
      const h = Number(r.hours || 0);
      if (h > 0){
        const d = dowIndex(r.work_date);
        byDow[d].h += h;
        byDow[d].c++;
      }
    }
    const dowLabels = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
    const order = [1,2,3,4,5,6,0];
    const perDow = byDow.map(x=> x.c ? +(x.h/x.c).toFixed(2) : 0);
    const dowData = order.map(i => perDow[i]);
    dowChart = new Chart(document.getElementById('dowChart'), {
      type:'bar',
      data:{ labels:dowLabels, datasets:[{ label:'Avg Total Hours', data:dowData }] },
      options:{ responsive:true, plugins:{ legend:{ display:false } } }
    });

    const sortedWork = [...workRows].sort((a,b)=> a.work_date.localeCompare(b.work_date));
    const labels = sortedWork.map(r=> r.work_date);
    const parcelsCanvas = document.getElementById('parcelsChart');
    parcelsChart = new Chart(parcelsCanvas, {
      type:'line',
      data:{
        labels,
        datasets:[{ label:'Parcels', data: sortedWork.map(r=> +r.parcels||0), pointRadius:3, pointHoverRadius:8, pointHitRadius:16 }]
      },
      options:{
        responsive:true,
        interaction:{ mode:'nearest', intersect:false },
        events:['mousemove','mouseout','click','touchstart','touchmove','touchend'],
        animation:{ duration:0 },
        plugins:{
          legend:{ display:false },
          tooltip:{
            animation:{ duration:0 },
            callbacks:{
              title:(items)=>{
                const iso = items?.[0]?.label;
                if (!iso) return '';
                const d = DateTime.fromISO(iso, { zone: ZONE });
                return d.toFormat('cccc • MMM d, yyyy') + (vacGlyph ? vacGlyph(iso) : '');
              }
            }
          }
        },
        scales:{
          x:{
            ticks:{
              maxRotation:0,
              autoSkip:true,
              maxTicksLimit:8,
              callback:function(value){
                const iso = this.getLabelForValue(value);
                const d = DateTime.fromISO(iso, { zone: ZONE });
                return [d.toFormat('ccc'), d.toFormat('M/d')];
              }
            }
          }
        }
      }
    });
    const lettersCanvas = document.getElementById('lettersChart');
    lettersChart = new Chart(lettersCanvas, {
      type:'line',
      data:{
        labels,
        datasets:[{ label:'Letters', data: sortedWork.map(r=> +r.letters||0), pointRadius:3, pointHoverRadius:8, pointHitRadius:16 }]
      },
      options:{
        responsive:true,
        interaction:{ mode:'nearest', intersect:false },
        events:['mousemove','mouseout','click','touchstart','touchmove','touchend'],
        animation:{ duration:0 },
        plugins:{
          legend:{ display:false },
          tooltip:{
            animation:{ duration:0 },
            callbacks:{
              title:(items)=>{
                const iso = items?.[0]?.label;
                if (!iso) return '';
                const d = DateTime.fromISO(iso, { zone: ZONE });
                return d.toFormat('cccc • MMM d, yyyy') + (vacGlyph ? vacGlyph(iso) : '');
              }
            }
          }
        },
        scales:{
          x:{
            ticks:{
              maxRotation:0,
              autoSkip:true,
              maxTicksLimit:8,
              callback:function(value){
                const iso = this.getLabelForValue(value);
                const d = DateTime.fromISO(iso, { zone: ZONE });
                return [d.toFormat('ccc'), d.toFormat('M/d')];
              }
            }
          }
        }
      }
    });

    enableChartTap(parcelsChart, parcelsCanvas);
    enableChartTap(lettersChart, lettersCanvas);
  }

  function buildMonthlyGlance(rows){
    rows = filterRowsForView(rows||[]);
    const today = DateTime.now().setZone(ZONE);
    const weekStart0 = startOfWeekMonday(today);
    const weekEnd0   = endOfWeekSunday(today);
    const weekStart1 = startOfWeekMonday(today.minus({weeks:1}));
    const weekEnd1   = endOfWeekSunday(today.minus({weeks:1}));
    const weekStart2 = startOfWeekMonday(today.minus({weeks:2}));
    const weekEnd2   = endOfWeekSunday(today.minus({weeks:2}));
    const weekStart3 = startOfWeekMonday(today.minus({weeks:3}));
    const weekEnd3   = endOfWeekSunday(today.minus({weeks:3}));
    const inRange=(r,from,to)=>{ const d=DateTime.fromISO(r.work_date,{zone:ZONE}); return d>=from && d<=to; };
    const worked = rows.filter(r=> r.status!=='off');
    const totals = (from,to)=>{
      const arr = worked.filter(r=> inRange(r,from,to));
      const h = arr.reduce((t,r)=> t + (+r.hours||0), 0);
      const p = arr.reduce((t,r)=> t + (+r.parcels||0), 0);
      const l = arr.reduce((t,r)=> t + (+r.letters||0), 0);
      return {h,p,l};
    };
    const W3 = totals(weekStart3, weekEnd3);
    const W2 = totals(weekStart2, weekEnd2);
    const W1 = totals(weekStart1, weekEnd1);
    const W0 = totals(weekStart0, weekEnd0);
    const fmtH = n => (n||0).toFixed(1);
    const labels = [weekEnd3, weekEnd2, weekEnd1, weekEnd0].map(d=> d.toFormat('LLL dd'));
    const hoursDiv   = document.getElementById('mgHours');
    const parcelsDiv = document.getElementById('mgParcels');
    const lettersDiv = document.getElementById('mgLetters');
    if (!hoursDiv || !parcelsDiv || !lettersDiv) return;
    hoursDiv.textContent   = `W4 ${fmtH(W3.h)} • W3 ${fmtH(W2.h)} • W2 ${fmtH(W1.h)} • W1 ${fmtH(W0.h)}`;
    parcelsDiv.textContent = `W4 ${W3.p} • W3 ${W2.p} • W2 ${W1.p} • W1 ${W0.p}`;
    lettersDiv.textContent = `W4 ${W3.l} • W3 ${W2.l} • W2 ${W1.l} • W1 ${W0.l}`;

    if (window.Chart){
      try{
        const renderSpark = (target, dataArr, color, metricName, starts, ends)=>{
          target.innerHTML = '';
          const nums = (dataArr||[]).filter(v=> v!=null && isFinite(v));
          const avg = nums.length ? nums.reduce((a,b)=>a+Number(b),0)/nums.length : null;
          const fmtAvg = (v)=>{
            if (v==null) return '—';
            return metricName === 'Hours' ? (Math.round(v*10)/10).toFixed(1)+'h' : String(Math.round(v));
          };
          const wrap = document.createElement('div');
          wrap.style.display = 'flex';
          wrap.style.flexDirection = 'column';
          wrap.style.width = '100%';
          const avgEl = document.createElement('span');
          avgEl.className = 'pill';
          avgEl.style.fontSize = '11px';
          avgEl.style.padding = '2px 6px';
          avgEl.style.alignSelf = 'flex-start';
          avgEl.style.marginBottom = '4px';
          avgEl.innerHTML = `<small>Avg</small> <b>${fmtAvg(avg)}</b>`;
          wrap.appendChild(avgEl);
          const canvas = document.createElement('canvas');
          canvas.className = 'sparkline';
          try{ canvas.height = 56; }catch(_){ }
          canvas.style.height = '56px';
          canvas.style.maxHeight = '56px';
          canvas.style.width = '100%';
          canvas.style.cursor = 'pointer';
          wrap.appendChild(canvas);
          const lbl = document.createElement('div');
          lbl.className = 'sparkline-labels';
          lbl.textContent = labels.join(' • ');
          wrap.appendChild(lbl);
          const summary = document.createElement('div');
          summary.className = 'sparkline-summary';
          summary.textContent = 'Click a dot for details';
          wrap.appendChild(summary);
          target.appendChild(wrap);
          const ctx = canvas.getContext('2d');
          const chart = new Chart(ctx, {
            type:'line',
            data:{ labels, datasets:[{
              label: metricName,
              data: dataArr,
              borderColor: color,
              backgroundColor: color,
              tension:0.25,
              fill:false,
              borderWidth:1,
              pointRadius:3,
              pointHoverRadius:6,
              pointHitRadius:14
            }]},
            options:{
              responsive:true,
              maintainAspectRatio:false,
              layout:{ padding:{ top:14, right:24, bottom:12, left:24 } },
              interaction:{ mode:'nearest', intersect:false },
              scales:{ x:{ display:false }, y:{ display:false } },
              plugins:{ legend:{ display:false }, tooltip:{
                enabled:true,
                callbacks:{
                  title:(items)=>{
                    try{ return fmtRange(items[0].dataIndex); }catch(_){ return ''; }
                  },
                  label:(item)=>{
                    const v = item.parsed.y;
                    if (metricName === 'Hours') return `Hours: ${( +v ).toFixed(1)}h`;
                    return `${metricName}: ${Math.round(+v)}`;
                  }
                }
              }}
            },
            plugins:[]
          });
          const fmtVal = (v)=>{
            if (v == null) return '—';
            if (metricName === 'Hours') return (Math.round(v*10)/10).toFixed(1) + 'h';
            return String(Math.round(v));
          };
          const fmtRange = (i)=>{
            try{
              const s = starts[i];
              const e = ends[i];
              if (s && e && s.toFormat && e.toFormat){
                return `${s.toFormat('LLL dd')} – ${e.toFormat('LLL dd')}`;
              }
            }catch(_){ }
            return labels[i] || '';
          };
          canvas.addEventListener('click', (evt)=>{
            try{
              const points = chart.getElementsAtEventForMode(evt, 'nearest', { intersect:true }, false);
              if (!points || !points.length) return;
              const idx = points[0].index;
              summary.textContent = `${metricName}: ${fmtVal(dataArr[idx])} · ${fmtRange(idx)}`;
            }catch(_){ }
          });
          canvas.tabIndex = 0;
          canvas.addEventListener('keydown', (e)=>{
            if (e.key !== 'Enter' && e.key !== ' ') return;
            e.preventDefault();
            const cur = (labels.indexOf((summary.textContent||'').split('·').pop()?.trim()) + 1) % dataArr.length;
            summary.textContent = `${metricName}: ${fmtVal(dataArr[cur])} · ${fmtRange(cur)}`;
          });
        };
        const starts = [weekStart3, weekStart2, weekStart1, weekStart0];
        const ends   = [weekEnd3,   weekEnd2,   weekEnd1,   weekEnd0];
        const docStyle = getComputedStyle(document.documentElement);
        renderSpark(hoursDiv,   [W3.h, W2.h, W1.h, W0.h].map(n=> +(n||0).toFixed(1)), docStyle.getPropertyValue('--good').trim()  || '#7CE38B', 'Hours',   starts, ends);
        renderSpark(parcelsDiv, [W3.p, W2.p, W1.p, W0.p],                        docStyle.getPropertyValue('--brand').trim() || '#2b7fff', 'Parcels', starts, ends);
        renderSpark(lettersDiv, [W3.l, W2.l, W1.l, W0.l],                        docStyle.getPropertyValue('--warn').trim()  || '#FFD27A', 'Letters', starts, ends);
      }catch(e){
        console.warn('Monthly Glance charts failed; showing text fallback', e);
      }
    } else if (!window.__chartLoadAttempted){
      window.__chartLoadAttempted = true;
      try{
        const script = document.createElement('script');
        script.src = 'vendor/chart.umd.js';
        script.async = true;
        script.onload = ()=>{
          try{
            if (window.Chart){
              try{ buildMonthlyGlance(rows); }catch(_){ }
              try{ buildCharts(rows); }catch(_){ }
              try{ buildMixViz(rows); }catch(_){ }
              try{ buildOfficeCompare(rows); }catch(_){ }
              if (typeof buildDayCompare === 'function'){
                try{ buildDayCompare(rows); }catch(_){ }
              }
              try{ buildQuickFilter(rows); }catch(_){ }
            }
          }catch(_){ }
        };
        script.onerror = ()=> console.warn('Failed to load vendor/chart.umd.js; keeping text fallback');
        document.head.appendChild(script);
      }catch(e){ console.warn('Error injecting Chart.js script', e); }
    }
  }

  function mixSum(arr, fn){
    let sum = 0;
    for (const item of arr) sum += +fn(item) || 0;
    return sum;
  }

  function mixRouteAdjustedMinutes(row){
    try{
      if (typeof routeAdjustedHours === 'function'){
        const hours = routeAdjustedHours(row);
        if (isFinite(hours)) return hours * 60;
      }
    }catch(_){ }
    return Math.max(0, (+row.route_minutes||0));
  }

  function mixLoadLetterWeightFallback(){
    const DEF = 0.33;
    try{
      const stored = parseFloat(localStorage.getItem('routeStats.letterWeight'));
      if (isFinite(stored) && stored > 0) return stored;
    }catch(_){ }
    return DEF;
  }

  function mixComputeLetterWeight(rows){
    const cleanRows = (rows||[]).filter(r => r && r.status !== 'off');
    const n = cleanRows.length;
    if (!n) return mixLoadLetterWeightFallback();
    const Sy  = mixSum(cleanRows, r=> mixRouteAdjustedMinutes(r));
    const Sp  = mixSum(cleanRows, r=> +r.parcels||0);
    const Sl  = mixSum(cleanRows, r=> +r.letters||0);
    const Spp = mixSum(cleanRows, r=> { const v=+r.parcels||0; return v*v; });
    const Sll = mixSum(cleanRows, r=> { const v=+r.letters||0; return v*v; });
    const Spl = mixSum(cleanRows, r=> { const p=+r.parcels||0, l=+r.letters||0; return p*l; });
    const Spy = mixSum(cleanRows, r=> { const p=+r.parcels||0; return p*mixRouteAdjustedMinutes(r); });
    const Sly = mixSum(cleanRows, r=> { const l=+r.letters||0; return l*mixRouteAdjustedMinutes(r); });
    const mp = Sp/n, ml = Sl/n, my = Sy/n;
    let Cpp=0, Cll=0, Cpl=0, Cpy=0, Cly=0;
    for (const r of cleanRows){
      const p=(+r.parcels||0)-mp;
      const l=(+r.letters||0)-ml;
      const y=mixRouteAdjustedMinutes(r)-my;
      Cpp += p*p; Cll += l*l; Cpl += p*l; Cpy += p*y; Cly += l*y;
    }
    const det = (Cpp*Cll - Cpl*Cpl);
    if (!isFinite(det) || Math.abs(det) < 1e-6){
      return mixLoadLetterWeightFallback();
    }
    const bp = (Cpy*Cll - Cpl*Cly) / det;
    const bl = (Cpp*Cly - Cpl*Cpy) / det;
    let w = (isFinite(bp) && Math.abs(bp) > 1e-6) ? (bl / bp) : null;
    if (!isFinite(w) || w < 0) w = 0;
    if (w > 1.5) w = 1.5;
    const prev = mixLoadLetterWeightFallback();
    const alpha = 0.3;
    const smoothed = (prev!=null && isFinite(prev)) ? (alpha*w + (1-alpha)*prev) : w;
    try{ localStorage.setItem('routeStats.letterWeight', String(smoothed)); }catch(_){ }
    return smoothed;
  }

  function mixGetLetterWeight(rows){
    try{
      const worked = (rows||[])
        .filter(r=> r && r.status !== 'off' && ((+r.parcels||0) + (+r.letters||0) > 0))
        .sort((a,b)=> (a.work_date < b.work_date ? -1 : 1));
      const sample = worked.slice(-60);
      return mixComputeLetterWeight(sample);
    }catch(_){
      return mixLoadLetterWeightFallback();
    }
  }

  function mixCombinedVolume(p, l, w){
    const weight = (w==null) ? mixLoadLetterWeightFallback() : w;
    const pp = +p||0;
    const ll = +l||0;
    return +(pp + weight*ll).toFixed(2);
  }

  function buildMixViz(rows){
    rows = filterRowsForView(rows||[]);
    const flags = getFlags();
    const card = document.getElementById('mixVizCard'); if(!card) return;
    if (!flags.mixViz) { card.style.display='none'; return; }
    card.style.display='block';
    const letterW = mixGetLetterWeight(rows);
    const docStyle = getComputedStyle(document.documentElement);
    const brand = docStyle.getPropertyValue('--brand').trim() || '#2b7fff';
    const warnColor = docStyle.getPropertyValue('--warn').trim() || '#FFD27A';
    const goodColor = docStyle.getPropertyValue('--good').trim() || '#7CE38B';
    const text = document.getElementById('mixText');
    const eff  = document.getElementById('mixEff');
    const overlay = document.getElementById('weekOverlay');
    const culprits = document.getElementById('mixCulprits');
    const details = document.getElementById('mixCompareDetails');
    const btn = document.getElementById('mixCompareBtn');
    const now = DateTime.now().setZone(ZONE);
    const startThis = startOfWeekMonday(now);
    const endThis   = now.endOf('day');
    const inRange=(r,from,to)=>{ const d=DateTime.fromISO(r.work_date,{zone:ZONE}); return d>=from && d<=to; };
    const worked = rows.filter(r=> r.status!=='off');
    const baseWeek = getLastNonEmptyWeek(worked, now, { excludeVacation: true });
    const startLast = baseWeek.start;
    const endLastFull = baseWeek.end;
    const lastEndSame = DateTime.min(endLastFull, baseWeek.start.plus({ days: Math.max(0, now.weekday - 1) }).endOf('day'));
    const W0 = worked.filter(r=> inRange(r,startThis,endThis));
    const W1 = baseWeek.rows.filter(r=> inRange(r,startLast,lastEndSame));
    const sum = (arr,fn)=> arr.reduce((t,x)=> t + (fn(x)||0), 0);
    const p0=sum(W0,r=>+r.parcels||0), p1=sum(W1,r=>+r.parcels||0);
    const l0=sum(W0,r=>+r.letters||0), l1=sum(W1,r=>+r.letters||0);
    const ln0 = +( (letterW * l0) ).toFixed(1);
    const ln1 = +( (letterW * l1) ).toFixed(1);
    let rm0 = 0;
    let rm1 = 0;
    try{
      if (text) text.textContent = `W1: Parcels ${p0}, Letters ${l0} • W2: Parcels ${p1}, Letters ${l1}`;
      const wBadge = document.getElementById('mixWeight');
      if (wBadge){ wBadge.style.display='inline-flex'; wBadge.innerHTML = `<small class="modelMetric">Letter w</small> <span>${(Math.round(letterW*100)/100).toFixed(2)}</span>`; }
      const vol0 = mixCombinedVolume(p0, l0, letterW); const vol1 = mixCombinedVolume(p1, l1, letterW);
      rm0  = sum(W0,r=> routeAdjustedHours(r));
      rm1  = sum(W1,r=> routeAdjustedHours(r));
      const idx0 = (vol0>0 && rm0>0) ? (rm0/vol0) : null;
      const idx1 = (vol1>0 && rm1>0) ? (rm1/vol1) : null;
      let deltaStr = '—'; let deltaStyle='';
      if (idx0!=null && idx1!=null && idx1>0){
        const imp = ((idx1 - idx0) / idx1) * 100;
        const s = Math.round(imp);
        const fg = (imp >= 0) ? 'var(--good)' : 'var(--bad)';
        deltaStr = `${s>=0?'↑':'↓'} ${Math.abs(s)}%`;
        deltaStyle = `color:${fg}`;
      }
      if (eff){
        const a = idx0==null? '—' : (Math.round(idx0*100)/100).toFixed(2);
        const b = idx1==null? '—' : (Math.round(idx1*100)/100).toFixed(2);
        eff.innerHTML = `Efficiency index (min/vol): ${a} vs ${b} <span style="${deltaStyle}">${deltaStr}</span>`;
      }
      try{
        if (culprits){
          const days = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
          const routeByDow = (arr)=>{
            const a = Array.from({length:7},()=>0);
            arr.forEach(r=>{ const d=DateTime.fromISO(r.work_date,{zone:ZONE}); const idx=(d.weekday+6)%7; a[idx]+= Math.max(0, (+r.route_minutes||0) - boxholderAdjMinutes(r)); });
            return a.map(n=> +(Math.round(n*100)/100).toFixed(2));
          };
          const thisBy = routeByDow(W0);
          const lastBy = routeByDow(W1);
          const out=[];
          thisBy.forEach((val,idx)=>{
            const prev = lastBy[idx] || 0;
            if (prev <= 0) return;
            const diff = Math.round(((val-prev)/prev)*100);
            if (Math.abs(diff)>=10){
              out.push(`${days[idx]}: ${diff>=0?'↑':'↓'}${Math.abs(diff)}%`);
            }
          });
          culprits.textContent = out.length ? ('Outliers: ' + out.join(' • ')) : 'Outliers: —';
        }
      }catch(_){ }
    }catch(_){ }
    const d = (a,b)=> (b>0)? Math.round(((a-b)/b)*100) : null;
    const dH = d(sum(W0,r=>+r.hours||0), sum(W1,r=>+r.hours||0));
    let dP, dLx, lineLabelP='Parcels', lineLabelL='Letters';
    let resP = { used: 0 };
    let resL = { used: 0 };
    const baselines = ensureWeeklyBaselines(rows) || getWeeklyBaselines();
    const anchor = computeAnchorBaselines(rows, 8);
    const nowDayIdx = (now.weekday + 6) % 7;
    if (flags.baselineCompare){
      const mins = 5;
      const byW = (arr,fn)=>{
        const out = Array.from({length:7},()=>0);
        arr.forEach(r=>{ const d=DateTime.fromISO(r.work_date,{zone:ZONE}); const idx=(d.weekday+6)%7; out[idx] += (fn(r)||0); });
        return out;
      };
      const alignedDelta = (curArr, baseArr, upto, min)=>{
        let curSum=0, baseSum=0, used=0;
        for (let i=0;i<=upto;i++){
          const base = baseArr ? baseArr[i] : null;
          if (base!=null && base>=min){
            curSum += (curArr[i]||0);
            baseSum += base;
            used++;
          }
        }
        if (!used || baseSum<=0) return { delta:null, used:0 };
        let delta = Math.round(((curSum - baseSum)/baseSum)*100);
        if (delta>100) delta=100; if (delta<-100) delta=-100;
        return { delta, used };
      };
      const pThisW = byW(W0, r=> +r.parcels||0);
      const lThisW = byW(W0, r=> +r.letters||0);
      const bp = baselines ? baselines.parcels : null;
      const bl = baselines ? baselines.letters : null;
      resP = alignedDelta(pThisW, bp, nowDayIdx, mins);
      resL = alignedDelta(lThisW, bl, nowDayIdx, mins);
      dP = resP.delta;
      dLx= resL.delta;
      lineLabelP = 'Parcels (vs baseline)';
      lineLabelL = 'Letters (vs baseline)';
    } else {
      dP = d(p0,p1);
      dLx= d(l0,l1);
    }
    const expectationStroke = 'rgba(255,140,0,0.85)';
    const expectationFill = 'rgba(255,140,0,0.22)';
    const dEff = ((p0+ln0)>0 && (p1+ln1)>0)
      ? Math.round((( (rm1/(p1+ln1)) - (rm0/(p0+ln0)) ) / (rm1/(p1+ln1)) )*100)
      : null;
    const arrow=(v)=> v==null?'—':(v>=0?'↑ '+v+'%':'↓ '+Math.abs(v)+'%');
    const color=(v)=> v==null?'var(--text)':(v>=0?'var(--good)':'var(--bad)');
    const line=(label,v,ctx,colorOverride)=>{
      const labelHtml = colorOverride ? `<span style="color:${colorOverride};font-weight:600">${label}</span>` : label;
      return `<div>${labelHtml}: <span style="color:${color(v)}">${arrow(v)}</span> ${ctx||''}</div>`;
    };
    if (details){
      const usedP = (resP && resP.used) ? `, ${resP.used} day(s) used` : '';
      const usedL = (resL && resL.used) ? `, ${resL.used} day(s) used` : '';
      details.innerHTML = [
        line('Efficiency', dEff, `(${( (rm0/(p0+ln0))||0 ).toFixed(2)} vs ${( (rm1/(p1+ln1))||0 ).toFixed(2)})`),
        line(lineLabelP, dP, `(${p0} vs ${p1}${usedP})`, warnColor || '#f97316'),
        line(lineLabelL, dLx, `(${l0} vs ${l1}${usedL})`, '#60a5fa'),
        line('Hours', dH, `(${(sum(W0,r=>+r.hours||0)).toFixed(1)}h vs ${(sum(W1,r=>+r.hours||0)).toFixed(1)}h)`)
      ].join('');
      details.style.display = 'block';
      if (btn) btn.setAttribute('aria-expanded', 'true');
    }
    try{
      if (overlay && window.Chart && overlay.getContext){
        const ctx = overlay.getContext('2d');
        if (overlay._chart) { try{ overlay._chart.destroy(); }catch(_){ } }
        const days = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
        const warn = warnColor;
        const good = goodColor;
        const volByDow = (arr)=>{
          const a = Array.from({length:7},()=>0);
          arr.forEach(r=>{
            const d=DateTime.fromISO(r.work_date,{zone:ZONE});
            const idx=(d.weekday+6)%7;
            a[idx]+= mixCombinedVolume((+r.parcels||0), (+r.letters||0), letterW);
          });
          return a.map(n=> +(Math.round(n*10)/10).toFixed(1));
        };
        const routeByDow = (arr)=>{
          const a = Array.from({length:7},()=>0);
          arr.forEach(r=>{ const d=DateTime.fromISO(r.work_date,{zone:ZONE}); const idx=(d.weekday+6)%7; a[idx]+= Math.max(0, (+r.route_minutes||0) - boxholderAdjMinutes(r)); });
          return a.map(n=> +(Math.round(n*100)/100).toFixed(2));
        };
        const thisBy = volByDow(W0);
        const W1full = baseWeek.rows;
        const lastBy = volByDow(W1full);
        const thisRoute = routeByDow(W0);
        const lastRoute = routeByDow(W1full);
        const dayIdxToday = (now.weekday + 6) % 7;
        const hasBand = !!(typeof bandMinData !== 'undefined' && typeof bandMaxData !== 'undefined' && bandMinData && bandMaxData);
        const isoForPoint = (datasetIndex, idx) => {
          try{
            if (hasBand){
              if (datasetIndex === 0 || datasetIndex === 1) return startThis.plus({ days: idx }).toISODate();
              if (datasetIndex === 2) return startLast.plus({ days: idx }).toISODate();
              if (datasetIndex === 3 || datasetIndex === 4) return startThis.plus({ days: idx }).toISODate();
            } else {
              if (datasetIndex === 0) return startLast.plus({ days: idx }).toISODate();
              if (datasetIndex === 1 || datasetIndex === 2) return startThis.plus({ days: idx }).toISODate();
            }
          }catch(_){ }
          return null;
        };
        const thisMasked = thisBy.map((v,i)=> i<=dayIdxToday? v : null);
        const thisRouteMasked = thisRoute.map((v,i)=> i<=dayIdxToday? v : null);
        const datasets = [];
        if (hasBand){
          datasets.push({
            label:'Vol expect min',
            data: bandMinData,
            borderColor:'rgba(255,140,0,0.85)',
            borderWidth:1,
            borderDash:[6,4],
            backgroundColor:'transparent',
            pointRadius:0,
            spanGaps:true,
            fill:false
          });
          datasets.push({
            label:'Vol expect max',
            data: bandMaxData,
            borderColor:'rgba(0,0,0,0)',
            backgroundColor:'rgba(255,140,0,0.22)',
            pointRadius:0,
            borderWidth:0,
            spanGaps:true,
            fill:{ target:'-1', above:'rgba(255,140,0,0.22)', below:'rgba(255,140,0,0.22)' }
          });
        }
        datasets.push(
          { label:'Vol last', data:lastBy, borderColor:brand, backgroundColor:'transparent', tension:0.25, pointRadius:3, pointHoverRadius:6, pointHitRadius:14, borderWidth:2, spanGaps:true, yAxisID:'y' },
          { label:'Vol this', data:thisMasked, borderColor:warn,  backgroundColor:'transparent', tension:0.25, pointRadius:3, pointHoverRadius:6, pointHitRadius:14, borderWidth:2, spanGaps:true, yAxisID:'y' },
          { label:'Route h (this)', data:thisRouteMasked, borderColor:good, backgroundColor:'transparent', borderDash:[4,3], tension:0.25, pointRadius:2, pointHoverRadius:5, pointHitRadius:12, borderWidth:2, spanGaps:true, yAxisID:'y2' }
        );
        overlay._chart = new Chart(ctx, {
          type:'line',
          data:{ labels:days, datasets },
          options:{
            responsive:true,
            maintainAspectRatio:false,
            layout:{ padding:{ top:12, right:16, bottom:10, left:16 } },
            interaction:{ mode:'nearest', intersect:false },
            plugins:{ legend:{ display:false }, tooltip:{
              callbacks:{
                title:(items)=>{
                  if (!items || !items.length) return '';
                  const item = items[0];
                  const iso = isoForPoint(item.datasetIndex, item.dataIndex);
                  if (iso){
                    const dt = DateTime.fromISO(iso, { zone: ZONE });
                    return dt.toFormat('ccc • MMM d, yyyy') + (vacGlyph ? vacGlyph(iso) : '');
                  }
                  const lbl = item.label || '';
                  return lbl + (vacGlyph ? vacGlyph(lbl) : '');
                },
                label:(item)=>{
                  const i=item.dataIndex; const lw=lastBy[i]; const tw=thisBy[i];
                  const hasTw = i<=dayIdxToday && tw!=null;
                  const routeStr = thisRouteMasked[i]!=null ? `, Route: ${thisRouteMasked[i]}m` : '';
                  return hasTw? `This: ${tw}${routeStr}` : `Last: ${lw}`;
                }
              }
            }},
            scales:{
              x:{ display:true, grid:{ display:false } },
              y:{ display:false },
              y2:{ display:false }
            }
          }
        });
      }
    }catch(_){ }
    if (btn){
      btn.onclick = ()=>{
        try{
          const body = document.querySelector('#mixCompareDetails');
          if (!body) return;
          const expanded = body.style.display !== 'block';
          body.style.display = expanded ? 'block' : 'none';
          btn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
        }catch(_){ }
      };
    }
  }

  function buildOfficeCompare(rows){
    rows = filterRowsForView(rows||[]);
    try{
      const card = document.getElementById('officeCompareCard'); if (!card) return;
      const overlay = document.getElementById('officeOverlay');
      const summary = document.getElementById('officeSummary');
      const now = DateTime.now().setZone(ZONE);
      const startThis = startOfWeekMonday(now);
      const endThis   = now.endOf('day');
      const inRange=(r,from,to)=>{ const d=DateTime.fromISO(r.work_date,{zone:ZONE}); return d>=from && d<=to; };
      const worked = (rows||[]).filter(r=> r.status!=='off');
      const baseWeek = getLastNonEmptyWeek(worked, now, { excludeVacation: true });
      const startLast = baseWeek.start;
      const endLast   = baseWeek.end;
      const lastEndSame = DateTime.min(endLast, baseWeek.start.plus({ days: Math.max(0, now.weekday - 1) }).endOf('day'));
      const W0 = worked.filter(r=> inRange(r,startThis,endThis));
      const sum = (arr,fn)=> arr.reduce((t,x)=> t + (fn(x)||0), 0);
      const offByDow = (arr)=>{
        const a=Array.from({length:7},()=>0);
        arr.forEach(r=>{ const d=DateTime.fromISO(r.work_date,{zone:ZONE}); const idx=(d.weekday+6)%7; a[idx]+= (+r.office_minutes||0); });
        return a.map(n=> +(Math.round(n*100)/100).toFixed(2));
      };
      const thisBy = offByDow(W0);
      const W1 = baseWeek.rows;
      const lastBy = offByDow(W1);
      const dayIdxToday = (now.weekday + 6) % 7;
      const thisMasked = thisBy.map((v,i)=> i<=dayIdxToday? v : null);
      const days = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
      const off0 = sum(W0, r=> +r.office_minutes||0);
      const off1same = sum(W1.filter(r=> inRange(r,startLast,lastEndSame)), r=> +r.office_minutes||0);
      const dPct = (off1same>0)? Math.round(((off0 - off1same)/off1same)*100) : null;
      if (summary) summary.textContent = `Office (so far): ${off0.toFixed(2)}h vs ${off1same.toFixed(2)}h (${dPct==null?'—':(dPct>=0?('↑ '+dPct+'%'):('↓ '+Math.abs(dPct)+'%'))})`;
      card.style.display='block';
      if (overlay && window.Chart && overlay.getContext){
        const ctx = overlay.getContext('2d');
        if (overlay._chart) { try{ overlay._chart.destroy(); }catch(_){ } }
        const brand = getComputedStyle(document.documentElement).getPropertyValue('--brand').trim()||'#2b7fff';
        const warn  = getComputedStyle(document.documentElement).getPropertyValue('--warn').trim() || '#FFD27A';
        const isoForPoint = (datasetIndex, idx) => {
          try{
            if (datasetIndex === 0) return startLast.plus({ days: idx }).toISODate();
            if (datasetIndex === 1) return startThis.plus({ days: idx }).toISODate();
          }catch(_){ }
          return null;
        };
        overlay._chart = new Chart(ctx, {
          type:'line',
          data:{ labels:days, datasets:[
            { label:'Last week', data:lastBy, borderColor:brand, backgroundColor:'transparent', tension:0.25, pointRadius:3, pointHoverRadius:6, pointHitRadius:14, borderWidth:2, spanGaps:true },
            { label:'This week', data:thisMasked, borderColor:warn,  backgroundColor:'transparent', tension:0.25, pointRadius:3, pointHoverRadius:6, pointHitRadius:14, borderWidth:2, spanGaps:true }
          ]},
          options:{
            responsive:true,
            maintainAspectRatio:false,
            layout:{ padding:{ top:12, right:16, bottom:10, left:16 } },
            interaction:{ mode:'nearest', intersect:false },
            plugins:{ legend:{ display:false }, tooltip:{
              callbacks:{
                title:(items)=>{
                  if (!items || !items.length) return '';
                  const item = items[0];
                  const iso = isoForPoint(item.datasetIndex, item.dataIndex);
                  if (iso){
                    const dt = DateTime.fromISO(iso, { zone: ZONE });
                    return dt.toFormat('ccc • MMM d, yyyy') + (vacGlyph ? vacGlyph(iso) : '');
                  }
                  const lbl = item.label || '';
                  return lbl + (vacGlyph ? vacGlyph(lbl) : '');
                },
                label:(item)=>{
                  const i=item.dataIndex; const lw=lastBy[i]; const tw=thisBy[i];
                  const hasTw = i<=dayIdxToday && tw!=null;
                  return hasTw? `This: ${tw}h (Last: ${lw}h)` : `Last: ${lw}h`;
                }
              }
            }},
            scales:{ x:{ display:true, grid:{ display:false } }, y:{ display:false } }
          }
        });
      }
    }catch(_){ }
  }

  function buildQuickFilter(rows){
    rows = filterRowsForView(rows||[]);
    const flags = getFlags();
    const card = document.getElementById('quickFilterCard');
    if (!card) return;
    card.style.display = flags.quickFilter ? 'block' : 'none';
    if (!flags.quickFilter) return;
    const sel = document.getElementById('qfSelect');
    const stats = document.getElementById('qfStats');
    const spark = document.getElementById('qfSpark');
    const text = document.getElementById('qfText');
    const cbAll = document.getElementById('qfAllMetrics');
    const cbP = document.getElementById('qfShowParcels');
    const cbL = document.getElementById('qfShowLetters');
    const cbH = document.getElementById('qfShowHours');
    const selN = document.getElementById('qfLastN');
    const cbRuler = document.getElementById('qfShowRuler');
    const normBadge = document.getElementById('qfNormBadge');
    if (!stats || !spark || !text) return;
    const dayVal = (sel && sel.value) || 'all';
    const worked = (rows||[]).filter(r=> r.status!=='off');
    const filtered = worked.filter(r=> dayVal==='all' ? true : (DateTime.fromISO(r.work_date,{zone:ZONE}).weekday%7) == +dayVal);
    const count = filtered.length;
    const sum = (arr,fn)=> arr.reduce((t,x)=> t + (fn(x)||0), 0);
    const avg = (arr,fn)=> arr.length? sum(arr,fn)/arr.length : null;
    const avgH = avg(filtered, r=> +r.hours||0);
    const avgP = avg(filtered, r=> +r.parcels||0);
    const avgL = avg(filtered, r=> +r.letters||0);
    const avgR = avg(filtered, r=> +r.route_minutes||0);
    const pill = (label,val,fmt)=> `<span class="pill"><small>${label}:</small> <b>${fmt(val)}</b></span>`;
    const nf = (v)=> v==null? '—' : (typeof v==='number'? (Math.round(v*100)/100).toString() : String(v));
    stats.innerHTML = [
      pill('Days', count, nf),
      pill('Avg hours', avgH, v=> v==null?'—':(Math.round(v*100)/100).toFixed(2)),
      pill('Avg parcels', avgP, v=> v==null?'—':Math.round(v)),
      pill('Avg letters', avgL, v=> v==null?'—':Math.round(v)),
      pill('Avg route min', avgR, v=> v==null?'—':Math.round(v))
    ].join('');
    const available = filtered.length;
    const lastCount = (selN && +selN.value) || +(localStorage.getItem('routeStats.qf.lastN')||12) || 12;
    if (selN) selN.value = String(lastCount);
    if (selN && selN.options) {
      try{
        Array.from(selN.options).forEach(o=>{ o.disabled = (+o.value) > available; });
      }catch(_){ }
    }
    const lastN = filtered.slice().sort((a,b)=> (a.work_date < b.work_date ? -1 : 1)).slice(-lastCount);
    const labels = lastN.map(r=> DateTime.fromISO(r.work_date,{zone:ZONE}).toFormat('LLL d'));
    try{
      if (cbRuler && typeof buildQuickFilter._rulerInit === 'undefined'){
        const pref = localStorage.getItem('routeStats.qf.ruler');
        if (pref != null) cbRuler.checked = pref === '1';
        buildQuickFilter._rulerInit = true;
      }
    }catch(_){ }
    const availableMetrics = filtered.reduce((map,r)=>{
      const iso = r.work_date;
      map.set(iso, {
        parcels:+r.parcels||0,
        letters:+r.letters||0,
        hours:+r.hours||0
      });
      return map;
    }, new Map());
    const serP = lastN.map(r=> availableMetrics.get(r.work_date)?.parcels ?? null);
    const serL = lastN.map(r=> availableMetrics.get(r.work_date)?.letters ?? null);
    const serH = lastN.map(r=> availableMetrics.get(r.work_date)?.hours ?? null);
    const showP = !!(cbP ? cbP.checked : true);
    const showL = !!(cbL ? cbL.checked : true);
    const showH = !!(cbH ? cbH.checked : true);
    const brand = getComputedStyle(document.documentElement).getPropertyValue('--brand').trim()||'#2b7fff';
    const warn  = getComputedStyle(document.documentElement).getPropertyValue('--warn').trim() || '#FFD27A';
    const good  = getComputedStyle(document.documentElement).getPropertyValue('--good').trim() || '#2E7D32';
    const datasets = [];
    const needNormalize = [showP, showL, showH].filter(Boolean).length > 1;
    const norm = (arr)=>{
      const vals = arr || [];
      let min = Infinity, max = -Infinity;
      for (const v of vals){ if (v==null) continue; if (v<min) min=v; if (v>max) max=v; }
      if (!isFinite(min) || !isFinite(max)) return vals.map(_=> null);
      if (max === min) return vals.map(_=> 50);
      return vals.map(v=> v==null? null : Math.round(((v - min)/(max - min))*100));
    };
    const dataP = needNormalize ? norm(serP) : serP;
    const dataL = needNormalize ? norm(serL) : serL;
    const dataH = needNormalize ? norm(serH) : serH;
    if (showP) datasets.push({ label:'Parcels', data: dataP, borderColor:brand, backgroundColor:'transparent', tension:0.25, pointRadius:2, borderWidth:2, spanGaps:true });
    if (showL) datasets.push({ label:'Letters', data: dataL, borderColor:warn,  backgroundColor:'transparent', tension:0.25, pointRadius:2, borderWidth:2, spanGaps:true });
    if (showH) datasets.push({ label:'Hours',   data: dataH, borderColor:good,  backgroundColor:'transparent', tension:0.25, pointRadius:2, borderWidth:2, spanGaps:true });
    const summary = [];
    const fmtNum = (n)=> (Math.round(n*10)/10).toFixed(1);
    if (showP) summary.push(`P: ${serP.slice(-labels.length).map(fmtNum).join(', ')}`);
    if (showL) summary.push(`L: ${serL.slice(-labels.length).map(fmtNum).join(', ')}`);
    if (showH) summary.push(`H: ${serH.slice(-labels.length).map(fmtNum).join(', ')}`);
    const showing = labels.length;
    const note = needNormalize ? ' (normalized)' : '';
    if (normBadge) normBadge.style.display = needNormalize ? 'inline-flex' : 'none';
    const coverage = `Showing ${showing} of ${lastCount} requested${available?`, available ${available}`:''}`;
    text.textContent = datasets.length ? `${summary.join(' • ')} — ${coverage}${note}` : '—';
    const daysBadge = document.getElementById('qfDaysBadge');
    if (daysBadge){ daysBadge.style.display='inline-flex'; daysBadge.innerHTML = `<small>Days</small> <b>${count}</b>`; }
    if (window.Chart && spark.getContext){
      try{
        const ctx = spark.getContext('2d');
        if (spark._chart) { try{ spark._chart.destroy(); }catch(_){ } }
        try{ spark.height = 64; }catch(_){ }
        const wantRuler = (cbRuler ? !!cbRuler.checked : false) && needNormalize;
        spark._chart = new Chart(ctx, {
          type:'line',
          data:{ labels, datasets: datasets.map(d => Object.assign({ tension:0.25, pointRadius:2, borderWidth:2, spanGaps:true, fill:false }, d)) },
          options:{
            responsive:true,
            maintainAspectRatio:false,
            layout:{ padding:{ top:8, right:6, bottom:6, left:6 } },
            interaction:{ mode:'nearest', intersect:false },
            plugins:{ legend:{ display:false }, tooltip:{ enabled:true } },
            scales:{
              x:{ display:false, grid:{ display:false } },
              y:{
                display: wantRuler,
                min: needNormalize ? 0 : undefined,
                max: needNormalize ? 100 : undefined,
                ticks:{ display:false, stepSize:50 },
                grid:{ display: wantRuler, color:'rgba(255,255,255,0.08)' }
              }
            }
          }
        });
      }catch(_){ }
    }
    const handler = ()=> buildQuickFilter(rows);
    sel?.removeEventListener('change', buildQuickFilter._handlerSel || (()=>{}));
    cbP?.removeEventListener('change', buildQuickFilter._handlerP || (()=>{}));
    cbL?.removeEventListener('change', buildQuickFilter._handlerL || (()=>{}));
    cbH?.removeEventListener('change', buildQuickFilter._handlerH || (()=>{}));
    selN?.removeEventListener('change', buildQuickFilter._handlerN || (()=>{}));
    cbAll?.removeEventListener('change', buildQuickFilter._handlerAll || (()=>{}));
    cbRuler?.removeEventListener('change', buildQuickFilter._handlerRuler || (()=>{}));
    buildQuickFilter._handlerSel = (e)=>{
      try{
        const flagsLocal = getFlags();
        if (flagsLocal && flagsLocal.collapsedUi){
          const body = document.querySelector('#quickFilterCard > .__collapseBody');
          if (body && body.style.display === 'none'){
            try{ (window.__collapse_set||(()=>{}))('quickFilterCard', false); }catch(_){ }
          }
        }
      }catch(_){ }
      handler();
    };
    buildQuickFilter._handlerP = handler;
    buildQuickFilter._handlerL = handler;
    buildQuickFilter._handlerH = handler;
    buildQuickFilter._handlerN = (e)=>{ try{ localStorage.setItem('routeStats.qf.lastN', String(e.target.value)); }catch(_){} handler(); };
    buildQuickFilter._handlerAll = ()=>{
      const on = !!cbAll?.checked;
      if (cbP) cbP.checked = on;
      if (cbL) cbL.checked = on;
      if (cbH) cbH.checked = on;
      handler();
    };
    buildQuickFilter._handlerRuler = (e)=>{ try{ localStorage.setItem('routeStats.qf.ruler', e.target.checked ? '1' : '0'); }catch(_){} handler(); };
    sel?.addEventListener('change', buildQuickFilter._handlerSel);
    cbP?.addEventListener('change', handler);
    cbL?.addEventListener('change', handler);
    cbH?.addEventListener('change', handler);
    selN?.addEventListener('change', buildQuickFilter._handlerN);
    cbAll?.addEventListener('change', buildQuickFilter._handlerAll);
    cbRuler?.addEventListener('change', buildQuickFilter._handlerRuler);
  }

  return {
    buildCharts,
    buildMonthlyGlance,
    buildMixViz,
    buildOfficeCompare,
    buildQuickFilter
  };
}
