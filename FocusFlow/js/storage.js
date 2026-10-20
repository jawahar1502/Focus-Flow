/* ==========================================================================
   FocusFlow — storage.js
   Safe, versioned, account-scoped localStorage layer.

   Key layout
     ff:v1:accounts                 (global)  demo account records
     ff:v1:session                  (global)  active session (localStorage = "remember me")
     ff:v1:prefs                    (global)  device preferences (motion)
     ff:v1:u:<accountId>:<name>     (account) one key per collection
   ========================================================================== */
(function () {
  'use strict';
  const FF = window.FF;
  const { util } = FF;

  const VERSION = 'v1';
  const PREFIX = 'ff:' + VERSION + ':';
  const SCHEMA_VERSION = 1;

  /** collection → expected JSON type. */
  const SCHEMA = {
    tasks: 'array',
    reminders: 'array',
    focusSessions: 'array',
    timerState: 'object',
    timetable: 'array',
    habits: 'array',
    goals: 'array',
    notes: 'array',
    journal: 'array',
    transactions: 'array',
    budget: 'object',
    settings: 'object',
    activity: 'array'
  };

  /** Collections whose array items must carry a string id. */
  const NEEDS_ID = new Set(['tasks', 'reminders', 'focusSessions', 'timetable', 'habits', 'goals', 'notes', 'journal', 'transactions', 'activity']);

  const DEFAULT_SETTINGS = {
    notifications: { inApp: true, browser: false },
    sound: { enabled: true, tone: 'beacon', volume: 0.7 },
    timer: { focus: 25, short: 5, long: 15, longEvery: 4, dailyGoal: 120, autoStart: false },
    onboardingDismissed: false
  };

  const emptyFor = (name) => (SCHEMA[name] === 'array' ? [] : {});
  const typeOk = (name, v) => (SCHEMA[name] === 'array' ? Array.isArray(v) : v !== null && typeof v === 'object' && !Array.isArray(v));

  let accountId = null;
  const corruptNotified = new Set();

  /* ------------------------------------------------------ raw safe access */
  const raw = {
    get(key) {
      try { return window.localStorage.getItem(key); } catch (e) { return null; }
    },
    set(key, value) {
      try { window.localStorage.setItem(key, value); return true; }
      catch (e) { FF.bus.emit('storage:error', { key, error: e }); return false; }
    },
    remove(key) { try { window.localStorage.removeItem(key); } catch (e) { /* ignore */ } },
    keys() {
      const out = [];
      try { for (let i = 0; i < localStorage.length; i++) out.push(localStorage.key(i)); } catch (e) { /* ignore */ }
      return out;
    }
  };

  /** Parse JSON; on failure keep a backup copy of the corrupted text so nothing is lost silently. */
  function parseOrBackup(key, text, fallbackFactory, label) {
    try { return JSON.parse(text); }
    catch (e) {
      raw.set(key + ':corrupt:' + Date.now(), text);
      if (!corruptNotified.has(key)) {
        corruptNotified.add(key);
        FF.bus.emit('storage:corrupt', { key, label });
      }
      return fallbackFactory();
    }
  }

  /* ---------------------------------------------------------- global keys */
  const globalStore = {
    get(name, fallback = null) {
      const text = raw.get(PREFIX + name);
      if (text == null) return fallback;
      const v = parseOrBackup(PREFIX + name, text, () => fallback, name);
      return v == null ? fallback : v;
    },
    set(name, value) { return raw.set(PREFIX + name, JSON.stringify(value)); },
    remove(name) { raw.remove(PREFIX + name); }
  };

  /* ---------------------------------------------------- account-scoped data */
  const userPrefix = () => PREFIX + 'u:' + accountId + ':';

  function deepMerge(base, patch) {
    const out = Array.isArray(base) ? [...base] : { ...base };
    if (!patch || typeof patch !== 'object') return out;
    for (const [k, v] of Object.entries(patch)) {
      if (v && typeof v === 'object' && !Array.isArray(v) && base && typeof base[k] === 'object' && base[k] !== null) out[k] = deepMerge(base[k], v);
      else out[k] = v;
    }
    return out;
  }

  const store = {
    SCHEMA, SCHEMA_VERSION, DEFAULT_SETTINGS,
    global: globalStore,
    raw,

    setAccount(id) { accountId = id; },
    getAccount() { return accountId; },

    /** Read a collection. Always returns a fresh copy of the correct type. */
    get(name) {
      if (!SCHEMA[name]) throw new Error('Unknown collection: ' + name);
      if (!accountId) return emptyFor(name);
      const key = userPrefix() + name;
      const text = raw.get(key);
      if (text == null) return emptyFor(name);
      const v = parseOrBackup(key, text, () => emptyFor(name), name);
      if (!typeOk(name, v)) {
        raw.set(key + ':corrupt:' + Date.now(), text);
        if (!corruptNotified.has(key)) { corruptNotified.add(key); FF.bus.emit('storage:corrupt', { key, label: name }); }
        return emptyFor(name);
      }
      return v;
    },

    /** Replace a collection, then notify listeners. Returns false if the browser refused the write. */
    set(name, value, opts = {}) {
      if (!SCHEMA[name]) throw new Error('Unknown collection: ' + name);
      if (!accountId) return false;
      if (!typeOk(name, value)) throw new Error('Collection "' + name + '" must be an ' + SCHEMA[name]);
      const ok = raw.set(userPrefix() + name, JSON.stringify(value));
      if (ok && !opts.silent) FF.bus.emit('data:changed', { name });
      return ok;
    },

    /** update('tasks', (list) => list.push(...))  — fn may mutate or return a replacement. */
    update(name, fn, opts) {
      const current = store.get(name);
      const result = fn(current);
      return store.set(name, result === undefined ? current : result, opts);
    },

    /* ---- Collection helpers for id-based arrays ---- */
    find(name, id) { return store.get(name).find((x) => x.id === id) || null; },
    upsert(name, item) {
      let isNew = false;
      store.update(name, (list) => {
        const i = list.findIndex((x) => x.id === item.id);
        if (i >= 0) list[i] = item; else { list.push(item); isNew = true; }
      });
      return isNew;
    },
    remove(name, id) { store.update(name, (list) => list.filter((x) => x.id !== id)); },

    /* ---- Settings ---- */
    settings() { return deepMerge(DEFAULT_SETTINGS, store.get('settings')); },
    saveSettings(patch) { return store.set('settings', deepMerge(store.settings(), patch)); },

    /* ---- Export / import ---- */
    exportAll(accountLabel) {
      const data = {};
      for (const name of Object.keys(SCHEMA)) data[name] = store.get(name);
      return {
        app: 'FocusFlow', edition: 'JARVIS', schemaVersion: SCHEMA_VERSION,
        exportedAt: new Date().toISOString(), account: accountLabel || '', data
      };
    },

    /** Validate before touching any existing data. */
    validateImport(obj) {
      const errors = [];
      const summary = {};
      const clean = {};
      if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { ok: false, errors: ['The file does not contain a JSON object.'], summary, clean };
      if (obj.app !== 'FocusFlow') errors.push('This is not a FocusFlow export (missing app marker).');
      if (typeof obj.schemaVersion !== 'number') errors.push('Missing schemaVersion.');
      else if (obj.schemaVersion > SCHEMA_VERSION) errors.push('This export was made by a newer version (schema ' + obj.schemaVersion + ').');
      if (!obj.data || typeof obj.data !== 'object' || Array.isArray(obj.data)) errors.push('Missing "data" section.');
      if (errors.length) return { ok: false, errors, summary, clean };

      for (const [name, value] of Object.entries(obj.data)) {
        if (!SCHEMA[name]) continue; // unknown collections are ignored, never imported
        if (!typeOk(name, value)) { errors.push('"' + name + '" must be an ' + SCHEMA[name] + '.'); continue; }
        if (SCHEMA[name] === 'array') {
          const seen = new Set();
          let bad = false;
          for (const item of value) {
            if (!item || typeof item !== 'object' || Array.isArray(item)) { bad = true; break; }
            if (NEEDS_ID.has(name)) {
              if (typeof item.id !== 'string' || !item.id) { bad = true; break; }
              if (seen.has(item.id)) { errors.push('"' + name + '" contains a duplicate id: ' + item.id); bad = true; break; }
              seen.add(item.id);
            }
          }
          if (bad) { if (!errors.some((e) => e.includes('"' + name + '"'))) errors.push('"' + name + '" contains invalid entries.'); continue; }
          summary[name] = value.length;
        } else summary[name] = Object.keys(value).length;
        clean[name] = value;
      }
      if (!Object.keys(clean).length && !errors.length) errors.push('The file has no recognizable FocusFlow data.');
      return { ok: errors.length === 0, errors, summary, clean };
    },

    /** Keeps one safety copy of the current data, then replaces the supplied collections. */
    importAll(clean) {
      raw.set(userPrefix() + '_backup', JSON.stringify(store.exportAll('pre-import backup')));
      for (const [name, value] of Object.entries(clean)) store.set(name, value, { silent: true });
      FF.bus.emit('data:reset', { reason: 'import' });
    },

    hasBackup() { return raw.get(userPrefix() + '_backup') !== null; },

    /** Remove records flagged sample:true from every collection. Returns the number removed. */
    clearSample() {
      let removed = 0;
      const b = store.get('budget');
      if (b && b.sample === true) { store.set('budget', {}, { silent: true }); removed++; }
      for (const name of Object.keys(SCHEMA)) {
        if (SCHEMA[name] !== 'array') continue;
        const list = store.get(name);
        const kept = list.filter((x) => !(x && x.sample === true));
        if (kept.length !== list.length) { removed += list.length - kept.length; store.set(name, kept, { silent: true }); }
      }
      FF.bus.emit('data:reset', { reason: 'sample-cleared' });
      return removed;
    },
    hasSample() {
      if ((store.get('budget') || {}).sample === true) return true;
      return Object.keys(SCHEMA).some((n) => SCHEMA[n] === 'array' && store.get(n).some((x) => x && x.sample === true));
    },

    /** Delete every key that belongs to the current account (including backups and corrupt copies). */
    wipeAccountData() {
      if (!accountId) return;
      const p = userPrefix();
      raw.keys().filter((k) => k && k.startsWith(p)).forEach((k) => raw.remove(k));
      FF.bus.emit('data:reset', { reason: 'wipe' });
    },
    wipeAccountById(id) {
      const p = PREFIX + 'u:' + id + ':';
      raw.keys().filter((k) => k && k.startsWith(p)).forEach((k) => raw.remove(k));
    },
    wipeEverything() {
      raw.keys().filter((k) => k && k.startsWith(PREFIX)).forEach((k) => raw.remove(k));
    }
  };

  /* Keep tabs in sync: a write from another tab re-emits as a local change. */
  window.addEventListener('storage', (e) => {
    if (!accountId || !e.key) return;
    const p = userPrefix();
    if (e.key.startsWith(p)) {
      const name = e.key.slice(p.length);
      if (SCHEMA[name]) FF.bus.emit('data:changed', { name, external: true });
    }
  });

  /* --------------------------------------------------------- Activity log */
  FF.activity = {
    log(text, accent = 'cyan') {
      store.update('activity', (list) => {
        list.unshift({ id: util.uid('act'), at: new Date().toISOString(), text: String(text).slice(0, 200), accent });
        if (list.length > 100) list.length = 100;
      });
    },
    recent(n = 8) { return store.get('activity').slice(0, n); }
  };

  /* ------------------------------------------------- Device-level prefs */
  FF.prefs = {
    get() { return globalStore.get('prefs', {}) || {}; },
    set(patch) { globalStore.set('prefs', { ...FF.prefs.get(), ...patch }); }
  };

  FF.store = store;
  FF.deepMerge = deepMerge;
})();
