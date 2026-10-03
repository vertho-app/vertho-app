import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { semComentarios } from '../helpers/fonte';
import {
  GRAVACAO_LIGADA,
  GRAVACAO_TAMANHO_DA_ETIQUETA,
  entradaDaEtiqueta,
  redigirEventoDeGravacao,
  redigirEventoDoSentry,
  redigirUrlDaGravacao,
  rotaPermiteGravar,
} from '@/lib/demo/degustacao-gravacao';
import { etiquetaDaGravacao } from '@/lib/demo/degustacao-gravacao-servidor';
import { emitirCodigoCurto } from '@/lib/demo/degustacao-link-curto';

process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'service-role-key-used-only-by-unit-test';

/**
 * Gravação de tela da degustação C (Sentry Replay, plano de 50 por mês).
 *
 * O que custa caro e não falha sozinho: ligar o replay para o app inteiro (gasta
 * a cota no primeiro dia, e o mesmo código atende clientes reais), mandar o
 * código do convite para um terceiro, e a etiqueta do painel não bater com a do
 * navegador (a gravação existe e ninguém acha).
 */

const SID = 'cccccccccccccccccccc';
const CODIGO = 'AbCdEfGhIjKlMnOpQrStUvWx';

describe('etiqueta da gravação', () => {
  it('o painel (node) e o navegador (crypto.subtle) calculam a MESMA etiqueta', async () => {
    const codigo = emitirCodigoCurto('acme-demo', SID);
    // o mesmo cálculo do componente do navegador
    const resumo = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(entradaDaEtiqueta(codigo)));
    const doNavegador = Array.from(new Uint8Array(resumo)).map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, GRAVACAO_TAMANHO_DA_ETIQUETA);
    expect(etiquetaDaGravacao('acme-demo', SID)).toBe(doNavegador);
    expect(doNavegador).toMatch(/^[0-9a-f]{12}$/);
  });

  it('não carrega o código do convite, a sessão nem nome: é um hash', () => {
    const etiqueta = etiquetaDaGravacao('acme-demo', SID);
    expect(etiqueta).not.toContain(SID.slice(0, 6));
    expect(emitirCodigoCurto('acme-demo', SID)).not.toContain(etiqueta);
    expect(entradaDaEtiqueta(CODIGO)).toContain(CODIGO); // a ENTRADA tem o código; a etiqueta não
    expect(etiqueta).not.toContain(CODIGO.slice(0, 6));
  });

  it('muda de sessão para sessão e de ambiente para ambiente (dois leads nunca partilham gravação)', () => {
    const a = etiquetaDaGravacao('acme-demo', SID);
    expect(etiquetaDaGravacao('acme-demo', 'd'.repeat(20))).not.toBe(a);
    expect(etiquetaDaGravacao('escolas-acme', SID)).not.toBe(a);
    expect(etiquetaDaGravacao('acme-demo', SID)).toBe(a);
  });
});

describe('redação de credenciais nas URLs da gravação', () => {
  it('tira o ticket da sala, o código de volta e o passe, e mantém o resto', () => {
    const url = `https://rh-demo.vertho.ai/dashboard/gestor/engajamento?sala=abc.def-123&tela=computador&volta=${CODIGO}&cena=engajamento`;
    const limpa = redigirUrlDaGravacao(url);
    expect(limpa).toBe('https://rh-demo.vertho.ai/dashboard/gestor/engajamento?sala=x&tela=computador&volta=x&cena=engajamento');
    expect(redigirUrlDaGravacao('/auth/degustacao?passe=eyJh.bGci&aviso=aguarde')).toBe('/auth/degustacao?passe=x&aviso=aguarde');
    expect(redigirUrlDaGravacao('/x?ticket=segredo#ancora')).toBe('/x?ticket=x#ancora');
  });

  it('tira o código do link curto do caminho /c/<código>', () => {
    expect(redigirUrlDaGravacao(`https://acme-demo.vertho.ai/c/${CODIGO}`)).toBe('https://acme-demo.vertho.ai/c/x');
    expect(redigirUrlDaGravacao(`https://acme-demo.vertho.ai/c/${CODIGO}?aviso=x`)).toBe('https://acme-demo.vertho.ai/c/x?aviso=x');
  });

  it('não mexe em texto sem credencial, nem em caminho parecido', () => {
    for (const texto of ['/dashboard', 'Início da degustação', '/c/curto', '/cena/abc', 'https://acme-demo.vertho.ai/dashboard?x=1']) {
      expect(redigirUrlDaGravacao(texto)).toBe(texto);
    }
  });

  it('o nome do parâmetro não escapa por caixa', () => {
    expect(redigirUrlDaGravacao('/x?SALA=abc&Volta=def')).toBe('/x?SALA=x&Volta=x');
  });
});

