# FocusFlow — JARVIS Edition

*Your Day. Your Mission. Execute.*

A personal productivity workstation with a futuristic, JARVIS-inspired interface. Ten modules — to-do list, alarms & reminders, Pomodoro timer, study timetable, habit tracker, analytics, goals, notes, journal and expense tracker — plus demo sign-up/login and settings.

**Stack:** HTML5, CSS3, vanilla ES6+ JavaScript, `localStorage`. No frameworks, no build step, no backend, no external requests. The reactor and all 3D effects are original CSS/SVG.

## Run it

Any static server works (the app uses Web Crypto, which needs `http://localhost` or `https`, so don't open the file via `file://`).

- **VS Code:** install *Live Server*, right-click `index.html` → *Open with Live Server*.
- **Python:** `python3 -m http.server 8000` in this folder, then open `http://localhost:8000`.

Create an account on the sign-up page, or use **"Launch the shared demo account"**. On the empty dashboard you can load clearly labelled `[Sample]` data to explore every module, then remove it in one click from Settings.

## Project structure

```
index.html  signup.html  login.html  dashboard.html
css/   variables · global · animations · auth · dashboard · modules · responsive
js/
  utils.js      namespace (FF), DOM builders (XSS-safe), event bus, date/currency/validation helpers
  storage.js    versioned, account-scoped localStorage, corruption backup, export/import validation
  ui.js         icons, toasts, dialogs, form modal, progress rings, 3D tilt, HUD background
  services.js   Web Audio alarm tones (synthesised, no audio files) + Notifications API
  reactor.js    animated reactor + brand emblem      charts.js   SVG bar/line/donut charts
  auth.js       demo accounts, PBKDF2 hashing, sessions   auth-pages.js  login/signup behaviour
  app.js        shell: hash router, drawer, topbar, alerts bell
  tasks · reminders · timer · timetable · habits · analytics · goals · notes · journal · expenses
  sample.js · settings.js · dashboard.js
```

Each module registers its own view with `FF.registerView(...)`. Data lives in account-scoped keys such as `ff:v1:u:<accountId>:tasks`, and every write emits `data:changed`, so the dashboard, bell badge and analytics stay in sync.

## How data works

- Everything is stored in **this browser's localStorage**, separated per demo account. There is no server, sync or recovery.
- Writes are immediate. Notes and journal autosave (debounced) and also flush when you navigate away or close the tab.
- Unreadable data is never silently overwritten: a copy is kept under a `…:corrupt:<timestamp>` key and you get a warning.
- **Export/Import (Settings):** export a JSON backup any time. Imports are validated first (app marker, schema version, types, unique ids), you are asked to confirm before anything is replaced, and a safety backup of the current data is saved first.
- Browsers allow roughly 5 MB of localStorage per site. Export backups, and remember that clearing site data deletes everything.

## Honest limitations

**Authentication is a demo, not security.** Accounts and sessions live in the same browser storage anyone with access to the device can read or edit. Passwords are never stored in plaintext (random salt + PBKDF2-SHA256), the dashboard redirect is a convenience, not protection, and the shared demo account has a *public* password. Don't reuse a real password or store sensitive information. There is no "forgot password" email: use a different account, or "Reset all local demo data" on the login page.

**Alarms only work while FocusFlow is open.** Reminders use ordinary JavaScript timers. They cannot fire if the browser is closed, the device is asleep or the OS suspends the tab. Anything that came due in that time appears as *Missed* (recurring reminders skip ahead to their next occurrence). Browser notifications are optional, requested only after you click the button, and may not work on some mobile browsers. Audio needs one interaction with the page first (browser autoplay rules).

**Journal data is not encrypted.** Expense tracking is bookkeeping, not financial advice.

## Notes on behaviour

- **Timer** uses absolute timestamps, so it stays accurate in background tabs and survives a refresh. Only fully elapsed focus sessions count toward totals; stopped sessions are logged as "stopped early" and excluded.
- **Streaks** count consecutive calendar days; a streak stays alive until a full day is missed. Habit completions are unique dates per habit.
- **Goals** only change when you log progress or tick milestones; linked tasks are shown but never change progress silently.
- **Motion:** decorative animations pause in hidden tabs and respect `prefers-reduced-motion` (override in Settings or the profile menu). Pointer tilt is disabled on touch devices.

## Testing performed

Automated Chromium run (Playwright) covering: sign-up validation and duplicate prevention, login errors, no plaintext password in storage, session refresh, logout guard, per-account data separation; tasks create/edit/complete/delete/search/sort/filter; linked reminders; timer start/pause/resume/refresh-restore/completion/early reset; alarm dialog, snooze, missed one-time and recurring handling; timetable conflict detection; habit streak maths and duplicate prevention; goal progress and auto-completion; notes and journal autosave and flush-on-navigate; expense validation and totals; analytics rendering; export, invalid/valid import and cancel; and no horizontal overflow on every page at 320, 375, 430, 768, 1024, 1440 and 1920 px, with zero console errors.
Not covered: real alarm timing across hours of runtime, real browser-notification delivery, screen-reader walkthroughs, and non-Chromium browsers.
