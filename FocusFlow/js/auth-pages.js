/* ==========================================================================
   FocusFlow — auth-pages.js
   Behaviour for index.html, login.html and signup.html.
   ========================================================================== */
(function () {
  'use strict';
  const FF = window.FF;
  const { el, util } = FF;
  const page = document.body.dataset.page;

  FF.ui.init();
  if (FF.auth.redirectIfAuthed()) return; // already signed in → dashboard

  /* -------------------------------------------------------------- Hero */
  function chip(label, value, cls) {
    return el('div', { class: 'hero-chip ' + cls, 'aria-hidden': 'true' }, el('b', { text: value }), label);
  }
  const hero = document.getElementById('hero');
  if (hero) {
    hero.append(
      el('div', { class: 'brand' },
        FF.reactor.emblem(46),
        el('div', null, el('div', { class: 'brand-name', text: 'FocusFlow' }), el('div', { class: 'hud-label', text: 'JARVIS Edition' }))),
      el('div', { class: 'hero-stage' },
        FF.reactor.create({ size: 'lg' }),
        chip('System status', 'All systems online', 'c1'),
        chip('Mission control', '10 modules ready', 'c2'),
        chip('Focus sequence', 'Standing by', 'c3')),
      el('h1', { class: 'hero-title' }, 'Your Day. Your Mission. ', el('span', { class: 'grad', text: 'Execute.' })),
      el('p', { class: 'hero-sub', text: 'A personal command center for your studies, tasks, schedules, goals, habits, notes, journal and expenses — running entirely in your browser.' }),
      el('div', { class: 'status-line hud-label' }, el('span', { class: 'status-dot' }), 'Local-only · No servers · Your data stays on this device'));
  }

  const noteIcon = document.getElementById('noteIcon');
  if (noteIcon) noteIcon.appendChild(FF.ui.icon(page === 'index' ? 'info' : 'shield'));
  document.querySelectorAll('#entryList li[data-icon]').forEach((li) => li.prepend(FF.ui.icon(li.dataset.icon)));

  /* ----------------------------------------------------------- Helpers */
  const msgBox = document.getElementById('formMsg');
  function showMsg(text, type) {
    if (!msgBox) return;
    msgBox.className = 'notice form-msg show ' + type;
    msgBox.textContent = '';
    msgBox.append(FF.ui.icon(type === 'success' ? 'check' : 'alert'), el('span', { text }));
  }
  function hideMsg() { if (msgBox) msgBox.className = 'notice form-msg'; }

  function showFieldErrors(errors, names) {
    let first = null;
    names.forEach((n) => {
      const input = document.getElementById(n);
      const out = document.getElementById(n + '-err');
      const msg = errors[n] || '';
      if (out) out.textContent = msg;
      if (input) {
        if (msg) { input.setAttribute('aria-invalid', 'true'); if (!first) first = input; }
        else input.removeAttribute('aria-invalid');
      }
    });
    if (errors._form) showMsg(errors._form, 'error'); else if (!first) hideMsg();
    if (first) first.focus();
  }

  if (!FF.auth.cryptoOk() && msgBox) {
    showMsg('This page cannot use Web Crypto, which is needed to hash demo passwords. Open FocusFlow through http://localhost (VS Code Live Server) or https instead of an unsupported context.', 'error');
  }

  // Show/hide password buttons
  document.querySelectorAll('.pw-toggle').forEach((btn) => {
    const input = document.getElementById(btn.dataset.toggle);
    const labelBase = btn.getAttribute('aria-label').replace(/^Show /, '');
    const paint = (visible) => {
      btn.textContent = '';
      btn.appendChild(FF.ui.icon(visible ? 'eyeOff' : 'eye'));
      btn.setAttribute('aria-label', (visible ? 'Hide ' : 'Show ') + labelBase);
      btn.setAttribute('aria-pressed', String(visible));
    };
    paint(false);
    btn.addEventListener('click', () => {
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      paint(show);
      input.focus();
    });
  });

  async function runDemo(btn) {
    btn.disabled = true;
    const r = await FF.auth.loginDemo();
    if (r.ok) window.location.replace('dashboard.html');
    else { btn.disabled = false; showMsg((r.errors && r.errors._form) || 'Could not start the demo account.', 'error'); }
  }
  const demoBtn = document.getElementById('demoBtn');
  if (demoBtn) demoBtn.addEventListener('click', () => runDemo(demoBtn));

  /* ------------------------------------------------------------- Login */
  if (page === 'login') {
    const form = document.getElementById('loginForm');
    const params = new URLSearchParams(window.location.search);
    if (params.get('registered')) {
      showMsg('Account created. Sign in to launch your dashboard.', 'success');
      const e = params.get('email');
      if (e) document.getElementById('email').value = e;
      document.getElementById('password').focus();
    }
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      hideMsg();
      const btn = document.getElementById('submitBtn');
      const values = {
        email: form.email.value, password: form.password.value, remember: document.getElementById('remember').checked
      };
      btn.disabled = true; btn.textContent = 'Verifying…';
      let r;
      try { r = await FF.auth.login(values); }
      catch (err) { r = { ok: false, errors: { _form: 'Something went wrong while signing in. Please try again.' } }; console.error(err); }
      if (r.ok) { showMsg('Access granted. Launching dashboard…', 'success'); window.location.replace('dashboard.html'); return; }
      btn.disabled = false; btn.textContent = 'Sign in';
      showFieldErrors(r.errors, ['email', 'password']);
    });

    document.getElementById('resetBtn').addEventListener('click', async () => {
      const ok = await FF.ui.confirm({
        title: 'Reset all local demo data?',
        message: 'This permanently deletes every FocusFlow account and all of its tasks, notes, journal entries and other data stored in this browser. It cannot be undone.',
        confirmText: 'Delete everything', danger: true
      });
      if (!ok) return;
      FF.auth.resetEverything();
      FF.ui.toast('All local FocusFlow data was cleared. You can create a new account.', 'success');
      showMsg('Local data cleared — create a new account to begin again.', 'success');
    });
  }

  /* ------------------------------------------------------------ Signup */
  if (page === 'signup') {
    const form = document.getElementById('signupForm');
    const strengthBox = document.getElementById('strength');
    const strengthText = document.getElementById('pw-strength-text');
    const pw = document.getElementById('password');
    const confirm = document.getElementById('confirm');

    pw.addEventListener('input', () => {
      const s = FF.auth.strength(pw.value);
      strengthBox.dataset.score = pw.value ? String(s.score) : '-1';
      strengthText.textContent = pw.value ? 'Password strength: ' + s.label : '';
      if (confirm.value) checkConfirm();
    });
    function checkConfirm() {
      const out = document.getElementById('confirm-err');
      if (confirm.value && confirm.value !== pw.value) { out.textContent = 'Passwords do not match.'; confirm.setAttribute('aria-invalid', 'true'); }
      else { out.textContent = ''; confirm.removeAttribute('aria-invalid'); }
    }
    confirm.addEventListener('input', checkConfirm);

    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      hideMsg();
      const btn = document.getElementById('submitBtn');
      btn.disabled = true; btn.textContent = 'Creating…';
      let r;
      try {
        r = await FF.auth.signup({ name: form.name.value, email: form.email.value, password: pw.value, confirm: confirm.value });
      } catch (err) { r = { ok: false, errors: { _form: 'Something went wrong while creating the account. Please try again.' } }; console.error(err); }
      if (r.ok) {
        showMsg('Account created! Redirecting you to sign in…', 'success');
        setTimeout(() => window.location.replace('login.html?registered=1&email=' + encodeURIComponent(r.account.email)), 900);
        return;
      }
      btn.disabled = false; btn.textContent = 'Create account';
      showFieldErrors(r.errors, ['name', 'email', 'password', 'confirm']);
    });
  }
})();
