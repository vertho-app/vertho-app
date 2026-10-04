import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createTranslator } from 'next-intl';
import { resolverFormatoAtivo, iframeMostrouErroDoApp } from '@/lib/season-engine/formato-ativo';
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

describe('iframeMostrouErroDoApp: a página de erro do app dentro do quadro do PDF', () => {
  it('🔴 o JSON de erro da rota (mesma origem) é detectado, pelo tipo ou pelo texto', () => {
    expect(iframeMostrouErroDoApp({ contentDocument: { contentType: 'application/json', body: { textContent: '' } } })).toBe(true);
    expect(iframeMostrouErroDoApp({ contentDocument: { contentType: 'text/html', body: { textContent: ' {"error":"conteúdo indisponível"} ' } } })).toBe(true);
  });

  it('o PDF de verdade (outra origem) lança SecurityError ao ler o documento: carregou bem', () => {
    const iframe = { get contentDocument() { throw new DOMException('Blocked a frame', 'SecurityError'); } };
    expect(iframeMostrouErroDoApp(iframe as any)).toBe(false);
  });

  it('documento ilegível (null) ou PDF same-origin não é erro', () => {
    expect(iframeMostrouErroDoApp({ contentDocument: null })).toBe(false);
    expect(iframeMostrouErroDoApp(null)).toBe(false);
    expect(iframeMostrouErroDoApp({ contentDocument: { contentType: 'application/pdf', body: { textContent: '' } } })).toBe(false);
  });

  it('texto que só COMEÇA parecido não é erro (um HTML com "error" no meio)', () => {
    expect(iframeMostrouErroDoApp({ contentDocument: { contentType: 'text/html', body: { textContent: 'Relatório de error handling' } } })).toBe(false);
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
    expect(fonte).toContain('iframeMostrouErroDoApp(e.currentTarget)');
    expect(fonte).toContain('<PlayerPodcast');
    expect(fonte).toContain('<FormatoIndisponivel');
    expect(fonte).toContain('vid?.preso');
    expect(fonte).not.toContain('Estamos preparando seu vídeo personalizado');
    expect(fonte).toContain("t('formats.videoPreparing')");
  });
});
