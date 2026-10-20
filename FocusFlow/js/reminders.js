/* ==========================================================================
   FocusFlow — reminders.js
   Alarms & reminders: one-time / daily / weekly, snooze, dismiss, missed
   handling, duplicate-alert prevention, Web Audio + Notifications API.

   LIMITATION: this runs on ordinary JavaScript timers. Alarms cannot fire
   while the browser/tab is closed, the device sleeps, or the OS suspends the
   page. Reminders that were due in that time are shown as "missed".
   ========================================================================== */
(function () {
  'use strict';
  const FF = window.FF;
  const { el, clear, util } = FF;
  const store = FF.store;

  const GRACE_MS = 5 * 60 * 1000;        // later than this = missed, not ringing
  const DAY = 86400000;
  const REPEATS = [{ value: 'none', label: 'One time' }, { value: 'daily', label: 'Every day' }, { value: 'weekly', label: 'Every week' }];
  const repeatLabel = (v) => (REPEATS.find((r) => r.value === v) || REPEATS[0]).label;

  const load = () => store.get('reminders');
  const toneOptions = () => Object.entries(FF.audio.TONES).map(([value, t]) => ({ value, label: t.label }));

  /* ----------------------------------------------------------- Scheduling */
  /** First occurrence strictly after `after` for a repeating reminder. */
  function nextOccurrence(baseMs, repeat, after) {
    if (repeat === 'none') return baseMs;
    const step = repeat === 'daily' ? 1 : 7;
    const d = new Date(baseMs);
    if (d.getTime() <= after) {
      const jump = Math.floor((after - d.getTime()) / (DAY * step));
      if (jump > 0) d.setDate(d.getDate() + jump * step);
      while (d.getTime() <= after) d.setDate(d.getDate() + step);
    }
    return d.getTime();
  }

  function patch(id, fn) {
    let out = null;
    store.update('reminders', (list) => {
      const r = list.find((x) => x.id === id);
      if (r) { fn(r); out = { ...r }; }
    });
    return out;
  }

  /* ----------------------------------------------------------- Public API */
  const active = () => load().filter((r) => r.status === 'active');
  const upcoming = () => util.sortBy(active(), 'nextAt');
  const missed = () => util.sortBy(load().filter((r) => r.status === 'missed'), (r) => -r.nextAt);
  const past = () => util.sortBy(load().filter((r) => r.status === 'done'), (r) => -(r.completedAt || r.nextAt));
  const soon = (minutes) => upcoming().filter((r) => r.nextAt - Date.now() <= minutes * 60000 && r.nextAt >= Date.now() - 1000);

  /** Create/update a reminder owned by another module (tasks, timetable). Past one-time reminders are removed. */
  function upsertLinked({ key, title, description = '', at, repeat = 'none', tone, taskId = '' }) {
    const atMs = at instanceof Date ? at.getTime() : Number(at);
    if (!Number.isFinite(atMs)) return;
    const next = nextOccurrence(atMs, repeat, Date.now());
    if (repeat === 'none' && atMs <= Date.now()) { removeLinked(key); return; }
    store.update('reminders', (list) => {
      let r = list.find((x) => x.linkedKey === key);
      if (!r) {
        r = { id: util.uid('rem'), createdAt: new Date().toISOString(), linkedKey: key, lastFired: 0 };
        list.push(r);
      } else if (r.baseAt !== atMs) r.lastFired = 0;
      Object.assign(r, { title, description, repeat, baseAt: atMs, nextAt: next, status: 'active', tone: tone || '', taskId });
    });
  }
  function removeLinked(key) {
    const list = load();
    if (list.some((r) => r.linkedKey === key)) store.set('reminders', list.filter((r) => r.linkedKey !== key));
  }

  /* --------------------------------------------------------------- Engine */
  const queue = [];
  let showing = false;
  const handled = new Set();           // "id@nextAt" already alerted this page-load (duplicate guard)

  function finishOccurrence(r, how) {
    patch(r.id, (x) => {
      if (x.repeat !== 'none') { x.nextAt = nextOccurrence(x.baseAt || x.nextAt, x.repeat, Date.now()); x.lastFired = 0; }
      else { x.status = 'done'; x.completedAt = Date.now(); x.outcome = how; }
    });
    if (how === 'complete' && r.taskId && FF.tasks) {
      const t = store.find('tasks', r.taskId);
      if (t && t.status === 'pending') FF.tasks.toggle(r.taskId);
    }
  }

  function snooze(r, minutes) {
    patch(r.id, (x) => { x.nextAt = Date.now() + minutes * 60000; x.lastFired = 0; x.snoozed = (x.snoozed || 0) + 1; });
    FF.ui.toast('Snoozed "' + r.title + '" for ' + minutes + ' minutes.', 'info');
  }

  async function ring(r) {
    showing = true;
    FF.bus.emit('alarm:ringing', true);
    const s = store.settings();
    const loop = FF.audio.loop(r.tone || s.sound.tone, 90);
    if (FF.notify.enabled()) FF.notify.show('FocusFlow reminder', r.title + (r.description ? ' — ' + r.description : ''), r.id);

    const body = el('div', { class: 'stack alarm-body' },
      el('div', { class: 'alarm-ring' }, FF.reactor.create({ size: 'sm', active: true }), el('div', { class: 'alarm-time num', text: util.formatTime(new Date(r.nextAt).toTimeString().slice(0, 5)) })),
      el('h3', { class: 'wrap-text', text: r.title }),
      r.description ? el('p', { class: 'muted wrap-text', text: r.description }) : null,
      el('p', { class: 'small muted', text: repeatLabel(r.repeat) + (r.snoozed ? ' · snoozed ' + util.plural(r.snoozed, 'time') : '') }),
      !loop.played && s.sound.enabled ? el('p', { class: 'notice small', 'data-accent': 'flame' }, 'Sound is blocked until you interact with the page. Click anywhere once to allow alarm audio.') : null);

    const d = FF.ui.dialog({
      title: 'Reminder', className: 'alarm-dialog', backdropClose: false, body,
      actions: [
        { label: 'Snooze 5 min', value: 'snooze5' },
        { label: 'Snooze 10 min', value: 'snooze10' },
        { label: 'Dismiss', value: 'dismiss' },
        { label: 'Mark complete', value: 'complete', kind: 'primary', autofocus: true, icon: 'check' }
      ]
    });
    const choice = await d;
    loop.stop();
    if (choice === 'snooze5') snooze(r, 5);
    else if (choice === 'snooze10') snooze(r, 10);
    else if (choice === 'complete') { finishOccurrence(r, 'complete'); FF.activity.log('Completed reminder: ' + r.title, 'green'); }
    else finishOccurrence(r, 'dismiss');
    showing = false;
    FF.bus.emit('alarm:ringing', queue.length > 0);
    next();
  }

  function next() {
    if (showing || !queue.length) return;
    const id = queue.shift();
    const r = store.find('reminders', id);
    if (r && r.status === 'active') ring(r); else next();
  }

  function tick() {
    const now = Date.now();
    const list = load();
    let missedCount = 0;
    list.forEach((r) => {
      if (r.status !== 'active' || r.nextAt > now) return;
      const key = r.id + '@' + r.nextAt;
      if (handled.has(key) || r.lastFired === r.nextAt) return;
      handled.add(key);
      if (now - r.nextAt > GRACE_MS) {
        missedCount++;
        patch(r.id, (x) => {
          if (x.repeat !== 'none') { x.nextAt = nextOccurrence(x.baseAt || x.nextAt, x.repeat, now); x.missedCount = (x.missedCount || 0) + 1; x.lastMissedAt = r.nextAt; }
          else { x.status = 'missed'; x.lastFired = r.nextAt; }
        });
        return;
      }
      patch(r.id, (x) => { x.lastFired = r.nextAt; });   // persisted before ringing → no duplicate after refresh
      const inApp = store.settings().notifications.inApp;
      if (inApp) { if (!queue.includes(r.id)) queue.push(r.id); }
      else {
        FF.ui.toast('Reminder: ' + r.title, 'warn', 0);
        FF.notify.show('FocusFlow reminder', r.title, r.id);
        FF.audio.play(r.tone);
        finishOccurrence(r, 'dismiss');
      }
    });
    if (missedCount) FF.ui.toast(util.plural(missedCount, 'reminder') + ' came due while FocusFlow was closed or asleep. See Alarms & Reminders.', 'warn', 8000);
    next();
  }

  /* ------------------------------------------------------------------ Form */
  async function openForm(rem) {
    const editing = !!rem;
    const tasks = FF.tasks ? FF.tasks.list().filter((t) => t.status === 'pending') : [];
    const at = rem ? new Date(rem.baseAt || rem.nextAt) : new Date(Date.now() + 3600000);
    const fields = [
      { name: 'title', label: 'Title', type: 'text', required: true, maxLength: 100, span2: true },
      { name: 'description', label: 'Description', type: 'textarea', maxLength: 300, rows: 2, span2: true },
      { name: 'date', label: 'Date', type: 'date', required: true },
      { name: 'time', label: 'Time', type: 'time', required: true },
      { name: 'repeat', label: 'Repeat', type: 'select', options: REPEATS },
      { name: 'tone', label: 'Alarm sound', type: 'select', options: [{ value: '', label: 'Default sound' }, ...toneOptions()] }
    ];
    if (tasks.length && !(rem && rem.linkedKey)) fields.push({ name: 'taskId', label: 'Link to task', type: 'select', span2: true, options: [{ value: '', label: 'No task' }, ...tasks.map((t) => ({ value: t.id, label: t.title }))] });
    const res = await FF.ui.formModal({
      title: editing ? 'Edit reminder' : 'New reminder', submitText: editing ? 'Save changes' : 'Add reminder', fields,
      values: {
        title: rem ? rem.title : '', description: rem ? rem.description : '', date: util.dateStr(at), time: at.toTimeString().slice(0, 5),
        repeat: rem ? rem.repeat : 'none', tone: rem ? rem.tone || '' : '', taskId: rem ? rem.taskId || '' : ''
      },
      validate(v) {
        const when = util.atDateTime(v.date, v.time).getTime();
        if (v.repeat === 'none' && when <= Date.now()) return { time: 'Choose a time in the future for a one-time reminder.' };
        return {};
      }
    });
    if (!res) return null;
    const base = util.atDateTime(res.date, res.time).getTime();
    const nextAt = nextOccurrence(base, res.repeat, Date.now());
    const data = { title: res.title, description: res.description, repeat: res.repeat, tone: res.tone, taskId: res.taskId || (rem ? rem.taskId || '' : ''), baseAt: base, nextAt, status: 'active', lastFired: 0 };
    if (editing) patch(rem.id, (x) => Object.assign(x, data, { completedAt: null }));
    else store.upsert('reminders', Object.assign({ id: util.uid('rem'), createdAt: new Date().toISOString(), linkedKey: '' }, data));
    FF.activity.log((editing ? 'Updated reminder: ' : 'Added reminder: ') + res.title, 'cyan');
    FF.ui.toast(editing ? 'Reminder updated.' : 'Reminder added.', 'success');
    return true;
  }

  async function removeReminder(r) {
    const ok = await FF.ui.confirm({ title: 'Delete reminder?', message: '"' + r.title + '" will be deleted.', confirmText: 'Delete', danger: true });
    if (ok) { store.remove('reminders', r.id); FF.ui.toast('Reminder deleted.', 'info'); }
  }

  /* ------------------------------------------------------------------ View */
  function row(r, kind) {
    const when = new Date(r.nextAt);
    const acc = kind === 'missed' ? 'flame' : kind === 'past' ? 'green' : r.nextAt - Date.now() < 3600000 ? 'red' : 'cyan';
    const actions = el('div', { class: 'task-actions' });
    if (kind === 'upcoming') {
      actions.append(
        el('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: () => { finishOccurrence(r, 'complete'); FF.ui.toast('Marked complete.', 'success'); } }, FF.ui.icon('check'), 'Complete'),
        el('button', { type: 'button', class: 'btn btn-ghost btn-icon btn-sm', 'aria-label': 'Edit reminder: ' + r.title, onclick: () => openForm(r) }, FF.ui.icon('edit')));
    } else if (kind === 'missed') {
      actions.append(
        el('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: () => openForm(r) }, FF.ui.icon('repeat'), 'Reschedule'),
        el('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: () => { patch(r.id, (x) => { x.status = 'done'; x.completedAt = Date.now(); x.outcome = 'complete'; }); } }, FF.ui.icon('check'), 'Done'));
    }
    actions.append(el('button', { type: 'button', class: 'btn btn-ghost btn-icon btn-sm', 'aria-label': 'Delete reminder: ' + r.title, onclick: () => removeReminder(r) }, FF.ui.icon('trash')));
    return el('li', { class: 'task-item rem-item', 'data-accent': acc },
      el('span', { class: 'rem-ico' }, FF.ui.icon(kind === 'missed' ? 'alert' : kind === 'past' ? 'check' : 'bell')),
      el('div', { class: 'task-body' },
        el('div', { class: 'task-title wrap-text', text: r.title }),
        r.description ? el('div', { class: 'task-desc wrap-text', text: r.description }) : null,
        el('div', { class: 'task-meta' },
          el('span', { class: 'badge', 'data-accent': acc }, FF.ui.icon('clock'), util.formatDateTime(when) + (kind === 'upcoming' ? ' · ' + util.relative(r.nextAt - Date.now()) : '')),
          r.repeat !== 'none' ? el('span', { class: 'badge', 'data-accent': 'violet' }, FF.ui.icon('repeat'), repeatLabel(r.repeat)) : null,
          r.taskId && store.find('tasks', r.taskId) ? el('span', { class: 'badge', 'data-accent': 'red' }, FF.ui.icon('link'), store.find('tasks', r.taskId).title) : null,
          r.linkedKey && r.linkedKey.startsWith('session:') ? el('span', { class: 'badge', 'data-accent': 'blue' }, FF.ui.icon('calendar'), 'Study session') : null,
          r.missedCount ? el('span', { class: 'muted small', text: 'missed ' + util.plural(r.missedCount, 'time') }) : null)),
      actions);
  }

  function section(title, accent, items, kind, emptyText) {
    const ul = el('ul', { class: 'task-list' });
    if (!items.length) ul.appendChild(el('li', { class: 'empty-li' }, el('div', { class: 'empty small', text: emptyText })));
    else items.forEach((r) => ul.appendChild(row(r, kind)));
    return el('section', { class: 'stack', 'aria-label': title }, el('h3', { class: 'section-h', 'data-accent': accent }, title + ' (' + items.length + ')'), ul);
  }

  function render(root, ctx) {
    const countdown = el('div', { class: 'big-count num', 'aria-live': 'off' });
    const countSub = el('div', { class: 'muted' });
    const sections = el('div', { class: 'stack', style: { gap: '22px' } });
    const permBox = el('div', { class: 'stack' });

    function paintCountdown() {
      const n = upcoming()[0];
      if (!n) { countdown.textContent = '--:--:--'; countSub.textContent = 'No active reminders. Add one to arm the system.'; return; }
      const ms = n.nextAt - Date.now();
      const total = Math.max(0, Math.floor(ms / 1000));
      const d = Math.floor(total / 86400), h = Math.floor((total % 86400) / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
      countdown.textContent = (d ? d + 'd ' : '') + util.pad(h) + ':' + util.pad(m) + ':' + util.pad(s);
      countSub.textContent = n.title + ' · ' + util.formatDateTime(new Date(n.nextAt));
    }

    function paintPerm() {
      clear(permBox);
      const s = store.settings();
      const perm = FF.notify.permission();
      permBox.append(
        el('label', { class: 'switch' }, el('input', { type: 'checkbox', checked: s.sound.enabled ? true : null, onchange: (e) => store.saveSettings({ sound: { enabled: e.target.checked } }) }), el('span', { class: 'track' }), 'Alarm sounds'),
        el('div', { class: 'row' },
          el('button', { type: 'button', class: 'btn btn-sm', onclick: () => { FF.audio.unlock(); const ok = FF.audio.play(s.sound.tone, { force: true }); if (!ok) FF.ui.toast('Audio is not available yet — interact with the page and try again, or this browser blocks Web Audio.', 'warn'); } }, FF.ui.icon('volume'), 'Test sound'),
          perm === 'granted'
            ? el('label', { class: 'switch' }, el('input', { type: 'checkbox', checked: s.notifications.browser ? true : null, onchange: (e) => { store.saveSettings({ notifications: { browser: e.target.checked } }); paintPerm(); } }), el('span', { class: 'track' }), 'Browser notifications')
            : el('button', { type: 'button', class: 'btn btn-sm', disabled: perm === 'unsupported' || perm === 'denied' ? true : null, onclick: async () => {
              const res = await FF.notify.request();
              if (res === 'granted') { store.saveSettings({ notifications: { browser: true } }); FF.notify.show('FocusFlow', 'Browser notifications are on.', 'welcome'); }
              paintPerm();
            } }, FF.ui.icon('bell'), 'Enable browser notifications')),
        el('p', { class: 'small muted', text: FF.notify.describe() }));
    }

    function renderLists() {
      clear(sections);
      sections.append(
        section('Upcoming', 'cyan', upcoming(), 'upcoming', 'Nothing scheduled. Create a reminder to get started.'),
        ...(missed().length ? [section('Missed', 'flame', missed(), 'missed', '')] : []),
        section('Past', 'green', past().slice(0, 20), 'past', 'Completed reminders will appear here.'));
      paintCountdown();
    }

    root.append(
      el('div', { class: 'page-head' },
        el('div', null, el('div', { class: 'hud-label', text: 'Alert systems' }), el('h2', { class: 'page-title', text: 'Alarms & Reminders' }), el('p', { text: 'Time-based alerts with sound, notifications, snooze and repeats.' })),
        el('button', { type: 'button', class: 'btn btn-primary', onclick: () => openForm() }, FF.ui.icon('plus'), 'New reminder')),
      el('div', { class: 'grid-12' },
        el('div', { class: 'card span-7 count-card', 'data-accent': 'red' }, el('div', { class: 'hud-label', text: 'Next alarm in' }), countdown, countSub),
        el('div', { class: 'card span-5', 'data-accent': 'cyan' }, el('div', { class: 'card-title' }, el('h3', { text: 'Alert preferences' })), permBox),
        el('div', { class: 'span-12 notice', 'data-accent': 'flame' }, FF.ui.icon('info'),
          el('span', null, el('strong', null, 'Heads up: '), 'alarms only work while FocusFlow is open in a browser tab. They cannot fire if the browser is closed, the computer is asleep or the OS suspends the page. Anything that came due in that time is listed under "Missed".'))),
      el('div', { style: { height: '18px' } }),
      sections);

    renderLists();
    paintPerm();
    ctx.watch(['reminders', 'tasks'], renderLists);
    ctx.watch(['settings'], paintPerm);
    ctx.every(paintCountdown, 1000);
  }

  FF.reminders = { list: load, upcoming, missed, past, soon, upsertLinked, removeLinked, openForm, snooze, tick, nextOccurrence, REPEATS };

  FF.onBoot(() => {
    tick();
    setInterval(tick, 1000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
  });

  FF.registerView({ id: 'reminders', label: 'Alarms & Reminders', title: 'Alarms & Reminders', crumb: 'Alert systems', icon: 'bell', accent: 'flame', render });
})();
