/* app.js — v3: persistence + person in calendar/table */
(() => {

  // ── State ─────────────────────────────────────────────────────────
  const state = {
    allShifts: [],
    people: [],
    selectedPerson: null,
    calYear:   new Date().getFullYear(),
    calMonth:  new Date().getMonth(),
    remYear:   new Date().getFullYear(),
    remMonth:  new Date().getMonth(),
    reminders: JSON.parse(localStorage.getItem('reminders') || '[]'),
    remFilter: 'all',
    editingShift: null,
    theme:     localStorage.getItem('theme')    || 'midnight',
    customBg:  localStorage.getItem('customBg') || null,
    bgOpacity: localStorage.getItem('bgOpacity') || '70',
    lastFileName: null
  };

  const MONTH_HR = ['Januar','Februar','Mart','April','Maj','Juni',
                    'Juli','August','Septembar','Oktobar','Novembar','Decembar'];
  const DAY_HR   = ['Nedjelja','Ponedjeljak','Utorak','Srijeda','Četvrtak','Petak','Subota'];

  const SHIFT_META = {
    night:     { label:'Noćna',          icon:'🌙', color:'#3b4fd0', text:'#93c5fd', bg:'rgba(59,79,208,.22)'  },
    morning:   { label:'Jutarnja',        icon:'🌅', color:'#d97706', text:'#fcd34d', bg:'rgba(217,119,6,.22)'  },
    afternoon: { label:'Poslijepodnevna', icon:'☀️',  color:'#0891b2', text:'#67e8f9', bg:'rgba(8,145,178,.22)'  },
    evening:   { label:'Večernja',        icon:'🌆', color:'#7c3aed', text:'#c4b5fd', bg:'rgba(124,58,237,.22)' },
    custom:    { label:'Prilagođena',     icon:'⚙️',  color:'#059669', text:'#6ee7b7', bg:'rgba(5,150,105,.22)'  }
  };
  const M = t => SHIFT_META[t] || SHIFT_META.custom;

  // ── Persistence ───────────────────────────────────────────────────
  async function persistAll() {
    const data = { shifts: state.allShifts, people: state.people, lastFileName: state.lastFileName };
    if (window.api) {
      await window.api.persistData(data);
    } else {
      // browser fallback
      localStorage.setItem('rs_shifts',  JSON.stringify(state.allShifts));
      localStorage.setItem('rs_people',  JSON.stringify(state.people));
    }
  }

  async function loadPersistedData() {
    let data = null;
    if (window.api) {
      data = await window.api.getPersistedData();
    } else {
      // browser fallback
      const shifts  = localStorage.getItem('rs_shifts');
      const people  = localStorage.getItem('rs_people');
      if (shifts) data = { shifts: JSON.parse(shifts), people: JSON.parse(people||'[]') };
    }
    if (data && data.shifts && data.shifts.length > 0) {
      state.allShifts    = data.shifts;
      state.people       = data.people || [...new Set(data.shifts.map(s=>s.person))].sort();
      state.lastFileName = data.lastFileName || null;
      updateSidebarInfo();
      renderPersonGrid();
      document.getElementById('person-picker').classList.remove('hidden');
      document.getElementById('import-info').textContent =
        `Učitano iz baze: ${state.allShifts.length} smjena za ${state.people.length} osoba.`;
      showToast(`📂 Učitano ${state.allShifts.length} smjena iz prethodne sesije`);
    }
  }

  function updateSidebarInfo() {
    const name = state.lastFileName || 'Ručno unesene smjene';
    document.getElementById('sidebar-file-info').textContent =
      `💾 ${name}\n${state.allShifts.length} smjena`;
  }

  // ── Init ──────────────────────────────────────────────────────────
  function init() {
    applyTheme(state.theme);
    applyBg();
    setupTitleBar();
    setupNavigation();
    setupImportPage();
    setupCalendarPage();
    setupEditPage();
    setupExportPage();
    setupRemindersPage();
    setupThemesPage();
    setupModals();
    renderReminderCal();
    renderReminderList();

    if (window.api) {
      window.api.on('prepare-print', () => document.getElementById('print-overlay').classList.remove('hidden'));
      window.api.on('print-done',    () => document.getElementById('print-overlay').classList.add('hidden'));
      window.api.on('load-persisted-data', (data) => {
        if (data && data.shifts && data.shifts.length > 0) {
          state.allShifts    = data.shifts;
          state.people       = data.people || [...new Set(data.shifts.map(s=>s.person))].sort();
          state.lastFileName = data.lastFileName || null;
          updateSidebarInfo();
          renderPersonGrid();
          document.getElementById('person-picker').classList.remove('hidden');
          document.getElementById('import-info').textContent =
            `Učitano iz baze: ${state.allShifts.length} smjena za ${state.people.length} osoba.`;
          showToast(`📂 Učitano ${state.allShifts.length} smjena iz prethodne sesije`);
        }
      });
    } else {
      // browser: load from localStorage
      loadPersistedData();
    }
  }

  // ── Title Bar ─────────────────────────────────────────────────────
  function setupTitleBar() {
    document.getElementById('btn-min').onclick   = () => window.api?.minimize();
    document.getElementById('btn-max').onclick   = () => window.api?.maximize();
    document.getElementById('btn-close').onclick = () => window.api?.close();
  }

  // ── Navigation ────────────────────────────────────────────────────
  function setupNavigation() {
    document.querySelectorAll('.nav-btn').forEach(btn => {
      btn.onclick = () => goToPage(btn.dataset.page);
    });
  }
  function goToPage(id) {
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.page === id));
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById('page-' + id).classList.add('active');
  }

  // ── Import ────────────────────────────────────────────────────────
  function setupImportPage() {
    const dz = document.getElementById('drop-zone');
    document.getElementById('btn-open-file').onclick = loadFile;
    dz.onclick = (e) => { if (dz.contains(e.target)) loadFile(); };
    dz.ondragover  = (e) => { e.preventDefault(); dz.classList.add('drag'); };
    dz.ondragleave = ()  => dz.classList.remove('drag');
    dz.ondrop = (e) => {
      e.preventDefault(); dz.classList.remove('drag');
      if (e.dataTransfer.files[0]) processFile(e.dataTransfer.files[0]);
    };
    document.getElementById('search-person').oninput = (e) => {
      const q = e.target.value.toLowerCase();
      document.querySelectorAll('.person-card').forEach(c => {
        c.style.display = c.dataset.name.toLowerCase().includes(q) ? '' : 'none';
      });
    };
  }

  async function loadFile() {
    if (window.api) {
      const result = await window.api.openExcel();
      if (!result) return;
      processBase64(result.data, result.name);
    } else {
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = '.xlsx,.xls,.xlsm,.csv';
      inp.onchange = e => { if (e.target.files[0]) processFile(e.target.files[0]); };
      inp.click();
    }
  }

  function processFile(file) {
    const r = new FileReader();
    r.onload = e => processBase64(btoa(String.fromCharCode(...new Uint8Array(e.target.result))), file.name);
    r.readAsArrayBuffer(file);
  }

  function processBase64(b64, fileName) {
    try {
      const wb     = XLSX.read(b64, { type:'base64', cellDates:true, raw:false });
      const shifts = Parser.parse(wb);
      if (!shifts || !shifts.length) { alert('Nije moguće pročitati raspored iz fajla.'); return; }

      // Merge: keep manually-added shifts, add/overwrite from Excel
      const manual = state.allShifts.filter(s => s._manual);
      const merged = [...shifts, ...manual];
      // deduplicate by date+person (prefer Excel version)
      const seen = new Set();
      state.allShifts = merged.filter(s => {
        const k = s.date + '|' + s.person;
        if (seen.has(k)) return false;
        seen.add(k); return true;
      }).sort((a,b) => a.date.localeCompare(b.date));

      state.people       = [...new Set(state.allShifts.map(s=>s.person))].sort();
      state.lastFileName = fileName;
      state.selectedPerson = null;

      persistAll();
      updateSidebarInfo();
      renderPersonGrid();
      document.getElementById('person-picker').classList.remove('hidden');
      document.getElementById('import-info').textContent =
        `Učitano ${shifts.length} smjena za ${state.people.length} osoba.`;
      showToast(`✅ Fajl učitan: ${fileName}`);
    } catch(err) {
      console.error(err);
      alert('Greška pri čitanju fajla: ' + err.message);
    }
  }

  function renderPersonGrid() {
    const grid = document.getElementById('person-grid');
    grid.innerHTML = state.people.map(p => {
      const cnt = state.allShifts.filter(s => s.person === p).length;
      const ini = p.split(/\s+/).map(w=>w[0]).join('').slice(0,2);
      return `<div class="person-card" data-name="${p}" onclick="selectPerson('${ea(p)}')">
        <div class="person-avatar">${ini}</div>
        <div class="person-name">${eh(p)}</div>
        <div class="person-shifts">${cnt} smjena</div>
      </div>`;
    }).join('');
  }

  window.selectPerson = function(name) {
    state.selectedPerson = name;
    document.querySelectorAll('.person-card').forEach(c => c.classList.toggle('selected', c.dataset.name === name));
    refreshAll();
    goToPage('calendar');
  };

  function refreshAll() {
    renderCalendar();
    renderEditTable();
    renderExportPreview();
    document.getElementById('cal-person-name').textContent =
      state.selectedPerson ? `Smjene — ${state.selectedPerson}` : 'Kalendar Smjena';
  }

  // ── Calendar ──────────────────────────────────────────────────────
  function setupCalendarPage() {
    document.getElementById('cal-prev').onclick = () => {
      if (--state.calMonth < 0) { state.calMonth = 11; state.calYear--; }
      renderCalendar();
    };
    document.getElementById('cal-next').onclick = () => {
      if (++state.calMonth > 11) { state.calMonth = 0; state.calYear++; }
      renderCalendar();
    };
    document.getElementById('cal-today').onclick = () => {
      state.calYear = new Date().getFullYear();
      state.calMonth = new Date().getMonth();
      renderCalendar();
    };
  }

  function renderCalendar() {
    const { calYear:Y, calMonth:Mo, selectedPerson:person, allShifts } = state;
    document.getElementById('cal-month-label').textContent = `${MONTH_HR[Mo]} ${Y}`;

    // Stats
    if (person) {
      const stats = Parser.getMonthlyStats(allShifts, person, Y, Mo);
      document.getElementById('stat-shifts').textContent = stats.count;
      document.getElementById('stat-hours').textContent  = stats.hours + 'h';
      const next = Parser.getNextShift(allShifts, person);
      document.getElementById('stat-next').textContent   = next ? next.date.slice(5)+' '+next.startTime : '—';
      const dm = M(stats.dominantType);
      document.getElementById('stat-type').textContent   = dm.icon+' '+dm.label;
    }

    const monthStr = `${Y}-${String(Mo+1).padStart(2,'0')}`;

    // Build shift map for ALL people (show everyone in calendar)
    const shiftMap = {};
    allShifts.filter(s => s.date.startsWith(monthStr)).forEach(s => {
      (shiftMap[s.date] = shiftMap[s.date] || []).push(s);
    });

    // If a person is selected, filter to that person only in map
    const displayMap = {};
    if (person) {
      allShifts.filter(s => s.person === person && s.date.startsWith(monthStr))
        .forEach(s => (displayMap[s.date] = displayMap[s.date] || []).push(s));
    } else {
      Object.assign(displayMap, shiftMap);
    }

    const today    = new Date().toISOString().slice(0,10);
    const firstDow = (new Date(Y, Mo, 1).getDay() + 6) % 7;
    const lastDate = new Date(Y, Mo+1, 0).getDate();
    const prevLast = new Date(Y, Mo, 0).getDate();
    const grid     = document.getElementById('cal-grid');
    grid.innerHTML  = '';

    for (let i = firstDow-1; i >= 0; i--) {
      const c = document.createElement('div');
      c.className = 'cal-day other-month';
      c.innerHTML = `<div class="cal-day-num">${prevLast-i}</div>`;
      grid.appendChild(c);
    }

    for (let d = 1; d <= lastDate; d++) {
      const ds  = `${Y}-${String(Mo+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const shifts = displayMap[ds] || [];
      const dow  = new Date(ds+'T00:00:00').getDay();
      const isWeekend = dow===0||dow===6;
      const isToday   = ds===today;

      const cell = document.createElement('div');
      cell.className = ['cal-day', isToday?'today':'', shifts.length?'has-shift':'', isWeekend?'weekend':''].filter(Boolean).join(' ');

      let html = `<div class="cal-day-num">${d}${isToday?'<span class="today-dot"></span>':''}</div>`;

      shifts.forEach(s => {
        const meta = M(s.shiftType);
        html += `<div class="shift-block" style="background:${meta.bg};border-left:3px solid ${meta.color}"
          onclick="window.openEditShift('${ds}','${ea(s.person)}')"
          title="${eh(s.person)} · ${s.startTime}–${s.endTime} · ${s.hours}h">
          <span class="shift-block-icon">${meta.icon}</span>
          <div class="shift-block-info">
            <span class="shift-block-person" style="color:${meta.text}">${eh(s.person)}</span>
            <span class="shift-block-time">${s.startTime}–${s.endTime}</span>
            <span class="shift-block-meta">${meta.label} · ${s.hours}h</span>
          </div>
        </div>`;
      });

      if (!shifts.length && person) html += `<div class="cal-day-free">slobodan</div>`;
      cell.innerHTML = html;
      grid.appendChild(cell);
    }

    // padding
    const total = firstDow + lastDate;
    const pad   = total%7===0 ? 0 : 7-(total%7);
    for (let d = 1; d <= pad; d++) {
      const c = document.createElement('div');
      c.className = 'cal-day other-month';
      c.innerHTML = `<div class="cal-day-num">${d}</div>`;
      grid.appendChild(c);
    }

    // Legend
    const usedTypes = [...new Set(Object.values(displayMap).flat().map(s=>s.shiftType))];
    document.getElementById('shift-legend').innerHTML = usedTypes.map(t => {
      const mt = M(t);
      return `<div class="legend-item"><div class="legend-dot" style="background:${mt.color}"></div>${mt.icon} ${mt.label}</div>`;
    }).join('');
  }

  // ── Edit Table ────────────────────────────────────────────────────
  function setupEditPage() {
    document.getElementById('btn-add-shift').onclick    = () => openShiftModal(null);
    document.getElementById('btn-save-changes').onclick = () => {
      persistAll();
      showToast('💾 Izmjene sačuvane u bazu!');
    };
    document.getElementById('edit-search').oninput        = renderEditTable;
    document.getElementById('edit-month-filter').onchange = renderEditTable;
  }

  function renderEditTable() {
    const person = state.selectedPerson;
    // Show all shifts if no person selected, else filter to person
    const shifts = person
      ? Parser.getShiftsForPerson(state.allShifts, person)
      : [...state.allShifts].sort((a,b) => a.date.localeCompare(b.date));

    document.getElementById('edit-person-label').textContent =
      person ? `Izmjeni smjene za: ${person}` : 'Sve smjene (sve osobe)';

    const months = [...new Set(shifts.map(s=>s.date.slice(0,7)))].sort();
    const mSel   = document.getElementById('edit-month-filter');
    const curMon = mSel.value;
    mSel.innerHTML = '<option value="">Svi mjeseci</option>' +
      months.map(m => {
        const [y,mo] = m.split('-');
        return `<option value="${m}">${MONTH_HR[parseInt(mo)-1]} ${y}</option>`;
      }).join('');
    if (curMon) mSel.value = curMon;

    const search    = document.getElementById('edit-search').value.toLowerCase();
    const monFilter = mSel.value;
    const filtered  = shifts.filter(s => {
      if (monFilter && !s.date.startsWith(monFilter)) return false;
      if (search && !s.date.includes(search)
        && !(s.startTime||'').includes(search)
        && !(s.person||'').toLowerCase().includes(search)) return false;
      return true;
    });

    const tbody = document.getElementById('edit-tbody');
    if (!filtered.length) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:32px;color:var(--text-dim)">
        Nema smjena za odabrane filtere</td></tr>`;
      return;
    }

    tbody.innerHTML = filtered.map(s => {
      const d    = new Date(s.date+'T00:00:00');
      const meta = M(s.shiftType);
      const isManual = s._manual ? '✏️' : '';
      return `<tr>
        <td>
          <div style="display:flex;align-items:center;gap:8px">
            <div style="width:28px;height:28px;border-radius:50%;background:${meta.bg};border:1px solid ${meta.color};
              display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:${meta.text};flex-shrink:0">
              ${s.person.slice(0,2)}
            </div>
            <span style="font-weight:600;color:var(--text)">${eh(s.person)}</span>
            ${isManual ? `<span style="font-size:10px;color:var(--accent);opacity:.7" title="Ručno dodana">✏️</span>` : ''}
          </div>
        </td>
        <td>${s.date}</td>
        <td style="color:var(--text-mid)">${DAY_HR[d.getDay()]}</td>
        <td><strong>${s.startTime}</strong></td>
        <td><strong>${s.endTime}</strong></td>
        <td>
          <span style="background:${meta.bg};border:1px solid ${meta.color};color:${meta.text};
            padding:3px 10px;border-radius:20px;font-size:12px;font-weight:600;white-space:nowrap;display:inline-flex;align-items:center;gap:4px">
            ${meta.icon} ${meta.label}
          </span>
        </td>
        <td style="color:var(--accent);font-weight:700">${s.hours}h</td>
        <td>
          <button class="icon-btn" title="Izmijeni" style="margin-right:4px"
            onclick="window.openEditShift('${s.date}','${ea(s.person)}')">✏️</button>
          <button class="icon-btn" title="Obriši"
            onclick="window.deleteShift('${s.date}','${ea(s.person)}')">🗑️</button>
        </td>
      </tr>`;
    }).join('');
  }

  window.openEditShift = (date, person) => openShiftModal({ date, person });

  window.deleteShift = function(date, person) {
    if (!confirm(`Obriši smjenu za ${person} na ${date}?`)) return;
    state.allShifts = state.allShifts.filter(s => !(s.date===date && s.person===person));
    persistAll();
    renderEditTable();
    renderCalendar();
    showToast('🗑️ Smjena obrisana');
  };

  // ── Export ────────────────────────────────────────────────────────
  function setupExportPage() {
    document.getElementById('btn-export-excel').onclick = async () => {
      if (!state.selectedPerson) { alert('Odaberi osobu prvo!'); return; }
      const opts = {
        allMonths: document.getElementById('exp-all-months').checked,
        stats:     document.getElementById('exp-stats').checked,
        colors:    document.getElementById('exp-colors').checked
      };
      const b64  = Exporter.exportExcel(state.allShifts, state.selectedPerson, opts);
      const name = `smjene_${state.selectedPerson.replace(/\s+/g,'_')}.xlsx`;
      if (window.api) { await window.api.saveExcel({ defaultName:name, base64:b64 }); }
      else { const a=document.createElement('a'); a.href='data:application/octet-stream;base64,'+b64; a.download=name; a.click(); }
    };
    document.getElementById('btn-export-pdf').onclick = async () => {
      if (!state.selectedPerson) { alert('Odaberi osobu prvo!'); return; }
      const html = Exporter.buildPrintHTML(state.allShifts, state.selectedPerson, state.calYear, state.calMonth);
      if (window.api) {
        document.getElementById('print-content').innerHTML = html;
        await window.api.exportPdf({ defaultName:`smjene_${state.selectedPerson.replace(/\s+/g,'_')}.pdf` });
      } else { const w=window.open(''); w.document.write(html); w.document.close(); setTimeout(()=>w.print(),300); }
    };
  }

  function renderExportPreview() {
    const p = state.selectedPerson; if (!p) return;
    const sh  = Parser.getShiftsForPerson(state.allShifts, p);
    const mon = [...new Set(sh.map(s=>s.date.slice(0,7)))].length;
    const hrs = sh.reduce((s,x)=>s+(x.hours||0),0).toFixed(1);
    document.getElementById('export-preview-content').innerHTML =
      `<strong>${eh(p)}</strong> — ${sh.length} smjena u ${mon} mj. · <strong>${hrs}h</strong> rada<br>
      <span style="color:var(--text-mid);font-size:12px">Raspon: ${sh[0]?.date||'—'} → ${sh[sh.length-1]?.date||'—'}</span>`;
  }

  // ── Modal ─────────────────────────────────────────────────────────
  function setupModals() {
    document.getElementById('modal-shift-close').onclick  = () => closeModal('modal-shift');
    document.getElementById('modal-shift-cancel').onclick = () => closeModal('modal-shift');
    document.getElementById('modal-shift-save').onclick   = saveShift;
    document.getElementById('modal-rem-close').onclick    = () => closeModal('modal-reminder');
    document.getElementById('modal-rem-cancel').onclick   = () => closeModal('modal-reminder');
    document.getElementById('modal-rem-save').onclick     = saveReminder;

    const presets = { night:['00:00','06:30'], morning:['06:30','12:00'], afternoon:['12:00','18:00'], evening:['18:00','00:00'] };
    document.getElementById('ms-type').onchange = (e) => {
      const p = presets[e.target.value];
      if (p) { document.getElementById('ms-start').value=p[0]; document.getElementById('ms-end').value=p[1]; }
    };
  }

  function openShiftModal(shiftOrNull) {
    const pInp  = document.getElementById('ms-person');
    const pList = document.getElementById('ms-person-list');
    pList.innerHTML = state.people.map(p=>`<option value="${ea(p)}">`).join('');

    if (shiftOrNull) {
      const { date, person } = shiftOrNull;
      const ex = state.allShifts.find(s => s.date===date && s.person===person);
      document.getElementById('modal-shift-title').textContent = 'Izmijeni Smjenu';
      pInp.value = person || '';
      document.getElementById('ms-date').value  = date || '';
      if (ex) {
        document.getElementById('ms-start').value = ex.startTime || '';
        document.getElementById('ms-end').value   = ex.endTime   || '';
        document.getElementById('ms-type').value  = ex.shiftType || 'morning';
        document.getElementById('ms-note').value  = ex.note      || '';
      }
      state.editingShift = { date, person };
    } else {
      document.getElementById('modal-shift-title').textContent = 'Dodaj Smjenu';
      pInp.value = state.selectedPerson || '';
      document.getElementById('ms-date').value  = new Date().toISOString().slice(0,10);
      document.getElementById('ms-start').value = '06:30';
      document.getElementById('ms-end').value   = '12:00';
      document.getElementById('ms-type').value  = 'morning';
      document.getElementById('ms-note').value  = '';
      state.editingShift = null;
    }
    document.getElementById('modal-shift').classList.remove('hidden');
    setTimeout(() => pInp.focus(), 80);
  }

  function saveShift() {
    const raw   = document.getElementById('ms-person').value.trim();
    const date  = document.getElementById('ms-date').value.trim();
    const start = document.getElementById('ms-start').value.trim();
    const end   = document.getElementById('ms-end').value.trim();
    const type  = document.getElementById('ms-type').value;
    const note  = document.getElementById('ms-note').value.trim();

    if (!raw||!date||!start||!end) { alert('Popuni sva obavezna polja!'); return; }

    const person   = raw.toUpperCase();
    const hours    = Parser.calcHours(start, end);
    const newShift = { person, date, startTime:start, endTime:end, shiftType:type, hours, note, _manual:true };

    if (state.editingShift) {
      const { date:od, person:op } = state.editingShift;
      state.allShifts = state.allShifts.filter(s => !(s.date===od && s.person===op));
    }

    state.allShifts.push(newShift);
    state.allShifts.sort((a,b) => a.date.localeCompare(b.date));

    if (!state.people.includes(person)) { state.people.push(person); state.people.sort(); }

    state.selectedPerson = person;
    const [sy,sm] = date.split('-').map(Number);
    state.calYear  = sy;
    state.calMonth = sm-1;

    persistAll();   // ← save to disk immediately
    closeModal('modal-shift');
    refreshAll();
    renderPersonGrid();
    updateSidebarInfo();
    showToast(`✅ Smjena sačuvana za ${person}`);
  }

  function closeModal(id) { document.getElementById(id).classList.add('hidden'); }

  // ── Reminders ─────────────────────────────────────────────────────
  function setupRemindersPage() {
    document.getElementById('btn-add-reminder').onclick = () => {
      ['rem-title','rem-desc'].forEach(id => document.getElementById(id).value='');
      document.getElementById('rem-date').value='';
      document.getElementById('rem-category').value='work';
      document.getElementById('modal-reminder').classList.remove('hidden');
    };
    document.getElementById('rem-cal-prev').onclick = () => {
      if(--state.remMonth<0){state.remMonth=11;state.remYear--;} renderReminderCal();
    };
    document.getElementById('rem-cal-next').onclick = () => {
      if(++state.remMonth>11){state.remMonth=0;state.remYear++;} renderReminderCal();
    };
    document.querySelectorAll('.filter-chip').forEach(btn => {
      btn.onclick = () => {
        document.querySelectorAll('.filter-chip').forEach(b=>b.classList.remove('active'));
        btn.classList.add('active'); state.remFilter=btn.dataset.filter; renderReminderList();
      };
    });
  }

  function renderReminderCal() {
    const {remYear:y,remMonth:m} = state;
    document.getElementById('rem-cal-label').textContent = `${MONTH_HR[m]} ${y}`;
    const fd = (new Date(y,m,1).getDay()+6)%7;
    const ld = new Date(y,m+1,0).getDate();
    const today = new Date().toISOString().slice(0,10);
    const rds   = new Set(state.reminders.map(r=>r.date));
    const grid  = document.getElementById('rem-grid');
    grid.innerHTML = '';
    for(let i=0;i<fd;i++){const e=document.createElement('div');e.className='rem-day other-month';grid.appendChild(e);}
    for(let d=1;d<=ld;d++){
      const ds=`${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const e=document.createElement('div');
      e.className='rem-day'+(ds===today?' today':'')+(rds.has(ds)?' has-reminder':'');
      e.textContent=d;
      e.onclick=()=>{
        document.getElementById('rem-date').value=ds;
        document.getElementById('rem-title').value='';
        document.getElementById('rem-desc').value='';
        document.getElementById('modal-reminder').classList.remove('hidden');
      };
      grid.appendChild(e);
    }
  }

  function renderReminderList() {
    const list=document.getElementById('reminder-list');
    let rems=[...state.reminders];
    if(state.remFilter!=='all') rems=rems.filter(r=>r.category===state.remFilter);
    rems.sort((a,b)=>a.date.localeCompare(b.date));
    if(!rems.length){list.innerHTML='<div class="no-reminders">Nema podsjetnika</div>';return;}
    list.innerHTML=rems.map((r,i)=>`
      <div class="reminder-item">
        <div class="reminder-dot cat-${r.category}"></div>
        <div class="reminder-body">
          <div class="reminder-title">${eh(r.title)}</div>
          <div class="reminder-meta">${r.date} · ${r.category==='work'?'Posao':r.category==='personal'?'Lično':'Hitno'}</div>
          ${r.desc?`<div class="reminder-desc">${eh(r.desc)}</div>`:''}
        </div>
        <button class="reminder-del" onclick="window.deleteReminder(${i})">✕</button>
      </div>`).join('');
  }

  function saveReminder() {
    const t=document.getElementById('rem-title').value.trim();
    const d=document.getElementById('rem-date').value;
    const c=document.getElementById('rem-category').value;
    const desc=document.getElementById('rem-desc').value.trim();
    if(!t||!d){alert('Unesi naslov i datum!');return;}
    state.reminders.push({title:t,date:d,category:c,desc});
    localStorage.setItem('reminders',JSON.stringify(state.reminders));
    closeModal('modal-reminder');
    renderReminderCal(); renderReminderList();
    showToast('🔔 Podsjetnik dodan!');
  }

  window.deleteReminder = function(i) {
    state.reminders.splice(i,1);
    localStorage.setItem('reminders',JSON.stringify(state.reminders));
    renderReminderCal(); renderReminderList();
  };

  // ── Themes ────────────────────────────────────────────────────────
  function setupThemesPage() {
    document.querySelectorAll('.theme-card').forEach(card => {
      card.onclick = () => {
        document.querySelectorAll('.theme-card').forEach(c=>c.classList.remove('active'));
        card.classList.add('active'); applyTheme(card.dataset.theme);
      };
    });
    document.getElementById('btn-pick-image').onclick = async () => {
      const u = window.api ? await window.api.openImage() : await pickImageBrowser();
      if(u){state.customBg=u;localStorage.setItem('customBg',u);applyBg();document.getElementById('current-bg-preview').textContent='✅ Slika aktivna';}
    };
    document.getElementById('btn-pick-color').onclick  = ()=>document.getElementById('bg-color-picker').click();
    document.getElementById('bg-color-picker').oninput = e=>{
      state.customBg=e.target.value;localStorage.setItem('customBg',state.customBg);
      applyBg();document.getElementById('current-bg-preview').textContent=`🎨 Boja: ${state.customBg}`;
    };
    document.getElementById('btn-reset-bg').onclick = ()=>{
      state.customBg=null;localStorage.removeItem('customBg');
      applyBg();document.getElementById('current-bg-preview').textContent='Nema prilagođene pozadine';
    };
    document.getElementById('bg-opacity').oninput = e=>{
      state.bgOpacity=e.target.value;localStorage.setItem('bgOpacity',state.bgOpacity);
      document.getElementById('bg-opacity-val').textContent=state.bgOpacity+'%';applyBg();
    };
    document.getElementById('bg-opacity').value=state.bgOpacity;
    document.getElementById('bg-opacity-val').textContent=state.bgOpacity+'%';
    const card=document.querySelector(`.theme-card[data-theme="${state.theme}"]`);
    if(card){document.querySelectorAll('.theme-card').forEach(c=>c.classList.remove('active'));card.classList.add('active');}
  }

  function applyTheme(t) { state.theme=t;localStorage.setItem('theme',t);document.documentElement.setAttribute('data-theme',t==='midnight'?'':t); }

  function applyBg() {
    const bg=state.customBg; const op=(parseFloat(state.bgOpacity)||70)/100;
    if(!bg){document.body.classList.remove('has-custom-bg');document.body.style.removeProperty('--custom-bg-url');return;}
    if(bg.startsWith('#')){document.body.classList.remove('has-custom-bg');document.body.style.backgroundColor=bg;}
    else{document.body.classList.add('has-custom-bg');document.body.style.setProperty('--custom-bg-url',`url("${bg}")`);document.body.style.setProperty('--custom-bg-opacity',op.toString());}
  }

  function pickImageBrowser() {
    return new Promise(res=>{
      const i=document.createElement('input');i.type='file';i.accept='image/*';
      i.onchange=e=>{const f=e.target.files[0];if(!f){res(null);return;}const r=new FileReader();r.onload=ev=>res(ev.target.result);r.readAsDataURL(f);};
      i.click();
    });
  }

  // ── Utils ─────────────────────────────────────────────────────────
  function showToast(msg) {
    const el=document.createElement('div');
    el.style.cssText='position:fixed;bottom:24px;right:24px;z-index:9999;background:var(--accent);color:var(--bg-deep);padding:12px 20px;border-radius:10px;font-size:13px;font-weight:700;box-shadow:0 4px 20px rgba(0,0,0,.4);pointer-events:none;animation:slideUp .2s ease';
    el.textContent=msg; document.body.appendChild(el); setTimeout(()=>el.remove(),2800);
  }
  function eh(s)  { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function ea(s)  { return String(s||'').replace(/\\/g,'\\\\').replace(/'/g,"\\'"); }

  document.addEventListener('DOMContentLoaded', init);
})();
