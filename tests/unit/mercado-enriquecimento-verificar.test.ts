import { describe, expect, it } from 'vitest';
import { normalizarResultado, type ResultadoBusca } from '@/lib/mercado-potencial/enriquecimento/busca-web';
import {
  buscarPaginaPublica, confirmaEmail, confirmaNome, confirmaTelefone, conferirResultado, hostNaoVale, paginaDeHtml,
  type BuscaPagina, type Pagina,
} from '@/lib/mercado-potencial/enriquecimento/verificar';
import { colapsarRamais, dominioRegistravel, finalDoTelefone, nivelDe, nomeParaBusca, semRamal } from '@/lib/mercado-potencial/enriquecimento/tipos';

/**
 * Conferência SEM modelo: só o que aparece na página que a busca citou é gravado. O piloto de Campinas mediu
 * 4 de 159 dados que NÃO estavam na página (2 nomes atribuídos a uma página que não os continha).
 */

const pagina = (html: string): Pagina => paginaDeHtml(html);
const FONTE = 'https://www.colegioexemplo.com.br/contato';

function busca(parcial: Partial<ResultadoBusca>): ResultadoBusca {
  return {
    escola_identificada: 'Colégio Exemplo', site_oficial: 'https://www.colegioexemplo.com.br', site_confere_com_endereco: true,
    telefones: [], emails: [], whatsapp: [], responsaveis: [], observacoes: '', ...parcial,
  };
}
/** Uma "internet" de mentira: a URL devolve a página programada; sem programação, inacessível. */
const web = (paginas: Record<string, Pagina>): BuscaPagina => async (url) => paginas[url] ?? { tipo: 'inacessivel' };

describe('confirmaTelefone: os 8 últimos dígitos, sem ramal', () => {
  it('casa o número no texto visível, com ou sem máscara', () => {
    const pg: any = pagina('<p>Fale conosco: (19) 3251-0000</p>');
    expect(confirmaTelefone(pg, '(19) 3251-0000')).toBe(true);
    expect(confirmaTelefone(pg, '+55 19 3251 0000')).toBe(true);
    expect(confirmaTelefone(pg, '(19) 3251-9999')).toBe(false);
  });

  it('ignora o ramal colado ao número que a busca devolveu', () => {
    const pg: any = pagina('<p>Telefone (19) 2138-8300</p>');
    expect(confirmaTelefone(pg, '(19) 2138-8300, ramal 1000')).toBe(true);
    expect(finalDoTelefone('(19) 2138-8300, ramal 1000')).toBe('21388300');
  });

  it('acha o número num link tel: ou wa.me, que não está no texto visível', () => {
    const pg: any = pagina('<a href="tel:+551932510000">Ligue</a><a href="https://wa.me/5519998887777">WhatsApp</a>');
    expect(confirmaTelefone(pg, '(19) 3251-0000')).toBe(true);
    expect(confirmaTelefone(pg, '(19) 99888-7777')).toBe(true);
  });

  it('número curto demais não confirma nada', () => {
    const pg: any = pagina('<p>123456</p>');
    expect(confirmaTelefone(pg, '123456')).toBe(false);
  });
});

describe('confirmaEmail e confirmaNome', () => {
  it('e-mail escrito como entidade HTML (&#64;) conta', () => {
    const pg: any = pagina('<p>secretaria&#64;colegioexemplo.com.br</p>');
    expect(confirmaEmail(pg, 'Secretaria@ColegioExemplo.com.br')).toBe(true);
    expect(confirmaEmail(pg, 'outra@colegioexemplo.com.br')).toBe(false);
  });

  it('nome: completo ou primeiro + último, sem acento; um nome só não basta', () => {
    const pg: any = pagina('<p>Diretora Geral: Maria Aparecida dos Santos Lima</p>');
    expect(confirmaNome(pg, 'Maria Aparecida dos Santos Lima')).toBe(true);
    expect(confirmaNome(pg, 'Maria Lima')).toBe(true);
    expect(confirmaNome(pg, 'MARÍA LIMA')).toBe(true);
    expect(confirmaNome(pg, 'Maria')).toBe(false);
    expect(confirmaNome(pg, 'João Pereira')).toBe(false);
  });
});

