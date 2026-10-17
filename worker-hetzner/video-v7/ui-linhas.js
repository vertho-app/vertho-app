// Linhas da marca (o traço condutor do brand book): escrito no piloto "Seu atalho é uma pista" (15/10/2026), usado pela biblioteca v7.
window.UI = (function () {
  function segs(P) {
    const n = (P.length - 1) / 3, L = [];
    let tot = 0;
    for (let i = 0; i < n; i++) {
      const a = P[3 * i], b = P[3 * i + 1], c = P[3 * i + 2], d = P[3 * i + 3];
      const l = (Math.hypot(b[0] - a[0], b[1] - a[1]) + Math.hypot(c[0] - b[0], c[1] - b[1]) + Math.hypot(d[0] - c[0], d[1] - c[1]) + Math.hypot(d[0] - a[0], d[1] - a[1])) / 2;
      L.push(l); tot += l;
    }
    return { n, L, tot };
  }
  function cub(a, b, c, d, s) {
    const u = 1 - s, A = u * u * u, B = 3 * u * u * s, C = 3 * u * s * s, D = s * s * s;
    return [A * a[0] + B * b[0] + C * c[0] + D * d[0], A * a[1] + B * b[1] + C * c[1] + D * d[1]];
  }
  function at(P, info, s) {
    let x = Math.max(0, Math.min(1, s)) * info.tot;
    for (let i = 0; i < info.n; i++) {
      if (x <= info.L[i] || i === info.n - 1) return cub(P[3 * i], P[3 * i + 1], P[3 * i + 2], P[3 * i + 3], Math.min(1, x / (info.L[i] || 1)));
      x -= info.L[i];
    }
  }
  // the process line: straight at y, with detours [x, height] (height 0 = flat)
  function bumps(y, b) {
    const P = [[-80, y]];
    const flat = (x2) => { const a = P[P.length - 1]; P.push([a[0] + (x2 - a[0]) / 3, y], [a[0] + 2 * (x2 - a[0]) / 3, y], [x2, y]); };
    for (const [x, h] of b) {
      flat(x - 150);
      P.push([x - 95, y], [x - 95, y - h], [x - 40, y - h]);
      P.push([x - 13, y - h], [x + 13, y - h], [x + 40, y - h]);
      P.push([x + 95, y - h], [x + 95, y], [x + 150, y]);
    }
    flat(2000);
    return P;
  }
  function mix(A, B, p) { return A.map((q, i) => [q[0] + (B[i][0] - q[0]) * p, q[1] + (B[i][1] - q[1]) * p]); }
  // the brand mark: n thin lines along a spine, main to accent, crossing at one point
  function lines(kit, id, o) {
    o = Object.assign({ n: 5, gap: 12, w: 3.2, steps: 90, c1: 'var(--main)', c2: 'var(--accent)' }, o);
    let paths = '';
    for (let i = 0; i < o.n; i++) paths += '<path fill="none" stroke-linecap="round" stroke-linejoin="round" stroke="url(#' + id + '-g)"/>';
    const svg = kit.h('<svg class="trace" viewBox="0 0 1920 1080"><defs><linearGradient id="' + id + '-g" gradientUnits="userSpaceOnUse"><stop offset="0" style="stop-color:' + o.c1 + '"/><stop offset="0.6" style="stop-color:' + o.c1 + '"/><stop offset="1" style="stop-color:' + o.c2 + '"/></linearGradient></defs>' + paths + '</svg>');
    (o.parent || kit.stage).append(svg);
    const g = svg.querySelector('linearGradient'), ps = Array.from(svg.querySelectorAll('path')), mid = (o.n - 1) / 2;
    ps.forEach((p, i) => { const k = Math.abs(i - mid) / Math.max(mid, 1); p.setAttribute('stroke-width', (o.w * (1 - 0.5 * k)).toFixed(2)); p.setAttribute('opacity', (1 - 0.45 * k).toFixed(2)); });
    return {
      svg,
      set(st) {
        const P = st.P, info = segs(P);
        const head = st.head == null ? 1 : st.head, tail = st.tail || 0, cross = st.cross == null ? 0.5 : st.cross;
        const spread = st.spread == null ? 1 : st.spread, t = st.t || 0, wave = st.wave == null ? 1 : st.wave;
        const a = at(P, info, 0), b = at(P, info, 1);
        g.setAttribute('x1', a[0]); g.setAttribute('y1', a[1]); g.setAttribute('x2', b[0]); g.setAttribute('y2', b[1]);
        svg.style.opacity = st.op == null ? 1 : st.op;
        ps.forEach((p, i) => {
          if (head - tail < 0.001) { p.setAttribute('d', ''); return; }
          const k = i - mid; let d = '';
          for (let j = 0; j <= o.steps; j++) {
            const s = tail + (head - tail) * j / o.steps, q = at(P, info, s), q1 = at(P, info, s - 0.003), q2 = at(P, info, s + 0.003);
            let tx = q2[0] - q1[0], ty = q2[1] - q1[1]; const L = Math.hypot(tx, ty) || 1; tx /= L; ty /= L;
            const off = k * o.gap * spread * Math.max(-1, Math.min(1, (s - cross) / 0.4)) + wave * 4 * Math.sin(6.2832 * (q[0] / 1500 + t * 0.21 + i * 0.37));
            d += (j ? 'L' : 'M') + (q[0] - ty * off).toFixed(1) + ' ' + (q[1] + tx * off).toFixed(1);
          }
          p.setAttribute('d', d);
        });
      },
    };
  }
  return { at: (P, s) => at(P, segs(P), s), bumps, mix, lines, LINE: bumps(720, []) };
})();