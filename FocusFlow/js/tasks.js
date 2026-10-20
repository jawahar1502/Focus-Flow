/* ==========================================================================
   FocusFlow — tasks.js
   Smart to-do list: CRUD, search, filters, sorting, overdue handling,
   linked reminders, goal / study-session links.
   ========================================================================== */
(function () {
  'use strict';
  const FF = window.FF;
  const { el, clear, util } = FF;
  const store = FF.store;

  const CATEGORIES = [
    { value: 'study', label: 'Study', accent: 'blue' },
    { value: 'coding', label: 'Java & coding', accent: 'cyan' },
    { value: 'aptitude', label: 'Aptitude', accent: 'arc' },
    { value: 'college', label: 'College assignments', accent: 'armor' },
    { value: 'projects', label: 'Projects', accent: 'violet' },
    { value: 'personal', label: 'Personal', accent: 'teal' },
    { value: 'other', label: 'Other', accent: 'arc' }
  ];
  const PRIORITIES = [
    { value: 'urgent', label: 'Urgent', accent: 'flame', rank: 0 },
    { value: 'high', label: 'High', accent: 'red', rank: 1 },
    { value: 'medium', label: 'Medium', accent: 'armor', rank: 2 },
    { value: 'low', label: 'Low', accent: 'blue', rank: 3 }
  ];
  const REMINDER_OPTIONS = [
    { value: '', label: 'No reminder' },
    { value: '0', label: 'At due time' },
    { value: '10', label: '10 minutes before' },
    { value: '30', label: '30 minutes before' },
    { value: '60', label: '1 hour before' },
    { value: '1440', label: '1 day before' }
  ];

  const cat = (v) => CATEGORIES.find((c) => c.value === v) || CATEGORIES[CATEGORIES.length - 1];
  const prio = (v) => PRIORITIES.find((p) => p.value === v) || PRIORITIES[2];

  /** Filters survive navigation within the session (memory only). */
  const ui = { q: '', cat: '', prio: '', status: '', view: 'all', sort: 'due' };

  /* ----------------------------------------------------------------- Data */
  const load = () => store.get('tasks');
  const dueAt = (t) => (t.dueDate ? util.atDateTime(t.dueDate, t.dueTime || '23:59') : null);

  function isOverdue(t, now = Date.now()) {
    if (t.status !== 'pending') return false;
    const d = dueAt(t);
    return !!d && d.getTime() < now;
  }
  const overdue = () => load().filter((t) => isOverdue(t));

  function stats() {
    const list = load();
    const today = util.today();
    const now = Date.now();
    const completed = list.filter((t) => t.status === 'completed').length;
    const todayList = list.filter((t) => t.dueDate === today || (t.completedAt && util.dateOf(t.completedAt) === today));
    return {
      total: list.length, completed, pending: list.length - completed,
      overdue: list.filter((t) => isOverdue(t, now)).length,
      todayTotal: todayList.length, todayDone: todayList.filter((t) => t.status === 'completed').length
    };
  }

  function syncReminder(t) {
    if (!FF.reminders) return;
    const key = 'task:' + t.id;
    if (t.status !== 'pending' || !t.dueDate || t.reminder === '' || t.reminder == null) { FF.reminders.removeLinked(key); return; }
    const due = util.atDateTime(t.dueDate, t.dueTime || '09:00');
    FF.reminders.upsertLinked({
      key, title: 'Task due: ' + t.title, description: t.description, at: new Date(due.getTime() - Number(t.reminder) * 60000), taskId: t.id
    });
  }

  function toggle(id) {
    let result = null;
    store.update('tasks', (list) => {
      const t = list.find((x) => x.id === id);
      if (!t) return;
      if (t.status === 'completed') { t.status = 'pending'; t.completedAt = null; }
      else { t.status = 'completed'; t.completedAt = new Date().toISOString(); }
      result = { ...t };
    });
    if (result) {
      syncReminder(result);
      FF.activity.log((result.status === 'completed' ? 'Completed task: ' : 'Reopened task: ') + result.title, result.status === 'completed' ? 'green' : 'armor');
    }
    return result;
  }

  async function remove(id) {
    const t = store.find('tasks', id);
    if (!t) return false;
    const ok = await FF.ui.confirm({ title: 'Delete this task?', message: '"' + t.title + '" will be permanently deleted.', confirmText: 'Delete task', danger: true });
    if (!ok) return false;
    store.remove('tasks', id);
    if (FF.reminders) FF.reminders.removeLinked('task:' + id);
    FF.activity.log('Deleted task: ' + t.title, 'flame');
    FF.ui.toast('Task deleted.', 'info');
    return true;
  }

  function build(v, existing) {
    const now = new Date().toISOString();
    const t = existing ? { ...existing } : { id: util.uid('task'), createdAt: now, status: 'pending', completedAt: null };
    return Object.assign(t, {
      title: v.title, description: v.description || '', category: v.category, priority: v.priority,
      dueDate: v.dueDate || '', dueTime: v.dueDate ? (v.dueTime || '') : '',
      estimate: v.estimate ? Math.round(v.estimate) : '',
      reminder: v.dueDate ? (v.reminder || '') : '',
      goalId: v.goalId || '', sessionId: v.sessionId || '', updatedAt: now
    });
  }

  /** Opens the create/edit dialog. Resolves with the saved task or null. */
  async function openForm(task, defaults) {
    const editing = !!task;
    const goalOpts = FF.goals ? FF.goals.options() : [];
    const sessionOpts = FF.timetable ? FF.timetable.sessionOptions() : [];
    const fields = [
      { name: 'title', label: 'Task title', type: 'text', required: true, maxLength: 120, span2: true, placeholder: 'e.g. Solve 20 aptitude questions' },
      { name: 'description', label: 'Description', type: 'textarea', span2: true, maxLength: 600, rows: 3 },
      { name: 'category', label: 'Category', type: 'select', options: CATEGORIES },
      { name: 'priority', label: 'Priority', type: 'select', options: PRIORITIES },
      { name: 'dueDate', label: 'Due date', type: 'date' },
      { name: 'dueTime', label: 'Due time', type: 'time' },
      { name: 'estimate', label: 'Estimated minutes', type: 'number', min: 1, max: 1440, step: 1, placeholder: 'optional' },
      { name: 'reminder', label: 'Reminder', type: 'select', options: REMINDER_OPTIONS, hint: 'Needs a due date. Without a due time, reminders use 9:00 AM.' }
    ];
    if (goalOpts.length) fields.push({ name: 'goalId', label: 'Link to goal', type: 'select', options: [{ value: '', label: 'No goal' }, ...goalOpts] });
    if (sessionOpts.length) fields.push({ name: 'sessionId', label: 'Link to study session', type: 'select', options: [{ value: '', label: 'No session' }, ...sessionOpts] });

    const res = await FF.ui.formModal({
      title: editing ? 'Edit task' : 'New task',
      submitText: editing ? 'Save changes' : 'Add task',
      fields,
      values: editing ? { ...task, estimate: task.estimate || '' } : { category: 'study', priority: 'medium', reminder: '', ...(defaults || {}) },
      validate(v) {
        const errs = {};
        if (v.dueTime && !v.dueDate) errs.dueDate = 'Choose a due date to go with the due time.';
        if (v.reminder !== '' && !v.dueDate) errs.dueDate = 'A reminder needs a due date.';
        return errs;
      }
    });
    if (!res) return null;
    const t = build(res, task);
    store.upsert('tasks', t);
    syncReminder(t);
    FF.activity.log((editing ? 'Updated task: ' : 'Added task: ') + t.title, 'red');
    FF.ui.toast(editing ? 'Task updated.' : 'Task added.', 'success');
    return t;
  }

  /* -------------------------------------------------------------- Filtering */
  function filtered(all) {
    const today = util.today();
    const now = Date.now();
    let list = all.filter((t) => {
      if (!util.matches(ui.q, t.title, t.description, cat(t.category).label)) return false;
      if (ui.cat && t.category !== ui.cat) return false;
      if (ui.prio && t.priority !== ui.prio) return false;
      if (ui.status && t.status !== ui.status) return false;
      if (ui.view === 'today' && t.dueDate !== today) return false;
      if (ui.view === 'upcoming' && !(t.status === 'pending' && t.dueDate && t.dueDate > today)) return false;
      if (ui.view === 'overdue' && !isOverdue(t, now)) return false;
      return true;
    });
    const dueKey = (t) => { const d = dueAt(t); return d ? d.getTime() : Infinity; };
    const statusRank = (t) => (t.status === 'completed' ? 1 : 0);
    if (ui.sort === 'priority') list = util.sortBy(list, statusRank, (t) => prio(t.priority).rank, dueKey);
    else if (ui.sort === 'created') list = util.sortBy(list, statusRank, (t) => -new Date(t.createdAt).getTime());
    else list = util.sortBy(list, statusRank, dueKey, (t) => prio(t.priority).rank);
    return list;
  }

  function dueText(t) {
    if (!t.dueDate) return '';
    const today = util.today();
    const diff = util.daysBetween(today, t.dueDate);
    const day = diff === 0 ? 'Today' : diff === 1 ? 'Tomorrow' : diff === -1 ? 'Yesterday' : util.formatDate(t.dueDate, 'short');
    return day + (t.dueTime ? ', ' + util.formatTime(t.dueTime) : '');
  }

  /* ------------------------------------------------------------------ View */
  function taskRow(t) {
    const p = prio(t.priority);
    const done = t.status === 'completed';
    const late = isOverdue(t);
    const check = el('button', {
      type: 'button', class: 'task-check' + (done ? ' on' : ''), role: 'checkbox', 'aria-checked': String(done),
      'aria-label': (done ? 'Reopen task: ' : 'Mark complete: ') + t.title, onclick: () => toggle(t.id)
    }, FF.ui.icon('checkSimple'));

    const meta = el('div', { class: 'task-meta' },
      el('span', { class: 'prio', 'data-accent': p.accent, text: p.label }),
      el('span', { class: 'badge', 'data-accent': cat(t.category).accent, text: cat(t.category).label }));
    if (done) meta.appendChild(el('span', { class: 'badge', 'data-accent': 'green' }, FF.ui.icon('check'), 'Completed ' + (t.completedAt ? util.formatDate(util.dateOf(t.completedAt), 'short') : '')));
    else if (late) meta.appendChild(el('span', { class: 'badge', 'data-accent': 'flame' }, FF.ui.icon('alert'), 'Overdue · ' + util.relative(dueAt(t).getTime() - Date.now())));
    else if (t.dueDate) meta.appendChild(el('span', { class: 'badge', 'data-accent': 'cyan' }, FF.ui.icon('clock'), 'Due ' + dueText(t)));
    if (t.estimate) meta.appendChild(el('span', { class: 'muted small', text: '~' + util.formatDuration(t.estimate) }));
    if (t.reminder !== '' && t.reminder != null && !done) meta.appendChild(el('span', { class: 'muted small', title: 'Reminder set' }, FF.ui.icon('bell'), ' reminder'));
    const goal = t.goalId && FF.goals ? FF.goals.get(t.goalId) : null;
    if (goal) meta.appendChild(el('span', { class: 'badge', 'data-accent': 'green' }, FF.ui.icon('target'), goal.title));
    const sess = t.sessionId && FF.timetable ? FF.timetable.getSession(t.sessionId) : null;
    if (sess) meta.appendChild(el('span', { class: 'badge', 'data-accent': 'blue' }, FF.ui.icon('calendar'), sess.subject));

    return el('li', { class: 'task-item' + (done ? ' is-done' : '') + (late ? ' is-late' : ''), 'data-accent': late ? 'flame' : p.accent },
      check,
      el('div', { class: 'task-body' },
        el('div', { class: 'task-title wrap-text', text: t.title }),
        t.description ? el('div', { class: 'task-desc wrap-text', text: t.description }) : null,
        meta),
      el('div', { class: 'task-actions' },
        el('button', { type: 'button', class: 'btn btn-ghost btn-icon btn-sm', 'aria-label': 'Edit task: ' + t.title, onclick: () => openForm(t) }, FF.ui.icon('edit')),
        el('button', { type: 'button', class: 'btn btn-ghost btn-icon btn-sm', 'aria-label': 'Delete task: ' + t.title, onclick: () => remove(t.id) }, FF.ui.icon('trash'))));
  }

  function render(root, ctx) {
    const listBox = el('ul', { class: 'task-list' });
    const summary = el('p', { class: 'muted small', 'aria-live': 'polite' });
    const viewBtns = {};

    const searchInput = el('input', { type: 'search', placeholder: 'Search tasks…', 'aria-label': 'Search tasks', value: ui.q });
    searchInput.addEventListener('input', () => { ui.q = searchInput.value; renderList(); });

    function selectField(label, key, options, allLabel) {
      const s = el('select', { 'aria-label': label }, allLabel != null ? el('option', { value: '', text: allLabel }) : null,
        options.map((o) => el('option', { value: o.value, text: o.label })));
      s.value = ui[key];
      s.addEventListener('change', () => { ui[key] = s.value; renderList(); });
      return s;
    }

    const VIEWS = [['all', 'All'], ['today', 'Today'], ['upcoming', 'Upcoming'], ['overdue', 'Overdue']];
    const seg = el('div', { class: 'seg', role: 'group', 'aria-label': 'Quick view' }, VIEWS.map(([k, label]) => {
      const b = el('button', { type: 'button', 'aria-pressed': String(ui.view === k), onclick: () => { ui.view = k; renderList(); } }, label);
      viewBtns[k] = { b, label };
      return b;
    }));

    function renderList() {
      const all = load();
      const items = filtered(all);
      const today = util.today();
      const now = Date.now();
      const counts = {
        all: all.length, today: all.filter((t) => t.dueDate === today).length,
        upcoming: all.filter((t) => t.status === 'pending' && t.dueDate && t.dueDate > today).length,
        overdue: all.filter((t) => isOverdue(t, now)).length
      };
      Object.entries(viewBtns).forEach(([k, o]) => { o.b.setAttribute('aria-pressed', String(ui.view === k)); o.b.textContent = o.label + ' (' + counts[k] + ')'; });
      clear(listBox);
      if (!all.length) {
        listBox.appendChild(el('li', { class: 'empty-li' }, el('div', { class: 'empty', 'data-accent': 'red' },
          el('div', { class: 'empty-icon' }, FF.ui.icon('check')), el('h3', { text: 'No tasks yet' }),
          el('p', { text: 'Add your first task to start building your mission list.' }),
          el('button', { type: 'button', class: 'btn btn-primary', onclick: () => openForm() }, FF.ui.icon('plus'), 'Add a task'))));
        summary.textContent = '';
        return;
      }
      if (!items.length) {
        listBox.appendChild(el('li', { class: 'empty-li' }, el('div', { class: 'empty', 'data-accent': 'blue' },
          el('div', { class: 'empty-icon' }, FF.ui.icon('search')), el('h3', { text: 'No tasks match these filters' }),
          el('button', { type: 'button', class: 'btn', onclick: () => { Object.assign(ui, { q: '', cat: '', prio: '', status: '', view: 'all' }); searchInput.value = ''; catSel.value = ''; prioSel.value = ''; statusSel.value = ''; renderList(); } }, 'Clear filters'))));
      } else items.forEach((t) => listBox.appendChild(taskRow(t)));
      summary.textContent = 'Showing ' + items.length + ' of ' + util.plural(all.length, 'task') + '.';
    }

    const catSel = selectField('Filter by category', 'cat', CATEGORIES, 'All categories');
    const prioSel = selectField('Filter by priority', 'prio', PRIORITIES, 'All priorities');
    const statusSel = selectField('Filter by status', 'status', [{ value: 'pending', label: 'Pending' }, { value: 'completed', label: 'Completed' }], 'Any status');
    const sortSel = selectField('Sort tasks', 'sort', [{ value: 'due', label: 'Sort: due date' }, { value: 'priority', label: 'Sort: priority' }, { value: 'created', label: 'Sort: newest' }]);

    root.append(
      el('div', { class: 'page-head' },
        el('div', null, el('div', { class: 'hud-label', text: 'Daily objectives' }), el('h2', { class: 'page-title', text: 'To-Do List' }),
          el('p', { text: 'Plan, prioritise and finish what matters.' })),
        el('button', { type: 'button', class: 'btn btn-primary', onclick: () => openForm() }, FF.ui.icon('plus'), 'New task')),
      el('div', { class: 'card filters' },
        el('div', { class: 'search' }, FF.ui.icon('search'), searchInput),
        seg,
        el('div', { class: 'filter-selects' }, catSel, prioSel, statusSel, sortSel)),
      summary,
      listBox);

    renderList();
    ctx.watch(['tasks', 'goals', 'timetable'], renderList);
    ctx.every(renderList, 60000); // refresh overdue badges
  }

  FF.tasks = { CATEGORIES, PRIORITIES, catLabel: (v) => cat(v).label, category: cat, priority: prio, list: load, isOverdue, overdue, dueAt, stats, toggle, remove, openForm, syncReminder };

  FF.registerView({ id: 'tasks', label: 'To-Do List', title: 'To-Do List', crumb: 'Daily objectives', icon: 'check', accent: 'red', render });
})();
