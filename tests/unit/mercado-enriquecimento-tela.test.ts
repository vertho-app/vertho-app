import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * A tela do enriquecimento é código de navegador que dispara gasto (busca web paga) e mexe em dado pessoal.
 * Estes testes leem o FONTE: o que se prova é a ligação (só na visão Escola, confirmação antes do gasto,
 * lote do tamanho certo, parada, chaves de texto nos 4 idiomas) e o que NÃO pode haver (log com dado pessoal,
 * código de servidor dentro do bundle do navegador).
 */

const raiz = process.cwd();
const ler = (p: string) => readFileSync(join(raiz, p), 'utf8');
const painel = ler('app/admin/vertho/mercado-potencial/_components/enriquecer-painel.tsx');
const pagina = ler('app/admin/vertho/mercado-potencial/page.tsx');
const layout = ler('app/admin/vertho/mercado-potencial/layout.tsx');
const acoes = ler('app/admin/vertho/mercado-potencial/actions.ts');

describe('ligação da tela', () => {
  it('o botão e o painel só existem na visão Escola', () => {
    expect(pagina).toMatch(/tab === 'escola' && \(\s*<button onClick=\{\(\) => setPainelEnriquecer/);
    expect(pagina).toMatch(/tab === 'escola' && painelEnriquecer && <EnriquecerPainel filtros=\{filtros\}/);
  });

  it('o gasto só começa depois de uma CONFIRMAÇÃO com o custo: "Enriquecer" abre a confirmação, e só "Confirmar" chama o laço', () => {
    expect(painel).toMatch(/onClick=\{\(\) => setFase\('confirmar'\)\}/);
    expect((painel.match(/onClick=\{rodar\}/g) || []).length).toBe(1);
    const confirmar = painel.indexOf("fase === 'confirmar'");
    expect(confirmar).toBeGreaterThan(-1);
    expect(painel.indexOf('onClick={rodar}')).toBeGreaterThan(confirmar);
    expect(painel).toContain("t('confirmText'");
  });

  it('o laço manda lotes do tamanho do servidor (constante compartilhada) e dá para parar', () => {
    expect(painel).toContain('fila.splice(0, TAMANHO_LOTE)');
    expect(painel).toMatch(/from '@\/lib\/mercado-potencial\/enriquecimento\/tipos'/);
    expect(painel).toContain('parar.current = true');
    expect(painel).toContain("if (parar.current) { acc.parada = 'operador'; break; }");
  });

  it('fechar o painel (ou trocar de visão) no meio do laço PARA o gasto: o desmonte liga a parada', () => {
    expect(painel).toMatch(/useEffect\(\(\) => \(\) => \{ parar\.current = true; \}, \[\]\);/);
  });

  it('o teto do dia interrompe o laço (não insiste até o fim da fila)', () => {
    expect(painel).toContain("x.adiadaPor === 'teto_diario'");
    expect(painel).toContain("if (tetoDoDia) { acc.parada = 'teto'; break; }");
  });

  it('o navegador importa do núcleo só TIPOS e constantes puras (o módulo do lote traz o servidor junto)', () => {
    const imports = painel.split('\n').filter((l) => l.startsWith('import ') && l.includes('@/lib/mercado-potencial/enriquecimento'));
    for (const l of imports) {
      const ehTipo = l.startsWith('import type');
      const ehTiposPuro = l.includes('enriquecimento/tipos');
      expect(ehTipo || ehTiposPuro, l).toBe(true);
    }
  });

  it('a tela não escreve nome, e-mail ou telefone em log', () => {
    expect(painel).not.toMatch(/console\./);
  });

  it('o layout estende o tempo da função para 300 s (o lote leva a busca web de 5 escolas)', () => {
    expect(layout).toMatch(/export const maxDuration = 300;/);
    expect(layout).toMatch(/return children;/);
  });

  it('o PIOR CASO de uma chamada cabe nos 300 s: busca + páginas + chamadas do Hunter (+ a espera por uma segunda leva, se o lote não rodar inteiro)', () => {
    const num = (texto: string, re: RegExp): number => {
      const m = texto.match(re);
      if (!m) throw new Error(`constante não encontrada: ${re}`);
      return Number(m[1].replace(/_/g, ''));
    };
    const busca = num(ler('lib/mercado-potencial/enriquecimento/busca-web.ts'), /timeoutMs: ([\d_]+)/);
    const paginas = num(ler('lib/mercado-potencial/enriquecimento/verificar.ts'), /timeoutMs: ([\d_]+)/);
    const hunter = num(ler('lib/mercado-potencial/enriquecimento/hunter.ts'), /AbortSignal\.timeout\(([\d_]+)\)/);
    const lote = ler('lib/mercado-potencial/enriquecimento/lote.ts');
    const prazo = num(lote, /PRAZO_PARA_COMECAR_MS = ([\d_]+)/);
    const tamanho = num(ler('lib/mercado-potencial/enriquecimento/tipos.ts'), /TAMANHO_LOTE = (\d+)/);
    const rodaTudoJunto = /const CONCORRENCIA = TAMANHO_LOTE;/.test(lote);
    // Até 4 chamadas ao Hunter por escola: 2 decisores × (Finder + Verifier).
    const umaEscola = busca + paginas + 4 * hunter;
    const pior = (rodaTudoJunto ? 0 : prazo) + umaEscola;
    expect(tamanho).toBe(5);
    expect(pior, `pior caso ${pior} ms`).toBeLessThanOrEqual(280_000);
  });
});

describe('textos: toda chave que a tela usa existe nos 4 idiomas, com os mesmos placeholders', () => {
  const chaves = [...painel.matchAll(/\bt\('([A-Za-z.]+)'/g)].map((m) => m[1]);
  const doBotao = [...pagina.matchAll(/t\('(enrich\.[A-Za-z.]+)'/g)].map((m) => m[1].replace(/^enrich\./, ''));
  const usadas = [...new Set([...chaves, ...doBotao])];
  const idiomas = ['pt-BR', 'pt-PT', 'es-ES', 'en-US'];
  const busca = (o: any, caminho: string) => caminho.split('.').reduce((a, k) => (a == null ? a : a[k]), o);

  it('a tela usa chaves (sanidade do próprio teste)', () => {
    expect(usadas.length).toBeGreaterThan(30);
    expect(usadas).toContain('button');
    expect(usadas).toContain('suppress.submit');
  });

  for (const idioma of idiomas) {
    it(`${idioma}: todas as chaves existem, são texto não vazio e sem travessão`, () => {
      const enrich = JSON.parse(ler(`messages/${idioma}.json`)).AdminMarketPotential.enrich;
      for (const k of usadas) {
        const v = busca(enrich, k);
        expect(typeof v, `${idioma} ${k}`).toBe('string');
        expect(v.trim().length, `${idioma} ${k}`).toBeGreaterThan(0);
        expect(v, `${idioma} ${k}`).not.toMatch(/[—–]/);
      }
    });
  }

  it('os placeholders de cada chave são os mesmos nos 4 idiomas (um {usd} esquecido vira "{usd}" na tela)', () => {
    const ph = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
    const base = JSON.parse(ler('messages/pt-BR.json')).AdminMarketPotential.enrich;
    for (const idioma of idiomas.slice(1)) {
      const outro = JSON.parse(ler(`messages/${idioma}.json`)).AdminMarketPotential.enrich;
      for (const k of usadas) expect(ph(busca(outro, k)), `${idioma} ${k}`).toBe(ph(busca(base, k)));
    }
  });

  it('os parâmetros que a tela passa cobrem os placeholders do texto (nenhum fica sem valor)', () => {
    const base = JSON.parse(ler('messages/pt-BR.json')).AdminMarketPotential.enrich;
    for (const m of painel.matchAll(/\bt\('([A-Za-z.]+)', \{([^}]*)\}/g)) {
      const esperados = [...String(busca(base, m[1])).matchAll(/\{(\w+)\}/g)].map((x) => x[1]);
      for (const p of esperados) expect(m[2], `${m[1]} sem {${p}}`).toMatch(new RegExp(`\\b${p}\\b`));
    }
  });
});

describe('nada de dado pessoal em log, em todo o núcleo e nas actions', () => {
  const pasta = 'lib/mercado-potencial/enriquecimento';
  const arquivos = readdirSync(join(raiz, pasta)).filter((f) => f.endsWith('.ts'));

  it('o núcleo tem os arquivos esperados (sanidade)', () => {
    expect(arquivos.sort()).toEqual(['busca-web.ts', 'enriquecer.ts', 'hunter.ts', 'lote.ts', 'persistencia.ts', 'tipos.ts', 'verificar.ts']);
  });

  it('só UM console no núcleo (o erro por escola, com código INEP e classe do erro) e nenhum nas actions', () => {
    const achados: string[] = [];
    for (const f of arquivos) for (const l of ler(`${pasta}/${f}`).split('\n')) if (/console\./.test(l)) achados.push(`${f}: ${l.trim()}`);
    expect(achados).toHaveLength(1);
    expect(achados[0]).toContain("console.error('[mercado-enriquecer] falha na escola', inep, e instanceof Error ? e.name : typeof e)");
    expect(acoes).not.toMatch(/console\./);
  });

  it('a chave do Hunter só é lida em tempo de execução (nunca numa const de topo de módulo) e nunca vai para a URL', () => {
    const hunter = ler(`${pasta}/hunter.ts`);
    const linhas = hunter.split('\n').filter((l) => /process\.env\.HUNTER_API/.test(l));
    expect(linhas).toHaveLength(1);
    expect(linhas[0]).toMatch(/^\s+const chave = /);            // dentro da função (indentada), não no topo do módulo
    expect(hunter).not.toMatch(/api_key/);
  });

  it('as actions pedem o mesmo gate (exports.run + @vertho.ai) e nenhuma aceita parâmetro que pule o gate', () => {
    expect(acoes).toMatch(/requireAdminAction\('exports\.run'\)/);
    expect(acoes).not.toMatch(/export async function (planejarEnriquecimento|enriquecerLote|suprimirContato)\([^)]*(internal|empresaId|skipGate)/);
    for (const nome of ['planejarEnriquecimento', 'enriquecerLote', 'suprimirContato', 'exportarMercadoXLSX']) {
      const corpo = acoes.slice(acoes.indexOf(`export async function ${nome}`));
      const primeiras = corpo.slice(0, 400);
      expect(primeiras, nome).toMatch(/gateEquipe\(/);
    }
  });
});
