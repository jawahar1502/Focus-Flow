/* ==========================================================================
   FocusFlow — settings.js
   Profile, notifications & sound, timer defaults, motion, data export /
   import (validated, confirmed), sample data, reset, and honest notes on
   privacy and storage limits.
   ========================================================================== */
(function () {
  'use strict';
  const FF = window.FF;
  const { el, clear, util } = FF;
  const store = FF.store;

  function section(title, accent, ...kids) {
    return el('section', { class: 'card settings-card', 'data-accent': accent }, el('div', { class: 'card-title' }, el('h3', { text: title })), el('div', { class: 'stack' }, ...kids));
  }
  function toggle(label, checked, onChange, hint) {
    const input = el('input', { type: 'checkbox', checked: checked ? true : null });
    input.addEventListener('change', () => onChange(input.checked, input));
    return el('div', null, el('label', { class: 'switch' }, input, el('span', { class: 'track' }), label), hint ? el('p', { class: 'field-hint', style: { marginLeft: '58px' }, text: hint }) : null);
  }

  /* --------------------------------------------------------------- Import */
  function pickFile() {
    return new Promise((resolve) => {
      const input = el('input', { type: 'file', accept: 'application/json,.json', style: { display: 'none' } });
      input.addEventListener('change', () => { resolve(input.files[0] || null); input.remove(); });
      input.addEventListener('cancel', () => { resolve(null); input.remove(); });
      document.body.appendChild(input);
      input.click();
    });
  }
  async function importData() {
    const file = await pickFile();
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { FF.ui.toast('That file is larger than 5 MB — it does not look like a FocusFlow export.', 'error'); return; }
    let obj;
    try { obj = JSON.parse(await file.text()); }
    catch (e) { FF.ui.toast('That file is not valid JSON, so nothing was imported.', 'error'); return; }
    const check = store.validateImport(obj);
    if (!check.ok) {
      FF.ui.inform({ title: 'Import rejected', body: el('div', { class: 'stack' }, el('p', { text: 'Nothing was changed. Problems found:' }), el('ul', { class: 'bullets' }, check.errors.map((e) => el('li', { text: e })))) });
      return;
    }
    const rows = Object.entries(check.summary).map(([k, n]) => el('li', { text: k + ': ' + n + (store.SCHEMA[k] === 'array' ? ' item' + (n === 1 ? '' : 's') : ' setting' + (n === 1 ? '' : 's')) }));
    const hasExisting = Object.keys(store.SCHEMA).some((n) => { const v = store.get(n); return Array.isArray(v) ? v.length : Object.keys(v).length; });
    const ok = await FF.ui.confirm({
      title: hasExisting ? 'Replace existing data?' : 'Import data?',
      message: (hasExisting ? 'These sections will REPLACE what is currently saved (a safety backup of your current data is kept in this browser first): ' : 'These sections will be imported: ') + rows.map((r) => r.textContent).join('; ') + '.',
      confirmText: hasExisting ? 'Replace data' : 'Import', danger: hasExisting
    });
    if (!ok) return;
    store.importAll(check.clean);
    FF.ui.toast('Import complete: ' + Object.keys(check.clean).length + ' sections loaded.', 'success');
  }

  function exportData() {
    const user = FF.user();
    const data = store.exportAll(user ? user.email : '');
    util.download('focusflow-backup-' + util.today() + '.json', JSON.stringify(data, null, 2));
    FF.ui.toast('Backup downloaded.', 'success');
  }

  /* ----------------------------------------------------------------- View */
  function render(root, ctx) {
    const user = FF.user();
    const s = store.settings();
    const wrap = el('div', { class: 'grid-12' });

    /* Profile */
    const nameIn = el('input', { type: 'text', id: 'setName', maxlength: 60, value: user.name });
    const nameErr = el('div', { class: 'field-error', role: 'alert' });
    const profile = section('Profile', 'gold',
      el('form', { class: 'stack', novalidate: true, onsubmit: (e) => {
        e.preventDefault();
        const v = nameIn.value.trim();
        if (!v) { nameErr.textContent = 'Display name cannot be empty.'; nameIn.setAttribute('aria-invalid', 'true'); nameIn.focus(); return; }
        nameErr.textContent = ''; nameIn.removeAttribute('aria-invalid');
        if (FF.auth.updateName(v)) { FF.refreshUser(); FF.ui.toast('Display name updated.', 'success'); } else FF.ui.toast('Could not update the name.', 'error');
      } },
        el('div', { class: 'field' }, el('label', { for: 'setName', text: 'Display name' }), nameIn, nameErr),
        el('p', { class: 'small muted', text: 'Signed in as ' + user.email }),
        el('div', null, el('button', { type: 'submit', class: 'btn btn-primary btn-sm' }, 'Save name'))));

    /* Notifications & sound */
    const perm = el('p', { class: 'small muted', text: FF.notify.describe() });
    const toneSel = el('select', { id: 'setTone', 'aria-label': 'Default alarm sound' }, Object.entries(FF.audio.TONES).map(([v, t]) => el('option', { value: v, text: t.label })));
    toneSel.value = s.sound.tone;
    toneSel.addEventListener('change', () => { store.saveSettings({ sound: { tone: toneSel.value } }); FF.audio.play(toneSel.value, { force: true }); });
    const vol = el('input', { type: 'range', id: 'setVol', min: 0, max: 1, step: 0.05, value: s.sound.volume, 'aria-label': 'Alarm volume' });
    vol.addEventListener('change', () => { store.saveSettings({ sound: { volume: Number(vol.value) } }); FF.audio.play(null, { force: true }); });
    const browserToggleHost = el('div');
    function paintBrowserToggle() {
      clear(browserToggleHost);
      const p = FF.notify.permission();
      const cur = store.settings();
      if (p === 'granted') browserToggleHost.appendChild(toggle('Browser notifications', cur.notifications.browser, (v) => store.saveSettings({ notifications: { browser: v } })));
      else browserToggleHost.appendChild(el('button', { type: 'button', class: 'btn btn-sm', disabled: p === 'denied' || p === 'unsupported' ? true : null, onclick: async () => {
        const r = await FF.notify.request();
        if (r === 'granted') store.saveSettings({ notifications: { browser: true } });
        perm.textContent = FF.notify.describe(); paintBrowserToggle();
      } }, FF.ui.icon('bell'), 'Enable browser notifications'));
    }
    paintBrowserToggle();
    const notif = section('Notifications & alarms', 'red',
      toggle('In-app reminder dialogs', s.notifications.inApp, (v) => store.saveSettings({ notifications: { inApp: v } })),
      browserToggleHost, perm,
      toggle('Play alarm sounds', s.sound.enabled, (v) => store.saveSettings({ sound: { enabled: v } })),
      el('div', { class: 'field' }, el('label', { for: 'setTone', text: 'Default alarm sound' }), toneSel),
      el('div', { class: 'field' }, el('label', { for: 'setVol', text: 'Volume' }), vol),
      el('div', { class: 'notice', 'data-accent': 'flame' }, FF.ui.icon('info'), el('span', null, el('strong', null, 'Reminder limits: '), 'alarms use browser timers. They cannot ring when the browser is closed, the device is asleep, or the OS suspends this tab. Missed reminders are listed instead.')));

    /* Timer */
    const t = s.timer;
    const num = (id, label, val, max) => { const i = el('input', { type: 'number', id, min: 1, max, step: 1, value: val, inputmode: 'numeric' }); return { i, max, label, node: el('div', { class: 'field' }, el('label', { for: id, text: label }), i) }; };
    const fFocus = num('sFocus', 'Focus (min)', t.focus, 180), fShort = num('sShort', 'Short break (min)', t.short, 60), fLong = num('sLong', 'Long break (min)', t.long, 120), fEvery = num('sEvery', 'Long break every N sessions', t.longEvery, 12), fGoal = num('sGoal', 'Daily focus goal (min)', t.dailyGoal, 960);
    const tErr = el('div', { class: 'field-error', role: 'alert' });
    const timerForm = el('form', { class: 'stack', novalidate: true, onsubmit: (e) => {
      e.preventDefault();
      const patch = {};
      const map = { focus: fFocus, short: fShort, long: fLong, longEvery: fEvery, dailyGoal: fGoal };
      for (const [k, f] of Object.entries(map)) {
        const n = util.toNum(f.i.value);
        if (n == null || !Number.isInteger(n) || n < 1 || n > f.max) { tErr.textContent = f.label + ' must be a whole number from 1 to ' + f.max + '.'; f.i.focus(); return; }
        patch[k] = n;
      }
      tErr.textContent = '';
      store.saveSettings({ timer: patch });
      FF.ui.toast('Timer defaults saved.', 'success');
    } }, el('div', { class: 'form-grid' }, fFocus.node, fShort.node, fLong.node, fEvery.node, fGoal.node), tErr,
    toggle('Auto-start the next session', t.autoStart, (v) => store.saveSettings({ timer: { autoStart: v } })),
    el('div', null, el('button', { type: 'submit', class: 'btn btn-primary btn-sm' }, 'Save timer defaults')));
    const timerCard = section('Focus timer', 'cyan', timerForm);

    /* Appearance */
    const pref = FF.prefs.get().reduceMotion;
    const motionSel = el('select', { id: 'setMotion', 'aria-label': 'Motion preference' },
      el('option', { value: 'system', text: 'Follow system setting' }), el('option', { value: 'reduced', text: 'Reduce motion' }), el('option', { value: 'full', text: 'Full motion' }));
    motionSel.value = pref === true ? 'reduced' : pref === false ? 'full' : 'system';
    motionSel.addEventListener('change', () => {
      FF.prefs.set({ reduceMotion: motionSel.value === 'system' ? null : motionSel.value === 'reduced' });
      if (motionSel.value === 'system') { const p = FF.prefs.get(); delete p.reduceMotion; FF.store.global.set('prefs', p); }
      FF.ui.applyMotion();
      const box = document.getElementById('menuMotion'); if (box) box.checked = FF.ui.motionReduced();
    });
    const appearance = section('Appearance & motion', 'violet',
      el('p', { class: 'small muted', text: 'FocusFlow uses a single dark JARVIS theme. You can reduce or restore the decorative animations (reactor, grid, tilt).' }),
      el('div', { class: 'field' }, el('label', { for: 'setMotion', text: 'Motion' }), motionSel));

    /* Data */
    const sampleBtn = el('button', { type: 'button', class: 'btn btn-sm', onclick: async () => {
      const ok = await FF.ui.confirm({ title: 'Clear sample data?', message: 'All records labelled "[Sample]" will be removed. Your own data is not touched.', confirmText: 'Clear sample data', danger: true });
      if (!ok) return;
      const removed = store.clearSample();
      FF.ui.toast(removed ? 'Removed ' + util.plural(removed, 'sample record') + '.' : 'There was no sample data.', 'info');
      paintSample();
    } }, FF.ui.icon('trash'), 'Clear sample data');
    const loadBtn = el('button', { type: 'button', class: 'btn btn-sm', onclick: async () => {
      if (store.hasSample()) { FF.ui.toast('Sample data is already loaded.', 'info'); return; }
      FF.sample.load(); FF.ui.toast('Sample data loaded — every record is labelled "[Sample]".', 'success'); paintSample();
    } }, FF.ui.icon('sparkle'), 'Load sample data');
    const sampleNote = el('p', { class: 'small muted' });
    function paintSample() { sampleNote.textContent = store.hasSample() ? 'Sample data is currently loaded.' : 'No sample data is loaded.'; }
    paintSample();

    const data = section('Data & backup', 'blue',
      el('p', { class: 'small muted', text: 'Everything is stored in this browser under your account. Export a JSON backup regularly — clearing browser data deletes everything.' }),
      el('div', { class: 'row' },
        el('button', { type: 'button', class: 'btn btn-sm', onclick: exportData }, FF.ui.icon('download'), 'Export JSON'),
        el('button', { type: 'button', class: 'btn btn-sm', onclick: importData }, FF.ui.icon('upload'), 'Import JSON')),
      el('div', { class: 'row' }, loadBtn, sampleBtn), sampleNote,
      el('hr', { class: 'sep' }),
      el('div', { class: 'row' },
        el('button', { type: 'button', class: 'btn btn-danger btn-sm', onclick: async () => {
          const ok = await FF.ui.confirm({ title: 'Reset all your data?', message: 'This permanently deletes every task, reminder, habit, goal, note, journal entry and transaction for this account. Export a backup first if you might need it.', confirmText: 'Reset my data', danger: true });
          if (!ok) return;
          store.wipeAccountData(); FF.ui.toast('All data for this account was reset.', 'info'); FF.navigate('dashboard');
        } }, FF.ui.icon('trash'), 'Reset my data'),
        el('button', { type: 'button', class: 'btn btn-danger btn-sm', onclick: async () => {
          const ok = await FF.ui.confirm({ title: 'Delete this account?', message: 'The demo account "' + user.email + '" and all of its data will be deleted from this browser and you will be signed out.', confirmText: 'Delete account', danger: true });
          if (!ok) return;
          FF.auth.deleteCurrentAccount(); window.location.replace('login.html');
        } }, FF.ui.icon('x'), 'Delete account')));

    /* About / privacy */
    const about = section('About & privacy', 'arc',
      el('div', { class: 'row' }, FF.reactor.emblem(40), el('div', null, el('b', { text: 'FocusFlow — JARVIS Edition' }), el('div', { class: 'small muted', text: 'Version 1.0 · "Your Day. Your Mission. Execute."' }))),
      el('ul', { class: 'bullets small' },
        el('li', { text: 'Local only: data is saved in this browser\'s localStorage. There is no server, account recovery or sync.' }),
        el('li', { text: 'Not encrypted: anyone with access to this browser profile can read the stored data. Avoid sensitive information.' }),
        el('li', { text: 'Demo sign-in: it separates accounts on this device but is not real security. Passwords are salted and hashed, never stored in plaintext.' }),
        el('li', { text: 'Storage limit: browsers allow roughly 5 MB per site. Export backups and clear old data if you approach it.' }),
        el('li', { text: 'Alarms need the tab open: see the reminder limitation in Notifications.' }),
        el('li', { text: 'Expense tracking is bookkeeping, not financial advice.' })));

    wrap.append(el('div', { class: 'span-6 stack' }, profile, notif, appearance), el('div', { class: 'span-6 stack' }, timerCard, data, about));
    root.append(el('div', { class: 'page-head' }, el('div', null, el('div', { class: 'hud-label', text: 'System configuration' }), el('h2', { class: 'page-title', text: 'Settings' }), el('p', { text: 'Preferences, backups and privacy.' }))), wrap);
    ctx.watch(['settings'], () => { /* values are read fresh on each action */ });
  }

  FF.registerView({ id: 'settings', label: 'Settings', title: 'Settings', crumb: 'System configuration', icon: 'settings', accent: 'cyan', render });
})();
