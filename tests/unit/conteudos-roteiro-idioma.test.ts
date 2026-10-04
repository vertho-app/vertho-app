import { beforeEach, describe, expect, it, vi } from 'vitest';
import { criarSupabaseMock } from '../helpers/supabase-mock';

/**
 * Onda F (04/10/2026): o roteiro de VÍDEO e o de PODCAST (`gerarConteudoIA`, formatos `video` e `audio`) vão para
 * voz, e a voz é pt-BR. O idioma deles é EXPLÍCITO, e não o do cookie de quem clicou em "gerar" (o síncrono) nem o
 * pt-BR por acaso do lote: o do módulo-base aplicado, senão o que a célula declara (`aiConfig.locale`), senão pt-BR.
 *
 * Vale nos dois caminhos: o síncrono (`callAI`) e o do coletor de lote (`aiRun`, que leva `options.locale` na
 * request). Texto e case (PDF para ler) ficam como estavam: sem `locale`.
 */

const h = vi.hoisted(() => ({
  callAI: vi.fn(),
  moduloLocale: null as string | null,
}));

vi.mock('@/actions/ai-client', () => ({ callAI: h.callAI }));
vi.mock('@/lib/ai-tasks', () => ({ getModelForTask: async () => 'claude-opus-5' }));
vi.mock('@/lib/season-engine/perfil-publico', async (importOriginal) => {
  const real = await importOriginal<any>();
  return { ...real, resolverPerfilPublicoDaEmpresa: async () => real.resolverPerfilPublico('educacao', 'Gestão Escolar') };
});
vi.mock('@/lib/cargo-contexto', () => ({
  carregarFichaCargo: async () => '',
  anexarFichaCargo: (p: any) => p,
}));
vi.mock('@/lib/season-engine/modulo-base-integration', () => ({
  resolverModuloBaseParaConteudo: async () => (h.moduloLocale
    ? { modulo: { id: 'mod-1', grupo_id: 'g-1', locale: h.moduloLocale }, criterio: 'teste' }
    : null),
  enriquecerPromptComModuloBase: (p: any) => p,
}));

import { gerarConteudoIA } from '@/actions/conteudos';

const ARGS = { competencia: 'Autocuidado', descritor: 'Busca de apoio', cargo: 'Gestão Escolar', empresaId: 'emp-1' };
const sb = () => criarSupabaseMock().client;

beforeEach(() => {
  h.callAI.mockReset();
  h.callAI.mockResolvedValue('# Roteiro\n\nTexto do roteiro.');
  h.moduloLocale = null;
});

/** As opções da PRIMEIRA chamada de IA (a geração principal). */
const opcoes = () => h.callAI.mock.calls[0][4];

describe('roteiro de vídeo e de podcast: idioma explícito', () => {
  it.each(['video', 'audio'] as const)('%s sem módulo nem declaração da célula: pt-BR, nunca o cookie', async (formato) => {
    await gerarConteudoIA({ ...ARGS, formato, sb: sb() });
    expect(h.callAI).toHaveBeenCalled();
    expect(opcoes().locale).toBe('pt-BR');
  });

  it('o idioma do módulo-base aplicado vence', async () => {
    h.moduloLocale = 'es-ES';
    await gerarConteudoIA({ ...ARGS, formato: 'audio', sb: sb() });
    expect(opcoes().locale).toBe('es-ES');
  });

  it('sem módulo, o que a célula declara (`aiConfig.locale`)', async () => {
    await gerarConteudoIA({ ...ARGS, formato: 'video', aiConfig: { locale: 'pt-PT' } as any, sb: sb() });
    expect(opcoes().locale).toBe('pt-PT');
  });

  it('idioma declarado que o app não conhece cai em pt-BR', async () => {
    h.moduloLocale = 'fr-FR';
    await gerarConteudoIA({ ...ARGS, formato: 'video', sb: sb() });
    expect(opcoes().locale).toBe('pt-BR');
  });

  it('pelo coletor de lote (`aiRun`) o idioma vai nas options da mesma forma', async () => {
    h.moduloLocale = 'en-US';
    const aiRun = vi.fn(async () => '# Roteiro\n\nTexto.');
    await gerarConteudoIA({ ...ARGS, formato: 'video', aiRun, sb: sb() });
    expect(aiRun).toHaveBeenCalled();
    expect((aiRun.mock.calls[0] as any[])[4].locale).toBe('en-US');
    expect(h.callAI).not.toHaveBeenCalled();
  });
});

describe('texto e case seguem como estavam', () => {
  it.each(['texto', 'case'] as const)('%s não ganha `locale`', async (formato) => {
    h.moduloLocale = 'es-ES';
    await gerarConteudoIA({ ...ARGS, formato, sb: sb() });
    expect(h.callAI).toHaveBeenCalled();
    expect(opcoes()).not.toHaveProperty('locale');
  });
});
