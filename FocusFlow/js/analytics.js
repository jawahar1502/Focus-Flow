/* ==========================================================================
   FocusFlow — analytics.js
   Real analytics computed from saved data. Native SVG charts; every chart is
   paired with a plain-text summary and a data table so meaning never relies
   on color alone.
   ========================================================================== */
(function () {
  'use strict';
  const FF = window.FF;
  const { el, clear, util } = FF;
  const store = FF.store;

  const ui = { days: 7 };
  const PERIODS = [{ v: 7, l: '7 days' }, { v: 30, l: '30 days' }, { v: 90, l: '90 days' }];

  /* ------------------------------------------------------------- Compute */
  function compute(days) {
    const today = util.today();
    const range = util.lastNDays(days, today);
    const tasks = FF.tasks.list();
    const sessions = FF.timer.completedFocus();
    const habits = FF.habits.active();
    const goals = FF.goals.list();

    const created = (d) => tasks.filter((t) => t.createdAt && util.dateOf(t.createdAt) === d).length;
    const completed = (d) => tasks.filter((t) => t.status === 'completed' && t.completedAt && util.dateOf(t.completedAt) === d).length;

    const daily = range.map((d) => ({
      date: d, created: created(d), completed: completed(d),
      focus: util.sum(sessions.filter((s) => s.date === d), (s) => s.actualMin),
      sessions: sessions.filter((s) => s.date === d).length,
      habitsDone: habits.filter((h) => FF.habits.isDone(h, d)).length
    }));

    const totalTasks = tasks.length;
    const doneTasks = tasks.filter((t) => t.status === 'completed').length;
    const periodSessions = sessions.filter((s) => s.date >= range[0]);

    const months = [];
    const thisMonth = util.monthKey(today);
    for (let i = 5; i >= 0; i--) {
      const key = util.monthShift(thisMonth, -i);
      months.push({
        key,
        completed: tasks.filter((t) => t.status === 'completed' && t.completedAt && util.monthKey(util.dateOf(t.completedAt)) === key).length,
        focus: util.sum(sessions.filter((s) => util.monthKey(s.date) === key), (s) => s.actualMin)
      });
    }

    const habitStats = habits.map((h) => {
      const set = new Set(h.completions || []);
      const done = range.filter((d) => set.has(d)).length;
      const expected = Math.max(1, Math.round((days / 7) * h.target));
      return { name: h.name, done, pct: Math.min(1, done / expected), expected };
    });

    const habitSlots = habits.length * days;
    const habitDone = daily.reduce((n, d) => n + d.habitsDone, 0);

    return {
      range, daily, months, habitStats,
      tasksCreated: util.sum(daily, (d) => d.created), tasksCompleted: util.sum(daily, (d) => d.completed),
      totalTasks, doneTasks, pending: totalTasks - doneTasks, overdue: FF.tasks.overdue().length,
      completionRate: totalTasks ? doneTasks / totalTasks : 0,
      focusMinutes: util.sum(periodSessions, (s) => s.actualMin), focusSessions: periodSessions.length,
      habitRate: habitSlots ? habitDone / habitSlots : 0, habitsCount: habits.length,
      goalAvg: FF.goals.stats().avg, goalsActive: FF.goals.stats().active,
      hasData: totalTasks + sessions.length + habits.length + goals.length > 0
    };
  }

  /* ------------------------------------------------------------- Helpers */
  const pct = (n) => Math.round(n * 100) + '%';
  function chartCard({ title, accent, chart, summary, headers, rows, span = 6 }) {
    const table = el('details', { class: 'chart-table' }, el('summary', { text: 'View data table' }),
      el('div', { class: 'table-wrap' }, el('table', { class: 'data' },
        el('thead', null, el('tr', null, headers.map((h, i) => el('th', { class: i ? 'r' : '', text: h })))),
        el('tbody', null, rows.map((r) => el('tr', null, r.map((c, i) => el('td', { class: i ? 'r num' : '', text: String(c) }))))))));
    return el('section', { class: 'card span-' + span, 'data-accent': accent }, el('div', { class: 'card-title' }, el('h3', { text: title })),
      el('div', { class: 'chart-box' }, chart), el('p', { class: 'small muted chart-summary', text: summary }), table);
  }
  function legend(items) {
    return el('div', { class: 'ring-legend' }, items.map((i) => el('span', { class: 'row', style: { gap: '6px' } }, el('i', { class: 'dot', 'data-accent': i.accent }), i.text)));
  }
  const shortDay = (d, n) => (n <= 7 ? util.WEEKDAYS_SHORT[util.weekdayIndex(d)] : util.formatDate(d, 'short'));

  /* ------------------------------------------------------------------ View */
  function render(root, ctx) {
    const body = el('div', { class: 'grid-12' });
    const seg = el('div', { class: 'seg', role: 'group', 'aria-label': 'Period' }, PERIODS.map((p) =>
      el('button', { type: 'button', 'data-v': p.v, 'aria-pressed': String(ui.days === p.v), onclick: () => { ui.days = p.v; paint(); } }, 'Last ' + p.l)));

    function paint() {
      seg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.v) === ui.days)));
      clear(body);
      const a = compute(ui.days);
      if (!a.hasData) {
        body.appendChild(el('div', { class: 'card span-12 empty', 'data-accent': 'cyan' }, el('div', { class: 'empty-icon' }, FF.ui.icon('chart')),
          el('h3', { text: 'Not enough data yet' }), el('p', { text: 'Add tasks, finish a focus session or start a habit — charts here are drawn only from your real activity.' }),
          el('a', { class: 'btn btn-primary', href: '#/tasks' }, 'Add your first task')));
        return;
      }

      // KPI row
      const kpi = [
        ['Tasks created', a.tasksCreated, 'in period', 'red', 'check'],
        ['Tasks completed', a.tasksCompleted, 'in period', 'green', 'checkSimple'],
        ['Pending now', a.pending, a.overdue + ' overdue', 'armor', 'clock'],
        ['Focused time', util.formatDuration(a.focusMinutes), util.plural(a.focusSessions, 'session'), 'cyan', 'timer'],
        ['Habit completion', pct(a.habitRate), util.plural(a.habitsCount, 'active habit'), 'teal', 'flame'],
        ['Goal progress', pct(a.goalAvg), util.plural(a.goalsActive, 'active goal'), 'gold', 'target']
      ];
      body.appendChild(el('div', { class: 'span-12 stat-grid' }, kpi.map(([label, value, sub, acc, ic]) =>
        el('div', { class: 'card stat-card', 'data-accent': acc }, el('div', { class: 'stat-top' }, el('div', { class: 'stat-label', text: label }), el('span', { class: 'stat-ico' }, FF.ui.icon(ic))),
          el('div', { class: 'stat-value num', text: String(value) }), el('div', { class: 'stat-sub', text: sub })))));

      // Task completion ring
      const ring = FF.ui.ring({ size: 170, stroke: 14, accent: 'green', value: a.completionRate, label: pct(a.completionRate), sub: 'completed', aria: 'Task completion rate ' + pct(a.completionRate) });
      body.appendChild(el('section', { class: 'card span-4', 'data-accent': 'green' }, el('div', { class: 'card-title' }, el('h3', { text: 'Task completion' })),
        el('div', { class: 'ring-card' }, ring.el, el('p', { class: 'small muted', text: a.doneTasks + ' of ' + util.plural(a.totalTasks, 'task') + ' completed overall.' }),
          legend([{ accent: 'green', text: 'Completed ' + a.doneTasks }, { accent: 'armor', text: 'Pending ' + a.pending }, { accent: 'flame', text: 'Overdue ' + a.overdue }]))));

      // Weekly / period bars
      const last7 = a.daily.slice(-7);
      body.appendChild(chartCard({
        title: 'Tasks — last 7 days', accent: 'red', span: 8,
        chart: FF.charts.bars({ data: last7.map((d) => ({ label: shortDay(d.date, 7), values: [d.created, d.completed] })), series: [{ name: 'Created', accent: 'red' }, { name: 'Completed', accent: 'green' }], ariaLabel: 'Bar chart of tasks created and completed per day over the last 7 days' }),
        summary: 'Created ' + util.sum(last7, (d) => d.created) + ' and completed ' + util.sum(last7, (d) => d.completed) + ' tasks in the last 7 days. Red bars = created, green bars = completed.',
        headers: ['Day', 'Created', 'Completed'], rows: last7.map((d) => [util.formatDate(d.date, 'short'), d.created, d.completed])
      }));

      // Daily focus
      body.appendChild(chartCard({
        title: 'Daily focus minutes', accent: 'cyan', span: 6,
        chart: FF.charts.line({ points: a.daily.map((d) => ({ label: shortDay(d.date, ui.days), value: d.focus })), accent: 'cyan', ariaLabel: 'Line chart of focused minutes per day' }),
        summary: 'Total ' + util.formatDuration(a.focusMinutes) + ' across ' + util.plural(a.focusSessions, 'completed session') + '; ' + (a.focusSessions ? 'average ' + util.formatDuration(a.focusMinutes / ui.days) + ' per day.' : 'no sessions recorded in this period.'),
        headers: ['Date', 'Minutes', 'Sessions'], rows: a.daily.filter((d) => d.focus || d.sessions).map((d) => [util.formatDate(d.date, 'short'), d.focus, d.sessions])
      }));

      // Habit consistency
      const hs = a.habitStats;
      body.appendChild(chartCard({
        title: 'Habit consistency', accent: 'teal', span: 6,
        chart: hs.length ? FF.charts.bars({ data: hs.map((h) => ({ label: h.name.length > 9 ? h.name.slice(0, 8) + '…' : h.name, values: [Math.round(h.pct * 100)] })), series: [{ name: 'Consistency %', accent: 'teal' }], ariaLabel: 'Bar chart of habit consistency in percent', format: (v) => Math.round(v) + '%' })
          : el('div', { class: 'empty small', text: 'Create a habit to see consistency.' }),
        summary: hs.length ? hs.map((h) => h.name + ' ' + h.done + '/' + h.expected + ' days (' + pct(h.pct) + ')').join(' · ') : 'No active habits.',
        headers: ['Habit', 'Days done', 'Expected', 'Consistency'], rows: hs.map((h) => [h.name, h.done, h.expected, pct(h.pct)])
      }));

      // Monthly trends
      body.appendChild(chartCard({
        title: 'Monthly trend — tasks completed', accent: 'violet', span: 6,
        chart: FF.charts.bars({ data: a.months.map((m) => ({ label: util.formatDate(m.key + '-01', 'monthShort'), values: [m.completed] })), series: [{ name: 'Completed', accent: 'violet' }], ariaLabel: 'Bar chart of tasks completed per month for the last 6 months' }),
        summary: 'Tasks completed per month over the last six months: ' + a.months.map((m) => util.formatDate(m.key + '-01', 'monthShort') + ' ' + m.completed).join(', ') + '.',
        headers: ['Month', 'Completed', 'Focus minutes'], rows: a.months.map((m) => [util.formatDate(m.key + '-01', 'monthShort'), m.completed, m.focus])
      }));
      body.appendChild(chartCard({
        title: 'Monthly trend — focus minutes', accent: 'blue', span: 6,
        chart: FF.charts.line({ points: a.months.map((m) => ({ label: util.formatDate(m.key + '-01', 'monthShort'), value: m.focus })), accent: 'arc', ariaLabel: 'Line chart of focus minutes per month for the last 6 months' }),
        summary: 'Focus minutes per month: ' + a.months.map((m) => util.formatDate(m.key + '-01', 'monthShort') + ' ' + m.focus).join(', ') + '.',
        headers: ['Month', 'Focus minutes'], rows: a.months.map((m) => [util.formatDate(m.key + '-01', 'monthShort'), m.focus])
      }));
    }

    root.append(
      el('div', { class: 'page-head' }, el('div', null, el('div', { class: 'hud-label', text: 'Productivity matrix' }), el('h2', { class: 'page-title', text: 'Analytics' }), el('p', { text: 'Everything here is computed from your saved tasks, sessions, habits and goals.' })), seg),
      body);
    paint();
    ctx.watch(['tasks', 'focusSessions', 'habits', 'goals'], paint);
  }

  FF.analytics = { compute };
  FF.registerView({ id: 'analytics', label: 'Analytics', title: 'Analytics', crumb: 'Productivity matrix', icon: 'chart', accent: 'arc', render });
})();
