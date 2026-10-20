/* ==========================================================================
   FocusFlow — dashboard.js
   Overview screen. Every number is computed from saved data — nothing here
   is hardcoded. Sections re-render when the collections they read change.
   ========================================================================== */
(function () {
  'use strict';
  const FF = window.FF;
  const { el, clear, util } = FF;
  const store = FF.store;

  const link = (href, text) => el('a', { class: 'btn btn-ghost btn-sm', href }, text, FF.ui.icon('chevR'));
  function emptyLine(text) { return el('div', { class: 'empty small', text }); }

  function card(title, accent, body, { span = 4, action = null, tilt = false } = {}) {
    return el('section', { class: 'card span-' + span + (tilt ? ' tilt-card' : ''), 'data-accent': accent },
      el('div', { class: 'card-title' }, el('h2', { text: title }), action), body);
  }

  function render(root, ctx) {
    const user = FF.user();
    const panels = {};     // name → { el, paint, watch: [collections] }
    const grid = el('div', { class: 'dash-grid' });

    /* ------------------------------------------------------------ Hero */
    const clock = el('div', { class: 'hero-clock', 'aria-hidden': 'true' });
    const dateLine = el('div', { class: 'date-line' });
    const mission = el('p', { class: 'mission-msg' });
    const greet = el('h2');
    const reactor = FF.reactor.create({ active: FF.timer.isRunning() });
    const hero = el('section', { class: 'card hero-panel span-12', 'aria-label': 'Mission briefing' },
      el('div', null, el('div', { class: 'eyebrow', text: 'Personal command center' }), greet, dateLine, clock, mission,
        el('div', { class: 'row hero-actions' },
          el('button', { type: 'button', class: 'btn btn-primary', onclick: () => FF.tasks.openForm() }, FF.ui.icon('plus'), 'Quick-add task'),
          el('a', { class: 'btn', href: '#/timer' }, FF.ui.icon('timer'), 'Start focus'))),
      el('div', { class: 'hero-reactor-wrap' }, reactor, el('span', { class: 'hud-label', id: 'reactorLbl', text: 'Reactor · idle' })));
    function paintClock() {
      const now = new Date();
      clock.textContent = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
      dateLine.textContent = util.formatDate(util.dateStr(now), 'full');
      greet.textContent = util.greeting(now) + ', ' + user.name.split(' ')[0] + '.';
    }
    function paintMission() {
      const st = FF.tasks.stats();
      const today = util.today();
      const dueToday = FF.tasks.list().filter((t) => t.status === 'pending' && t.dueDate === today).length;
      const parts = [];
      if (st.overdue) parts.push(el('strong', { text: util.plural(st.overdue, 'overdue task') }), ' need attention. ');
      if (dueToday) parts.push(el('strong', { text: util.plural(dueToday, 'task') }), ' due today. ');
      if (!st.overdue && !dueToday) parts.push(st.total ? 'No tasks due today — a good moment to plan the next objective. ' : 'No missions logged yet — add your first task to begin. ');
      const nextSes = FF.timetable.upcoming(1)[0];
      if (nextSes) parts.push('Next study block: ', el('strong', { text: nextSes.session.subject }), ' ' + util.relative(nextSes.startsAt - Date.now()) + '. ');
      clear(mission); mission.append(...parts);
    }
    const lbl = () => document.getElementById('reactorLbl');
    ctx.on('timer:state', (s) => { const l = lbl(); if (l) l.textContent = s.status === 'running' ? 'Reactor · ' + (s.mode === 'focus' ? 'focus active' : 'on break') : 'Reactor · idle'; });

    /* ------------------------------------------------------ Onboarding */
    const onboard = el('div', { class: 'span-12' });
    function paintOnboard() {
      clear(onboard);
      const s = store.settings();
      const empty = !FF.tasks.list().length && !FF.habits.list().length && !FF.goals.list().length;
      if (store.hasSample()) {
        onboard.appendChild(el('div', { class: 'notice sample-banner', 'data-accent': 'gold' }, FF.ui.icon('sparkle'),
          el('span', { class: 'grow' }, el('strong', null, 'Demonstration data is loaded. '), 'Items labelled "[Sample]" are not your activity.'),
          el('button', { type: 'button', class: 'btn btn-sm', onclick: () => { store.clearSample(); FF.ui.toast('Sample data cleared.', 'info'); } }, 'Clear sample data')));
      } else if (empty && !s.onboardingDismissed) {
        onboard.appendChild(el('section', { class: 'card onboard', 'aria-label': 'Welcome' },
          FF.reactor.create({ size: 'sm' }),
          el('div', null, el('h2', { text: 'Welcome aboard, ' + user.name.split(' ')[0] }),
            el('p', { text: 'Your command center is empty. Start with your own tasks, or load clearly labelled sample data to explore every module. Reminders only ring while this tab is open, and all data stays in this browser.' })),
          el('div', { class: 'onboard-actions' },
            el('button', { type: 'button', class: 'btn btn-primary', onclick: () => { FF.sample.load(); FF.ui.toast('Sample data loaded.', 'success'); } }, FF.ui.icon('sparkle'), 'Load sample data'),
            el('button', { type: 'button', class: 'btn', onclick: () => { store.saveSettings({ onboardingDismissed: true }); paintOnboard(); } }, 'Start empty'))));
      }
    }

    /* ------------------------------------------------------- Stat cards */
    const statsBox = el('div', { class: 'stat-grid span-12' });
    function stat(label, value, sub, accent, icon, href) {
      const body = [el('div', { class: 'stat-top' }, el('div', { class: 'stat-label', text: label }), el('span', { class: 'stat-ico' }, FF.ui.icon(icon))),
        el('div', { class: 'stat-value num', text: String(value) }), el('div', { class: 'stat-sub', text: sub })];
      return el('a', { class: 'card stat-card tilt-card stat-link', 'data-accent': accent, href }, ...body);
    }
    function paintStats() {
      const st = FF.tasks.stats();
      clear(statsBox);
      statsBox.append(
        stat('Total tasks', st.total, 'all time', 'arc', 'list', '#/tasks'),
        stat('Completed', st.completed, st.total ? Math.round((st.completed / st.total) * 100) + '% of all tasks' : 'none yet', 'green', 'check', '#/tasks'),
        stat('Pending', st.pending, 'still to do', 'armor', 'clock', '#/tasks'),
        stat('Overdue', st.overdue, st.overdue ? 'needs attention' : 'nothing late', st.overdue ? 'flame' : 'teal', 'alert', '#/tasks'),
        stat('Focused time', util.formatDuration(FF.timer.totalMinutes()), util.formatDuration(FF.timer.todayMinutes()) + ' today', 'cyan', 'timer', '#/timer'),
        stat('Habit streak', FF.habits.bestCurrentStreak() + 'd', FF.habits.todayStats().done + ' of ' + FF.habits.todayStats().total + ' done today', 'green', 'flame', '#/habits'));
    }

    /* ------------------------------------------------------- Task ring */
    const taskRingBox = el('div', { class: 'ring-card' });
    function paintTaskRing() {
      clear(taskRingBox);
      const st = FF.tasks.stats();
      const useToday = st.todayTotal > 0;
      const done = useToday ? st.todayDone : st.completed, total = useToday ? st.todayTotal : st.total;
      const r = FF.ui.ring({ size: 150, stroke: 13, accent: 'green', value: total ? done / total : 0, label: total ? Math.round((done / total) * 100) + '%' : '—', sub: useToday ? 'today' : 'overall', aria: total ? done + ' of ' + total + ' tasks complete ' + (useToday ? 'today' : 'overall') : 'No tasks yet' });
      taskRingBox.append(r.el, el('p', { class: 'small muted', text: total ? done + ' of ' + util.plural(total, 'task') + (useToday ? ' due or finished today' : ' completed overall') : 'Add tasks to see progress.' }));
    }

    /* --------------------------------------------------- Upcoming alarms */
    const alarmBox = el('ul', { class: 'compact-list' });
    function paintAlarms() {
      clear(alarmBox);
      const list = FF.reminders.upcoming().slice(0, 4);
      if (!list.length) { alarmBox.appendChild(el('li', null, emptyLine('No upcoming reminders.'))); return; }
      list.forEach((r) => alarmBox.appendChild(el('li', { 'data-accent': 'red' },
        el('span', { class: 'compact-time', text: util.formatTime(new Date(r.nextAt).toTimeString().slice(0, 5)) }),
        el('div', { class: 'compact-main' }, el('b', { text: r.title }), el('span', { text: util.formatDate(util.dateOf(r.nextAt), 'short') + ' · ' + util.relative(r.nextAt - Date.now()) })))));
    }

    /* ------------------------------------------------ Today's timetable */
    const ttBox = el('ul', { class: 'compact-list' });
    function paintTimetable() {
      clear(ttBox);
      const list = FF.timetable.todaySessions();
      if (!list.length) { ttBox.appendChild(el('li', null, emptyLine('No study sessions scheduled today.'))); return; }
      list.forEach((s) => ttBox.appendChild(el('li', { 'data-accent': FF.timetable.accentOf(s.category) },
        el('span', { class: 'compact-time', text: util.formatTime(s.start) }), el('div', { class: 'compact-main' }, el('b', { text: s.subject }), el('span', { text: util.formatTime(s.start) + '–' + util.formatTime(s.end) })))));
    }

    /* ---------------------------------------------------------- Goals */
    const goalBox = el('div', { class: 'stack' });
    function paintGoals() {
      clear(goalBox);
      const list = FF.goals.list().filter((g) => g.status === 'active').slice(0, 3);
      if (!list.length) { goalBox.appendChild(emptyLine('No active goals.')); return; }
      list.forEach((g) => {
        const p = FF.goals.progressOf(g);
        goalBox.appendChild(el('div', { class: 'stack', style: { gap: '6px' }, 'data-accent': 'armor' },
          el('div', { class: 'spread small' }, el('b', { class: 'wrap-text', text: g.title }), el('span', { class: 'num', text: Math.round(p * 100) + '%' })),
          el('div', { class: 'bar', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': Math.round(p * 100), 'aria-label': g.title + ' progress' }, el('i', { style: { width: Math.round(p * 100) + '%' } }))));
      });
    }

    /* --------------------------------------------------- Weekly chart */
    const weekBox = el('div', { class: 'chart-box' });
    const weekSummary = el('p', { class: 'small muted' });
    function paintWeek() {
      clear(weekBox);
      const days = util.lastNDays(7);
      const tasks = FF.tasks.list();
      const habits = FF.habits.active();
      const data = days.map((d) => ({
        label: util.WEEKDAYS_SHORT[util.weekdayIndex(d)],
        values: [tasks.filter((t) => t.status === 'completed' && t.completedAt && util.dateOf(t.completedAt) === d).length, habits.filter((h) => FF.habits.isDone(h, d)).length]
      }));
      const total = util.sum(data, (d) => d.values[0] + d.values[1]);
      if (!total) { weekBox.appendChild(emptyLine('Finish a task or habit to see your week.')); weekSummary.textContent = ''; return; }
      weekBox.appendChild(FF.charts.bars({ data, series: [{ name: 'Tasks completed', accent: 'green' }, { name: 'Habits done', accent: 'cyan' }], height: 190, ariaLabel: 'Bar chart of tasks completed and habits done per day this week' }));
      weekSummary.textContent = 'Green = tasks completed (' + util.sum(data, (d) => d.values[0]) + '), blue = habits done (' + util.sum(data, (d) => d.values[1]) + ') over the last 7 days.';
    }

    /* ---------------------------------------------------- Habit summary */
    const habitBox = el('ul', { class: 'compact-list' });
    function paintHabits() {
      clear(habitBox);
      const list = FF.habits.active().slice(0, 5);
      if (!list.length) { habitBox.appendChild(el('li', null, emptyLine('No habits yet. Start one to build a streak.'))); return; }
      list.forEach((h) => {
        const done = FF.habits.isDone(h);
        habitBox.appendChild(el('li', { 'data-accent': FF.habits.cat(h.category).accent },
          el('div', { class: 'compact-main' }, el('b', { text: h.name }), el('span', null, FF.ui.icon('flame'), ' ' + FF.habits.currentStreak(h) + '-day streak')),
          el('button', { type: 'button', class: 'habit-check sm' + (done ? ' on' : ''), role: 'checkbox', 'aria-checked': String(done), 'aria-label': (done ? 'Undo today: ' : 'Mark done today: ') + h.name, onclick: () => FF.habits.toggleToday(h) }, FF.ui.icon('checkSimple'))));
      });
    }

    /* ----------------------------------------------------- Recent activity */
    const actBox = el('ul', { class: 'compact-list activity-list' });
    function paintActivity() {
      clear(actBox);
      const list = FF.activity.recent(6);
      if (!list.length) { actBox.appendChild(el('li', null, emptyLine('Your activity will show up here.'))); return; }
      list.forEach((a) => actBox.appendChild(el('li', { 'data-accent': a.accent || 'cyan' }, el('i', { class: 'dot' }),
        el('div', { class: 'compact-main' }, el('b', { class: 'wrap-text', text: a.text }), el('span', { text: util.formatDateTime(new Date(a.at)) })))));
    }

    /* ----------------------------------------------------- Quick notes */
    const noteArea = el('textarea', { id: 'quickNote', placeholder: 'Capture a thought… first line becomes the title.', 'aria-label': 'Quick note', rows: 3, maxlength: 2000 });
    const recentNotes = el('ul', { class: 'compact-list' });
    const noteBox = el('div', { class: 'quick-note' }, noteArea,
      el('div', { class: 'row' }, el('button', { type: 'button', class: 'btn btn-sm btn-primary', onclick: () => {
        if (!noteArea.value.trim()) { FF.ui.toast('Write something first.', 'warn'); noteArea.focus(); return; }
        if (FF.notes.quickAdd(noteArea.value)) { noteArea.value = ''; FF.ui.toast('Note saved.', 'success'); } else FF.ui.toast('Could not save the note.', 'error');
      } }, FF.ui.icon('plus'), 'Save note'), link('#/notes', 'All notes')), recentNotes);
    function paintNotes() {
      clear(recentNotes);
      util.sortBy(FF.notes.list(), (n) => -new Date(n.updatedAt).getTime()).slice(0, 3).forEach((n) => recentNotes.appendChild(el('li', { 'data-accent': 'violet' },
        el('div', { class: 'compact-main' }, el('b', { class: 'wrap-text', text: n.title || 'Untitled note' }), el('span', { class: 'wrap-text', text: n.body.slice(0, 60) })))));
    }

    /* ------------------------------------------------------ Expenses */
    const expBox = el('div', { class: 'stack' });
    function paintExpenses() {
      clear(expBox);
      const key = util.monthKey(util.today());
      const s = FF.expenses.summary(key);
      if (!s.list.length) { expBox.appendChild(emptyLine('No transactions recorded this month.')); return; }
      expBox.append(
        el('div', { class: 'spread' }, el('span', { class: 'muted small', text: 'Income' }), el('b', { class: 'num inc', text: util.money(s.income) })),
        el('div', { class: 'spread' }, el('span', { class: 'muted small', text: 'Expenses' }), el('b', { class: 'num exp', text: util.money(s.expense) })),
        el('div', { class: 'spread' }, el('span', { class: 'muted small', text: 'Balance' }), el('b', { class: 'num', text: util.money(s.balance) })));
      if (s.budget) {
        const p = s.expense / s.budget;
        expBox.append(el('div', { class: 'bar', 'data-accent': p > 1 ? 'flame' : p > .8 ? 'armor' : 'green', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': Math.min(100, Math.round(p * 100)), 'aria-label': 'Budget used' }, el('i', { style: { width: Math.min(100, p * 100) + '%' } })),
          el('p', { class: 'small muted', text: Math.round(p * 100) + '% of ' + util.money(s.budget) + ' budget used' }));
      }
    }

    /* ------------------------------------------------------------ Layout */
    const ringCard = card('Daily task progress', 'green', taskRingBox, { span: 3, tilt: true });
    const timerCard = card('Focus timer', 'cyan', FF.timer.mini(ctx), { span: 4, tilt: true, action: link('#/timer', 'Open') });
    const alarmCard = card('Upcoming alarms', 'red', alarmBox, { span: 5, action: link('#/reminders', 'All') });
    const ttCard = card("Today's timetable", 'blue', ttBox, { span: 4, action: link('#/timetable', 'Week') });
    const goalCard = card('Goal progress', 'armor', goalBox, { span: 4, action: link('#/goals', 'All') });
    const habitCard = card('Habit streaks', 'green', habitBox, { span: 4, action: link('#/habits', 'All') });
    const weekCard = card('Weekly productivity', 'arc', el('div', null, weekBox, weekSummary), { span: 8, action: link('#/analytics', 'Analytics') });
    const actCard = card('Recent activity', 'cyan', actBox, { span: 4 });
    const noteCard = card('Quick notes', 'violet', noteBox, { span: 6 });
    const expCard = card('This month', 'gold', expBox, { span: 6, action: link('#/expenses', 'Ledger') });

    grid.append(hero, onboard, statsBox, ringCard, timerCard, alarmCard, ttCard, goalCard, habitCard, weekCard, actCard, noteCard, expCard);
    root.appendChild(grid);

    const paintAll = () => { paintMission(); paintOnboard(); paintStats(); paintTaskRing(); paintAlarms(); paintTimetable(); paintGoals(); paintWeek(); paintHabits(); paintActivity(); paintNotes(); paintExpenses(); };
    paintClock(); paintAll();
    ctx.every(paintClock, 1000);
    ctx.every(() => { paintMission(); paintAlarms(); }, 30000);
    ctx.watch(['tasks', 'reminders', 'timetable', 'goals', 'habits', 'focusSessions', 'activity', 'notes', 'transactions', 'budget', 'settings'], paintAll);
  }

  FF.registerView({ id: 'dashboard', label: 'Dashboard', title: 'Dashboard', crumb: 'Mission control', icon: 'grid', accent: 'red', render });
})();
