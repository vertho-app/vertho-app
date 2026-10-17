import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CATALOGO_V7 } from '@/lib/video/v7/catalogo';
import type { CenaPlano, FraseCena, RespostaPlano } from '@/lib/video/v7/plano';
import {
  cenasDoMiolo, configVideoV7, contextoDoVideo, assinaturaDoPlano, lerJsonDaResposta, gerarVisualV7,
  MAX_TOKENS_PLANO, MAX_TOKENS_AJUSTE, type DepsPlano,
} from '@/lib/video/v7/etapa-plano';

/**
 * A etapa do plano visual v7 no `gerar-video-modulo` (E3, 17/10/2026). Dados sintéticos: o repositório é público.
 * O que se garante aqui: o miolo que o plano recebe é o do protótipo validado, a chave do cliente é desligada por
 * padrão, o ajuste roda e não derruba, a ilustração leva o contexto e o tipo real, o retry não paga de novo, e o
 * adaptador do Trigger nunca derruba o vídeo, etiqueta o custo pelo id do vídeo e não usa outro provedor.
 */

vi.mock('@/actions/ai-client', () => ({ callAI: vi.fn() }));
vi.mock('@/lib/imagem-editorial', () => ({ gerarImagemEditorial: vi.fn() }));
vi.mock('@/lib/ai-tasks', async (orig) => ({ ...(await orig<typeof import('@/lib/ai-tasks')>()), getModelForTask: vi.fn(async () => 'claude-opus-5-5') }));
vi.mock('@/lib/degradacao', async (orig) => ({ ...(await orig<typeof import('@/lib/degradacao')>()), registrarDegradacao: vi.fn(async () => {}) }));

const { callAI } = await import('@/actions/ai-client');
const { gerarImagemEditorial } = await import('@/lib/imagem-editorial');
const { registrarDegradacao, DEGRADACAO } = await import('@/lib/degradacao');
const { planoVisualV7 } = await import('@/lib/video/v7/no-trigger');

/** Uma cena com `n` frases de 3 s (pausa de 0,5 s). */
function cena(id: string, n: number): CenaPlano {
  const frases: FraseCena[] = Array.from({ length: n }, (_, i) => ({ i, de: i * 3.5, ate: i * 3.5 + 3, texto: 'frase ' + i }));
  return { id, dur: n * 3.5 + 0.5, frases };
}
const m = (tpl: string, a: number, b: number, data: Record<string, unknown> = { t: '@' + a }, fundo = 'navy') => ({ frases: [a, b] as [number, number], tpl, fundo, nome: tpl, data });

describe('cenasDoMiolo: o que o plano recebe é o do protótipo', () => {
  const roteiro = { scenes: [
    { id: 'scene-1', type: 'avatar_intro', narration: 'oi' },
    { id: 'scene-2', type: 'scenario_card', title: 'Um título', narration: 'texto falado', icons: ['x'], key_idea: 'k', source_anchor: 's', estimated_words: 9, subtitle_note: 'n' },
    { id: 'scene-3', type: 'avatar_outro', narration: 'tchau' },
  ] };
  const props = {
    fps: 30,
    scenes: [
      { id: 'scene-1', type: 'avatar_intro', fromFrame: 0, durationInFrames: 300 },
      { id: 'scene-2', type: 'scenario_card', fromFrame: 300, durationInFrames: 255 },
      { id: 'scene-3', type: 'avatar_outro', fromFrame: 555, durationInFrames: 200 },
    ],
    captions: [
      { sceneId: 'scene-1', startFrame: 10, endFrame: 200, text: 'oi' },
      { sceneId: 'scene-2', startFrame: 306, endFrame: 390, text: 'primeira frase' },
      { sceneId: 'scene-2', startFrame: 405, endFrame: 540, text: 'segunda frase' },
    ],
  };

  it('só as cenas que não são do avatar, com duração real, frases em segundos da cena e a tela sem o que é fala', () => {
    const c = cenasDoMiolo(roteiro, props);
    expect(c).toHaveLength(1);
    expect(c[0]).toEqual({
      id: 'scene-2', tipo: 'scenario_card', dur: 8.5, tela: { type: 'scenario_card', title: 'Um título' },
      frases: [{ i: 0, de: 0.2, ate: 3, texto: 'primeira frase' }, { i: 1, de: 3.5, ate: 8, texto: 'segunda frase' }],
    });
  });
});

