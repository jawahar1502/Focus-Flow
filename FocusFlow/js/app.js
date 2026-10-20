/* ==========================================================================
   FocusFlow — app.js
   Application shell: view registry + hash router, sidebar/drawer, topbar,
   notification bell, profile menu, boot sequence and global error toasts.

   Modules register themselves:
     FF.registerView({ id, label, title, icon, accent, order, render(root, ctx) })
     render may return a cleanup function. ctx gives auto-cleaned helpers:
       ctx.watch(['tasks'], fn)   re-run fn when those collections change
       ctx.every(fn, ms)          interval cleared on navigation
       ctx.on(evt, fn)            event-bus subscription cleared on navigation
   Background services (reminder engine, timer engine) use FF.onBoot(fn).
   ========================================================================== */
(function () {
  'use strict';
  const FF = window.FF;
  const { el, clear, util } = FF;

  const NAV_ORDER = ['dashboard', 'tasks', 'reminders', 'timer', 'timetable', 'habits', 'analytics', 'goals', 'notes', 'journal', 'expenses', 'settings'];
  const views = new Map();
  const bootHooks = [];
  let currentUser = null;
  let current = null;       // { def, cleanup, disposers }
  let sidebarEl, viewEl;

  FF.registerView = (def) => views.set(def.id, def);
  FF.onBoot = (fn) => bootHooks.push(fn);
  FF.user = () => currentUser;
  FF.navigate = (id) => { window.location.hash = '#/' + id; };

  /* --------------------------------------------------------------- Router */
  function parseHash() {
    const raw = window.location.hash.replace(/^#\/?/, '');
    const [id, query] = raw.split('?');
    return { id: id || 'dashboard', params: new URLSearchParams(query || '') };
  }

  function makeCtx() {
    const disposers = [];
    const add = (fn) => { disposers.push(fn); return fn; };
    return {
      disposers,
      user: currentUser,
      params: parseHash().params,
      watch(names, fn) {
        const set = new Set(Array.isArray(names) ? names : [names]);
        let t = null;
        const run = () => { if (t) return; t = setTimeout(() => { t = null; fn(); }, 25); };
        add(FF.bus.on('data:changed', (e) => { if (set.has(e.name)) run(); }));
        add(FF.bus.on('data:reset', run));
        add(() => clearTimeout(t));
      },
      every(fn, ms) { const id = setInterval(fn, ms); add(() => clearInterval(id)); return id; },
      on(evt, fn) { add(FF.bus.on(evt, fn)); },
      onCleanup(fn) { add(fn); }
    };
  }

  function teardown() {
    if (!current) return;
    try { if (typeof current.cleanup === 'function') current.cleanup(); } catch (e) { console.error('[FocusFlow] view cleanup failed:', e); }
    current.ctx.disposers.splice(0).forEach((d) => { try { d(); } catch (e) { /* ignore */ } });
    current = null;
  }

  function route() {
    const { id } = parseHash();
    const def = views.get(id) || views.get('dashboard');
    if (!def) return;
    teardown();
    clear(viewEl);
    const ctx = makeCtx();
    let cleanup = null;
    try {
      const out = def.render(viewEl, ctx);
      cleanup = typeof out === 'function' ? out : (out && out.destroy) || null;
    } catch (err) {
      console.error('[FocusFlow] failed to render view "' + def.id + '":', err);
      viewEl.appendChild(el('div', { class: 'card', 'data-accent': 'flame' },
        el('h2', { text: 'This section could not be displayed' }),
        el('p', { class: 'muted', style: { marginTop: '8px' }, text: 'An unexpected error occurred. Your saved data was not changed. Try reloading the page.' })));
    }
    current = { def, cleanup, ctx };
    document.getElementById('pageTitle').textContent = def.title || def.label;
    document.getElementById('crumb').textContent = def.crumb || 'Mission control';
    document.title = (def.title || def.label) + ' — FocusFlow · JARVIS Edition';
    document.querySelectorAll('#navList a').forEach((a) => {
      if (a.dataset.view === def.id) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    closeDrawer();
    window.scrollTo(0, 0);
    viewEl.focus({ preventScroll: true });
  }

  /* ------------------------------------------------------------ Sidebar */
  function buildNav() {
    const list = document.getElementById('navList');
    clear(list);
    const ordered = [...views.values()].sort((a, b) => NAV_ORDER.indexOf(a.id) - NAV_ORDER.indexOf(b.id));
    ordered.forEach((def) => {
      const a = el('a', { href: '#/' + def.id, 'data-view': def.id, 'data-accent': def.accent || 'cyan' },
        el('span', { class: 'nav-ico' }, FF.ui.icon(def.icon || 'grid')), el('span', { class: 'nav-label', text: def.label }));
      list.appendChild(el('li', null, a));
    });
    list.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      const links = [...list.querySelectorAll('a')];
      const i = links.indexOf(document.activeElement);
      if (i < 0) return;
      e.preventDefault();
      links[(i + (e.key === 'ArrowDown' ? 1 : -1) + links.length) % links.length].focus();
    });
  }

  const mobileMq = window.matchMedia('(max-width: 900px)');
  function syncDrawer() {
    const open = document.body.classList.contains('nav-open');
    const hidden = mobileMq.matches && !open;
    if ('inert' in sidebarEl) sidebarEl.inert = hidden; // keep closed drawer out of the tab order
    sidebarEl.setAttribute('aria-hidden', hidden ? 'true' : 'false');
    document.getElementById('menuBtn').setAttribute('aria-expanded', String(open));
    document.getElementById('scrim').hidden = !open;
  }
  function openDrawer() { document.body.classList.add('nav-open'); syncDrawer(); const a = sidebarEl.querySelector('a[aria-current="page"]') || sidebarEl.querySelector('a'); if (a) a.focus(); }
  function closeDrawer(returnFocus) {
    if (!document.body.classList.contains('nav-open')) { syncDrawer(); return; }
    document.body.classList.remove('nav-open');
    syncDrawer();
    if (returnFocus) document.getElementById('menuBtn').focus();
  }

  /* ------------------------------------------------------ Popover menus */
  function attachPopover(btn, pop, onOpen) {
    const close = (focusBtn) => { pop.hidden = true; btn.setAttribute('aria-expanded', 'false'); if (focusBtn) btn.focus(); };
    const open = () => {
      document.querySelectorAll('.popover').forEach((p) => { if (p !== pop) p.hidden = true; });
      document.querySelectorAll('[aria-haspopup]').forEach((b) => { if (b !== btn) b.setAttribute('aria-expanded', 'false'); });
      if (onOpen) onOpen();
      pop.hidden = false; btn.setAttribute('aria-expanded', 'true');
      const first = pop.querySelector('a, button, input'); if (first) first.focus();
    };
    btn.addEventListener('click', (e) => { e.stopPropagation(); pop.hidden ? open() : close(); });
    pop.addEventListener('click', (e) => { if (e.target.closest('a, .menu-item:not(label)')) close(); });
    pop.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(true); } });
    document.addEventListener('click', (e) => { if (!pop.hidden && !pop.contains(e.target) && e.target !== btn) close(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !pop.hidden) close(true); });
    return { close };
  }

  /* ------------------------------------------------------ Notifications */
  function collectAlerts() {
    const items = [];
    if (FF.tasks) {
      FF.tasks.overdue().slice(0, 6).forEach((t) => items.push({
        icon: 'alert', accent: 'flame', title: t.title, sub: 'Overdue · was due ' + util.formatDate(t.dueDate, 'short') + (t.dueTime ? ' ' + util.formatTime(t.dueTime) : ''), href: '#/tasks', kind: 'overdue'
      }));
    }
    if (FF.reminders) {
      FF.reminders.missed().slice(0, 6).forEach((r) => items.push({
        icon: 'bell', accent: 'red', title: r.title, sub: 'Missed reminder · ' + util.formatDateTime(new Date(r.nextAt)), href: '#/reminders', kind: 'missed'
      }));
      FF.reminders.soon(60).slice(0, 4).forEach((r) => items.push({
        icon: 'clock', accent: 'cyan', title: r.title, sub: 'Coming up ' + util.relative(r.nextAt - Date.now()), href: '#/reminders', kind: 'soon'
      }));
    }
    return items;
  }

  function updateBell() {
    const items = collectAlerts();
    const n = items.filter((i) => i.kind !== 'soon').length;
    const badge = document.getElementById('bellCount');
    badge.hidden = n === 0;
    badge.textContent = n > 9 ? '9+' : String(n);
    document.getElementById('bellBtn').setAttribute('aria-label', n ? 'Notifications: ' + util.plural(n, 'alert') : 'Notifications: none');
    return items;
  }
  function renderBellList() {
    const list = document.getElementById('bellList');
    clear(list);
    const items = updateBell();
    if (!items.length) {
      list.appendChild(el('div', { class: 'popover-empty muted small', text: 'All clear — no overdue tasks or missed reminders.' }));
      return;
    }
    items.forEach((i) => list.appendChild(el('a', { class: 'alert-item', href: i.href, 'data-accent': i.accent },
      el('span', { class: 'alert-ico' }, FF.ui.icon(i.icon)),
      el('span', { class: 'grow' }, el('b', { class: 'wrap-text', text: i.title }), el('span', { class: 'small muted', style: { display: 'block' }, text: i.sub })))));
  }

  /* ---------------------------------------------------------- User chrome */
  function paintUser() {
    const u = currentUser;
    const initial = (u.name.trim()[0] || '?').toUpperCase();
    ['sideAvatar', 'topAvatar'].forEach((id) => { document.getElementById(id).textContent = initial; });
    ['sideName', 'topName', 'menuName'].forEach((id) => { document.getElementById(id).textContent = u.name; });
    document.getElementById('menuEmail').textContent = u.email;
  }
  FF.refreshUser = () => {
    const fresh = FF.auth.currentUser();
    if (fresh) { currentUser = fresh; paintUser(); }
  };

  function logout() {
    FF.bus.emit('app:before-leave');
    FF.auth.logout(true);
  }

  /* ------------------------------------------------------------------ Boot */
  FF.start = function start() {
    currentUser = FF.auth.requireAuth();
    if (!currentUser) return;

    FF.ui.init();
    sidebarEl = document.getElementById('sidebar');
    viewEl = document.getElementById('view');

    // Static chrome icons
    document.getElementById('brandEmblem').appendChild(FF.reactor.emblem(38));
    document.getElementById('menuBtn').appendChild(FF.ui.icon('menu'));
    document.getElementById('sideLogout').appendChild(FF.ui.icon('logout'));
    document.getElementById('quickAddIcon').appendChild(FF.ui.icon('plus'));
    document.getElementById('bellIcon').appendChild(FF.ui.icon('bell'));
    document.getElementById('menuSettings').append(FF.ui.icon('settings'), ' Settings');
    document.getElementById('menuLogout').append(FF.ui.icon('logout'), ' Log out');

    paintUser();
    buildNav();
    syncDrawer();

    document.getElementById('menuBtn').addEventListener('click', () => (document.body.classList.contains('nav-open') ? closeDrawer(true) : openDrawer()));
    document.getElementById('scrim').addEventListener('click', () => closeDrawer(true));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && document.body.classList.contains('nav-open')) closeDrawer(true); });
    (mobileMq.addEventListener ? mobileMq.addEventListener.bind(mobileMq, 'change') : mobileMq.addListener.bind(mobileMq))(() => { document.body.classList.remove('nav-open'); syncDrawer(); });

    document.getElementById('sideLogout').addEventListener('click', logout);
    document.getElementById('menuLogout').addEventListener('click', logout);
    document.getElementById('quickAdd').addEventListener('click', () => { if (FF.tasks) FF.tasks.openForm(); });

    attachPopover(document.getElementById('bellBtn'), document.getElementById('bellMenu'), renderBellList);
    attachPopover(document.getElementById('profileBtn'), document.getElementById('profileMenu'));

    const motionBox = document.getElementById('menuMotion');
    motionBox.checked = FF.ui.motionReduced();
    motionBox.addEventListener('change', () => { FF.prefs.set({ reduceMotion: motionBox.checked }); FF.ui.applyMotion(); });

    // Focus-timer pill in the sidebar
    const pill = document.getElementById('focusPill');
    FF.bus.on('timer:tick', (t) => {
      const s = t.state;
      const show = s.status === 'running' || s.status === 'paused';
      pill.hidden = !show;
      if (show) {
        document.getElementById('focusPillTime').textContent = util.formatClock(t.remainingMs);
        document.getElementById('focusPillLabel').textContent = (s.mode === 'focus' ? 'Focus' : 'Break') + (s.status === 'paused' ? ' · paused' : '');
      }
    });

    // Global storage problems
    FF.bus.on('storage:corrupt', (e) => FF.ui.toast('Some saved data (' + (e.label || 'unknown') + ') could not be read. A backup copy was kept in your browser; the section starts empty.', 'warn', 9000));
    FF.bus.on('storage:error', () => FF.ui.toast('Could not save — browser storage may be full or blocked.', 'error', 8000));

    // Alerts badge
    FF.bus.on('data:changed', (e) => { if (e.name === 'tasks' || e.name === 'reminders') updateBell(); });
    FF.bus.on('data:reset', updateBell);
    FF.bus.on('user:changed', FF.refreshUser);

    // Flush pending edits when leaving
    window.addEventListener('pagehide', () => FF.bus.emit('app:before-leave'));
    window.addEventListener('beforeunload', () => FF.bus.emit('app:before-leave'));

    bootHooks.forEach((fn) => { try { fn(currentUser); } catch (e) { console.error('[FocusFlow] boot hook failed:', e); } });
    setInterval(updateBell, 30000);
    updateBell();

    window.addEventListener('hashchange', route);
    route();
  };
})();
