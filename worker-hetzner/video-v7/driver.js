// Driver do filme da biblioteca v7: lê os momentos (JSON em #filme-dados), monta uma caixa por momento, cria o modelo
// da biblioteca com os dados (LIB.T[tpl](dados), sem código em texto), inicia tudo depois das fontes e registra no
// HyperFrames uma fonte de quadros: desenhar(T) mostra o momento que contém T, no seu tempo local.
(function () {
  'use strict';
  const V = window.__vertho;
  const dados = JSON.parse(document.getElementById('filme-dados').textContent);
  const STAGE = document.getElementById('stage');
  V.setStage(STAGE);
  for (const [nome, url] of Object.entries(dados.assets || {})) V.setAsset(nome, url);

  const cenas = dados.momentos.map((m) => {
    const fab = window.LIB && Object.prototype.hasOwnProperty.call(window.LIB.T, m.tpl) ? window.LIB.T[m.tpl] : null;
    if (!fab) throw new Error('modelo desconhecido na biblioteca: ' + m.tpl);
    const box = document.createElement('div');
    box.className = 'cena'; box.dataset.cena = m.id; STAGE.append(box);
    const k = V.kitDeCena(box, m.id, m.start, m.dur);
    const def = V.cena({ id: m.id, fundo: m.fundo, anterior: m.anterior, G: m.start }, fab(Object.assign({}, m.data, { id: m.id, dur: m.dur })), k);
    return { m, box, k, def };
  });

  async function iniciar() {
    await Promise.all((dados.fontes || []).map((f) => document.fonts.load(f)));
    await document.fonts.ready;
    for (const c of cenas) {   // init uma vez por cena, com a caixa visível (as medidas dependem disso)
      c.box.style.display = 'block';
      const r = c.def.init.call(c.def, c.k);
      if (r && typeof r.then === 'function') await r;
      c.def.render.call(c.def, 0, c.k);
      c.box.style.display = 'none';
    }
  }
  let ativa = null;
  function desenhar(T) {
    let c = cenas[0];
    for (const x of cenas) if (x.m.start <= T + 1e-6) c = x;
    if (ativa !== c) { if (ativa) ativa.box.style.display = 'none'; c.box.style.display = 'block'; ativa = c; }
    c.def.render.call(c.def, T - c.m.start, c.k);
  }
  const pronto = iniciar();
  V.desenhar = async (T) => { await pronto; desenhar(T); };
  if (window.__hyperframes) {
    window.__hyperframes.registerFrameSource({ element: document.getElementById('filme'), ready: pronto, render: (T) => desenhar(T), dispose: () => {}, sourceRange: { start: 0, duration: dados.duracao, fps: dados.fps } });
  }
})();
