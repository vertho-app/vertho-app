import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createTranslator } from 'next-intl';
import { resolverFormatoAtivo } from '@/lib/season-engine/formato-ativo';
import InAppPdfDocument from '@/components/pdf/in-app-pdf-document';
import { videoPreso, PRAZO_VIDEO_EM_PROCESSAMENTO_MS, STATUS_VIDEO_EM_PROCESSAMENTO } from '@/lib/video/prazo-processamento';
import FormatoIndisponivel from '@/components/temporada/formato-indisponivel';
import PlayerPodcast from '@/components/temporada/player-podcast';
import { criarSupabaseMock } from '../helpers/supabase-mock';

vi.mock('@/lib/video/gerar-roteiro', () => ({ gerarRoteiroDeModulo: vi.fn() }));
vi.mock('@trigger.dev/sdk', () => ({ tasks: { trigger: vi.fn() } }));
vi.mock('@/lib/trigger-region', () => ({ regionOpts: () => ({}) }));
vi.mock('@/lib/admin-supabase', () => ({ requireAdminSupabase: vi.fn() }));
vi.mock('@/lib/auth/action-context', () => ({ requireAdminAction: vi.fn(), requireUserAction: vi.fn(), getAuthenticatedEmailFromAction: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: vi.fn() }));
vi.mock('@/lib/authz', () => ({ canViewColabJourney: vi.fn(), findColabByEmail: vi.fn() }));
vi.mock('@/lib/tenant-db', () => ({ tenantDb: vi.fn() }));
vi.mock('@/lib/season-engine/modulo-base-integration', () => ({ resolverModuloBaseParaConteudo: vi.fn() }));
vi.mock('@/lib/cargo-contexto', () => ({ carregarCargoInfo: vi.fn(async () => null), formatBlocoCargo: () => '' }));

import { resolverCelulaVideo } from '@/actions/gerar-video';

/**
 * R-93 (04/10/2026): os formatos da semana que falham, ditos.
 *
 *  1. PDF sem arquivo: a rota responde JSON na mesma origem e o quadro o desenhava cru.
 *     (Desde 23/10/2026 não há mais quadro: o leitor do app busca o PDF e trata o erro.)
 *  2. Podcast sem cópia pronta é gerado na hora (p50 de 99 s) com o player mudo; sem
 *     áudio-base a rota dá 404 e o player seguia mudo.
 *  3. Link com formato que a semana não tem: `?formato=audio` abria o player com o id do
 *     núcleo (de outro formato) e a rota respondia 400 "Conteúdo não é podcast".
 *  4. Vídeo preso em processamento dizia "volte em alguns minutos" para sempre.
 */

describe('resolverFormatoAtivo: o formato aberto é sempre um dos que existem', () => {
  const f = (pedido: string | null, formatos: string[], formatoCore: string | null = 'texto', videoResolvendo = false) =>
    resolverFormatoAtivo({ pedido, formatoCore, formatos, videoResolvendo });

  it('pedido que existe: abre o pedido, sem aviso', () => {
    expect(f('audio', ['texto', 'audio'])).toEqual({ ativo: 'audio', pedidoIndisponivel: null });
  });

  it('🔴 `?formato=audio` numa semana SEM áudio cai no núcleo e AVISA (era o 400 "não é podcast")', () => {
    expect(f('audio', ['texto', 'case'])).toEqual({ ativo: 'texto', pedidoIndisponivel: 'audio' });
  });

  it('🔴 vale para texto e caso também (o PDF de um áudio não abre)', () => {
    expect(f('case', ['audio', 'texto'], 'audio')).toEqual({ ativo: 'audio', pedidoIndisponivel: 'case' });
    expect(f('texto', ['audio'], 'audio')).toEqual({ ativo: 'audio', pedidoIndisponivel: 'texto' });
  });

  it('núcleo que também não existe: o primeiro disponível', () => {
    expect(f('video', ['case', 'texto'], 'video')).toEqual({ ativo: 'case', pedidoIndisponivel: 'video' });
  });

  it('semana sem formato nenhum: nada a abrir, e o pedido é dado por indisponível', () => {
    expect(f('audio', [], null)).toEqual({ ativo: null, pedidoIndisponivel: 'audio' });
  });

  it('vídeo pedido enquanto ele ainda está sendo RESOLVIDO não é dado por indisponível (o aviso piscaria)', () => {
    expect(f('video', ['texto'], 'texto', true)).toEqual({ ativo: 'texto', pedidoIndisponivel: null });
    expect(f('video', ['texto'], 'texto', false)).toEqual({ ativo: 'texto', pedidoIndisponivel: 'video' });
    // Só o vídeo espera: um áudio inexistente já se sabe que não existe.
    expect(f('audio', ['texto'], 'texto', true).pedidoIndisponivel).toBe('audio');
  });

  it('sem pedido: o núcleo, ou o primeiro disponível', () => {
    expect(f(null, ['audio', 'texto'], 'texto')).toEqual({ ativo: 'texto', pedidoIndisponivel: null });
    expect(f(null, ['audio'], 'texto')).toEqual({ ativo: 'audio', pedidoIndisponivel: null });
  });
});

