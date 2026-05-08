/* app.js — v4: all 10 features */
(() => {
  // ── Person color palette (feature 7) ────────────────────────────
  const PERSON_PALETTE = [
    '#06b6d4','#f59e0b','#8b5cf6','#22c55e','#f43f5e','#fb923c',
    '#34d399','#a78bfa','#fbbf24','#38bdf8','#f472b6','#4ade80'
  ];
  const personColorCache = {};
  let   personColorIdx = 0;
  function personColor(name) {
    if (!personColorCache[name]) {
      personColorCache[name] = PERSON_PALETTE[personColorIdx++ % PERSON_PALETTE.length];
    }
    return personColorCache[name];
  }
  function hexToRgba(hex, a) {
    const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
    return `rgba(${r},${g},${b},${a})`;
  }

  // ── Avatar helpers ────────────────────────────────────────────────
  function getAvatar(name) { return proj()?.avatarMap?.[name] || null; }

  function setAvatar(name, dataUrl) {
    if (!proj()) return;
    if (!proj().avatarMap) proj().avatarMap = {};
    proj().avatarMap[name] = dataUrl;
    persistAll();
  }

  async function resizeToAvatar(dataUrl, size=72) {
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = size; canvas.height = size;
        const ctx = canvas.getContext('2d');
        // centre-crop to square
        const sq = Math.min(img.width, img.height);
        const sx = (img.width  - sq) / 2;
        const sy = (img.height - sq) / 2;
        ctx.beginPath(); ctx.arc(size/2,size/2,size/2,0,Math.PI*2); ctx.clip();
        ctx.drawImage(img, sx, sy, sq, sq, 0, 0, size, size);
        resolve(canvas.toDataURL('image/jpeg', 0.75));
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    });
  }

  // Returns HTML for avatar — img if set, else coloured initials div
  function avatarHTML(name, size=36, showUpload=false) {
    const av  = getAvatar(name);
    const pc  = personColor(name);
    const ini = name.split(/\s+/).map(w=>w[0]).join('').slice(0,2);
    const uploadBtn = showUpload
      ? `<div class="avatar-upload-btn" onclick="window.uploadAvatar('${ea(name)}')" title="Promijeni sliku">📷</div>`
      : '';
    const inner = av
      ? `<img src="${av}" class="avatar-img" style="width:${size}px;height:${size}px;border:2px solid ${pc}" alt="${eh(name)}">`
      : `<div class="avatar-initials" style="width:${size}px;height:${size}px;font-size:${Math.round(size*.38)}px;background:${hexToRgba(pc,.15)};border:2px solid ${pc};color:${pc}">${ini}</div>`;
    return `<div class="avatar-wrap">${inner}${uploadBtn}</div>`;
  }

  window.uploadAvatar = async function(name) {
    let dataUrl;
    if (window.api) {
      dataUrl = await window.api.openImage();
    } else {
      dataUrl = await pickImageBrowser();
    }
    if (!dataUrl) return;
    const resized = await resizeToAvatar(dataUrl);
    setAvatar(name, resized);
    // Re-render everywhere avatars appear
    renderPersonGrid();
    renderPeopleChips();
    renderExportPersonList();
    if (selPerson()===name) renderExportShiftDetail(name);
    renderEditTable();
    renderCalendar();   // ← calendar shift blocks now show avatar
    renderWeekly();     // ← weekly view too
    showToast(`✅ Avatar ažuriran: ${name}`);
  };

  // ── State ────────────────────────────────────────────────────────
  const state = {
    projects: [],          // [{ id, name, shifts, people, filePath, fileName }]
    currentProjectId: null,
    calYear:   new Date().getFullYear(),
    calMonth:  new Date().getMonth(),
    weekStart: getMonday(new Date()),
    remYear:   new Date().getFullYear(),
    remMonth:  new Date().getMonth(),
    reminders: JSON.parse(localStorage.getItem('reminders') || '[]'),
    remFilter: 'all',
    editingShift: null,
    copyMode:  null,       // { type:'week'|'month', shifts:[] }
    exportActivePerson: null,  // tracks which person is shown in export detail
    theme:     localStorage.getItem('theme')    || 'midnight',
    customBg:  localStorage.getItem('customBg') || null,
    bgOpacity: localStorage.getItem('bgOpacity') || '70',
    settings:  {}
  };

  // ── Computed getters ─────────────────────────────────────────────
  function proj()    { return state.projects.find(p => p.id === state.currentProjectId) || null; }
  function shifts()  { return proj()?.shifts  || []; }
  function people()  { return proj()?.people  || []; }
  function selPerson(){ return proj()?.selectedPerson || null; }
  function setSelPerson(name) { if(proj()) proj().selectedPerson = name; }

  // ── SHIFT_META ───────────────────────────────────────────────────
  const SHIFT_META = {
    night:     { label:'Noćna',          icon:'🌙', color:'#3b4fd0', text:'#93c5fd', bg:'rgba(59,79,208,.22)'  },
    morning:   { label:'Jutarnja',        icon:'🌅', color:'#d97706', text:'#fcd34d', bg:'rgba(217,119,6,.22)'  },
    afternoon: { label:'Poslijepodnevna', icon:'☀️',  color:'#0891b2', text:'#67e8f9', bg:'rgba(8,145,178,.22)'  },
    evening:   { label:'Večernja',        icon:'🌆', color:'#7c3aed', text:'#c4b5fd', bg:'rgba(124,58,237,.22)' },
    custom:    { label:'Prilagođena',     icon:'⚙️',  color:'#059669', text:'#6ee7b7', bg:'rgba(5,150,105,.22)'  }
  };
  const SM = t => SHIFT_META[t] || SHIFT_META.custom;

  const MONTH_HR = ['Januar','Februar','Mart','April','Maj','Juni','Juli','August','Septembar','Oktobar','Novembar','Decembar'];
  const DAY_HR   = ['Nedjelja','Ponedjeljak','Utorak','Srijeda','Četvrtak','Petak','Subota'];
  const DAY_SHORT= ['Ned','Pon','Uto','Sri','Čet','Pet','Sub'];

  // ── Helpers ──────────────────────────────────────────────────────
  function eh(s)  { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function ea(s)  { return String(s||'').replace(/\\/g,'\\\\').replace(/'/g,"\\'"); }
  function pad(n) { return String(n).padStart(2,'0'); }
  function dateStr(y,m,d) { return `${y}-${pad(m+1)}-${pad(d)}`; }

  function getMonday(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = (day===0?-6:1-day);
    d.setDate(d.getDate()+diff);
    d.setHours(0,0,0,0);
    return d;
  }

  function addDays(date, n) { const d = new Date(date); d.setDate(d.getDate()+n); return d; }

  function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2,6); }

  function showToast(msg, dur=2800) {
    const el = document.createElement('div');
    el.style.cssText='position:fixed;bottom:24px;right:24px;z-index:9999;background:var(--accent);color:var(--bg-deep);padding:12px 20px;border-radius:10px;font-size:13px;font-weight:700;box-shadow:0 4px 20px rgba(0,0,0,.4);pointer-events:none;animation:slideUp .2s ease';
    el.textContent=msg; document.body.appendChild(el); setTimeout(()=>el.remove(),dur);
  }

  // Custom prompt — window.prompt() doesn't work in Electron
  function showPrompt(title, label, defaultVal='') {
    return new Promise(resolve => {
      const modal    = document.getElementById('modal-prompt');
      const inp      = document.getElementById('modal-prompt-input');
      const okBtn    = document.getElementById('modal-prompt-ok');
      const cancelBtn= document.getElementById('modal-prompt-cancel');
      const closeBtn = document.getElementById('modal-prompt-close');
      document.getElementById('modal-prompt-title').textContent = title;
      document.getElementById('modal-prompt-label').textContent = label;
      inp.value = defaultVal;
      modal.classList.remove('hidden');
      setTimeout(()=>{ inp.focus(); inp.select(); }, 80);
      const done = (val) => {
        modal.classList.add('hidden');
        okBtn.onclick = null; cancelBtn.onclick = null; closeBtn.onclick = null;
        inp.onkeydown = null;
        resolve(val);
      };
      okBtn.onclick     = () => done(inp.value.trim() || null);
      cancelBtn.onclick = () => done(null);
      closeBtn.onclick  = () => done(null);
      inp.onkeydown     = (e) => { if(e.key==='Enter') done(inp.value.trim()||null); if(e.key==='Escape') done(null); };
    });
  }

  // ── Persist ──────────────────────────────────────────────────────
  async function persistAll() {
    const data = { projects: state.projects, currentProject: state.currentProjectId, settings: state.settings };
    if (window.api) await window.api.persistData(data);
    else {
      localStorage.setItem('rs_projects', JSON.stringify(state.projects));
      localStorage.setItem('rs_currentProject', state.currentProjectId||'');
    }
    // Only update DOM if it's ready (avoid crash during early init)
    if (document.getElementById('project-switcher')) {
      renderProjectSwitcher();
      updateSidebarInfo();
    }
  }

  function loadFromData(data) {
    if (!data) return;
    state.settings = data.settings || {};
    if (data.projects && data.projects.length) {
      state.projects = data.projects;
      // Re-assign person colors
      state.projects.forEach(p => (p.people||[]).forEach(name => personColor(name)));
      state.currentProjectId = data.currentProject || state.projects[0]?.id || null;
    } else if (data.shifts && data.shifts.length) {
      // Legacy single-project format
      const p = { id: genId(), name: data.lastFileName || 'Raspored 1', shifts: data.shifts, people: data.people||[], filePath: null, selectedPerson: null };
      state.projects = [p];
      state.currentProjectId = p.id;
    }
    applySettingsUI();
    renderProjectSwitcher();
    renderPersonGrid();
    if (state.projects.length && shifts().length) {
      document.getElementById('person-picker').classList.remove('hidden');
      document.getElementById('import-info').textContent = `Učitano iz baze: ${shifts().length} smjena za ${people().length} osoba.`;
      updateAutoImportBar();
      showToast(`📂 Učitano ${shifts().length} smjena`);
    }
    updateSidebarInfo();
    // Populate export person list on load
    setTimeout(() => renderExportPersonList(), 100);
  }

  // ── Init ─────────────────────────────────────────────────────────
  function init() {
    applyTheme(state.theme); applyBg();
    setupTitleBar(); setupNavigation(); setupImportPage();
    setupCalendarPage(); setupWeeklyPage(); setupEditPage();
    setupStatsPage(); setupExportPage(); setupRemindersPage(); setupSettingsPage();
    setupModals();
    renderReminderCal(); renderReminderList();


    // FOCUS FIX: Electron loses input focus when window loses/regains focus.
    // Re-focus the active input whenever window gets focus back.
    window.addEventListener('focus', () => {
      setTimeout(() => {
        const modal = document.querySelector('.modal-overlay:not(.hidden)');
        if (!modal) return;
        const inp = modal.querySelector('input:not([type=hidden]), textarea, select');
        if (inp && document.activeElement !== inp) inp.focus();
      }, 100);
    });

    // Also fix: clicking anywhere on overlay background should NOT steal focus from input
    document.addEventListener('mousedown', (e) => {
      const overlay = e.target.closest('.modal-overlay');
      if (overlay && !e.target.closest('.modal')) {
        e.preventDefault(); // stop focus from leaving modal
      }
    }, true);

    if (window.api) {
      window.api.on('prepare-print', () => document.getElementById('print-overlay').classList.remove('hidden'));
      window.api.on('print-done',    () => document.getElementById('print-overlay').classList.add('hidden'));
      window.api.on('load-persisted-data', loadFromData);
    } else {
      const proj_raw = localStorage.getItem('rs_projects');
      if (proj_raw) loadFromData({ projects: JSON.parse(proj_raw), currentProject: localStorage.getItem('rs_currentProject') });
    }
  }

  // ── Projects (feature 10) ────────────────────────────────────────
  function renderProjectSwitcher() {
    const sel = document.getElementById('project-switcher');
    if (!state.projects.length) {
      sel.innerHTML = '<option value="">Nema rasporeda</option>';
      return;
    }
    sel.innerHTML = state.projects.map(p => {
      const cnt  = p.shifts?.length  || 0;
      const pcnt = p.people?.length  || 0;
      const label = cnt > 0
        ? `${p.name} (${pcnt} osoba, ${cnt} smjena)`
        : p.name;
      return `<option value="${p.id}" ${p.id===state.currentProjectId?'selected':''}>${eh(label)}</option>`;
    }).join('');
  }

  function switchProject(id) {
    state.currentProjectId = id;
    persistAll();
    renderPersonGrid();
    refreshAll();
    updateSidebarInfo();
    updateAutoImportBar();
    document.getElementById('person-picker').classList.toggle('hidden', !people().length);
    document.getElementById('import-info').textContent = shifts().length ? `${shifts().length} smjena za ${people().length} osoba.` : '';
  }

  function createProject(name) {
    const p = { id:genId(), name, shifts:[], people:[], filePath:null, fileName:null, selectedPerson:null };
    state.projects.push(p);
    state.currentProjectId = p.id;
    renderProjectSwitcher();
    persistAll();
    return p;
  }

  // ── Title Bar ────────────────────────────────────────────────────
  function setupTitleBar() {
    document.getElementById('btn-min').onclick   = () => window.api?.minimize();
    document.getElementById('btn-max').onclick   = () => window.api?.maximize();
    document.getElementById('btn-close').onclick = () => window.api?.close();

    document.getElementById('project-switcher').onchange = e => switchProject(e.target.value);

    document.getElementById('btn-new-project').onclick = async () => {
      const name = await showPrompt('Novi Raspored', 'Naziv rasporeda', `Raspored ${state.projects.length+1}`);
      if (!name) return;
      createProject(name);
      showToast(`✅ Kreiran: ${name}`);
    };

    document.getElementById('btn-del-project').onclick = () => {
      const p = proj();
      if (!p) return;
      // Allow deleting even the only project — just clears it
      if (!confirm(`Obriši raspored "${p.name}"?\n\nSvi podaci (${p.shifts?.length||0} smjena) će biti trajno izgubljeni!`)) return;
      state.projects = state.projects.filter(x => x.id !== state.currentProjectId);
      state.currentProjectId = state.projects[0]?.id || null;
      if (!state.currentProjectId && state.projects.length===0) {
        // Create a blank project so app doesn't break
        const blank = { id:genId(), name:'Novi Raspored', shifts:[], people:[], selectedPerson:null };
        state.projects.push(blank);
        state.currentProjectId = blank.id;
      }
      renderProjectSwitcher();
      renderPersonGrid();
      document.getElementById('person-picker').classList.add('hidden');
      persistAll(); refreshAll(); updateSidebarInfo();
      showToast('🗑️ Raspored obrisan');
    };

    // Double-click project name to rename
    document.getElementById('project-switcher').ondblclick = async () => {
      const p = proj(); if (!p) return;
      const name = await showPrompt('Preimenuj Raspored', 'Novi naziv', p.name);
      if (!name || name === p.name) return;
      p.name = name;
      renderProjectSwitcher();
      persistAll();
      showToast(`✏️ Preimenovan: ${p.name}`);
    };
  }

  // ── Navigation ───────────────────────────────────────────────────
  function setupNavigation() {
    document.querySelectorAll('.nav-btn').forEach(btn => btn.onclick = () => goToPage(btn.dataset.page));
  }
  function goToPage(id) {
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.page===id));
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById('page-'+id).classList.add('active');
    if (id==='stats')  renderStats();
    if (id==='export') renderExportPersonList();
  }

  function refreshAll() {
    try { renderCalendar(); } catch(e) {}
    try { renderWeekly(); } catch(e) {}
    try { renderEditTable(); } catch(e) {}
    try { renderPeopleChips(); } catch(e) {}
    try { refreshExportPanel(); } catch(e) {}
    try { renderPersonFilterDropdowns(); } catch(e) {}
    const cnEl = document.getElementById('cal-person-name');
    if (cnEl) cnEl.textContent = selPerson() ? `Smjene — ${selPerson()}` : 'Kalendar Smjena';
  }

  // ── Import (feature 8: auto-import) ─────────────────────────────
  function setupImportPage() {
    const dz = document.getElementById('drop-zone');
    document.getElementById('btn-open-file').onclick = loadFile;
    dz.onclick = e => { if(dz.contains(e.target)) loadFile(); };
    dz.ondragover  = e => { e.preventDefault(); dz.classList.add('drag'); };
    dz.ondragleave = ()=> dz.classList.remove('drag');
    dz.ondrop = e => { e.preventDefault(); dz.classList.remove('drag'); if(e.dataTransfer.files[0]) processFile(e.dataTransfer.files[0]); };
    document.getElementById('search-person').oninput = e => {
      const q = e.target.value.toLowerCase();
      document.querySelectorAll('.person-card').forEach(c => c.style.display = c.dataset.name.toLowerCase().includes(q)?'':'none');
    };
    document.getElementById('btn-refresh-file').onclick = refreshFromFile;
    document.getElementById('btn-clear-file').onclick = () => {
      if (proj()) { proj().filePath = null; proj().fileName = null; }
      persistAll(); updateAutoImportBar();
    };
  }

  function updateAutoImportBar() {
    const bar = document.getElementById('auto-import-bar');
    const p = proj();
    if (p && p.filePath) {
      bar.classList.remove('hidden');
      document.getElementById('auto-import-label').textContent = `📄 ${p.fileName||p.filePath}`;
    } else bar.classList.add('hidden');
  }

  async function refreshFromFile() {
    const p = proj(); if (!p?.filePath) return;
    if (window.api) {
      const result = await window.api.refreshExcel(p.filePath);
      if (result.error) { showToast('❌ '+result.error); return; }
      processBase64(result.data, result.name, p.filePath);
    }
  }

  async function loadFile() {
    if (window.api) {
      const r = await window.api.openExcel(); if (!r) return;
      processBase64(r.data, r.name, r.path);
    } else {
      const inp = document.createElement('input'); inp.type='file'; inp.accept='.xlsx,.xls,.xlsm,.csv';
      inp.onchange = e => { if(e.target.files[0]) processFile(e.target.files[0]); }; inp.click();
    }
  }

  function processFile(file) {
    const r = new FileReader();
    r.onload = e => processBase64(btoa(String.fromCharCode(...new Uint8Array(e.target.result))), file.name, null);
    r.readAsArrayBuffer(file);
  }

  function processBase64(b64, fileName, filePath) {
    try {
      const wb = XLSX.read(b64, { type:'base64', cellDates:true, raw:false });
      const parsed = Parser.parse(wb);
      if (!parsed || !parsed.length) { alert('Nije moguće pročitati raspored.'); return; }

      // Ensure we have a project
      if (!proj()) createProject(fileName);

      const p = proj();
      // Merge: keep manual shifts, overwrite Excel ones
      const manual = (p.shifts||[]).filter(s => s._manual);
      const all    = [...parsed, ...manual];
      const seen   = new Set();
      p.shifts = all.filter(s => { const k=s.date+'|'+s.person; if(seen.has(k)) return false; seen.add(k); return true; })
                    .sort((a,b)=>a.date.localeCompare(b.date));
      p.people = [...new Set(p.shifts.map(s=>s.person))].sort();
      p.filePath = filePath; p.fileName = fileName;
      p.name = p.name === `Raspored ${state.projects.length}` ? fileName : p.name;

      // Assign person colors
      p.people.forEach(name => personColor(name));

      persistAll();
      updateSidebarInfo(); renderProjectSwitcher();
      renderPersonGrid();
      document.getElementById('person-picker').classList.remove('hidden');
      document.getElementById('import-info').textContent = `Učitano ${parsed.length} smjena za ${p.people.length} osoba.`;
      updateAutoImportBar();
      renderExportPersonList();
      showToast(`✅ ${fileName} — ${parsed.length} smjena`);
    } catch(err) { console.error(err); alert('Greška: '+err.message); }
  }

  function updateSidebarInfo() {
    const p = proj();
    document.getElementById('sidebar-file-info').textContent =
      p ? `💾 ${p.fileName||p.name}\n${p.shifts?.length||0} smjena` : 'Nema projekta';
  }

  function renderPersonGrid() {
    const grid = document.getElementById('person-grid');
    const ppl  = people();
    if (!ppl.length) { grid.innerHTML=''; return; }
    grid.innerHTML = ppl.map(name => {
      const cnt = shifts().filter(s=>s.person===name).length;
      return `<div class="person-card" data-name="${name}" onclick="selectPerson('${ea(name)}')">
        ${avatarHTML(name, 44, true)}
        <div class="person-name">${eh(name)}</div>
        <div class="person-shifts">${cnt} smjena</div>
      </div>`;
    }).join('');
  }

  window.selectPerson = function(name) {
    setSelPerson(name);
    document.querySelectorAll('.person-card').forEach(c => c.classList.toggle('selected', c.dataset.name===name));
    refreshAll(); goToPage('calendar');
  };

  function renderPersonFilterDropdowns() {
    const ppl = people();
    ['cal-person-filter','stats-person-select','edit-person-filter'].forEach(id => {
      const el = document.getElementById(id); if(!el) return;
      const cur = el.value;
      const placeholder = id==='stats-person-select' ? '— Odaberi osobu —' : '— Sve osobe —';
      el.innerHTML = `<option value="">${placeholder}</option>` +
        ppl.map(p=>`<option value="${eh(p)}" ${p===cur?'selected':''}>${eh(p)}</option>`).join('');
    });
  }

  // ── Calendar (feature 2: person dropdown) ───────────────────────
  function setupCalendarPage() {
    document.getElementById('cal-prev').onclick = () => { if(--state.calMonth<0){state.calMonth=11;state.calYear--;} renderCalendar(); };
    document.getElementById('cal-next').onclick = () => { if(++state.calMonth>11){state.calMonth=0;state.calYear++;} renderCalendar(); };
    document.getElementById('cal-today').onclick = () => { state.calYear=new Date().getFullYear(); state.calMonth=new Date().getMonth(); renderCalendar(); };
    document.getElementById('cal-person-filter').onchange = e => { setSelPerson(e.target.value||null); refreshAll(); };
    // Copy week/month (feature 3)
    document.getElementById('btn-copy-week').onclick  = () => openCopyModal('week');
    document.getElementById('btn-copy-month').onclick = () => openCopyModal('month');
  }

  function renderCalendar() {
    const {calYear:Y, calMonth:Mo} = state;
    const person = selPerson();
    document.getElementById('cal-month-label').textContent = `${MONTH_HR[Mo]} ${Y}`;
    document.getElementById('cal-person-name').textContent = person ? `Smjene — ${person}` : 'Kalendar Smjena';

    // Update dropdown selection
    const pf = document.getElementById('cal-person-filter');
    if (pf) pf.value = person||'';

    // Stats
    if (person) {
      const stats = Parser.getMonthlyStats(shifts(), person, Y, Mo);
      document.getElementById('stat-shifts').textContent = stats.count;
      document.getElementById('stat-hours').textContent  = stats.hours+'h';
      const next = Parser.getNextShift(shifts(), person);
      document.getElementById('stat-next').textContent = next ? next.date.slice(5)+' '+next.startTime : '—';
      const dm = SM(stats.dominantType);
      document.getElementById('stat-type').textContent = dm.icon+' '+dm.label;
    }

    const monthStr  = `${Y}-${pad(Mo+1)}`;
    const shiftMap  = {};
    const filterSh  = person ? shifts().filter(s=>s.person===person) : shifts();
    filterSh.filter(s=>s.date.startsWith(monthStr)).forEach(s=>(shiftMap[s.date]=shiftMap[s.date]||[]).push(s));

    const today    = new Date().toISOString().slice(0,10);
    const firstDow = (new Date(Y,Mo,1).getDay()+6)%7;
    const lastD    = new Date(Y,Mo+1,0).getDate();
    const prevLast = new Date(Y,Mo,0).getDate();
    const grid     = document.getElementById('cal-grid');
    grid.innerHTML = '';

    for(let i=firstDow-1;i>=0;i--){
      const c=document.createElement('div');c.className='cal-day other-month';
      c.innerHTML=`<div class="cal-day-num">${prevLast-i}</div>`;grid.appendChild(c);
    }
    for(let d=1;d<=lastD;d++){
      const ds   = dateStr(Y,Mo,d);
      const dsh  = shiftMap[ds]||[];
      const dow  = new Date(ds+'T00:00:00').getDay();
      const cell = document.createElement('div');
      cell.className=['cal-day',ds===today?'today':'',dsh.length?'has-shift':'',dow===0||dow===6?'weekend':''].filter(Boolean).join(' ');
      let html = `<div class="cal-day-num">${d}${ds===today?'<span class="today-dot"></span>':''}</div>`;
      dsh.forEach(s=>{
        const m=SM(s.shiftType); const pc=personColor(s.person);
        html+=`<div class="shift-block" style="background:${hexToRgba(pc,.18)};border-left:3px solid ${pc}"
          onclick="window.openEditShift('${ds}','${ea(s.person)}')"
          title="${eh(s.person)} · ${s.startTime}–${s.endTime}">
          ${avatarHTML(s.person, 22, false)}
          <div class="shift-block-info">
            <span class="shift-block-person" style="color:${pc}">${eh(s.person)}</span>
            <span class="shift-block-time">${s.startTime}–${s.endTime}</span>
            <span class="shift-block-meta">${m.icon} ${m.label} · ${s.hours}h</span>
          </div></div>`;
      });
      if(!dsh.length && person) html+=`<div class="cal-day-free">slobodan</div>`;
      cell.innerHTML=html; grid.appendChild(cell);
    }
    const pad2 = (firstDow+lastD)%7; const rem = pad2===0?0:7-pad2;
    for(let d=1;d<=rem;d++){const c=document.createElement('div');c.className='cal-day other-month';c.innerHTML=`<div class="cal-day-num">${d}</div>`;grid.appendChild(c);}

    const usedTypes=[...new Set(Object.values(shiftMap).flat().map(s=>s.shiftType))];
    document.getElementById('shift-legend').innerHTML=usedTypes.map(t=>{const m=SM(t);return`<div class="legend-item"><div class="legend-dot" style="background:${m.color}"></div>${m.icon} ${m.label}</div>`;}).join('');
  }

  // ── Weekly View (feature 5) ──────────────────────────────────────
  function setupWeeklyPage() {
    document.getElementById('week-prev').onclick  = () => { state.weekStart=addDays(state.weekStart,-7); renderWeekly(); };
    document.getElementById('week-next').onclick  = () => { state.weekStart=addDays(state.weekStart,7);  renderWeekly(); };
    document.getElementById('week-today').onclick = () => { state.weekStart=getMonday(new Date()); renderWeekly(); };
  }

  function renderWeekly() {
    const ws   = state.weekStart;
    const days = Array.from({length:7},(_,i)=>addDays(ws,i));
    const today = new Date().toISOString().slice(0,10);

    document.getElementById('week-label').textContent =
      `${days[0].toLocaleDateString('hr',{day:'numeric',month:'short'})} – ${days[6].toLocaleDateString('hr',{day:'numeric',month:'short',year:'numeric'})}`;

    const ppl = people(); if(!ppl.length){document.getElementById('weekly-grid').innerHTML='<div style="padding:32px;color:var(--text-dim)">Učitaj Excel fajl da vidiš sedmični pogled.</div>';return;}

    // Build index
    const idx = {};
    shifts().forEach(s=>(idx[s.date]=idx[s.date]||{})[s.person]=s);

    // Grid: 8 cols (person + 7 days), rows per person
    const cols = 1 + 7;
    const grid = document.getElementById('weekly-grid');
    grid.style.gridTemplateColumns = `160px repeat(7,1fr)`;
    grid.innerHTML = '';

    // Header row
    const blank = document.createElement('div'); blank.className='weekly-th'; blank.textContent='Osoba'; grid.appendChild(blank);
    days.forEach(d=>{
      const ds = d.toISOString().slice(0,10);
      const th = document.createElement('div');
      th.className='weekly-th'+(ds===today?' today-col':'');
      th.innerHTML=`${DAY_SHORT[(d.getDay())%7]}<br><small>${d.getDate()}.${d.getMonth()+1}.</small>`;
      grid.appendChild(th);
    });

    // Person rows
    ppl.forEach(name=>{
      const pc = personColor(name);
      const ini= name.split(/\s+/).map(w=>w[0]).join('').slice(0,2);
      const td = document.createElement('div'); td.className='weekly-person-cell';
      td.innerHTML=`<div class="weekly-person-dot" style="background:${pc}"></div><span style="color:${pc}">${eh(name)}</span>`;
      grid.appendChild(td);
      days.forEach(d=>{
        const ds = d.toISOString().slice(0,10);
        const s  = idx[ds]?.[name];
        const cell = document.createElement('div');
        cell.className='weekly-shift-cell'+(ds===today?' today-col':'');
        if(s){
          const m=SM(s.shiftType);
          cell.innerHTML=`<div class="shift-block" style="background:${hexToRgba(pc,.18)};border-left:3px solid ${pc}"
            onclick="window.openEditShift('${ds}','${ea(name)}')" title="${s.startTime}–${s.endTime}">
            ${avatarHTML(name, 20, false)}
            <div class="shift-block-info">
              <span class="shift-block-time">${s.startTime}–${s.endTime}</span>
              <span class="shift-block-meta">${m.icon} ${s.hours}h</span>
            </div></div>`;
        }
        grid.appendChild(cell);
      });
    });
  }

  // ── Copy shifts (feature 3) ──────────────────────────────────────
  function openCopyModal(type) {
    const p = proj(); if (!p) return;
    state.copyMode = type;
    const person   = selPerson();
    document.getElementById('modal-copy-title').textContent = type==='week' ? 'Kopiraj Sedmicu' : 'Kopiraj Mjesec';

    let desc='', srcShifts=[];
    if (type==='week') {
      const ws  = getMonday(new Date(state.calYear, state.calMonth, 1));
      const days = Array.from({length:7},(_,i)=>addDays(ws,i).toISOString().slice(0,10));
      srcShifts = shifts().filter(s=>days.includes(s.date) && (!person||s.person===person));
      desc = `Kopiraj ${srcShifts.length} smjena iz ove sedmice naprijed.`;
    } else {
      const ms = `${state.calYear}-${pad(state.calMonth+1)}`;
      srcShifts = shifts().filter(s=>s.date.startsWith(ms) && (!person||s.person===person));
      desc = `Kopiraj ${srcShifts.length} smjena iz ${MONTH_HR[state.calMonth]} naprijed.`;
    }
    state._copySrcShifts = srcShifts;

    document.getElementById('modal-copy-desc').textContent = desc;
    const cPerson = document.getElementById('copy-person');
    cPerson.innerHTML = people().map(n=>`<option value="${ea(n)}" ${n===person?'selected':''}>${eh(n)}</option>`).join('');
    document.getElementById('modal-copy').classList.remove('hidden');
  }

  function confirmCopy() {
    const offsetWeeks = parseInt(document.getElementById('copy-offset').value)||1;
    const toPerson    = document.getElementById('copy-person').value;
    const overwrite   = document.getElementById('copy-overwrite').checked;
    const src         = state._copySrcShifts || [];
    const offsetDays  = offsetWeeks * 7;
    const p           = proj(); if(!p) return;

    let added=0, skipped=0;
    src.forEach(s=>{
      const newDate = addDays(s.date, offsetDays).toISOString().slice(0,10);
      const exists  = p.shifts.find(x=>x.date===newDate && x.person===toPerson);
      if (exists && !overwrite) { skipped++; return; }
      if (exists) p.shifts = p.shifts.filter(x=>!(x.date===newDate&&x.person===toPerson));
      p.shifts.push({ ...s, date:newDate, person:toPerson, _manual:true });
      added++;
    });
    p.shifts.sort((a,b)=>a.date.localeCompare(b.date));
    if (!p.people.includes(toPerson)) { p.people.push(toPerson); p.people.sort(); }
    persistAll(); closeModal('modal-copy'); refreshAll();
    showToast(`📋 Kopirano ${added} smjena${skipped?` (${skipped} preskočeno)`:''}!`);
  }

  // ── Edit Table ───────────────────────────────────────────────────
  function setupEditPage() {
    document.getElementById('btn-add-shift').onclick    = ()=>openShiftModal(null);
    document.getElementById('btn-save-changes').onclick = ()=>{persistAll();showToast('💾 Sačuvano!');};
    document.getElementById('edit-search').oninput        = () => { renderPeopleChips(); renderEditTable(); };
    document.getElementById('edit-month-filter').onchange = () => { renderPeopleChips(); renderEditTable(); };
    document.getElementById('edit-person-filter').onchange= () => { renderPeopleChips(); renderEditTable(); };
  }

  function renderPeopleChips() {
    try {
    const bar   = document.getElementById('people-mgmt-bar');
    const chips = document.getElementById('people-chips');
    if (!bar || !chips) return;
    const ppl = people();
    if (!ppl.length) { bar.style.display='none'; return; }
    bar.style.display='flex';
    const curFilter = document.getElementById('edit-person-filter').value;

    chips.innerHTML = ppl.map(name => {
      const cnt  = shifts().filter(s=>s.person===name).length;
      const pc   = personColor(name);
      const isActive = curFilter===name;
      return `<div class="person-chip" style="border-color:${isActive?pc:'var(--border)'};background:${isActive?hexToRgba(pc,.15):'var(--bg-elevated)'}">
        ${avatarHTML(name, 20, false)}
        <span class="person-chip-name" style="color:${isActive?pc:'var(--text)'}" 
          onclick="filterEditByPerson('${ea(name)}')" title="${eh(name)} — ${cnt} smjena" style="cursor:pointer">
          ${eh(name)} <span style="opacity:.55;font-weight:400">${cnt}</span>
        </span>
        <button class="person-chip-btn chip-edit" onclick="renamePerson('${ea(name)}')" title="Preimenuj">✏</button>
        <button class="person-chip-btn chip-del"  onclick="deletePerson('${ea(name)}')" title="Obriši osobu i sve njene smjene">✕</button>
      </div>`;
    }).join('');

    // "Svi" reset chip
    chips.innerHTML += `<div class="person-chip" style="cursor:pointer;border-color:${!curFilter?'var(--accent)':'var(--border)'}"
      onclick="filterEditByPerson('')">
      <span style="color:${!curFilter?'var(--accent)':'var(--text-dim)'};font-size:11px">Svi ✓</span>
    </div>`;
    } catch(e) { /* ignore render errors during init */ }
  }

  window.filterEditByPerson = function(name) {
    document.getElementById('edit-person-filter').value = name;
    renderPeopleChips();
    renderEditTable();
  };

  window.renamePerson = async function(oldName) {
    const newName = await showPrompt('Preimenuj Osobu', 'Novo ime', oldName);
    if (!newName || newName.trim()===oldName) return;
    const fresh = newName.trim().toUpperCase();
    const p = proj(); if (!p) return;
    p.shifts.forEach(s => { if(s.person===oldName) s.person=fresh; });
    const idx = p.people.indexOf(oldName);
    if (idx>-1) p.people[idx]=fresh; else p.people.push(fresh);
    p.people.sort();
    if (p.selectedPerson===oldName) p.selectedPerson=fresh;
    // Move avatar
    if (p.avatarMap?.[oldName]) { p.avatarMap[fresh]=p.avatarMap[oldName]; delete p.avatarMap[oldName]; }
    // Move person color cache
    if (personColorCache[oldName]) { personColorCache[fresh]=personColorCache[oldName]; delete personColorCache[oldName]; }
    persistAll(); renderPeopleChips(); renderEditTable(); renderPersonGrid();
    renderPersonFilterDropdowns(); renderCalendar();
    showToast(`✅ Preimenovan: ${oldName} → ${fresh}`);
  };

  window.deletePerson = function(name) {
    const cnt = shifts().filter(s=>s.person===name).length;
    if (!confirm(`Obriši osobu "${name}" i sve njene ${cnt} smjena?\nOva akcija se ne može poništiti!`)) return;
    const p = proj(); if (!p) return;
    p.shifts  = p.shifts.filter(s=>s.person!==name);
    p.people  = p.people.filter(x=>x!==name);
    if (p.selectedPerson===name) p.selectedPerson=null;
    if (p.avatarMap?.[name]) delete p.avatarMap[name];
    // Reset edit filter if was filtering by this person
    const pSel = document.getElementById('edit-person-filter');
    if (pSel.value===name) pSel.value='';
    persistAll(); renderPeopleChips(); renderEditTable(); renderPersonGrid();
    renderPersonFilterDropdowns(); renderCalendar(); renderWeekly();
    refreshExportPanel();
    showToast(`🗑️ Osoba "${name}" obrisana (${cnt} smjena)`);
  };

  function renderEditTable() {
    try { renderPeopleChips(); } catch(e) {}
    const allSh  = shifts();
    const months = [...new Set(allSh.map(s=>s.date.slice(0,7)))].sort();
    const mSel   = document.getElementById('edit-month-filter');
    const pSel   = document.getElementById('edit-person-filter');
    const curMon = mSel.value, curPer = pSel.value;

    mSel.innerHTML = '<option value="">Svi mjeseci</option>' +
      months.map(m=>{const[y,mo]=m.split('-');return`<option value="${m}" ${m===curMon?'selected':''}>${MONTH_HR[parseInt(mo)-1]} ${y}</option>`;}).join('');

    pSel.innerHTML = '<option value="">Sve osobe</option>' +
      people().map(p=>`<option value="${eh(p)}" ${p===curPer?'selected':''}>${eh(p)}</option>`).join('');

    const search = document.getElementById('edit-search').value.toLowerCase();
    const personF = curPer;  // Only use dropdown — not calendar selection
    const filtered = allSh.filter(s=>{
      if(curMon  && !s.date.startsWith(curMon)) return false;
      if(personF && s.person!==personF) return false;
      if(search  && !s.date.includes(search) && !(s.person||'').toLowerCase().includes(search)) return false;
      return true;
    });

    document.getElementById('edit-person-label').textContent = personF ? `Smjene: ${personF}` : 'Sve smjene';
    const tbody = document.getElementById('edit-tbody');
    if(!filtered.length){tbody.innerHTML=`<tr><td colspan="8" style="text-align:center;padding:32px;color:var(--text-dim)">Nema smjena</td></tr>`;return;}

    tbody.innerHTML = filtered.map(s=>{
      const d=new Date(s.date+'T00:00:00'); const m=SM(s.shiftType); const pc=personColor(s.person);
      return`<tr>
        <td><div style="display:flex;align-items:center;gap:8px">
          ${avatarHTML(s.person, 28, false)}
          <span style="font-weight:600">${eh(s.person)}</span>${s._manual?'<span style="font-size:10px;opacity:.6" title="Ručno">✏️</span>':''}
        </div></td>
        <td>${s.date}</td>
        <td style="color:var(--text-mid)">${DAY_HR[d.getDay()]}</td>
        <td><strong>${s.startTime}</strong></td><td><strong>${s.endTime}</strong></td>
        <td><span style="background:${m.bg};border:1px solid ${m.color};color:${m.text};padding:3px 9px;border-radius:20px;font-size:11px;font-weight:700;white-space:nowrap">${m.icon} ${m.label}</span></td>
        <td style="color:var(--accent);font-weight:700">${s.hours}h</td>
        <td>
          <button class="icon-btn" style="margin-right:4px" onclick="window.openEditShift('${s.date}','${ea(s.person)}')">✏️</button>
          <button class="icon-btn" onclick="window.deleteShift('${s.date}','${ea(s.person)}')">🗑️</button>
        </td></tr>`;
    }).join('');
  }

  window.openEditShift = (date,person)=>openShiftModal({date,person});
  window.deleteShift = function(date,person){
    if(!confirm(`Obriši smjenu za ${person} na ${date}?`)) return;
    const p=proj(); if(!p) return;
    p.shifts=p.shifts.filter(s=>!(s.date===date&&s.person===person));
    // If person has no more shifts, remove from people list
    const stillHasShifts = p.shifts.some(s=>s.person===person);
    if(!stillHasShifts) {
      p.people = p.people.filter(x=>x!==person);
      if(p.selectedPerson===person) p.selectedPerson=null;
    }
    persistAll();
    renderPeopleChips(); renderPersonGrid(); renderPersonFilterDropdowns();
    renderEditTable(); renderCalendar(); renderWeekly();
    refreshExportPanel();
    showToast('🗑️ Smjena obrisana');
  };

  // ── Statistics (feature 4) ───────────────────────────────────────
  function setupStatsPage() {
    document.getElementById('stats-person-select').onchange = ()=>renderStats();
  }

  function renderStats() {
    const name = document.getElementById('stats-person-select').value;
    const psh  = name ? shifts().filter(s=>s.person===name) : shifts();
    if (!psh.length) {
      document.getElementById('stats-cards-big').innerHTML   = '<div style="color:var(--text-dim);font-size:13px">Odaberi osobu ili uvezi fajl.</div>';
      document.getElementById('stats-chart-hours').innerHTML = '';
      document.getElementById('stats-chart-types').innerHTML = '';
      document.getElementById('stats-table-months').innerHTML= '';
      return;
    }

    const totalHours  = psh.reduce((s,x)=>s+(x.hours||0),0);
    const months      = [...new Set(psh.map(s=>s.date.slice(0,7)))].sort();
    const weeklyAvg   = months.length ? (totalHours/(months.length*4)).toFixed(1) : 0;
    const byType      = {};
    psh.forEach(s=>{ byType[s.shiftType]=(byType[s.shiftType]||0)+1; });
    const topType     = Object.entries(byType).sort((a,b)=>b[1]-a[1])[0];

    // Cards
    const pc = name ? personColor(name) : 'var(--accent)';
    document.getElementById('stats-cards-big').innerHTML = `
      <div class="stat-card-big"><div class="stat-val" style="color:${pc}">${psh.length}</div><div class="stat-label">Ukupno smjena</div></div>
      <div class="stat-card-big"><div class="stat-val" style="color:${pc}">${Math.round(totalHours)}h</div><div class="stat-label">Ukupno sati</div></div>
      <div class="stat-card-big"><div class="stat-val" style="color:${pc}">${weeklyAvg}h</div><div class="stat-label">Prosjek tjedno</div></div>
      <div class="stat-card-big"><div class="stat-val" style="color:${pc}">${months.length}</div><div class="stat-label">Aktivnih mjeseci</div></div>
      ${topType?`<div class="stat-card-big"><div class="stat-val" style="color:${pc}">${SM(topType[0]).icon}</div><div class="stat-label">Najčešći tip: ${SM(topType[0]).label}</div></div>`:''}`;

    // Bar chart — hours per month
    const byMonth = {};
    psh.forEach(s=>{const m=s.date.slice(0,7);byMonth[m]=(byMonth[m]||0)+(s.hours||0);});
    const maxH = Math.max(...Object.values(byMonth),1);
    document.getElementById('stats-chart-hours').innerHTML =
      `<div class="bar-chart">${Object.entries(byMonth).sort().map(([m,h])=>{
        const [y,mo]=m.split('-'); const pct=Math.round((h/maxH)*120);
        return`<div class="bar-wrap">
          <div class="bar-val">${Math.round(h)}h</div>
          <div class="bar" style="height:${pct}px;background:${pc}" title="${MONTH_HR[parseInt(mo)-1]}: ${Math.round(h)}h"></div>
          <div class="bar-label">${MONTH_HR[parseInt(mo)-1].slice(0,3)}</div>
        </div>`;}).join('')}</div>`;

    // Type breakdown
    const total=psh.length;
    document.getElementById('stats-chart-types').innerHTML=`<div class="type-list">${
      Object.entries(byType).sort((a,b)=>b[1]-a[1]).map(([t,c])=>{
        const m=SM(t); const pct=Math.round((c/total)*100);
        return`<div class="type-row">
          <div class="type-name">${m.icon} ${m.label}</div>
          <div class="type-bar-bg"><div class="type-bar-fill" style="width:${pct}%;background:${m.color}"></div></div>
          <div class="type-count">${c}</div>
        </div>`;}).join('')}</div>`;

    // Monthly table
    document.getElementById('stats-table-months').innerHTML=`
      <table class="months-table"><thead><tr>
        <th>Mjesec</th><th>Smjena</th><th>Noćnih</th><th>Jutarnjih</th><th>Poslijepodnevnih</th><th>Večernjih</th><th>Sati</th>
      </tr></thead><tbody>${
      months.map(mo=>{
        const ms=psh.filter(s=>s.date.startsWith(mo));
        const [y,m]=mo.split('-');
        return`<tr>
          <td><strong>${MONTH_HR[parseInt(m)-1]} ${y}</strong></td>
          <td>${ms.length}</td>
          <td>${ms.filter(s=>s.shiftType==='night').length}</td>
          <td>${ms.filter(s=>s.shiftType==='morning').length}</td>
          <td>${ms.filter(s=>s.shiftType==='afternoon').length}</td>
          <td>${ms.filter(s=>s.shiftType==='evening').length}</td>
          <td style="color:var(--accent);font-weight:700">${ms.reduce((s,x)=>s+(x.hours||0),0).toFixed(1)}h</td>
        </tr>`;}).join('')}</tbody></table>`;
  }

  // Always call this after any data change — refreshes export panel live
  function refreshExportPanel() {
    try {
      renderExportPersonList();
      const ap = state.exportActivePerson;
      const detail = document.getElementById('export-shift-detail');
      if (!detail) return;
      if (!ap) return;
      // Check if person still exists
      if (!people().includes(ap)) {
        state.exportActivePerson = null;
        detail.innerHTML = '<div style="padding:20px;color:var(--text-dim);font-size:13px">← Klikni osobu za pregled</div>';
      } else {
        renderExportShiftDetail(ap);
      }
    } catch(e) {}
  }

  // ── Export (feature 6: WhatsApp) ─────────────────────────────────
  function setupExportPage() {
    document.getElementById('btn-export-excel').onclick = async ()=>{
      if(!selPerson()){alert('Odaberi osobu!');return;}
      const opts={allMonths:document.getElementById('exp-all-months').checked, stats:document.getElementById('exp-stats').checked, colors:document.getElementById('exp-colors').checked};
      const b64=Exporter.exportExcel(shifts(),selPerson(),opts);
      const name=`smjene_${selPerson().replace(/\s+/g,'_')}.xlsx`;
      if(window.api) await window.api.saveExcel({defaultName:name,base64:b64});
      else{const a=document.createElement('a');a.href='data:application/octet-stream;base64,'+b64;a.download=name;a.click();}
    };
    document.getElementById('btn-export-pdf').onclick = async ()=>{
      if(!selPerson()){alert('Odaberi osobu!');return;}
      const html=Exporter.buildPrintHTML(shifts(),selPerson(),state.calYear,state.calMonth);
      if(window.api){document.getElementById('print-content').innerHTML=html;await window.api.exportPdf({defaultName:`smjene_${selPerson().replace(/\s+/g,'_')}.pdf`});}
      else{const w=window.open('');w.document.write(html);w.document.close();setTimeout(()=>w.print(),300);}
    };
    document.getElementById('btn-copy-whatsapp').onclick = copyWhatsApp;
  }

  function copyWhatsApp() {
    const person = selPerson(); if(!person){alert('Odaberi osobu!');return;}
    const range  = document.querySelector('input[name="wa-range"]:checked')?.value || 'week';
    let sh = Parser.getShiftsForPerson(shifts(), person);
    const today = new Date();

    if (range==='week') {
      const ws   = getMonday(today);
      const days = Array.from({length:7},(_,i)=>addDays(ws,i).toISOString().slice(0,10));
      sh = sh.filter(s=>days.includes(s.date));
    } else if (range==='month') {
      const ms=`${today.getFullYear()}-${pad(today.getMonth()+1)}`;
      sh=sh.filter(s=>s.date.startsWith(ms));
    }

    if(!sh.length){showToast('⚠️ Nema smjena za odabrani period');return;}

    const lines = [
      `📅 *Raspored smjena — ${person}*`,
      range==='week'?`Sedmica ${getMonday(today).toLocaleDateString('hr')}`:range==='month'?`${MONTH_HR[today.getMonth()]} ${today.getFullYear()}`:'Sve smjene',
      ''
    ];
    sh.forEach(s=>{
      const d=new Date(s.date+'T00:00:00');
      const m=SM(s.shiftType);
      lines.push(`${m.icon} *${DAY_HR[d.getDay()]}* ${s.date.slice(5).replace('-','.')} — ${s.startTime}–${s.endTime} (${s.hours}h) _${m.label}_`);
    });
    lines.push('','_Raspored Smjena by AcoRonaldo_');

    const text=lines.join('\n');
    navigator.clipboard.writeText(text).then(()=>showToast('📋 Kopirano! Zalijepi u WhatsApp ✅')).catch(()=>{
      const ta=document.createElement('textarea');ta.value=text;document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();showToast('📋 Kopirano!');
    });
  }

  // ── Export person list (feature: click person to see shifts) ────────
  function renderExportPreview() { renderExportPersonList(); }

  function renderExportPersonList() {
    const list = document.getElementById('export-person-list');
    const ppl  = people();
    if (!ppl.length) { list.innerHTML='<div style="padding:14px;color:var(--text-dim);font-size:13px">Učitaj fajl.</div>'; return; }
    list.innerHTML = ppl.map(name => {
      const cnt = shifts().filter(s=>s.person===name).length;
      const hrs = shifts().filter(s=>s.person===name).reduce((s,x)=>s+(x.hours||0),0).toFixed(0);
      const active = state.exportActivePerson===name ? 'active' : '';
      return `<div class="export-person-item ${active}" onclick="window.exportSelectPerson('${ea(name)}')">
        ${avatarHTML(name, 34, false)}
        <div>
          <div class="ep-name">${eh(name)}</div>
          <div class="ep-count">${cnt} smjena · ${hrs}h</div>
        </div>
      </div>`;
    }).join('');
  }

  window.exportSelectPerson = function(name) {
    state.exportActivePerson = name;
    setSelPerson(name);
    renderExportPersonList();
    renderExportShiftDetail(name);
    // also sync calendar/edit
    const cpf = document.getElementById('cal-person-filter');
    if (cpf) { cpf.value = name; renderCalendar(); }
  };

  function renderExportShiftDetail(name) {
    const detail = document.getElementById('export-shift-detail');
    if (!detail) return;
    const sh = Parser.getShiftsForPerson(shifts(), name);
    if (!sh.length) {
      detail.innerHTML = '<div style="padding:20px;color:var(--text-dim)">Nema smjena.</div>';
      return;
    }
    const hrs    = sh.reduce((s,x)=>s+(x.hours||0),0).toFixed(1);
    const months = [...new Set(sh.map(s=>s.date.slice(0,7)))].length;
    const pc     = personColor(name);
    const av     = getAvatar(name);
    const byType = {};
    sh.forEach(s=>{ byType[s.shiftType]=(byType[s.shiftType]||0)+1; });
    const topType = Object.entries(byType).sort((a,b)=>b[1]-a[1])[0];
    const ini    = name.split(/\s+/).map(w=>w[0]).join('').slice(0,2);

    // Avatar with change + remove buttons
    const avatarSection = `
      <div class="det-avatar-wrap">
        ${av
          ? `<img src="${av}" class="det-avatar-img" style="border-color:${pc}">`
          : `<div class="det-avatar-ini" style="background:${hexToRgba(pc,.15)};border-color:${pc};color:${pc}">${ini}</div>`
        }
        <div class="det-avatar-btns">
          <button class="det-av-btn" onclick="window.uploadAvatar('${ea(name)}')" title="Promijeni sliku">📷 Promijeni</button>
          ${av ? `<button class="det-av-btn det-av-remove" onclick="window.removeAvatar('${ea(name)}')" title="Ukloni sliku">🗑 Ukloni</button>` : ''}
        </div>
      </div>`;

    detail.innerHTML = `
      <div class="shift-detail-header">
        ${avatarSection}
        <div class="det-info">
          <div class="det-name" style="color:${pc}">${eh(name)}</div>
          <div class="shift-detail-stats">
            <span class="shift-detail-stat">Smjena: <strong>${sh.length}</strong></span>
            <span class="shift-detail-stat">Sati: <strong>${hrs}h</strong></span>
            <span class="shift-detail-stat">Mjes.: <strong>${months}</strong></span>
            ${topType ? `<span class="shift-detail-stat">Najčešće: <strong>${SM(topType[0]).icon} ${SM(topType[0]).label}</strong></span>` : ''}
          </div>
        </div>
      </div>
      <div class="shift-detail-list">
        <div class="sdr-header">
          <span>Datum</span><span>Dan</span><span>Početak</span><span>Kraj</span><span>Tip</span><span>Sati</span>
        </div>
        ${sh.map(s => {
          const d = new Date(s.date+'T00:00:00');
          const m = SM(s.shiftType);
          return `<div class="shift-detail-row">
            <span class="shift-detail-date">${s.date}</span>
            <span class="shift-detail-day">${DAY_HR[d.getDay()]}</span>
            <span class="shift-detail-time">${s.startTime}</span>
            <span class="shift-detail-time">${s.endTime}</span>
            <span class="sdr-badge" style="background:${m.bg};border-color:${m.color};color:${m.text}">${m.icon} ${m.label}</span>
            <span class="shift-detail-hrs">${s.hours}h</span>
          </div>`;
        }).join('')}
      </div>`;
  }

  window.removeAvatar = function(name) {
    if (!confirm(`Ukloni sliku za ${name}?`)) return;
    const p = proj(); if (!p) return;
    if (p.avatarMap) delete p.avatarMap[name];
    persistAll();
    renderPersonGrid(); renderPeopleChips();
    renderCalendar(); renderWeekly(); renderEditTable();
    refreshExportPanel();
    showToast('🗑 Slika uklonjena');
  };

  // ── Reminders ────────────────────────────────────────────────────
  function setupRemindersPage() {
    document.getElementById('btn-add-reminder').onclick=()=>{
      ['rem-title','rem-desc'].forEach(id=>document.getElementById(id).value='');
      document.getElementById('rem-date').value=''; document.getElementById('rem-category').value='work';
      document.getElementById('modal-reminder').classList.remove('hidden');
    };
    document.getElementById('rem-cal-prev').onclick=()=>{if(--state.remMonth<0){state.remMonth=11;state.remYear--;}renderReminderCal();};
    document.getElementById('rem-cal-next').onclick=()=>{if(++state.remMonth>11){state.remMonth=0;state.remYear++;}renderReminderCal();};
    document.querySelectorAll('.filter-chip').forEach(btn=>{btn.onclick=()=>{document.querySelectorAll('.filter-chip').forEach(b=>b.classList.remove('active'));btn.classList.add('active');state.remFilter=btn.dataset.filter;renderReminderList();};});
  }

  function renderReminderCal(){
    const{remYear:y,remMonth:m}=state;
    document.getElementById('rem-cal-label').textContent=`${MONTH_HR[m]} ${y}`;
    const fd=(new Date(y,m,1).getDay()+6)%7, ld=new Date(y,m+1,0).getDate();
    const today=new Date().toISOString().slice(0,10), rds=new Set(state.reminders.map(r=>r.date));
    const grid=document.getElementById('rem-grid'); grid.innerHTML='';
    for(let i=0;i<fd;i++){const e=document.createElement('div');e.className='rem-day other-month';grid.appendChild(e);}
    for(let d=1;d<=ld;d++){
      const ds=`${y}-${pad(m+1)}-${pad(d)}`;
      const e=document.createElement('div'); e.className='rem-day'+(ds===today?' today':'')+(rds.has(ds)?' has-reminder':'');
      e.textContent=d; e.onclick=()=>{document.getElementById('rem-date').value=ds;document.getElementById('rem-title').value='';document.getElementById('rem-desc').value='';document.getElementById('modal-reminder').classList.remove('hidden');};
      grid.appendChild(e);
    }
  }

  function renderReminderList(){
    const list=document.getElementById('reminder-list');
    let rems=[...state.reminders]; if(state.remFilter!=='all') rems=rems.filter(r=>r.category===state.remFilter);
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

  function saveReminder(){
    const t=document.getElementById('rem-title').value.trim(), d=document.getElementById('rem-date').value;
    const c=document.getElementById('rem-category').value, desc=document.getElementById('rem-desc').value.trim();
    if(!t||!d){alert('Unesi naslov i datum!');return;}
    state.reminders.push({title:t,date:d,category:c,desc});
    localStorage.setItem('reminders',JSON.stringify(state.reminders));
    closeModal('modal-reminder'); renderReminderCal(); renderReminderList(); showToast('🔔 Podsjetnik dodan!');
  }
  window.deleteReminder=function(i){state.reminders.splice(i,1);localStorage.setItem('reminders',JSON.stringify(state.reminders));renderReminderCal();renderReminderList();};

  // ── Settings (features 1, 7, 8, 9) ──────────────────────────────
  function setupSettingsPage() {
    // Themes
    document.querySelectorAll('.theme-card').forEach(card=>{card.onclick=()=>{document.querySelectorAll('.theme-card').forEach(c=>c.classList.remove('active'));card.classList.add('active');applyTheme(card.dataset.theme);};});
    // Background
    document.getElementById('btn-pick-image').onclick=async()=>{const u=window.api?await window.api.openImage():await pickImageBrowser();if(u){state.customBg=u;localStorage.setItem('customBg',u);applyBg();document.getElementById('current-bg-preview').textContent='✅ Slika aktivna';}};
    document.getElementById('btn-pick-color').onclick=()=>document.getElementById('bg-color-picker').click();
    document.getElementById('bg-color-picker').oninput=e=>{state.customBg=e.target.value;localStorage.setItem('customBg',state.customBg);applyBg();document.getElementById('current-bg-preview').textContent=`🎨 ${state.customBg}`;};
    document.getElementById('btn-reset-bg').onclick=()=>{state.customBg=null;localStorage.removeItem('customBg');applyBg();document.getElementById('current-bg-preview').textContent='Nema pozadine';};
    document.getElementById('bg-opacity').oninput=e=>{state.bgOpacity=e.target.value;localStorage.setItem('bgOpacity',state.bgOpacity);document.getElementById('bg-opacity-val').textContent=state.bgOpacity+'%';applyBg();};
    document.getElementById('bg-opacity').value=state.bgOpacity;
    document.getElementById('bg-opacity-val').textContent=state.bgOpacity+'%';
    // Notifications
    document.getElementById('btn-test-notif').onclick=()=>{
      if(window.api) window.api.sendNotification({title:'🔔 Test notifikacija',body:'Raspored Smjena radi ispravno!'});
      else showToast('🔔 Notifikacije rade samo u Electron verziji');
    };
    // Backup
    document.getElementById('btn-backup-export').onclick=async()=>{
      if(window.api){const ok=await window.api.backupExport();if(ok) showToast('✅ Backup sačuvan!');}
      else{const data=JSON.stringify({projects:state.projects,currentProject:state.currentProjectId},null,2);const a=document.createElement('a');a.href='data:application/json;charset=utf-8,'+encodeURIComponent(data);a.download=`backup_${new Date().toISOString().slice(0,10)}.json`;a.click();}
    };
    document.getElementById('btn-backup-import').onclick=async()=>{
      if(window.api){
        const data=await window.api.backupImport();
        if(data?.error){showToast('❌ '+data.error);return;}
        if(data){loadFromData(data);showToast('✅ Backup učitan!');}
      } else {
        const inp=document.createElement('input');inp.type='file';inp.accept='.json';
        inp.onchange=e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=ev=>{try{const d=JSON.parse(ev.target.result);loadFromData(d);showToast('✅ Backup učitan!');}catch(err){showToast('❌ Invalid JSON');}};r.readAsText(f);};inp.click();
      }
    };
    // Active theme card
    const card=document.querySelector(`.theme-card[data-theme="${state.theme}"]`);
    if(card){document.querySelectorAll('.theme-card').forEach(c=>c.classList.remove('active'));card.classList.add('active');}
  }

  function applySettingsUI(){
    const s=state.settings||{};
    const n24=document.getElementById('notif-24h'); if(n24) n24.checked=s.notif24!==false;
    const n1=document.getElementById('notif-1h');   if(n1)  n1.checked=s.notif1!==false;
  }

  function applyTheme(t){state.theme=t;localStorage.setItem('theme',t);document.documentElement.setAttribute('data-theme',t==='midnight'?'':t);}
  function applyBg(){
    const bg=state.customBg,op=(parseFloat(state.bgOpacity)||70)/100;
    if(!bg){document.body.classList.remove('has-custom-bg');document.body.style.removeProperty('--custom-bg-url');return;}
    if(bg.startsWith('#')){document.body.classList.remove('has-custom-bg');document.body.style.backgroundColor=bg;}
    else{document.body.classList.add('has-custom-bg');document.body.style.setProperty('--custom-bg-url',`url("${bg}")`);document.body.style.setProperty('--custom-bg-opacity',op.toString());}
  }
  function pickImageBrowser(){return new Promise(res=>{const i=document.createElement('input');i.type='file';i.accept='image/*';i.onchange=e=>{const f=e.target.files[0];if(!f){res(null);return;}const r=new FileReader();r.onload=ev=>res(ev.target.result);r.readAsDataURL(f);};i.click();});}

  // ── Modals ───────────────────────────────────────────────────────
  function setupModals(){
    document.getElementById('modal-shift-close').onclick  =()=>closeModal('modal-shift');
    document.getElementById('modal-shift-cancel').onclick =()=>closeModal('modal-shift');
    document.getElementById('modal-shift-save').onclick   =saveShift;
    document.getElementById('modal-rem-close').onclick    =()=>closeModal('modal-reminder');
    document.getElementById('modal-rem-cancel').onclick   =()=>closeModal('modal-reminder');
    document.getElementById('modal-rem-save').onclick     =saveReminder;
    document.getElementById('modal-copy-close').onclick   =()=>closeModal('modal-copy');
    document.getElementById('modal-copy-cancel').onclick  =()=>closeModal('modal-copy');
    document.getElementById('modal-copy-confirm').onclick =confirmCopy;
    const pre={night:['00:00','06:30'],morning:['06:30','12:00'],afternoon:['12:00','18:00'],evening:['18:00','00:00']};
    document.getElementById('ms-type').onchange=e=>{const p=pre[e.target.value];if(p){document.getElementById('ms-start').value=p[0];document.getElementById('ms-end').value=p[1];}};
  }

  function openShiftModal(shiftOrNull){
    const pInp  = document.getElementById('ms-person');
    // Update datalist silently (don't trigger focus events)
    const pList = document.getElementById('ms-person-list');
    if (pList) pList.innerHTML = people().map(p=>`<option value="${ea(p)}">`).join('');

    // Also populate person quick-select buttons
    renderPersonQuickPick();

    if (shiftOrNull) {
      const { date, person } = shiftOrNull;
      const ex = shifts().find(s=>s.date===date&&s.person===person);
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
      pInp.value = '';
      document.getElementById('ms-date').value  = new Date().toISOString().slice(0,10);
      document.getElementById('ms-start').value = '06:30';
      document.getElementById('ms-end').value   = '12:00';
      document.getElementById('ms-type').value  = 'morning';
      document.getElementById('ms-note').value  = '';
      state.editingShift = null;
    }

    document.getElementById('modal-shift').classList.remove('hidden');

    // Multi-stage focus: ensure window has focus first, then input
    // This fixes Electron focus-trap bug after navigating between pages
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        try {
          pInp.focus({ preventScroll: true });
          if (!shiftOrNull) pInp.select();
        } catch(e) {}
      });
    });
  }

  function renderPersonQuickPick() {
    const wrap = document.getElementById('ms-person-quick');
    if (!wrap) return;
    const ppl = people();
    if (!ppl.length) { wrap.style.display='none'; return; }
    wrap.style.display='flex';
    wrap.innerHTML = ppl.map(name => {
      const pc  = personColor(name);
      const ini = name.split(/\s+/).map(w=>w[0]).join('').slice(0,2);
      const av  = getAvatar(name);
      const inner = av
        ? `<img src="${av}" style="width:22px;height:22px;border-radius:50%;object-fit:cover;border:1.5px solid ${pc}">`
        : `<div style="width:22px;height:22px;border-radius:50%;background:${hexToRgba(pc,.2)};border:1.5px solid ${pc};display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:800;color:${pc}">${ini}</div>`;
      return `<button type="button" class="person-quick-btn" style="border-color:${pc}"
        onclick="document.getElementById('ms-person').value='${ea(name)}';document.querySelectorAll('.person-quick-btn').forEach(b=>b.classList.remove('pq-active'));this.classList.add('pq-active')">
        ${inner}
        <span style="color:${pc};font-size:11px;font-weight:700">${eh(name)}</span>
      </button>`;
    }).join('');
  }

  function saveShift(){
    const raw=document.getElementById('ms-person').value.trim(), date=document.getElementById('ms-date').value.trim();
    const start=document.getElementById('ms-start').value.trim(), end=document.getElementById('ms-end').value.trim();
    const type=document.getElementById('ms-type').value, note=document.getElementById('ms-note').value.trim();
    if(!raw||!date||!start||!end){alert('Popuni sva obavezna polja!');return;}
    const person=raw.toUpperCase(), hours=Parser.calcHours(start,end);
    const newSh={person,date,startTime:start,endTime:end,shiftType:type,hours,note,_manual:true};

    // Ensure project
    if(!proj()) createProject(person+' raspored');
    const p=proj();

    if(state.editingShift){const{date:od,person:op}=state.editingShift;p.shifts=p.shifts.filter(s=>!(s.date===od&&s.person===op));}
    p.shifts.push(newSh); p.shifts.sort((a,b)=>a.date.localeCompare(b.date));
    if(!p.people.includes(person)){p.people.push(person);p.people.sort();}
    personColor(person);
    p.selectedPerson=person;
    const[sy,sm]=date.split('-').map(Number); state.calYear=sy; state.calMonth=sm-1;

    persistAll(); closeModal('modal-shift'); refreshAll();
    renderPersonGrid(); renderPeopleChips(); renderPersonFilterDropdowns();
    state.exportActivePerson = person;  // show newly saved person in export
    refreshExportPanel();
    showToast(`✅ Sačuvano: ${person}`);
  }

  function closeModal(id){document.getElementById(id).classList.add('hidden');}

  document.addEventListener('DOMContentLoaded', init);
})();
