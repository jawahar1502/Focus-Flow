/* ==========================================================================
   FocusFlow — sample.js
   Optional demonstration data. Every record is flagged sample:true and titled
   "[Sample] …" so it is never mistaken for real activity, and it can be
   removed in one click (Settings → Clear sample data).
   ========================================================================== */
(function () {
  'use strict';
  const FF = window.FF;
  const { util } = FF;
  const store = FF.store;

  const S = '[Sample] ';
  const iso = (dateS, hh = 10) => util.atDateTime(dateS, util.pad(hh) + ':00').toISOString();

  function append(name, items) { store.update(name, (list) => { list.push(...items); }, { silent: true }); }

  function load() {
    const today = util.today();
    const d = (n) => util.addDays(today, n);
    const now = new Date().toISOString();
    const mk = (prefix, extra) => ({ id: util.uid(prefix), sample: true, createdAt: now, ...extra });

    /* ---- tasks ---- */
    const task = (title, extra) => mk('task', { title: S + title, description: '', category: 'study', priority: 'medium', dueDate: '', dueTime: '', status: 'pending', completedAt: null, estimate: '', reminder: '', goalId: '', sessionId: '', ...extra });
    const done = (title, daysAgo, extra) => task(title, { status: 'completed', completedAt: iso(d(-daysAgo), 17), createdAt: iso(d(-daysAgo - 2), 9), dueDate: d(-daysAgo), ...extra });
    const goalId = util.uid('goal');
    const tasks = [
      task('Revise Java collections', { category: 'coding', priority: 'high', dueDate: today, dueTime: '20:00', estimate: 45, description: 'ArrayList, HashMap, TreeMap and iterators.', goalId }),
      task('Aptitude practice set 4', { category: 'aptitude', priority: 'medium', dueDate: today, estimate: 30 }),
      task('Submit DBMS assignment', { category: 'college', priority: 'urgent', dueDate: d(-1), dueTime: '17:00', description: 'Overdue example — mark it complete to see the stats update.' }),
      task('Work on portfolio README', { category: 'projects', priority: 'low', dueDate: d(3), estimate: 60 }),
      task('Plan weekend study schedule', { category: 'personal', priority: 'low', dueDate: d(5) }),
      done('Finish OS chapter notes', 1, { category: 'study', priority: 'high' }),
      done('Solve 10 array problems', 2, { category: 'coding', priority: 'medium', goalId }),
      done('Read networks slides', 3, { category: 'study', priority: 'low' }),
      done('Mock test review', 5, { category: 'aptitude', priority: 'medium' })
    ];
    append('tasks', tasks);

    /* ---- goals ---- */
    append('goals', [{
      id: goalId, sample: true, createdAt: now, title: S + 'Solve 50 coding problems', description: 'Placement preparation target.', type: 'monthly', category: 'coding',
      target: 50, unit: 'problems', current: 18, deadline: d(21), status: 'active', completedAt: null,
      milestones: [{ id: util.uid('ms'), title: 'Reach 25 problems', done: false, doneAt: null }, { id: util.uid('ms'), title: 'Finish all easy arrays', done: true, doneAt: iso(d(-2)) }],
      history: [{ at: iso(d(-2)), text: '+10 problems — arrays' }, { at: iso(d(-6)), text: 'Goal created' }]
    }, {
      id: util.uid('goal'), sample: true, createdAt: now, title: S + 'Read 2 technical books', description: '', type: 'long', category: 'study', target: 0, unit: '', current: 0, deadline: d(60), status: 'active', completedAt: null,
      milestones: [{ id: util.uid('ms'), title: 'Finish book one', done: true, doneAt: iso(d(-4)) }, { id: util.uid('ms'), title: 'Finish book two', done: false, doneAt: null }], history: [{ at: iso(d(-4)), text: 'Milestone reached: Finish book one' }]
    }]);

    /* ---- habits (completions over recent days) ---- */
    const days = (list) => list.map((n) => d(-n)).sort();
    append('habits', [
      { id: util.uid('hab'), sample: true, createdAt: now, name: S + 'Coding practice', description: 'At least one problem a day.', category: 'coding', target: 6, archived: false, completions: days([0, 1, 2, 3, 5, 6, 8, 9, 10, 11, 12, 15, 16]) },
      { id: util.uid('hab'), sample: true, createdAt: now, name: S + 'Reading', description: '20 pages.', category: 'reading', target: 5, archived: false, completions: days([1, 2, 4, 5, 8, 9, 13]) },
      { id: util.uid('hab'), sample: true, createdAt: now, name: S + 'Exercise', description: '', category: 'exercise', target: 4, archived: false, completions: days([1, 3, 4, 7, 10, 11]) }
    ]);

    /* ---- focus sessions ---- */
    const fs = [];
    [[0, 25], [0, 25], [1, 25], [1, 25], [1, 25], [2, 25], [3, 50], [4, 25], [6, 25], [7, 25]].forEach(([ago, min]) => {
      const date = d(-ago);
      fs.push({ id: util.uid('fs'), sample: true, kind: 'focus', completed: true, date, plannedMin: min, actualMin: min, startedAt: iso(date, 16), endedAt: iso(date, 17), taskId: '', subject: S + 'Study' });
    });
    append('focusSessions', fs);

    /* ---- timetable ---- */
    const ses = (subject, day, start, end, category) => ({ id: util.uid('ses'), sample: true, createdAt: now, subject: S + subject, description: '', repeat: 'weekly', day, date: '', start, end, category, reminder: '' });
    append('timetable', [ses('Data structures', 0, '18:00', '19:30', 'coding'), ses('Operating systems', 2, '18:00', '19:30', 'study'), ses('Aptitude drills', 4, '17:00', '18:00', 'aptitude'), ses('Project work', 5, '10:00', '12:00', 'projects')]);

    /* ---- notes ---- */
    append('notes', [
      { id: util.uid('note'), sample: true, title: S + 'Project idea', body: 'A habit tracker that links goals to focus sessions.\nAdd a weekly review screen.', tag: 'ideas', pinned: true, createdAt: now, updatedAt: now },
      { id: util.uid('note'), sample: true, title: S + 'Interview prep checklist', body: '- Revise OOP concepts\n- Practise SQL joins\n- Prepare project walkthrough', tag: 'placement', pinned: false, createdAt: now, updatedAt: now }
    ]);

    /* ---- journal ---- */
    append('journal', [{ id: util.uid('jrnl'), sample: true, date: d(-1), title: S + 'A steady day', reflection: 'Stayed focused in the afternoon.', accomplishments: 'Finished OS notes.', lessons: 'Short breaks keep my focus longer.', improve: 'Start the morning session earlier.', mood: 4, createdAt: now, updatedAt: now }]);

    /* ---- expenses ---- */
    const month = util.monthKey(today);
    const day = (n) => (Number(today.slice(8)) >= n ? month + '-' + util.pad(n) : today);
    const tx = (type, amount, date, category, method, description) => ({ id: util.uid('txn'), sample: true, createdAt: now, type, amount, date, category, method, description: S + description });
    append('transactions', [
      tx('income', 6000, day(1), 'allowance', 'Bank transfer', 'Monthly allowance'), tx('income', 1500, day(3), 'freelance', 'UPI', 'Small web project'),
      tx('expense', 850, day(2), 'food', 'UPI', 'Groceries'), tx('expense', 420, day(3), 'transport', 'Cash', 'Bus pass'), tx('expense', 599, day(4), 'study', 'Card', 'Programming book'),
      tx('expense', 250, day(5), 'fun', 'UPI', 'Movie'), tx('expense', 180, today, 'food', 'Cash', 'Canteen lunch')
    ]);

    if (!(store.get('budget') || {}).monthly) store.set('budget', { monthly: 4000, sample: true }, { silent: true });

    /* ---- one upcoming reminder (tomorrow 09:00) ---- */
    const at = util.atDateTime(d(1), '09:00').getTime();
    append('reminders', [{ id: util.uid('rem'), sample: true, createdAt: now, linkedKey: '', title: S + 'Start morning revision', description: '', repeat: 'none', baseAt: at, nextAt: at, status: 'active', tone: '', taskId: '', lastFired: 0 }]);

    store.saveSettings({ onboardingDismissed: true });
    FF.activity.log('Loaded sample data', 'cyan');
    FF.bus.emit('data:reset', { reason: 'sample-loaded' });
  }

  FF.sample = { load };
})();