describe('a cota de 50 gravações por mês (guard estático)', () => {
  const rastreados = () => execFileSync('git', ['ls-files', 'app', 'lib', 'components', 'instrumentation-client.ts', 'sentry.client.config.js'], { encoding: 'utf8' })
    .split(/\r?\n/)
    .filter((arquivo) => /\.(ts|tsx|js|mjs)$/.test(arquivo));

  it('o denominador não é zero: o guard enxerga o arquivo de init do Sentry', () => {
    expect(rastreados()).toContain('sentry.client.config.js');
    expect(rastreados().length).toBeGreaterThan(100);
  });

  it('o init do Sentry NÃO liga replay para o app inteiro', () => {
    const fonte = semComentarios(readFileSync('sentry.client.config.js', 'utf8'));
    expect(fonte).not.toMatch(/replayIntegration/);
    // taxa de sessão ou de erro acima de zero gastaria a cota com cliente real
    for (const taxa of fonte.matchAll(/replays(?:Session|OnError)SampleRate\s*:\s*([^,}\n]+)/g)) {
      expect(Number(taxa[1].trim()), taxa[0]).toBe(0);
    }
  });

  it('só o componente da degustação referencia o replay (ninguém liga por outro caminho)', () => {
    const usam = rastreados().filter((arquivo) => /replayIntegration|lazyLoadIntegration|getReplay\(/.test(semComentarios(readFileSync(arquivo, 'utf8'))));
    expect(usam).toEqual(['app/degustacao/gravacao-da-degustacao.tsx']);
  });

  it('o componente só roda para convidado (precisa do código) e recusa navegador automatizado', () => {
    const fonte = semComentarios(readFileSync('app/degustacao/gravacao-da-degustacao.tsx', 'utf8'));
    expect(fonte).toMatch(/if \(!codigo\) return;/);
    expect(fonte).toMatch(/webdriver === true\) return;/);
    expect(fonte).toMatch(/maskAllInputs: true/);
    // nunca o código como valor de tag: só a etiqueta (hash do código)
    expect(fonte).not.toMatch(/setTag\(\s*[^,]+,\s*codigo\s*\)/);
    expect(fonte).toMatch(/setTag\(GRAVACAO_TAG, await etiquetaDoConvite\(codigo\)\)/);
  });

  it('o componente instala os três redatores e pausa nas rotas com conversa', () => {
    const fonte = semComentarios(readFileSync('app/degustacao/gravacao-da-degustacao.tsx', 'utf8'));
    expect(fonte).toMatch(/beforeAddRecordingEvent: redigirEventoDeGravacao/);
    expect(fonte).toMatch(/addEventProcessor\(redigirEventoDoSentry\)/);
    expect(fonte).toMatch(/rotaPermiteGravar\(pathname\)/);
    expect(fonte).toMatch(/replay\.stop\(\)/);
  });
});

