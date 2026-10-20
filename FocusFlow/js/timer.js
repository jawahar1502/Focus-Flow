/* ==========================================================================
   FocusFlow — timer.js
   Pomodoro focus timer. Time is derived from absolute timestamps (endsAt),
   never from counting ticks, so it stays accurate in background tabs and
   survives a page refresh. Only fully elapsed focus sessions are counted.
   ========================================================================== */
(function () {
  'use strict';
  const FF = window.FF;
  const { el, clear, util } = FF;
  const store = FF.store;

  const MODES = {
    focus: { label: 'Focus', accent: 'cyan' },
    short: { label: 'Short break', accent: 'teal' },
    long: { label: 'Long break', accent: 'green' }
  };

  let state = null;
  let interval = null;

  const cfg = () => store.settings().timer;
  const durationMs = (mode) => Math.max(1, Number(cfg()[mode]) || 25) * 60000;
  const idleState = (mode, prev) => ({
    mode, status: 'idle', durationMs: durationMs(mode), remainingMs: durationMs(mode), startedAt: 0, endsAt: 0,
    taskId: prev ? prev.taskId || '' : '', subject: prev ? prev.subject || '' : '', cycle: prev ? prev.cycle || 0 : 0, sessionStart: 0
  });

  function persist() { store.set('timerState', state, { silent: true }); }
  function snapshot() { return { ...state }; }
  function remaining(now = Date.now()) {
    if (state.status === 'running') return Math.max(0, state.endsAt - now);
    return state.remainingMs;
  }

  function emitState() { FF.bus.emit('timer:state', snapshot()); emitTick(); }
  function emitTick() { FF.bus.emit('timer:tick', { state: snapshot(), remainingMs: remaining() }); }

  /* ---------------------------------------------------------------- History */
  function record(completed, plannedMs, elapsedMs, endedAt) {
    if (state.mode !== 'focus') return;
    const actualMin = Math.round(elapsedMs / 60000);
    if (!completed && actualMin < 1) return;       // ignore accidental starts
    store.upsert('focusSessions', {
      id: util.uid('fs'), kind: 'focus', completed,
      startedAt: new Date(endedAt - elapsedMs).toISOString(), endedAt: new Date(endedAt).toISOString(),
      date: util.dateOf(endedAt), plannedMin: Math.round(plannedMs / 60000), actualMin: completed ? Math.round(plannedMs / 60000) : actualMin,
      taskId: state.taskId || '', subject: state.subject || ''
    });
  }

  function nextMode(afterMode, cycle) {
    if (afterMode !== 'focus') return 'focus';
    return cycle > 0 && cycle % (Number(cfg().longEvery) || 4) === 0 ? 'long' : 'short';
  }

  /* ---------------------------------------------------------------- Actions */
  function complete(endedAt = Date.now()) {
    const wasFocus = state.mode === 'focus';
    record(true, state.durationMs, state.durationMs, endedAt);
    const cycle = wasFocus ? state.cycle + 1 : state.cycle;
    const finishedLabel = MODES[state.mode].label;
    const prev = state;
    state = idleState(nextMode(state.mode, cycle), { ...prev, cycle });
    if (!wasFocus && state.mode === 'focus' && prev.mode === 'long') state.cycle = 0;
    persist();
    emitState();
    FF.audio.play();
    FF.notify.show('FocusFlow', finishedLabel + ' complete. Next: ' + MODES[state.mode].label + '.', 'timer');
    FF.ui.toast(finishedLabel + ' complete — next up: ' + MODES[state.mode].label + '.', 'success', 6000);
    if (wasFocus) FF.activity.log('Completed a ' + Math.round(prev.durationMs / 60000) + '-minute focus session' + (prev.subject ? ' on ' + prev.subject : ''), 'cyan');
    if (cfg().autoStart) start();
  }

  function start() {
    if (state.status === 'running') return;
    FF.audio.unlock();
    const now = Date.now();
    if (state.status === 'idle') { state.durationMs = durationMs(state.mode); state.remainingMs = state.durationMs; state.sessionStart = now; }
    state.status = 'running';
    state.startedAt = now;
    state.endsAt = now + state.remainingMs;
    persist(); startLoop(); emitState();
  }
  function pause() {
    if (state.status !== 'running') return;
    state.remainingMs = Math.max(0, state.endsAt - Date.now());
    state.status = 'paused';
    persist(); stopLoop(); emitState();
  }
  function resume() { if (state.status === 'paused') start(); }

  function elapsed() { return state.durationMs - remaining(); }

  function reset() {
    if (state.status !== 'idle') record(false, state.durationMs, elapsed(), Date.now());
    state = idleState(state.mode, state);
    persist(); stopLoop(); emitState();
  }
  function skip() {
    if (state.mode === 'focus' && state.status !== 'idle') record(false, state.durationMs, elapsed(), Date.now());
    state = idleState(nextMode(state.mode, state.cycle + (state.mode === 'focus' ? 0 : 0)), state);
    persist(); stopLoop(); emitState();
  }
  function setMode(mode) {
    if (!MODES[mode] || state.mode === mode) return;
    if (state.status !== 'idle') record(false, state.durationMs, elapsed(), Date.now());
    state = idleState(mode, state);
    persist(); stopLoop(); emitState();
  }
  function setLink(taskId, subject) {
    state.taskId = taskId || '';
    state.subject = subject != null ? String(subject).slice(0, 60) : state.subject;
    persist(); emitTick();
  }

  /* ------------------------------------------------------------------- Loop */
  function loop() {
    if (!state || state.status !== 'running') { stopLoop(); return; }
    if (Date.now() >= state.endsAt) { stopLoop(); complete(state.endsAt); return; }
    emitTick();
  }
  function startLoop() { if (!interval) interval = setInterval(loop, 250); }
  function stopLoop() { if (interval) { clearInterval(interval); interval = null; } }

  /* ---------------------------------------------------------------- Queries */
  const sessions = () => store.get('focusSessions');
  const completedFocus = () => sessions().filter((s) => s.completed);
  function minutesOn(date) { return util.sum(completedFocus().filter((s) => s.date === date), (s) => s.actualMin); }
  const todayMinutes = () => minutesOn(util.today());
  const totalMinutes = () => util.sum(completedFocus(), (s) => s.actualMin);

  /* ------------------------------------------------------------------ Boot */
  function restore() {
    const saved = store.get('timerState');
    const valid = saved && MODES[saved.mode] && ['idle', 'running', 'paused'].includes(saved.status) && Number.isFinite(saved.durationMs);
    state = valid ? { ...idleState(saved.mode), ...saved } : idleState('focus');
    if (state.status === 'running') {
      if (!Number.isFinite(state.endsAt) || state.endsAt <= 0) state = idleState(state.mode, state);
      else if (Date.now() >= state.endsAt) { complete(state.endsAt); return; }
      else startLoop();
    }
    if (state.status === 'idle') { state.durationMs = durationMs(state.mode); state.remainingMs = state.durationMs; }
    persist();
    emitState();
  }

  FF.onBoot(() => {
    restore();
    document.addEventListener('visibilitychange', () => { loop(); });
    // Changing durations in Settings refreshes an idle timer
    FF.bus.on('data:changed', (e) => {
      if (e.name === 'settings' && state && state.status === 'idle') { state.durationMs = durationMs(state.mode); state.remainingMs = state.durationMs; persist(); emitState(); }
    });
    FF.bus.on('data:reset', () => { restore(); });
  });

  /* ---------------------------------------------------------------- Widgets */
  function controls(opts = {}) {
    const wrap = el('div', { class: 'mini-controls' });
    const main = el('button', { type: 'button', class: 'btn btn-primary' + (opts.lg ? ' btn-lg' : '') });
    const reset_ = el('button', { type: 'button', class: 'btn', onclick: reset }, FF.ui.icon('reset'), 'Reset');
    const skip_ = el('button', { type: 'button', class: 'btn', onclick: skip }, FF.ui.icon('skip'), 'Skip');
    main.addEventListener('click', () => { if (state.status === 'running') pause(); else if (state.status === 'paused') resume(); else start(); });
    wrap.append(main, reset_, skip_);
    function paint() {
      clear(main);
      const s = state.status;
      main.append(FF.ui.icon(s === 'running' ? 'pause' : 'play'), s === 'running' ? 'Pause' : s === 'paused' ? 'Resume' : 'Start');
      reset_.disabled = s === 'idle';
    }
    paint();
    return { el: wrap, paint };
  }

  function modeTabs() {
    const seg = el('div', { class: 'seg', role: 'group', 'aria-label': 'Timer mode' });
    const btns = Object.entries(MODES).map(([k, m]) => {
      const b = el('button', { type: 'button', onclick: async () => {
        if (state.status !== 'idle' && state.mode !== k) {
          const ok = await FF.ui.confirm({ title: 'Switch mode?', message: 'The current session will be stopped and will not count as completed.', confirmText: 'Switch' });
          if (!ok) return;
        }
        setMode(k);
      } }, m.label);
      seg.appendChild(b);
      return [k, b];
    });
    const paint = () => btns.forEach(([k, b]) => b.setAttribute('aria-pressed', String(state.mode === k)));
    paint();
    return { el: seg, paint };
  }

  /** Compact timer for the dashboard. Subscriptions are released via ctx. */
  function mini(ctx) {
    const ringC = FF.ui.ring({ size: 150, stroke: 10, accent: 'cyan', value: 0, label: '25:00', sub: 'focus' });
    const tabs = modeTabs();
    const ctl = controls();
    const info = el('div', { class: 'small muted', style: { textAlign: 'center' } });
    function paint(t) {
      const rem = t ? t.remainingMs : remaining();
      ringC.set(state.durationMs ? 1 - rem / state.durationMs : 0, { label: util.formatClock(rem), sub: MODES[state.mode].label.toLowerCase() });
      tabs.paint(); ctl.paint();
      info.textContent = state.status === 'idle' ? 'Ready — ' + util.formatDuration(state.durationMs / 60000) : state.status === 'paused' ? 'Paused' : 'Session in progress';
    }
    paint();
    ctx.on('timer:tick', paint);
    return el('div', { class: 'mini-timer' }, tabs.el, ringC.el, info, ctl.el);
  }

  /* --------------------------------------------------------------- Full view */
  function render(root, ctx) {
    const big = FF.ui.ring({ size: 280, stroke: 12, accent: 'cyan', value: 0, label: '25:00', sub: 'focus' });
    const reactor = FF.reactor.create({ size: 'sm', active: state.status === 'running' && state.mode === 'focus' });
    const tabs = modeTabs();
    const ctl = controls({ lg: true });
    const status = el('div', { class: 'hud-label', 'aria-live': 'polite' });

    // Link picker
    const taskSel = el('select', { id: 'timerTask', 'aria-label': 'Task for this session' });
    const subjectInput = el('input', { type: 'text', id: 'timerSubject', maxlength: 60, placeholder: 'Or type a subject (e.g. Data structures)', 'aria-label': 'Subject' });
    function fillTasks() {
      clear(taskSel);
      taskSel.appendChild(el('option', { value: '', text: 'No linked task' }));
      FF.tasks.list().filter((t) => t.status === 'pending').forEach((t) => taskSel.appendChild(el('option', { value: t.id, text: t.title })));
      taskSel.value = state.taskId || '';
      if (taskSel.value !== (state.taskId || '')) taskSel.value = '';
    }
    subjectInput.value = state.subject || '';
    taskSel.addEventListener('change', () => {
      const t = taskSel.value ? store.find('tasks', taskSel.value) : null;
      if (t && !subjectInput.value.trim()) subjectInput.value = t.title.slice(0, 60);
      setLink(taskSel.value, subjectInput.value.trim());
    });
    subjectInput.addEventListener('change', () => setLink(taskSel.value, subjectInput.value.trim()));

    // Duration settings
    const durForm = el('form', { class: 'dur-form', novalidate: true });
    const fld = (name, label, max) => {
      const i = el('input', { type: 'number', id: 'dur_' + name, min: 1, max, step: 1, inputmode: 'numeric' });
      i.value = cfg()[name];
      return { name, max, input: i, node: el('div', { class: 'field' }, el('label', { for: 'dur_' + name, text: label }), i) };
    };
    const fFocus = fld('focus', 'Focus (min)', 180), fShort = fld('short', 'Short break', 60), fLong = fld('long', 'Long break', 120), fGoal = fld('dailyGoal', 'Daily goal (min)', 960);
    const durErr = el('div', { class: 'field-error', role: 'alert' });
    durForm.append(el('div', { class: 'form-grid dur-grid' }, fFocus.node, fShort.node, fLong.node, fGoal.node), durErr,
      el('button', { type: 'submit', class: 'btn btn-sm' }, 'Save durations'));
    durForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const patchT = {};
      for (const f of [fFocus, fShort, fLong, fGoal]) {
        const n = util.toNum(f.input.value);
        if (n == null || !Number.isInteger(n) || n < 1 || n > f.max) { durErr.textContent = 'Enter whole numbers between 1 and ' + f.max + ' for ' + f.node.querySelector('label').textContent + '.'; f.input.focus(); return; }
        patchT[f.name] = n;
      }
      durErr.textContent = '';
      store.saveSettings({ timer: patchT });
      FF.ui.toast('Timer settings saved.', 'success');
    });

    // Stats
    const statToday = el('div', { class: 'stat-value num' }), statSessions = el('div', { class: 'stat-value num' }), statTotal = el('div', { class: 'stat-value num' });
    const goalRing = FF.ui.ring({ size: 120, stroke: 10, accent: 'green', value: 0, label: '0%', sub: 'daily goal' });
    const goalText = el('p', { class: 'small muted', style: { textAlign: 'center' } });
    const history = el('ul', { class: 'compact-list' });

    function paintStats() {
      const goal = Number(cfg().dailyGoal) || 120;
      const today = todayMinutes();
      statToday.textContent = util.formatDuration(today);
      statSessions.textContent = String(completedFocus().length);
      statTotal.textContent = util.formatDuration(totalMinutes());
      goalRing.set(today / goal, { label: Math.min(100, Math.round((today / goal) * 100)) + '%', sub: 'daily goal' });
      goalText.textContent = util.formatDuration(today) + ' of ' + util.formatDuration(goal) + (today >= goal ? ' — goal reached!' : '');
      clear(history);
      const list = sessions().slice().sort((a, b) => b.endedAt.localeCompare(a.endedAt)).slice(0, 12);
      if (!list.length) history.appendChild(el('li', null, el('div', { class: 'empty small', text: 'Completed sessions will be logged here.' })));
      list.forEach((s) => history.appendChild(el('li', { 'data-accent': s.completed ? 'cyan' : 'flame' },
        el('span', { class: 'compact-time', text: util.formatTime(new Date(s.endedAt).toTimeString().slice(0, 5)) }),
        el('div', { class: 'compact-main' },
          el('b', { text: (s.subject || (s.taskId && store.find('tasks', s.taskId) ? store.find('tasks', s.taskId).title : '') || 'Focus session') }),
          el('span', { text: util.formatDate(s.date, 'short') + ' · ' + util.formatDuration(s.actualMin) + (s.completed ? '' : ' of ' + util.formatDuration(s.plannedMin)) })),
        el('span', { class: 'badge', 'data-accent': s.completed ? 'green' : 'flame', text: s.completed ? 'Completed' : 'Stopped early' }))));
    }

    function paintTimer(t) {
      const rem = t ? t.remainingMs : remaining();
      const m = MODES[state.mode];
      big.set(state.durationMs ? 1 - rem / state.durationMs : 0, { label: util.formatClock(rem), sub: m.label.toLowerCase(), aria: m.label + ' timer, ' + util.formatClock(rem) + ' remaining' });
      tabs.paint(); ctl.paint();
      status.textContent = state.status === 'running' ? 'Focus sequence active' : state.status === 'paused' ? 'Paused' : 'Standing by';
      reactor.classList.toggle('is-active', state.status === 'running' && state.mode === 'focus');
    }

    root.append(
      el('div', { class: 'page-head' }, el('div', null, el('div', { class: 'hud-label', text: 'Focus sequence' }), el('h2', { class: 'page-title', text: 'Focus Timer' }), el('p', { text: 'Pomodoro sessions with accurate timing. Only completed focus sessions count.' }))),
      el('div', { class: 'grid-12' },
        el('div', { class: 'card span-7 timer-card', 'data-accent': 'cyan' },
          tabs.el,
          el('div', { class: 'timer-stage' }, big.el, el('div', { class: 'timer-reactor' }, reactor)),
          status, ctl.el,
          el('div', { class: 'timer-link' }, el('div', { class: 'field' }, el('label', { for: 'timerTask', text: 'Working on' }), taskSel), el('div', { class: 'field' }, el('label', { for: 'timerSubject', text: 'Subject' }), subjectInput))),
        el('div', { class: 'span-5 stack' },
          el('div', { class: 'card', 'data-accent': 'green' }, el('div', { class: 'card-title' }, el('h3', { text: 'Today' })),
            el('div', { class: 'ring-card' }, goalRing.el, goalText)),
          el('div', { class: 'stat-grid', style: { gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' } },
            el('div', { class: 'card stat-card', 'data-accent': 'blue' }, el('div', { class: 'stat-label', text: 'Focus today' }), statToday),
            el('div', { class: 'card stat-card', 'data-accent': 'arc' }, el('div', { class: 'stat-label', text: 'Sessions completed' }), statSessions),
            el('div', { class: 'card stat-card span-2', 'data-accent': 'armor', style: { gridColumn: '1 / -1' } }, el('div', { class: 'stat-label', text: 'Total focused time' }), statTotal)),
          el('div', { class: 'card', 'data-accent': 'blue' }, el('div', { class: 'card-title' }, el('h3', { text: 'Durations' })), durForm)),
        el('div', { class: 'card span-12', 'data-accent': 'arc' },
          el('div', { class: 'card-title' }, el('h3', { text: 'Session history' }),
            el('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: async () => {
              if (!sessions().length) return;
              const ok = await FF.ui.confirm({ title: 'Clear session history?', message: 'All logged focus sessions will be deleted. Totals and analytics will reset.', confirmText: 'Clear history', danger: true });
              if (ok) store.set('focusSessions', []);
            } }, FF.ui.icon('trash'), 'Clear')),
          history)));

    fillTasks(); paintTimer(); paintStats();
    ctx.on('timer:tick', paintTimer);
    ctx.on('timer:state', () => { fillTasks(); });
    ctx.watch(['focusSessions', 'settings'], paintStats);
    ctx.watch(['tasks'], fillTasks);
  }

  FF.timer = {
    MODES, state: snapshot, isRunning: () => !!state && state.status === 'running', remaining,
    start, pause, resume, reset, skip, setMode, setLink,
    sessions, completedFocus, minutesOn, todayMinutes, totalMinutes, mini, durationMs
  };
  FF.registerView({ id: 'timer', label: 'Focus Timer', title: 'Focus Timer', crumb: 'Focus sequence', icon: 'timer', accent: 'cyan', render });
})();
