// Camada do montador da biblioteca v7 (vertho.ai): em todo momento, o fundo do tema (navy, azul-claro ou branco),
// a passagem deslizando da cor do momento anterior e a linha fina da marca na borda de baixo, em tempo GLOBAL (contínua
// entre momentos). É a mesma camada dos vídeos de validação aprovados (16 e 17/10/2026), agora como função: recebe o
// modelo já criado, nunca código em texto.
(function () {
  'use strict';
  const TEMAS = {
    navy: { '--ground': '#0F2B54', '--deep': '#06152B', '--second': '#F7F7F7', '--main': '#34C5CC' },
    claro: { '--ground': '#9AE2E6', '--deep': '#86D3D8', '--second': '#0F2B54', '--main': '#0F2B54' },
    branco: { '--ground': '#F7F7F7', '--deep': '#E3EDEF', '--second': '#0F2B54', '--main': '#1B8F95' },
  };
  // o tema vai INLINE na caixa da cena a cada quadro (no protótipo, a regra por atributo não pegava o palco)
  function aplicarTema(caixa, fundo) {
    const v = TEMAS[fundo] || TEMAS.navy;
    caixa.dataset.fundo = fundo;
    for (const k in v) caixa.style.setProperty(k, v[k]);
    caixa.style.color = v['--second'];
  }
  /**
   * @param meta { id, fundo, anterior, G } G = início do momento no filme (s)
   * @param def  o objeto do modelo (LIB.T[tpl](dados)), com init/render
   * @param k    o kit da cena (o palco é a caixa da cena)
   */
  function cena(meta, def, k) {
    const kit = window.kit;
    return Object.assign({}, def, {
      init(kk) {
        aplicarTema(kk.stage, meta.fundo);
        kk.stage.prepend(kk.h('<div class="ground lb-fundo"></div>'));   // fundo do tema por baixo de tudo
        const fim = () => { this.__ov = kk.h('<div class="lb-wipe" data-f="' + meta.anterior + '"></div>'); kk.stage.append(this.__ov); this.__b = window.UI.baseLine(kk, meta.id); };
        const r = def.init ? def.init.call(this, kk) : null;
        if (r && typeof r.then === 'function') return r.then(fim);
        fim();
        return null;
      },
      render(t) {
        aplicarTema(k.stage, meta.fundo);
        if (def.render) def.render.call(this, t);
        const w = meta.anterior === meta.fundo ? 1 : kit.eio(kit.seg(t, 0.05, 0.6));
        this.__ov.style.transform = 'translateY(' + (-100 * w).toFixed(2) + '%)';
        this.__ov.style.visibility = w >= 1 ? 'hidden' : 'visible';
        this.__b.set(meta.G + t, w < 0.5 ? meta.anterior : meta.fundo);
      },
    });
  }
  window.__vertho.cena = cena;
  window.__vertho.TEMAS = TEMAS;
})();