describe('o código do convite não vai para o Sentry em nenhum dos três lugares', () => {
  const URL_COM_CODIGO = `https://acme-demo.vertho.ai/c/${CODIGO}`;

  it('🔴 fluxo da gravação: o href do evento de metadados (a falha medida em produção) e o payload aninhado', () => {
    const meta: any = { type: 4, data: { href: URL_COM_CODIGO, width: 1280, height: 720 } };
    expect(redigirEventoDeGravacao(meta).data.href).toBe('https://acme-demo.vertho.ai/c/x');
    expect(meta.data.width).toBe(1280);

    const nav: any = { type: 5, data: { tag: 'performanceSpan', payload: { description: `${URL_COM_CODIGO}?aviso=x`, data: { from: `/c/${CODIGO}`, to: '/dashboard?sala=abc.def' } } } };
    const limpo = redigirEventoDeGravacao(nav).data.payload;
    expect(limpo.description).toBe('https://acme-demo.vertho.ai/c/x?aviso=x');
    expect(limpo.data.from).toBe('/c/x');
    expect(limpo.data.to).toBe('/dashboard?sala=x');
  });

  it('🔴 resumo da gravação: a lista de páginas (urls) sai redigida', () => {
    const resumo: any = { type: 'replay_event', urls: [URL_COM_CODIGO, 'https://rh-demo.vertho.ai/dashboard/gestor/engajamento?cena=engajamento'] };
    expect(redigirEventoDoSentry(resumo).urls).toEqual([
      'https://acme-demo.vertho.ai/c/x',
      'https://rh-demo.vertho.ai/dashboard/gestor/engajamento?cena=engajamento',
    ]);
  });

  it('erro e transação: URL da requisição, referer, breadcrumbs de navegação e spans', () => {
    const evento: any = {
      request: { url: URL_COM_CODIGO, headers: { Referer: `https://rh-demo.vertho.ai/x?volta=${CODIGO}`, Accept: 'text/html' } },
      contexts: { trace: { data: { 'http.url': URL_COM_CODIGO } } },
      breadcrumbs: [{ category: 'navigation', data: { from: `/c/${CODIGO}`, to: '/dashboard' } }],
      spans: [{ description: `GET ${URL_COM_CODIGO}`, data: { url: `${URL_COM_CODIGO}?x=1` } }],
    };
    const limpo = redigirEventoDoSentry(evento);
    expect(limpo.request.url).toBe('https://acme-demo.vertho.ai/c/x');
    expect(limpo.request.headers.Referer).toBe('https://rh-demo.vertho.ai/x?volta=x');
    expect(limpo.request.headers.Accept).toBe('text/html');
    expect(limpo.contexts.trace.data['http.url']).toBe('https://acme-demo.vertho.ai/c/x');
    expect(limpo.breadcrumbs[0].data.from).toBe('/c/x');
    expect(limpo.spans[0].description).toBe('GET https://acme-demo.vertho.ai/c/x');
    expect(limpo.spans[0].data.url).toBe('https://acme-demo.vertho.ai/c/x?x=1');
    expect(JSON.stringify(limpo)).not.toContain(CODIGO);
  });

  it('formas estranhas de evento nunca lançam (a redação não derruba a gravação nem o envio)', () => {
    for (const lixo of [null, undefined, 5, 'texto', [], {}, { urls: 'x' }, { data: null }, { spans: [null, 3] }, { breadcrumbs: [null] }]) {
      expect(() => redigirEventoDeGravacao(lixo)).not.toThrow();
      expect(() => redigirEventoDoSentry(lixo)).not.toThrow();
    }
  });
});

