/* ==========================================================================
   FocusFlow — services.js
   Web Audio alarm sounds (synthesized, no asset files) and Notifications API.
   ========================================================================== */
(function () {
  'use strict';
  const FF = window.FF;

  /* ------------------------------------------------------------------ Audio */
  let ctx = null;
  let gesture = false;   // browsers only allow audio after a user gesture; never create the context before that

  function getCtx() {
    if (ctx) return ctx;
    if (!gesture) return null;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try { ctx = new AC(); } catch (e) { ctx = null; }
    return ctx;
  }

  /** Each tone is a short pattern of [frequency Hz, start s, duration s]. */
  const TONES = {
    beacon: { label: 'Beacon', wave: 'sine', gain: .5, length: 1.2, notes: [[880, 0, .2], [1175, .22, .2], [880, .44, .2], [1175, .66, .3]] },
    pulse: { label: 'Pulse', wave: 'triangle', gain: .55, length: 1.0, notes: [[660, 0, .12], [660, .2, .12], [660, .4, .12], [990, .62, .3]] },
    chime: { label: 'Chime', wave: 'sine', gain: .45, length: 1.6, notes: [[1046, 0, .5], [1318, .25, .5], [1568, .5, .8]] },
    klaxon: { label: 'Klaxon (urgent)', wave: 'sawtooth', gain: .28, length: 1.2, notes: [[520, 0, .28], [380, .3, .28], [520, .6, .28], [380, .9, .28]] }
  };

  function playOnce(toneName, volume) {
    const c = getCtx();
    if (!c || c.state !== 'running') return false;
    const tone = TONES[toneName] || TONES.beacon;
    const t0 = c.currentTime + 0.02;
    tone.notes.forEach(([freq, start, dur]) => {
      const osc = c.createOscillator();
      const g = c.createGain();
      osc.type = tone.wave;
      osc.frequency.value = freq;
      const peak = Math.max(0.0001, tone.gain * volume);
      g.gain.setValueAtTime(0.0001, t0 + start);
      g.gain.exponentialRampToValueAtTime(peak, t0 + start + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + start + dur);
      osc.connect(g).connect(c.destination);
      osc.start(t0 + start);
      osc.stop(t0 + start + dur + 0.05);
    });
    return true;
  }

  FF.audio = {
    TONES,
    supported() { return !!(window.AudioContext || window.webkitAudioContext); },
    /** 'running' | 'suspended' | 'unsupported' | 'idle' */
    state() { if (!FF.audio.supported()) return 'unsupported'; return ctx ? ctx.state : 'idle'; },
    /** true once a user gesture has allowed audio on this page load */
    ready() { return gesture && !!getCtx(); },
    /** Must be called from a user gesture at least once so later alarms are allowed to make sound. */
    unlock() {
      gesture = true;
      const c = getCtx();
      if (c && c.state === 'suspended') c.resume().catch(() => {});
    },
    soundEnabled() { return FF.store.settings().sound.enabled; },
    /** One-shot preview or completion sound. Returns false if nothing could be played. */
    play(toneName, { force = false } = {}) {
      const s = FF.store.settings().sound;
      if (!s.enabled && !force) return false;
      const c = getCtx();
      if (c && c.state === 'suspended') c.resume().catch(() => {});
      return playOnce(toneName || s.tone, s.volume);
    },
    /** Repeats a tone until stop() is called (alarms). */
    loop(toneName, maxSeconds = 90) {
      const s = FF.store.settings().sound;
      if (!s.enabled) return { stop() {}, played: false };
      const tone = TONES[toneName] || TONES[s.tone] || TONES.beacon;
      const c = getCtx();
      if (c && c.state === 'suspended') c.resume().catch(() => {});
      const played = playOnce(toneName, s.volume);
      const started = Date.now();
      const timer = setInterval(() => {
        if (Date.now() - started > maxSeconds * 1000) { clearInterval(timer); return; }
        playOnce(toneName, s.volume);
      }, (tone.length + 0.8) * 1000);
      return { stop() { clearInterval(timer); }, played };
    }
  };

  // Unlock audio on the first interaction anywhere in the app.
  const unlockOnce = () => {
    FF.audio.unlock();
    ['pointerdown', 'keydown', 'touchstart'].forEach((e) => window.removeEventListener(e, unlockOnce, true));
  };
  ['pointerdown', 'keydown', 'touchstart'].forEach((e) => window.addEventListener(e, unlockOnce, true));

  /* ---------------------------------------------------------- Notifications */
  FF.notify = {
    supported() { return 'Notification' in window; },
    permission() { return FF.notify.supported() ? Notification.permission : 'unsupported'; },
    /** Only call from a click handler — browsers require a user gesture. */
    async request() {
      if (!FF.notify.supported()) return 'unsupported';
      try { return await Notification.requestPermission(); } catch (e) { return Notification.permission; }
    },
    enabled() { return FF.notify.permission() === 'granted' && FF.store.settings().notifications.browser; },
    show(title, body, tag) {
      if (!FF.notify.enabled()) return false;
      try { new Notification(title, { body, tag, icon: 'assets/icons/favicon.svg', silent: true }); return true; }
      catch (e) { return false; /* e.g. Android Chrome requires a service worker */ }
    },
    describe() {
      switch (FF.notify.permission()) {
        case 'unsupported': return 'This browser does not support the Notifications API. In-app alerts still work.';
        case 'granted': return 'Browser notifications are allowed for this site.';
        case 'denied': return 'Notifications are blocked. Re-enable them from the site settings in your browser (usually the lock icon in the address bar).';
        default: return 'Browser notifications have not been enabled yet.';
      }
    }
  };
})();
