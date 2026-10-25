<div align="center">

# pomonote<span>_</span>

**Focus timer · Tasks · Notes — in one keyboard-first app.**
Local-first. No account. No tracking. Installable.

[**Live demo →**](https://jamestamayo-imben.github.io/pomonote/)

![Local-first](https://img.shields.io/badge/local--first-no%20account-ffb100?style=flat-square&labelColor=0d0c0a)
![Dependencies](https://img.shields.io/badge/dependencies-0-ffb100?style=flat-square&labelColor=0d0c0a)
![PWA](https://img.shields.io/badge/PWA-installable-ffb100?style=flat-square&labelColor=0d0c0a)
![Hosting](https://img.shields.io/badge/hosting-GitHub%20Pages-ffb100?style=flat-square&labelColor=0d0c0a)

</div>

---

## Why pomonote

Most productivity tools want an account, a subscription and your data. pomonote is a single static app that keeps everything on your device: a Pomodoro timer that survives page reloads, a task list that understands plain English, and nested notes with Markdown. Open it, use it, install it.

## Features

### 01 — Focus
- Timestamp-based timer: keeps correct time through reloads, sleeping tabs and throttling
- Focus, short break and long break modes with configurable lengths and long-break interval
- Session labels, optional auto-start, sound and desktop notifications
- Live countdown in the browser tab title

### 02 — Tasks
- Natural-language quick-add: `Review draft tomorrow #work !1 ~3`
- Views: Today, Next 7 days, No date, All, Done
- Priorities, lists, due dates and estimated sessions
- Press ▶ on any task to start a focus session on it; completed sessions count against the estimate

### 03 — Notes
- Nested notes with a collapsible sub-note dropdown and pinning
- Sub-notes are also listed inside the parent note so you can open them from the editor
- Full-text search across titles and bodies
- Safe Markdown preview: headings, lists, `- [ ]` checklists, code blocks, quotes, links

### 04 — Stats
- Today, last 7 days, streak and tasks completed
- 14-day focus chart and a per-label breakdown

### Everything else
- Command palette (`Ctrl/Cmd + K`), light and dark themes
- Installable PWA that works offline after the first load
- JSON export and import for backups and moving devices
- Smooth, reduced-motion-friendly animations

## Quick start

```bash
git clone https://github.com/jamestamayo-imben/pomonote.git
cd pomonote
npm start        # http://localhost:3000  (Node 18+)
```

There is nothing to install: `server.js` is a zero-dependency static server. You can also open `public/` with any static host.

## Quick-add syntax

| Token | Meaning | Example |
|---|---|---|
| `#name` | List | `#work` |
| `!1` `!2` `!3` | Priority (1 is highest) | `!1` |
| `~N` | Estimated focus sessions | `~3` |
| `today`, `tomorrow`, `mon` … `sun` | Due date | `friday` |

`Write report friday #work !2 ~4` creates "Write report", due next Friday, in the work list, priority 2, estimated at 4 sessions.

## Keyboard shortcuts

| Keys | Action |
|---|---|
| `Ctrl/Cmd + K` | Command palette |
| `Space` | Start or pause the timer (Focus view) |
| `1` `2` `3` `4` | Switch between Focus, Tasks, Notes, Stats |
| `Ctrl/Cmd + E` | Toggle note preview |

## Sub-note rules

- A note can have up to **10** sub-notes.
- A sub-note **cannot** have its own sub-notes.
- Old or imported data that breaks these rules is repaired automatically.

## Install as an app

Open the site over HTTPS (or `localhost`), then use the **Install** button in the header, your browser's install option, or **Add to Home Screen** on iOS. No login or registration, ever.

## Your data

Everything is stored in your browser's `localStorage` on your device. Nothing is sent anywhere.

- Data is per browser and per web address. Clearing site data erases it.
- Use **Export** (command palette) to back up, and **Import** to restore or move devices.
- If you change the site's URL or domain, export first and import on the new address.

## Deploy to GitHub Pages

1. Push this repo to GitHub (branch `main`).
2. Go to **Settings → Pages** and set **Source** to **GitHub Actions**.
3. The included workflow publishes the `public/` folder on every push.

Live site: <https://jamestamayo-imben.github.io/pomonote/>

## Project structure

```
pomonote/
├─ server.js                  Zero-dependency static server (local use)
├─ package.json
├─ .github/workflows/pages.yml  GitHub Pages deploy
└─ public/
   ├─ index.html              Markup
   ├─ style.css               Design tokens, layout, motion
   ├─ lib.js                  Store, quick-add parser, Markdown renderer
   ├─ app.js                  UI, timer, tasks, notes, stats, command palette
   ├─ sw.js                   Offline cache (service worker)
   ├─ manifest.webmanifest    Install metadata
   └─ icon*.png / icon.svg    App icons
```

## Roadmap

- [ ] Optional cross-device sync and share-by-link
- [ ] Calendar and kanban task views
- [ ] Recurring tasks
- [ ] Drag-and-drop for notes and tasks

## Design

Dark by default with a single amber accent (`#ffb100`), numbered sections, monospace labels and a blinking terminal cursor, inspired by the look of [Levo Studio](https://levo-studio.com/).

---

<div align="center">
<sub>Built to be fast, private and yours.</sub>
</div>