describe('conferirResultado: só o confirmado é gravado', () => {
  it('telefone, e-mail e nome que estão na página entram; o que não está sai e é CONTADO', async () => {
    const r = busca({
      telefones: [{ numero: '(19) 3251-0000', rotulo: 'Secretaria', fonte_url: FONTE }, { numero: '(19) 3251-7777', rotulo: 'Inventado', fonte_url: FONTE }],
      emails: [{ endereco: 'secretaria@colegioexemplo.com.br', rotulo: 'Secretaria', fonte_url: FONTE }, { endereco: 'inventado@colegioexemplo.com.br', rotulo: 'x', fonte_url: FONTE }],
      responsaveis: [{ nome: 'Maria Lima', cargo: 'Diretora', fonte_url: FONTE }, { nome: 'Carlos Inventado Souza', cargo: 'Diretor', fonte_url: FONTE }],
    });
    const c = await conferirResultado(r, web({ [FONTE]: pagina('<p>(19) 3251-0000 secretaria@colegioexemplo.com.br Diretora Maria Lima</p>') }));
    expect(c.telefones.map((t) => t.numero)).toEqual(['(19) 3251-0000']);
    expect(c.emails.map((e) => e.endereco)).toEqual(['secretaria@colegioexemplo.com.br']);
    expect(c.responsaveis.map((p) => p.nome)).toEqual(['Maria Lima']);
    expect(c.descartados).toMatchObject({ telefones: 1, emails: 1, nomes: 1 });
    expect(c.siteConfere).toBe(true);
    expect(c.site).toBe('https://www.colegioexemplo.com.br');
  });

  it('página em PDF ou inacessível NÃO confirma: o dado fica fora do banco (ausência não prova nada)', async () => {
    const r = busca({
      telefones: [{ numero: '(19) 3251-0000', rotulo: 'a', fonte_url: 'https://www.colegioexemplo.com.br/regimento.pdf' }],
      emails: [{ endereco: 'secretaria@colegioexemplo.com.br', rotulo: 'b', fonte_url: 'https://www.colegioexemplo.com.br/fora-do-ar' }],
    });
    const c = await conferirResultado(r, web({ 'https://www.colegioexemplo.com.br/regimento.pdf': { tipo: 'pdf' } }));
    expect(c.telefones).toEqual([]);
    expect(c.emails).toEqual([]);
    expect(c.descartados.naoVerificados).toBe(2);
  });

  it('fonte que é diretório, mapa ou rede social não vale, mesmo com o dado na página', async () => {
    const dir = 'https://www.telelistas.net/escola-x';
    const r = busca({ telefones: [{ numero: '(19) 3251-0000', rotulo: 'a', fonte_url: dir }] });
    const c = await conferirResultado(r, web({ [dir]: pagina('(19) 3251-0000') }));
    expect(c.telefones).toEqual([]);
    expect(c.descartados.agregador).toBe(1);
    expect(hostNaoVale('https://maps.app.goo.gl/abc')).toBe(true);
    expect(hostNaoVale('https://www.colegioexemplo.com.br')).toBe(false);
    expect(hostNaoVale('isto não é url')).toBe(true);
  });

  it('a leitura da página que lança vira "inacessível", não derruba a escola', async () => {
    const r = busca({ telefones: [{ numero: '(19) 3251-0000', rotulo: 'a', fonte_url: FONTE }] });
    const c = await conferirResultado(r, async () => { throw new Error('boom'); });
    expect(c.telefones).toEqual([]);
    expect(c.descartados.naoVerificados).toBe(1);
  });

  it('o mesmo nome repetido (ou com outra grafia de acento) entra uma vez só', async () => {
    const r = busca({
      responsaveis: [{ nome: 'Maria Lima', cargo: 'Diretora', fonte_url: FONTE }, { nome: 'María Lima', cargo: 'Diretora Geral', fonte_url: FONTE }],
    });
    const c = await conferirResultado(r, web({ [FONTE]: pagina('Maria Lima') }));
    expect(c.responsaveis).toHaveLength(1);
  });

  it('site que não confere com o endereço do Censo não é gravado', async () => {
    const c = await conferirResultado(busca({ site_confere_com_endereco: false }), web({}));
    expect(c.site).toBeNull();
    expect(c.siteConfere).toBe(false);
  });

  it('lê no máximo 8 páginas distintas por escola', async () => {
    const lidas: string[] = [];
    const r = busca({ telefones: Array.from({ length: 12 }, (_, i) => ({ numero: `(19) 3251-00${10 + i}`, rotulo: 'x', fonte_url: `https://www.colegioexemplo.com.br/p${i}` })) });
    await conferirResultado(r, async (u) => { lidas.push(u); return { tipo: 'inacessivel' }; });
    expect(new Set(lidas).size).toBeLessThanOrEqual(8);
  });
});

