/* exporter.js — Excel and PDF export */

const Exporter = (() => {

  const SHIFT_COLORS = {
    night:     { fg: 'FF93C5FD', bg: 'FF1E3A5F' },
    morning:   { fg: 'FFFCD34D', bg: 'FF4D2E00' },
    afternoon: { fg: 'FF67E8F9', bg: 'FF003D47' },
    evening:   { fg: 'FFC4B5FD', bg: 'FF2D1B69' },
    custom:    { fg: 'FF6EE7B7', bg: 'FF003D29' }
  };

  const SHIFT_LABELS = {
    night: 'Noćna', morning: 'Jutarnja',
    afternoon: 'Poslijepodnevna', evening: 'Večernja', custom: 'Prilagođena'
  };

  const DAY_HR = ['Nedjelja','Ponedjeljak','Utorak','Srijeda','Četvrtak','Petak','Subota'];
  const MONTH_HR = ['Januar','Februar','Mart','April','Maj','Juni',
                    'Juli','August','Septembar','Oktobar','Novembar','Decembar'];

  function formatDate(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    return `${d.getDate()}. ${MONTH_HR[d.getMonth()]} ${d.getFullYear()}.`;
  }

  // ── Excel Export ──────────────────────────────────────────────────
  function exportExcel(shifts, person, opts = {}) {
    const wb = XLSX.utils.book_new();
    const personShifts = shifts.filter(s => s.person === person).sort((a,b) => a.date.localeCompare(b.date));

    // ── Sheet 1: All shifts ──
    const rows = [['#','Datum','Dan','Početak','Kraj','Tip Smjene','Sati','Napomena']];
    personShifts.forEach((s, i) => {
      const d = new Date(s.date + 'T00:00:00');
      rows.push([
        i + 1,
        formatDate(s.date),
        DAY_HR[d.getDay()],
        s.startTime,
        s.endTime,
        SHIFT_LABELS[s.shiftType] || s.shiftType,
        s.hours,
        s.note || ''
      ]);
    });

    if (opts.stats) {
      rows.push([]);
      rows.push(['STATISTIKE', '', '', '', '', '', '', '']);
      rows.push(['Ukupno smjena:', personShifts.length]);
      rows.push(['Ukupno sati:', personShifts.reduce((s,x)=>s+(x.hours||0),0).toFixed(1)]);
      const byType = {};
      personShifts.forEach(s => { byType[s.shiftType] = (byType[s.shiftType]||0) + 1; });
      Object.entries(byType).forEach(([t,c]) => rows.push([`${SHIFT_LABELS[t]||t}:`, c]));
    }

    const ws = XLSX.utils.aoa_to_sheet(rows);

    // Column widths
    ws['!cols'] = [
      {wch:4},{wch:22},{wch:14},{wch:10},{wch:10},{wch:20},{wch:7},{wch:20}
    ];

    // Header styling (xlsx doesn't support cell styles in free version,
    // but we set up proper structure)
    if (ws['A1']) ws['A1'].s = { font: { bold: true }, fill: { fgColor: { rgb: 'FF0F1729' } } };

    XLSX.utils.book_append_sheet(wb, ws, `Smjene - ${person}`);

    // ── Sheet 2: Monthly summary ──
    if (opts.allMonths) {
      const months = {};
      personShifts.forEach(s => {
        const key = s.date.slice(0, 7);
        if (!months[key]) months[key] = [];
        months[key].push(s);
      });

      const mRows = [['Mjesec','Broj Smjena','Noćnih','Jutarnjih','Poslijepodnevnih','Večernjih','Ukupno Sati']];
      Object.entries(months).sort().forEach(([key, ms]) => {
        const [y, m] = key.split('-');
        const label = `${MONTH_HR[parseInt(m)-1]} ${y}`;
        const count = ms.length;
        const night = ms.filter(s=>s.shiftType==='night').length;
        const morn  = ms.filter(s=>s.shiftType==='morning').length;
        const aftn  = ms.filter(s=>s.shiftType==='afternoon').length;
        const evn   = ms.filter(s=>s.shiftType==='evening').length;
        const hrs   = ms.reduce((sum,s)=>sum+(s.hours||0),0).toFixed(1);
        mRows.push([label,count,night,morn,aftn,evn,hrs]);
      });

      const ws2 = XLSX.utils.aoa_to_sheet(mRows);
      ws2['!cols'] = [{wch:18},{wch:14},{wch:10},{wch:12},{wch:18},{wch:12},{wch:12}];
      XLSX.utils.book_append_sheet(wb, ws2, 'Mjesečni Pregled');
    }

    const wbArray = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
    return wbArray;
  }

  // ── Print/PDF HTML ────────────────────────────────────────────────
  function buildPrintHTML(shifts, person, year, month) {
    const monthLabel = `${MONTH_HR[month]} ${year}`;
    const personShifts = shifts.filter(s => s.person === person);
    const monthStr = `${year}-${String(month+1).padStart(2,'0')}`;
    const monthly = personShifts.filter(s => s.date.startsWith(monthStr));

    // Build calendar
    const firstDay = new Date(year, month, 1);
    const lastDay  = new Date(year, month + 1, 0);
    const startDow = (firstDay.getDay() + 6) % 7; // Mon=0
    const totalDays = lastDay.getDate();

    const shiftMap = {};
    monthly.forEach(s => { shiftMap[s.date] = s; });

    const DAYS = ['Pon','Uto','Sri','Čet','Pet','Sub','Ned'];
    const COLORS = {
      night:'#1e3a5f,#93c5fd',morning:'#4d2e00,#fcd34d',
      afternoon:'#003d47,#67e8f9',evening:'#2d1b69,#c4b5fd',custom:'#003d29,#6ee7b7'
    };

    let calCells = '';
    for (let i = 0; i < startDow; i++) {
      calCells += '<td style="background:#111;"></td>';
    }

    for (let d = 1; d <= totalDays; d++) {
      const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const shift = shiftMap[dateStr];
      const isToday = dateStr === new Date().toISOString().slice(0,10);
      let bg = '#1a1a2e';
      let content = `<div style="color:#555;font-size:11px;margin-bottom:4px;">${d}</div>`;
      if (shift) {
        const [sbg, sfg] = (COLORS[shift.shiftType] || COLORS.custom).split(',');
        bg = '#0d1a2e';
        content = `
          <div style="color:${sfg};font-weight:700;font-size:11px;">${d}</div>
          <div style="background:${sbg};color:${sfg};border-radius:4px;padding:3px 5px;font-size:10px;font-weight:600;margin-top:3px;">
            ${shift.startTime}–${shift.endTime}
          </div>
          <div style="color:${sfg};font-size:10px;opacity:.8;margin-top:2px;">${shift.hours}h</div>`;
      }
      calCells += `<td style="background:${bg};border:1px solid #222;padding:6px;vertical-align:top;min-height:70px;${isToday?'outline:2px solid #06b6d4;':''}">
        ${content}
      </td>`;
      if ((startDow + d) % 7 === 0 && d < totalDays) calCells += '</tr><tr>';
    }

    const totalShifts = monthly.length;
    const totalHours  = monthly.reduce((s,x)=>s+(x.hours||0),0).toFixed(1);
    const byType = {};
    monthly.forEach(s => { byType[s.shiftType] = (byType[s.shiftType]||0)+1; });

    return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><style>
body{background:#080d1a;color:#e2e8f0;font-family:'Segoe UI',sans-serif;margin:0;padding:20px;}
h1{font-size:22px;color:#06b6d4;margin-bottom:4px;}
.sub{font-size:14px;color:#64748b;margin-bottom:20px;}
.stats{display:flex;gap:16px;margin-bottom:20px;}
.stat{background:#0f1729;border:1px solid #1e293b;border-radius:8px;padding:12px 18px;}
.stat-v{font-size:20px;font-weight:700;color:#06b6d4;}
.stat-l{font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.06em;}
table.cal{width:100%;border-collapse:collapse;}
th.dow{background:#0f1729;color:#64748b;font-size:11px;text-transform:uppercase;letter-spacing:.06em;padding:8px;border:1px solid #1e293b;}
td{width:14.28%;min-height:70px;}
.legend{display:flex;gap:12px;margin-top:16px;flex-wrap:wrap;}
.leg{display:flex;align-items:center;gap:6px;font-size:12px;color:#94a3b8;}
.leg-dot{width:10px;height:10px;border-radius:2px;}
</style></head><body>
<h1>Raspored Smjena — ${person}</h1>
<div class="sub">${monthLabel} · Generisano: ${new Date().toLocaleDateString('hr')}</div>
<div class="stats">
  <div class="stat"><div class="stat-v">${totalShifts}</div><div class="stat-l">Smjena</div></div>
  <div class="stat"><div class="stat-v">${totalHours}h</div><div class="stat-l">Sati rada</div></div>
  ${Object.entries(byType).map(([t,c])=>`<div class="stat"><div class="stat-v">${c}</div><div class="stat-l">${SHIFT_LABELS[t]||t}</div></div>`).join('')}
</div>
<table class="cal"><thead><tr>${DAYS.map(d=>`<th class="dow">${d}</th>`).join('')}</tr></thead>
<tbody><tr>${calCells}</tr></tbody></table>
<div class="legend">
  <div class="leg"><div class="leg-dot" style="background:#3b4fd0"></div>Noćna</div>
  <div class="leg"><div class="leg-dot" style="background:#d97706"></div>Jutarnja</div>
  <div class="leg"><div class="leg-dot" style="background:#0891b2"></div>Poslijepodnevna</div>
  <div class="leg"><div class="leg-dot" style="background:#7c3aed"></div>Večernja</div>
</div>
<p style="margin-top:20px;font-size:11px;color:#475569;">Raspored Smjena by AcoRonaldo</p>
</body></html>`;
  }

  return { exportExcel, buildPrintHTML, SHIFT_LABELS };
})();
