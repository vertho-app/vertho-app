import { describe, it, expect, vi } from 'vitest';

vi.mock('@/actions/ai-client', () => ({ callAI: vi.fn() }));

import {
  normalizarHex,
  extrairCoresDeCss,
  extrairSinaisDoHtml,
  ranquearCores,
  ehNeutra,
  ehIpPrivado,
  validarUrlSite,
  contrasteWCAG,
  garantirContraste,
  validarPaletaIA,
  limparRuidoCss,
  extrairCoresDeMarca,
  ancorarNasCandidatas,
  type PaletaLogin,
  type CandidatoCor,
} from '@/lib/site-palette';

describe('normalizarHex', () => {
  it('expande #abc, preserva 6 dígitos, descarta alpha de 8', () => {
    expect(normalizarHex('#abc')).toBe('#AABBCC');
    expect(normalizarHex('0d9488')).toBe('#0D9488');
    expect(normalizarHex('#0D9488FF')).toBe('#0D9488');
  });
  it('lixo → null', () => {
    expect(normalizarHex('#ab')).toBeNull();
    expect(normalizarHex('#GGGGGG')).toBeNull();
    expect(normalizarHex('red')).toBeNull();
  });
});

describe('extrairCoresDeCss', () => {
  it('conta hex (3/6/8) e rgb/rgba, normalizado', () => {
    const css = `.a{color:#0d9488}.b{background:#0D9488;border:1px solid #abc}
      .c{color:rgb(13,148,136)} .d{color:rgba(0,180,216,0.9)} .e{color:rgba(1,2,3,0.1)}`;
    const m = extrairCoresDeCss(css);
    expect(m.get('#0D9488')).toBe(3); // 2 hex + 1 rgb equivalente
    expect(m.get('#AABBCC')).toBe(1);
    expect(m.get('#00B4D8')).toBe(1);
    expect(m.has('#010203')).toBe(false); // alpha 0.1 = quase transparente, fora
  });
});

describe('extrairSinaisDoHtml', () => {
  const html = `<html><head><title>UniAnchieta — Portal</title>
    <meta content="#123456" name="theme-color">
    <link rel="stylesheet" href="/assets/main.css">
    <link href="https://cdn.site.com/x.css" rel="preload stylesheet">
    <link rel="manifest" href="/site.webmanifest">
    <style>.hero{color:#FF0000}</style></head>
    <body><div style="background:#00FF00">x</div></body></html>`;
  const s = extrairSinaisDoHtml(html, 'https://www.exemplo.com/pagina');

  it('theme-color em qualquer ordem de atributos', () => {
    expect(s.themeColor).toBe('#123456');
  });
  it('links de CSS resolvidos pra URL absoluta', () => {
    expect(s.cssLinks).toEqual(['https://www.exemplo.com/assets/main.css', 'https://cdn.site.com/x.css']);
  });
  it('style blocks + style="" entram no inlineCss; manifest e título capturados', () => {
    expect(s.inlineCss).toContain('#FF0000');
    expect(s.inlineCss).toContain('#00FF00');
    expect(s.manifestHref).toBe('https://www.exemplo.com/site.webmanifest');
    expect(s.titulo).toContain('UniAnchieta');
  });
});

describe('ehNeutra / ranquearCores', () => {
  it('cinzas/branco/preto são neutras; cores de marca não', () => {
    expect(ehNeutra('#808080')).toBe(true);
    expect(ehNeutra('#FFFFFF')).toBe(true);
    expect(ehNeutra('#000000')).toBe(true);
    expect(ehNeutra('#0D9488')).toBe(false);
    expect(ehNeutra('#00B4D8')).toBe(false);
  });
  it('ordena por frequência com flag de neutra', () => {
    const r = ranquearCores(new Map([['#FFFFFF', 90], ['#0D9488', 12], ['#00B4D8', 30]]));
    expect(r.map(c => c.hex)).toEqual(['#FFFFFF', '#00B4D8', '#0D9488']);
    expect(r[0].neutra).toBe(true);
    expect(r[1].neutra).toBe(false);
  });
});