describe('buscarPaginaPublica: a URL vem de um modelo, então a guarda anti-SSRF vale (sem rede)', () => {
  it('endereço interno, loopback, metadados da nuvem e esquema não-http são recusados antes de qualquer conexão', async () => {
    for (const url of ['http://127.0.0.1/', 'http://localhost/admin', 'http://169.254.169.254/latest/meta-data/', 'http://10.0.0.5/', 'file:///etc/passwd', 'ftp://exemplo.com/x']) {
      expect(await buscarPaginaPublica(url), url).toEqual({ tipo: 'inacessivel' });
    }
  });

  it('link para PDF nem é aberto', async () => {
    expect(await buscarPaginaPublica('https://www.colegioexemplo.com.br/documento.pdf?v=2')).toEqual({ tipo: 'pdf' });
  });
});

describe('normalizarResultado: o que o modelo devolve é texto não confiável', () => {
  it('item sem fonte válida, e-mail malformado e nome vazio são descartados; lista é limitada', () => {
    const r = normalizarResultado({
      site_oficial: 'javascript:alert(1)',
      telefones: [{ numero: '(19) 3251-0000', fonte_url: 'https://x.com.br' }, { numero: '(19) 3251-1111', fonte_url: 'não é url' }, 'lixo', null],
      emails: [{ endereco: 'sem-arroba', fonte_url: 'https://x.com.br' }, { endereco: 'OK@X.COM.BR', fonte_url: 'https://x.com.br' }],
      responsaveis: [{ nome: '', cargo: 'Diretor', fonte_url: 'https://x.com.br' }],
    });
    expect(r.site_oficial).toBeFalsy();
    expect(r.telefones.map((t) => t.numero)).toEqual(['(19) 3251-0000']);
    expect(r.emails.map((e) => e.endereco)).toEqual(['ok@x.com.br']);
    expect(r.responsaveis).toEqual([]);
  });

  it('resposta que não é objeto vira um resultado vazio, sem lançar', () => {
    for (const x of [null, undefined, 'texto', 42, []]) {
      const r = normalizarResultado(x);
      expect(r.telefones).toEqual([]);
      expect(r.emails).toEqual([]);
      expect(r.site_confere_com_endereco).toBe(false);
    }
  });
});

