// Executor próprio dos filmes da biblioteca v7 (vertho.ai, 17/10/2026).
// Implementa SÓ a parte da API de filme que os 23 modelos, as linhas da marca e a camada do montador usam,
// escrita a partir da documentação pública da API (film-api.md / rough-cut.md), sem código do player Motion.
// Tudo é função pura do tempo: render(t) pode ser chamado em qualquer ordem e devolve sempre o mesmo quadro.
(function () {
  'use strict';
  const W = 1920, H = 1080;

  // ── tempo e curvas ──────────────────────────────────────────────────────────
  const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const seg = (t, a, b) => (b === a ? (t >= b ? 1 : 0) : clamp01((t - a) / (b - a)));
  const lerp = (a, b, p) => a + (b - a) * p;
  const eo = (x) => 1 - Math.pow(1 - clamp01(x), 3);
  const ei = (x) => Math.pow(clamp01(x), 3);
  const eio = (x) => { x = clamp01(x); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
  const eob = (x, s = 1.4) => { x = clamp01(x); const c = s + 1; return 1 + c * Math.pow(x - 1, 3) + s * Math.pow(x - 1, 2); };
  const smoothstep = (a, b, x) => { const p = clamp01((x - a) / (b - a)); return p * p * (3 - 2 * p); };
  // gerador determinístico (mulberry32)
  const rng = (seed) => { let s = (seed >>> 0) || 1; return () => { s = (s + 0x6D2B79F5) >>> 0; let r = Math.imul(s ^ (s >>> 15), 1 | s); r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r; return ((r ^ (r >>> 14)) >>> 0) / 4294967296; }; };

  // ── DOM ─────────────────────────────────────────────────────────────────────
  const tpl = document.createElement('template');
  const h = (html) => { tpl.innerHTML = String(html).trim(); const el = tpl.content.firstElementChild; tpl.innerHTML = ''; return el; };
  const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  let STAGE = null;   // o palco principal (#stage), fixado pelo driver
  const srect = (node) => { const r = node.getBoundingClientRect(), s = STAGE.getBoundingClientRect(); return { x: r.left - s.left, y: r.top - s.top, w: r.width, h: r.height }; };
  // caixa de um trecho do texto de um elemento (atravessa os spans de palavra)
  function phraseRect(el, frase) {
    if (!frase) return null;
    const nos = [], walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let txt = '', n; while ((n = walker.nextNode())) { nos.push([n, txt.length]); txt += n.nodeValue; }
    const i = txt.indexOf(frase); if (i < 0) return null;
    const fim = i + frase.length, pega = (pos) => { for (let k = nos.length - 1; k >= 0; k--) if (nos[k][1] <= pos) return [nos[k][0], pos - nos[k][1]]; return [nos[0][0], 0]; };
    const [a, ao] = pega(i), [b, bo] = pega(fim);
    const rg = document.createRange(); rg.setStart(a, Math.min(ao, a.nodeValue.length)); rg.setEnd(b, Math.min(bo, b.nodeValue.length));
    const r = rg.getBoundingClientRect(), s = STAGE.getBoundingClientRect();
    return { x: r.left - s.left, y: r.top - s.top, w: r.width, h: r.height };
  }

  // ── texto ───────────────────────────────────────────────────────────────────
  // fadeFromRight: separa o texto em palavras UMA vez; cada palavra entra da direita com opacidade.
  // Calibrado no player (17/10): a separação é pelo TEXTO PURO do elemento (os elementos internos, como aspas
  // coloridas, viram parte da palavra vizinha); curva eo, 0,5 s por palavra, 0,11 s entre palavras, 26 px.
  const TextFx = {
    split(el) {
      if (el.__palavras) return el.__palavras;
      const lista = [], frag = document.createDocumentFragment();
      for (const p of el.textContent.split(/(\s+)/)) {
        if (!p) continue;
        if (/^\s+$/.test(p)) { frag.append(document.createTextNode(p)); continue; }
        const sp = document.createElement('span'); sp.textContent = p; sp.style.display = 'inline-block'; frag.append(sp); lista.push(sp);
      }
      el.replaceChildren(frag);
      el.__palavras = lista; return lista;
    },
    fadeFromRight(el, t, t0, o) {
      o = o || {}; const st = o.stagger == null ? 0.11 : o.stagger, dur = o.dur == null ? 0.5 : o.dur, dx = o.dx == null ? 26 : o.dx;
      const ws = TextFx.split(el);
      ws.forEach((w, i) => { const p = eo(seg(t, t0 + i * st, t0 + i * st + dur)); w.style.opacity = p.toFixed(3); w.style.transform = p >= 1 ? '' : 'translateX(' + ((1 - p) * dx).toFixed(2) + 'px)'; });
      return t0 + Math.max(0, ws.length - 1) * st + dur;
    },
  };
  // digitação: tempos por caractere com variação semeada. Calibrado no player (17/10, medindo só as saídas):
  // 1ª letra a ~0,77/cps do início; letra comum com intervalo de 0,5 a 1,35/cps (média ~0,93/cps); espaço ~2,1/cps;
  // pontuação sem pausa extra; o fim é o tempo da última letra.
  function typist(text, t0, cps = 24, seed = 7) {
    text = String(text); const r = rng(seed), times = []; let t = t0 + 0.766 / cps;
    for (let i = 0; i < text.length; i++) { if (i) t += (text[i] === ' ' ? 1.6 + r() : 0.5 + 0.85 * r()) / cps; times.push(t); }
    const end = text.length ? times[text.length - 1] : t0;
    const count = (tt) => { let k = 0; while (k < times.length && times[k] <= tt) k++; return k; };
    return { times, end, count, at: (tt) => text.slice(0, count(tt)) };
  }

  // ── marcações desenhadas à mão (círculo, sublinhado, seta, colchete, traço) ──────────────────
  const NS = 'http://www.w3.org/2000/svg';
  function geometria(m) {
    const g = typeof m.geom === 'function' ? Object.assign({}, m, m.geom()) : m;
    const r = rng(m.seed != null ? m.seed : (String(m.id || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0) || 3));
    const jit = (a) => (r() * 2 - 1) * a;
    let d = '', head = '';
    if (m.kind === 'circle') {
      const padX = g.padX != null ? g.padX : (g.pad || 0.12) * g.w, padY = g.padY != null ? g.padY : (g.pad || 0.12) * g.h;
      const cx = g.x + g.w / 2, cy = g.y + g.h / 2, rx = g.w / 2 + padX, ry = g.h / 2 + padY, tilt = (g.tilt != null ? g.tilt : jit(4)) * Math.PI / 180;
      // começa no alto à esquerda, por fora (uma ponta que entra), dá a volta no sentido horário e passa do início
      const a0 = -Math.PI * 0.82 + jit(0.1), volta = Math.PI * 2 * 1.1, N = 72;
      for (let i = 0; i <= N; i++) {
        const p = i / N, a = a0 + volta * p, k = 1 + 0.03 * Math.sin(p * Math.PI * 3 + 1.3) + (p < 0.08 ? 0.09 * (0.08 - p) / 0.08 : 0) - (p > 0.9 ? 0.04 * (p - 0.9) / 0.1 : 0);
        const x = rx * k * Math.cos(a), y = ry * k * Math.sin(a);
        d += (i ? 'L' : 'M') + (cx + x * Math.cos(tilt) - y * Math.sin(tilt)).toFixed(1) + ' ' + (cy + x * Math.sin(tilt) + y * Math.cos(tilt)).toFixed(1);
      }
    } else if (m.kind === 'underline') {
      const N = 40, wave = g.wave || 0, y0 = g.y + jit(1.5), y1 = g.y + jit(3);
      for (let i = 0; i <= N; i++) { const p = i / N, x = g.x - 6 + (g.w + 12) * p, y = lerp(y0, y1, p) + wave * 5 * Math.sin(p * Math.PI * Math.max(2, g.w / 70)); d += (i ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1); }
    } else if (m.kind === 'arrow') {
      const [x1, y1] = g.from, [x2, y2] = g.to, L = Math.hypot(x2 - x1, y2 - y1) || 1, nx = -(y2 - y1) / L, ny = (x2 - x1) / L, b = g.bend == null ? 0.2 : g.bend;
      // curva em S: o primeiro terço puxa para um lado, o último para o outro
      const c1x = x1 + (x2 - x1) * 0.35 + nx * b * L, c1y = y1 + (y2 - y1) * 0.35 + ny * b * L;
      const c2x = x1 + (x2 - x1) * 0.7 - nx * b * L * 0.7, c2y = y1 + (y2 - y1) * 0.7 - ny * b * L * 0.7;
      d = 'M' + x1.toFixed(1) + ' ' + y1.toFixed(1) + 'C' + c1x.toFixed(1) + ' ' + c1y.toFixed(1) + ' ' + c2x.toFixed(1) + ' ' + c2y.toFixed(1) + ' ' + x2.toFixed(1) + ' ' + y2.toFixed(1);
      const qx = c2x, qy = c2y, ang = Math.atan2(y2 - qy, x2 - qx), hl = 24;
      head = 'M' + (x2 - hl * Math.cos(ang - 0.5)).toFixed(1) + ' ' + (y2 - hl * Math.sin(ang - 0.5)).toFixed(1) + 'L' + x2.toFixed(1) + ' ' + y2.toFixed(1) + 'L' + (x2 - hl * Math.cos(ang + 0.5)).toFixed(1) + ' ' + (y2 - hl * Math.sin(ang + 0.5)).toFixed(1);
    } else if (m.kind === 'bracket') {
      const s = g.side === 'left' ? -1 : 1, x = g.x, y = g.y, hh = g.h, dx = 18 * s;
      d = 'M' + x + ' ' + y + 'Q' + (x + dx) + ' ' + y + ' ' + (x + dx) + ' ' + (y + 18) + 'L' + (x + dx) + ' ' + (y + hh / 2 - 12) + 'Q' + (x + dx) + ' ' + (y + hh / 2) + ' ' + (x + dx * 1.7) + ' ' + (y + hh / 2) + 'Q' + (x + dx) + ' ' + (y + hh / 2) + ' ' + (x + dx) + ' ' + (y + hh / 2 + 12) + 'L' + (x + dx) + ' ' + (y + hh - 18) + 'Q' + (x + dx) + ' ' + (y + hh) + ' ' + x + ' ' + (y + hh);
    } else if (m.kind === 'path') {
      (g.d || []).forEach(([x, y], i) => { d += (i ? 'L' : 'M') + (x + jit(1)).toFixed(1) + ' ' + (y + jit(1)).toFixed(1); });
    }
    return { d, head };
  }
  class Marks {
    constructor(svg) { this.svg = svg; this.ms = []; }
    add(m) {
      const g = document.createElementNS(NS, 'g'), p = document.createElementNS(NS, 'path'), ph = document.createElementNS(NS, 'path');
      for (const el of [p, ph]) { el.setAttribute('fill', 'none'); el.setAttribute('stroke', m.color || '#e5484d'); el.setAttribute('stroke-width', m.width || 10); el.setAttribute('stroke-linecap', 'round'); el.setAttribute('stroke-linejoin', 'round'); el.setAttribute('pathLength', '1'); }
      g.append(p, ph); this.svg.append(g); this.ms.push({ m, p, ph, geo: null }); return this;
    }
    render(t) {
      for (const it of this.ms) {
        const m = it.m; if (!it.geo || typeof m.geom === 'function') { it.geo = geometria(m); it.p.setAttribute('d', it.geo.d); it.ph.setAttribute('d', it.geo.head || 'M0 0'); }
        const dur = m.dur == null ? 0.45 : m.dur, outDur = m.outDur == null ? 0.3 : m.outDur;
        const temCabeca = !!it.geo.head, corpoAte = temCabeca ? 0.8 : 1;
        const p = eo(seg(t, m.t0, m.t0 + dur * corpoAte)), q = m.out != null ? eio(seg(t, m.out, m.out + outDur)) : 0, vis = Math.max(0, p - q);
        it.p.style.strokeDasharray = vis.toFixed(4) + ' 2'; it.p.style.visibility = vis > 0.001 ? 'visible' : 'hidden';
        const hp = temCabeca ? eo(seg(t, m.t0 + dur * 0.75, m.t0 + dur)) * (1 - q) : 0;
        it.ph.style.strokeDasharray = hp.toFixed(4) + ' 2'; it.ph.style.visibility = hp > 0.001 ? 'visible' : 'hidden';
      }
    }
  }

  // ── polígonos (só o modelo antigo vago_preciso, fora do catálogo) ───────────────
  const cutPaper = (seed, n = 7, irr = 0.28) => { const r = rng(seed), pts = []; for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2 + (r() - 0.5) * irr, k = 1 - irr + r() * irr * 2; pts.push([Math.cos(a) * k, Math.sin(a) * k]); } return pts; };
  const polyLerp = (A, B, p) => A.map((q, i) => [lerp(q[0], B[i][0], p), lerp(q[1], B[i][1], p)]);
  const polyStr = (pts, cx, cy, sx, sy, rot) => { const c = Math.cos(rot || 0), s = Math.sin(rot || 0); return pts.map(([x, y]) => { const X = x * sx, Y = y * sy; return (cx + X * c - Y * s).toFixed(1) + ',' + (cy + X * s + Y * c).toFixed(1); }).join(' '); };

  // ── kit global e kit de cena ───────────────────────────────────────────────────────────
  const ASSETS = {};
  const kit = {
    W, H, clamp01, clamp, seg, lerp, eo, ei, eio, eob, smoothstep, rng, h, esc, srect, phraseRect, TextFx, typist, Marks, cutPaper, polyLerp, polyStr,
    // nome desconhecido não vira endereço: devolve vazio (o nome vem do plano da IA)
    assets: { url: (n) => (Object.prototype.hasOwnProperty.call(ASSETS, n) ? ASSETS[n] : ''), has: (n) => Object.prototype.hasOwnProperty.call(ASSETS, n), list: () => Object.keys(ASSETS) },
    get stage() { return STAGE; },
    css(text) { const s = document.createElement('style'); s.textContent = text; (this.stage || STAGE).append(s); return s; },
    svgLayer() { const svg = document.createElementNS(NS, 'svg'); svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H); svg.setAttribute('class', 'art'); svg.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;overflow:visible;pointer-events:none'; this.stage.append(svg); return svg; },
    scene() { throw new Error('kit.scene só existe no kit de uma cena'); },
    score() {},   // a trilha vem do passo de áudio da produção, não do filme
  };
  // o kit de cada cena: herda o global; o palco é a caixa da cena
  function kitDeCena(box, id, start, dur) {
    const k = Object.create(kit, { stage: { value: box }, start: { value: start }, dur: { value: dur }, id: { value: id } });
    k.scene = (sid, def) => { k.__def = def; };
    return k;
  }
  window.kit = kit;
  window.__vertho = { kit, kitDeCena, setStage: (el) => { STAGE = el; }, setAsset: (n, url) => { ASSETS[n] = url; } };
})();
