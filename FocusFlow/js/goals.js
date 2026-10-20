/* ==========================================================================
   FocusFlow — goals.js
   Goals & milestones. Progress only changes through explicit user actions:
     • "Log progress" adds to a measurable target (current / target), or
     • ticking milestones (used when no numeric target is set).
   Linked tasks are shown alongside but never silently change progress.
   ========================================================================== */
(function () {
  'use strict';
  const FF = window.FF;
  const { el, clear, util } = FF;
  const store = FF.store;

  const TYPES = [{ value: 'daily', label: 'Daily' }, { value: 'weekly', label: 'Weekly' }, { value: 'monthly', label: 'Monthly' }, { value: 'long', label: 'Long-term' }];
  const typeLabel = (v) => (TYPES.find((t) => t.value === v) || TYPES[3]).label;
  const ui = { filter: 'active' };
  const load = () => store.get('goals');

  /* --------------------------------------------------------------- Maths */
  function progressOf(g) {
    const target = Number(g.target) || 0;
    if (target > 0) return util.clamp((Number(g.current) || 0) / target, 0, 1);
    const ms = g.milestones || [];
    if (ms.length) return ms.filter((m) => m.done).length / ms.length;
    return g.status === 'completed' ? 1 : 0;
  }
  const daysLeft = (g) => (g.deadline ? util.daysBetween(util.today(), g.deadline) : null);
  const isOverdue = (g) => g.status === 'active' && g.deadline && g.deadline < util.today();

  function stats() {
    const list = load();
    const act = list.filter((g) => g.status === 'active');
    return {
      total: list.length, active: act.length, completed: list.length - act.length, overdue: act.filter(isOverdue).length,
      avg: act.length ? util.sum(act, progressOf) / act.length : 0
    };
  }

  /** Re-evaluate completion after any progress change and log history. */
  function reconcile(g, note) {
    const pct = progressOf(g);
    g.history = g.history || [];
    if (note) g.history.unshift({ at: new Date().toISOString(), text: note });
    if (g.status === 'active' && pct >= 1 && ((Number(g.target) > 0) || (g.milestones || []).length)) {
      g.status = 'completed'; g.completedAt = new Date().toISOString();
      g.history.unshift({ at: g.completedAt, text: 'Goal completed 🎉' });
      FF.activity.log('Completed goal: ' + g.title, 'gold');
      FF.ui.toast('Goal completed: ' + g.title, 'success', 6000);
    } else if (g.status === 'completed' && pct < 1 && ((Number(g.target) > 0) || (g.milestones || []).length)) {
      g.status = 'active'; g.completedAt = null;
      g.history.unshift({ at: new Date().toISOString(), text: 'Goal reopened' });
    }
    if (g.history.length > 40) g.history.length = 40;
    g.updatedAt = new Date().toISOString();
  }
  function mutate(id, fn) {
    store.update('goals', (list) => { const g = list.find((x) => x.id === id); if (g) { fn(g); } });
  }

  /* -------------------------------------------------------------- Dialogs */
  async function openForm(goal) {
    const editing = !!goal;
    const res = await FF.ui.formModal({
      title: editing ? 'Edit goal' : 'New goal', submitText: editing ? 'Save changes' : 'Add goal',
      fields: [
        { name: 'title', label: 'Goal title', type: 'text', required: true, maxLength: 100, span2: true, placeholder: 'e.g. Solve 100 DSA problems' },
        { name: 'description', label: 'Description', type: 'textarea', rows: 2, maxLength: 300, span2: true },
        { name: 'type', label: 'Type', type: 'select', options: TYPES },
        { name: 'category', label: 'Category', type: 'select', options: FF.tasks.CATEGORIES },
        { name: 'target', label: 'Target amount', type: 'number', min: 1, max: 1000000, step: 'any', placeholder: 'optional', hint: 'Leave empty to track by milestones only.' },
        { name: 'unit', label: 'Unit', type: 'text', maxLength: 20, placeholder: 'e.g. problems, hours, pages' },
        { name: 'current', label: 'Current progress', type: 'number', min: 0, max: 1000000, step: 'any' },
        { name: 'deadline', label: 'Deadline', type: 'date' }
      ],
      values: goal ? { ...goal, target: goal.target || '' } : { type: 'weekly', category: 'study', current: 0 },
      validate(v) {
        if (v.target && v.current != null && v.current > v.target * 1000) return { current: 'Current progress looks too large for this target.' };
        return {};
      }
    });
    if (!res) return;
    const now = new Date().toISOString();
    const g = Object.assign(goal ? { ...goal } : { id: util.uid('goal'), createdAt: now, status: 'active', milestones: [], history: [] }, {
      title: res.title, description: res.description, type: res.type, category: res.category,
      target: res.target || 0, unit: res.unit, current: res.current || 0, deadline: res.deadline
    });
    reconcile(g, editing ? 'Goal details updated' : 'Goal created');
    store.upsert('goals', g);
    if (!editing) FF.activity.log('Created goal: ' + g.title, 'gold');
    FF.ui.toast(editing ? 'Goal updated.' : 'Goal created.', 'success');
  }

  async function logProgress(g) {
    const res = await FF.ui.formModal({
      title: 'Log progress — ' + g.title, submitText: 'Add progress',
      intro: 'Currently ' + (g.current || 0) + ' of ' + g.target + (g.unit ? ' ' + g.unit : '') + '.',
      fields: [{ name: 'amount', label: 'Amount to add' + (g.unit ? ' (' + g.unit + ')' : ''), type: 'number', required: true, min: 0.01, step: 'any' },
        { name: 'note', label: 'Note (optional)', type: 'text', maxLength: 100 }],
      values: {}
    });
    if (!res) return;
    mutate(g.id, (x) => { x.current = Math.round(((Number(x.current) || 0) + res.amount) * 100) / 100; reconcile(x, '+' + res.amount + (x.unit ? ' ' + x.unit : '') + (res.note ? ' — ' + res.note : '')); });
  }
  async function addMilestone(g) {
    const res = await FF.ui.formModal({ title: 'Add milestone', submitText: 'Add', fields: [{ name: 'title', label: 'Milestone', type: 'text', required: true, maxLength: 100 }], values: {} });
    if (res) mutate(g.id, (x) => { x.milestones.push({ id: util.uid('ms'), title: res.title, done: false, doneAt: null }); reconcile(x, 'Milestone added: ' + res.title); });
  }
  function toggleMilestone(g, m) {
    mutate(g.id, (x) => {
      const ms = x.milestones.find((y) => y.id === m.id);
      if (!ms) return;
      ms.done = !ms.done; ms.doneAt = ms.done ? new Date().toISOString() : null;
      reconcile(x, (ms.done ? 'Milestone reached: ' : 'Milestone reopened: ') + ms.title);
      if (ms.done) FF.activity.log('Milestone reached: ' + ms.title, 'armor');
    });
  }
  async function removeMilestone(g, m) {
    const ok = await FF.ui.confirm({ title: 'Remove milestone?', message: '"' + m.title + '" will be removed from this goal.', confirmText: 'Remove', danger: true });
    if (ok) mutate(g.id, (x) => { x.milestones = x.milestones.filter((y) => y.id !== m.id); reconcile(x, 'Milestone removed'); });
  }
  async function remove(g) {
    const ok = await FF.ui.confirm({ title: 'Delete goal?', message: '"' + g.title + '" will be deleted. Linked tasks are kept but unlinked.', confirmText: 'Delete goal', danger: true });
    if (!ok) return;
    store.remove('goals', g.id);
    store.update('tasks', (list) => { list.forEach((t) => { if (t.goalId === g.id) t.goalId = ''; }); });
    FF.ui.toast('Goal deleted.', 'info');
  }
  function showHistory(g) {
    const items = (g.history || []);
    FF.ui.inform({
      title: 'History — ' + g.title,
      body: items.length ? el('ul', { class: 'compact-list' }, items.map((h) => el('li', null, el('span', { class: 'compact-time', text: util.formatDate(util.dateOf(h.at), 'short') }), el('div', { class: 'compact-main' }, el('b', { text: h.text }))))) : el('p', { class: 'muted', text: 'No history yet.' })
    });
  }

  /* ----------------------------------------------------------------- View */
  function goalCard(g) {
    const pct = progressOf(g);
    const dl = daysLeft(g);
    const late = isOverdue(g);
    const ring = FF.ui.ring({ size: 86, stroke: 8, accent: g.status === 'completed' ? 'green' : late ? 'flame' : 'armor', value: pct, label: Math.round(pct * 100) + '%', sub: '' });
    const linked = FF.tasks.list().filter((t) => t.goalId === g.id);
    const linkedDone = linked.filter((t) => t.status === 'completed').length;
    const ms = g.milestones || [];
    const badges = el('div', { class: 'row' },
      el('span', { class: 'badge', 'data-accent': 'violet', text: typeLabel(g.type) }),
      el('span', { class: 'badge', 'data-accent': FF.tasks.category(g.category).accent, text: FF.tasks.catLabel(g.category) }));
    if (g.status === 'completed') badges.appendChild(el('span', { class: 'badge', 'data-accent': 'green' }, FF.ui.icon('check'), 'Completed'));
    else if (late) badges.appendChild(el('span', { class: 'badge', 'data-accent': 'flame' }, FF.ui.icon('alert'), 'Overdue by ' + util.plural(-dl, 'day')));
    else if (dl != null) badges.appendChild(el('span', { class: 'badge', 'data-accent': dl <= 3 ? 'red' : 'cyan' }, FF.ui.icon('clock'), dl === 0 ? 'Due today' : util.plural(dl, 'day') + ' left'));

    return el('article', { class: 'card tilt-card goal-card', 'data-accent': g.status === 'completed' ? 'green' : late ? 'flame' : 'armor' },
      el('div', { class: 'goal-top' }, ring.el,
        el('div', { class: 'grow' }, el('h3', { class: 'wrap-text', text: g.title }), g.description ? el('p', { class: 'small muted wrap-text', text: g.description }) : null,
          Number(g.target) > 0 ? el('p', { class: 'small num', text: (g.current || 0) + ' / ' + g.target + (g.unit ? ' ' + g.unit : '') }) : null)),
      badges,
      ms.length ? el('ul', { class: 'ms-list', 'aria-label': 'Milestones' }, ms.map((m) => el('li', null,
        el('label', { class: 'check' }, el('input', { type: 'checkbox', checked: m.done ? true : null, onchange: () => toggleMilestone(g, m) }), el('span', { class: m.done ? 'is-done wrap-text' : 'wrap-text', text: m.title })),
        el('button', { type: 'button', class: 'btn btn-ghost btn-icon btn-sm', 'aria-label': 'Remove milestone: ' + m.title, onclick: () => removeMilestone(g, m) }, FF.ui.icon('x'))))) : null,
      linked.length ? el('p', { class: 'small muted' }, FF.ui.icon('link'), ' Linked tasks: ' + linkedDone + ' / ' + linked.length + ' done') : null,
      g.deadline ? el('p', { class: 'small muted', text: 'Deadline: ' + util.formatDate(g.deadline, 'long') }) : null,
      el('div', { class: 'row card-actions' },
        Number(g.target) > 0 && g.status === 'active' ? el('button', { type: 'button', class: 'btn btn-sm btn-teal', onclick: () => logProgress(g) }, FF.ui.icon('plus'), 'Log progress') : null,
        el('button', { type: 'button', class: 'btn btn-sm', onclick: () => addMilestone(g) }, FF.ui.icon('target'), 'Milestone'),
        el('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: () => showHistory(g) }, FF.ui.icon('clock'), 'History'),
        el('button', { type: 'button', class: 'btn btn-ghost btn-icon btn-sm', 'aria-label': 'Edit goal: ' + g.title, onclick: () => openForm(g) }, FF.ui.icon('edit')),
        el('button', { type: 'button', class: 'btn btn-ghost btn-icon btn-sm', 'aria-label': 'Delete goal: ' + g.title, onclick: () => remove(g) }, FF.ui.icon('trash'))));
  }

  function render(root, ctx) {
    const grid = el('div', { class: 'card-grid' });
    const btns = {};
    const seg = el('div', { class: 'seg', role: 'group', 'aria-label': 'Filter goals' }, [['active', 'Active'], ['completed', 'Completed'], ['all', 'All']].map(([k, l]) => {
      const b = el('button', { type: 'button', 'aria-pressed': String(ui.filter === k), onclick: () => { ui.filter = k; paint(); } }, l);
      btns[k] = b; return b;
    }));
    const summary = el('p', { class: 'muted small', 'aria-live': 'polite' });
    function paint() {
      Object.entries(btns).forEach(([k, b]) => b.setAttribute('aria-pressed', String(ui.filter === k)));
      clear(grid);
      const all = load();
      const st = stats();
      summary.textContent = all.length ? st.active + ' active · ' + st.completed + ' completed' + (st.overdue ? ' · ' + st.overdue + ' overdue' : '') : '';
      let list = ui.filter === 'all' ? all : all.filter((g) => g.status === ui.filter);
      list = util.sortBy(list, (g) => (g.status === 'completed' ? 1 : 0), (g) => g.deadline || '9999-99-99');
      if (!list.length) grid.appendChild(el('div', { class: 'empty card', 'data-accent': 'armor' },
        el('div', { class: 'empty-icon' }, FF.ui.icon('target')), el('h3', { text: all.length ? 'Nothing in this view' : 'No goals yet' }),
        el('p', { text: all.length ? 'Switch the filter to see other goals.' : 'Set a goal with a measurable target or milestones.' }),
        all.length ? null : el('button', { type: 'button', class: 'btn btn-primary', onclick: () => openForm() }, FF.ui.icon('plus'), 'Create a goal')));
      list.forEach((g) => grid.appendChild(goalCard(g)));
    }
    root.append(
      el('div', { class: 'page-head' },
        el('div', null, el('div', { class: 'hud-label', text: 'Milestone tracker' }), el('h2', { class: 'page-title', text: 'Goals & Milestones' }), el('p', { text: 'Progress moves only when you log it or tick a milestone.' })),
        el('button', { type: 'button', class: 'btn btn-primary', onclick: () => openForm() }, FF.ui.icon('plus'), 'New goal')),
      el('div', { class: 'row spread' }, seg, summary), grid);
    paint();
    ctx.watch(['goals', 'tasks'], paint);
  }

  FF.goals = {
    list: load, get: (id) => load().find((g) => g.id === id) || null, progressOf, daysLeft, isOverdue, stats, openForm,
    options: () => load().filter((g) => g.status === 'active').map((g) => ({ value: g.id, label: g.title }))
  };
  FF.registerView({ id: 'goals', label: 'Goals & Milestones', title: 'Goals & Milestones', crumb: 'Milestone tracker', icon: 'target', accent: 'armor', render });
})();