describe('anti-SSRF', () => {
  it('faixas privadas/reservadas', () => {
    for (const ip of ['10.0.0.1', '172.16.0.1', '172.31.255.255', '192.168.1.1', '127.0.0.1', '169.254.169.254', '100.64.0.1', '0.0.0.0']) {
      expect(ehIpPrivado(ip)).toBe(true);
    }
    expect(ehIpPrivado('8.8.8.8')).toBe(false);
    expect(ehIpPrivado('186.202.10.5')).toBe(false);
  });
  it('IPv6: loopback, ULA, link-local e IPv4 mapeado', () => {
    expect(ehIpPrivado('::1')).toBe(true);
    expect(ehIpPrivado('fd12:3456::1')).toBe(true);
    expect(ehIpPrivado('fe80::1')).toBe(true);
    expect(ehIpPrivado('::ffff:10.0.0.1')).toBe(true);
    expect(ehIpPrivado('2001:4860:4860::8888')).toBe(false);
  });
  it('validarUrlSite: aceita domínio (completa https), rejeita interno/esquema errado', () => {
    expect(validarUrlSite('www.unianchieta.edu.br')).toMatchObject({ ok: true });
    expect(validarUrlSite('http://site.com/página')).toMatchObject({ ok: true });
    expect(validarUrlSite('http://localhost:3000')).toMatchObject({ ok: false });
    expect(validarUrlSite('https://intranet.local')).toMatchObject({ ok: false });
    expect(validarUrlSite('ftp://site.com')).toMatchObject({ ok: false });
    expect(validarUrlSite('http://192.168.0.10')).toMatchObject({ ok: false });
  });
});

describe('contraste — imposto em código', () => {
  it('WCAG: branco×preto = 21, cor×ela mesma = 1', () => {
    expect(contrasteWCAG('#FFFFFF', '#000000')).toBeCloseTo(21, 0);
    expect(contrasteWCAG('#0D9488', '#0D9488')).toBe(1);
  });

  const base: PaletaLogin = {
    font_color: '#FFFFFF', font_color_secondary: '#FFFFFF99',
    primary_color: '#0D9488', primary_color_end: '#0F766E',
    accent_color: '#00B4D8', bg_gradient_start: '#091D35', bg_gradient_end: '#0F2A4A',
  };

  it('paleta boa passa intocada', () => {
    const { paleta, ajustes } = garantirContraste(base);
    expect(paleta).toEqual(base);
    expect(ajustes).toEqual([]);
  });

  it('fonte clara sobre fundo claro é corrigida (nunca publica ilegível)', () => {
    const { paleta, ajustes } = garantirContraste({ ...base, bg_gradient_start: '#F5F5F5', bg_gradient_end: '#EAEAEA' });
    expect(paleta.font_color).toBe('#111827');
    expect(paleta.font_color_secondary).toBe('#111827B3'); // 60% não dava 4.5 sobre o fundo claro
    expect(contrasteWCAG(paleta.font_color, '#F5F5F5')).toBeGreaterThanOrEqual(4.5);
    expect(ajustes.length).toBe(3); // fonte, secundária e accent (ciano sobre claro não lia)
    expect(contrasteWCAG(paleta.accent_color, '#F5F5F5')).toBeGreaterThanOrEqual(4.5);
    expect(contrasteWCAG(paleta.accent_color, '#EAEAEA')).toBeGreaterThanOrEqual(4.5);
  });

  it('botão claro demais escurece até o texto branco ler (≥ 3.0)', () => {
    const { paleta, ajustes } = garantirContraste({ ...base, primary_color: '#FFD700', primary_color_end: '#FFEE55' });
    expect(contrasteWCAG(paleta.primary_color, '#FFFFFF')).toBeGreaterThanOrEqual(3.0);
    expect(contrasteWCAG(paleta.primary_color_end, '#FFFFFF')).toBeGreaterThanOrEqual(3.0);
    expect(ajustes.some(a => a.includes('botão'))).toBe(true);
  });

  it('preserva botão laranja com fonte azul sobre fundo claro', () => {
    const marca: PaletaLogin = {
      ...base,
      font_color: '#011950', font_color_secondary: '#011950',
      primary_color: '#D95700', primary_color_end: '#C97E19',
      bg_gradient_start: '#FEFEFE', bg_gradient_end: '#E1A701',
    };
    const { paleta } = garantirContraste(marca);
    expect({ ...paleta, accent_color: marca.accent_color }).toEqual(marca); // só o accent (ciano sobre claro) muda
    expect(contrasteWCAG(paleta.accent_color, '#FEFEFE')).toBeGreaterThanOrEqual(4.5);
    expect(contrasteWCAG(paleta.accent_color, '#E1A701')).toBeGreaterThanOrEqual(4.5);
  });

  it('clareia as duas pontas do botão quando a fonte configurada é escura', () => {
    const { paleta, ajustes } = garantirContraste({
      ...base,
      font_color: '#011950', font_color_secondary: '#01195099',
      primary_color: '#011950', primary_color_end: '#001030',
      bg_gradient_start: '#FEFEFE', bg_gradient_end: '#E1A701',
    });
    expect(paleta.font_color).toBe('#011950');
    expect(contrasteWCAG(paleta.primary_color, paleta.font_color)).toBeGreaterThanOrEqual(3.0);
    expect(contrasteWCAG(paleta.primary_color_end, paleta.font_color)).toBeGreaterThanOrEqual(3.0);
    expect(ajustes.some(a => a.includes('botão'))).toBe(true);
  });

  it('corrige o fim do gradiente mesmo quando o início já tem contraste', () => {
    const { paleta } = garantirContraste({ ...base, primary_color_end: '#FFEE55' });
    expect(paleta.primary_color).toBe(base.primary_color);
    expect(contrasteWCAG(paleta.primary_color_end, paleta.font_color)).toBeGreaterThanOrEqual(3.0);
  });
});

