/* ==========================================================================
   FocusFlow — notes.js
   Quick notes & ideas: card grid + dedicated editor, pin, tags, search,
   debounced autosave with visible status, flush on navigation / page leave.
   A new note is only stored once it has content, so empty drafts vanish.
   ========================================================================== */
(function () {
  'use strict';
  const FF = window.FF;
  const { el, clear, util } = FF;
  const store = FF.store;

  const ui = { q: '', tag: '' };
  const load = () => store.get('notes');
  const AUTOSAVE_MS = 700;

  function saveNote(note) {
    return store.update('notes', (list) => {
      const i = list.findIndex((n) => n.id === note.id);
      if (i >= 0) list[i] = note; else list.push(note);
    });
  }
  function blank() {
    const now = new Date().toISOString();
    return { id: util.uid('note'), title: '', body: '', tag: '', pinned: false, createdAt: now, updatedAt: now };
  }
  function quickAdd(text) {
    const t = String(text || '').trim();
    if (!t) return false;
    const n = blank();
    const [first, ...rest] = t.split('\n');
    n.title = first.slice(0, 80);
    n.body = rest.join('\n').trim() || (first.length > 80 ? t : '');
    n.tag = 'quick';
    const ok = saveNote(n);
    if (ok) FF.activity.log('Captured a quick note', 'violet');
    return ok;
  }

  function render(root, ctx) {
    let current = null;        // note being edited (object copy)
    let dirty = false;
    let saveFailed = false;
    const status = el('span', { class: 'save-status', role: 'status', 'aria-live': 'polite' });

    const grid = el('div', { class: 'card-grid notes-grid' });
    const editor = el('div', { class: 'card note-editor', 'data-accent': 'violet', hidden: true });
    const layout = el('div', { class: 'notes-layout' });
    const search = el('input', { type: 'search', placeholder: 'Search notes…', 'aria-label': 'Search notes', value: ui.q });
    const tagSel = el('select', { 'aria-label': 'Filter by tag' });

    /* ---------------------------- autosave */
    function setStatus(kind) {
      status.dataset.kind = kind;
      status.textContent = { saved: 'All changes saved', saving: 'Saving…', dirty: 'Unsaved changes', failed: 'Could not save — storage unavailable', '': '' }[kind] || '';
    }
    const autosave = util.debounce(flush, AUTOSAVE_MS);
    function flush() {
      autosave.cancel();
      if (!current || !dirty) return true;
      const empty = !current.title.trim() && !current.body.trim();
      const exists = !!store.find('notes', current.id);
      if (empty && !exists) { dirty = false; setStatus(''); return true; }   // never persist an empty draft
      current.updatedAt = new Date().toISOString();
      const ok = saveNote({ ...current });
      saveFailed = !ok;
      dirty = !ok;
      setStatus(ok ? 'saved' : 'failed');
      if (ok) metaLine.textContent = metaText();
      return ok;
    }
    const metaText = () => current ? 'Created ' + util.formatDateTime(new Date(current.createdAt)) + ' · Updated ' + util.formatDateTime(new Date(current.updatedAt)) : '';
    let metaLine;

    async function leaveEditor() {
      if (!flush() && saveFailed) {
        const discard = await FF.ui.confirm({ title: 'Discard unsaved note?', message: 'This note could not be saved because browser storage is unavailable. Closing will lose your latest changes.', confirmText: 'Discard changes', cancelText: 'Keep editing', danger: true });
        if (!discard) return false;
      }
      current = null; dirty = false; saveFailed = false;
      editor.hidden = true; layout.classList.remove('is-editing');
      paintGrid();
      return true;
    }

    async function openNote(note) {
      if (current && current.id !== note.id) { if (!(await leaveEditor())) return; }
      current = { ...note }; dirty = false; saveFailed = false;
      paintEditor();
      layout.classList.add('is-editing');
      editor.hidden = false;
      editor.querySelector('input[name="title"]').focus();
    }

    function paintEditor() {
      clear(editor);
      const titleIn = el('input', { type: 'text', name: 'title', id: 'noteTitle', maxlength: 120, placeholder: 'Note title', 'aria-label': 'Note title', value: current.title });
      const body = el('textarea', { name: 'body', id: 'noteBody', placeholder: 'Write your idea, summary or reminder…', 'aria-label': 'Note body', rows: 12 });
      body.value = current.body;
      const tagIn = el('input', { type: 'text', name: 'tag', maxlength: 24, placeholder: 'tag (optional)', 'aria-label': 'Tag', value: current.tag });
      const onInput = () => {
        current.title = titleIn.value; current.body = body.value; current.tag = tagIn.value.trim().toLowerCase();
        dirty = true; setStatus('dirty'); autosave();
      };
      [titleIn, body, tagIn].forEach((i) => i.addEventListener('input', onInput));
      const pinBtn = el('button', { type: 'button', class: 'btn btn-sm', 'aria-pressed': String(!!current.pinned), onclick: () => {
        current.pinned = !current.pinned; pinBtn.setAttribute('aria-pressed', String(current.pinned)); pinBtn.lastChild.textContent = current.pinned ? 'Pinned' : 'Pin'; dirty = true; flush();
      } }, FF.ui.icon('pin'), el('span', { text: current.pinned ? 'Pinned' : 'Pin' }));
      metaLine = el('p', { class: 'small muted', text: metaText() });
      editor.append(
        el('div', { class: 'spread' }, el('button', { type: 'button', class: 'btn btn-ghost btn-sm back-btn', onclick: leaveEditor }, FF.ui.icon('chevL'), 'All notes'), status),
        titleIn, body,
        el('div', { class: 'row' }, tagIn, pinBtn,
          el('button', { type: 'button', class: 'btn btn-danger btn-sm', onclick: async () => {
            const exists = !!store.find('notes', current.id);
            if (exists) {
              const ok = await FF.ui.confirm({ title: 'Delete this note?', message: 'This note will be permanently deleted.', confirmText: 'Delete note', danger: true });
              if (!ok) return;
              store.remove('notes', current.id);
            }
            dirty = false; autosave.cancel(); current = null; editor.hidden = true; layout.classList.remove('is-editing'); paintGrid();
          } }, FF.ui.icon('trash'), 'Delete')),
        metaLine);
      setStatus(store.find('notes', current.id) ? 'saved' : '');
    }

    /* ---------------------------- list */
    function paintGrid() {
      const all = load();
      const tags = [...new Set(all.map((n) => n.tag).filter(Boolean))].sort();
      const prev = ui.tag;
      clear(tagSel);
      tagSel.append(el('option', { value: '', text: 'All tags' }), tags.map((t) => el('option', { value: t, text: '#' + t })));
      ui.tag = tags.includes(prev) ? prev : '';
      tagSel.value = ui.tag;
      let list = all.filter((n) => util.matches(ui.q, n.title, n.body, n.tag) && (!ui.tag || n.tag === ui.tag));
      list = util.sortBy(list, (n) => (n.pinned ? 0 : 1), (n) => -new Date(n.updatedAt).getTime());
      clear(grid);
      if (!all.length) grid.appendChild(el('div', { class: 'empty card', 'data-accent': 'violet' }, el('div', { class: 'empty-icon' }, FF.ui.icon('note')), el('h3', { text: 'No notes yet' }), el('p', { text: 'Capture ideas, snippets and reminders. Notes autosave as you type.' }),
        el('button', { type: 'button', class: 'btn btn-primary', onclick: newNote }, FF.ui.icon('plus'), 'Write a note')));
      else if (!list.length) grid.appendChild(el('div', { class: 'empty card' }, el('h3', { text: 'No notes match your search' })));
      list.forEach((n) => {
        const open = () => openNote(n);
        const card = el('article', { class: 'card tilt-card note-card' + (current && current.id === n.id ? ' is-open' : ''), 'data-accent': 'violet' },
          el('div', { class: 'spread' }, el('h3', { class: 'wrap-text', text: n.title || 'Untitled note' }), n.pinned ? el('span', { class: 'pin-ico', title: 'Pinned' }, FF.ui.icon('pin')) : null),
          el('p', { class: 'note-snippet wrap-text', text: n.body.slice(0, 220) }),
          el('div', { class: 'spread small muted' }, n.tag ? el('span', { class: 'badge', 'data-accent': 'violet', text: '#' + n.tag }) : el('span'), el('span', { text: util.formatDate(util.dateOf(n.updatedAt), 'short') })),
          el('button', { type: 'button', class: 'card-hit', 'aria-label': 'Open note: ' + (n.title || 'Untitled note'), onclick: open }));
        grid.appendChild(card);
      });
    }

    function newNote() { openNote(blank()); }

    search.addEventListener('input', () => { ui.q = search.value; paintGrid(); });
    tagSel.addEventListener('change', () => { ui.tag = tagSel.value; paintGrid(); });

    root.append(
      el('div', { class: 'page-head' }, el('div', null, el('div', { class: 'hud-label', text: 'Idea vault' }), el('h2', { class: 'page-title', text: 'Quick Notes' }), el('p', { text: 'Autosaves as you type. Stored only in this browser.' })),
        el('button', { type: 'button', class: 'btn btn-primary', onclick: newNote }, FF.ui.icon('plus'), 'New note')),
      el('div', { class: 'card filters' }, el('div', { class: 'search' }, FF.ui.icon('search'), search), el('div', { class: 'filter-selects' }, tagSel)),
      layout);
    layout.append(el('div', { class: 'notes-list' }, grid), editor);
    paintGrid();

    const offLeave = FF.bus.on('app:before-leave', flush);
    ctx.watch(['notes'], () => { if (!current || !dirty) paintGrid(); });
    if (ctx.params.get('new')) newNote();
    return () => { flush(); offLeave(); autosave.cancel(); };
  }

  FF.notes = { list: load, quickAdd };
  FF.registerView({ id: 'notes', label: 'Notes', title: 'Quick Notes', crumb: 'Idea vault', icon: 'note', accent: 'violet', render });
})();
