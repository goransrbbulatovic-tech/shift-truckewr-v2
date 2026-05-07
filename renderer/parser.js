/* parser.js — Parses the specific MAJ/shift grid format
   Format: time slots as row headers, dates as column groups,
   worker names in each cell (one per shift slot)
*/

const Parser = (() => {

  const TIME_REGEX = /(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})/;
  const DATE_REGEX = /(monday|tuesday|wednesday|thursday|friday|saturday|sunday|ponedjeljak|utorak|srijeda|četvrtak|petak|subota|nedjelja)/i;

  function parseHHMM(str) {
    if (!str) return null;
    const m = String(str).match(/(\d{1,2}):(\d{2})/);
    if (!m) return null;
    return parseInt(m[1]) * 60 + parseInt(m[2]);
  }

  function minutesToHours(mins) {
    if (mins < 0) mins += 24 * 60; // overnight shift
    return Math.round((mins / 60) * 10) / 10;
  }

  function getShiftType(start, end) {
    const s = parseHHMM(start);
    if (s === null) return 'custom';
    if (s >= 0   && s < 7 * 60)  return 'night';       // 00:00 – 07:xx
    if (s >= 7 * 60 && s < 12 * 60) return 'morning';  // 07:00 – 12:xx
    if (s >= 12 * 60 && s < 18 * 60) return 'afternoon'; // 12:00 – 18:xx
    if (s >= 18 * 60) return 'evening';                 // 18:00+
    return 'custom';
  }

  function calcHours(start, end) {
    const s = parseHHMM(start);
    const e = parseHHMM(end);
    if (s === null || e === null) return 0;
    let diff = e - s;
    if (diff <= 0) diff += 24 * 60;
    return minutesToHours(diff);
  }

  // ── Main parser: auto-detect format ─────────────────────────────
  function parse(workbook) {
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const raw = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' });

    // Try grid format (as shown in image) first, then table format
    let result = parseGridFormat(raw);
    if (!result || result.length === 0) {
      result = parseTableFormat(raw);
    }
    return result;
  }

  // ── Grid Format ──────────────────────────────────────────────────
  // Rows: dates/week-groups + time slots
  // Cols: each column is a day-of-week
  // Each cell: worker name(s)
  function parseGridFormat(rows) {
    const shifts = [];
    let currentDates = [];
    let currentTimeSlots = []; // [{start, end}]
    let weekRowStart = -1;

    // Scan for date rows and time-slot rows
    for (let r = 0; r < rows.length; r++) {
      const row = rows[r];
      const rowStr = row.join(' ');

      // Check if this row contains dates
      if (DATE_REGEX.test(rowStr) || /\d{4}/.test(rowStr)) {
        const dates = extractDatesFromRow(row);
        if (dates.length > 0) {
          currentDates = dates;
          currentTimeSlots = [];
          weekRowStart = r;
          continue;
        }
      }

      // Check if first cell has a time slot
      const firstCell = String(row[0] || '').trim();
      const timeMatch = firstCell.match(TIME_REGEX);
      if (timeMatch && currentDates.length > 0) {
        const start = timeMatch[1];
        const end   = timeMatch[2];
        // The remaining cells in this row correspond to days
        for (let c = 1; c < row.length; c++) {
          const cell = String(row[c] || '').trim();
          if (!cell) continue;
          // Cell can have multiple names (split by newline or common separator)
          const names = splitNames(cell);
          if (c - 1 < currentDates.length && currentDates[c - 1]) {
            names.forEach(name => {
              if (name && name.length > 1) {
                shifts.push({
                  person: name.toUpperCase().trim(),
                  date:   currentDates[c - 1],
                  startTime: start,
                  endTime:   end,
                  shiftType: getShiftType(start, end),
                  hours:     calcHours(start, end)
                });
              }
            });
          }
        }
        continue;
      }

      // Check if the row itself is a series of dates (multi-date row without day label)
      const dates2 = extractDatesFromRow(row);
      if (dates2.length >= 3) {
        currentDates = dates2;
        currentTimeSlots = [];
      }
    }

    return shifts;
  }

  // ── Table Format ─────────────────────────────────────────────────
  // Each row = one shift: Name | Date | Start | End [| Type]
  function parseTableFormat(rows) {
    if (!rows || rows.length < 2) return [];
    const header = rows[0].map(h => String(h || '').toLowerCase().trim());
    const shifts = [];

    // Detect column indices
    const nameIdx  = findCol(header, ['ime','name','person','radnik','zaposleni','osoba']);
    const dateIdx  = findCol(header, ['datum','date','dan']);
    const startIdx = findCol(header, ['pocetak','početak','start','od','from','poč']);
    const endIdx   = findCol(header, ['kraj','end','do','to','kraj']);
    const typeIdx  = findCol(header, ['tip','type','smjena','shift','vrsta']);

    if (nameIdx === -1 || dateIdx === -1) return [];

    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      const name = String(row[nameIdx] || '').trim().toUpperCase();
      if (!name) continue;
      const dateStr = parseDate(row[dateIdx]);
      if (!dateStr) continue;
      const start = startIdx > -1 ? String(row[startIdx] || '').trim() : '';
      const end   = endIdx   > -1 ? String(row[endIdx]   || '').trim() : '';
      const type  = typeIdx  > -1 ? String(row[typeIdx]  || '').trim() : getShiftType(start, end);

      shifts.push({
        person:    name,
        date:      dateStr,
        startTime: normalizeTime(start),
        endTime:   normalizeTime(end),
        shiftType: getShiftType(start, end),
        hours:     calcHours(start, end)
      });
    }
    return shifts;
  }

  // ── Helpers ──────────────────────────────────────────────────────
  function findCol(headers, candidates) {
    for (const c of candidates) {
      const idx = headers.findIndex(h => h.includes(c));
      if (idx > -1) return idx;
    }
    return -1;
  }

  function extractDatesFromRow(row) {
    const dates = [];
    for (const cell of row) {
      const s = String(cell || '').trim();
      if (!s) { dates.push(null); continue; }
      const d = parseDate(s);
      if (d) dates.push(d);
      else dates.push(null);
    }
    // Only return if at least 2 valid dates found
    const valid = dates.filter(Boolean);
    return valid.length >= 2 ? dates : [];
  }

  function parseDate(val) {
    if (!val) return null;
    const s = String(val).trim();

    // Already ISO: 2026-05-04
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

    // DD.MM.YYYY or DD/MM/YYYY
    const dmy = s.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})/);
    if (dmy) return `${dmy[3]}-${pad(dmy[2])}-${pad(dmy[1])}`;

    // Month name: "Monday, May 04, 2026" or "Monday, April 27, 2026"
    const full = s.match(/(\w+),?\s+(\w+)\s+(\d{1,2}),?\s+(\d{4})/);
    if (full) {
      const mon = MONTHS[full[2].toLowerCase()];
      if (mon) return `${full[4]}-${pad(mon)}-${pad(full[3])}`;
    }

    // "May 04, 2026"
    const mon2 = s.match(/(\w+)\s+(\d{1,2}),?\s+(\d{4})/);
    if (mon2) {
      const m = MONTHS[mon2[1].toLowerCase()];
      if (m) return `${mon2[3]}-${pad(m)}-${pad(mon2[2])}`;
    }

    // Excel serial date number
    if (/^\d{5}$/.test(s)) {
      const d = XLSX.SSF.parse_date_code(parseInt(s));
      if (d) return `${d.y}-${pad(d.m)}-${pad(d.d)}`;
    }

    return null;
  }

  const MONTHS = {
    january:1,february:2,march:3,april:4,may:5,june:6,
    july:7,august:8,september:9,october:10,november:11,december:12,
    januar:1,februar:2,mart:3,april_:4,maj:5,juni:6,
    juli:7,august_:8,septembar:9,oktobar:10,novembar:11,decembar:12
  };

  function pad(n) { return String(n).padStart(2, '0'); }

  function normalizeTime(t) {
    if (!t) return '';
    const m = String(t).match(/(\d{1,2}):(\d{2})/);
    if (!m) return t;
    return `${pad(m[1])}:${m[2]}`;
  }

  function splitNames(cell) {
    // Split by newline, comma, or slash
    return cell.split(/[\n\r,/\\|]+/)
      .map(s => s.trim())
      .filter(s => s.length > 1 && !/^\d+$/.test(s));
  }

  // ── Public API ───────────────────────────────────────────────────
  function getPeople(shifts) {
    return [...new Set(shifts.map(s => s.person))].sort();
  }

  function getShiftsForPerson(shifts, person) {
    return shifts.filter(s => s.person === person).sort((a, b) => a.date.localeCompare(b.date));
  }

  function getMonthlyStats(shifts, person, year, month) {
    const monthStr = `${year}-${pad(month + 1)}`;
    const monthly = shifts.filter(s => s.person === person && s.date.startsWith(monthStr));
    const totalHours = monthly.reduce((sum, s) => sum + (s.hours || 0), 0);
    const types = {};
    monthly.forEach(s => { types[s.shiftType] = (types[s.shiftType] || 0) + 1; });
    const dominantType = Object.entries(types).sort((a, b) => b[1] - a[1])[0];
    return {
      count: monthly.length,
      hours: Math.round(totalHours * 10) / 10,
      dominantType: dominantType ? dominantType[0] : '—'
    };
  }

  function getNextShift(shifts, person) {
    const today = new Date().toISOString().slice(0, 10);
    return shifts
      .filter(s => s.person === person && s.date >= today)
      .sort((a, b) => a.date.localeCompare(b.date))[0] || null;
  }

  return { parse, getPeople, getShiftsForPerson, getMonthlyStats, getNextShift, getShiftType, calcHours, pad };
})();
