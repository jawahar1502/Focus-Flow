/* ==========================================================================
   FocusFlow — habits.js
   Habit tracker: daily completion (unique dates per habit), current & best
   streak computed from real dates, weekly consistency, activity heatmap.

   Streak rule: consecutive calendar days with a completion. If today is not
   done yet the streak is still alive (it counts back from yesterday); one
   fully missed day ends it. "Target per week" drives weekly consistency.
   ========================================================================== */
(function () {
  'use strict';
  const FF = window.FF;
  const { el, clear, util } = FF;
  const store = FF.store;

  const CATS = [
    { value: 'coding', label: 'Coding practice', accent: 'cyan' },
    { value: 'reading', label: 'Reading', accent: 'violet' },
    { value: 'exercise', label: 'Exercise', accent: 'green' },
    { value: 'water', label: 'Drinking water', accent: 'blue' },
    { value: 'wake', label: 'Early wake-up', accent: 'armor' },
    { value: 'revision', label: 'Revision', accent: 'arc' },
    { value: 'personal', label: 'Personal', accent: 'teal' }
  ];
  const PRESETS = [
    { name: 'Coding practice', category: 'coding', target: 5 }, { name: 'Reading', category: 'reading', target: 5 },
    { name: 'Exercise', category: 'exercise', target: 4 }, { name: 'Drink 8 glasses of water', category: 'water', target: 7 },
    { name: 'Early wake-up', category: 'wake', target: 5 }, { name: 'Revision', category: 'revision', target: 6 }
  ];
  const cat = (v) => CATS.find((c) => c.value === v) || CATS[CATS.length - 1];
  const load = () => store.get('habits');
  const WEEKS = 15;

  /* --------------------------------------------------------------- Maths */
  const dateSet = (h) => new Set((h.completions || []).filter(util.isValidDateStr));

  function currentStreak(h, today = util.today()) {
    const set = dateSet(h);
    let d = set.has(today) ? today : util.addDays(today, -1);
    let n = 0;
    while (set.has(d)) { n++; d = util.addDays(d, -1); }
    return n;
  }
  function bestStreak(h) {
    const dates = [...dateSet(h)].sort();
    let best = 0, run = 0, prev = null;
    dates.forEach((d) => {
      run = prev && util.daysBetween(prev, d) === 1 ? run + 1 : 1;
      if (run > best) best = run;
      prev = d;
    });
    return best;
  }
  /** Completions in the last 7 days vs weekly target, capped at 100%. */
  function weeklyConsistency(h, today = util.today()) {
    const set = dateSet(h);
    const done = util.lastNDays(7, today).filter((d) => set.has(d)).length;
    return { done, target: h.target, pct: Math.min(1, done / Math.max(1, h.target)) };
  }
  const active = () => load().filter((h) => !h.archived);
  const isDone = (h, date = util.today()) => dateSet(h).has(date);
  const completionsOn = (date) => active().filter((h) => isDone(h, date)).length;

  function todayStats() {
    const list = active();
    const done = list.filter((h) => isDone(h)).length;
    return { total: list.length, done };
  }
  function bestCurrentStreak() { return active().reduce((m, h) => Math.max(m, currentStreak(h)), 0); }

  /* -------------------------------------------------------------- Actions */
  function setDone(id, date, on) {
    if (date > util.today()) return false;               // no future completions
    let changed = false;
    store.update('habits', (list) => {
      const h = list.find((x) => x.id === id);
      if (!h) return;
      const set = dateSet(h);
      if (on && !set.has(date)) { set.add(date); changed = true; }
      if (!on && set.has(date)) { set.delete(date); changed = true; }   // duplicates impossible: stored as unique sorted set
      h.completions = [...set].sort();
    });
    return changed;
  }
  function toggleToday(h) {
    const on = !isDone(h);
    if (setDone(h.id, util.today(), on) && on) {
      const fresh = store.find('habits', h.id);
      FF.activity.log('Completed habit: ' + h.name + ' (' + currentStreak(fresh) + '-day streak)', 'green');
    }
  }

  async function openForm(habit, preset) {
    const editing = !!habit;
    const res = await FF.ui.formModal({
      title: editing ? 'Edit habit' : 'New habit', submitText: editing ? 'Save changes' : 'Add habit',
      fields: [
        { name: 'name', label: 'Habit name', type: 'text', required: true, maxLength: 60, span2: true },
        { name: 'description', label: 'Description', type: 'textarea', rows: 2, maxLength: 200, span2: true },
        { name: 'category', label: 'Category', type: 'select', options: CATS },
        { name: 'target', label: 'Target days per week', type: 'number', required: true, min: 1, max: 7, step: 1, inputmode: 'numeric' }
      ],
      values: habit ? { ...habit } : { category: 'coding', target: 5, ...(preset || {}) },
      validate: (v) => (Number.isInteger(v.target) ? {} : { target: 'Enter a whole number from 1 to 7.' })
    });
    if (!res) return;
    const now = new Date().toISOString();
    const h = Object.assign(habit ? { ...habit } : { id: util.uid('hab'), createdAt: now, completions: [], archived: false }, {
      name: res.name, description: res.description, category: res.category, target: res.target, updatedAt: now
    });
    store.upsert('habits', h);
    FF.ui.toast(editing ? 'Habit updated.' : 'Habit added.', 'success');
    if (!editing) FF.activity.log('Started habit: ' + h.name, 'green');
  }

  async function logOtherDay(h) {
    const res = await FF.ui.formModal({
      title: 'Log a past day — ' + h.name, submitText: 'Mark as done',
      fields: [{ name: 'date', label: 'Date', type: 'date', required: true, max: util.today() }],
      values: { date: util.addDays(util.today(), -1) },
      validate: (v) => (v.date > util.today() ? { date: 'You cannot log a future day.' } : isDone(h, v.date) ? { date: 'Already marked as done for that day.' } : {})
    });
    if (res) { setDone(h.id, res.date, true); FF.ui.toast('Logged ' + util.formatDate(res.date, 'short') + '.', 'success'); }
  }

  async function remove(h) {
    const ok = await FF.ui.confirm({ title: 'Delete habit?', message: '"' + h.name + '" and its whole history will be permanently deleted. Archive it instead to keep the history.', confirmText: 'Delete', danger: true });
    if (ok) store.remove('habits', h.id);
  }
  function archive(h, on) {
    store.update('habits', (list) => { const x = list.find((y) => y.id === h.id); if (x) x.archived = on; });
    FF.ui.toast(on ? 'Habit archived.' : 'Habit restored.', 'info');
  }

  /* ----------------------------------------------------------------- View */
  function heatmap(h) {
    const set = dateSet(h);
    const today = util.today();
    const start = util.addDays(util.weekStart(today), -(WEEKS - 1) * 7);
    const grid = el('div', { class: 'heatmap', role: 'img', 'aria-label': h.name + ' activity for the last ' + WEEKS + ' weeks: ' + [...set].filter((d) => d >= start).length + ' days completed.' });
    for (let i = 0; i < WEEKS * 7; i++) {
      const d = util.addDays(start, i);
      const cls = d > today ? 'future' : set.has(d) ? 'on' : 'off';
      grid.appendChild(el('i', { class: 'hm ' + cls + (d === today ? ' now' : ''), title: util.formatDate(d, 'long') + (cls === 'on' ? ' — done' : cls === 'off' ? ' — not done' : '') }));
    }
    return grid;
  }

  function habitCard(h) {
    const c = cat(h.category);
    const cur = currentStreak(h), best = bestStreak(h), wc = weeklyConsistency(h);
    const done = isDone(h);
    const bar = el('div', { class: 'bar', 'data-accent': 'green', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': Math.round(wc.pct * 100), 'aria-label': 'Weekly consistency' }, el('i', { style: { width: Math.round(wc.pct * 100) + '%' } }));
    return el('article', { class: 'card tilt-card habit-card' + (h.archived ? ' is-archived' : ''), 'data-accent': c.accent },
      el('div', { class: 'spread' },
        el('div', { class: 'grow' }, el('h3', { class: 'wrap-text', text: h.name }), h.description ? el('p', { class: 'small muted wrap-text', text: h.description }) : null),
        h.archived ? el('span', { class: 'badge', text: 'Archived' }) : el('button', {
          type: 'button', class: 'habit-check' + (done ? ' on' : ''), role: 'checkbox', 'aria-checked': String(done),
          'aria-label': (done ? 'Undo today: ' : 'Mark done today: ') + h.name, onclick: () => toggleToday(h)
        }, FF.ui.icon('checkSimple'))),
      el('div', { class: 'row', style: { margin: '10px 0' } },
        el('span', { class: 'badge', 'data-accent': c.accent, text: c.label }),
        el('span', { class: 'badge', 'data-accent': cur ? 'green' : 'arc' }, FF.ui.icon('flame'), cur + (cur === 1 ? ' day' : ' days') + ' streak'),
        el('span', { class: 'badge', 'data-accent': 'armor' }, 'Best ' + best)),
      el('div', { class: 'small muted spread' }, el('span', { text: 'This week: ' + wc.done + ' / ' + wc.target + ' days' }), el('span', { class: 'num', text: Math.round(wc.pct * 100) + '%' })),
      bar,
      el('div', { class: 'hm-wrap' }, heatmap(h)),
      el('div', { class: 'row card-actions' },
        h.archived ? null : el('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: () => logOtherDay(h) }, FF.ui.icon('calendar'), 'Log past day'),
        el('button', { type: 'button', class: 'btn btn-ghost btn-icon btn-sm', 'aria-label': 'Edit habit: ' + h.name, onclick: () => openForm(h) }, FF.ui.icon('edit')),
        el('button', { type: 'button', class: 'btn btn-ghost btn-icon btn-sm', 'aria-label': (h.archived ? 'Restore habit: ' : 'Archive habit: ') + h.name, onclick: () => archive(h, !h.archived) }, FF.ui.icon(h.archived ? 'undo' : 'archive')),
        el('button', { type: 'button', class: 'btn btn-ghost btn-icon btn-sm', 'aria-label': 'Delete habit: ' + h.name, onclick: () => remove(h) }, FF.ui.icon('trash'))));
  }

  function render(root, ctx) {
    const grid = el('div', { class: 'card-grid' });
    const archivedBox = el('div', { class: 'stack' });
    const summary = el('p', { class: 'muted small', 'aria-live': 'polite' });
    const chips = el('div', { class: 'row chips', role: 'group', 'aria-label': 'Quick add a habit' }, PRESETS.map((p) =>
      el('button', { type: 'button', class: 'btn btn-sm', onclick: () => openForm(null, p) }, FF.ui.icon('plus'), p.name)));

    function paint() {
      clear(grid); clear(archivedBox);
      const all = load();
      const act = all.filter((h) => !h.archived), arch = all.filter((h) => h.archived);
      const st = todayStats();
      summary.textContent = act.length ? st.done + ' of ' + util.plural(st.total, 'habit') + ' done today · best current streak ' + bestCurrentStreak() + ' days' : '';
      if (!act.length) grid.appendChild(el('div', { class: 'empty card', 'data-accent': 'green' },
        el('div', { class: 'empty-icon' }, FF.ui.icon('flame')), el('h3', { text: 'No habits yet' }), el('p', { text: 'Pick a starter below or create your own to begin a streak.' })));
      act.forEach((h) => grid.appendChild(habitCard(h)));
      if (arch.length) {
        archivedBox.append(el('h3', { class: 'section-h', text: 'Archived (' + arch.length + ')' }), el('div', { class: 'card-grid' }, arch.map(habitCard)));
      }
    }

    root.append(
      el('div', { class: 'page-head' },
        el('div', null, el('div', { class: 'hud-label', text: 'Consistency engine' }), el('h2', { class: 'page-title', text: 'Habit Tracker' }), el('p', { text: 'Show up daily. Streaks are calculated from the dates you complete.' })),
        el('button', { type: 'button', class: 'btn btn-primary', onclick: () => openForm() }, FF.ui.icon('plus'), 'New habit')),
      chips, summary, grid, archivedBox);
    paint();
    ctx.watch(['habits'], paint);
    ctx.every(() => { if (util.today() !== ctx.day) { ctx.day = util.today(); paint(); } }, 30000);
    ctx.day = util.today();
  }

  FF.habits = { CATS, list: load, active, isDone, currentStreak, bestStreak, weeklyConsistency, todayStats, bestCurrentStreak, completionsOn, toggleToday, openForm, cat };
  FF.registerView({ id: 'habits', label: 'Habit Tracker', title: 'Habit Tracker', crumb: 'Consistency engine', icon: 'flame', accent: 'green', render });
})();