describe('validarPaletaIA', () => {
  const ok = {
    font_color: '#ffffff', font_color_secondary: '#FFFFFF99',
    primary_color: '#0d9488', primary_color_end: '#0F766E',
    accent_color: '#00B4D8', bg_gradient_start: '#091D35', bg_gradient_end: '#0F2A4A',
    racional: 'x',
  };
  it('shape válido normaliza pra maiúsculas', () => {
    const p = validarPaletaIA(ok);
    expect(p?.font_color).toBe('#FFFFFF');
    expect(p?.font_color_secondary).toBe('#FFFFFF99');
  });
  it('campo faltando ou não-hex → null (IA re-tenta, nunca aplica lixo)', () => {
    expect(validarPaletaIA({ ...ok, accent_color: undefined })).toBeNull();
    expect(validarPaletaIA({ ...ok, primary_color: 'teal' })).toBeNull();
    expect(validarPaletaIA(null)).toBeNull();
  });
});

// Amazon Bowling (30/09/2026): presets do WordPress e plugin entravam como "marca",
// e a IA devolvia #F26100 — cor que o site não tem (tinha #C97E19 e #FF6600).
describe('limparRuidoCss / extrairCoresDeMarca', () => {
  const css = `:root{--wp--preset--color--vivid-red:#cf2e2e;--wp--preset--color--awb-color-6:rgba(201,126,25,1);--wp-admin-theme-color:#007cba}
.has-vivid-cyan-blue-color{color:#0693e3!important}
.btn{background:#C97E19}`;
  it('some com presets do core do WP, .has-* e vars do admin; mantém awb-color e regras do site', () => {
    const limpo = limparRuidoCss(css);
    expect(limpo).not.toMatch(/cf2e2e|0693e3|007cba/i);
    expect(limpo).toMatch(/201,126,25/);
    expect(limpo).toMatch(/#C97E19/);
  });
  it('variável de marca (awb-color-N, primary, accent) é lida; var qualquer não', () => {
    const m = extrairCoresDeMarca('--awb-color-6:rgba(201,126,25,1);--primary_color:#65bc7b;--sombra:#123456');
    expect([...m.keys()].sort()).toEqual(['#65BC7B', '#C97E19']);
  });
});

describe('ancorarNasCandidatas — a IA propõe, o código ancora', () => {
  const c = (hex: string, count = 10): CandidatoCor => ({ hex, count, neutra: ehNeutra(hex), luminancia: 0.3 });
  const candidatos = [c('#FFFFFF'), c('#C97E19'), c('#65BC7B')];
  const base: PaletaLogin = {
    font_color: '#333333', font_color_secondary: '#33333399', primary_color: '#C97E19',
    primary_color_end: '#B16D11', accent_color: '#65BC7B', bg_gradient_start: '#FFFFFF', bg_gradient_end: '#EBEAEA',
  };
  it('cor inventada vira a candidata mais próxima', () => {
    const { paleta, ajustes } = ancorarNasCandidatas({ ...base, primary_color: '#F26100' }, candidatos);
    expect(paleta.primary_color).toBe('#C97E19');
    expect(ajustes.join()).toMatch(/F26100/);
  });
  it('cor do site passa intocada, sem ajuste', () => {
    const { paleta, ajustes } = ancorarNasCandidatas(base, candidatos);
    expect(paleta).toEqual(base);
    expect(ajustes).toEqual([]);
  });
  it('neutras nunca são destino do snap', () => {
    const { paleta } = ancorarNasCandidatas({ ...base, accent_color: '#999999' }, candidatos);
    expect(['#C97E19', '#65BC7B']).toContain(paleta.accent_color);
  });
  it('fim do gradiente de outro matiz é refeito a partir da primária', () => {
    const { paleta } = ancorarNasCandidatas({ ...base, primary_color_end: '#0051A0' }, candidatos);
    expect(paleta.primary_color_end).toBe('#AB6B15');
  });
});

describe('contraste — secundária e accent (texto corrido ≥ 4.5)', () => {
  const b: PaletaLogin = {
    font_color: '#333333', font_color_secondary: '#33333399',
    primary_color: '#C97E19', primary_color_end: '#B16D11',
    accent_color: '#A0CE4E', bg_gradient_start: '#FFFFFF', bg_gradient_end: '#EBEAEA',
  };
  it('secundária a 60% que não lê sobe de opacidade até ≥ 4.5 efetivo', () => {
    const { paleta } = garantirContraste(b);
    const a = parseInt(paleta.font_color_secondary.slice(7) || 'FF', 16) / 255;
    expect(a).toBeGreaterThan(0.6);
  });
  it('secundária que já lê é preservada (não sobrescreve escolha boa)', () => {
    const { paleta } = garantirContraste({ ...b, font_color: '#011950', font_color_secondary: '#011950' });
    expect(paleta.font_color_secondary).toBe('#011950');
  });
  it('accent verde-limão sobre fundo claro escurece no mesmo matiz', () => {
    const { paleta } = garantirContraste(b);
    expect(contrasteWCAG(paleta.accent_color, '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
    expect(contrasteWCAG(paleta.accent_color, '#EBEAEA')).toBeGreaterThanOrEqual(4.5);
  });
  it('fonte só é trocada se a alternativa lê no fundo E no botão; senão o botão é que se ajusta', () => {
    const { paleta } = garantirContraste({ ...b, font_color: '#333333', primary_color: '#2B2B2B', primary_color_end: '#1A1A1A', bg_gradient_start: '#FFFFFF', bg_gradient_end: '#F0F0F0' });
    // branco não lê no fundo claro, então a fonte fica e o botão é que clareia (≥ 3.0)
    expect(paleta.font_color).toBe('#333333');
    expect(contrasteWCAG(paleta.primary_color, '#333333')).toBeGreaterThanOrEqual(3.0);
  });
});
