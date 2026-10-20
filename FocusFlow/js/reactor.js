/* ==========================================================================
   FocusFlow — reactor.js
   Original reactor-inspired visualization + brand emblem (pure SVG + CSS 3D).
   Rings are separate <svg> layers at different translateZ depths; the CSS in
   animations.css rotates them and sways the whole body in perspective.
   ========================================================================== */
(function () {
  'use strict';
  const FF = window.FF;
  const { el, svg, util } = FF;

  const CYAN = '#57F0F5', BLUE = '#42B8FF', RED = '#FF595E', GOLD = '#FFD166';

  function dashed(r, n, dash) {
    const C = 2 * Math.PI * r;
    return dash + ' ' + (C / n - dash).toFixed(3);
  }
  function polygon(cx, cy, r, sides, rotateDeg) {
    const pts = [];
    for (let i = 0; i < sides; i++) {
      const a = (rotateDeg + (i * 360) / sides) * Math.PI / 180;
      pts.push((cx + r * Math.cos(a)).toFixed(2) + ',' + (cy + r * Math.sin(a)).toFixed(2));
    }
    return pts.join(' ');
  }
  const layer = (cls, ...kids) => svg('svg', { class: 'ring ' + cls, viewBox: '0 0 200 200', 'aria-hidden': 'true', focusable: 'false' }, ...kids);

  /** size: '' (220px) | 'lg' | 'sm' | 'xs' */
  function create({ size = '', active } = {}) {
    const notches = [0, 90, 180, 270].map((deg) =>
      svg('rect', { x: 98, y: 1, width: 4, height: 10, fill: RED, transform: 'rotate(' + deg + ' 100 100)', opacity: .9 }));

    const r1 = layer('r1',
      svg('circle', { cx: 100, cy: 100, r: 97, fill: 'none', stroke: CYAN, 'stroke-width': .6, opacity: .4 }),
      svg('circle', { cx: 100, cy: 100, r: 91, fill: 'none', stroke: CYAN, 'stroke-width': 6, 'stroke-dasharray': dashed(91, 48, 1.4), opacity: .55 }),
      ...notches);

    const r2 = layer('r2',
      svg('circle', { cx: 100, cy: 100, r: 82, fill: 'none', stroke: CYAN, 'stroke-width': 3, 'stroke-linecap': 'round', 'stroke-dasharray': dashed(82, 3, 112), opacity: .85 }),
      svg('circle', { cx: 100, cy: 100, r: 75, fill: 'none', stroke: BLUE, 'stroke-width': .7, opacity: .6 }));

    const r3 = layer('r3',
      svg('circle', { cx: 100, cy: 100, r: 66, fill: 'none', stroke: RED, 'stroke-width': 2, 'stroke-dasharray': dashed(66, 6, 36), opacity: .85 }),
      svg('polygon', { points: polygon(100, 100, 58, 6, -90), fill: 'none', stroke: GOLD, 'stroke-width': .8, opacity: .55 }));

    const r4 = layer('r4',
      svg('circle', { cx: 100, cy: 100, r: 46, fill: 'rgba(6,10,24,.55)', stroke: CYAN, 'stroke-width': 1.2, opacity: .8 }),
      svg('circle', { cx: 100, cy: 100, r: 40, fill: 'none', stroke: BLUE, 'stroke-width': .8, 'stroke-dasharray': '2 3', opacity: .7 }),
      svg('polygon', { points: polygon(100, 100, 34, 3, -90), fill: 'none', stroke: CYAN, 'stroke-width': .8, opacity: .55 }));

    const orbit = (cls) => el('div', { class: 'orbit ' + cls }, el('i'));

    const root = el('div', { class: ('reactor ' + size).trim(), role: 'img', 'aria-label': 'Animated reactor core visualization' },
      el('div', { class: 'reactor-body' },
        el('div', { class: 'reactor-halo' }), r1, r2, r3, r4, orbit('o1'), orbit('o2'), orbit('o3'), el('div', { class: 'reactor-core' })));

    const isActive = active != null ? active : !!(FF.timer && FF.timer.isRunning && FF.timer.isRunning());
    root.classList.toggle('is-active', isActive);
    return root;
  }

  /** Brand emblem: hexagon frame, three energy arcs and a glowing core. */
  function emblem(px = 36) {
    const gid = util.uid('em');
    const C = 2 * Math.PI * 17;
    return svg('svg', { class: 'emblem', width: px, height: px, viewBox: '0 0 48 48', role: 'img', 'aria-label': 'FocusFlow emblem' },
      svg('defs', null,
        svg('linearGradient', { id: gid, x1: 0, y1: 0, x2: 1, y2: 1 },
          svg('stop', { offset: '0%', 'stop-color': '#FF595E' }), svg('stop', { offset: '100%', 'stop-color': '#B91C1C' })),
        svg('radialGradient', { id: gid + 'c' },
          svg('stop', { offset: '0%', 'stop-color': '#fff' }), svg('stop', { offset: '45%', 'stop-color': CYAN }), svg('stop', { offset: '100%', 'stop-color': BLUE }))),
      svg('polygon', { points: polygon(24, 24, 21.5, 6, -90), fill: 'rgba(87,240,245,.06)', stroke: CYAN, 'stroke-width': 1.6, 'stroke-linejoin': 'round' }),
      svg('circle', { cx: 24, cy: 24, r: 17, fill: 'none', stroke: 'url(#' + gid + ')', 'stroke-width': 3.2, 'stroke-linecap': 'round', 'stroke-dasharray': (C / 3 - 5).toFixed(2) + ' 5', transform: 'rotate(-90 24 24)' }),
      svg('circle', { cx: 24, cy: 24, r: 10, fill: 'none', stroke: GOLD, 'stroke-width': 1, opacity: .8 }),
      svg('circle', { cx: 24, cy: 24, r: 5.5, fill: 'url(#' + gid + 'c)' }));
  }

  /** Keep every reactor on the page in sync with the focus timer. */
  function setAllActive(on) {
    document.querySelectorAll('.reactor').forEach((r) => r.classList.toggle('is-active', !!on));
  }
  FF.bus.on('timer:state', (s) => setAllActive(s && s.status === 'running' && s.mode === 'focus'));
  FF.bus.on('alarm:ringing', (on) => document.querySelectorAll('.reactor').forEach((r) => r.classList.toggle('is-alert', !!on)));

  FF.reactor = { create, emblem, setAllActive };
})();
