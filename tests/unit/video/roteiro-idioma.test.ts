import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Onda F (04/10/2026): o roteiro de vídeo (`gerarRoteiroDeModulo`) e os textos falados do avatar
 * (`gerarTextosAvatarGrupo`) vão para voz, e a voz é pt-BR. O idioma é EXPLÍCITO nos quatro caminhos do roteiro
 * (coletor de lote, o síncrono do fallback `batch-sync`, o lote avulso e o síncrono por escolha): o do módulo-base
 * (o mesmo que `buildRoteiroPrompt` já escreve no texto do prompt), senão pt-BR. Sem isto o `callAI` síncrono lia o
 * cookie de quem clicou em "gerar vídeo", e o prompt dizia uma coisa enquanto a instrução de idioma dizia outra.
 */

const callAI = vi.fn();
vi.mock('@/actions/ai-client', () => ({ callAI: (...a: any[]) => callAI(...a) }));
const submitClaudeBatch = vi.fn();
vi.mock('@/lib/ai-batch', () => ({ submitClaudeBatch: (...a: any[]) => submitClaudeBatch(...a) }));
vi.mock('@/lib/ai-tasks', () => ({ getModelForTask: vi.fn(async () => 'claude-opus-5') }));
vi.mock('@/lib/video/roteiro-prompt', () => ({
  buildRoteiroPrompt: () => ({ system: 'SYS', user: 'USER' }),
  parseRoteiro: (raw: string) => (raw === 'ROTEIRO' ? { title: 'T', scenes: [] } : null),
  normalizarRoteiro: (r: any) => r,
}));
vi.mock('@/lib/degradacao', async (orig) => ({ ...(await orig<any>()), registrarDegradacao: vi.fn(async () => {}) }));
vi.mock('@trigger.dev/sdk', () => ({ tasks: { trigger: vi.fn() } }));
vi.mock('@/lib/trigger-region', () => ({ regionOpts: () => ({}) }));
vi.mock('@/lib/cargo-contexto', () => ({ carregarCargoInfo: vi.fn(async () => ({})), formatBlocoCargo: () => '' }));

import { gerarRoteiroDeModulo } from '@/lib/video/gerar-roteiro';
import { gerarTextosAvatarGrupo } from '@/lib/video/avatar-grupo-core';

const modulo = (locale?: string | null) => ({ titulo: 'M', ...(locale === undefined ? {} : { locale }) }) as any;

beforeEach(() => {
  vi.unstubAllEnvs();
  callAI.mockReset();
  submitClaudeBatch.mockReset();
});

describe('roteiro de vídeo: o idioma é o do módulo, senão pt-BR, em todos os caminhos', () => {
  it('coletor de lote: a request leva o idioma do módulo', async () => {
    const coletor = vi.fn(async () => 'ROTEIRO');
    await gerarRoteiroDeModulo(modulo('es-ES'), { empresaId: 'emp-1', aiRunRoteiro: coletor });
    expect((coletor.mock.calls[0] as any[])[4]).toEqual({ taskKey: 'conteudo_video', empresaId: 'emp-1', locale: 'es-ES' });
  });

  it('o síncrono do fallback do coletor (batch-sync) leva o MESMO idioma', async () => {
    const coletor = vi.fn(async () => 'lixo');
    callAI.mockResolvedValue('ROTEIRO');
    await gerarRoteiroDeModulo(modulo('en-US'), { empresaId: 'emp-1', aiRunRoteiro: coletor });
    expect(callAI.mock.calls[0][4]).toMatchObject({ source: 'batch-sync', locale: 'en-US' });
  });

  it('lote avulso (disparo do admin): a request do batch leva o idioma do módulo', async () => {
    submitClaudeBatch.mockResolvedValue(new Map([['roteiro-video', 'ROTEIRO']]));
    await gerarRoteiroDeModulo(modulo('pt-PT'), { empresaId: 'emp-1' });
    expect(submitClaudeBatch.mock.calls[0][0][0].locale).toBe('pt-PT');
  });

  it('síncrono por escolha (forceSync): leva o idioma do módulo, e nenhum cookie', async () => {
    callAI.mockResolvedValue('ROTEIRO');
    await gerarRoteiroDeModulo(modulo('es-ES'), { forceSync: true, empresaId: 'emp-1' });
    expect(callAI.mock.calls[0][4]).toEqual({ taskKey: 'conteudo_video', empresaId: 'emp-1', locale: 'es-ES' });
  });

  it.each([undefined, null, '', 'fr-FR'])('módulo sem idioma conhecido (%j): pt-BR, a voz', async (declarado) => {
    callAI.mockResolvedValue('ROTEIRO');
    await gerarRoteiroDeModulo(modulo(declarado as any), { forceSync: true, empresaId: 'emp-1' });
    expect(callAI.mock.calls[0][4].locale).toBe('pt-BR');
  });
});

describe('textos falados do avatar: o mesmo idioma do roteiro', () => {
  const TEXTOS = JSON.stringify({
    intro: { title: 'O que decide o seu dia', subtitle: 'Critério antes da urgência', narration: 'Quando tudo chega ao mesmo tempo, quem decide o seu dia é a urgência de outra pessoa. Hoje você vai ver como trocar essa lógica por um critério que é seu, claro e defensável.' },
    outro: { title: 'Sua próxima escolha', subtitle: 'O que sai da lista primeiro?', narration: 'Você já sabe o que protege o seu planejamento. Olhe para a sua semana com calma. Qual demanda vai sair da lista primeiro, e com que critério?' },
  });

  it('leva o idioma do módulo; sem ele, pt-BR', async () => {
    callAI.mockResolvedValue(TEXTOS);
    await gerarTextosAvatarGrupo({ titulo: 'M', locale: 'es-ES' } as any, 'emp-1');
    expect(callAI.mock.calls[0][4]).toEqual({ taskKey: 'video_avatar_grupo', empresaId: 'emp-1', locale: 'es-ES' });

    callAI.mockClear();
    await gerarTextosAvatarGrupo({ titulo: 'M' } as any, 'emp-1');
    expect(callAI.mock.calls[0][4].locale).toBe('pt-BR');
  });
});
