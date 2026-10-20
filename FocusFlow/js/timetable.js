/* ==========================================================================
   FocusFlow — timetable.js
   Weekly study planner: weekly-recurring or one-off sessions, conflict
   detection, upcoming panel, optional linked reminders.
   Desktop = positioned time grid; mobile = day picker + list.
   ========================================================================== */
(function () {
  'use strict';
  const FF = window.FF;
  const { el, clear, util } = FF;
  const store = FF.store;

  const HOUR_PX = 54;
  const REMIND = [{ value: '', label: 'No reminder' }, { value: '0', label: 'At start time' }, { value: '10', label: '10 minutes before' }, { value: '30', label: '30 minutes before' }, { value: '60', label: '1 hour before' }];
  const DAY_OPTS = util.WEEKDAYS.map((d, i) => ({ value: String(i), label: d }));
  const REPEAT_OPTS = [{ value: 'weekly', label: 'Repeats every week' }, { value: 'once', label: 'One-off (specific date)' }];

  const load = () => store.get('timetable');
  const cats = () => FF.tasks.CATEGORIES;
  const accentOf = (c) => (cats().find((x) => x.value === c) || cats()[0]).accent;
  const catLabel = (c) => (cats().find((x) => x.value === c) || cats()[0]).label;

  const state = { weekOffset: 0, day: util.weekdayIndex(util.today()) };

  function occursOn(s, date) {
    return s.repeat === 'once' ? s.date === date : util.weekdayIndex(date) === Number(s.day);
  }
  const occurrences = (date) => util.sortBy(load().filter((s) => occursOn(s, date)), (s) => util.toMinutes(s.start));

  function sameDay(a, b) {
    if (a.repeat === 'weekly' && b.repeat === 'weekly') return Number(a.day) === Number(b.day);
    if (a.repeat === 'weekly') return util.weekdayIndex(b.date) === Number(a.day);
    if (b.repeat === 'weekly') return util.weekdayIndex(a.date) === Number(b.day);
    return a.date === b.date;
  }
  function conflictsWith(cand, ignoreId) {
    const a0 = util.toMinutes(cand.start), a1 = util.toMinutes(cand.end);
    return load().filter((s) => s.id !== ignoreId && sameDay(cand, s) && a0 < util.toMinutes(s.end) && util.toMinutes(s.start) < a1);
  }

  /* ------------------------------------------------------------- Reminders */
  function syncReminder(s) {
    if (!FF.reminders) return;
    const key = 'session:' + s.id;
    if (s.reminder === '' || s.reminder == null) { FF.reminders.removeLinked(key); return; }
    let date;
    if (s.repeat === 'once') date = s.date;
    else { const today = util.today(); date = util.addDays(today, (Number(s.day) - util.weekdayIndex(today) + 7) % 7); }
    const at = util.atDateTime(date, s.start).getTime() - Number(s.reminder) * 60000;
    FF.reminders.upsertLinked({
      key, title: 'Study session: ' + s.subject + ' (' + util.formatTime(s.start) + ')', description: s.description || '',
      at, repeat: s.repeat === 'weekly' ? 'weekly' : 'none'
    });
  }

  /* ------------------------------------------------------------------ Form */
  async function openForm(session, defaults) {
    const editing = !!session;
    const res = await FF.ui.formModal({
      title: editing ? 'Edit study session' : 'New study session', submitText: editing ? 'Save changes' : 'Add session',
      fields: [
        { name: 'subject', label: 'Subject', type: 'text', required: true, maxLength: 60, span2: true, placeholder: 'e.g. Operating Systems' },
        { name: 'description', label: 'Description', type: 'textarea', maxLength: 300, rows: 2, span2: true },
        { name: 'repeat', label: 'Schedule', type: 'select', options: REPEAT_OPTS, span2: true },
        { name: 'day', label: 'Day (weekly sessions)', type: 'select', options: DAY_OPTS },
        { name: 'date', label: 'Date (one-off sessions)', type: 'date' },
        { name: 'start', label: 'Start time', type: 'time', required: true },
        { name: 'end', label: 'End time', type: 'time', required: true },
        { name: 'category', label: 'Category', type: 'select', options: cats() },
        { name: 'reminder', label: 'Reminder', type: 'select', options: REMIND }
      ],
      values: session ? { ...session, day: String(session.day) } : { repeat: 'weekly', day: String(state.day), start: '18:00', end: '19:00', category: 'study', reminder: '', ...(defaults || {}) },
      validate(v) {
        const errs = {};
        if (util.toMinutes(v.end) <= util.toMinutes(v.start)) errs.end = 'End time must be after the start time.';
        if (v.repeat === 'once' && !v.date) errs.date = 'Choose a date for a one-off session.';
        if (Object.keys(errs).length) return errs;
        const clash = conflictsWith({ repeat: v.repeat, day: Number(v.day), date: v.date, start: v.start, end: v.end }, session && session.id);
        if (clash.length) return { start: 'Overlaps with "' + clash[0].subject + '" (' + util.formatTime(clash[0].start) + '–' + util.formatTime(clash[0].end) + '). Pick a free slot.' };
        return {};
      }
    });
    if (!res) return null;
    const now = new Date().toISOString();
    const s = Object.assign(session ? { ...session } : { id: util.uid('ses'), createdAt: now }, {
      subject: res.subject, description: res.description, repeat: res.repeat, day: Number(res.day), date: res.repeat === 'once' ? res.date : '',
      start: res.start, end: res.end, category: res.category, reminder: res.reminder, updatedAt: now
    });
    if (s.repeat === 'once') s.day = util.weekdayIndex(s.date);
    store.upsert('timetable', s);
    syncReminder(s);
    FF.activity.log((editing ? 'Updated study session: ' : 'Scheduled study session: ') + s.subject, 'blue');
    FF.ui.toast(editing ? 'Session updated.' : 'Session added.', 'success');
    return s;
  }

  async function removeSession(s) {
    const ok = await FF.ui.confirm({ title: 'Delete session?', message: '"' + s.subject + '" will be removed from your timetable' + (s.repeat === 'weekly' ? ' for every week.' : '.'), confirmText: 'Delete', danger: true });
    if (!ok) return false;
    store.remove('timetable', s.id);
    if (FF.reminders) FF.reminders.removeLinked('session:' + s.id);
    // unlink from tasks
    store.update('tasks', (list) => { list.forEach((t) => { if (t.sessionId === s.id) t.sessionId = ''; }); });
    FF.ui.toast('Session deleted.', 'info');
    return true;
  }

  async function details(s, date) {
    const body = el('div', { class: 'stack' },
      el('div', { class: 'row' }, el('span', { class: 'badge', 'data-accent': accentOf(s.category), text: catLabel(s.category) }),
        el('span', { class: 'badge', 'data-accent': 'cyan' }, FF.ui.icon('clock'), util.formatTime(s.start) + ' – ' + util.formatTime(s.end)),
        el('span', { class: 'badge', 'data-accent': 'violet' }, FF.ui.icon('repeat'), s.repeat === 'weekly' ? 'Every ' + util.WEEKDAYS[s.day] : util.formatDate(s.date, 'long'))),
      s.description ? el('p', { class: 'wrap-text', text: s.description }) : el('p', { class: 'muted', text: 'No description.' }),
      s.reminder !== '' && s.reminder != null ? el('p', { class: 'small muted' }, FF.ui.icon('bell'), ' Reminder: ' + (REMIND.find((r) => r.value === String(s.reminder)) || {}).label) : null);
    const choice = await FF.ui.dialog({
      title: s.subject, body, actions: [
        { label: 'Delete', value: 'delete', kind: 'danger', icon: 'trash' },
        { label: 'Start focus session', value: 'focus', icon: 'timer' },
        { label: 'Edit', value: 'edit', kind: 'primary', icon: 'edit', autofocus: true }
      ]
    });
    if (choice === 'edit') openForm(s);
    else if (choice === 'delete') removeSession(s);
    else if (choice === 'focus') { FF.timer.setLink('', s.subject); FF.navigate('timer'); }
  }

  /* ----------------------------------------------------------------- Queries */
  function upcoming(n = 5) {
    const out = [];
    const now = new Date();
    const today = util.today();
    for (let i = 0; i < 14 && out.length < n; i++) {
      const date = util.addDays(today, i);
      occurrences(date).forEach((s) => {
        if (util.atDateTime(date, s.end) > now) out.push({ session: s, date, startsAt: util.atDateTime(date, s.start) });
      });
    }
    return out.slice(0, n);
  }
  const todaySessions = () => occurrences(util.today());
  const getSession = (id) => load().find((s) => s.id === id) || null;
  const sessionOptions = () => util.sortBy(load(), 'subject').map((s) => ({ value: s.id, label: s.subject + ' (' + (s.repeat === 'weekly' ? util.WEEKDAYS_SHORT[s.day] : util.formatDate(s.date, 'short')) + ' ' + util.formatTime(s.start) + ')' }));

  /* ------------------------------------------------------------------- View */
  function render(root, ctx) {
    const gridBox = el('div', { class: 'tt-desktop' });
    const mobileBox = el('div', { class: 'tt-mobile' });
    const upBox = el('ul', { class: 'compact-list' });
    const weekLabel = el('span', { class: 'week-label', 'aria-live': 'polite' });

    const weekStart = () => util.addDays(util.weekStart(util.today()), state.weekOffset * 7);

    function paintDesktop(days) {
      clear(gridBox);
      const all = load();
      const mins = all.flatMap((s) => [util.toMinutes(s.start), util.toMinutes(s.end)]);
      const startH = Math.min(7, mins.length ? Math.floor(Math.min(...mins) / 60) : 7);
      const endH = Math.max(21, mins.length ? Math.ceil(Math.max(...mins) / 60) : 21);
      const hours = endH - startH;
      const today = util.today();
      const head = el('div', { class: 'tt-head' }, el('div', { class: 'tt-corner' }),
        days.map((d, i) => el('div', { class: 'tt-dayhead' + (d === today ? ' is-today' : ''), 'aria-current': d === today ? 'date' : null }, el('b', { text: util.WEEKDAYS_SHORT[i] }), el('span', { text: util.formatDate(d, 'short') }))));
      const body = el('div', { class: 'tt-body', style: { height: hours * HOUR_PX + 'px' } });
      const gutter = el('div', { class: 'tt-gutter' });
      for (let h = startH; h < endH; h++) gutter.appendChild(el('div', { class: 'tt-hour', style: { height: HOUR_PX + 'px' }, text: util.formatTime(util.pad(h) + ':00') }));
      body.appendChild(gutter);
      days.forEach((d) => {
        const col = el('div', { class: 'tt-col' + (d === today ? ' is-today' : ''), style: { backgroundSize: '100% ' + HOUR_PX + 'px' } });
        occurrences(d).forEach((s) => {
          const top = ((util.toMinutes(s.start) - startH * 60) / 60) * HOUR_PX;
          const h = Math.max(26, ((util.toMinutes(s.end) - util.toMinutes(s.start)) / 60) * HOUR_PX - 2);
          col.appendChild(el('button', {
            type: 'button', class: 'tt-block', 'data-accent': accentOf(s.category), style: { top: top + 'px', height: h + 'px' },
            'aria-label': s.subject + ', ' + util.WEEKDAYS[util.weekdayIndex(d)] + ' ' + util.formatTime(s.start) + ' to ' + util.formatTime(s.end), onclick: () => details(s, d)
          }, el('b', { class: 'wrap-text', text: s.subject }), el('span', { text: util.formatTime(s.start) + '–' + util.formatTime(s.end) })));
        });
        body.appendChild(col);
      });
      gridBox.append(head, body);
    }

    function paintMobile(days) {
      clear(mobileBox);
      const today = util.today();
      const seg = el('div', { class: 'seg tt-days', role: 'group', 'aria-label': 'Choose day' }, days.map((d, i) =>
        el('button', { type: 'button', 'aria-pressed': String(state.day === i), onclick: () => { state.day = i; paintAll(); } }, util.WEEKDAYS_SHORT[i] + (d === today ? ' •' : ''))));
      const date = days[state.day];
      const list = occurrences(date);
      mobileBox.append(seg, el('h3', { class: 'section-h', text: util.formatDate(date, 'full') }));
      if (!list.length) mobileBox.appendChild(el('div', { class: 'empty small' }, 'No sessions this day.', el('button', { type: 'button', class: 'btn btn-sm', onclick: () => openForm(null, { day: String(state.day) }) }, FF.ui.icon('plus'), 'Add session')));
      else {
        const ul = el('ul', { class: 'compact-list' });
        list.forEach((s) => ul.appendChild(el('li', { 'data-accent': accentOf(s.category) },
          el('span', { class: 'compact-time', text: util.formatTime(s.start) }),
          el('div', { class: 'compact-main' }, el('b', { text: s.subject }), el('span', { text: util.formatTime(s.start) + '–' + util.formatTime(s.end) + ' · ' + catLabel(s.category) })),
          el('button', { type: 'button', class: 'btn btn-ghost btn-sm', 'aria-label': 'Open ' + s.subject, onclick: () => details(s, date) }, 'Open'))));
        mobileBox.appendChild(ul);
      }
    }

    function paintUpcoming() {
      clear(upBox);
      const list = upcoming(6);
      if (!list.length) { upBox.appendChild(el('li', null, el('div', { class: 'empty small', text: 'No upcoming sessions scheduled.' }))); return; }
      list.forEach(({ session: s, date, startsAt }) => upBox.appendChild(el('li', { 'data-accent': accentOf(s.category) },
        el('span', { class: 'compact-time', text: date === util.today() ? 'Today' : util.formatDate(date, 'weekday') }),
        el('div', { class: 'compact-main' }, el('b', { text: s.subject }), el('span', { text: util.formatTime(s.start) + '–' + util.formatTime(s.end) + ' · ' + util.relative(startsAt - Date.now()) })))));
    }

    function paintAll() {
      const ws = weekStart();
      const days = Array.from({ length: 7 }, (_, i) => util.addDays(ws, i));
      weekLabel.textContent = util.formatDate(days[0], 'short') + ' – ' + util.formatDate(days[6], 'short') + (state.weekOffset === 0 ? ' (this week)' : '');
      paintDesktop(days); paintMobile(days); paintUpcoming();
    }

    root.append(
      el('div', { class: 'page-head' },
        el('div', null, el('div', { class: 'hud-label', text: 'Study schedule' }), el('h2', { class: 'page-title', text: 'Study Timetable' }), el('p', { text: 'Plan recurring study blocks. Overlapping sessions are blocked automatically.' })),
        el('button', { type: 'button', class: 'btn btn-primary', onclick: () => openForm() }, FF.ui.icon('plus'), 'Add session')),
      el('div', { class: 'grid-12' },
        el('div', { class: 'card span-8 tt-card', 'data-accent': 'blue' },
          el('div', { class: 'spread', style: { marginBottom: '12px' } },
            el('div', { class: 'row' },
              el('button', { type: 'button', class: 'btn btn-icon btn-sm', 'aria-label': 'Previous week', onclick: () => { state.weekOffset--; paintAll(); } }, FF.ui.icon('chevL')),
              weekLabel,
              el('button', { type: 'button', class: 'btn btn-icon btn-sm', 'aria-label': 'Next week', onclick: () => { state.weekOffset++; paintAll(); } }, FF.ui.icon('chevR'))),
            el('button', { type: 'button', class: 'btn btn-sm', onclick: () => { state.weekOffset = 0; state.day = util.weekdayIndex(util.today()); paintAll(); } }, 'Today')),
          gridBox, mobileBox),
        el('div', { class: 'card span-4', 'data-accent': 'arc' }, el('div', { class: 'card-title' }, el('h3', { text: 'Upcoming sessions' })), upBox)));

    paintAll();
    ctx.watch(['timetable'], paintAll);
    ctx.every(paintUpcoming, 60000);
  }

  FF.timetable = { list: load, occurrences, todaySessions, upcoming, getSession, sessionOptions, openForm, accentOf, catLabel };
  FF.registerView({ id: 'timetable', label: 'Study Timetable', title: 'Study Timetable', crumb: 'Study schedule', icon: 'calendar', accent: 'blue', render });
})();