/**
 * 🔴 23/10/2026: o case abria num quadro (iframe) e, no iPhone, o Safari desenha só a 1ª página de um PDF
 * dentro de um quadro, sem rolar. A pessoa via a capa e mais nada, com o arquivo inteiro (7 páginas)
 * no Storage. Texto e case passaram para o leitor do app, que desenha todas as páginas em canvas.
 */
describe('leitor de PDF da semana: todas as páginas, em qualquer aparelho', () => {
  const leitor = readFileSync('components/pdf/in-app-pdf-document.tsx', 'utf-8');
  const semana = readFileSync('app/dashboard/temporada/semana/[week]/page.tsx', 'utf-8');
  const conteudo = readFileSync('app/dashboard/conteudo/[id]/content-experience.tsx', 'utf-8');

  it('🔴 nenhuma das duas telas de conteúdo desenha PDF num quadro', () => {
    for (const fonte of [semana, conteudo]) {
      expect(fonte).toContain('<InAppPdfDocument');
      expect(fonte).not.toContain('/pdf#view=FitH');
    }
    // O único <iframe> que sobra na semana é o do player de vídeo (Bunny).
    expect(semana.match(/<iframe\b/g)).toHaveLength(1);
    expect(semana).toContain('<iframe key={`video-${mediaSession}`}');
    expect(conteudo).not.toMatch(/<iframe\b/);
  });

  it('🔴 a rota que responde erro em vez do PDF (R-93) vira falha do leitor, e a semana oferece os outros formatos', () => {
    expect(leitor).toContain('if (!response.ok) throw');
    expect(leitor).toContain('onErrorRef.current?.()');
    expect(semana).toContain('onError={() => setPdfFalhou(chavePdf)}');
    expect(semana).toContain('<FormatoIndisponivel');
  });

  it('🔴 o leitor carrega o pdf.js `legacy` (com polyfills): o padrão chama recursos que celular antigo não tem', () => {
    expect(leitor).toContain("import('pdfjs-dist/legacy/build/pdf.mjs')");
    expect(leitor).toContain("'pdfjs-dist/legacy/build/pdf.worker.min.mjs'");
    expect(leitor).not.toMatch(/import\('pdfjs-dist'\)/);
    expect(leitor).not.toContain("'pdfjs-dist/build/pdf.worker.min.mjs'");
    // Alvo vivo: o build padrão segue sem polyfill (se um dia ganhar, a troca deixa de ser necessária).
    const padrao = readFileSync('node_modules/pdfjs-dist/build/pdf.mjs', 'utf-8');
    const legado = readFileSync('node_modules/pdfjs-dist/legacy/build/pdf.mjs', 'utf-8');
    expect(padrao).toContain('.getOrInsertComputed(');
    expect(padrao).not.toContain('core-js/modules/es.map.get-or-insert-computed');
    expect(legado).toContain('core-js/modules/es.map.get-or-insert-computed');
  });

  it('a rolagem é da caixa da semana, não do documento (sem ela o leitor também só mostraria a capa)', () => {
    expect(semana).toMatch(/max-h-\[760px\] overflow-y-auto[^"]*">\s*<InAppPdfDocument/);
  });

  it('conteúdo da trilha não conta como "relatório" na telemetria da degustação', () => {
    expect(semana).toMatch(/<InAppPdfDocument[\s\S]*?exploracao=\{null\}/);
    expect(conteudo).toMatch(/<InAppPdfDocument[\s\S]*?exploracao=\{null\}/);
    // Quem já usava o leitor (gestor, RH, adequação) segue contando como antes.
    expect(leitor).toContain("exploracao = 'relatorio'");
  });

  it('com quem cuida da falha, o leitor não desenha a tela de erro dele; antes da rede responder, carrega', () => {
    expect(leitor).toContain('if (onError) return null;');
    const html = renderToStaticMarkup(createElement(InAppPdfDocument, {
      src: '/api/conteudo/a1/pdf', title: 'case: x', loadingLabel: 'Abrindo o material', errorLabel: 'e', retryLabel: 'r',
      onError: () => {}, exploracao: null,
    }));
    expect(html).toContain('role="status"');
    expect(html).toContain('Abrindo o material');
  });
});

describe('videoPreso: o prazo é o do health', () => {
  const AGORA = Date.parse('2026-10-04T12:00:00Z');
  const ha = (ms: number) => new Date(AGORA - ms).toISOString();

  it('🔴 em processamento além do prazo, sem progresso: preso', () => {
    for (const status of STATUS_VIDEO_EM_PROCESSAMENTO) {
      expect(videoPreso(status, ha(PRAZO_VIDEO_EM_PROCESSAMENTO_MS + 60_000), AGORA), status).toBe(true);
    }
  });

  it('dentro do prazo (a idade é a do último progresso), nunca preso', () => {
    expect(videoPreso('processing', ha(PRAZO_VIDEO_EM_PROCESSAMENTO_MS - 60_000), AGORA)).toBe(false);
    expect(videoPreso('rendering', ha(0), AGORA)).toBe(false);
  });

  it('pronto, com erro ou sem data lida: não se afirma que está preso', () => {
    expect(videoPreso('done', ha(10 * PRAZO_VIDEO_EM_PROCESSAMENTO_MS), AGORA)).toBe(false);
    expect(videoPreso('error', ha(10 * PRAZO_VIDEO_EM_PROCESSAMENTO_MS), AGORA)).toBe(false);
    expect(videoPreso('processing', null, AGORA)).toBe(false);
    expect(videoPreso('processing', 'não é data', AGORA)).toBe(false);
  });

  it('o health estrutural usa a MESMA constante (uma régua só entre o painel e a tela)', () => {
    const core = readFileSync('lib/pipeline-health/core.ts', 'utf-8');
    expect(core).toContain('PRAZO_VIDEO_EM_PROCESSAMENTO_MS');
    expect(core).toContain('STATUS_VIDEO_EM_PROCESSAMENTO');
    expect(core).toMatch(/const doisH = new Date\(Date\.now\(\) - PRAZO_VIDEO_EM_PROCESSAMENTO_MS\)/);
  });
});

describe('resolverCelulaVideo devolve `preso`', () => {
  const celula = (status: string, updatedAt: string | null) => criarSupabaseMock({
    resolver: (t) => (t === 'videos_gerados'
      ? { id: 'v1', status, etapa: 'render', video_url: null, bunny_video_id: null, bunny_library: null, error: null, updated_at: updatedAt }
      : null),
  });
  const ancient = '2020-01-01T00:00:00Z';

  it('🔴 vídeo em processamento sem progresso há muito tempo: `preso: true` (a tela deixa de prometer)', async () => {
    const r: any = await resolverCelulaVideo('mb1', 'e1', 'Professora', 'S', null, { sb: celula('rendering', ancient).client, gerar: false });
    expect(r).toMatchObject({ reused: true, status: 'rendering', preso: true });
  });

  it('vídeo em processamento com progresso recente: não está preso', async () => {
    const r: any = await resolverCelulaVideo('mb1', 'e1', 'Professora', 'S', null, { sb: celula('processing', new Date().toISOString()).client, gerar: false });
    expect(r.preso).toBe(false);
  });

  it('vídeo pronto nunca é preso, por mais velho que seja', async () => {
    const r: any = await resolverCelulaVideo('mb1', 'e1', 'Professora', 'S', null, { sb: celula('done', ancient).client, gerar: false });
    expect(r.preso).toBe(false);
  });

  it('🔴 leitura que falhou volta como erro: com `gerar` ligado NÃO cria outro vídeo, e desligado não diz "não gerado"', async () => {
    for (const gerar of [true, false]) {
      const sb = celula('done', ancient);
      sb.falharEm({ tabela: 'videos_gerados', op: 'select', mensagem: 'timeout no pool' });
      const r: any = await resolverCelulaVideo('mb1', 'e1', 'Professora', 'S', null, { sb: sb.client, gerar });
      expect(r.error, `gerar=${gerar}`).toContain('timeout no pool');
      expect(sb.escritas.filter((e) => e.tabela === 'videos_gerados'), `gerar=${gerar}`).toHaveLength(0);
    }
  });

  it('a consulta pede `updated_at` (sem ele o prazo nunca poderia valer)', async () => {
    const sb = celula('processing', ancient);
    await resolverCelulaVideo('mb1', 'e1', 'Professora', 'S', null, { sb: sb.client, gerar: false });
    const select = sb.chamadas.find((c) => c.tabela === 'videos_gerados' && c.metodo === 'select');
    expect(String(select?.args[0])).toContain('updated_at');
  });
});

describe('os textos e os componentes', () => {
  const LOCALES = ['pt-BR', 'pt-PT', 'es-ES', 'en-US'];
  const mensagens = (loc: string) => JSON.parse(readFileSync(`messages/${loc}.json`, 'utf-8'));
  const tr = (loc: string) => createTranslator({ locale: loc, messages: mensagens(loc), namespace: 'SeasonWeek' }) as any;

  it('🔴 todas as chaves de `formats.*` existem nos 4 locales, sem travessão', () => {
    const chaves = ['pdfFailed', 'audioFailed', 'audioGenerating', 'requestedUnavailable', 'videoLate', 'videoPreparing', 'retry', 'tryOther'];
    for (const loc of LOCALES) {
      const formats = mensagens(loc).SeasonWeek.formats;
      for (const c of chaves) {
        expect(typeof formats[c], `${loc} formats.${c}`).toBe('string');
        expect(formats[c], `${loc} formats.${c}`).not.toMatch(/[\u2013\u2014]/);
      }
      for (const n of ['video', 'audio', 'texto', 'case']) expect(typeof formats.names[n], `${loc} names.${n}`).toBe('string');
    }
  });

  it('o aviso do pedido indisponível leva os dois nomes, no idioma da pessoa', () => {
    expect(tr('pt-BR')('formats.requestedUnavailable', { requested: 'podcast', opened: 'texto' })).toBe('O formato podcast não está disponível nesta semana. Abrimos o formato texto.');
    expect(tr('en-US')('formats.requestedUnavailable', { requested: 'podcast', opened: 'text' })).toContain('podcast');
  });

  it('🔴 FormatoIndisponivel: a mensagem, "tentar de novo" e os OUTROS formatos como saída', () => {
    const html = renderToStaticMarkup(createElement(FormatoIndisponivel, {
      mensagem: 'Não conseguimos abrir este material agora.',
      alternativas: [{ formato: 'audio', rotulo: 'podcast', onAbrir: () => {} }, { formato: 'case', rotulo: 'estudo de caso', onAbrir: () => {} }],
      onTentarDeNovo: () => {},
      t: tr('pt-BR'),
    }));
    expect(html).toContain('role="alert"');
    expect(html).toContain('Não conseguimos abrir este material agora.');
    expect(html).toContain('Tentar de novo');
    expect(html).toContain('Abrir em outro formato:');
    expect(html).toContain('podcast');
    expect(html).toContain('estudo de caso');
  });

  it('FormatoIndisponivel sem alternativa nem repetição só diz o que houve', () => {
    const html = renderToStaticMarkup(createElement(FormatoIndisponivel, { mensagem: 'x', alternativas: [], t: tr('pt-BR') }));
    expect(html).not.toContain('<button');
  });

  it('PlayerPodcast começa como um player normal, sem aviso antes de a rede responder', () => {
    const html = renderToStaticMarkup(createElement(PlayerPodcast, { src: '/api/conteudo/a1/podcast', alternativas: [], t: tr('pt-BR') }));
    expect(html).toContain('<audio');
    expect(html).toContain('src="/api/conteudo/a1/podcast"');
    expect(html).not.toContain('role="status"');
  });
});

describe('o visualizador da semana usa o que foi decidido aqui', () => {
  const fonte = readFileSync('app/dashboard/temporada/semana/[week]/page.tsx', 'utf-8');

  it('🔴 o formato aberto passa por `resolverFormatoAtivo` e o id do núcleo só vale para o formato do núcleo', () => {
    expect(fonte).toContain('resolverFormatoAtivo({');
    expect(fonte).not.toMatch(/let ativo = formatoAtivo \|\| conteudo\.formato_core/);
    expect(fonte).toContain('(ativo === conteudo.formato_core ? conteudo.core_id : null)');
    expect(fonte).not.toMatch(/\(item as any\)\?\.id \|\| conteudo\.core_id;/);
  });

  it('o PDF, o podcast e o vídeo preso têm saída; a copy do vídeo saiu do código', () => {
    expect(fonte).toContain('onError={() => setPdfFalhou(chavePdf)}');
    expect(fonte).toContain('<PlayerPodcast');
    expect(fonte).toContain('<FormatoIndisponivel');
    expect(fonte).toContain('vid?.preso');
    expect(fonte).not.toContain('Estamos preparando seu vídeo personalizado');
    expect(fonte).toContain("t('formats.videoPreparing')");
  });
});
