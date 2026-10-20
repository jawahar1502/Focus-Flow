/* ==========================================================================
   FocusFlow — utils.js
   Namespace, DOM builders, event bus, date / currency / validation helpers.
   Loaded first on every page.
   ========================================================================== */
(function () {
  'use strict';

  const FF = (window.FF = window.FF || {});
  const SVG_NS = 'http://www.w3.org/2000/svg';

  /* ------------------------------------------------------------------ DOM */
  function appendChildren(node, children) {
    for (const c of children) {
      if (c == null || c === false) continue;
      if (Array.isArray(c)) appendChildren(node, c);
      else if (c instanceof Node) node.appendChild(c);
      else node.appendChild(document.createTextNode(String(c)));
    }
  }

  function applyAttrs(node, attrs, isSvg) {
    if (!attrs) return;
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') node.setAttribute('class', v);
      else if (k === 'text') node.textContent = v;
      else if (k === 'dataset') Object.assign(node.dataset, v);
      else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
      else if (k === 'value' && !isSvg) node.value = v;
      else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
      else if (v === true) node.setAttribute(k, '');
      else node.setAttribute(k, String(v));
    }
  }

  /** Create an HTML element. User-supplied strings are always inserted as text nodes (XSS-safe). */
  function el(tag, attrs, ...children) {
    const node = document.createElement(tag);
    applyAttrs(node, attrs, false);
    appendChildren(node, children);
    return node;
  }

  /** Create an SVG element. */
  function svg(tag, attrs, ...children) {
    const node = document.createElementNS(SVG_NS, tag);
    applyAttrs(node, attrs, true);
    appendChildren(node, children);
    return node;
  }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
    return node;
  }

  FF.el = el;
  FF.svg = svg;
  FF.clear = clear;

  /* ------------------------------------------------------------ Event bus */
  const listeners = new Map();
  FF.bus = {
    on(evt, fn) {
      if (!listeners.has(evt)) listeners.set(evt, new Set());
      listeners.get(evt).add(fn);
      return () => FF.bus.off(evt, fn);
    },
    off(evt, fn) { const s = listeners.get(evt); if (s) s.delete(fn); },
    emit(evt, payload) {
      const s = listeners.get(evt);
      if (!s) return;
      for (const fn of [...s]) {
        try { fn(payload); } catch (err) { console.error('[FocusFlow] handler for "' + evt + '" failed:', err); }
      }
    }
  };

  /* ----------------------------------------------------------------- Util */
  const pad = (n) => String(n).padStart(2, '0');
  let uidCounter = 0;

  const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const WEEKDAYS_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  FF.WEEKDAYS = WEEKDAYS;
  FF.WEEKDAYS_SHORT = WEEKDAYS_SHORT;

  const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
  const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

  const util = {
    pad, WEEKDAYS, WEEKDAYS_SHORT,

    /** Collision-resistant id: prefix + time + counter + random. */
    uid(prefix = 'id') {
      uidCounter = (uidCounter + 1) % 1679616;
      return prefix + '_' + Date.now().toString(36) + uidCounter.toString(36) + Math.random().toString(36).slice(2, 6);
    },

    debounce(fn, wait) {
      let t = null;
      const wrapped = (...args) => { clearTimeout(t); t = setTimeout(() => { t = null; fn(...args); }, wait); };
      wrapped.flush = (...args) => { if (t) { clearTimeout(t); t = null; fn(...args); } };
      wrapped.cancel = () => { clearTimeout(t); t = null; };
      wrapped.pending = () => t !== null;
      return wrapped;
    },

    clamp(n, lo, hi) { return Math.min(hi, Math.max(lo, n)); },

    /** Returns a finite number or null. */
    toNum(v) {
      if (v === '' || v == null) return null;
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    },

    /* ---- Dates (all "date strings" are local YYYY-MM-DD) ---- */
    dateStr(d = new Date()) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); },
    today() { return util.dateStr(new Date()); },
    isValidDateStr(s) {
      if (typeof s !== 'string') return false;
      const m = DATE_RE.exec(s);
      if (!m) return false;
      const d = new Date(+m[1], +m[2] - 1, +m[3]);
      return d.getFullYear() === +m[1] && d.getMonth() === +m[2] - 1 && d.getDate() === +m[3];
    },
    isValidTime(s) { return typeof s === 'string' && TIME_RE.test(s); },
    parseDate(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); },
    addDays(s, n) { const d = util.parseDate(s); d.setDate(d.getDate() + n); return util.dateStr(d); },
    daysBetween(a, b) { return Math.round((util.parseDate(b) - util.parseDate(a)) / 86400000); },
    /** Monday=0 … Sunday=6 */
    weekdayIndex(s) { return (util.parseDate(s).getDay() + 6) % 7; },
    weekStart(s) { return util.addDays(s, -util.weekdayIndex(s)); },
    monthKey(s) { return s.slice(0, 7); },
    monthShift(key, delta) {
      const [y, m] = key.split('-').map(Number);
      const d = new Date(y, m - 1 + delta, 1);
      return d.getFullYear() + '-' + pad(d.getMonth() + 1);
    },
    daysInMonth(key) { const [y, m] = key.split('-').map(Number); return new Date(y, m, 0).getDate(); },
    /** Local date string for an ISO timestamp or ms value. */
    dateOf(ts) { return util.dateStr(new Date(ts)); },
    lastNDays(n, end = util.today()) {
      const out = [];
      for (let i = n - 1; i >= 0; i--) out.push(util.addDays(end, -i));
      return out;
    },

    toMinutes(hhmm) { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; },
    fromMinutes(n) { return pad(Math.floor(n / 60) % 24) + ':' + pad(n % 60); },
    atDateTime(dateS, timeS) {
      const [y, m, d] = dateS.split('-').map(Number);
      const [hh, mm] = (timeS || '00:00').split(':').map(Number);
      return new Date(y, m - 1, d, hh, mm, 0, 0);
    },

    formatDate(s, kind = 'long') {
      if (!util.isValidDateStr(s)) return '';
      const d = util.parseDate(s);
      const opts = {
        long: { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' },
        short: { day: 'numeric', month: 'short' },
        full: { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' },
        month: { month: 'long', year: 'numeric' },
        weekday: { weekday: 'short' },
        monthShort: { month: 'short', year: '2-digit' }
      }[kind] || {};
      return new Intl.DateTimeFormat('en-IN', opts).format(d);
    },
    formatTime(hhmm) {
      if (!util.isValidTime(hhmm)) return '';
      const [h, m] = hhmm.split(':').map(Number);
      return ((h % 12) || 12) + ':' + pad(m) + ' ' + (h < 12 ? 'AM' : 'PM');
    },
    formatDateTime(date) {
      return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(date);
    },
    formatDuration(mins) {
      mins = Math.max(0, Math.round(mins));
      const h = Math.floor(mins / 60), m = mins % 60;
      if (h && m) return h + 'h ' + m + 'm';
      if (h) return h + 'h';
      return m + 'm';
    },
    /** mm:ss countdown text from milliseconds. */
    formatClock(ms) {
      const total = Math.max(0, Math.ceil(ms / 1000));
      return pad(Math.floor(total / 60)) + ':' + pad(total % 60);
    },
    /** "in 5 min" / "2 h ago" style text. */
    relative(ms) {
      const abs = Math.abs(ms), future = ms >= 0;
      const mins = Math.round(abs / 60000);
      let txt;
      if (abs < 45000) txt = 'now';
      else if (mins < 60) txt = mins + ' min';
      else if (mins < 60 * 24) txt = Math.round(mins / 60) + ' h';
      else txt = Math.round(mins / 1440) + ' d';
      if (txt === 'now') return 'now';
      return future ? 'in ' + txt : txt + ' ago';
    },

    /* ---- Currency ---- */
    money(n, currency = 'INR') {
      const v = Number(n) || 0;
      const whole = Number.isInteger(v);
      return new Intl.NumberFormat('en-IN', {
        style: 'currency', currency, minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2
      }).format(v);
    },

    plural(n, word, pluralWord) { return n + ' ' + (n === 1 ? word : (pluralWord || word + 's')); },

    greeting(date = new Date()) {
      const h = date.getHours();
      return h < 5 ? 'Late night' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : h < 21 ? 'Good evening' : 'Good night';
    },

    /* ---- Validation ---- */
    isEmail(s) { return typeof s === 'string' && s.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s); },

    sortBy(arr, ...keys) {
      return [...arr].sort((a, b) => {
        for (const k of keys) {
          const fn = typeof k === 'function' ? k : (x) => x[k];
          const va = fn(a), vb = fn(b);
          if (va < vb) return -1;
          if (va > vb) return 1;
        }
        return 0;
      });
    },

    sum(arr, fn = (x) => x) { return arr.reduce((t, x) => t + (Number(fn(x)) || 0), 0); },

    /** Case-insensitive "contains" across several text fields. */
    matches(query, ...fields) {
      const q = String(query || '').trim().toLowerCase();
      if (!q) return true;
      return fields.some((f) => String(f == null ? '' : f).toLowerCase().includes(q));
    },

    download(filename, text, mime = 'application/json') {
      const blob = new Blob([text], { type: mime });
      const url = URL.createObjectURL(blob);
      const a = el('a', { href: url, download: filename });
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  };

  FF.util = util;
})();
