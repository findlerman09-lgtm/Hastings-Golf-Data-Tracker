# ⛳ Hastings Golf Data Tracker

A next-level golf stats tracker for a **team and coach** — built as a
zero-backend static site so it runs for free on **GitHub Pages**.

- **Coach app** (`index.html`) — full roster + round management, live scorecards,
  scoring trends, leaderboards, and advanced stats.
- **Photo entry** — snap or upload a scorecard photo and the app reads the
  numbers for you with in-browser OCR (no API keys, nothing leaves the device).
- **Backup & publish** — export your data as JSON for safekeeping or to move
  between devices, and publish a lightweight `data.json` that powers a
  **public read-only dashboard** (`public.html`) anyone can view.

Everything runs client-side. Your data lives in your browser (localStorage)
until you choose to export or publish it.

---

## Quick start

Open `index.html` in a browser (or serve the folder) and start adding players.
To run locally with the OCR feature working, serve over HTTP rather than
`file://`:

```bash
python3 -m http.server 8000
# then visit http://localhost:8000/
```

## Features

### Team & coach dashboard
- **Leaderboard** ranked by 18-hole scoring average (9-hole rounds are
  normalized to 18 for fair comparison).
- **Team scoring trend** chart over the season.
- Per-player detail pages with best round, average-to-par, recent-form trend,
  and a **handicap index** (USGA-style, from course rating & slope).
- Recent rounds feed.

### Full scorecard tracking
Each round captures **every category on a real scorecard**, per hole:
- **Yardage** (YDS) and **stroke index** (SI)
- **Par** and **gross score** (GRS)
- **Fairways hit** (FWY) — auto-excluded on par 3s
- **Putts** (PUT)
- **Greens in regulation** (GIR)
- **Pace** (PAC)
- **Running score to par** (TOT) — computed live as you enter scores

The app rolls these into fairway %, putts/round, and GIR % automatically (just
like the 29% / 13 / 78% totals on a scorecard), and shows the running to-par
after every hole. Card metadata is captured too: **tee rating & slope**
including **front/back splits** (e.g. Blue 70.1/124, F 34.6/121, B 35.5/127),
**round #**, **starting hole**, and **scorer / attested-by**. Course rating &
slope feed each player's handicap index.

Per-hole detail is optional — toggle *"Full card"* off for a quick score-only
entry.