describe('a chave do cliente e o contexto', () => {
  it('desligada por padrão; `true` liga; o objeto liga com `ligado: true` e traz a descrição do lugar', () => {
    expect(configVideoV7(undefined)).toEqual({ ligado: false, contexto: null });
    expect(configVideoV7({ outra: 1 })).toEqual({ ligado: false, contexto: null });
    expect(configVideoV7({ video_biblioteca_v7: true })).toEqual({ ligado: true, contexto: null });
    expect(configVideoV7({ video_biblioteca_v7: { ligado: false, contexto: 'x' } })).toEqual({ ligado: false, contexto: 'x' });
    expect(configVideoV7({ video_biblioteca_v7: { ligado: true, contexto: '  Loja com balcão.  ' } })).toEqual({ ligado: true, contexto: 'Loja com balcão.' });
    expect(configVideoV7({ video_biblioteca_v7: { ligado: true, contexto: 'a'.repeat(900) } }).contexto).toHaveLength(800);
  });

  it('a descrição do cliente vem primeiro e ganha o cargo do vídeo; sem ela, nome, segmento e cargo', () => {
    expect(contextoDoVideo({ configurado: 'Loja de bairro: balcão e estoque', empresaNome: 'X', segmento: 'varejo', cargo: 'Caixa' }))
      .toBe('Loja de bairro: balcão e estoque. Cargo: Caixa.');
    expect(contextoDoVideo({ configurado: 'Escola pública. Cargo: Professor(a).', empresaNome: null, segmento: null, cargo: 'Diretor' }))
      .toBe('Escola pública. Cargo: Professor(a).');
    expect(contextoDoVideo({ configurado: null, empresaNome: 'Empresa Exemplo', segmento: 'corporativo', cargo: 'Líder de turno' }))
      .toBe('Empresa Exemplo (segmento: corporativo). Cargo: Líder de turno.');
    expect(contextoDoVideo({ configurado: null, empresaNome: null, segmento: null, cargo: null })).toBeNull();
  });
});

describe('lerJsonDaResposta e a assinatura', () => {
  it('lê o JSON com cerca de código e texto em volta', () => {
    expect(lerJsonDaResposta('Aqui está:\n```json\n{ "a": 1 }\n```\nPronto.')).toEqual({ a: 1 });
  });

  it('a assinatura muda com as frases e com o contexto (o plano reaproveitado é sempre o do mesmo pedido)', () => {
    const a = assinaturaDoPlano('pedido A');
    expect(assinaturaDoPlano('pedido A')).toBe(a);
    expect(assinaturaDoPlano('pedido B')).not.toBe(a);
  });
});

