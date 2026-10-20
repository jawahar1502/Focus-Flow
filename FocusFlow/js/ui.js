/* ==========================================================================
   FocusFlow — ui.js
   Shared UI components: icons, toasts, dialogs, form modal, progress rings,
   3D tilt, HUD background, motion preferences.
   ========================================================================== */
(function () {
  'use strict';
  const FF = window.FF;
  const { el, svg, util } = FF;

  /* ----------------------------------------------------------------- Icons */
  const ICONS = {
    grid: 'M3 3h7v7H3z M14 3h7v7h-7z M14 14h7v7h-7z M3 14h7v7H3z',
    check: 'M9 12l2 2 4-4 M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z',
    checkSimple: 'M5 12l5 5 9-10',
    bell: 'M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9 M10.3 21a1.94 1.94 0 0 0 3.4 0',
    timer: 'M10 2h4 M12 14l3-3 M12 22a8 8 0 1 0 0-16 8 8 0 0 0 0 16z',
    calendar: 'M8 2v4 M16 2v4 M3 10h18 M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z',
    flame: 'M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5z',
    chart: 'M3 3v18h18 M7 16v-5 M12 16V7 M17 16v-8',
    target: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12z M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
    note: 'M15.5 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8.5L15.5 3z M15 3v6h6 M8 13h8 M8 17h5',
    book: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20 M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z',
    wallet: 'M20 12V8H6a2 2 0 0 1 0-4h12v4 M4 6v12a2 2 0 0 0 2 2h14v-4 M18 12a2 2 0 0 0 0 4h4v-4z',
    settings: 'M4 21v-7 M4 10V3 M12 21v-9 M12 8V3 M20 21v-5 M20 12V3 M1 14h6 M9 8h6 M17 16h6',
    plus: 'M12 5v14 M5 12h14',
    search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z M21 21l-4.3-4.3',
    trash: 'M3 6h18 M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6 M10 11v6 M14 11v6 M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2',
    edit: 'M12 20h9 M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z',
    x: 'M18 6L6 18 M6 6l12 12',
    menu: 'M3 6h18 M3 12h18 M3 18h18',
    logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4 M16 17l5-5-5-5 M21 12H9',
    user: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
    play: 'M6 4l14 8-14 8z',
    pause: 'M6 4h4v16H6z M14 4h4v16h-4z',
    reset: 'M3 12a9 9 0 1 0 3-6.7 M3 4v5h5',
    skip: 'M5 4l10 8-10 8z M19 5v14',
    clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M12 6v6l4 2',
    alert: 'M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z M12 9v4 M12 17h.01',
    info: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M12 16v-4 M12 8h.01',
    pin: 'M12 17v5 M9 10.8a2 2 0 0 1-1.1 1.8l-1.8.9A2 2 0 0 0 5 15.2V17h14v-1.8a2 2 0 0 0-1.1-1.8l-1.8-.9a2 2 0 0 1-1.1-1.8V6a3 3 0 0 0 1-2H8a3 3 0 0 0 1 2z',
    download: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4 M7 10l5 5 5-5 M12 15V3',
    upload: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4 M17 8l-5-5-5 5 M12 3v12',
    eye: 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
    eyeOff: 'M17.9 17.9A10.1 10.1 0 0 1 12 19c-6.4 0-10-7-10-7a18.5 18.5 0 0 1 5.1-5.9 M9.9 4.2A9.1 9.1 0 0 1 12 4c6.4 0 10 7 10 7a18.5 18.5 0 0 1-2.2 3.2 M1 1l22 22 M14.1 14.1a3 3 0 1 1-4.2-4.2',
    chevL: 'M15 18l-6-6 6-6',
    chevR: 'M9 18l6-6-6-6',
    link: 'M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7 M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7',
    repeat: 'M17 1l4 4-4 4 M3 11V9a4 4 0 0 1 4-4h14 M7 23l-4-4 4-4 M21 13v2a4 4 0 0 1-4 4H3',
    sparkle: 'M12 3l1.9 5.6L19.5 10l-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.4z',
    shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
    volume: 'M11 5L6 9H2v6h4l5 4V5z M15.5 8.5a5 5 0 0 1 0 7 M19 5a10 10 0 0 1 0 14',
    volumeOff: 'M11 5L6 9H2v6h4l5 4V5z M23 9l-6 6 M17 9l6 6',
    coffee: 'M17 8h1a4 4 0 1 1 0 8h-1 M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V8z M6 2v3 M10 2v3 M14 2v3',
    zap: 'M13 2L3 14h9l-1 8 10-12h-9l1-8z',
    list: 'M8 6h13 M8 12h13 M8 18h13 M3 6h.01 M3 12h.01 M3 18h.01',
    archive: 'M21 8v13H3V8 M1 3h22v5H1z M10 12h4',
    undo: 'M3 7v6h6 M21 17a9 9 0 0 0-15-6.7L3 13',
    moon: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z'
  };

  function icon(name, cls = '') {
    const s = svg('svg', { viewBox: '0 0 24 24', class: ('icon ' + cls).trim(), 'aria-hidden': 'true', focusable: 'false' });
    s.appendChild(svg('path', { d: ICONS[name] || ICONS.info }));
    return s;
  }

  /* -------------------------------------------------------------- Gradients */
  const GRAD_TOKEN = {
    red: 'iron-red', gold: 'gold-pink', teal: 'reactor-teal', blue: 'stark-blue', arc: 'arc-blue',
    violet: 'cyber-violet', green: 'progress-green', armor: 'armor-gold', flame: 'alert-flame', cyan: 'energy-cyan'
  };
  const GRAD_FALLBACK = {
    red: ['#FF595E', '#B91C1C'], gold: ['#FFD166', '#FF4FA3'], teal: ['#55E6C1', '#159A91'], blue: ['#45B7D8', '#25256E'],
    arc: ['#B4DCFF', '#628BFF'], violet: ['#9747FF', '#FF4FA3'], green: ['#35C66F', '#E5F45B'], armor: ['#FFD447', '#FF984D'],
    flame: ['#FFAD33', '#F01414'], cyan: ['#57F0F5', '#42B8FF']
  };
  const SOLID = {
    red: '#FF595E', gold: '#FFD166', teal: '#55E6C1', blue: '#45B7D8', arc: '#B4DCFF',
    violet: '#B27CFF', green: '#35C66F', armor: '#FFD447', flame: '#FFAD33', cyan: '#57F0F5'
  };

  /** Reads the two colors of --gradient-* from CSS so variables.css stays the single source of truth. */
  function gradientStops(accent) {
    try {
      const v = getComputedStyle(document.documentElement).getPropertyValue('--gradient-' + GRAD_TOKEN[accent]);
      const m = v.match(/#[0-9a-fA-F]{3,8}/g);
      if (m && m.length >= 2) return [m[0], m[1]];
    } catch (e) { /* use fallback */ }
    return GRAD_FALLBACK[accent] || GRAD_FALLBACK.cyan;
  }

  /** <linearGradient> for SVG charts. dir 'v' = top→bottom, 'd' = diagonal. */
  function gradientDef(id, accent, dir = 'v') {
    const [c1, c2] = gradientStops(accent);
    const a = dir === 'v' ? { x1: 0, y1: 0, x2: 0, y2: 1 } : { x1: 0, y1: 0, x2: 1, y2: 1 };
    return svg('linearGradient', { id, ...a }, svg('stop', { offset: '0%', 'stop-color': c1 }), svg('stop', { offset: '100%', 'stop-color': c2 }));
  }

  /* ----------------------------------------------------------------- Toasts */
  let toastBox = null;
  function toast(message, type = 'info', timeout = 4200) {
    if (!toastBox) {
      toastBox = el('div', { class: 'toasts', role: 'region', 'aria-label': 'Notifications', 'aria-live': 'polite' });
      document.body.appendChild(toastBox);
    }
    const node = el('div', { class: 'toast ' + type }, el('div', { class: 'toast-msg', text: message }),
      el('button', { type: 'button', 'aria-label': 'Dismiss notification', onclick: () => node.remove() }, '×'));
    toastBox.appendChild(node);
    while (toastBox.children.length > 4) toastBox.firstChild.remove();
    if (timeout > 0) setTimeout(() => node.remove(), timeout);
    return node;
  }

  /* ---------------------------------------------------------------- Dialogs */
  function makeDialog(title, { className = '', backdropClose = true } = {}) {
    const titleId = util.uid('dlg');
    const dialog = el('dialog', { class: ('modal ' + className).trim(), 'aria-labelledby': titleId });
    const closeBtn = el('button', { type: 'button', class: 'btn btn-ghost btn-icon btn-sm', 'aria-label': 'Close dialog' }, icon('x'));
    dialog.appendChild(el('div', { class: 'modal-head' }, el('h2', { id: titleId, text: title }), closeBtn));

    let result = null;
    let resolveClosed;
    const closed = new Promise((r) => { resolveClosed = r; });
    let finished = false;

    function finish() {
      if (finished) return;
      finished = true;
      dialog.remove();
      resolveClosed(result);
    }
    function close(res) {
      result = res === undefined ? null : res;
      if (typeof dialog.close === 'function' && dialog.open) dialog.close();
      else { dialog.removeAttribute('open'); finish(); }
    }
    dialog.addEventListener('close', finish);
    closeBtn.addEventListener('click', () => close(null));
    let downOnBackdrop = false;
    dialog.addEventListener('pointerdown', (e) => { downOnBackdrop = e.target === dialog; });
    dialog.addEventListener('click', (e) => { if (backdropClose && downOnBackdrop && e.target === dialog) close(null); });

    function show() {
      document.body.appendChild(dialog);
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
      return dialog;
    }
    return { dialog, close, closed, show };
  }

  /** Simple dialog with action buttons. Resolves to the clicked action's value (or null if dismissed). */
  function openDialog({ title, body, actions = [], className = '', backdropClose = true }) {
    const d = makeDialog(title, { className, backdropClose });
    d.dialog.appendChild(el('div', { class: 'modal-body' }, body));
    if (actions.length) {
      d.dialog.appendChild(el('div', { class: 'modal-foot' }, actions.map((a) =>
        el('button', {
          type: 'button', class: 'btn ' + (a.kind ? 'btn-' + a.kind : ''),
          onclick: () => d.close(a.value), autofocus: a.autofocus ? true : null
        }, a.icon ? icon(a.icon) : null, a.label))));
    }
    d.show();
    const af = d.dialog.querySelector('[autofocus]');
    if (af) af.focus();
    return Object.assign(d.closed, { close: d.close, dialog: d.dialog });
  }

  /** Confirmation dialog → Promise<boolean>. The safe option is focused by default. */
  function confirm({ title = 'Are you sure?', message = '', confirmText = 'Confirm', cancelText = 'Cancel', danger = false }) {
    return openDialog({
      title,
      body: el('p', { class: 'wrap-text', text: message }),
      actions: [
        { label: cancelText, value: false, autofocus: true },
        { label: confirmText, value: true, kind: danger ? 'danger' : 'primary' }
      ]
    }).then((v) => v === true);
  }

  function inform({ title, body, closeText = 'Close' }) {
    return openDialog({ title, body: typeof body === 'string' ? el('p', { text: body }) : body, actions: [{ label: closeText, value: true, kind: 'primary', autofocus: true }] });
  }

  /**
   * Declarative form dialog with validation → Promise<values | null>.
   * field: {name,label,type,required,options,placeholder,hint,min,max,step,maxLength,span2,rows,default}
   */
  function formModal({ title, fields, values = {}, submitText = 'Save', cancelText = 'Cancel', validate, intro, extra, className = '' }) {
    return new Promise((resolve) => {
      const d = makeDialog(title, { className, backdropClose: false });
      const form = el('form', { class: 'modal-form', novalidate: true });
      const grid = el('div', { class: 'form-grid' });
      const generalErr = el('div', { class: 'notice', 'data-accent': 'flame', role: 'alert', hidden: true });
      const inputs = {}, errs = {}, uidBase = util.uid('f');

      fields.forEach((f) => {
        const id = uidBase + '_' + f.name;
        const val = values[f.name] != null ? values[f.name] : (f.default != null ? f.default : '');
        let input;
        if (f.type === 'textarea') {
          input = el('textarea', { id, name: f.name, rows: f.rows || 3, placeholder: f.placeholder, maxlength: f.maxLength });
          input.value = val;
        } else if (f.type === 'select') {
          const opts = typeof f.options === 'function' ? f.options() : f.options;
          input = el('select', { id, name: f.name }, opts.map((o) => el('option', { value: o.value, text: o.label })));
          input.value = val;
          if (input.value !== String(val) && opts.length) input.value = opts[0].value;
        } else if (f.type === 'checkbox') {
          input = el('input', { id, name: f.name, type: 'checkbox' });
          input.checked = !!val;
        } else {
          input = el('input', {
            id, name: f.name, type: f.type || 'text', placeholder: f.placeholder, min: f.min, max: f.max,
            step: f.step, maxlength: f.maxLength, autocomplete: 'off', inputmode: f.inputmode
          });
          input.value = val;
        }
        inputs[f.name] = input;
        const err = el('div', { class: 'field-error', id: id + '_err', 'aria-live': 'polite' });
        errs[f.name] = err;
        const describedBy = [f.hint ? id + '_hint' : null, id + '_err'].filter(Boolean).join(' ');
        input.setAttribute('aria-describedby', describedBy);
        if (f.required) input.setAttribute('aria-required', 'true');
        let node;
        if (f.type === 'checkbox') {
          node = el('div', { class: 'field' + (f.span2 ? ' span-2' : '') }, el('label', { class: 'check', for: id }, input, f.label),
            f.hint ? el('div', { class: 'field-hint', id: id + '_hint', text: f.hint }) : null, err);
        } else {
          node = el('div', { class: 'field' + (f.span2 ? ' span-2' : '') },
            el('label', { for: id }, f.label, f.required ? el('span', { class: 'req', 'aria-hidden': 'true' }, '*') : null),
            input, f.hint ? el('div', { class: 'field-hint', id: id + '_hint', text: f.hint }) : null, err);
        }
        grid.appendChild(node);
      });

      function collect() {
        const out = {};
        fields.forEach((f) => {
          const i = inputs[f.name];
          if (f.type === 'checkbox') out[f.name] = i.checked;
          else if (f.type === 'number') out[f.name] = util.toNum(i.value);
          else out[f.name] = f.noTrim ? i.value : i.value.trim();
        });
        return out;
      }

      function check(v) {
        const out = {};
        fields.forEach((f) => {
          const x = v[f.name];
          const empty = x === '' || x == null;
          if (f.required && f.type !== 'checkbox' && empty) { out[f.name] = f.label + ' is required.'; return; }
          if (empty) return;
          if (f.type === 'number') {
            if (f.min != null && x < f.min) out[f.name] = f.label + ' must be at least ' + f.min + '.';
            else if (f.max != null && x > f.max) out[f.name] = f.label + ' must be at most ' + f.max + '.';
          } else if (f.type === 'date' && !util.isValidDateStr(x)) out[f.name] = 'Enter a valid date.';
          else if (f.type === 'time' && !util.isValidTime(x)) out[f.name] = 'Enter a valid time.';
          else if (f.type === 'email' && !util.isEmail(x)) out[f.name] = 'Enter a valid email address.';
        });
        if (validate && !Object.keys(out).length) Object.assign(out, validate(v) || {});
        return out;
      }

      function showErrors(map) {
        let first = null;
        fields.forEach((f) => {
          const msg = map[f.name] || '';
          errs[f.name].textContent = msg;
          if (msg) { inputs[f.name].setAttribute('aria-invalid', 'true'); if (!first) first = inputs[f.name]; }
          else inputs[f.name].removeAttribute('aria-invalid');
        });
        generalErr.hidden = !map._form;
        generalErr.textContent = map._form || '';
        if (first) first.focus();
      }

      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const v = collect();
        const map = check(v);
        if (Object.keys(map).length) { showErrors(map); return; }
        d.close(v);
      });

      form.appendChild(el('div', { class: 'modal-body' }, intro ? el('p', { class: 'muted small', style: { marginBottom: '14px' }, text: intro }) : null, generalErr, grid, extra || null));
      form.appendChild(el('div', { class: 'modal-foot' },
        el('button', { type: 'button', class: 'btn', onclick: () => d.close(null) }, cancelText),
        el('button', { type: 'submit', class: 'btn btn-primary' }, submitText)));
      d.dialog.appendChild(form);
      d.closed.then(resolve);
      d.show();
      const firstInput = fields.length ? inputs[fields[0].name] : null;
      if (firstInput && firstInput.type !== 'date') firstInput.focus();
    });
  }

  /* ------------------------------------------------------- Progress rings */
  function ring({ size = 120, stroke = 10, accent = 'cyan', value = 0, label = '', sub = '', aria = '' }) {
    const r = (size - stroke) / 2;
    const C = 2 * Math.PI * r;
    const gid = util.uid('rg');
    const [c1, c2] = gradientStops(accent);
    const fill = svg('circle', { class: 'ring-fill', cx: size / 2, cy: size / 2, r, 'stroke-width': stroke, stroke: 'url(#' + gid + ')', 'stroke-dasharray': C.toFixed(2) });
    fill.style.strokeDashoffset = C;
    const track = svg('circle', { class: 'ring-track', cx: size / 2, cy: size / 2, r, 'stroke-width': stroke });
    const s = svg('svg', { width: size, height: size, viewBox: '0 0 ' + size + ' ' + size, 'aria-hidden': 'true' },
      svg('defs', null, svg('linearGradient', { id: gid, x1: 0, y1: 0, x2: 1, y2: 1 }, svg('stop', { offset: '0%', 'stop-color': c1 }), svg('stop', { offset: '100%', 'stop-color': c2 }))),
      track, fill);
    const labelB = el('b', { text: label });
    const subS = el('span', { text: sub });
    const node = el('div', { class: 'ring-wrap', role: 'img', 'aria-label': aria || (label + ' ' + sub).trim() }, s, el('div', { class: 'ring-label' }, labelB, subS));
    node.style.width = size + 'px';
    node.style.height = size + 'px';
    node.style.fontSize = Math.max(11, size / 8.5) + 'px';

    function set(v, o = {}) {
      const pct = util.clamp(Number.isFinite(v) ? v : 0, 0, 1);
      requestAnimationFrame(() => { fill.style.strokeDashoffset = (C * (1 - pct)).toFixed(2); });
      if (o.label != null) labelB.textContent = o.label;
      if (o.sub != null) subS.textContent = o.sub;
      if (o.aria != null) node.setAttribute('aria-label', o.aria);
      else if (o.label != null || o.sub != null) node.setAttribute('aria-label', (labelB.textContent + ' ' + subS.textContent).trim());
    }
    set(value);
    return { el: node, set };
  }

  /* ----------------------------------------------------------- Motion prefs */
  function applyMotion() {
    const p = FF.prefs.get();
    const html = document.documentElement;
    if (p.reduceMotion === true) html.setAttribute('data-motion', 'reduced');
    else if (p.reduceMotion === false) html.setAttribute('data-motion', 'full');
    else html.removeAttribute('data-motion');
  }
  function motionReduced() {
    const a = document.documentElement.getAttribute('data-motion');
    if (a === 'reduced') return true;
    if (a === 'full') return false;
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  /* ------------------------------------------------------------- 3D tilt */
  function initTilt() {
    if (initTilt.done) return;
    initTilt.done = true;
    const fine = window.matchMedia ? window.matchMedia('(hover: hover) and (pointer: fine)') : { matches: false };
    let active = null, raf = 0, pt = null;
    const MAX = 7; // total degrees across the card → ±3.5° maximum

    function reset() {
      if (!active) return;
      active.classList.remove('is-tilting');
      active.style.setProperty('--rx', '0deg');
      active.style.setProperty('--ry', '0deg');
      active = null;
    }
    function frame() {
      raf = 0;
      if (!active || !pt) return;
      const r = active.getBoundingClientRect();
      const px = util.clamp((pt.x - r.left) / r.width, 0, 1);
      const py = util.clamp((pt.y - r.top) / r.height, 0, 1);
      active.classList.add('is-tilting');
      active.style.setProperty('--rx', ((0.5 - py) * MAX).toFixed(2) + 'deg');
      active.style.setProperty('--ry', ((px - 0.5) * MAX).toFixed(2) + 'deg');
      active.style.setProperty('--mx', (px * 100).toFixed(1) + '%');
      active.style.setProperty('--my', (py * 100).toFixed(1) + '%');
    }
    document.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch') return;
      if (!fine.matches || motionReduced()) { reset(); return; }
      const card = e.target.closest ? e.target.closest('.tilt-card') : null;
      if (active && active !== card) reset();
      if (!card) return;
      active = card;
      pt = { x: e.clientX, y: e.clientY };
      if (!raf) raf = requestAnimationFrame(frame);
    }, { passive: true });
    document.addEventListener('pointerout', (e) => {
      if (active && !active.contains(e.relatedTarget)) reset();
    }, { passive: true });
    window.addEventListener('blur', reset);
  }

  /* ----------------------------------------------------------- HUD backdrop */
  function initHud() {
    if (document.querySelector('.hud-bg')) return;
    const tick = (r, n, len, w) => {
      const C = 2 * Math.PI * r;
      return svg('circle', { cx: 100, cy: 100, r, fill: 'none', stroke: '#57F0F5', 'stroke-width': len, 'stroke-dasharray': w + ' ' + (C / n - w).toFixed(3) });
    };
    const ringSvg = svg('svg', { class: 'hud-ring', viewBox: '0 0 200 200' },
      svg('circle', { cx: 100, cy: 100, r: 96, fill: 'none', stroke: '#57F0F5', 'stroke-width': .6 }),
      tick(90, 60, 6, 1.2),
      svg('circle', { cx: 100, cy: 100, r: 76, fill: 'none', stroke: '#FF595E', 'stroke-width': 1.2, 'stroke-dasharray': '60 30' }),
      svg('circle', { cx: 100, cy: 100, r: 58, fill: 'none', stroke: '#57F0F5', 'stroke-width': .6 }));
    const bg = el('div', { class: 'hud-bg', 'aria-hidden': 'true' },
      el('div', { class: 'hud-grid' }), el('div', { class: 'hud-light l1' }), el('div', { class: 'hud-light l2' }),
      el('div', { class: 'hud-scan' }), el('div', { class: 'hud-scan s2' }), ringSvg);
    const count = window.innerWidth < 700 ? 8 : 14;
    for (let i = 0; i < count; i++) {
      const p = el('i', { class: 'hud-particle' });
      p.style.left = (Math.random() * 100).toFixed(1) + '%';
      p.style.animationDuration = (20 + Math.random() * 18).toFixed(1) + 's';
      p.style.animationDelay = (-Math.random() * 30).toFixed(1) + 's';
      p.style.setProperty('--dx', (Math.random() * 120 - 60).toFixed(0) + 'px');
      bg.appendChild(p);
    }
    document.body.prepend(bg);
  }

  function initVisibility() {
    const toggle = () => document.documentElement.classList.toggle('page-hidden', document.hidden);
    document.addEventListener('visibilitychange', toggle);
    toggle();
  }

  function init() {
    applyMotion();
    initHud();
    initVisibility();
    initTilt();
  }

  FF.ui = {
    icon, toast, makeDialog, dialog: openDialog, confirm, inform, formModal, ring,
    gradientStops, gradientDef, solid: (a) => SOLID[a] || SOLID.cyan, SOLID,
    applyMotion, motionReduced, init, initTilt, initHud
  };
})();