### Add a round by photo (OCR)
1. In **Log round**, click **Upload scorecard** and pick/take a photo.
2. The image is downscaled and [Tesseract.js](https://tesseract.projectnaptha.com/)
   reads it in your browser. It reconstructs the scorecard table by position and
   reads **the whole card** — scores plus **par, yardage, stroke index,
   fairways, putts, GIR, and pace** — pre-filling every row (the round switches
   to full-card view automatically).
3. **Review and correct** the detected values — OCR of a scorecard is never
   perfect — then save. The photo is stored with the round for reference.

The image is grayscaled and contrast-boosted before recognition to help
Tesseract. Expand **"What OCR read"** under the photo (in Log round or the
importer) to see exactly what was detected — useful for spotting misreads.
OCR quality depends heavily on the screenshot; for the most reliable reads,
crop tightly to the scorecard grid.

> OCR needs an internet connection the first time (to load the library from a
> CDN). If it can't load, the photo is still saved and you can enter scores
> manually.

### Events & batch screenshot import
An **event** (a meet/match) groups the round each player shot that day, plus the
event details (date, start time, course, location).

The **Events → Import from screenshots** flow is built for the real workflow of
one event = ~15 screenshots:

1. Enter the event details (or let them come from your event-info screenshot).
2. Drop **all** the event's screenshots at once.
3. Tag each image:
   - **Scorecard** → pick the player and whether it's their **front nine**,
     **back nine**, or **full 18**. Browser OCR reads the full card (scores,
     par, fairways, putts, GIR, yardage, SI, pace).
   - **Leaderboard** / **Event info** → kept for reference.
4. The app **stitches each player's front + back nine into one 18-hole round**
   and creates the event. Review the standings and fix any OCR misreads in the
   normal round editor.

Leave **"Import as full round"** checked (the default) and each imported round
opens with the full-card grid already on, so the Putt / Fairway / GIR / Yardage
/ SI / Pace rows are ready to fill in while you review — no need to toggle
"Full card" on every round.

### Per-event workbook export
From any event, **⬇ Workbook** downloads a multi-sheet spreadsheet:
**Event** (details), **Leaderboard** (standings + fairways/putts/GIR), and
**Hole-by-Hole** (every player, all 18 holes, with Out/In/Total/± vs par).

> The workbook uses [SheetJS](https://sheetjs.com/) (loaded on demand) to build
> a real `.xlsx`. If that library can't load, it falls back to a `.csv` bundle
> so the export never fails.

### Backup & publish

Open the **Backup & Publish** tab:

- **Full backup** — downloads everything (including photos). Use it to move
  data to another device (**Import / restore** supports *replace* or *merge*).
- **Publish** — downloads a slim `data.json` (stats & scores, no photos) to
  commit into your repo so the public dashboard shows current team stats.

---

## Publishing to your public GitHub page

1. In the app, go to **Backup & Publish → Export data.json for publishing**.
2. Commit the downloaded file to this repo at **`data/data.json`** (replace the
   sample that ships here).
3. Enable GitHub Pages:
   - **Settings → Pages → Build and deployment**.
   - Either use **GitHub Actions** (the included
     [`.github/workflows/pages.yml`](.github/workflows/pages.yml) deploys on
     every push to `main`), or **Deploy from a branch** → `main` / root.
4. Share your public URL:
   - Coach app: `https://<user>.github.io/<repo>/`
   - Public stats: `https://<user>.github.io/<repo>/public.html`

Re-export and re-commit `data.json` whenever you want to refresh the public
numbers. (A `.nojekyll` file is included so GitHub Pages serves the assets
as-is.)

---

## Data model

`data/data.json` (and every export) has this shape:

```jsonc
{
  "version": 2,
  "team": { "name": "Hastings Golf", "season": "Spring 2026", "coach": "..." },
  "players": [
    { "id": "...", "name": "Alex Morgan", "classYear": "2026", "squad": "Varsity" }
  ],
  "events": [
    { "id": "...", "name": "Legacy at Hastings Invitational", "date": "2026-04-30",
      "startTime": "10:00 AM", "course": "Legacy at Hastings", "location": "Hastings, MN" }
  ],
  "rounds": [
    {
      "id": "...", "playerId": "...", "eventId": "...", "date": "2026-04-05",
      "course": "Hastings Muni", "tee": "White", "holes": 18,
      "pars":     [4,4,4,3,5, ...],
      "scores":   [5,4,6,3,5, ...],
      "fairways": [false,false,true,null,true, ...],  // null = par 3 / not tracked
      "putts":    [2,1,2,1,2, ...],
      "girs":     [false,true,true,true,true, ...],
      "yards":    [388,467,346,161,373, ...],
      "courseRating": 70.1,
      "slopeRating": 124,
      "photo": null
    }
  ]
}
```

## Project layout

```
index.html          Coach app
public.html         Read-only public dashboard
data/data.json      Published team data (commit your export here)
assets/css/app.css  Styles (light + dark)
assets/js/
  store.js          Data model (players, events, rounds), persistence, import/export
  stats.js          Derived golf statistics + handicap + event standings
  charts.js         Dependency-free SVG charts
  ocr.js            Photo downscaling + Tesseract.js OCR
  workbook.js       Per-event .xlsx/.csv workbook export (SheetJS on demand)
  app.js            Coach app UI (dashboard, events, batch import, roster, rounds)
  public.js         Public dashboard UI
.github/workflows/pages.yml   Optional GitHub Pages deploy
```

No build step, no npm install — plain HTML/CSS/JS.