describe('gerarVisualV7: plano, ajuste, montagem e ilustrações', () => {
  const cenas = [cena('scene-2', 4), cena('scene-3', 4)];
  const plano: RespostaPlano = { cenas: [
    { id: 'scene-2', momentos: [m('balanca', 0, 1), m('imagem', 2, 3, { lado: 'cheia', imagem: { descricao: 'a quiet workplace' } })] },
    { id: 'scene-3', momentos: [m('frase', 0, 1, { t: '@0', texto: 'Uma frase' }), m('balanca', 2, 3)] },
  ] };
  const ajuste = { ajustes: [{ cena: 'scene-3', k: 1, momentos: [m('escada', 2, 3)] }] };

  function deps(respostas: Array<string | Error>, mime = 'image/png'): DepsPlano & { chamadas: Array<{ system: string; user: string; maxTokens: number }>; prompts: string[]; guardados: string[] } {
    const chamadas: Array<{ system: string; user: string; maxTokens: number }> = [];
    const prompts: string[] = [];
    const guardados: string[] = [];
    return {
      chamadas, prompts, guardados,
      chamarIA: async (system, user, maxTokens) => {
        chamadas.push({ system, user, maxTokens });
        const r = respostas.shift();
        if (r instanceof Error) throw r;
        return r ?? '';
      },
      gerarImagem: async (prompt) => { prompts.push(prompt); return { buffer: Buffer.from('x'), mimeType: mime, modelo: 'gpt-image-2.5-flare', provedor: 'openai' }; },
      guardarImagem: async (arquivo) => { guardados.push(arquivo); return 'https://cdn.exemplo/' + arquivo; },
      agora: () => new Date('2026-10-17T12:00:00Z'),
    };
  }

  it('o modelo repetido volta ao Opus com o pedido de ajuste e sai trocado; a ilustração leva o contexto', async () => {
    const d = deps(['Plano:\n```json\n' + JSON.stringify(plano) + '\n```', JSON.stringify(ajuste)]);
    const { visual, reaproveitado } = await gerarVisualV7({ cenas, contexto: 'Loja de bairro: balcão e estoque. Cargo: Caixa.' }, d);
    expect(reaproveitado).toBe(false);
    expect(d.chamadas.map((c) => [c.system === CATALOGO_V7, c.maxTokens])).toEqual([[true, MAX_TOKENS_PLANO], [true, MAX_TOKENS_AJUSTE]]);
    expect(d.chamadas[0].user).toMatch(/^CONTEXT of the video \(company, workplace, role\): Loja de bairro/);
    expect(d.chamadas[1].user).toMatch(/must be rewritten/);
    expect(visual.problemasRestantes).toBe(0);
    expect(visual.ajustes).toHaveLength(1);
    expect(visual.momentos.map((x) => x.tpl)).toEqual(['balanca', 'imagem', 'frase', 'escada']);
    expect(d.prompts).toHaveLength(1);
    expect(d.prompts[0]).toContain('Loja de bairro');
    expect(visual.imagens).toEqual([{ momento: 's2-2-imagem', nome: 's2-2-imagem.png', url: 'https://cdn.exemplo/s2-2-imagem.png', mimeType: 'image/png', modelo: 'gpt-image-2.5-flare', provedor: 'openai' }]);
    expect(visual.momentos[1].data.arquivo).toBe('s2-2-imagem.png');
    expect(visual).toMatchObject({ versao: 'v7d', cenas: ['scene-2', 'scene-3'], criadoEm: '2026-10-17T12:00:00.000Z' });
  });

  it('a ilustração em JPEG (o Gemini de reserva) é gravada como .jpg; o nome no momento continua o mesmo', async () => {
    const d = deps([JSON.stringify(plano), JSON.stringify(ajuste)], 'image/jpeg');
    const { visual } = await gerarVisualV7({ cenas, contexto: null }, d);
    expect(d.guardados).toEqual(['s2-2-imagem.jpg']);
    expect(visual.imagens[0]).toMatchObject({ nome: 's2-2-imagem.png', mimeType: 'image/jpeg' });
  });

  it('o retry com as mesmas frases reaproveita o plano já pago (nenhuma chamada)', async () => {
    const primeiro = await gerarVisualV7({ cenas, contexto: null }, deps([JSON.stringify(plano), JSON.stringify(ajuste)]));
    const d = deps([]);
    const r = await gerarVisualV7({ cenas, contexto: null, anterior: primeiro.visual }, d);
    expect(r.reaproveitado).toBe(true);
    expect(d.chamadas).toHaveLength(0);
    const outro = deps([JSON.stringify(plano), JSON.stringify(ajuste)]);
    await gerarVisualV7({ cenas, contexto: 'Outro lugar.', anterior: primeiro.visual }, outro);
    expect(outro.chamadas).toHaveLength(2);
  });

  it('o ajuste que falha não derruba: o plano segue com o aviso e o problema contado', async () => {
    const d = deps([JSON.stringify(plano), new Error('529 overloaded')]);
    const { visual } = await gerarVisualV7({ cenas, contexto: null }, d);
    expect(visual.problemasRestantes).toBe(1);
    expect(visual.avisos.join(' ')).toMatch(/ajuste do plano falhou .*529/);
  });

  it('plano ilegível ou sem cenas, e ilustração que falha, lançam (quem chama degrada para o vídeo de hoje)', async () => {
    await expect(gerarVisualV7({ cenas, contexto: null }, deps(['não sei']))).rejects.toThrow();
    await expect(gerarVisualV7({ cenas, contexto: null }, deps(['{ "cenas": [] }']))).rejects.toThrow(/sem cenas/);
    const d = deps([JSON.stringify(plano), JSON.stringify(ajuste)]);
    d.gerarImagem = async () => { throw new Error('principal: 403 | fallback: 500'); };
    await expect(gerarVisualV7({ cenas, contexto: null }, d)).rejects.toThrow(/fallback/);
    await expect(gerarVisualV7({ cenas: [], contexto: null }, deps([]))).rejects.toThrow(/miolo/);
  });
});

