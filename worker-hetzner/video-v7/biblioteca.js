// Biblioteca de cenas concretas, v3 (16/10/2026): modelos GENÉRICOS colhidos do piloto e do teste C.
// A IA só escolhe o modelo, o PALCO e preenche os campos; os tempos chegam em segundos do momento (resolvidos das frases).
// v3 (pedido do dono: "não precisa ficar preso à linha no meio da tela... pode variar ao longo do vídeo, usar imagens"):
//   · palco por momento: 'linha' (o traço da marca carrega a ideia), 'livre' (sem traço, objetos maiores), 'papel' (página clara);
//     o modelo 'imagem' põe uma imagem gerada em tela cheia ou ao lado.
//   · CONTRATO mantido: todo momento abre e fecha no REPOUSO (fundo navy + traço reto em y 720, nada mais), então o corte
//     entre momentos não salta. Fora da 'linha', o traço SAI no começo e VOLTA no fim: ele vira a passagem entre momentos.
//   · objetos e textos ~20 a 30% maiores; todo texto tem teto de caracteres no catálogo e ENCOLHE para caber.
(function () {
  const { seg, eo, ei, eio, eob, lerp, TextFx } = kit;
  const RY = 720;
  const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const fora = (t, D) => 1 - eo(seg(t, D - 0.6, D - 0.3));         // v4: objetos saem mais tarde (a última frase termina na tela)
  const volta = (t, D) => eio(seg(t, D - 0.55, D - 0.1));
  const abre = (t) => eio(seg(t, 0, 0.7));
  const pulso = (t, a) => Math.sin(Math.PI * seg(t, a, a + 0.6));
  const vis = (t, a) => (a == null || t >= a ? 1 : 0);
  // Encolhe a fonte até caber: pela caixa no palco e, em caixa de largura fixa, pelo que transborda dela.
  function caber(k, el, maxW, maxH, min) {
    let fs = parseFloat(getComputedStyle(el).fontSize) || 32;
    for (let i = 0; i < 50; i++) {
      const r = k.srect(el), inline = getComputedStyle(el).display === 'inline';
      const transborda = !inline && (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1);
      if ((r.w <= maxW + 0.5 && r.h <= maxH + 0.5 && !transborda) || fs <= min) break;
      fs -= 2; el.style.fontSize = fs + 'px';
    }
  }
  function traco(self, t, R, P, spread) {
    const D = self.d.dur, k = abre(t) * (1 - volta(t, D));
    if (self.palco !== 'linha') { self.L.set({ P: UI.LINE, t, head: 0, tail: 0 }); return; }   // v5: fora do palco linha, nada no meio da tela
    self.L.set({ P: P ? UI.mix(R, P, k) : R, t, spread: spread || 1, head: eio(seg(t, 0.05, 0.6)), tail: eio(seg(t, D - 0.55, D - 0.1)) });
  }
  // Falas: palavras-chave no alto à esquerda, uma de cada vez; a anterior SAI antes de a próxima entrar.
  function falas(k, g, d, o) {
    const fs = (d.falas || []).filter((f) => f && f.texto != null && f.t != null).sort((a, b) => a.t - b.t);
    const w = fs.map((f) => {
      const el = k.h('<div class="words lb-fala" style="left:' + o.x + 'px;top:104px;width:' + o.w + 'px">' + (f.over ? '<p class="over">' + esc(f.over) + '</p>' : '') + '<h2 class="line s">' + esc(f.texto) + '</h2></div>');
      g.append(el); const h = el.querySelector('.line'); caber(k, h, o.w, 190, 44);
      return { f, el, h };
    });
    return {
      render(t, D, papel) {
        w.forEach((x, i) => {
          const a = x.f.t, z = i + 1 < w.length ? w[i + 1].f.t : D - 0.28;
          TextFx.fadeFromRight(x.h, t, a, { stagger: 0.08 });
          const out = seg(t, z - 0.42, z - 0.04);
          x.el.style.opacity = t < a ? 0 : 1 - eo(out);
          x.el.style.transform = 'translateY(' + (-30 * ei(out)) + 'px)';
          x.el.style.color = 'var(--second)';   // v5: as variáveis do tema já invertem nos fundos claros
        });
      },
    };
  }
  // palco: 'linha' (padrão de quem desenha no traço), 'livre', 'papel'. O conteúdo vive em .lb-cont (fora da 'linha', desce 80 px).
  function base(build, draw, cfg) {
    cfg = cfg || {};
    return {
      init(kit) {
        const d = this.d, ok = cfg.palcos || ['linha', 'livre', 'papel'];
        this.palco = ok.includes(d.palco) ? d.palco : (cfg.padrao || ok[0]);
        const g = kit.h('<div class="ground"></div>'); kit.stage.append(g); this.g = g; this.k = kit;
        this.L = UI.lines(kit, d.id, { parent: g });
        const cont = kit.h('<div class="lb-cont"></div>'); g.append(cont); this.cont = cont;
        if (this.palco !== 'linha') cont.style.transform = 'translateY(80px)';   // sem o traço no meio, o conteúdo desce e centraliza
        this.mksvg = kit.svgLayer(); this.mk = new kit.Marks(this.mksvg);
        this.falasX = 160; this.falasW = 1600;
        build.call(this, kit, cont, d);
        this.F = falas(kit, g, d, { x: this.falasX, w: this.falasW });
      },
      render(t) {
        const d = this.d, D = d.dur;
        // a câmera respira (1 → ~1,03 → 1): a tela nunca fica parada e o corte não salta
        const z = (1 + 0.03 * Math.sin(Math.PI * Math.max(0, Math.min(1, t / D)))).toFixed(4);
        for (const el of [this.g, this.mksvg]) { el.style.transformOrigin = '960px 560px'; el.style.transform = 'scale(' + z + ')'; }
        const papel = 0;   // v5: o fundo (navy, azul-claro ou branco) é do montador, para todo o momento
        if (this.fundo) this.fundo(t, D);
        draw.call(this, t, d, D);
        this.F.render(t, D, papel); this.mk.render(t);
      },
    };
  }
  const T = {};

  // ── ícones ────────────────────────────────────────────────────────────────
  const ICONE = {
    mao: '<rect x="20" y="62" width="80" height="74" rx="22"/><path d="M30 64V24M50 64V12M70 64V16M90 66V34"/>',
    pessoa: '<circle cx="60" cy="40" r="24"/><path d="M18 136c0-30 18-50 42-50s42 20 42 50z"/>',
    documento: '<path d="M24 10h52l22 22v104H24z"/><path d="M76 10v22h22"/><path d="M40 62h42M40 84h42M40 106h28"/>',
    alerta: '<path d="M60 14L108 126H12z"/><path d="M60 54v36"/><circle cx="60" cy="108" r="3"/>',
    relogio: '<circle cx="60" cy="74" r="54"/><path class="lb-pont" d="M60 74V38"/><path d="M60 74h26"/>',
    pergunta: '<circle cx="60" cy="74" r="54"/><path d="M42 58c0-12 8-20 18-20s18 8 18 18c0 14-18 14-18 30"/><circle cx="60" cy="106" r="3"/>',
    calendario: '<rect x="14" y="30" width="92" height="96" rx="12"/><path d="M14 60h92M40 16v26M80 16v26"/><circle cx="38" cy="82" r="4"/><circle cx="60" cy="82" r="4"/><circle cx="82" cy="82" r="4"/><circle cx="38" cy="104" r="4"/><circle cx="60" cy="104" r="4"/>',
    lupa: '<circle cx="52" cy="62" r="36"/><path d="M78 88l28 30"/>',
    alvo: '<circle cx="60" cy="74" r="54"/><circle cx="60" cy="74" r="34"/><circle cx="60" cy="74" r="14"/>',
    grafico: '<path d="M14 18v108h96"/><rect x="30" y="90" width="16" height="36"/><rect x="56" y="66" width="16" height="60"/><rect x="82" y="40" width="16" height="86"/>',
    mensagem: '<path d="M14 26h92a10 10 0 0 1 10 10v50a10 10 0 0 1-10 10H54l-26 24v-24H14a10 10 0 0 1-10-10V36a10 10 0 0 1 10-10z"/>',
    check: '<circle cx="60" cy="74" r="54"/><path d="M34 76l18 18 34-36"/>',
    xis: '<circle cx="60" cy="74" r="54"/><path d="M40 54l40 40M80 54l-40 40"/>',
    prancheta: '<rect x="20" y="22" width="80" height="112" rx="10"/><rect x="42" y="12" width="36" height="20" rx="6"/><path d="M36 62h48M36 84h48M36 106h32"/>',
    engrenagem: '<circle cx="60" cy="74" r="20"/><path d="M60 22v16M60 110v16M8 74h16M96 74h16M23 37l11 11M86 100l11 11M23 111l11-11M86 48l11-11"/><circle cx="60" cy="74" r="38"/>',
    predio: '<rect x="26" y="20" width="68" height="114"/><path d="M42 40h10M68 40h10M42 62h10M68 62h10M42 84h10M68 84h10"/><path d="M52 134v-24h16v24"/>',
    ampulheta: '<path d="M30 16h60L60 74l30 58H30l30-58z"/><path d="M44 120h32"/>',
  };
  const ICONES = Object.keys(ICONE);
  const svgIcone = (nome, w) => '<svg viewBox="0 0 120 140" width="' + w + '" height="' + Math.round(w * 140 / 120) + '">' + (ICONE[nome] || ICONE.pessoa) + '</svg>';

  // ── ícones: vários de uma coisa (ou itens diferentes, cada um com o seu ícone) sobem da linha; um ganha destaque ──
  T.icones = (d) => base(function (k, g, d) {
    const itens = Array.isArray(d.itens) && d.itens.length ? d.itens.slice(0, 6) : null;
    const n = itens ? Math.max(2, itens.length) : Math.max(3, Math.min(9, d.n || 5));
    const lista = itens || Array.from({ length: n }, (_, i) => ({ icone: d.icone, rotulo: (d.rotulos || [])[i] }));
    const W = n <= 4 ? 190 : n <= 6 ? 160 : 130, xs = Array.from({ length: n }, (_, i) => (n === 1 ? 960 : 300 + (i * 1320) / (n - 1)));
    g.insertAdjacentHTML('beforeend', '<div class="lb-clip">' + lista.map((it, i) => '<div class="lb-ic" style="left:' + (xs[i] - W / 2) + 'px;width:' + W + 'px;top:' + (RY - 40 - Math.round(W * 140 / 120) - 150) + 'px">' + svgIcone(it.icone, W) + '<div class="lb-haste" style="left:' + (W / 2 - 3) + 'px;top:' + Math.round(W * 140 / 120) + 'px"></div></div>').join('') + '</div>' +
      lista.map((it) => '<p class="tag lb-rot">' + esc(it.rotulo || '') + '</p>').join('') +
      (d.destaque && d.destaque.rotulo ? '<p class="tag lb-dest">' + esc(d.destaque.rotulo) + '</p>' : ''));
    this.xs = xs; this.ics = Array.from(g.querySelectorAll('.lb-ic')); this.rots = Array.from(g.querySelectorAll('.lb-rot')); this.dest = g.querySelector('.lb-dest');
    this.pont = Array.from(g.querySelectorAll('.lb-pont'));
    const larg = n === 1 ? 600 : Math.min(360, 1320 / (n - 1) - 24);
    this.rots.forEach((el, i) => { caber(k, el, larg, 50, 24); const r = k.srect(el); el.style.left = (xs[i] - r.w / 2) + 'px'; el.style.top = (RY + 30) + 'px'; });
    if (this.dest) { caber(k, this.dest, 900, 56, 28); const i = Math.max(0, Math.min(n - 1, d.destaque.i | 0)); const r = k.srect(this.dest); this.dest.style.left = Math.max(80, Math.min(1840 - r.w, xs[i] - r.w / 2)) + 'px'; this.dest.style.top = (RY + 100) + 'px'; }
  }, function (t, d, D) {
    const n = this.xs.length, t0 = d.t || 0.3, dest = d.destaque, di = dest ? Math.max(0, Math.min(n - 1, dest.i | 0)) : -1;
    const fx = fora(t, D); let rip = 0;
    this.ics.forEach((el, i) => {
      const a = t0 + i * 0.16, up = eob(seg(t, a, a + 0.55), 1.6);
      const desce = d.saem != null && i !== di ? ei(seg(t, d.saem + Math.abs(i - di) * 0.06, d.saem + 0.5 + Math.abs(i - di) * 0.06)) : 0;
      const fim = ei(seg(t, D - 0.65 + i * 0.03, D - 0.3 + i * 0.03));
      const dy = lerp(520, 0, up) + 520 * Math.max(desce, fim);
      const sc = i === di && dest ? 1 + 0.18 * eob(seg(t, dest.t, dest.t + 0.5), 1.8) : 1;
      el.style.transform = 'translateY(' + dy.toFixed(1) + 'px) rotate(' + (3 * Math.sin(t * 1.7 + i)).toFixed(2) + 'deg) scale(' + sc.toFixed(3) + ')';
      el.style.opacity = t < a ? 0 : (dest && t >= dest.t && i !== di ? lerp(1, 0.32, eo(seg(t, dest.t, dest.t + 0.5))) : 1);
      el.classList.toggle('lb-on', !!dest && t >= dest.t && i === di);
      rip = Math.max(rip, pulso(t, a));
    });
    this.pont.forEach((p, i) => p.setAttribute('transform', 'rotate(' + (t * 90 + i * 30) + ' 60 74)'));
    this.rots.forEach((el, i) => { const a = t0 + i * 0.16 + 0.4; TextFx.fadeFromRight(el, t, a); el.style.opacity = vis(t, a) * fx * (dest && t >= dest.t && i !== di ? 0.4 : 1); });
    if (this.dest) { TextFx.fadeFromRight(this.dest, t, dest.t + 0.15); this.dest.style.opacity = vis(t, dest.t) * fx; }
    traco(this, t, UI.LINE, null, 1 + 0.25 * rip + (dest ? 0.3 * pulso(t, dest.t) : 0));
  }, { palcos: ['linha'] });

  // ── filtro: itens (post-its) passam por um funil com critérios; só alguns saem ─────────────
  T.filtro = (d) => base(function (k, g, d) {
    const itens = (d.itens || []).slice(0, 6);
    g.insertAdjacentHTML('beforeend', itens.map((s) => '<div class="lb-note"><span>' + esc(s) + '</span></div>').join('') +
      '<svg class="art lb-funil" viewBox="0 0 1920 1080"><path class="lb-funilp" d="M770 330H1190L1035 580V690H925V580Z"/></svg>' +
      '<div class="lb-crit">' + (d.criterios || []).slice(0, 4).map((c) => '<p class="lb-critl"><i></i><span>' + esc(c.texto) + '</span></p>').join('') + '</div>');
    this.notes = Array.from(g.querySelectorAll('.lb-note')); this.crit = Array.from(g.querySelectorAll('.lb-critl'));
    this.notes.forEach((el) => caber(k, el.firstChild, 226, 100, 22));
    this.crit.forEach((el) => caber(k, el.querySelector('span'), 560, 54, 24));
    const fp = g.querySelector('.lb-funilp'); this.fp = fp; this.flen = 1400; fp.style.strokeDasharray = this.flen;
    this.pos = itens.map((_, i) => [110 + (i % 2) * 275, 320 + Math.floor(i / 2) * 150, [-4, 3, -2, 4, -3, 2][i]]);   // v4: grade sem sobreposição
    this.passa = d.passam || [];
  }, function (t, d, D) {
    const fx = fora(t, D), t0 = d.t || 0.3, tp = d.tPassa;
    this.fp.style.strokeDashoffset = this.flen * (1 - eio(seg(t, t0 + 0.4, t0 + 1.2)));
    this.fp.style.opacity = fx;
    let rip = 0;
    this.notes.forEach((el, i) => {
      const a = t0 + i * 0.12, inn = eob(seg(t, a, a + 0.45), 1.7), [x0, y0, r0] = this.pos[i];
      let x = x0, y = y0 + lerp(260, 0, inn), r = r0, s = lerp(0.6, 1, inn), op = vis(t, a);
      if (tp != null && t >= tp) {
        const ordem = this.passa.indexOf(i);
        if (ordem >= 0) {
          const p = eio(seg(t, tp + ordem * 0.3, tp + 0.8 + ordem * 0.3)), q = eio(seg(t, tp + 0.8 + ordem * 0.3, tp + 1.35 + ordem * 0.3));
          x = lerp(lerp(x0, 855, p), 1240 + ordem * 200, q); y = lerp(lerp(y0, 300, p) + 360 * q, 760, q); r = lerp(r0, 0, p); s = lerp(1, 0.78, p);
        } else { op *= lerp(1, 0.22, eo(seg(t, tp, tp + 0.6))); y += 30 * ei(seg(t, tp, tp + 0.6)); }
      }
      el.style.transform = 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px) rotate(' + r + 'deg) scale(' + s.toFixed(3) + ')';
      el.style.opacity = op * fx; rip = Math.max(rip, pulso(t, a));
    });
    this.crit.forEach((el, i) => {
      const c = d.criterios[i]; TextFx.fadeFromRight(el.querySelector('span'), t, c.t);
      el.style.opacity = vis(t, c.t) * fx;
      el.querySelector('i').style.transform = 'scale(' + eob(seg(t, c.t + 0.2, c.t + 0.6), 1.8) + ')';
    });
    traco(this, t, UI.LINE, null, 1 + 0.2 * rip);
  }, { palcos: ['livre'] });

  // ── balança: duas opções nos pratos; pesa para um lado ────────────────────────────────────
  T.balanca = (d) => base(function (k, g, d) {
    g.insertAdjacentHTML('beforeend', '<svg class="art lb-bal" viewBox="0 0 1920 1080"><path class="lb-haste2" d="M960 720V400"/><g class="lb-braco"><path d="M520 400H1400"/><path d="M520 400V505M1400 400V505"/><path d="M420 505Q520 565 620 505M1300 505Q1400 565 1500 505"/></g><circle cx="960" cy="400" r="12" class="lb-piv"/></svg>' +
      '<div class="lb-note lb-pe"><span>' + esc(d.esq) + '</span></div><div class="lb-note lb-pd"><span>' + esc(d.dir) + '</span></div>' +
      (d.legenda ? '<p class="sub lb-leg">' + esc(d.legenda.texto) + '</p>' : ''));
    this.braco = g.querySelector('.lb-braco'); this.bal = g.querySelector('.lb-bal');
    this.pe = g.querySelector('.lb-pe'); this.pd = g.querySelector('.lb-pd'); this.leg = g.querySelector('.lb-leg');
    [this.pe, this.pd].forEach((el) => caber(k, el.firstChild, 226, 100, 22));
    if (this.leg) { caber(k, this.leg, 1500, 120, 28); const r = k.srect(this.leg); this.leg.style.left = (960 - r.w / 2) + 'px'; this.leg.style.top = (RY + 40) + 'px'; }
  }, function (t, d, D) {
    const fx = fora(t, D), t0 = d.t || 0.3, ent = eio(seg(t, t0, t0 + 0.7));
    const lado = d.pesa === 'esq' ? -1 : d.pesa === 'dir' ? 1 : 0;
    const ang = d.tPesa != null ? 9 * lado * eob(seg(t, d.tPesa, d.tPesa + 0.8), 1.5) : 2.5 * Math.sin(t * 1.3);
    this.bal.style.opacity = ent * fx; this.bal.style.transform = 'translateY(' + lerp(60, 0, ent) + 'px)';
    this.braco.setAttribute('transform', 'rotate(' + ang.toFixed(2) + ' 960 400)');
    const rad = ang * Math.PI / 180;
    [[this.pe, -440, 0.3], [this.pd, 440, 0.5]].forEach(([el, dx, dl]) => {
      const a = t0 + dl + 0.3, e = eob(seg(t, a, a + 0.5), 1.7);
      const x = 960 + dx * Math.cos(rad), y = 400 + dx * Math.sin(rad) + 128;   // v4: base do cartão no prato
      el.style.transform = 'translate(' + (x - 125).toFixed(1) + 'px,' + (y - 130 - lerp(120, 0, e)).toFixed(1) + 'px)';
      el.style.opacity = vis(t, a) * fx;
    });
    if (this.leg) { TextFx.fadeFromRight(this.leg, t, d.legenda.t); this.leg.style.opacity = vis(t, d.legenda.t) * fx; }
    traco(this, t, UI.LINE, null, 1 + 0.3 * (d.tPesa != null ? pulso(t, d.tPesa) : 0));
  }, { palcos: ['linha'] });

  // ── formulário: um cartão com campos que se preenchem enquanto a frase é dita ──────────────
  T.formulario = (d) => base(function (k, g, d) {
    const cs = (d.campos || []).slice(0, 4), dir = false;   // v4: sempre centralizado
    const L0 = dir ? 860 : 330, W = dir ? 980 : 1260, LR = dir ? 260 : 320;
    const H = 30 + 48 + 14 + cs.length * 76 + (cs.length - 1) * 14 + 30, top = Math.max(290, Math.min(330, 760 - H));
    this.box = [L0, top, W, H];
    g.insertAdjacentHTML('beforeend', '<div class="card lb-form" style="left:' + L0 + 'px;top:' + top + 'px;width:' + W + 'px"><p class="tag">' + esc(d.titulo) + '</p>' +
      cs.map((c) => '<div class="field lb-f"><span class="lb-fr" style="width:' + LR + 'px"><span>' + esc(c.rotulo) + '</span></span><b class="lb-fv"></b><i class="lb-car"></i></div>').join('') + '</div>' +
      (d.carimbo ? '<div class="lb-carimbo"><span>' + esc(d.carimbo.texto) + '</span></div>' : ''));
    this.card = g.querySelector('.lb-form'); this.fs = Array.from(g.querySelectorAll('.lb-f'));
    this.vs = Array.from(g.querySelectorAll('.lb-fv')); this.car = Array.from(g.querySelectorAll('.lb-car'));
    caber(k, this.card.querySelector('.tag'), W - 64, 52, 24);
    this.fs.forEach((el) => caber(k, el.querySelector('.lb-fr > span'), LR - 12, 46, 26));
    this.vs.forEach((el, i) => { el.textContent = cs[i].valor; caber(k, el, W - 64 - 40 - LR - 30, 48, 22); el.textContent = ''; });
    this.ty = cs.map((c) => k.typist(String(c.valor || ''), c.t, 22, 3 + c.t));
    this.stamp = g.querySelector('.lb-carimbo');
    if (this.stamp) { caber(k, this.stamp.firstChild, 170, 70, 18); this.stamp.style.left = (L0 + W - 230) + 'px'; this.stamp.style.top = (top + H - 160) + 'px'; }
    const mm = d.marca && this.fs[d.marca.campo | 0];
    if (mm) { const r = k.srect(mm); this.mk.add(d.marca.tipo === 'sublinhado' ? { id: 'm', kind: 'underline', t0: d.marca.t, dur: 0.45, out: d.dur - 0.9, color: '#9E4EDD', width: 9, wave: 1, x: r.x + 10, y: r.y + r.h + 10, w: r.w - 20 } : { id: 'm', kind: 'circle', t0: d.marca.t, dur: 0.5, out: d.dur - 0.9, color: '#9E4EDD', width: 9, padX: 18, padY: 12, x: r.x, y: r.y, w: r.w, h: r.h }); }
    if (d.risco) { const r = k.srect(this.card); this.mk.add({ id: 'x1', kind: 'path', t0: d.risco.t, dur: 0.35, out: d.dur - 0.9, color: '#9E4EDD', width: 14, d: [[r.x + 40, r.y + 40], [r.x + r.w - 40, r.y + r.h - 40]] }); this.mk.add({ id: 'x2', kind: 'path', t0: d.risco.t + 0.3, dur: 0.35, out: d.dur - 0.9, color: '#9E4EDD', width: 14, d: [[r.x + r.w - 40, r.y + 40], [r.x + 40, r.y + r.h - 40]] }); }
  }, function (t, d, D) {
    const fx = fora(t, D), t0 = d.t || 0.3, e = eob(seg(t, t0, t0 + 0.55), 1.4);
    this.card.style.opacity = vis(t, t0) * fx * (d.risco ? lerp(1, 0.6, eo(seg(t, d.risco.t, d.risco.t + 0.5))) : 1);
    this.card.style.transform = 'translateY(' + lerp(140, 0, e).toFixed(1) + 'px) scale(' + lerp(0.9, 1, e).toFixed(3) + ')';
    const blink = Math.floor(t / 0.5) % 2 === 0; let rip = 0;
    this.fs.forEach((el, i) => {
      const c = d.campos[i], ty = this.ty[i], a = seg(t, t0 + 0.25 + i * 0.1, t0 + 0.6 + i * 0.1);
      el.style.opacity = eo(a); this.vs[i].textContent = ty.at(t);
      const ativo = t >= c.t - 0.3 && t <= ty.end + 0.4;
      el.style.boxShadow = 'inset 0 0 0 3px color-mix(in srgb, var(--main) ' + (ativo ? 100 : 0) + '%, transparent)';
      this.car[i].style.opacity = ativo && (t <= ty.end || blink) ? 1 : 0;
      rip = Math.max(rip, pulso(t, ty.end));
    });
    if (this.stamp) { const s = seg(t, d.carimbo.t, d.carimbo.t + 0.35); this.stamp.style.opacity = vis(t, d.carimbo.t) * fx; this.stamp.style.transform = 'rotate(-12deg) scale(' + lerp(1.7, 1, eo(s)).toFixed(3) + ')'; rip = Math.max(rip, pulso(t, d.carimbo.t)); }
    traco(this, t, UI.LINE, null, 1 + 0.25 * rip);
  }, { palcos: ['livre'] });

  // ── fluxo: um cartão leva a outro por um arco (salto = arco alto); o destino pode virar outra coisa ──
  T.fluxo = (d) => base(function (k, g, d) {
    const cartao = (c, x, cl) => '<div class="card lb-fc ' + cl + '" style="left:' + x + 'px;top:400px;width:600px"><p class="tag">' + esc(c.tag) + '</p><div class="lb-fct">' + esc(c.texto) + '</div></div>';
    g.insertAdjacentHTML('beforeend', cartao(d.de, 110, 'lb-de') + cartao(d.para, 1210, 'lb-para') +
      (d.troca ? '<div class="card lb-fc lb-troca" style="left:1210px;top:400px;width:600px"><p class="tag">' + esc(d.troca.tag) + '</p><div class="lb-fct">' + esc(d.troca.texto) + '</div></div>' : '') +
      '<svg class="art" viewBox="0 0 1920 1080"><path class="lb-arco" d=""/><circle class="lb-bola" r="11"/></svg>' +
      (d.alvo ? '<div class="lb-alvo">' + svgIcone(d.alvo.icone || 'pessoa', 96) + '</div>' : ''));
    this.de = g.querySelector('.lb-de'); this.para = g.querySelector('.lb-para'); this.tr = g.querySelector('.lb-troca');
    [this.de, this.para, this.tr].filter(Boolean).forEach((el) => { caber(k, el.querySelector('.tag'), 530, 52, 28); caber(k, el.querySelector('.lb-fct'), 99999, 150, 28); });
    const a = k.srect(this.de), b = k.srect(this.para), y0 = a.y + a.h / 2, y1 = b.y + b.h / 2, cy = d.salto ? 90 : 300;
    this.arco = g.querySelector('.lb-arco'); this.bola = g.querySelector('.lb-bola');
    this.arco.setAttribute('d', 'M' + (a.x + a.w + 10) + ' ' + y0 + 'C' + (a.x + a.w + 220) + ' ' + cy + ' ' + (b.x - 220) + ' ' + cy + ' ' + (b.x - 14) + ' ' + y1);
    this.alen = this.arco.getTotalLength(); this.arco.style.strokeDasharray = this.alen;
    this.alvo = g.querySelector('.lb-alvo'); if (this.alvo) { this.alvo.style.left = (b.x + b.w - 130) + 'px'; this.alvo.style.top = (b.y + 22) + 'px'; }
  }, function (t, d, D) {
    const fx = fora(t, D), t0 = d.t || 0.3, ts = d.tSeta != null ? d.tSeta : t0 + 1;
    const e1 = eob(seg(t, t0, t0 + 0.5), 1.5), e2 = eob(seg(t, ts + 0.6, ts + 1.1), 1.5);
    this.de.style.opacity = vis(t, t0) * fx; this.de.style.transform = 'translateY(' + lerp(120, 0, e1) + 'px)';
    const p = eio(seg(t, ts, ts + 0.9));
    this.arco.style.strokeDashoffset = this.alen * (1 - p); this.arco.style.opacity = fx;
    const q = this.arco.getPointAtLength(this.alen * p); this.bola.setAttribute('cx', q.x); this.bola.setAttribute('cy', q.y); this.bola.style.opacity = p > 0 && p < 1 ? 1 : 0;
    let flip = 1, mostra = this.para, esconde = this.tr;
    if (this.tr) { const f = seg(t, d.troca.t, d.troca.t + 0.6); flip = Math.abs(Math.cos(Math.PI * f)); if (f >= 0.5) { mostra = this.tr; esconde = this.para; } }
    mostra.style.opacity = vis(t, ts + 0.6) * fx; mostra.style.transform = 'translateY(' + lerp(120, 0, e2) + 'px) scaleX(' + flip.toFixed(3) + ')';
    if (esconde) esconde.style.opacity = 0;
    if (this.alvo) { const s = eob(seg(t, d.alvo.t, d.alvo.t + 0.5), 1.8); this.alvo.style.opacity = vis(t, d.alvo.t) * fx; this.alvo.style.transform = 'scale(' + s.toFixed(3) + ')'; }
    traco(this, t, UI.LINE, null, 1 + 0.3 * pulso(t, ts + 0.9));
  }, { palcos: ['livre'] });

  // ── trajeto: do início ao fim, com paradas; uma lacuna marca onde o tempo se perde ──────────
  T.trajeto = (d) => base(function (k, g, d) {
    const ps = (d.paradas || []).slice(0, 4), n = ps.length + 2, xs = Array.from({ length: n }, (_, i) => 240 + (i * 1440) / (n - 1)), Y = 540;
    this.xs = xs; this.Y = Y;
    const rot = [d.inicio, ...ps.map((p) => p.texto), d.fim];
    g.insertAdjacentHTML('beforeend', '<svg class="art" viewBox="0 0 1920 1080"><path class="lb-traj" d="M' + xs[0] + ' ' + Y + 'H' + xs[n - 1] + '"/><path class="lb-gap" d=""/>' + xs.map((x) => '<circle class="lb-pt" cx="' + x + '" cy="' + Y + '" r="16"/>').join('') + '<circle class="lb-viaj" r="20" cy="' + Y + '"/></svg>' +
      rot.map((r) => '<p class="tag lb-tl">' + esc(r) + '</p>').join('') + (d.lacuna ? '<p class="tag lb-gl">' + esc(d.lacuna.texto) + '</p>' : ''));
    this.traj = g.querySelector('.lb-traj'); this.tlen = xs[n - 1] - xs[0]; this.traj.style.strokeDasharray = this.tlen;
    this.pts = Array.from(g.querySelectorAll('.lb-pt')); this.viaj = g.querySelector('.lb-viaj');
    this.tls = Array.from(g.querySelectorAll('.lb-tl'));
    this.tls.forEach((el, i) => { caber(k, el, Math.min(420, 1440 / (n - 1) - 24), 52, 24); const r = k.srect(el); el.style.left = Math.max(80, Math.min(1840 - r.w, xs[i] - r.w / 2)) + 'px'; el.style.top = (Y - (i % 2 === 0 ? 92 : 152)) + 'px'; });
    this.ts = [d.t || 0.3, ...ps.map((p) => p.t), Math.min((ps.length ? ps[ps.length - 1].t : (d.t || 0.3)) + 1.2, d.dur - 1.6)];   // v5: o fim sempre ganha rótulo
    if (d.lacuna) {
      const a = xs[Math.max(0, Math.min(n - 1, d.lacuna.de | 0))], b = xs[Math.max(0, Math.min(n - 1, d.lacuna.ate | 0))];
      this.gap = g.querySelector('.lb-gap'); this.gap.setAttribute('d', 'M' + a + ' ' + Y + 'H' + b);
      this.gl = g.querySelector('.lb-gl'); caber(k, this.gl, 800, 52, 24); const r = k.srect(this.gl); this.gl.style.left = Math.max(80, (a + b) / 2 - r.w / 2) + 'px'; this.gl.style.top = (Y + 84) + 'px';
      this.mk.add({ id: 'br', kind: 'path', t0: d.lacuna.t, dur: 0.45, out: d.dur - 0.9, color: '#9E4EDD', width: 8, d: [[a + 8, Y + 40], [a + 8, Y + 66], [b - 8, Y + 66], [b - 8, Y + 40]] });
    }
  }, function (t, d, D) {
    const fx = fora(t, D), t0 = d.t || 0.3;
    this.traj.style.strokeDashoffset = this.tlen * (1 - eio(seg(t, t0, t0 + 0.9))); this.traj.style.opacity = fx;
    this.pts.forEach((p, i) => { const a = this.ts[Math.min(i, this.ts.length - 1)]; p.setAttribute('r', 16 * eob(seg(t, a, a + 0.4), 1.8)); p.style.opacity = fx; });
    this.tls.forEach((el, i) => { const a = this.ts[Math.min(i, this.ts.length - 1)]; TextFx.fadeFromRight(el, t, a); el.style.opacity = vis(t, a) * fx; });
    let x = this.xs[0];
    for (let i = 1; i < this.xs.length; i++) { const a = this.ts[Math.min(i, this.ts.length - 1)]; if (t >= a - 0.8) x = lerp(this.xs[i - 1], this.xs[i], eio(seg(t, a - 0.8, a))); }
    this.viaj.setAttribute('cx', x); this.viaj.style.opacity = vis(t, t0 + 0.5) * fx;
    if (this.gap) { this.gap.style.opacity = vis(t, d.lacuna.t) * fx; TextFx.fadeFromRight(this.gl, t, d.lacuna.t + 0.3); this.gl.style.opacity = vis(t, d.lacuna.t + 0.3) * fx; }
    traco(this, t, UI.LINE, null, 1);
  }, { palcos: ['livre'] });

  // ── caderno: uma página que recebe itens numerados; um cartão ao lado pode contrastar ──────
  T.caderno = (d) => base(function (k, g, d) {
    const ls = (d.linhas || []).slice(0, 5), lat = !!d.lateral;
    const L0 = lat ? 120 : 360, W = lat ? 900 : 1200, H = 30 + 44 + 6 + ls.length * 76 + 34;
    g.insertAdjacentHTML('beforeend', '<div class="lb-cad" style="left:' + L0 + 'px;width:' + W + 'px;height:' + H + 'px;top:' + Math.max(290, 740 - H) + 'px"><p class="lb-cadt">' + esc(d.titulo) + '</p>' + ls.map((l, i) => '<p class="lb-cadl"><b>' + (i + 1) + '</b><span></span></p>').join('') + '</div>' +
      (lat ? '<div class="card lb-lat"><p class="tag">' + esc(d.lateral.tag) + '</p><div class="lb-fct">' + esc(d.lateral.texto) + '</div></div>' : ''));
    this.cad = g.querySelector('.lb-cad'); this.ls = Array.from(g.querySelectorAll('.lb-cadl span')); this.rows = Array.from(g.querySelectorAll('.lb-cadl'));
    caber(k, g.querySelector('.lb-cadt'), W - 80, 46, 22);
    this.ls.forEach((el, i) => { el.textContent = ls[i].texto; caber(k, el, W - 150, 52, 22); el.textContent = ''; });
    this.ty = ls.map((l, i) => k.typist(String(l.texto), l.t, 24, 11 + i));
    this.lat = g.querySelector('.lb-lat'); if (this.lat) { caber(k, this.lat.querySelector('.tag'), 640, 52, 28); caber(k, this.lat.querySelector('.lb-fct'), 99999, 160, 28); }
    if (d.risca && this.rows[d.risca.linha | 0]) { const el = this.rows[d.risca.linha | 0]; this.mk.add({ id: 'rs', kind: 'path', t0: d.risca.t, dur: 0.4, out: d.dur - 0.9, color: '#9E4EDD', width: 8, geom: () => { const r = this.k.srect(el.querySelector('span')); return { d: [[r.x - 8, r.y + r.h * 0.55], [r.x + Math.max(r.w, 120) + 8, r.y + r.h * 0.5]] }; } }); }
  }, function (t, d, D) {
    const fx = fora(t, D), t0 = d.t || 0.3, e = eob(seg(t, t0, t0 + 0.6), 1.3);
    this.cad.style.opacity = vis(t, t0) * fx; this.cad.style.transform = 'translateY(' + lerp(160, 0, e).toFixed(1) + 'px)';
    let rip = 0;
    this.rows.forEach((r, i) => { const ty = this.ty[i]; r.style.opacity = t >= d.linhas[i].t - 0.2 ? 1 : 0.35; this.ls[i].textContent = ty.at(t); rip = Math.max(rip, pulso(t, ty.end)); });
    if (this.lat) { const a = d.lateral.t, s = eob(seg(t, a, a + 0.5), 1.4); this.lat.style.opacity = vis(t, a) * fx; this.lat.style.transform = 'translateX(' + lerp(260, 0, s).toFixed(1) + 'px)'; }
    traco(this, t, UI.LINE, null, 1 + 0.2 * rip);
  }, { palcos: ['livre'] });

  // ── citação: uma fala entre aspas; a palavra-chave é circulada, aponta um rótulo ou é trocada ──
  T.citacao = (d) => base(function (k, g, d) {
    g.insertAdjacentHTML('beforeend', '<div class="words lb-cit" style="left:160px;top:330px;width:1600px"><h2 class="line"><span class="lb-aspa">“</span>' + esc(d.texto) + '<span class="lb-aspa">”</span></h2></div>' +
      (d.seta ? '<div class="lb-alvo2">' + svgIcone(d.seta.icone || 'pessoa', 90) + '<p class="tag">' + esc(d.seta.rotulo) + '</p></div>' : '') +
      (d.troca ? '<p class="line s lb-nova">' + esc(d.troca.nova) + '</p>' : ''));
    this.cit = g.querySelector('.lb-cit .line'); caber(k, this.cit, 1600, 330, 52);
    const pal = d.destaque && d.destaque.palavra, rr = pal ? k.phraseRect(this.cit, pal) : null;
    if (rr) this.mk.add({ id: 'c', kind: 'circle', t0: d.destaque.t, dur: 0.5, out: d.dur - 0.9, color: '#9E4EDD', width: 10, padX: 18, padY: 12, x: rr.x, y: rr.y, w: rr.w, h: rr.h });
    this.alvo = g.querySelector('.lb-alvo2');
    if (this.alvo) { caber(k, this.alvo.querySelector('.tag'), 520, 56, 26); this.alvo.style.left = '1240px'; this.alvo.style.top = '780px'; if (rr) this.mk.add({ id: 'a', kind: 'arrow', t0: d.seta.t, dur: 0.5, out: d.dur - 0.9, color: '#9E4EDD', width: 8, bend: 0.25, from: [rr.x + rr.w / 2, rr.y + rr.h + 26], to: [1270, 800] }); }
    const tp = d.troca && k.phraseRect(this.cit, d.troca.palavra);
    this.nova = g.querySelector('.lb-nova');
    if (tp && this.nova) { this.mk.add({ id: 's', kind: 'path', t0: d.troca.t, dur: 0.35, out: d.dur - 0.9, color: '#9E4EDD', width: 10, d: [[tp.x - 6, tp.y + tp.h * 0.55], [tp.x + tp.w + 6, tp.y + tp.h * 0.5]] }); caber(k, this.nova, 900, 110, 40); this.nova.style.left = Math.min(1840 - k.srect(this.nova).w, tp.x) + 'px'; this.nova.style.top = (tp.y + tp.h + 26) + 'px'; }
  }, function (t, d, D) {
    const fx = fora(t, D), t0 = d.t || 0.3;
    TextFx.fadeFromRight(this.cit, t, t0, { stagger: 0.07 }); this.cit.parentNode.style.opacity = vis(t, t0) * fx;
    if (this.alvo) { const s = eob(seg(t, d.seta.t + 0.4, d.seta.t + 0.9), 1.7); this.alvo.style.opacity = vis(t, d.seta.t + 0.4) * fx; this.alvo.style.transform = 'scale(' + s.toFixed(3) + ')'; }
    if (this.nova) { TextFx.fadeFromRight(this.nova, t, d.troca.t + 0.35); this.nova.style.opacity = vis(t, d.troca.t + 0.35) * fx; }
    traco(this, t, UI.LINE, null, 1 + 0.3 * (d.destaque ? pulso(t, d.destaque.t) : 0));
  }, { palcos: ['livre'] });

  // ── vago → preciso: um problema disforme vira uma caixa medida; as medidas entram nela ──────
  T.vago_preciso = (d) => base(function (k, g, d) {
    const N = 12, CX = 1150, CY = 520;
    this.C = [CX, CY];
    this.blob = k.cutPaper(7, N, 0.42);
    this.ret = this.blob.map(([x, y]) => { const a = Math.atan2(y, x), c = Math.cos(a), s = Math.sin(a), m = Math.max(Math.abs(c), Math.abs(s) / 0.62); return [c / m, s / m]; });
    g.insertAdjacentHTML('beforeend', '<svg class="art" viewBox="0 0 1920 1080"><polygon class="lb-blob"/></svg><p class="tag lb-vago">' + esc(d.vago) + '</p><p class="tag lb-prec">' + esc(d.preciso) + '</p>' +
      (d.medidas || []).slice(0, 3).map((m) => '<p class="tag lb-med">' + esc(m.texto) + '</p>').join(''));
    this.poly = g.querySelector('.lb-blob'); this.vago = g.querySelector('.lb-vago'); this.prec = g.querySelector('.lb-prec'); this.meds = Array.from(g.querySelectorAll('.lb-med'));
    [this.vago, this.prec].forEach((el) => { caber(k, el, 600, 60, 24); const r = k.srect(el); el.style.left = (CX - r.w / 2) + 'px'; el.style.top = (CY - r.h / 2 - 34) + 'px'; });
    this.meds.forEach((el, i) => { caber(k, el, 420, 56, 22); el.style.left = '140px'; el.style.top = (360 + i * 110) + 'px'; });
    if (d.tMuda != null) {
      this.mk.add({ id: 'b1', kind: 'path', t0: d.tMuda + 0.5, dur: 0.4, out: d.dur - 0.9, color: '#34C5CC', width: 7, d: [[CX - 440, CY - 168], [CX - 440, CY - 196], [CX + 440, CY - 196], [CX + 440, CY - 168]] });
      this.mk.add({ id: 'b2', kind: 'bracket', t0: d.tMuda + 0.7, dur: 0.4, out: d.dur - 0.9, color: '#34C5CC', width: 7, x: CX + 470, y: CY - 155, h: 310, side: 'right' });
    }
  }, function (t, d, D) {
    const fx = fora(t, D), t0 = d.t || 0.3, m = d.tMuda != null ? eio(seg(t, d.tMuda, d.tMuda + 0.8)) : 0;
    const e = eob(seg(t, t0, t0 + 0.6), 1.4), sx = 440 * e, sy = 250 * e;
    const pts = this.blob.map((p, i) => { const w = 1 + (1 - m) * 0.05 * Math.sin(t * 2.2 + i * 1.7); return [p[0] * w, p[1] * w]; });
    this.poly.setAttribute('points', kit.polyStr(kit.polyLerp(pts, this.ret, m), this.C[0], this.C[1], sx, sy, 0));
    this.poly.style.opacity = vis(t, t0) * fx; this.poly.classList.toggle('lb-medido', m > 0.5);
    this.vago.style.opacity = vis(t, t0 + 0.3) * (1 - m) * fx; this.prec.style.opacity = m * fx;
    this.meds.forEach((el, i) => {
      const md = d.medidas[i], a = eob(seg(t, md.t, md.t + 0.45), 1.7);
      const ent = d.tMuda != null ? eio(seg(t, d.tMuda + 0.2 + i * 0.15, d.tMuda + 0.9 + i * 0.15)) : 0;
      const x = lerp(0, this.C[0] - 360 + i * 250 - 140, ent), y = lerp(0, this.C[1] + 60 - (360 + i * 110), ent);
      el.style.opacity = vis(t, md.t) * fx; el.style.transform = 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px) scale(' + (a * lerp(1, 0.85, ent)).toFixed(3) + ')';
    });
    traco(this, t, UI.LINE, null, 1 + 0.35 * (d.tMuda != null ? pulso(t, d.tMuda) : 0));
  }, { palcos: ['livre'] });

  // ── desvio: a linha do processo contorna obstáculos; cada desvio ganha nome; o obstáculo pode sumir ──
  T.desvio = (d) => base(function (k, g, d) {
    const ds = (d.desvios || []).slice(0, 3), n = Math.max(1, ds.length), xs = n === 1 ? [960] : n === 2 ? [680, 1240] : [480, 960, 1440];
    this.xs = xs; this.R = UI.bumps(RY, xs.map((x) => [x, 0]));
    g.insertAdjacentHTML('beforeend', xs.map(() => '<div class="block lb-obs" style="width:150px;height:128px"></div>').join('') +
      ds.map((s) => '<p class="tag lb-dl">' + esc(s.texto) + '</p>').join('') + (d.obstaculo ? '<p class="tag lb-ol">' + esc(d.obstaculo) + '</p>' : ''));
    this.obs = Array.from(g.querySelectorAll('.lb-obs')); this.dls = Array.from(g.querySelectorAll('.lb-dl')); this.ol = g.querySelector('.lb-ol');
    this.obs.forEach((el, i) => { el.style.left = (xs[i] - 75) + 'px'; el.style.top = (RY - 132) + 'px'; });
    this.dls.forEach((el, i) => { caber(k, el, n === 1 ? 700 : 440, 52, 24); const r = k.srect(el); el.style.left = (xs[i] - r.w / 2) + 'px'; el.style.top = (RY - 340) + 'px'; });
    if (this.ol) { caber(k, this.ol, 600, 52, 24); const r = k.srect(this.ol); this.ol.style.left = (xs[Math.floor((n - 1) / 2)] - r.w / 2) + 'px'; this.ol.style.top = (RY + 34) + 'px'; }
  }, function (t, d, D) {
    const fx = fora(t, D), t0 = d.t || 0.3, some = d.some != null ? eio(seg(t, d.some, d.some + 0.8)) : 0;
    const hs = this.xs.map((x, i) => { const a = d.desvios && d.desvios[i] ? d.desvios[i].t : t0 + 0.6; return lerp(240, 150, some) * eob(seg(t, a - 0.4, a + 0.4), 1.4); });
    this.obs.forEach((el, i) => { const a = t0 + i * 0.15; el.style.opacity = vis(t, a) * (1 - some) * fx; el.style.transform = 'scale(' + eob(seg(t, a, a + 0.4), 1.7).toFixed(3) + ')'; });
    this.dls.forEach((el, i) => { const a = d.desvios[i].t; TextFx.fadeFromRight(el, t, a + 0.2); el.style.opacity = vis(t, a + 0.2) * fx; });
    if (this.ol) { TextFx.fadeFromRight(this.ol, t, t0 + 0.3); this.ol.style.opacity = vis(t, t0 + 0.3) * (1 - some) * fx; }
    traco(this, t, this.R, UI.bumps(RY, this.xs.map((x, i) => [x, hs[i]])), 1 + 0.25 * Math.max(...this.xs.map((_, i) => pulso(t, d.desvios && d.desvios[i] ? d.desvios[i].t : 0))));
  }, { palcos: ['linha'] });

  // ── imagem: uma imagem gerada em tela cheia (com véu para o texto) ou num painel ao lado, com até 3 pontos ──
  T.imagem = (d) => base(function (k, g, d) {
    const lado = ['cheia', 'direita', 'esquerda'].includes(d.lado) ? d.lado : 'cheia';
    const src = d.arquivo ? k.assets.url(d.arquivo) : '';
    const pontos = (d.pontos || []).slice(0, 3);
    this.lado = lado;
    if (lado === 'cheia') {
      this.g.insertAdjacentHTML('afterbegin', '<div class="lb-imgcheia"><img src="' + src + '" alt=""></div><div class="lb-veu"></div>');
      this.falasW = 1100;
    } else {
      const x = lado === 'direita' ? 900 : 80;
      g.insertAdjacentHTML('beforeend', '<div class="lb-imgpainel" style="left:' + x + 'px"><img src="' + src + '" alt=""></div>');
      if (lado === 'esquerda') this.falasX = 1020;
      this.falasW = 740;
    }
    const px = lado === 'esquerda' ? 1020 : 160, pw = lado === 'cheia' ? 1000 : 740;
    g.insertAdjacentHTML('beforeend', '<div class="lb-pontos" style="left:' + px + 'px;width:' + pw + 'px">' + pontos.map((p) => '<p class="lb-ponto"><i>' + (p.icone && ICONE[p.icone] ? svgIcone(p.icone, 44) : '') + '</i><span>' + esc(p.texto) + '</span></p>').join('') + '</div>' +
      (d.legenda ? '<p class="sub lb-leg2" style="left:' + px + 'px;width:' + pw + 'px">' + esc(d.legenda.texto) + '</p>' : ''));
    this.img = this.g.querySelector('.lb-imgcheia img, .lb-imgpainel img'); this.box = this.g.querySelector('.lb-imgcheia, .lb-imgpainel'); this.veu = this.g.querySelector('.lb-veu');
    this.pts = Array.from(g.querySelectorAll('.lb-ponto'));
    this.pts.forEach((el) => caber(k, el.querySelector('span'), pw - 70, 110, 26));
    this.leg = g.querySelector('.lb-leg2'); if (this.leg) caber(k, this.leg, pw, 110, 26);
    // v7c (17/10): a legenda em 2 linhas cruzava a linha da borda. Sem pontos, ela vai para o meio do lado livre;
    // com pontos, a base dela fica em y 880 (o .lb-cont desce 80 px: 960 na tela, acima da linha da borda em 1014)
    if (this.leg) {
      if (!pontos.length) { this.leg.style.fontSize = '48px'; this.leg.style.color = 'var(--second)'; caber(k, this.leg, pw, 240, 28); }   // sozinha no lado livre: maior
      const h = k.srect(this.leg).h; this.leg.style.top = (pontos.length ? 880 - h : 460 - h / 2) + 'px';
    }
    this.fundo = (t, D) => {   // a imagem entra depois da passagem e sai antes do traço voltar
      const ent = eio(seg(t, 0.3, 1.0)), sai = 1 - eio(seg(t, D - 0.7, D - 0.32)), o = ent * sai;
      this.box.style.opacity = o; if (this.veu) this.veu.style.opacity = o;
      const z = 1.04 + 0.08 * Math.max(0, Math.min(1, t / D)), dx = -24 * Math.max(0, Math.min(1, t / D));
      this.img.style.transform = 'translateX(' + dx.toFixed(1) + 'px) scale(' + z.toFixed(4) + ')';
      if (this.lado !== 'cheia') this.box.style.transform = 'translateX(' + ((this.lado === 'direita' ? 60 : -60) * (1 - ent)).toFixed(1) + 'px)';
    };
  }, function (t, d, D) {
    const fx = fora(t, D);
    this.pts.forEach((el, i) => { const p = d.pontos[i], a = p.t, e = eob(seg(t, a, a + 0.45), 1.5); TextFx.fadeFromRight(el.querySelector('span'), t, a + 0.1); el.style.opacity = vis(t, a) * fx; el.querySelector('i').style.transform = 'scale(' + e.toFixed(3) + ')'; });
    if (this.leg) { TextFx.fadeFromRight(this.leg, t, d.legenda.t); this.leg.style.opacity = vis(t, d.legenda.t) * fx; }
  }, { palcos: ['livre'] });

  // ── frase (reserva): uma afirmação grande, com a palavra-chave sublinhada ──
  T.frase = (d) => base(function (k, g, d) {
    g.insertAdjacentHTML('beforeend', '<div class="words lb-fr2" style="left:160px;top:340px;width:1600px"><h2 class="line">' + esc(d.texto) + '</h2>' + (d.sub ? '<p class="sub">' + esc(d.sub.texto) + '</p>' : '') + '</div>');
    this.h = g.querySelector('.lb-fr2 .line'); caber(k, this.h, 1600, 340, 52);
    this.sub = g.querySelector('.lb-fr2 .sub'); if (this.sub) caber(k, this.sub, 1600, 120, 28);
    const pal = d.destaque && d.destaque.palavra, rr = pal ? k.phraseRect(this.h, pal) : null;
    if (rr) this.mk.add({ id: 'u', kind: 'underline', t0: d.destaque.t, dur: 0.45, out: d.dur - 0.9, color: '#9E4EDD', width: 10, wave: 1, x: rr.x, y: rr.y + rr.h + 8, w: rr.w });
  }, function (t, d, D) {
    const fx = fora(t, D), t0 = d.t || 0.3;
    TextFx.fadeFromRight(this.h, t, t0, { stagger: 0.09 }); this.h.parentNode.style.opacity = vis(t, t0) * fx;
    if (this.sub) { TextFx.fadeFromRight(this.sub, t, d.sub.t); this.sub.style.opacity = vis(t, d.sub.t); }
    traco(this, t, UI.LINE, null, 1 + 0.3 * (d.destaque ? pulso(t, d.destaque.t) : 0) + 0.06 * Math.sin(t * 1.4));
  }, { palcos: ['livre'] });

  // ═══ v7 (16/10/2026): 14 modelos novos, para o vídeo não repetir balança e caderno ═══════════════════════════
  // Os 5 primeiros vêm dos melhores momentos sob medida dos testes (escada, medidor, calendário, mesa, pessoas com
  // balões); os outros, de situações comuns nos roteiros. Mesmas regras: cores pelas variáveis do tema, tempos do dado,
  // texto que encolhe, entrada depois do começo e saída antes do fim. Coordenadas do .lb-cont (fora da 'linha' ele
  // desce 80 px): conteúdo entre y 250 e 860.

  // ── escada: degraus de um nível ao outro. A escada entra em CONTORNO e cada degrau se preenche e acende quando a
  //    narração fala dele (sem `t` nos degraus, entram todos juntos). A pessoa (o "você") só aparece no degrau atual
  //    pouco antes de subir ao degrau-alvo, e o alvo só pulsa a partir daí. 17/10, dono: "ele fala no primeiro degrau,
  //    o boneco está no terceiro e pisca o segundo": a versão anterior mostrava pessoa e alvo desde o começo ──
  T.escada = (d) => base(function (k, g, d) {
    const ds = (d.degraus || []).slice(0, 6), n = Math.max(2, ds.length), W = 1400 / n;
    this.n = n; this.W = W; this.hs = Array.from({ length: n }, (_, i) => 100 + (i * 320) / (n - 1));
    g.insertAdjacentHTML('beforeend', ds.map((s, i) => '<div class="lb-degrau" style="left:' + (260 + i * W) + 'px;width:' + (W - 14) + 'px;height:' + this.hs[i] + 'px;top:' + (780 - this.hs[i]) + 'px"><p>' + esc(s.texto != null ? s.texto : s) + '</p></div>').join('') +
      '<div class="lb-alpinista">' + svgIcone('pessoa', 96) + '</div>' + (d.rotulo ? '<p class="sub lb-esc-rot">' + esc(d.rotulo.texto) + '</p>' : ''));
    this.ds = Array.from(g.querySelectorAll('.lb-degrau')); this.p = g.querySelector('.lb-alpinista'); this.rot = g.querySelector('.lb-esc-rot');
    this.ds.forEach((el) => caber(k, el.firstChild, 99999, 96, 22));   // bloco de largura fixa: quem decide é o que transborda
    if (this.rot) caber(k, this.rot, 1400, 110, 26);
    this.temT = ds.some((s) => s && s.t != null);
  }, function (t, d, D) {
    const fx = fora(t, D), t0 = d.t || 0.3, n = this.ds.length, ss = d.degraus || [];
    const a = Math.max(0, Math.min(n - 1, d.atual | 0)), b = Math.max(0, Math.min(n - 1, d.alvo == null ? a + 1 : d.alvo | 0));
    const sobe = d.tSobe != null, ts = sobe ? d.tSobe : D + 1;
    const tP = sobe ? Math.max(t0 + 0.6, ts - 1.2) : this.temT ? D + 1 : t0 + 0.6;   // quando a pessoa entra
    const dito = this.ds.map((_, i) => (ss[i] && ss[i].t != null ? ss[i].t : t0 + i * 0.12));
    let falando = -1;   // o degrau de que a narração fala agora (o último dito até aqui)
    this.ds.forEach((_, i) => { if (ss[i] && ss[i].t != null && t >= ss[i].t && (falando < 0 || ss[i].t >= ss[falando].t)) falando = i; });
    this.ds.forEach((el, i) => {
      const ent = eob(seg(t, t0 + i * 0.12, t0 + 0.5 + i * 0.12), 1.4), on = t >= dito[i], pula = on ? 1 + 0.07 * Math.sin(Math.PI * seg(t, dito[i], dito[i] + 0.45)) : 1;
      el.style.transform = 'scaleY(' + (ent * pula).toFixed(3) + ')'; el.style.opacity = vis(t, t0 + i * 0.12) * fx;
      el.classList.toggle('lb-fantasma', !on);
      let p = null;   // até a pessoa entrar, acende o degrau dito agora; depois, o alvo (pulsando até ela subir)
      if (t >= tP) { if (i === b && sobe) p = t >= ts + 0.6 ? 42 : 14 + 30 * (0.5 + 0.5 * Math.sin((t - tP) * 3)); }
      else if (i === falando) p = 30 + 14 * (0.5 + 0.5 * Math.sin((t - ss[i].t) * 3));   // o degrau falado pulsa enquanto a narração fala dele
      el.style.background = p == null ? '' : 'color-mix(in srgb, var(--main) ' + p.toFixed(0) + '%, var(--ground))';
      el.classList.toggle('lb-on', p != null);
    });
    const s = eio(seg(t, ts, ts + 0.8)), chega = eob(seg(t, tP, tP + 0.45), 1.5);
    const pulinho = t < tP + 0.5 || (s > 0 && s < 1) ? 0 : 18 * Math.pow(Math.max(0, Math.sin(Math.PI * (t - tP - 0.5) / 1.2)), 6);
    const xa = 260 + a * this.W + this.W / 2 - 48, xb = 260 + b * this.W + this.W / 2 - 48;
    const ya = 780 - this.hs[a] - 112, yb = 780 - this.hs[b] - 112;
    this.p.style.transform = 'translate(' + lerp(xa, xb, s).toFixed(1) + 'px,' + (lerp(ya, yb, s) - 90 * Math.sin(Math.PI * s) - pulinho - 60 * (1 - chega)).toFixed(1) + 'px)';
    this.p.style.opacity = vis(t, tP) * fx;
    if (this.rot) { TextFx.fadeFromRight(this.rot, t, d.rotulo.t); this.rot.style.opacity = vis(t, d.rotulo.t) * fx; }
    traco(this, t, UI.LINE, null, 1);
  }, { palcos: ['livre'] });

  // ── medidor: um mostrador; o ponteiro vai de um ponto a outro ──
  T.medidor = (d) => base(function (k, g, d) {
    g.insertAdjacentHTML('beforeend', '<svg class="art lb-med-svg" viewBox="0 0 1920 1080"><path class="lb-med-fundo" d="M660 620A300 300 0 0 1 1260 620"/><path class="lb-med-valor" d="M660 620A300 300 0 0 1 1260 620"/><line class="lb-med-pont" x1="960" y1="620" x2="960" y2="380"/><circle class="lb-med-eixo" cx="960" cy="620" r="20"/></svg>' +
      '<p class="tag lb-med-min">' + esc((d.marcas && d.marcas.min) || '') + '</p><p class="tag lb-med-max">' + esc((d.marcas && d.marcas.max) || '') + '</p><p class="lb-med-rot">' + esc(d.rotulo || '') + '</p>');
    this.val = g.querySelector('.lb-med-valor'); this.pont = g.querySelector('.lb-med-pont'); this.svg = g.querySelector('.lb-med-svg');
    this.len = Math.PI * 300; this.val.style.strokeDasharray = this.len;
    this.min = g.querySelector('.lb-med-min'); this.max = g.querySelector('.lb-med-max'); this.rot = g.querySelector('.lb-med-rot');
    [this.min, this.max].forEach((el) => caber(k, el, 300, 50, 22));
    this.min.style.left = (660 - k.srect(this.min).w / 2) + 'px'; this.max.style.left = (1260 - k.srect(this.max).w / 2) + 'px';
    caber(k, this.rot, 1300, 80, 30); this.rot.style.left = (960 - k.srect(this.rot).w / 2) + 'px';
  }, function (t, d, D) {
    const fx = fora(t, D), t0 = d.t || 0.3, e = eio(seg(t, t0, t0 + 0.8));
    const de = Math.max(0, Math.min(100, d.de == null ? 20 : d.de)), para = Math.max(0, Math.min(100, d.para == null ? 80 : d.para));
    const m = d.tMove != null ? eob(seg(t, d.tMove, d.tMove + 1.2), 1.3) : 0, v = Math.max(0, Math.min(1, (lerp(de, para, m) + 1.2 * Math.sin(t * 3) * (1 - m)) / 100));
    this.svg.style.opacity = vis(t, t0) * fx;
    this.val.style.strokeDashoffset = this.len * (1 - v * e);
    this.pont.setAttribute('transform', 'rotate(' + (-90 + 180 * v * e).toFixed(2) + ' 960 620)');
    [this.min, this.max].forEach((el) => { el.style.opacity = vis(t, t0 + 0.4) * fx; });
    TextFx.fadeFromRight(this.rot, t, t0 + 0.6); this.rot.style.opacity = vis(t, t0 + 0.6) * fx;
    traco(this, t, UI.LINE, null, 1);
  }, { palcos: ['livre'] });

  // ── calendário: dias em fila; os marcados acendem quando são ditos; um carimbo resume ──
  T.calendario = (d) => base(function (k, g, d) {
    const ds = (d.dias || []).slice(0, 7), n = Math.max(1, ds.length), L = 200, gap = 24, x0 = 960 - (n * L + (n - 1) * gap) / 2;
    g.insertAdjacentHTML('beforeend', ds.map((s, i) => '<div class="lb-dia" style="left:' + (x0 + i * (L + gap)) + 'px"><span>' + esc(s.texto != null ? s.texto : s) + '</span><i></i></div>').join('') +
      (d.contador ? '<div class="lb-contador"><span>' + esc(d.contador.texto) + '</span></div>' : '') + (d.legenda ? '<p class="sub lb-cal-leg">' + esc(d.legenda.texto) + '</p>' : ''));
    this.ds = Array.from(g.querySelectorAll('.lb-dia')); this.cont = g.querySelector('.lb-contador'); this.leg = g.querySelector('.lb-cal-leg');
    this.ds.forEach((el) => caber(k, el.firstChild, L - 24, 60, 22));
    if (this.cont) { caber(k, this.cont, 420, 80, 24); this.cont.style.left = Math.min(1840 - k.srect(this.cont).w, x0 + n * (L + gap) - 200) + 'px'; }
    if (this.leg) caber(k, this.leg, 1400, 110, 28);
    this.marc = {}; for (const m of d.marcados || []) if (m && m.t != null) this.marc[m.i | 0] = m.t;
  }, function (t, d, D) {
    const fx = fora(t, D), t0 = d.t || 0.3; let rip = 0;
    this.ds.forEach((el, i) => {
      const a = t0 + i * 0.1, e = eob(seg(t, a, a + 0.45), 1.6), tm = this.marc[i];
      el.style.opacity = vis(t, a) * fx; el.style.transform = 'translateY(' + lerp(80, 0, e).toFixed(1) + 'px) scale(' + (tm != null ? 1 + 0.08 * Math.sin(Math.PI * seg(t, tm, tm + 0.5)) : 1).toFixed(3) + ')';
      el.classList.toggle('lb-on', tm != null && t >= tm); if (tm != null) rip = Math.max(rip, pulso(t, tm));
    });
    if (this.cont) { const e = eob(seg(t, d.contador.t, d.contador.t + 0.5), 1.8); this.cont.style.opacity = vis(t, d.contador.t) * fx; this.cont.style.transform = 'rotate(-6deg) scale(' + lerp(1.6, 1, e).toFixed(3) + ')'; }
    if (this.leg) { TextFx.fadeFromRight(this.leg, t, d.legenda.t); this.leg.style.opacity = vis(t, d.legenda.t) * fx; }
    traco(this, t, UI.LINE, null, 1 + 0.2 * rip);
  }, { palcos: ['livre'] });

  // ── reunião: uma mesa vista de cima; lugares com nomes; um objeto no centro; quem fala acende ──
  T.reuniao = (d) => base(function (k, g, d) {
    const ls = (d.lugares || []).slice(0, 8), n = Math.max(1, ls.length), CX = 960, CY = 560, RX = 430, RY = 150;
    this.pos = ls.map((_, i) => { const a = Math.PI + (i + 0.5) * (2 * Math.PI / n); return [CX + (RX + 70) * Math.cos(a), CY + (RY + 55) * Math.sin(a), Math.sin(a)]; });
    g.insertAdjacentHTML('beforeend', '<div class="lb-mesa" style="left:' + (CX - RX) + 'px;top:' + (CY - RY) + 'px;width:' + 2 * RX + 'px;height:' + 2 * RY + 'px"></div>' +
      ls.map((s, i) => '<div class="lb-lugar' + (this.pos[i][2] < -0.1 ? ' lb-cima' : '') + '"><i></i><p class="tag">' + esc(s.texto != null ? s.texto : s) + '</p></div>').join('') +
      (d.centro ? '<div class="card lb-mesa-obj" style="left:' + CX + 'px;top:' + CY + 'px"><p class="tag">' + esc(d.centro.texto) + '</p></div>' : ''));
    this.mesa = g.querySelector('.lb-mesa'); this.ls = Array.from(g.querySelectorAll('.lb-lugar')); this.obj = g.querySelector('.lb-mesa-obj');
    this.ls.forEach((el, i) => { caber(k, el.querySelector('.tag'), 230, 44, 20); el.style.left = (this.pos[i][0] - 45) + 'px'; el.style.top = (this.pos[i][1] - 45) + 'px'; });
    if (this.obj) caber(k, this.obj.querySelector('.tag'), 420, 50, 22);
    this.fala = {}; for (const f of d.falam || []) if (f && f.t != null) this.fala[f.i | 0] = f.t;
  }, function (t, d, D) {
    const fx = fora(t, D), t0 = d.t || 0.3, e = eio(seg(t, t0, t0 + 0.6));
    this.mesa.style.opacity = vis(t, t0) * fx; this.mesa.style.transform = 'scale(' + lerp(0.85, 1, e).toFixed(3) + ')';
    let rip = 0;
    this.ls.forEach((el, i) => {
      const a = t0 + 0.3 + i * 0.08, tf = this.fala[i];
      el.style.opacity = vis(t, a) * fx; el.style.transform = 'scale(' + (eob(seg(t, a, a + 0.4), 1.7) * (tf != null && t >= tf ? 1 + 0.12 * Math.sin(Math.PI * seg(t, tf, tf + 0.6)) : 1)).toFixed(3) + ')';
      el.classList.toggle('lb-on', tf != null && t >= tf); if (tf != null) rip = Math.max(rip, pulso(t, tf));
    });
    if (this.obj) { const a = d.centro.t != null ? d.centro.t : t0 + 0.5, s = eob(seg(t, a, a + 0.5), 1.6); this.obj.style.opacity = vis(t, a) * fx; this.obj.style.transform = 'translate(-50%,-50%) scale(' + s.toFixed(3) + ')'; }
    traco(this, t, UI.LINE, null, 1 + 0.25 * rip);
  }, { palcos: ['livre'] });

  // ── vozes: pessoas em fila, cada uma com um balão; umas falam, outras ficam em silêncio ──
  T.vozes = (d) => base(function (k, g, d) {
    const n = Math.max(3, Math.min(8, d.n || 6)), xs = Array.from({ length: n }, (_, i) => 300 + (i * 1320) / (n - 1)), bw = Math.min(230, 1320 / (n - 1) - 16);
    const fala = {}; for (const b of d.baloes || []) if (b) fala[b.i | 0] = b;
    this.fala = fala;
    g.insertAdjacentHTML('beforeend', xs.map((x, i) => '<div class="lb-voz" style="left:' + (x - 60) + 'px">' + svgIcone('pessoa', 120) + '</div><div class="lb-balao' + (fala[i] ? ' lb-fala2' : '') + '" style="left:' + (x - bw / 2) + 'px;width:' + bw + 'px"><span>' + esc(fala[i] ? fala[i].texto : '…') + '</span></div>').join('') +
      (d.destaque && d.destaque.rotulo ? '<p class="tag lb-vdest">' + esc(d.destaque.rotulo) + '</p>' : ''));
    this.ps = Array.from(g.querySelectorAll('.lb-voz')); this.bs = Array.from(g.querySelectorAll('.lb-balao')); this.dest = g.querySelector('.lb-vdest');
    this.bs.forEach((el) => caber(k, el.firstChild, bw - 24, 104, 18));
    if (this.dest) { caber(k, this.dest, 900, 64, 26); const i = Math.max(0, Math.min(n - 1, d.destaque.i | 0)); const r = k.srect(this.dest); this.dest.style.left = Math.max(80, Math.min(1840 - r.w, xs[i] - r.w / 2)) + 'px'; this.dest.style.top = '650px'; }
  }, function (t, d, D) {
    const fx = fora(t, D), t0 = d.t || 0.3, ds = d.destaque, di = ds ? ds.i | 0 : -1, on = !!ds && ds.t != null && t >= ds.t;
    let rip = 0;
    this.ps.forEach((el, i) => {
      const a = t0 + i * 0.1, up = on && i === di ? eob(seg(t, ds.t, ds.t + 0.5), 1.6) : 0;
      el.style.opacity = vis(t, a) * fx * (on && i !== di ? 0.45 : 1);
      el.style.transform = 'translateY(' + (lerp(60, 0, eo(seg(t, a, a + 0.4))) - 24 * up).toFixed(1) + 'px)'; el.classList.toggle('lb-on', up > 0);
      const b = this.bs[i], f = this.fala[i], tb = f && f.t != null ? f.t : a + 0.3, s = eob(seg(t, tb, tb + 0.4), 1.7);
      b.style.opacity = vis(t, tb) * fx * (on && i !== di ? 0.45 : 1); b.style.transform = 'scale(' + s.toFixed(3) + ')';
      if (f) rip = Math.max(rip, pulso(t, tb));
    });
    if (this.dest) { TextFx.fadeFromRight(this.dest, t, ds.t + 0.2); this.dest.style.opacity = vis(t, ds.t + 0.2) * fx; }
    traco(this, t, UI.LINE, null, 1 + 0.15 * rip);
  }, { palcos: ['livre'] });

  // ── conversa: duas pessoas trocam mensagens, em balões que entram quando são ditas ──
  T.conversa = (d) => base(function (k, g, d) {
    const ms = (d.mensagens || []).slice(0, 5), nm = d.nomes || {};
    g.insertAdjacentHTML('beforeend', '<div class="lb-conv-p lb-conv-e">' + svgIcone('pessoa', 100) + '<p class="tag">' + esc(nm.esq || '') + '</p></div><div class="lb-conv-p lb-conv-d">' + svgIcone('pessoa', 100) + '<p class="tag">' + esc(nm.dir || '') + '</p></div>' +
      ms.map((m, i) => '<div class="lb-msg ' + (m.lado === 'dir' ? 'lb-msg-d' : 'lb-msg-e') + '" style="top:' + (256 + i * 122) + 'px"><span>' + esc(m.texto) + '</span></div>').join(''));
    this.ms = Array.from(g.querySelectorAll('.lb-msg')); this.ps = Array.from(g.querySelectorAll('.lb-conv-p'));
    this.ms.forEach((el) => caber(k, el, 980, 110, 24));
    this.ps.forEach((el) => caber(k, el.querySelector('.tag'), 220, 44, 20));
  }, function (t, d, D) {
    const fx = fora(t, D), t0 = d.t || 0.3; let rip = 0;
    this.ps.forEach((el) => { el.style.opacity = vis(t, t0) * fx; el.style.transform = 'translateY(' + lerp(40, 0, eo(seg(t, t0, t0 + 0.5))).toFixed(1) + 'px)'; });
    this.ms.forEach((el, i) => {
      const m = d.mensagens[i], a = m.t != null ? m.t : t0 + 0.5 + i * 0.8, s = eob(seg(t, a, a + 0.45), 1.5), dx = m.lado === 'dir' ? 40 : -40;
      el.style.opacity = vis(t, a) * fx; el.style.transform = 'translateX(' + lerp(dx, 0, s).toFixed(1) + 'px) scale(' + lerp(0.9, 1, s).toFixed(3) + ')';
      rip = Math.max(rip, pulso(t, a));
    });
    traco(this, t, UI.LINE, null, 1 + 0.15 * rip);
  }, { palcos: ['livre'] });

  // ── painel: 2 a 4 indicadores com valor e barra; um pode acender em alerta ──
  T.painel = (d) => base(function (k, g, d) {
    const is = (d.indicadores || []).slice(0, 4), n = Math.max(1, is.length), W = Math.min(420, (1600 - (n - 1) * 30) / n), x0 = 960 - (n * W + (n - 1) * 30) / 2;
    g.insertAdjacentHTML('beforeend', is.map((x, i) => '<div class="card lb-ind" style="left:' + (x0 + i * (W + 30)) + 'px;width:' + W + 'px"><p class="tag">' + esc(x.rotulo) + '</p><p class="lb-ind-val">' + esc(x.valor) + '</p><div class="lb-ind-trilho"><i></i></div></div>').join(''));
    this.cs = Array.from(g.querySelectorAll('.lb-ind'));
    this.cs.forEach((el) => { caber(k, el.querySelector('.tag'), W - 64, 80, 22); caber(k, el.querySelector('.lb-ind-val'), W - 64, 140, 40); });
  }, function (t, d, D) {
    const fx = fora(t, D); let rip = 0;
    this.cs.forEach((el, i) => {
      const x = d.indicadores[i], a = x.t != null ? x.t : (d.t || 0.3) + i * 0.3, e = eob(seg(t, a, a + 0.5), 1.4);
      el.style.opacity = vis(t, a) * fx; el.style.transform = 'translateY(' + lerp(90, 0, e).toFixed(1) + 'px)';
      el.querySelector('.lb-ind-trilho i').style.width = (Math.max(0, Math.min(100, x.barra == null ? 60 : x.barra)) * eio(seg(t, a + 0.3, a + 1.3))).toFixed(1) + '%';
      const al = d.alerta && d.alerta.t != null && (d.alerta.i | 0) === i && t >= d.alerta.t; el.classList.toggle('lb-alerta', !!al);
      rip = Math.max(rip, pulso(t, a));
    });
    traco(this, t, UI.LINE, null, 1 + 0.2 * rip);
  }, { palcos: ['livre'] });

  // ── antes e depois: o quadro de antes; o de depois entra ao lado e o de antes apaga ──
  T.antes_depois = (d) => base(function (k, g, d) {
    const p = (lado, c) => '<div class="card lb-ad lb-ad-' + lado + '"><p class="tag">' + esc(c.titulo) + '</p>' + (c.itens || []).slice(0, 3).map((s) => '<p class="lb-ad-item"><i></i><span>' + esc(s.texto != null ? s.texto : s) + '</span></p>').join('') + '</div>';
    g.insertAdjacentHTML('beforeend', p('a', d.antes || {}) + p('d', d.depois || {}) + '<svg class="art" viewBox="0 0 1920 1080"><path class="lb-ad-seta" d="M892 510H1028M998 480L1028 510L998 540"/></svg>');
    this.a = g.querySelector('.lb-ad-a'); this.dp = g.querySelector('.lb-ad-d'); this.seta = g.querySelector('.lb-ad-seta');
    [this.a, this.dp].forEach((el) => { caber(k, el.querySelector('.tag'), 99999, 56, 24); el.querySelectorAll('.lb-ad-item span').forEach((s) => caber(k, s, 600, 104, 24)); });
  }, function (t, d, D) {
    const fx = fora(t, D), t0 = d.t || 0.3, tt = d.tTroca != null ? d.tTroca : t0 + 2;
    const ea = eob(seg(t, t0, t0 + 0.5), 1.3), ed = eob(seg(t, tt, tt + 0.6), 1.3), apaga = eo(seg(t, tt, tt + 0.6));
    this.a.style.opacity = vis(t, t0) * fx * lerp(1, 0.5, apaga); this.a.style.transform = 'translateX(' + lerp(-80, 0, ea).toFixed(1) + 'px) scale(' + lerp(1, 0.94, apaga).toFixed(3) + ')';
    this.dp.style.opacity = vis(t, tt) * fx; this.dp.style.transform = 'translateX(' + lerp(120, 0, ed).toFixed(1) + 'px)';
    this.seta.style.opacity = vis(t, tt) * fx * eo(seg(t, tt, tt + 0.4));
    this.dp.querySelectorAll('.lb-ad-item').forEach((el, i) => { el.style.opacity = vis(t, tt + 0.3 + i * 0.25); });
    traco(this, t, UI.LINE, null, 1 + 0.3 * pulso(t, tt));
  }, { palcos: ['livre'] });

  // ── quadro de tarefas: 3 colunas; os cartões andam de uma coluna para outra quando é dito ──
  T.quadro = (d) => base(function (k, g, d) {
    const cols = (d.colunas && d.colunas.length ? d.colunas : ['A fazer', 'Fazendo', 'Feito']).slice(0, 3), cs = (d.cartoes || []).slice(0, 4);
    this.cx = [360, 960, 1560];
    g.insertAdjacentHTML('beforeend', cols.map((c, i) => '<div class="lb-col-q" style="left:' + (this.cx[i] - 260) + 'px"><p class="tag">' + esc(c.texto != null ? c.texto : c) + '</p></div>').join('') +
      cs.map((c) => '<div class="lb-cartao-q"><span>' + esc(c.texto) + '</span></div>').join(''));
    this.cols = Array.from(g.querySelectorAll('.lb-col-q')); this.cs = Array.from(g.querySelectorAll('.lb-cartao-q'));
    this.cols.forEach((el) => caber(k, el.querySelector('.tag'), 99999, 50, 22)); this.cs.forEach((el) => caber(k, el.firstChild, 404, 90, 22));
    // Posições por ESTADO: depois de cada movimento, cada coluna empilha quem está nela (quem já estava, depois quem chegou),
    // então um cartão que chega nunca cai em cima de outro e quem fica sobe para o lugar de quem saiu.
    const col = (v, p) => Math.max(0, Math.min(2, v == null ? p : v | 0));
    this.ev = cs.map((c, i) => [c.t, i]).filter(([tt]) => tt != null).sort((a, b) => a[0] - b[0]);
    const ordem = cs.map((_, i) => this.ev.findIndex(([, j]) => j === i));
    this.estados = Array.from({ length: this.ev.length + 1 }, (_, k) => {
      const onde = cs.map((c, i) => (ordem[i] >= 0 && ordem[i] < k ? col(c.para, 2) : col(c.de, 0)));
      return cs.map((_, i) => {
        const chave = (j) => (ordem[j] >= 0 && ordem[j] < k ? 100 + ordem[j] : j);
        const acima = cs.filter((__, j) => onde[j] === onde[i] && chave(j) < chave(i)).length;
        return [this.cx[onde[i]], 390 + 108 * acima];
      });
    });
    const maxPilha = Math.max(1, ...this.estados.flatMap((e) => [0, 1, 2].map((c) => e.filter(([x]) => x === this.cx[c]).length)));
    this.cols.forEach((el) => { el.style.height = (130 + 108 * maxPilha) + 'px'; });
  }, function (t, d, D) {
    const fx = fora(t, D), t0 = d.t || 0.3; let rip = 0;
    this.cols.forEach((el, i) => { el.style.opacity = vis(t, t0 + i * 0.1) * fx; el.style.transform = 'translateY(' + lerp(60, 0, eo(seg(t, t0 + i * 0.1, t0 + 0.5 + i * 0.1))).toFixed(1) + 'px)'; });
    let k = 0; while (k < this.ev.length && t >= this.ev[k][0]) k++;
    const m = k ? eio(seg(t, this.ev[k - 1][0], this.ev[k - 1][0] + 0.8)) : 1, quem = k ? this.ev[k - 1][1] : -1;
    const A = this.estados[Math.max(0, k - 1)], B = this.estados[k];
    this.cs.forEach((el, i) => {
      const c = d.cartoes[i], a = t0 + 0.4 + i * 0.1, sobe = i === quem ? Math.sin(Math.PI * m) : 0;
      const x = lerp(A[i][0], B[i][0], m), y = lerp(A[i][1], B[i][1], m) - 60 * sobe;
      el.style.opacity = vis(t, a) * fx; el.style.transform = 'translate(' + (x - 226).toFixed(1) + 'px,' + y.toFixed(1) + 'px) rotate(' + (3 * sobe).toFixed(2) + 'deg)';
      el.classList.toggle('lb-on', c.t != null && t >= c.t + 0.8); if (c.t != null) rip = Math.max(rip, pulso(t, c.t + 0.8));
    });
    traco(this, t, UI.LINE, null, 1 + 0.2 * rip);
  }, { palcos: ['livre'] });

  // ── semáforo: vermelho, amarelo e verde, cada um com o seu sentido; a luz acende quando é dita ──
  T.semaforo = (d) => base(function (k, g, d) {
    const es = (d.estados || []).slice(0, 3);
    g.insertAdjacentHTML('beforeend', '<div class="lb-sem"><i class="lb-luz lb-luz-0"></i><i class="lb-luz lb-luz-1"></i><i class="lb-luz lb-luz-2"></i></div>' + es.map((s, i) => '<p class="tag lb-sem-rot" style="top:' + (382 + i * 145) + 'px">' + esc(s.texto != null ? s.texto : s) + '</p>').join(''));
    this.luzes = Array.from(g.querySelectorAll('.lb-luz')); this.rots = Array.from(g.querySelectorAll('.lb-sem-rot')); this.sem = g.querySelector('.lb-sem');
    this.rots.forEach((el) => caber(k, el, 960, 60, 26));
  }, function (t, d, D) {
    const fx = fora(t, D), t0 = d.t || 0.3, ac = (d.acende || []).filter((a) => a && a.t != null).sort((a, b) => a.t - b.t);
    let atual = -1; for (const a of ac) if (t >= a.t) atual = a.i | 0;
    this.sem.style.opacity = vis(t, t0) * fx; this.sem.style.transform = 'translateY(' + lerp(80, 0, eob(seg(t, t0, t0 + 0.5), 1.3)).toFixed(1) + 'px)';
    this.luzes.forEach((el, i) => { el.classList.toggle('lb-on', i === atual); el.style.transform = i === atual ? 'scale(' + (1 + 0.07 * Math.sin(t * 4)).toFixed(3) + ')' : ''; });   // a luz acesa pulsa
    this.rots.forEach((el, i) => { const ai = ac.find((x) => (x.i | 0) === i), a = ai ? ai.t : t0 + 0.3 + i * 0.15; TextFx.fadeFromRight(el, t, a); el.style.opacity = vis(t, a) * fx * (atual === -1 || atual === i ? 1 : 0.4); });   // o rótulo entra com a sua luz
    traco(this, t, UI.LINE, null, 1 + 0.25 * Math.max(0, ...ac.map((a) => pulso(t, a.t))));
  }, { palcos: ['livre'] });

  // ── ciclo: etapas em roda; um ponto percorre o ciclo e chega a cada etapa quando ela é dita ──
  T.ciclo = (d) => base(function (k, g, d) {
    const es = (d.etapas || []).slice(0, 5), n = Math.max(3, es.length), CX = 960, CY = 565, R = 220;
    this.ang = Array.from({ length: n }, (_, i) => -Math.PI / 2 + i * (2 * Math.PI / n)); this.C = [CX, CY, R];
    g.insertAdjacentHTML('beforeend', '<svg class="art" viewBox="0 0 1920 1080"><circle class="lb-ciclo-roda" cx="' + CX + '" cy="' + CY + '" r="' + R + '" transform="rotate(-90 ' + CX + ' ' + CY + ')"/>' + es.map((_, i) => '<circle class="lb-ciclo-no" cx="' + (CX + R * Math.cos(this.ang[i])).toFixed(1) + '" cy="' + (CY + R * Math.sin(this.ang[i])).toFixed(1) + '" r="24"/>').join('') + '<circle class="lb-ciclo-bola" r="15"/></svg>' +
      es.map((e) => '<p class="tag lb-ciclo-rot">' + esc(e.texto) + '</p>').join('') + (d.centro ? '<p class="tag lb-ciclo-c">' + esc(d.centro.texto) + '</p>' : ''));
    this.roda = g.querySelector('.lb-ciclo-roda'); this.nos = Array.from(g.querySelectorAll('.lb-ciclo-no')); this.bola = g.querySelector('.lb-ciclo-bola');
    this.rots = Array.from(g.querySelectorAll('.lb-ciclo-rot')); this.cen = g.querySelector('.lb-ciclo-c');
    this.len = 2 * Math.PI * R; this.roda.style.strokeDasharray = this.len;
    this.rots.forEach((el, i) => {
      caber(k, el, 420, 60, 22); const r = k.srect(el), a = this.ang[i], c = Math.cos(a), s = Math.sin(a), x = CX + (R + 44) * c, y = CY + (R + 44) * s;
      el.style.left = (c < -0.3 ? x - r.w : c > 0.3 ? x : x - r.w / 2) + 'px'; el.style.top = (s < -0.5 ? y - r.h : s > 0.5 ? y : y - r.h / 2) + 'px';
    });
    if (this.cen) { caber(k, this.cen, 340, 120, 24); const r = k.srect(this.cen); this.cen.style.left = (CX - r.w / 2) + 'px'; this.cen.style.top = (CY - r.h / 2) + 'px'; }
  }, function (t, d, D) {
    const fx = fora(t, D), t0 = d.t || 0.3, es = d.etapas || [], [CX, CY, R] = this.C;
    this.roda.style.strokeDashoffset = this.len * (1 - eio(seg(t, t0, t0 + 1))); this.roda.style.opacity = fx;
    let ang = this.ang[0] - 0.6, ult = null;
    es.forEach((e, i) => { if (e.t != null && t >= e.t - 0.8) { const de = i === 0 ? this.ang[0] - 0.6 : this.ang[i - 1]; ang = lerp(de, this.ang[i], eio(seg(t, e.t - 0.8, e.t))); ult = e.t; } });
    if (ult != null && ult === es[es.length - 1].t && t > ult + 0.5) ang += (t - ult - 0.5) * 0.9;   // depois da última, o ponto segue girando
    this.bola.setAttribute('cx', (CX + R * Math.cos(ang)).toFixed(1)); this.bola.setAttribute('cy', (CY + R * Math.sin(ang)).toFixed(1)); this.bola.style.opacity = vis(t, t0 + 0.6) * fx;
    this.nos.forEach((no, i) => { const a = es[i] ? es[i].t : null; no.classList.toggle('lb-on', a != null && t >= a); no.style.opacity = vis(t, t0 + 0.3) * fx; });
    this.rots.forEach((el, i) => { const a = es[i].t != null ? es[i].t : t0 + 0.4; TextFx.fadeFromRight(el, t, a); el.style.opacity = vis(t, a) * fx; });
    if (this.cen) { const a = d.centro.t != null ? d.centro.t : t0 + 0.5; TextFx.fadeFromRight(this.cen, t, a); this.cen.style.opacity = vis(t, a) * fx; }
    traco(this, t, UI.LINE, null, 1);
  }, { palcos: ['livre'] });

  // v7, espera com sentido (medido nos planos reais: número, pergunta, escada e rede ficavam 3 s+ parados).
  // Ondas que saem de um ponto: ênfase do número, a rede que se comunica. Movimento amplo e lento.
  const ondas = (svg, cx, cy, rmax) => {
    svg.insertAdjacentHTML('beforeend', '<circle class="lb-onda" cx="' + cx.toFixed(1) + '" cy="' + cy.toFixed(1) + '" r="0"/><circle class="lb-onda" cx="' + cx.toFixed(1) + '" cy="' + cy.toFixed(1) + '" r="0"/>');
    const cs = Array.from(svg.querySelectorAll('.lb-onda'));
    return (t, ta, op) => cs.forEach((c, i) => { const f = t < ta ? 0 : ((t - ta) / 2.6 + i * 0.5) % 1; c.setAttribute('r', (80 + f * rmax).toFixed(1)); c.style.opacity = (t < ta ? 0 : (1 - f) * 0.55 * op).toFixed(3); });
  };
  // Em número e pergunta, falas só ANTES do título (saem quando ele entra). Sem fala, a tela não espera vazia, mas também
  // não mostra o que ainda não foi dito (17/10, dono: o desenho tem de bater com o áudio): o número entra com os dígitos
  // GIRANDO até ser dito; a pergunta, com um "?" grande até ser feita.
  const antesDoTitulo = (d) => {
    const t0 = d.t || 0.3, pre = (d.falas || []).filter((f) => f && f.texto && f.t != null && f.t < t0 - 0.8);
    d.falas = pre.length ? pre.concat([{ t: t0, texto: '' }]) : [];
    return pre.length || t0 <= 1.2 ? t0 : 1.0;
  };

  // ── número: um número grande (que a narração diz) com a sua explicação; o número conta e é circulado ──
  T.numero = (d) => base(function (k, g, d) {
    this.tv = antesDoTitulo(d); this.tn = d.t || 0.3;
    g.insertAdjacentHTML('beforeend', '<svg class="art" viewBox="0 0 1920 1080"></svg><div class="lb-num-bloco"><p class="lb-num-v"></p><p class="lb-num-rot">' + esc(d.rotulo || '') + '</p>' + (d.contexto ? '<p class="sub lb-num-ctx">' + esc(d.contexto.texto) + '</p>' : '') + '</div>');
    this.v = g.querySelector('.lb-num-v'); this.rot = g.querySelector('.lb-num-rot'); this.ctx = g.querySelector('.lb-num-ctx');
    const val = String(d.valor == null ? '' : d.valor); this.val = val; this.v.textContent = val; caber(k, this.v, 1300, 340, 90);
    caber(k, this.rot, 1500, 130, 30); if (this.ctx) caber(k, this.ctx, 1400, 110, 26);
    // o círculo abraça o desenho dos algarismos (a caixa da linha sobra em cima e embaixo) e nunca fica mais estreito que alto
    const r = k.srect(this.v), H = r.h * 0.72, Wc = Math.max(r.w, H * 1.3);
    this.mk.add({ id: 'n', kind: 'circle', t0: this.tn + 0.7, dur: 0.6, out: d.dur - 0.9, color: '#9E4EDD', width: 9, padX: 30, padY: 4, x: r.x + r.w / 2 - Wc / 2, y: r.y + r.h / 2 - H / 2, w: Wc, h: H });
    this.onda = ondas(g.querySelector('svg.art'), r.x + r.w / 2, r.y + r.h / 2 - 80, 900);   // o svg mora no .lb-cont, que desce 80 px
    const m = val.match(/^(\D*)(\d{1,4})(\D*)$/); this.partes = m ? [m[1], Number(m[2]), m[3]] : null;   // só conta um inteiro simples
  }, function (t, d, D) {
    const fx = fora(t, D), tv = this.tv, tn = this.tn, e = eob(seg(t, tv, tv + 0.6), 1.5), c = eio(seg(t, tn, tn + 0.9)), gira = t < tn;
    this.v.style.opacity = vis(t, tv) * fx * (gira ? 0.4 : 1); this.v.style.transform = 'scale(' + (lerp(0.7, 1, e) * (1 + 0.015 * Math.sin((t - tv) * 2.2))).toFixed(4) + ')';
    if (gira) this.v.textContent = this.val.replace(/\d/g, (_, o) => String(Math.floor(t * 14 + o * 3) % 10));   // antes de ser dito: dígitos girando
    else this.v.textContent = this.partes ? this.partes[0] + Math.round(this.partes[1] * c) + this.partes[2] : this.val;
    const tr = Math.max(tv + 0.5, tn + 0.3);   // o rótulo entra com a frase que diz o número
    TextFx.fadeFromRight(this.rot, t, tr); this.rot.style.opacity = vis(t, tr) * fx;
    if (this.ctx) { TextFx.fadeFromRight(this.ctx, t, d.contexto.t); this.ctx.style.opacity = vis(t, d.contexto.t) * fx; }
    this.onda(t, tv + 0.3, fx);
    traco(this, t, UI.LINE, null, 1);
  }, { palcos: ['livre'] });

  // ── pergunta: uma pergunta com opções; o cursor passeia por elas e escolhe uma (ou só passeia: "e você?") ──
  T.pergunta = (d) => base(function (k, g, d) {
    this.tv = antesDoTitulo(d); this.tq = d.t || 0.3;
    const os = (d.opcoes || []).slice(0, 4);
    g.insertAdjacentHTML('beforeend', '<div class="words lb-perg" style="left:160px;top:240px;width:1600px"><h2 class="line s">' + esc(d.pergunta || '') + '</h2></div>' + os.map((o, i) => '<div class="lb-opc" style="top:' + (470 + i * 108) + 'px"><i></i><span>' + esc(o.texto != null ? o.texto : o) + '</span></div>').join('') + '<div class="lb-cursor"></div>' +
      (this.tv < this.tq ? '<div class="lb-perg-ic">' + svgIcone('pergunta', 230) + '</div>' : ''));
    this.h = g.querySelector('.lb-perg .line'); caber(k, this.h, 1600, 190, 44);
    this.os = Array.from(g.querySelectorAll('.lb-opc')); this.cur = g.querySelector('.lb-cursor'); this.ic = g.querySelector('.lb-perg-ic');
    this.os.forEach((el) => caber(k, el.querySelector('span'), 1080, 64, 24));
  }, function (t, d, D) {
    const fx = fora(t, D), tq = this.tq, es = d.escolha && d.escolha.t != null ? d.escolha : null, n = this.os.length;
    if (this.ic) {   // espera até a pergunta ser feita: um "?" grande que respira e sai quando ela entra
      const ent = eob(seg(t, this.tv, this.tv + 0.5), 1.6), sai = eio(seg(t, tq - 0.3, tq + 0.2));
      this.ic.style.opacity = (vis(t, this.tv) * (1 - sai) * fx).toFixed(3);
      this.ic.style.transform = 'scale(' + (ent * (1 + 0.06 * Math.sin((t - this.tv) * 3)) * (1 - 0.4 * sai)).toFixed(3) + ') rotate(' + (6 * Math.sin((t - this.tv) * 1.7)).toFixed(2) + 'deg)';
    }
    TextFx.fadeFromRight(this.h, t, tq, { stagger: 0.08 }); this.h.parentNode.style.opacity = vis(t, tq) * fx;
    const ta = this.os.map((_, i) => { const o = d.opcoes[i]; return o.t != null ? Math.max(o.t, tq + 0.4) : tq + 0.8 + i * 0.25; });
    // espera: o cursor passeia pelas opções (cada uma acende de leve quando ele para nela) até a escolha
    const P = (i) => [300 + 140 * ((i * 2) % 3), 470 + i * 108 + 40], tP = n ? Math.max(...ta) + 0.6 : D;
    const passeio = (tt) => { if (!n || tt < tP) return null; const u = (tt - tP) / 1.5, q = Math.floor(u), j = q % n, m = eio(Math.min(1, (u - q) / 0.5)), de = q === 0 ? [1500, 900] : P((q - 1) % n), pa = P(j); return [lerp(de[0], pa[0], m), lerp(de[1], pa[1], m), m >= 1 ? j : -1]; };
    let pos, clique = 1;
    if (es) {
      const i = Math.max(0, Math.min(n - 1, es.i | 0)), m = eio(seg(t, es.t - 0.6, es.t + 0.3)), ini = passeio(es.t - 0.6) || [1500, 900];
      pos = t < es.t - 0.6 ? passeio(t) : [lerp(ini[0], 248, m), lerp(ini[1], 470 + i * 108 + 40, m), -1];
      clique = 1 - 0.25 * Math.sin(Math.PI * seg(t, es.t + 0.3, es.t + 0.55));
    } else pos = passeio(Math.min(t, D - 0.6));
    this.os.forEach((el, i) => { const a = ta[i], e = eob(seg(t, a, a + 0.4), 1.4); el.style.opacity = vis(t, a) * fx; el.style.transform = 'translateX(' + lerp(-60, 0, e).toFixed(1) + 'px)'; el.classList.toggle('lb-on', !!es && (es.i | 0) === i && t >= es.t + 0.4); el.classList.toggle('lb-hover', !!pos && pos[2] === i); });
    if (pos) { this.cur.style.opacity = fx; this.cur.style.transform = 'translate(' + pos[0].toFixed(1) + 'px,' + pos[1].toFixed(1) + 'px) scale(' + clique.toFixed(3) + ')'; }
    else this.cur.style.opacity = 0;
    traco(this, t, UI.LINE, null, 1);
  }, { palcos: ['livre'] });

  // ── rede: uma pessoa no centro; as pessoas ou áreas a envolver se ligam a ela, uma a uma; depois a rede "conversa" ──
  T.rede = (d) => base(function (k, g, d) {
    const ns = (d.nos || []).slice(0, 6), n = Math.max(1, ns.length), CX = 960, CY = 530;
    this.pos = ns.map((_, i) => { const a = -Math.PI / 2 + (i + 0.5) * (2 * Math.PI / n); return [CX + 540 * Math.cos(a), CY + 240 * Math.sin(a)]; });
    g.insertAdjacentHTML('beforeend', '<svg class="art" viewBox="0 0 1920 1080">' + this.pos.map(([x, y]) => '<path class="lb-rede-l" d="M' + CX + ' ' + CY + 'L' + x.toFixed(1) + ' ' + y.toFixed(1) + '"/>').join('') + '</svg>' +
      '<div class="lb-rede-c" style="left:' + CX + 'px;top:' + CY + 'px">' + svgIcone('pessoa', 90) + '<p class="tag">' + esc(d.centro ? d.centro.texto : '') + '</p></div>' + ns.map((s) => '<div class="lb-rede-n"><p class="tag">' + esc(s.texto) + '</p></div>').join(''));
    this.ls = Array.from(g.querySelectorAll('.lb-rede-l')); this.c = g.querySelector('.lb-rede-c'); this.ns = Array.from(g.querySelectorAll('.lb-rede-n'));
    this.lens = this.ls.map((l) => { const L = l.getTotalLength(); l.style.strokeDasharray = L; return L; });
    this.onda = ondas(g.querySelector('svg.art'), CX, CY, 760);
    caber(k, this.c.querySelector('.tag'), 340, 60, 22);
    this.ns.forEach((el, i) => { caber(k, el.querySelector('.tag'), 340, 60, 22); el.style.left = this.pos[i][0] + 'px'; el.style.top = this.pos[i][1] + 'px'; });
  }, function (t, d, D) {
    const fx = fora(t, D), t0 = d.t || 0.3; let rip = 0, ult = t0;
    this.c.style.opacity = vis(t, t0) * fx; this.c.style.transform = 'translate(-50%,-50%) scale(' + eob(seg(t, t0, t0 + 0.5), 1.6).toFixed(3) + ')';
    this.ns.forEach((el, i) => {
      const x = d.nos[i], a = x.t != null ? x.t : t0 + 0.5 + i * 0.3, ds = d.destaque && d.destaque.t != null && (d.destaque.i | 0) === i && t >= d.destaque.t;
      this.ls[i].style.strokeDashoffset = this.lens[i] * (1 - eio(seg(t, a - 0.4, a + 0.2))); this.ls[i].style.opacity = fx; this.ls[i].classList.toggle('lb-on', !!ds);
      const flutua = 7 * Math.sin(t * 1.3 + i * 1.7) * eo(seg(t, a + 0.4, a + 1.2));
      el.style.opacity = vis(t, a) * fx; el.style.transform = 'translate(-50%,calc(-50% + ' + flutua.toFixed(1) + 'px)) scale(' + (eob(seg(t, a, a + 0.4), 1.7) * (ds ? 1.1 : 1)).toFixed(3) + ')'; el.classList.toggle('lb-on', !!ds);
      rip = Math.max(rip, pulso(t, a)); ult = Math.max(ult, a);
    });
    this.onda(t, t0 + 0.8, fx);   // as ondas começam logo: a rede não espera vazia pelas pessoas que ainda vão ser ditas
    traco(this, t, UI.LINE, null, 1 + 0.2 * rip);
  }, { palcos: ['livre'] });

  // v5: linha fina na borda de baixo, contínua entre momentos (tempo global); no fundo azul-claro vira navy
  UI.baseLine = (k, id) => {
    const L = UI.lines(k, id + '-base', { parent: k.stage, n: 5, gap: 6, w: 2.6 });
    L.svg.classList.add('lb-base');
    return { set(tg, fundo) { L.svg.style.setProperty('--main', fundo === 'claro' ? '#0F2B54' : fundo === 'branco' ? '#1B8F95' : '#34C5CC'); L.set({ P: UI.bumps(1014, []), t: tg, spread: 1 }); } };
  };
  for (const k of Object.keys(T)) { const f = T[k]; T[k] = (d) => { const o = f(d); o.d = d; const ini = o.init; o.init = function (kit) { this.d = d; ini.call(this, kit); }; return o; }; }
  window.LIB = { T, ICONES };
})();
