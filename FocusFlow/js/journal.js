/* ==========================================================================
   FocusFlow — journal.js
   Private daily journal: one entry per date, calendar navigation, search,
   mood summary, reflection prompts, debounced autosave.
   Stored unencrypted in this browser's localStorage (stated in the UI).
   ========================================================================== */
(function () {
  'use strict';
  const FF = window.FF;
  const { el, clear, util } = FF;
  const store = FF.store;

  const MOODS = [
    { v: 1, label: 'Rough', glyph: '😖' }, { v: 2, label: 'Low', glyph: '😕' }, { v: 3, label: 'Okay', glyph: '😐' },
    { v: 4, label: 'Good', glyph: '🙂' }, { v: 5, label: 'Great', glyph: '😄' }
  ];
  const PROMPTS = [
    'What was the most important thing you finished today?', 'What drained your energy, and what gave you energy?',
    'What is one thing you understood better today than yesterday?', 'Which decision today would you make differently?',
    'What are you grateful for right now?', 'What is the single most important task for tomorrow?',
    'Where did your time actually go today?', 'What small win deserves recognition?'
  ];
  const promptFor = (date) => PROMPTS[Math.abs(util.daysBetween('2024-01-01', date)) % PROMPTS.length];
  const load = () => store.get('journal');
  const entryOn = (date) => load().find((e) => e.date === date) || null;
  const FIELDS = ['title', 'reflection', 'accomplishments', 'lessons', 'improve'];
  const hasContent = (e) => FIELDS.some((f) => (e[f] || '').trim()) || !!e.mood;

  const ui = { month: util.monthKey(util.today()), date: util.today(), q: '' };

  function save(entry) {
    return store.update('journal', (list) => {
      const i = list.findIndex((e) => e.date === entry.date);   // enforce one entry per date
      if (i >= 0) list[i] = entry; else list.push(entry);
    });
  }

  function render(root, ctx) {
    let draft = null, dirty = false, failed = false;
    const status = el('span', { class: 'save-status', role: 'status', 'aria-live': 'polite' });
    const calBox = el('div', { class: 'cal' });
    const form = el('div', { class: 'stack journal-form' });
    const moodBox = el('div', { class: 'card', 'data-accent': 'violet' });
    const resultsBox = el('div', { class: 'stack' });
    const search = el('input', { type: 'search', placeholder: 'Search all entries…', 'aria-label': 'Search journal entries', value: ui.q });

    const setStatus = (k) => { status.textContent = { saved: 'All changes saved', saving: 'Saving…', dirty: 'Unsaved changes', failed: 'Could not save — storage unavailable', '': '' }[k] || ''; };
    const autosave = util.debounce(flush, 800);
    function flush() {
      autosave.cancel();
      if (!draft || !dirty) return true;
      const exists = !!entryOn(draft.date);
      if (!hasContent(draft) && !exists) { dirty = false; setStatus(''); return true; }
      draft.updatedAt = new Date().toISOString();
      const ok = save({ ...draft });
      dirty = !ok; failed = !ok;
      setStatus(ok ? 'saved' : 'failed');
      return ok;
    }

    async function selectDate(date) {
      if (date === ui.date && draft) return;
      if (!flush() && failed) {
        const ok = await FF.ui.confirm({ title: 'Discard unsaved entry?', message: 'This entry could not be saved (browser storage unavailable). Switching dates will lose it.', confirmText: 'Discard', cancelText: 'Stay', danger: true });
        if (!ok) return;
      }
      ui.date = date; ui.month = util.monthKey(date);
      loadDraft(); paintCal(); paintForm();
    }
    function loadDraft() {
      const ex = entryOn(ui.date);
      const now = new Date().toISOString();
      draft = ex ? { ...ex } : { id: util.uid('jrnl'), date: ui.date, title: '', reflection: '', accomplishments: '', lessons: '', improve: '', mood: '', createdAt: now, updatedAt: now };
      dirty = false; failed = false;
    }

    /* ---------------- calendar */
    function paintCal() {
      clear(calBox);
      const entries = new Map(load().map((e) => [e.date, e]));
      const [y, m] = ui.month.split('-').map(Number);
      const first = ui.month + '-01';
      const offset = util.weekdayIndex(first);
      const today = util.today();
      calBox.append(
        el('div', { class: 'spread cal-head' },
          el('button', { type: 'button', class: 'btn btn-icon btn-sm', 'aria-label': 'Previous month', onclick: () => { ui.month = util.monthShift(ui.month, -1); paintCal(); paintMood(); } }, FF.ui.icon('chevL')),
          el('strong', { 'aria-live': 'polite', text: util.formatDate(first, 'month') }),
          el('button', { type: 'button', class: 'btn btn-icon btn-sm', 'aria-label': 'Next month', onclick: () => { ui.month = util.monthShift(ui.month, 1); paintCal(); paintMood(); } }, FF.ui.icon('chevR'))));
      const grid = el('div', { class: 'cal-grid', role: 'grid', 'aria-label': util.formatDate(first, 'month') });
      util.WEEKDAYS_SHORT.forEach((d) => grid.appendChild(el('div', { class: 'cal-dow', role: 'columnheader', text: d.slice(0, 2), 'aria-label': d })));
      for (let i = 0; i < offset; i++) grid.appendChild(el('div', { class: 'cal-pad', 'aria-hidden': 'true' }));
      for (let d = 1; d <= util.daysInMonth(ui.month); d++) {
        const date = ui.month + '-' + util.pad(d);
        const e = entries.get(date);
        const mood = e && e.mood ? MOODS[e.mood - 1] : null;
        const future = date > today;
        grid.appendChild(el('button', {
          type: 'button', role: 'gridcell', class: 'cal-day' + (date === ui.date ? ' sel' : '') + (date === today ? ' today' : '') + (e ? ' has' : ''),
          'aria-label': util.formatDate(date, 'full') + (e ? ', entry written' + (mood ? ', mood ' + mood.label : '') : ', no entry'), 'aria-pressed': String(date === ui.date),
          disabled: future ? true : null, onclick: () => selectDate(date)
        }, el('span', { text: String(d) }), e ? el('i', { class: 'cal-dot' }) : null));
      }
      calBox.appendChild(grid);
      void y; void m;
    }

    /* ---------------- form */
    function paintForm() {
      clear(form);
      const date = ui.date;
      const mk = (name, label, rows, ph) => {
        const id = 'jr_' + name;
        const t = el('textarea', { id, name, rows, placeholder: ph || '', maxlength: 5000 });
        t.value = draft[name] || '';
        t.addEventListener('input', () => { draft[name] = t.value; dirty = true; setStatus('dirty'); autosave(); });
        return el('div', { class: 'field' }, el('label', { for: id, text: label }), t);
      };
      const titleIn = el('input', { type: 'text', id: 'jr_title', maxlength: 100, placeholder: 'Give the day a title', value: draft.title });
      titleIn.addEventListener('input', () => { draft.title = titleIn.value; dirty = true; setStatus('dirty'); autosave(); });
      const moods = el('div', { class: 'mood-row', role: 'radiogroup', 'aria-label': 'Mood' }, MOODS.map((m) => {
        const b = el('button', { type: 'button', class: 'mood-btn', role: 'radio', 'aria-checked': String(draft.mood === m.v), 'aria-label': m.label, onclick: () => {
          draft.mood = draft.mood === m.v ? '' : m.v; dirty = true; flush(); paintForm(); paintCal(); paintMood();
        } }, el('span', { 'aria-hidden': 'true', text: m.glyph }), el('small', { text: m.label }));
        return b;
      }));
      const exists = !!entryOn(date);
      form.append(
        el('div', { class: 'spread' }, el('div', null, el('div', { class: 'hud-label', text: date === util.today() ? 'Today' : 'Entry' }), el('h3', { text: util.formatDate(date, 'full') })), status),
        el('div', { class: 'notice', 'data-accent': 'violet' }, FF.ui.icon('sparkle'), el('span', null, el('strong', null, 'Prompt: '), promptFor(date))),
        el('div', { class: 'field' }, el('label', { for: 'jr_title', text: 'Title' }), titleIn),
        el('div', { class: 'field' }, el('span', { class: 'field-label', text: 'Mood' }), moods),
        mk('reflection', 'Daily reflection', 5, 'How was your day?'),
        mk('accomplishments', 'Accomplishments', 3, 'What did you get done?'),
        mk('lessons', 'Lessons learned', 3, 'What did you learn?'),
        mk('improve', 'What to improve', 3, 'What will you do better tomorrow?'),
        el('div', { class: 'row' },
          exists ? el('button', { type: 'button', class: 'btn btn-danger btn-sm', onclick: async () => {
            const ok = await FF.ui.confirm({ title: 'Delete this entry?', message: 'The journal entry for ' + util.formatDate(date, 'long') + ' will be permanently deleted.', confirmText: 'Delete entry', danger: true });
            if (!ok) return;
            autosave.cancel(); dirty = false;
            store.update('journal', (list) => list.filter((e) => e.date !== date));
            loadDraft(); paintForm(); paintCal(); paintMood();
          } }, FF.ui.icon('trash'), 'Delete entry') : null,
          el('span', { class: 'small muted', text: 'Saved only in this browser. Local storage is not encrypted.' })));
      setStatus(exists ? 'saved' : '');
    }

    /* ---------------- mood summary */
    function paintMood() {
      clear(moodBox);
      const inMonth = load().filter((e) => e.date.startsWith(ui.month) && e.mood);
      const total = load().filter((e) => e.date.startsWith(ui.month)).length;
      moodBox.append(el('div', { class: 'card-title' }, el('h3', { text: 'Mood summary' }), el('span', { class: 'muted small', text: util.formatDate(ui.month + '-01', 'month') })));
      if (!inMonth.length) { moodBox.appendChild(el('div', { class: 'empty small', text: total ? 'No moods logged this month.' : 'No entries this month yet.' })); return; }
      const avg = util.sum(inMonth, (e) => e.mood) / inMonth.length;
      moodBox.appendChild(el('p', { class: 'small', text: 'Average mood ' + avg.toFixed(1) + ' / 5 (' + MOODS[Math.round(avg) - 1].label + ') across ' + util.plural(inMonth.length, 'entry', 'entries') + '.' }));
      const max = Math.max(...MOODS.map((m) => inMonth.filter((e) => e.mood === m.v).length));
      MOODS.slice().reverse().forEach((m) => {
        const n = inMonth.filter((e) => e.mood === m.v).length;
        moodBox.appendChild(el('div', { class: 'mood-line' }, el('span', { 'aria-hidden': 'true', text: m.glyph }), el('span', { class: 'small', text: m.label }),
          el('div', { class: 'bar', 'data-accent': 'violet' }, el('i', { style: { width: (max ? (n / max) * 100 : 0) + '%' } })), el('span', { class: 'num small', text: String(n) })));
      });
    }

    /* ---------------- search */
    function paintSearch() {
      clear(resultsBox);
      const q = ui.q.trim();
      if (!q) return;
      const hits = util.sortBy(load().filter((e) => util.matches(q, e.title, e.reflection, e.accomplishments, e.lessons, e.improve)), (e) => e.date).reverse();
      resultsBox.appendChild(el('h3', { class: 'section-h', text: 'Search results (' + hits.length + ')' }));
      if (!hits.length) resultsBox.appendChild(el('div', { class: 'empty small', text: 'No entries match "' + q + '".' }));
      const ul = el('ul', { class: 'compact-list' });
      hits.slice(0, 20).forEach((e) => ul.appendChild(el('li', null,
        el('span', { class: 'compact-time', text: util.formatDate(e.date, 'short') }),
        el('div', { class: 'compact-main' }, el('b', { text: e.title || 'Untitled entry' }), el('span', { class: 'wrap-text', text: (e.reflection || e.accomplishments || e.lessons || e.improve || '').slice(0, 110) })),
        el('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: () => selectDate(e.date) }, 'Open'))));
      resultsBox.appendChild(ul);
    }
    search.addEventListener('input', () => { ui.q = search.value; paintSearch(); });

    root.append(
      el('div', { class: 'page-head' }, el('div', null, el('div', { class: 'hud-label', text: 'Private log' }), el('h2', { class: 'page-title', text: 'Daily Journal' }), el('p', { text: 'Reflect once a day. Entries stay on this device.' })),
        el('button', { type: 'button', class: 'btn', onclick: () => selectDate(util.today()) }, FF.ui.icon('calendar'), 'Jump to today')),
      el('div', { class: 'notice', 'data-accent': 'flame', style: { marginBottom: '16px' } }, FF.ui.icon('shield'), el('span', null, el('strong', null, 'Privacy: '), 'journal entries live in this browser\'s localStorage. It is not encrypted, so anyone using this browser profile could read it. Don\'t store anything you need to keep secret.')),
      el('div', { class: 'grid-12' },
        el('div', { class: 'span-4 stack' }, el('div', { class: 'card', 'data-accent': 'violet' }, calBox), moodBox),
        el('div', { class: 'span-8 stack' }, el('div', { class: 'card', 'data-accent': 'violet' }, el('div', { class: 'search', style: { marginBottom: '14px' } }, FF.ui.icon('search'), search), resultsBox, form))));

    loadDraft(); paintCal(); paintForm(); paintMood(); paintSearch();
    const offLeave = FF.bus.on('app:before-leave', flush);
    ctx.watch(['journal'], () => { paintCal(); paintMood(); paintSearch(); });
    return () => { flush(); offLeave(); autosave.cancel(); };
  }

  FF.journal = { list: load, entryOn, MOODS };
  FF.registerView({ id: 'journal', label: 'Daily Journal', title: 'Daily Journal', crumb: 'Private log', icon: 'book', accent: 'violet', render });
})();