describe('planoVisualV7 no Trigger: chave, etiquetas de custo e nunca derrubar o vídeo', () => {
  const VIDEO = '0b6d8a52-3c1e-4f7a-9b2d-5e8c1a4f6d30';
  const roteiro = { scenes: [{ id: 'scene-1', type: 'avatar_intro' }, { id: 'scene-2', type: 'steps_flow', title: 'T' }, { id: 'scene-3', type: 'avatar_outro' }] };
  const props = {
    fps: 30,
    scenes: [
      { id: 'scene-1', type: 'avatar_intro', fromFrame: 0, durationInFrames: 150 },
      { id: 'scene-2', type: 'steps_flow', fromFrame: 150, durationInFrames: 435 },
      { id: 'scene-3', type: 'avatar_outro', fromFrame: 585, durationInFrames: 150 },
    ],
    captions: [0, 1, 2, 3].map((i) => ({ sceneId: 'scene-2', startFrame: 150 + i * 105, endFrame: 150 + i * 105 + 90, text: 'frase ' + i })),
  };
  const plano = { cenas: [{ id: 'scene-2', momentos: [m('balanca', 0, 1), m('imagem', 2, 3, { lado: 'cheia', imagem: { descricao: 'a quiet workplace' } })] }] };

  let patches: Array<{ url: string; body: any }>;
  let sysConfig: unknown;
  let statusPatch: number;
  beforeEach(() => {
    patches = [];
    sysConfig = { video_biblioteca_v7: { ligado: true, contexto: 'Loja de bairro: balcão e estoque' } };
    statusPatch = 204;
    vi.mocked(callAI).mockReset().mockResolvedValue(JSON.stringify(plano));
    vi.mocked(gerarImagemEditorial).mockReset().mockResolvedValue({ buffer: Buffer.from('x'), mimeType: 'image/png', provedor: 'openai', modelo: 'gpt-image-2.5-flare', falhaPrincipal: null });
    vi.mocked(registrarDegradacao).mockClear();
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: any) => {
      const u = String(url);
      const json = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status });
      if (init?.method === 'PATCH') { patches.push({ url: u, body: JSON.parse(init.body) }); return new Response(statusPatch === 204 ? null : '{"code":"PGRST204"}', { status: statusPatch }); }
      if (u.includes('/storage/v1/object/')) return json({ Key: 'ok' });
      if (u.includes('/rest/v1/empresas?')) return json([{ nome: 'Empresa Exemplo', segmento: 'varejo', sys_config: sysConfig }]);
      if (u.includes('select=cargo,modulo_base_id')) return json([{ cargo: 'Caixa', modulo_base_id: 'mod-1' }]);
      if (u.includes('/rest/v1/modulos_base_conteudo?')) return json([{ locale: 'es-ES' }]);
      if (u.includes('select=visual_v7')) return json([{ visual_v7: null }]);
      return json({ erro: 'rota inesperada ' + u }, 500);
    }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('sem a chave do cliente (ou sem empresa) não chama IA nem grava nada', async () => {
    sysConfig = { ai: { modelo_padrao: 'claude-sonnet-4-6' } };
    expect(await planoVisualV7({ videoId: VIDEO, empresaId: 'emp-1', roteiro, props })).toBe('desligado');
    expect(await planoVisualV7({ videoId: VIDEO, empresaId: null, roteiro, props })).toBe('desligado');
    expect(callAI).not.toHaveBeenCalled();
    expect(patches).toHaveLength(0);
  });

  it('com a chave: o Opus em `low` no idioma do módulo, sem trocar de provedor, e o custo etiquetado pelo id do vídeo', async () => {
    expect(await planoVisualV7({ videoId: VIDEO, empresaId: 'emp-1', roteiro, props })).toBe('feito');
    const [system, user, cfg, maxTokens, opts] = vi.mocked(callAI).mock.calls[0];
    expect(system).toBe(CATALOGO_V7);
    expect(user).toMatch(/^CONTEXT of the video \(company, workplace, role\): Loja de bairro: balcão e estoque\. Cargo: Caixa\./);
    expect(cfg).toEqual({ model: 'claude-opus-5-5' });
    expect(maxTokens).toBe(MAX_TOKENS_PLANO);
    expect(opts).toMatchObject({ taskKey: 'video_plano_visual', empresaId: 'emp-1', locale: 'es-ES', reasoningEffort: 'low', correlationId: VIDEO, semRetentativa: true });
    expect(vi.mocked(gerarImagemEditorial).mock.calls[0][2]).toEqual({ ledger: { feature: 'video_ilustracao', empresaId: 'emp-1', correlationId: VIDEO } });
    expect(patches).toHaveLength(1);
    expect(patches[0].url).toContain(`videos_gerados?id=eq.${VIDEO}`);
    expect(Object.keys(patches[0].body)).toEqual(['visual_v7']);
    expect(patches[0].body.visual_v7.momentos.map((x: { tpl: string }) => x.tpl)).toEqual(['balanca', 'imagem']);
  });

  it('falha do Opus vira degradação na fase `plano` e NÃO lança', async () => {
    vi.mocked(callAI).mockRejectedValue(new Error('529 overloaded'));
    expect(await planoVisualV7({ videoId: VIDEO, empresaId: 'emp-1', roteiro, props })).toBe('falhou');
    expect(registrarDegradacao).toHaveBeenCalledWith(expect.objectContaining({
      fluxo: 'video', tipo: DEGRADACAO.VIDEO_PLANO_V7_FALHOU, chave: `${VIDEO}:plano`, empresaId: 'emp-1', severidade: 'aviso',
    }));
    expect(patches).toHaveLength(0);
  });

  it('sem a coluna `visual_v7` (migration 290 não aplicada) cai na fase `gravacao`, sem lançar', async () => {
    statusPatch = 400;
    expect(await planoVisualV7({ videoId: VIDEO, empresaId: 'emp-1', roteiro, props })).toBe('falhou');
    expect(vi.mocked(registrarDegradacao).mock.calls[0][0]).toMatchObject({ chave: `${VIDEO}:gravacao` });
  });
});