describe('regras comuns', () => {
  it('dominioRegistravel: domínio da escola a partir de URL ou e-mail; lixo vira null', () => {
    expect(dominioRegistravel('https://www.colegioexemplo.com.br/contato?x=1')).toBe('colegioexemplo.com.br');
    expect(dominioRegistravel('secretaria@sub.colegioexemplo.com.br')).toBe('colegioexemplo.com.br');
    expect(dominioRegistravel('https://escola.org')).toBe('escola.org');
    expect(dominioRegistravel('semdominio')).toBeNull();
    expect(dominioRegistravel(null)).toBeNull();
  });

  it('nomeParaBusca tira honoríficos em cadeia', () => {
    expect(nomeParaBusca('Pe. Fulano de Tal')).toBe('Fulano de Tal');
    expect(nomeParaBusca('Profa. Dra. Maria Lima')).toBe('Maria Lima');
    expect(nomeParaBusca('Maria Lima')).toBe('Maria Lima');
  });

  it('nivelDe: A (site+telefone+e-mail), B (telefone ou e-mail), C (nada)', () => {
    const t = [{ numero: '1', rotulo: '', fonte_url: '' }];
    const e = [{ endereco: 'a@b.com', rotulo: '', fonte_url: '' }];
    expect(nivelDe({ site: 'https://x', telefones: t, emails: e })).toBe('A');
    expect(nivelDe({ site: null, telefones: t, emails: [] })).toBe('B');
    expect(nivelDe({ site: 'https://x', telefones: [], emails: e })).toBe('B');
    expect(nivelDe({ site: 'https://x', telefones: [], emails: [] })).toBe('C');
  });
});

describe('ramais: uma entrada por número (medido em produção: Notre Dame veio com 10 linhas do mesmo telefone)', () => {
  const tel = (numero: string, rotulo = 'x') => ({ numero, rotulo, fonte_url: 'https://www.colegioexemplo.com.br/contato' });

  it('semRamal tira "ramal", "ramais" e "r." com o que vem depois, e só isso', () => {
    expect(semRamal('(19) 2138-8300, ramal 1000')).toBe('(19) 2138-8300');
    expect(semRamal('(19) 2138-8300, ramais 1700 e 1703')).toBe('(19) 2138-8300');
    expect(semRamal('(19) 2138-8300 (ramal 1000)')).toBe('(19) 2138-8300');
    expect(semRamal('(19) 2138-8300 r. 22')).toBe('(19) 2138-8300');
    expect(semRamal('(19) 2138-8300')).toBe('(19) 2138-8300');
    expect(semRamal(null)).toBe('');
  });

  it('colapsarRamais: o mesmo número com ramais diferentes vira UMA entrada (a primeira, com rótulo e fonte); números distintos ficam', () => {
    const r = colapsarRamais([
      tel('(19) 2138-8300', 'Central'), tel('(19) 2138-8300, ramal 1000', 'Secretaria'), tel('(19) 2138-8300, ramais 1700 e 1703', 'Social'),
      tel('(19) 3303-1250', 'Outra unidade'),
    ]);
    expect(r.map((t) => t.numero)).toEqual(['(19) 2138-8300', '(19) 3303-1250']);
    expect(r[0].rotulo).toBe('Central');
  });

  it('se só há variações com ramal, fica o número principal sem o ramal; entrada sem dígito passa como veio', () => {
    expect(colapsarRamais([tel('(19) 2138-8300, ramal 1000'), tel('(19) 2138-8300, ramal 1032')]).map((t) => t.numero)).toEqual(['(19) 2138-8300']);
    expect(colapsarRamais([tel('sem número')]).map((t) => t.numero)).toEqual(['sem número']);
  });

  it('a conferência já grava um número só (não 10)', async () => {
    const pg = pagina('<p>(19) 2138-8300 ramal 1000 ramal 1032 ramal 1100</p>');
    const r = busca({ telefones: ['', ', ramal 1000', ', ramal 1032', ', ramal 1100'].map((sufixo) => tel(`(19) 2138-8300${sufixo}`)) });
    const c = await conferirResultado(r, web({ [FONTE]: pg }));
    expect(c.telefones.map((t) => t.numero)).toEqual(['(19) 2138-8300']);
  });
});
