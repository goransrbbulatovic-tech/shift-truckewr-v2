/* app.js — Main application controller — v2 (fixed) */
(() => {

  // ── State ────────────────────────────────────────────────────────
  const state = {
    allShifts: [],
    people: [],
    selectedPerson: null,
    calYear:  new Date().getFullYear(),
    calMonth: new Date().getMonth(),
    remYear:  new Date().getFullYear(),
    remMonth: new Date().getMonth(),
    reminders: JSON.parse(localStorage.getItem('reminders') || '[]'),
    remFilter: 'all',
    editingShift: null,   // { date, person } of shift being edited
    theme:    localStorage.getItem('theme')    || 'midnight',
    customBg: localStorage.getItem('customBg') || null,
    bgOpacity: localStorage.getItem('bgOpacity') || '70'
  };

  const MONTH_HR = ['Januar','Februar','Mart','April','Maj','Juni',
                    'Juli','August','Septembar','Oktobar','Novembar','Decembar'];
  const DAY_HR   = ['Nedjelja','Ponedjeljak','Utorak','Srijeda','Četvrtak','Petak','Subota'];

  // Internal shiftType keys MUST match option values in ms-type select
  const SHIFT_META = {
    night:     { label:'Noćna',           icon:'🌙', color:'#3b4fd0', text:'#93c5fd', bg:'rgba(59,79,208,.22)'  },
    morning:   { label:'Jutarnja',         icon:'🌅', color:'#d97706', text:'#fcd34d', bg:'rgba(217,119,6,.22)'  },
    afternoon: { label:'Poslijepodnevna',  icon:'☀️',  color:'#0891b2', text:'#67e8f9', bg:'rgba(8,145,178,.22)'  },
    evening:   { label:'Večernja',         icon:'🌆', color:'#7c3aed', text:'#c4b5fd', bg:'rgba(124,58,237,.22)' },
    custom:    { label:'Prilagođena',      icon:'⚙️',  color:'#059669', text:'#6ee7b7', bg:'rgba(5,150,105,.22)'  }
  };

  function shiftMeta(type) { return SHIFT_META[type] || SHIFT_META.custom; }

  // ── Init ─────────────────────────────────────────────────────────
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

  function goToPage(pageId) {
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.page === pageId));
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById('page-' + pageId).classList.add('active');
  }

  // ── Import Page ───────────────────────────────────────────────────
  function setupImportPage() {
    const dropZone = document.getElementById('drop-zone');
    document.getElementById('btn-open-file').onclick = loadFile;
    dropZone.onclick = (e) => { if (dropZone.contains(e.target)) loadFile(); };
    dropZone.ondragover  = (e) => { e.preventDefault(); dropZone.classList.add('drag'); };
    dropZone.ondragleave = ()  => dropZone.classList.remove('drag');
    dropZone.ondrop = (e) => {
      e.preventDefault(); dropZone.classList.remove('drag');
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
      const input = document.createElement('input');
      input.type = 'file'; input.accept = '.xlsx,.xls,.xlsm,.csv';
      input.onchange = (e) => { if (e.target.files[0]) processFile(e.target.files[0]); };
      input.click();
    }
  }

  function processFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      processBase64(btoa(String.fromCharCode(...new Uint8Array(e.target.result))), file.name);
    };
    reader.readAsArrayBuffer(file);
  }

  function processBase64(b64, fileName) {
    try {
      const wb = XLSX.read(b64, { type: 'base64', cellDates: true, raw: false });
      const shifts = Parser.parse(wb);
      if (!shifts || shifts.length === 0) {
        alert('Nije moguće pročitati raspored iz fajla. Provjeri format.');
        return;
      }
      state.allShifts = shifts;
      state.people    = Parser.getPeople(shifts);
      state.selectedPerson = null;
      document.getElementById('sidebar-file-info').textContent = `📄 ${fileName}\n${shifts.length} smjena`;
      renderPersonGrid();
      document.getElementById('person-picker').classList.remove('hidden');
      document.getElementById('import-info').textContent =
        `Učitano ${shifts.length} smjena za ${state.people.length} osoba.`;
    } catch (err) {
      console.error(err);
      alert('Greška pri čitanju fajla: ' + err.message);
    }
  }

  function renderPersonGrid() {
    const grid = document.getElementById('person-grid');
    grid.innerHTML = state.people.map(p => {
      const count    = state.allShifts.filter(s => s.person === p).length;
      const initials = p.split(/\s+/).map(w => w[0]).join('').slice(0, 2);
      return `<div class="person-card" data-name="${p}" onclick="selectPerson('${escAttr(p)}')">
        <div class="person-avatar">${initials}</div>
        <div class="person-name">${escHtml(p)}</div>
        <div class="person-shifts">${count} smjena</div>
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
    document.getElementById('cal-stats-line').textContent =
      state.selectedPerson ? `${MONTH_HR[state.calMonth]} ${state.calYear}` : 'Odaberi osobu da vidiš smjene';
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
    const { calYear: Y, calMonth: M, selectedPerson: person, allShifts } = state;
    document.getElementById('cal-month-label').textContent = `${MONTH_HR[M]} ${Y}`;

    // ── Stats ──
    if (person) {
      const stats = Parser.getMonthlyStats(allShifts, person, Y, M);
      document.getElementById('stat-shifts').textContent = stats.count;
      document.getElementById('stat-hours').textContent  = stats.hours + 'h';
      const next = Parser.getNextShift(allShifts, person);
      document.getElementById('stat-next').textContent  = next ? next.date.slice(5) + ' ' + next.startTime : '—';
      document.getElementById('stat-type').textContent  = shiftMeta(stats.dominantType).icon + ' ' + shiftMeta(stats.dominantType).label;
    }

    // ── Build shift map for this month ──
    const monthStr = `${Y}-${String(M+1).padStart(2,'0')}`;
    const shiftMap = {};
    if (person) {
      allShifts.filter(s => s.person === person && s.date.startsWith(monthStr))
        .forEach(s => { (shiftMap[s.date] = shiftMap[s.date] || []).push(s); });
    }

    const today    = new Date().toISOString().slice(0,10);
    const firstDow = (new Date(Y, M, 1).getDay() + 6) % 7;
    const lastDate = new Date(Y, M+1, 0).getDate();
    const prevLast = new Date(Y, M, 0).getDate();
    const grid     = document.getElementById('cal-grid');
    grid.innerHTML = '';

    // prev month padding
    for (let i = firstDow-1; i >= 0; i--) {
      const c = document.createElement('div');
      c.className = 'cal-day other-month';
      c.innerHTML = `<div class="cal-day-num">${prevLast - i}</div>`;
      grid.appendChild(c);
    }

    // current month
    for (let d = 1; d <= lastDate; d++) {
      const dateStr   = `${Y}-${String(M+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const dayShifts = shiftMap[dateStr] || [];
      const isToday   = dateStr === today;
      const isWeekend = (() => { const dw = new Date(dateStr+'T00:00:00').getDay(); return dw===0||dw===6; })();

      const cell = document.createElement('div');
      cell.className = ['cal-day', isToday?'today':'', dayShifts.length?'has-shift':'', isWeekend?'weekend':''].filter(Boolean).join(' ');

      let html = `<div class="cal-day-num">${d}${isToday?'<span class="today-dot"></span>':''}</div>`;

      dayShifts.forEach(s => {
        const m = shiftMeta(s.shiftType);
        html += `<div class="shift-block" style="background:${m.bg};border-left:3px solid ${m.color}"
          onclick="window.openEditShift('${dateStr}','${escAttr(s.person)}')"
          title="${s.startTime}–${s.endTime} · ${s.hours}h">
          <span class="shift-block-icon">${m.icon}</span>
          <span class="shift-block-time">${s.startTime}–${s.endTime}</span>
          <span class="shift-block-label">${m.label}</span>
          <span class="shift-block-hrs">${s.hours}h</span>
        </div>`;
      });

      if (!dayShifts.length && person) {
        html += `<div class="cal-day-free">slobodan</div>`;
      }

      cell.innerHTML = html;
      grid.appendChild(cell);
    }

    // next month padding
    const total = firstDow + lastDate;
    const pad   = total % 7 === 0 ? 0 : 7 - (total % 7);
    for (let d = 1; d <= pad; d++) {
      const c = document.createElement('div');
      c.className = 'cal-day other-month';
      c.innerHTML = `<div class="cal-day-num">${d}</div>`;
      grid.appendChild(c);
    }

    // ── Legend ──
    const usedTypes = [...new Set(Object.values(shiftMap).flat().map(s => s.shiftType))];
    document.getElementById('shift-legend').innerHTML = usedTypes.map(t => {
      const m = shiftMeta(t);
      return `<div class="legend-item">
        <div class="legend-dot" style="background:${m.color}"></div>
        ${m.icon} ${m.label}
      </div>`;
    }).join('');
  }

  // ── Edit Table ────────────────────────────────────────────────────
  function setupEditPage() {
    document.getElementById('btn-add-shift').onclick    = () => openShiftModal(null);
    document.getElementById('btn-save-changes').onclick = () => {
      localStorage.setItem('customShifts', JSON.stringify(state.allShifts));
      showToast('Izmjene sačuvane! ✅');
    };
    document.getElementById('edit-search').oninput          = renderEditTable;
    document.getElementById('edit-month-filter').onchange   = renderEditTable;
  }

  function renderEditTable() {
    const person = state.selectedPerson;
    const shifts = person ? Parser.getShiftsForPerson(state.allShifts, person) : [];

    document.getElementById('edit-person-label').textContent =
      person ? `Izmjeni smjene za: ${person}` : 'Odaberi osobu na stranici Uvoza';

    // populate month filter
    const months = [...new Set(shifts.map(s => s.date.slice(0,7)))].sort();
    const mSel   = document.getElementById('edit-month-filter');
    const curMon = mSel.value;
    mSel.innerHTML = '<option value="">Svi mjeseci</option>' +
      months.map(m => {
        const [y, mo] = m.split('-');
        return `<option value="${m}">${MONTH_HR[parseInt(mo)-1]} ${y}</option>`;
      }).join('');
    if (curMon) mSel.value = curMon;

    const search    = document.getElementById('edit-search').value.toLowerCase();
    const monFilter = mSel.value;
    const filtered  = shifts.filter(s => {
      if (monFilter && !s.date.startsWith(monFilter)) return false;
      if (search && !s.date.includes(search) && !(s.startTime||'').includes(search) && !(s.person||'').toLowerCase().includes(search)) return false;
      return true;
    });

    const tbody = document.getElementById('edit-tbody');
    if (!filtered.length) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--text-dim);">
        ${person ? 'Nema smjena za odabrane filtere' : 'Odaberi osobu na stranici Uvoza'}
      </td></tr>`;
      return;
    }

    tbody.innerHTML = filtered.map(s => {
      const d = new Date(s.date + 'T00:00:00');
      const m = shiftMeta(s.shiftType);
      // encode for onclick attributes safely
      const safeDate   = s.date;
      const safePerson = escAttr(s.person);
      return `<tr>
        <td>${s.date}</td>
        <td>${DAY_HR[d.getDay()]}</td>
        <td><strong>${s.startTime}</strong></td>
        <td><strong>${s.endTime}</strong></td>
        <td>
          <span class="table-shift-badge" style="background:${m.bg};border:1px solid ${m.color};color:${m.text};padding:3px 10px;border-radius:20px;font-size:12px;font-weight:600;white-space:nowrap">
            ${m.icon} ${m.label}
          </span>
        </td>
        <td style="color:var(--accent);font-weight:700">${s.hours}h</td>
        <td>
          <button class="icon-btn" title="Izmijeni" style="margin-right:4px" onclick="window.openEditShift('${safeDate}','${safePerson}')">✏️</button>
          <button class="icon-btn" title="Obriši" onclick="window.deleteShift('${safeDate}','${safePerson}')">🗑️</button>
        </td>
      </tr>`;
    }).join('');
  }

  window.openEditShift = function(date, person) { openShiftModal({ date, person }); };

  window.deleteShift = function(date, person) {
    if (!confirm(`Obriši smjenu za ${person} na ${date}?`)) return;
    state.allShifts = state.allShifts.filter(s => !(s.date === date && s.person === person));
    renderEditTable();
    renderCalendar();
    showToast('Smjena obrisana!');
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
      const base64 = Exporter.exportExcel(state.allShifts, state.selectedPerson, opts);
      const name   = `smjene_${state.selectedPerson.replace(/\s+/g,'_')}.xlsx`;
      if (window.api) {
        await window.api.saveExcel({ defaultName: name, base64 });
      } else {
        const a = document.createElement('a');
        a.href = 'data:application/octet-stream;base64,' + base64;
        a.download = name; a.click();
      }
    };

    document.getElementById('btn-export-pdf').onclick = async () => {
      if (!state.selectedPerson) { alert('Odaberi osobu prvo!'); return; }
      const html = Exporter.buildPrintHTML(state.allShifts, state.selectedPerson, state.calYear, state.calMonth);
      if (window.api) {
        document.getElementById('print-content').innerHTML = html;
        await window.api.exportPdf({ defaultName: `smjene_${state.selectedPerson.replace(/\s+/g,'_')}.pdf` });
      } else {
        const w = window.open(''); w.document.write(html); w.document.close();
        setTimeout(() => w.print(), 300);
      }
    };
  }

  function renderExportPreview() {
    const person = state.selectedPerson;
    if (!person) return;
    const shifts     = Parser.getShiftsForPerson(state.allShifts, person);
    const months     = [...new Set(shifts.map(s => s.date.slice(0,7)))].length;
    const totalHours = shifts.reduce((s,x)=>s+(x.hours||0),0).toFixed(1);
    document.getElementById('export-preview-content').innerHTML = `
      <strong>${escHtml(person)}</strong> — ${shifts.length} smjena u ${months} mjesec${months===1?'u':months<5?'a':'i'}
      · Ukupno <strong>${totalHours}h</strong> rada<br><br>
      <span style="color:var(--text-mid);font-size:12px;">
        Raspon: ${shifts[0]?.date||'—'} → ${shifts[shifts.length-1]?.date||'—'}
      </span>`;
  }

  // ── Shift Modal ───────────────────────────────────────────────────
  function setupModals() {
    document.getElementById('modal-shift-close').onclick  = () => closeModal('modal-shift');
    document.getElementById('modal-shift-cancel').onclick = () => closeModal('modal-shift');
    document.getElementById('modal-shift-save').onclick   = saveShift;

    document.getElementById('modal-rem-close').onclick  = () => closeModal('modal-reminder');
    document.getElementById('modal-rem-cancel').onclick = () => closeModal('modal-reminder');
    document.getElementById('modal-rem-save').onclick   = saveReminder;

    // Auto-fill start/end time when shift type selected
    const timePresets = {
      night:     ['00:00','06:30'],
      morning:   ['06:30','12:00'],
      afternoon: ['12:00','18:00'],
      evening:   ['18:00','00:00']
    };
    document.getElementById('ms-type').onchange = (e) => {
      const preset = timePresets[e.target.value];
      if (preset) {
        document.getElementById('ms-start').value = preset[0];
        document.getElementById('ms-end').value   = preset[1];
      }
    };
  }

  function openShiftModal(shiftOrNull) {
    const personInput = document.getElementById('ms-person');
    const personList  = document.getElementById('ms-person-list');

    // populate datalist
    personList.innerHTML = state.people.map(p => `<option value="${escAttr(p)}">`).join('');

    if (shiftOrNull) {
      // Editing existing
      const { date, person } = shiftOrNull;
      const existing = state.allShifts.find(s => s.date === date && s.person === person);
      document.getElementById('modal-shift-title').textContent = 'Izmijeni Smjenu';
      personInput.value = person || '';
      document.getElementById('ms-date').value  = date || '';
      if (existing) {
        document.getElementById('ms-start').value = existing.startTime || '';
        document.getElementById('ms-end').value   = existing.endTime   || '';
        document.getElementById('ms-type').value  = existing.shiftType || 'morning';
        document.getElementById('ms-note').value  = existing.note      || '';
      }
      state.editingShift = { date, person };
    } else {
      // New shift
      document.getElementById('modal-shift-title').textContent = 'Dodaj Smjenu';
      personInput.value = state.selectedPerson || '';
      document.getElementById('ms-date').value  = new Date().toISOString().slice(0,10);
      document.getElementById('ms-start').value = '06:30';
      document.getElementById('ms-end').value   = '12:00';
      document.getElementById('ms-type').value  = 'morning';
      document.getElementById('ms-note').value  = '';
      state.editingShift = null;
    }

    document.getElementById('modal-shift').classList.remove('hidden');
    setTimeout(() => personInput.focus(), 80);
  }

  function saveShift() {
    const rawPerson = document.getElementById('ms-person').value.trim();
    const date      = document.getElementById('ms-date').value.trim();
    const startTime = document.getElementById('ms-start').value.trim();
    const endTime   = document.getElementById('ms-end').value.trim();
    const shiftType = document.getElementById('ms-type').value;
    const note      = document.getElementById('ms-note').value.trim();

    if (!rawPerson || !date || !startTime || !endTime) {
      alert('Popuni sva obavezna polja!'); return;
    }

    const person = rawPerson.toUpperCase();
    const hours  = Parser.calcHours(startTime, endTime);
    const newShift = { person, date, startTime, endTime, shiftType, hours, note };

    // Remove old shift if editing
    if (state.editingShift) {
      const { date: oldDate, person: oldPerson } = state.editingShift;
      state.allShifts = state.allShifts.filter(s => !(s.date === oldDate && s.person === oldPerson));
    }

    state.allShifts.push(newShift);
    state.allShifts.sort((a,b) => a.date.localeCompare(b.date));

    // Add to people list if new
    if (!state.people.includes(person)) {
      state.people.push(person);
      state.people.sort();
    }

    // Select this person so calendar + edit table show up
    state.selectedPerson = person;

    // Navigate calendar to the month of the saved shift
    const [sy, sm] = date.split('-').map(Number);
    state.calYear  = sy;
    state.calMonth = sm - 1;

    closeModal('modal-shift');
    refreshAll();
    showToast(`✅ Smjena sačuvana za ${person}`);
  }

  function closeModal(id) { document.getElementById(id).classList.add('hidden'); }

  // ── Reminders ─────────────────────────────────────────────────────
  function setupRemindersPage() {
    document.getElementById('btn-add-reminder').onclick = () => {
      ['rem-title','rem-desc'].forEach(id => document.getElementById(id).value = '');
      document.getElementById('rem-date').value     = new Date().toISOString().slice(0,10);
      document.getElementById('rem-category').value = 'work';
      document.getElementById('modal-reminder').classList.remove('hidden');
    };
    document.getElementById('rem-cal-prev').onclick = () => {
      if (--state.remMonth < 0) { state.remMonth = 11; state.remYear--; }
      renderReminderCal();
    };
    document.getElementById('rem-cal-next').onclick = () => {
      if (++state.remMonth > 11) { state.remMonth = 0; state.remYear++; }
      renderReminderCal();
    };
    document.querySelectorAll('.filter-chip').forEach(btn => {
      btn.onclick = () => {
        document.querySelectorAll('.filter-chip').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.remFilter = btn.dataset.filter;
        renderReminderList();
      };
    });
  }

  function renderReminderCal() {
    const { remYear: y, remMonth: m } = state;
    document.getElementById('rem-cal-label').textContent = `${MONTH_HR[m]} ${y}`;
    const firstDow = (new Date(y, m, 1).getDay() + 6) % 7;
    const lastD    = new Date(y, m+1, 0).getDate();
    const today    = new Date().toISOString().slice(0,10);
    const remDates = new Set(state.reminders.map(r => r.date));
    const grid     = document.getElementById('rem-grid');
    grid.innerHTML  = '';
    for (let i = 0; i < firstDow; i++) { const el=document.createElement('div'); el.className='rem-day other-month'; grid.appendChild(el); }
    for (let d = 1; d <= lastD; d++) {
      const ds = `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const el = document.createElement('div');
      el.className = 'rem-day' + (ds===today?' today':'') + (remDates.has(ds)?' has-reminder':'');
      el.textContent = d;
      el.onclick = () => {
        document.getElementById('rem-date').value  = ds;
        document.getElementById('rem-title').value = '';
        document.getElementById('rem-desc').value  = '';
        document.getElementById('modal-reminder').classList.remove('hidden');
      };
      grid.appendChild(el);
    }
  }

  function renderReminderList() {
    const list = document.getElementById('reminder-list');
    let rems = state.reminders;
    if (state.remFilter !== 'all') rems = rems.filter(r => r.category === state.remFilter);
    rems = [...rems].sort((a,b) => a.date.localeCompare(b.date));
    if (!rems.length) { list.innerHTML = '<div class="no-reminders">Nema podsjetnika</div>'; return; }
    list.innerHTML = rems.map((r,i) => `
      <div class="reminder-item">
        <div class="reminder-dot cat-${r.category}"></div>
        <div class="reminder-body">
          <div class="reminder-title">${escHtml(r.title)}</div>
          <div class="reminder-meta">${r.date} · ${r.category==='work'?'Posao':r.category==='personal'?'Lično':'Hitno'}</div>
          ${r.desc ? `<div class="reminder-desc">${escHtml(r.desc)}</div>` : ''}
        </div>
        <button class="reminder-del" onclick="window.deleteReminder(${i})" title="Obriši">✕</button>
      </div>`).join('');
  }

  function saveReminder() {
    const title = document.getElementById('rem-title').value.trim();
    const date  = document.getElementById('rem-date').value;
    const cat   = document.getElementById('rem-category').value;
    const desc  = document.getElementById('rem-desc').value.trim();
    if (!title || !date) { alert('Unesi naslov i datum!'); return; }
    state.reminders.push({ title, date, category: cat, desc });
    localStorage.setItem('reminders', JSON.stringify(state.reminders));
    closeModal('modal-reminder');
    renderReminderCal();
    renderReminderList();
    showToast('Podsjetnik dodan! 🔔');
  }

  window.deleteReminder = function(i) {
    state.reminders.splice(i, 1);
    localStorage.setItem('reminders', JSON.stringify(state.reminders));
    renderReminderCal();
    renderReminderList();
  };

  // ── Themes ────────────────────────────────────────────────────────
  function setupThemesPage() {
    document.querySelectorAll('.theme-card').forEach(card => {
      card.onclick = () => {
        document.querySelectorAll('.theme-card').forEach(c => c.classList.remove('active'));
        card.classList.add('active');
        applyTheme(card.dataset.theme);
      };
    });
    document.getElementById('btn-pick-image').onclick = async () => {
      const dataUrl = window.api ? await window.api.openImage() : await pickImageBrowser();
      if (dataUrl) { state.customBg = dataUrl; localStorage.setItem('customBg', dataUrl); applyBg(); document.getElementById('current-bg-preview').textContent = '✅ Prilagođena slika aktivna'; }
    };
    document.getElementById('btn-pick-color').onclick = () => document.getElementById('bg-color-picker').click();
    document.getElementById('bg-color-picker').oninput = (e) => {
      state.customBg = e.target.value; localStorage.setItem('customBg', state.customBg);
      applyBg(); document.getElementById('current-bg-preview').textContent = `🎨 Boja: ${state.customBg}`;
    };
    document.getElementById('btn-reset-bg').onclick = () => {
      state.customBg = null; localStorage.removeItem('customBg');
      applyBg(); document.getElementById('current-bg-preview').textContent = 'Nema prilagođene pozadine';
    };
    document.getElementById('bg-opacity').oninput = (e) => {
      state.bgOpacity = e.target.value; localStorage.setItem('bgOpacity', state.bgOpacity);
      document.getElementById('bg-opacity-val').textContent = state.bgOpacity + '%';
      applyBg();
    };
    document.getElementById('bg-opacity').value = state.bgOpacity;
    document.getElementById('bg-opacity-val').textContent = state.bgOpacity + '%';
    const card = document.querySelector(`.theme-card[data-theme="${state.theme}"]`);
    if (card) { document.querySelectorAll('.theme-card').forEach(c=>c.classList.remove('active')); card.classList.add('active'); }
  }

  function applyTheme(theme) {
    state.theme = theme; localStorage.setItem('theme', theme);
    document.documentElement.setAttribute('data-theme', theme === 'midnight' ? '' : theme);
  }

  function applyBg() {
    const bg = state.customBg;
    const opacity = (parseFloat(state.bgOpacity)||70) / 100;
    if (!bg) { document.body.classList.remove('has-custom-bg'); document.body.style.removeProperty('--custom-bg-url'); return; }
    if (bg.startsWith('#')) {
      document.body.classList.remove('has-custom-bg');
      document.body.style.backgroundColor = bg;
    } else {
      document.body.classList.add('has-custom-bg');
      document.body.style.setProperty('--custom-bg-url', `url("${bg}")`);
      document.body.style.setProperty('--custom-bg-opacity', opacity.toString());
    }
  }

  function pickImageBrowser() {
    return new Promise(resolve => {
      const input = document.createElement('input'); input.type='file'; input.accept='image/*';
      input.onchange = (e) => { const f=e.target.files[0]; if(!f){resolve(null);return;} const r=new FileReader(); r.onload=ev=>resolve(ev.target.result); r.readAsDataURL(f); };
      input.click();
    });
  }

  // ── Helpers ───────────────────────────────────────────────────────
  function showToast(msg) {
    const el = document.createElement('div');
    el.style.cssText = `position:fixed;bottom:24px;right:24px;z-index:9999;background:var(--accent);
      color:var(--bg-deep);padding:12px 20px;border-radius:10px;font-size:13px;font-weight:700;
      box-shadow:0 4px 20px rgba(0,0,0,.4);pointer-events:none;animation:slideUp .2s ease;`;
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2800);
  }

  function escHtml(s)  { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function escAttr(s)  { return String(s).replace(/'/g,"\\'"); }

  document.addEventListener('DOMContentLoaded', init);
})();
