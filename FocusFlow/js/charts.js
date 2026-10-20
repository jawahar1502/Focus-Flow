/* ==========================================================================
   FocusFlow — charts.js
   Small dependency-free SVG chart helpers (bars, line, donut).
   Every chart gets an aria-label and per-point <title> tooltips; callers also
   render a text summary so meaning never depends on color alone.
   ========================================================================== */
(function () {
  'use strict';
  const FF = window.FF;
  const { svg, util } = FF;

  function niceMax(v) {
    if (v <= 1) return 1;
    const p = Math.pow(10, Math.floor(Math.log10(v)));
    const f = v / p;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
  }

  const fmtDefault = (v) => (Number.isInteger(v) ? String(v) : v.toFixed(1));

  /**
   * Grouped vertical bars.
   * data: [{label, values:[a, b?]}]  series: [{name, accent}]
   */
  function bars({ data, series = [{ name: 'Value', accent: 'cyan' }], height = 210, ariaLabel = 'Bar chart', format = fmtDefault }) {
    const W = 600, H = height, padL = 38, padR = 8, padT = 20, padB = 28;
    const n = data.length;
    const maxVal = niceMax(Math.max(1, ...data.flatMap((d) => d.values)));
    const plotW = W - padL - padR, plotH = H - padT - padB;
    const slot = plotW / Math.max(1, n);
    const barW = Math.max(3, Math.min((slot * 0.72) / series.length, 34));
    const groupW = barW * series.length + (series.length - 1) * 3;
    const root = svg('svg', { class: 'chart', viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': ariaLabel, preserveAspectRatio: 'xMidYMid meet' });
    const defs = svg('defs');
    const gids = series.map((s, i) => { const id = util.uid('bg' + i); defs.appendChild(FF.ui.gradientDef(id, s.accent, 'v')); return id; });
    root.appendChild(defs);

    [0, 0.5, 1].forEach((f) => {
      const y = padT + plotH * (1 - f);
      root.appendChild(svg('line', { x1: padL, x2: W - padR, y1: y, y2: y, class: 'chart-grid' }));
      const t = svg('text', { x: padL - 6, y: y + 3.5, class: 'chart-text', 'text-anchor': 'end' });
      t.textContent = format(maxVal * f);
      root.appendChild(t);
    });

    const labelStep = Math.ceil(n / 12);
    data.forEach((d, i) => {
      const x0 = padL + slot * i + (slot - groupW) / 2;
      d.values.forEach((v, si) => {
        const h = v > 0 ? Math.max(2, (v / maxVal) * plotH) : 0;
        const x = x0 + si * (barW + 3);
        const y = padT + plotH - h;
        if (v > 0) {
          const r = svg('rect', { x, y, width: barW, height: h, rx: 3, fill: 'url(#' + gids[si] + ')', class: 'chart-bar' });
          r.appendChild(svg('title', null, d.label + ' — ' + series[si].name + ': ' + format(v)));
          root.appendChild(r);
          if (n <= 14) {
            const t = svg('text', { x: x + barW / 2, y: y - 4, class: 'chart-val', 'text-anchor': 'middle' });
            t.textContent = format(v);
            root.appendChild(t);
          }
        } else {
          root.appendChild(svg('rect', { x, y: padT + plotH - 1.5, width: barW, height: 1.5, class: 'chart-zero' }));
        }
      });
      if (i % labelStep === 0) {
        const t = svg('text', { x: padL + slot * i + slot / 2, y: H - 8, class: 'chart-text', 'text-anchor': 'middle' });
        t.textContent = d.label;
        root.appendChild(t);
      }
    });
    return root;
  }

  /** Area/line chart. points: [{label, value}] */
  function line({ points, accent = 'cyan', height = 190, ariaLabel = 'Line chart', format = fmtDefault }) {
    const W = 600, H = height, padL = 38, padR = 12, padT = 18, padB = 28;
    const n = points.length;
    const maxVal = niceMax(Math.max(1, ...points.map((p) => p.value)));
    const plotW = W - padL - padR, plotH = H - padT - padB;
    const xAt = (i) => padL + (n === 1 ? plotW / 2 : (plotW * i) / (n - 1));
    const yAt = (v) => padT + plotH * (1 - v / maxVal);
    const root = svg('svg', { class: 'chart', viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': ariaLabel, preserveAspectRatio: 'xMidYMid meet' });
    const gid = util.uid('lg');
    const defs = svg('defs', null, FF.ui.gradientDef(gid, accent, 'v'));
    root.appendChild(defs);
    [0, 0.5, 1].forEach((f) => {
      const y = padT + plotH * (1 - f);
      root.appendChild(svg('line', { x1: padL, x2: W - padR, y1: y, y2: y, class: 'chart-grid' }));
      const t = svg('text', { x: padL - 6, y: y + 3.5, class: 'chart-text', 'text-anchor': 'end' });
      t.textContent = format(maxVal * f);
      root.appendChild(t);
    });
    const coords = points.map((p, i) => [xAt(i), yAt(p.value)]);
    const path = coords.map((c, i) => (i ? 'L' : 'M') + c[0].toFixed(1) + ' ' + c[1].toFixed(1)).join(' ');
    const area = path + ' L' + coords[n - 1][0].toFixed(1) + ' ' + (padT + plotH) + ' L' + coords[0][0].toFixed(1) + ' ' + (padT + plotH) + ' Z';
    root.appendChild(svg('path', { d: area, fill: 'url(#' + gid + ')', opacity: .22 }));
    root.appendChild(svg('path', { d: path, fill: 'none', stroke: FF.ui.solid(accent), 'stroke-width': 2.4, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
    const labelStep = Math.ceil(n / 10);
    points.forEach((p, i) => {
      const dot = svg('circle', { cx: coords[i][0], cy: coords[i][1], r: n > 40 ? 1.8 : 3.2, fill: '#0B0D18', stroke: FF.ui.solid(accent), 'stroke-width': 1.8 });
      dot.appendChild(svg('title', null, p.label + ': ' + format(p.value)));
      root.appendChild(dot);
      if (i % labelStep === 0) {
        const t = svg('text', { x: coords[i][0], y: H - 8, class: 'chart-text', 'text-anchor': i === n - 1 && n > 3 ? 'end' : 'middle' });
        t.textContent = p.label;
        root.appendChild(t);
      }
    });
    return root;
  }

  /** Donut. data: [{label, value, accent}] */
  function donut({ data, size = 190, thickness = 24, centerLabel = '', centerSub = '', ariaLabel = 'Donut chart' }) {
    const total = util.sum(data, (d) => d.value);
    const r = (size - thickness) / 2, C = 2 * Math.PI * r, c = size / 2;
    const root = svg('svg', { class: 'chart donut', viewBox: '0 0 ' + size + ' ' + size, role: 'img', 'aria-label': ariaLabel, width: size, height: size });
    root.appendChild(svg('circle', { cx: c, cy: c, r, fill: 'none', stroke: 'rgba(255,255,255,.07)', 'stroke-width': thickness }));
    let offset = 0;
    if (total > 0) {
      data.forEach((d) => {
        if (d.value <= 0) return;
        const len = (d.value / total) * C;
        const gap = data.filter((x) => x.value > 0).length > 1 ? 2 : 0;
        const seg = svg('circle', {
          cx: c, cy: c, r, fill: 'none', stroke: FF.ui.solid(d.accent), 'stroke-width': thickness,
          'stroke-dasharray': Math.max(0.1, len - gap).toFixed(2) + ' ' + (C - Math.max(0.1, len - gap)).toFixed(2),
          'stroke-dashoffset': (-offset).toFixed(2), transform: 'rotate(-90 ' + c + ' ' + c + ')'
        });
        seg.appendChild(svg('title', null, d.label + ': ' + Math.round((d.value / total) * 100) + '%'));
        root.appendChild(seg);
        offset += len;
      });
    }
    const t1 = svg('text', { x: c, y: c + 2, 'text-anchor': 'middle', class: 'donut-main' });
    t1.textContent = centerLabel;
    const t2 = svg('text', { x: c, y: c + 20, 'text-anchor': 'middle', class: 'chart-text' });
    t2.textContent = centerSub;
    root.append(t1, t2);
    return root;
  }

  FF.charts = { bars, line, donut, niceMax };
})();