describe('a gravação pausa onde a pessoa escreve', () => {
  it('rotas com conversa não gravam; telas de leitura gravam', () => {
    for (const caminho of ['/dashboard/assessment', '/dashboard/praticar/evidencia', '/dashboard/temporada/semana/2', '/dashboard/temporada/sem14',
      '/dashboard/simulador-vendas', '/dashboard/simulador-lideranca/x', '/dashboard/treino-atendimento']) {
      expect(rotaPermiteGravar(caminho), caminho).toBe(false);
    }
    for (const caminho of ['/c/abc', '/dashboard', '/dashboard/temporada', '/dashboard/gestor', '/dashboard/gestor/engajamento',
      '/dashboard/gestor/equipe-evolucao', '/dashboard/relatorios', '/dashboard/temporada/semanal']) {
      expect(rotaPermiteGravar(caminho), caminho).toBe(true);
    }
    expect(rotaPermiteGravar('/dashboard/assessment?x=1')).toBe(false);
    expect(rotaPermiteGravar(undefined as any)).toBe(true);
  });

  it('🔴 toda página do /dashboard com <textarea> está na lista (rota nova com conversa não escapa)', () => {
    const paginas = execFileSync('git', ['ls-files', 'app/dashboard'], { encoding: 'utf8' })
      .split(/\r?\n/)
      .filter((arquivo) => /\/page\.tsx$/.test(arquivo));
    const comTexto = paginas.filter((arquivo) => /<textarea\b/.test(readFileSync(arquivo, 'utf8')));
    // denominador: hoje são 4 (assessment, praticar/evidencia, temporada/sem14, temporada/semana/[week])
    expect(comTexto.length).toBeGreaterThanOrEqual(4);
    const furos = comTexto
      .map((arquivo) => arquivo.replace(/^app/, '').replace(/\/page\.tsx$/, '').replace(/\[[^\]]+\]/g, 'x'))
      .filter((rota) => rotaPermiteGravar(rota));
    expect(furos).toEqual([]);
  });

  it('o chat do Beto leva a máscara (o eco do que se escreve a ele)', () => {
    const fonte = readFileSync('components/beto-chat.tsx', 'utf8');
    expect(fonte).toMatch(/<div ref=\{scrollRef\} data-sentry-mask /);
  });
});

describe('o interruptor da gravação (desligada em 03/10/2026 para não gastar a cota nos testes do dono)', () => {
  it('existe, é booleano e a decisão está escrita ao lado dele', () => {
    expect(typeof GRAVACAO_LIGADA).toBe('boolean');
    const fonte = readFileSync('lib/demo/degustacao-gravacao.ts', 'utf8');
    expect(fonte).toMatch(/export const GRAVACAO_LIGADA: boolean =/);
    expect(fonte).toMatch(/Para religar: troque para `true`/);
  });

  it('🔴 o componente confere o interruptor ANTES de qualquer coisa do Sentry, então desligado nem o integrador carrega', () => {
    const fonte = semComentarios(readFileSync('app/degustacao/gravacao-da-degustacao.tsx', 'utf8'));
    const efeito = fonte.slice(fonte.indexOf('useEffect(() => {'));
    const chave = efeito.indexOf('if (!GRAVACAO_LIGADA) return;');
    expect(chave).toBeGreaterThan(-1);
    expect(chave).toBeLessThan(efeito.indexOf('if (!codigo) return;'));
    expect(chave).toBeLessThan(efeito.indexOf('Sentry.'));
    expect(chave).toBeLessThan(efeito.indexOf('prepararReplay()'));
  });

  it('🔴 o aviso de que registra telas e cliques e a etiqueta do painel só existem com a gravação ligada (nada afirma o que não acontece)', () => {
    const pagina = semComentarios(readFileSync('app/degustacao/pagina-da-degustacao.tsx', 'utf8'));
    expect(pagina).toMatch(/\{GRAVACAO_LIGADA && \(\s*<p[^>]*>\s*Para melhorar esta experiência, registramos as telas/);
    const painel = semComentarios(readFileSync('app/admin/demo/page.tsx', 'utf8'));
    expect(painel).toMatch(/GRAVACAO_LIGADA && versaoC && experience\.gravacaoEtiqueta/);
  });
});
