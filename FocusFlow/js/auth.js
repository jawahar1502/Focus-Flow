/* ==========================================================================
   FocusFlow — auth.js
   FRONTEND-ONLY DEMO AUTHENTICATION.

   This is NOT real security. Everything lives in this browser's localStorage,
   and anyone with access to the browser profile can read, edit or delete it.
   What it does provide:
     • Separate productivity data per demo account (stable account id).
     • Passwords are never stored in plaintext — a random salt + PBKDF2-SHA256
       hash (Web Crypto) is stored instead, so the demo behaves like a real flow.
     • A session that ends when the tab closes unless "Remember me" is chosen.
   Do not reuse a real password here and do not store sensitive personal data.
   ========================================================================== */
(function () {
  'use strict';
  const FF = window.FF;
  const { util } = FF;

  const ACCOUNTS = 'accounts';
  const SESSION = 'session';
  const PBKDF2_ITERATIONS = 120000;
  const FAIL_KEY = 'ff:v1:login-fails';
  const MAX_FAILS = 5;
  const LOCK_MS = 30000;

  const DEMO = { name: 'Demo Pilot', email: 'demo@focusflow.local', password: 'demo-focusflow-1' };

  const enc = new TextEncoder();
  const cryptoOk = () => !!(window.crypto && window.crypto.subtle && window.crypto.getRandomValues);

  function toB64(buf) {
    let s = '';
    new Uint8Array(buf).forEach((b) => { s += String.fromCharCode(b); });
    return btoa(s);
  }
  function fromB64(str) {
    const bin = atob(str);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  async function derive(password, salt, iterations) {
    const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, key, 256);
    return toB64(bits);
  }
  function safeEqual(a, b) {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
  }

  function accounts() {
    const list = FF.store.global.get(ACCOUNTS, []);
    return Array.isArray(list) ? list : [];
  }
  const publicView = (a) => ({ id: a.id, name: a.name, email: a.email, createdAt: a.createdAt });

  /** Rough strength estimate (advisory only). Returns {score 0–4, label}. */
  function strength(pw) {
    let pts = 0;
    if (pw.length >= 8) pts++;
    if (pw.length >= 12) pts++;
    if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) pts++;
    if (/\d/.test(pw)) pts++;
    if (/[^A-Za-z0-9]/.test(pw)) pts++;
    if (/^(.)\1+$/.test(pw) || /^(password|12345678|qwerty|letmein)/i.test(pw)) pts = Math.min(pts, 1);
    const score = pw.length === 0 ? 0 : util.clamp(pts - 1, 0, 4);
    return { score, label: pw.length === 0 ? '' : ['Very weak', 'Weak', 'Fair', 'Good', 'Strong'][score] };
  }

  function validatePassword(pw) {
    if (pw.length < 8) return 'Use at least 8 characters.';
    if (pw.length > 128) return 'Password is too long (max 128 characters).';
    if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return 'Include at least one letter and one number.';
    return '';
  }

  /* ------------------------------------------------------------- Sessions */
  function readSession() {
    try {
      const s = sessionStorage.getItem('ff:v1:' + SESSION);
      if (s) return JSON.parse(s);
    } catch (e) { /* fall through */ }
    return FF.store.global.get(SESSION, null);
  }
  function writeSession(account, remember) {
    clearSession();
    const data = { accountId: account.id, startedAt: Date.now(), remember: !!remember };
    if (remember) FF.store.global.set(SESSION, data);
    else { try { sessionStorage.setItem('ff:v1:' + SESSION, JSON.stringify(data)); } catch (e) { FF.store.global.set(SESSION, data); } }
  }
  function clearSession() {
    try { sessionStorage.removeItem('ff:v1:' + SESSION); } catch (e) { /* ignore */ }
    FF.store.global.remove(SESSION);
  }

  function currentUser() {
    const s = readSession();
    if (!s || typeof s.accountId !== 'string') return null;
    const acct = accounts().find((a) => a.id === s.accountId);
    if (!acct) { clearSession(); return null; }
    return publicView(acct);
  }

  /* ---------------------------------------------------------- Throttling */
  function failState() {
    try { return JSON.parse(sessionStorage.getItem(FAIL_KEY)) || { n: 0, until: 0 }; } catch (e) { return { n: 0, until: 0 }; }
  }
  function setFailState(s) { try { sessionStorage.setItem(FAIL_KEY, JSON.stringify(s)); } catch (e) { /* ignore */ } }

  /* ----------------------------------------------------------------- API */
  const auth = {
    DEMO, cryptoOk, strength, validatePassword, currentUser,

    /** Returns {ok:true, account} or {ok:false, errors:{field:msg,_form:msg}} */
    async signup({ name, email, password, confirm }) {
      const errors = {};
      name = String(name || '').trim();
      email = String(email || '').trim().toLowerCase();
      password = String(password || '');
      if (!name) errors.name = 'Enter your full name.';
      else if (name.length > 60) errors.name = 'Name must be 60 characters or fewer.';
      if (!email) errors.email = 'Enter your email address.';
      else if (!util.isEmail(email)) errors.email = 'Enter a valid email address.';
      const pwErr = password ? auth.validatePassword(password) : 'Create a password.';
      if (pwErr) errors.password = pwErr;
      if (!errors.password && confirm !== password) errors.confirm = 'Passwords do not match.';
      if (!errors.email && accounts().some((a) => a.email === email)) errors.email = 'A demo account with this email already exists in this browser.';
      if (Object.keys(errors).length) return { ok: false, errors };
      if (!cryptoOk()) return { ok: false, errors: { _form: 'Secure hashing (Web Crypto) is unavailable in this context. Open the app through http://localhost (Live Server) or https.' } };

      const salt = crypto.getRandomValues(new Uint8Array(16));
      const hash = await derive(password, salt, PBKDF2_ITERATIONS);
      const account = {
        id: util.uid('acct'), name, email, createdAt: new Date().toISOString(),
        salt: toB64(salt), hash, iterations: PBKDF2_ITERATIONS, algo: 'PBKDF2-SHA256'
      };
      const list = accounts();
      list.push(account);
      if (!FF.store.global.set(ACCOUNTS, list)) return { ok: false, errors: { _form: 'Could not save the account — browser storage is full or disabled.' } };
      return { ok: true, account: publicView(account) };
    },

    async login({ email, password, remember }) {
      const fs = failState();
      if (fs.until && Date.now() < fs.until) {
        return { ok: false, errors: { _form: 'Too many failed attempts. Try again in ' + Math.ceil((fs.until - Date.now()) / 1000) + ' seconds.' } };
      }
      email = String(email || '').trim().toLowerCase();
      password = String(password || '');
      const errors = {};
      if (!email) errors.email = 'Enter your email address.';
      else if (!util.isEmail(email)) errors.email = 'Enter a valid email address.';
      if (!password) errors.password = 'Enter your password.';
      if (Object.keys(errors).length) return { ok: false, errors };
      if (!cryptoOk()) return { ok: false, errors: { _form: 'Secure hashing (Web Crypto) is unavailable in this context. Open the app through http://localhost (Live Server) or https.' } };

      const acct = accounts().find((a) => a.email === email);
      let good = false;
      if (acct) {
        const h = await derive(password, fromB64(acct.salt), acct.iterations || PBKDF2_ITERATIONS);
        good = safeEqual(h, acct.hash);
      } else {
        await derive(password, new Uint8Array(16), PBKDF2_ITERATIONS); // keep timing similar
      }
      if (!good) {
        const n = fs.n + 1;
        setFailState({ n, until: n >= MAX_FAILS ? Date.now() + LOCK_MS : 0 });
        return { ok: false, errors: { _form: 'Incorrect email or password.' } };
      }
      setFailState({ n: 0, until: 0 });
      writeSession(acct, remember);
      return { ok: true, account: publicView(acct) };
    },

    /** One-click shared demo account (public password — never put private data in it). */
    async loginDemo() {
      if (!cryptoOk()) return { ok: false, errors: { _form: 'Web Crypto is unavailable in this context. Open the app through http://localhost (Live Server) or https.' } };
      if (!accounts().some((a) => a.email === DEMO.email)) {
        const r = await auth.signup({ name: DEMO.name, email: DEMO.email, password: DEMO.password, confirm: DEMO.password });
        if (!r.ok) return r;
      }
      return auth.login({ email: DEMO.email, password: DEMO.password, remember: false });
    },

    logout(redirect = true) {
      clearSession();
      FF.store.setAccount(null);
      if (redirect) window.location.replace('login.html');
    },

    /** Dashboard guard. NOTE: this is a convenience, not security — see header comment. */
    requireAuth() {
      const user = currentUser();
      if (!user) { window.location.replace('login.html'); return null; }
      FF.store.setAccount(user.id);
      return user;
    },
    redirectIfAuthed() {
      if (currentUser()) { window.location.replace('dashboard.html'); return true; }
      return false;
    },

    updateName(name) {
      const s = readSession();
      const list = accounts();
      const a = list.find((x) => s && x.id === s.accountId);
      if (!a) return false;
      a.name = String(name).trim().slice(0, 60);
      return FF.store.global.set(ACCOUNTS, list);
    },

    /** Delete the signed-in account and all of its data. */
    deleteCurrentAccount() {
      const s = readSession();
      if (!s) return;
      FF.store.wipeAccountById(s.accountId);
      FF.store.global.set(ACCOUNTS, accounts().filter((a) => a.id !== s.accountId));
      clearSession();
    },

    /** Forgot-password path for the demo: no email exists, so the only reset is wiping local data. */
    resetEverything() {
      FF.store.wipeEverything();
      try { sessionStorage.clear(); } catch (e) { /* ignore */ }
    },

    accountCount() { return accounts().length; }
  };

  FF.auth = auth;
})();
