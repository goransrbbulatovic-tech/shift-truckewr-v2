# 📅 Raspored Smjena — by AcoRonaldo

Profesionalna aplikacija za upravljanje rasporedom smjena. Učitaj Excel, odaberi osobu, vidi kalendar smjena — sve u jednom elegantnom dark-theme sučelju.

---

## ✨ Funkcije

| Funkcija | Opis |
|---|---|
| 📤 **Uvoz Excela** | Automatski parsira grid format rasporeda smjena |
| 👤 **Odabir osobe** | Prikazuje samo smjene odabrane osobe |
| 📅 **Kalendar** | Vizualni mjesečni kalendar sa smjenama i satima |
| ✏️ **Izmjene** | Dodaj, izmijeni ili obriši smjene ručno |
| 📊 **Izvoz Excel** | Stilizirani .xlsx sa statistikama |
| 🖨️ **Izvoz PDF** | Profesionalni kalendar spreman za štampu |
| 🔔 **Podsjetnici** | Lični kalendar sa bilješkama |
| 🎨 **Teme** | 6 tamnih tema + prilagođena slika/boja pozadine |

---

## 🚀 Pokretanje (Development)

### Zahtjevi
- [Node.js](https://nodejs.org) v18 ili noviji
- npm (dolazi sa Node.js)

### Instalacija

```bash
# 1. Kloniraj repozitorij
git clone https://github.com/TVOJ_USERNAME/raspored-smjena.git
cd raspored-smjena

# 2. Instaliraj zavisnosti
npm install

# 3. Pokreni aplikaciju
npm start
```

---

## 📦 Build (Pakovanje)

```bash
# Windows (.exe installer)
npm run build:win

# Linux (.AppImage)
npm run build:linux

# macOS (.dmg)
npm run build:mac

# Sve platforme
npm run build:all
```

Gotovi fajlovi se nalaze u `dist/` folderu.

---

## 🤖 GitHub Actions (Automatski Build)

Svaki push na `main` branch automatski pokreće build za Windows i Linux.

Za kreiranje Release-a:
```bash
git tag v1.0.0
git push origin v1.0.0
```

GitHub Actions će automatski kreirati Release sa `.exe` i `.AppImage` fajlovima.

---

## 📊 Format Excel Fajla

Aplikacija podržava format prikazan u primjeru (MAJ 2026 raspored):

```
          | Pon, Apr 27 | Uto, Apr 28 | Sri, Apr 29 | ...
----------|-------------|-------------|-------------|----
00:00-06:30 | IME1      | IME2        | IME3        | ...
06:30-12:00 | IME2      | IME3        | IME1        | ...
12:00-18:00 | IME3      | IME1        | IME2        | ...
18:00-00:00 | IME4      | IME4        | IME4        | ...
```

Podržani su i standardni tabularni formati sa kolonama: `Ime | Datum | Početak | Kraj`.

---

## 🎨 Teme

| Tema | Boje |
|---|---|
| Midnight Blue | Navy + Cyan (default) |
| Carbon Dark | Crna + Narandžasta |
| Forest Night | Tamnozelena + Mint |
| Crimson Pro | Tamnocrvena + Ružičasta |
| Aurora | Tamno plava + Ljubičasta |
| Steel Gray | Siva + Svijetlosiva |

---

## 🏗️ Struktura Projekta

```
raspored-smjena/
├── main.js              # Electron glavni proces
├── preload.js           # Sigurni IPC bridge
├── package.json         # Zavisnosti i build config
├── renderer/
│   ├── index.html       # Glavno sučelje
│   ├── style.css        # Kompletni stilovi (dark theme)
│   ├── app.js           # Aplikacijska logika
│   ├── parser.js        # Excel parser
│   └── exporter.js      # Excel/PDF export
├── assets/
│   └── icon.svg         # Ikona aplikacije
└── .github/
    └── workflows/
        └── build.yml    # CI/CD pipeline
```

---

## 📝 Kreiranje GitHub Repozitorija

1. Idi na [github.com/new](https://github.com/new)
2. Naziv: `raspored-smjena`
3. Opis: `Raspored Smjena by AcoRonaldo — Professional Shift Scheduler`
4. Postavi na **Private** ili **Public**
5. **Ne** inicijalizuj sa README (imamo ga već)

```bash
git init
git add .
git commit -m "feat: initial release - Raspored Smjena by AcoRonaldo"
git branch -M main
git remote add origin https://github.com/TVOJ_USERNAME/raspored-smjena.git
git push -u origin main
```

GitHub Actions automatski pokreće build!

---

## 📄 Licenca

MIT © 2026 AcoRonaldo
