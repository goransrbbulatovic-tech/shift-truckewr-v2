/* app.js — Main application controller */
(() => {
  // ── State ──────────────────────────────────────────────────────────
  const state = {
    allShifts: [],
    people: [],
    selectedPerson: null,
    calYear: new Date().getFullYear(),
    calMonth: new Date().getMonth(),
    remYear: new Date().getFullYear(),
    remMonth: new Date().getMonth(),
    reminders: JSON.parse(localStorage.getItem('reminders') || '[]'),
    remFilter: 'all',
    editingShiftId: null,
    theme: localStorage.getItem('theme') || 'midnight',
    customBg: localStorage.getItem('customBg') || null,
    bgOpacity: localStorage.getItem('bgOpacity') || '70'
  };

  const MONTH_HR = ['Januar','Februar','Mart','April','Maj','Juni',
                    'Juli','August','Septembar','Oktobar','Novembar','Decembar'];
  const DAY_HR   = ['Nedjelja','Ponedjeljak','Utorak','Srijeda','Četvrtak','Petak','Subota'];
  const SHIFT_LABELS = { night:'Noćna',morning:'Jutarnja',afternoon:'Poslijepodnevna',evening:'Večernja',custom:'Prilag.' };
  const SHIFT_BADGE  = { night:'badge-night',morning:'badge-morning',afternoon:'badge-afternoon',evening:'badge-evening',custom:'badge-custom' };
  const SHIFT_DOT    = { night:'#3b4fd0',morning:'#d97706',afternoon:'#0891b2',evening:'#7c3aed',custom:'#059669' };

  // ── Init ───────────────────────────────────────────────────────────
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

    // Listen for print events
    if (window.api) {
      window.api.on('prepare-print', () => {
        document.getElementById('print-overlay').classList.remove('hidden');
      });
      window.api.on('print-done', () => {
        document.getElementById('print-overlay').classList.add('hidden');
      });
    }
  }

  // ── Title Bar ──────────────────────────────────────────────────────
  function setupTitleBar() {
    document.getElementById('btn-min').onclick   = () => window.api?.minimize();
    document.getElementById('btn-max').onclick   = () => window.api?.maximize();
    document.getElementById('btn-close').onclick = () => window.api?.close();
  }

  // ── Navigation ─────────────────────────────────────────────────────
  function setupNavigation() {
    document.querySelectorAll('.nav-btn').forEach(btn => {
      btn.onclick = () => {
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById('page-' + btn.dataset.page).classList.add('active');
      };
    });
  }

  function goToPage(pageId) {
    document.querySelectorAll('.nav-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.page === pageId);
    });
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById('page-' + pageId).classList.add('active');
  }

  // ── Import Page ────────────────────────────────────────────────────
  function setupImportPage() {
    const dropZone = document.getElementById('drop-zone');
    const btnOpen  = document.getElementById('btn-open-file');

    btnOpen.onclick = () => loadFile();
    dropZone.onclick = (e) => { if (e.target === dropZone || dropZone.contains(e.target)) loadFile(); };

    dropZone.ondragover = (e) => { e.preventDefault(); dropZone.classList.add('drag'); };
    dropZone.ondragleave = ()  => dropZone.classList.remove('drag');
    dropZone.ondrop = (e) => {
      e.preventDefault();
      dropZone.classList.remove('drag');
      const file = e.dataTransfer.files[0];
      if (file) processFile(file);
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
      // Browser fallback
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.xlsx,.xls,.xlsm,.csv';
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
      state.people = Parser.getPeople(shifts);
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
      const count = state.allShifts.filter(s => s.person === p).length;
      const initials = p.split(/\s+/).map(w => w[0]).join('').slice(0, 2);
      return `<div class="person-card" data-name="${p}" onclick="selectPerson('${p}')">
        <div class="person-avatar">${initials}</div>
        <div class="person-name">${p}</div>
        <div class="person-shifts">${count} smjena</div>
      </div>`;
    }).join('');
  }

  window.selectPerson = function(name) {
    state.selectedPerson = name;
    document.querySelectorAll('.person-card').forEach(c => {
      c.classList.toggle('selected', c.dataset.name === name);
    });
    updateAllForPerson();
    goToPage('calendar');
  };

  function updateAllForPerson() {
    if (!state.selectedPerson) return;
    renderCalendar();
    renderEditTable();
    renderExportPreview();
    updateCalPersonHeader();
  }

  // ── Calendar Page ──────────────────────────────────────────────────
  function setupCalendarPage() {
    document.getElementById('cal-prev').onclick = () => {
      state.calMonth--;
      if (state.calMonth < 0) { state.calMonth = 11; state.calYear--; }
      renderCalendar();
    };
    document.getElementById('cal-next').onclick = () => {
      state.calMonth++;
      if (state.calMonth > 11) { state.calMonth = 0; state.calYear++; }
      renderCalendar();
    };
    document.getElementById('cal-today').onclick = () => {
      state.calYear = new Date().getFullYear();
      state.calMonth = new Date().getMonth();
      renderCalendar();
    };
  }

  function updateCalPersonHeader() {
    document.getElementById('cal-person-name').textContent =
      state.selectedPerson ? `Smjene — ${state.selectedPerson}` : 'Kalendar Smjena';
  }

  function renderCalendar() {
    const { calYear: year, calMonth: month, selectedPerson: person, allShifts } = state;
    document.getElementById('cal-month-label').textContent = `${MONTH_HR[month]} ${year}`;

    // Stats
    if (person) {
      const stats = Parser.getMonthlyStats(allShifts, person, year, month);
      document.getElementById('stat-shifts').textContent = stats.count;
      document.getElementById('stat-hours').textContent  = stats.hours + 'h';
      const next = Parser.getNextShift(allShifts, person);
      document.getElementById('stat-next').textContent  = next ? next.date.slice(5) + ' ' + next.startTime : '—';
      document.getElementById('stat-type').textContent  = SHIFT_LABELS[stats.dominantType] || '—';
    }

    // Build calendar grid
    const firstDay = new Date(year, month, 1);
    const lastDay  = new Date(year, month + 1, 0);
    const startDow = (firstDay.getDay() + 6) % 7; // Mon=0

    const monthStr = `${year}-${String(month + 1).padStart(2, '0')}`;
    const shiftMap = {};
    if (person) {
      allShifts.filter(s => s.person === person && s.date.startsWith(monthStr))
        .forEach(s => { shiftMap[s.date] = (shiftMap[s.date] || []); shiftMap[s.date].push(s); });
    }

    const today = new Date().toISOString().slice(0, 10);
    const grid  = document.getElementById('cal-grid');
    grid.innerHTML = '';

    // Previous month padding
    const prevMonthDays = new Date(year, month, 0).getDate();
    for (let i = startDow - 1; i >= 0; i--) {
      const cell = document.createElement('div');
      cell.className = 'cal-day other-month';
      cell.innerHTML = `<div class="cal-day-num">${prevMonthDays - i}</div>`;
      grid.appendChild(cell);
    }

    // Current month days
    for (let d = 1; d <= lastDay.getDate(); d++) {
      const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const dayShifts = shiftMap[dateStr] || [];
      const cell = document.createElement('div');
      cell.className = 'cal-day' + (dateStr === today ? ' today' : '') + (dayShifts.length ? ' has-shift' : '');
      let html = `<div class="cal-day-num">${d}</div>`;
      dayShifts.forEach(s => {
        const cls = SHIFT_BADGE[s.shiftType] || 'badge-custom';
        html += `<span class="shift-badge ${cls}" title="${s.startTime}–${s.endTime} (${s.hours}h)"
          onclick="openEditShift('${dateStr}','${s.person}')">
          ${s.startTime}–${s.endTime}
        </span>`;
        html += `<div class="shift-hours">${s.hours}h &middot; ${SHIFT_LABELS[s.shiftType]||''}</div>`;
      });
      cell.innerHTML = html;
      grid.appendChild(cell);
    }

    // Next month padding
    const totalCells = startDow + lastDay.getDate();
    const remaining  = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
    for (let d = 1; d <= remaining; d++) {
      const cell = document.createElement('div');
      cell.className = 'cal-day other-month';
      cell.innerHTML = `<div class="cal-day-num">${d}</div>`;
      grid.appendChild(cell);
    }

    // Legend
    const usedTypes = [...new Set((shiftMap ? Object.values(shiftMap).flat() : []).map(s => s.shiftType))];
    const legend = document.getElementById('shift-legend');
    legend.innerHTML = usedTypes.map(t => `
      <div class="legend-item">
        <div class="legend-dot" style="background:${SHIFT_DOT[t]||'#059669'}"></div>
        ${SHIFT_LABELS[t] || t}
      </div>`).join('');
  }

  // ── Edit Page ──────────────────────────────────────────────────────
  function setupEditPage() {
    document.getElementById('btn-add-shift').onclick   = () => openShiftModal(null);
    document.getElementById('btn-save-changes').onclick = () => {
      localStorage.setItem('customShifts', JSON.stringify(state.allShifts));
      showToast('Izmjene sačuvane!');
    };
    document.getElementById('edit-search').oninput = renderEditTable;
    document.getElementById('edit-month-filter').onchange = renderEditTable;
  }

  function renderEditTable() {
    const person = state.selectedPerson;
    const shifts = person ? Parser.getShiftsForPerson(state.allShifts, person) : [];
    document.getElementById('edit-person-label').textContent =
      person ? `Izmjeni smjene za: ${person}` : 'Odaberi osobu na stranici Uvoza';

    // Populate month filter
    const months = [...new Set(shifts.map(s => s.date.slice(0,7)))].sort();
    const mSel = document.getElementById('edit-month-filter');
    const curMon = mSel.value;
    mSel.innerHTML = '<option value="">Svi mjeseci</option>' +
      months.map(m => {
        const [y,mo] = m.split('-');
        return `<option value="${m}">${MONTH_HR[parseInt(mo)-1]} ${y}</option>`;
      }).join('');
    if (curMon) mSel.value = curMon;

    // Filter
    const search = document.getElementById('edit-search').value.toLowerCase();
    const monFilter = mSel.value;
    const filtered = shifts.filter(s => {
      if (monFilter && !s.date.startsWith(monFilter)) return false;
      if (search && !s.date.includes(search) && !s.startTime.includes(search)) return false;
      return true;
    });

    const tbody = document.getElementById('edit-tbody');
    if (!filtered.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="empty-state">Nema smjena</td></tr>';
      return;
    }

    tbody.innerHTML = filtered.map((s, i) => {
      const d = new Date(s.date + 'T00:00:00');
      const dot = SHIFT_DOT[s.shiftType] || '#059669';
      return `<tr>
        <td>${s.date}</td>
        <td>${DAY_HR[d.getDay()]}</td>
        <td>${s.startTime}</td>
        <td>${s.endTime}</td>
        <td><span class="table-shift-badge"><span class="table-dot" style="background:${dot}"></span>${SHIFT_LABELS[s.shiftType]||s.shiftType}</span></td>
        <td>${s.hours}h</td>
        <td>
          <button class="icon-btn" title="Izmijeni" onclick="openEditShift('${s.date}','${s.person}')">✏️</button>
          <button class="icon-btn" title="Obriši" onclick="deleteShift('${s.date}','${s.person}')">🗑️</button>
        </td>
      </tr>`;
    }).join('');
  }

  window.openEditShift = function(date, person) {
    openShiftModal({ date, person });
  };

  window.deleteShift = function(date, person) {
    if (!confirm(`Obriši smjenu za ${person} na ${date}?`)) return;
    state.allShifts = state.allShifts.filter(s => !(s.date === date && s.person === person));
    renderEditTable();
    renderCalendar();
  };

  // ── Export Page ────────────────────────────────────────────────────
  function setupExportPage() {
    document.getElementById('btn-export-excel').onclick = async () => {
      if (!state.selectedPerson) { alert('Odaberi osobu prvo!'); return; }
      const opts = {
        allMonths: document.getElementById('exp-all-months').checked,
        stats: document.getElementById('exp-stats').checked,
        colors: document.getElementById('exp-colors').checked
      };
      const base64 = Exporter.exportExcel(state.allShifts, state.selectedPerson, opts);
      const name = `smjene_${state.selectedPerson.replace(/\s+/g,'_')}.xlsx`;
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
        const name = `smjene_${state.selectedPerson.replace(/\s+/g,'_')}.pdf`;
        await window.api.exportPdf({ defaultName: name });
      } else {
        const w = window.open('');
        w.document.write(html); w.document.close();
        setTimeout(() => { w.print(); }, 300);
      }
    };
  }

  function renderExportPreview() {
    const person = state.selectedPerson;
    if (!person) return;
    const shifts = Parser.getShiftsForPerson(state.allShifts, person);
    const months = [...new Set(shifts.map(s => s.date.slice(0,7)))].length;
    const totalHours = shifts.reduce((s,x)=>s+(x.hours||0),0).toFixed(1);
    document.getElementById('export-preview-content').innerHTML = `
      <strong>${person}</strong> — ${shifts.length} smjena u ${months} mjesec${months===1?'u':months<5?'a':'i'}
      · Ukupno <strong>${totalHours}h</strong> rada
      <br><br>
      <span style="color:var(--text-mid);font-size:12px;">
        Raspon: ${shifts[0]?.date || '—'} → ${shifts[shifts.length-1]?.date || '—'}
      </span>`;
  }

  // ── Shift Modal ────────────────────────────────────────────────────
  function setupModals() {
    document.getElementById('modal-shift-close').onclick  = () => closeModal('modal-shift');
    document.getElementById('modal-shift-cancel').onclick = () => closeModal('modal-shift');
    document.getElementById('modal-shift-save').onclick   = saveShift;

    document.getElementById('modal-rem-close').onclick   = () => closeModal('modal-reminder');
    document.getElementById('modal-rem-cancel').onclick  = () => closeModal('modal-reminder');
    document.getElementById('modal-rem-save').onclick    = saveReminder;

    // Auto-fill times when type changes
    const typeMap = {
      nocna:'00:00,06:30', jutarnja:'06:30,12:00',
      poslijepodnevna:'12:00,18:00', vecernja:'18:00,00:00'
    };
    document.getElementById('ms-type').onchange = (e) => {
      const v = typeMap[e.target.value];
      if (v) {
        const [s,en] = v.split(',');
        document.getElementById('ms-start').value = s;
        document.getElementById('ms-end').value   = en;
      }
    };
  }

  function openShiftModal(shiftOrNull) {
    const modal = document.getElementById('modal-shift');
    const personInput = document.getElementById('ms-person');
    const personList  = document.getElementById('ms-person-list');

    // Populate datalist suggestions from loaded people
    personList.innerHTML = state.people.map(p => `<option value="${p}">`).join('');

    if (shiftOrNull) {
      const { date, person } = shiftOrNull;
      const existing = state.allShifts.find(s => s.date === date && s.person === person);
      document.getElementById('modal-shift-title').textContent = 'Izmijeni Smjenu';
      personInput.value = person || state.selectedPerson || '';
      document.getElementById('ms-date').value  = date || '';
      if (existing) {
        document.getElementById('ms-start').value = existing.startTime;
        document.getElementById('ms-end').value   = existing.endTime;
        document.getElementById('ms-type').value  = existing.shiftType || 'custom';
        document.getElementById('ms-note').value  = existing.note || '';
      }
      state.editingShiftId = date + '_' + person;
    } else {
      document.getElementById('modal-shift-title').textContent = 'Dodaj Smjenu';
      personInput.value = state.selectedPerson || (state.people[0] || '');
      document.getElementById('ms-date').value  = new Date().toISOString().slice(0,10);
      document.getElementById('ms-start').value = '06:30';
      document.getElementById('ms-end').value   = '12:00';
      document.getElementById('ms-type').value  = 'morning';
      document.getElementById('ms-note').value  = '';
      state.editingShiftId = null;
    }
    // Focus the input so user can type immediately
    setTimeout(() => personInput.focus(), 50);
    modal.classList.remove('hidden');
  }

  function saveShift() {
    const person    = document.getElementById('ms-person').value;
    const date      = document.getElementById('ms-date').value;
    const startTime = document.getElementById('ms-start').value;
    const endTime   = document.getElementById('ms-end').value;
    const shiftType = document.getElementById('ms-type').value;
    const note      = document.getElementById('ms-note').value;

    if (!person.trim() || !date || !startTime || !endTime) {
      alert('Popuni sva obavezna polja!'); return;
    }
    const personName = person.trim().toUpperCase();

    const hours = Parser.calcHours(startTime, endTime);
    const newShift = { person: personName, date, startTime, endTime, shiftType, hours, note };

    // Remove existing if editing
    if (state.editingShiftId) {
      const [oldDate, ...pParts] = state.editingShiftId.split('_');
      const oldPerson = pParts.join('_');
      state.allShifts = state.allShifts.filter(s => !(s.date === oldDate && s.person === oldPerson));
    }

    state.allShifts.push(newShift);
    state.allShifts.sort((a,b) => a.date.localeCompare(b.date));

    if (!state.people.includes(personName)) {
      state.people.push(personName);
      state.people.sort();
    }

    closeModal('modal-shift');
    renderCalendar();
    renderEditTable();
    showToast('Smjena sačuvana!');
  }

  function closeModal(id) {
    document.getElementById(id).classList.add('hidden');
  }

  // ── Reminders Page ─────────────────────────────────────────────────
  function setupRemindersPage() {
    document.getElementById('btn-add-reminder').onclick = () => {
      document.getElementById('rem-title').value = '';
      document.getElementById('rem-date').value  = new Date().toISOString().slice(0,10);
      document.getElementById('rem-desc').value  = '';
      document.getElementById('rem-category').value = 'work';
      document.getElementById('modal-reminder').classList.remove('hidden');
    };

    document.getElementById('rem-cal-prev').onclick = () => {
      state.remMonth--;
      if (state.remMonth < 0) { state.remMonth = 11; state.remYear--; }
      renderReminderCal();
    };
    document.getElementById('rem-cal-next').onclick = () => {
      state.remMonth++;
      if (state.remMonth > 11) { state.remMonth = 0; state.remYear++; }
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
    const lastD    = new Date(y, m + 1, 0).getDate();
    const today    = new Date().toISOString().slice(0,10);
    const remDates = new Set(state.reminders.map(r => r.date));
    const grid = document.getElementById('rem-grid');
    grid.innerHTML = '';

    for (let i = 0; i < firstDow; i++) {
      const el = document.createElement('div');
      el.className = 'rem-day other-month';
      grid.appendChild(el);
    }
    for (let d = 1; d <= lastD; d++) {
      const dateStr = `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const el = document.createElement('div');
      el.className = 'rem-day' + (dateStr===today?' today':'') + (remDates.has(dateStr)?' has-reminder':'');
      el.textContent = d;
      el.onclick = () => {
        document.getElementById('rem-date').value = dateStr;
        document.getElementById('rem-title').value = '';
        document.getElementById('rem-desc').value  = '';
        document.getElementById('modal-reminder').classList.remove('hidden');
      };
      grid.appendChild(el);
    }
  }

  function renderReminderList() {
    const list = document.getElementById('reminder-list');
    let reminders = state.reminders;
    if (state.remFilter !== 'all') reminders = reminders.filter(r => r.category === state.remFilter);
    reminders = reminders.sort((a,b) => a.date.localeCompare(b.date));

    if (!reminders.length) {
      list.innerHTML = '<div class="no-reminders">Nema podsjetnika</div>';
      return;
    }
    list.innerHTML = reminders.map((r, i) => `
      <div class="reminder-item">
        <div class="reminder-dot cat-${r.category}"></div>
        <div class="reminder-body">
          <div class="reminder-title">${escHtml(r.title)}</div>
          <div class="reminder-meta">${r.date} · ${r.category==='work'?'Posao':r.category==='personal'?'Lično':'Hitno'}</div>
          ${r.desc ? `<div class="reminder-desc">${escHtml(r.desc)}</div>` : ''}
        </div>
        <button class="reminder-del" onclick="deleteReminder(${i})" title="Obriši">✕</button>
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
    showToast('Podsjetnik dodan!');
  }

  window.deleteReminder = function(i) {
    state.reminders.splice(i, 1);
    localStorage.setItem('reminders', JSON.stringify(state.reminders));
    renderReminderCal();
    renderReminderList();
  };

  // ── Themes Page ────────────────────────────────────────────────────
  function setupThemesPage() {
    document.querySelectorAll('.theme-card').forEach(card => {
      card.onclick = () => {
        document.querySelectorAll('.theme-card').forEach(c => c.classList.remove('active'));
        card.classList.add('active');
        applyTheme(card.dataset.theme);
      };
    });

    document.getElementById('btn-pick-image').onclick = async () => {
      let dataUrl;
      if (window.api) {
        dataUrl = await window.api.openImage();
      } else {
        dataUrl = await pickImageBrowser();
      }
      if (dataUrl) {
        state.customBg = dataUrl;
        localStorage.setItem('customBg', dataUrl);
        applyBg();
        document.getElementById('current-bg-preview').textContent = '✅ Prilagođena slika aktivna';
      }
    };

    document.getElementById('btn-pick-color').onclick = () => {
      document.getElementById('bg-color-picker').click();
    };
    document.getElementById('bg-color-picker').oninput = (e) => {
      const color = e.target.value;
      state.customBg = color;
      localStorage.setItem('customBg', color);
      applyBg();
      document.getElementById('current-bg-preview').textContent = `🎨 Boja: ${color}`;
    };

    document.getElementById('btn-reset-bg').onclick = () => {
      state.customBg = null;
      localStorage.removeItem('customBg');
      applyBg();
      document.getElementById('current-bg-preview').textContent = 'Nema prilagođene pozadine';
    };

    document.getElementById('bg-opacity').oninput = (e) => {
      const v = e.target.value;
      document.getElementById('bg-opacity-val').textContent = v + '%';
      state.bgOpacity = v;
      localStorage.setItem('bgOpacity', v);
      applyBg();
    };
    document.getElementById('bg-opacity').value = state.bgOpacity;
    document.getElementById('bg-opacity-val').textContent = state.bgOpacity + '%';

    // Set active theme card
    const card = document.querySelector(`.theme-card[data-theme="${state.theme}"]`);
    if (card) { document.querySelectorAll('.theme-card').forEach(c=>c.classList.remove('active')); card.classList.add('active'); }
  }

  function applyTheme(theme) {
    state.theme = theme;
    localStorage.setItem('theme', theme);
    document.documentElement.setAttribute('data-theme', theme === 'midnight' ? '' : theme);
  }

  function applyBg() {
    const bg = state.customBg;
    const opacity = (state.bgOpacity || 70) / 100;
    if (!bg) {
      document.body.classList.remove('has-custom-bg');
      document.body.style.removeProperty('--custom-bg-url');
      return;
    }
    document.body.classList.add('has-custom-bg');
    if (bg.startsWith('#')) {
      document.body.style.setProperty('--custom-bg-url', bg);
      document.body.style.setProperty('--custom-bg-opacity', opacity.toString());
      // For solid color, override differently
      document.body.style.backgroundColor = bg;
      document.body.classList.remove('has-custom-bg');
    } else {
      document.body.style.setProperty('--custom-bg-url', `url("${bg}")`);
      document.body.style.setProperty('--custom-bg-opacity', opacity.toString());
    }
  }

  function pickImageBrowser() {
    return new Promise(resolve => {
      const input = document.createElement('input');
      input.type = 'file'; input.accept = 'image/*';
      input.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) { resolve(null); return; }
        const reader = new FileReader();
        reader.onload = (ev) => resolve(ev.target.result);
        reader.readAsDataURL(file);
      };
      input.click();
    });
  }

  // ── Toast notification ─────────────────────────────────────────────
  function showToast(msg) {
    const el = document.createElement('div');
    el.style.cssText = `position:fixed;bottom:24px;right:24px;z-index:500;background:var(--accent);
      color:var(--bg-deep);padding:10px 18px;border-radius:8px;font-size:13px;font-weight:600;
      animation:slideUp .2s ease;pointer-events:none;`;
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2500);
  }

  function escHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // ── Boot ──────────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', init);
})();
