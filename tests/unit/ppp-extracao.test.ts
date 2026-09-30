import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_PPP_MODEL, PPP_AI_MODELS } from '@/lib/ppp-config';

const mocks = vi.hoisted(() => ({
  gate: vi.fn(),
  ai: vi.fn(),
  upsert: vi.fn(),
  saved: vi.fn(),
  update: vi.fn(),
}));

vi.mock('@/lib/admin-supabase', () => ({ requireEmpresaSupabase: mocks.gate }));
vi.mock('@/actions/ai-client', () => ({ callAI: mocks.ai }));

import { extrairPPP } from '@/actions/ppp';

const empresaId = 'empresa-1';
const dados = {
  perfil_instituicao: { nome: 'Escola São João' },
  competencias_priorizadas: [{ nome: 'Cooperação', relevancia: 'alta' }],
  valores_institucionais: ['Inclusão'],
};
const linha = { id: 'ppp-1', empresa_id: empresaId, escola: 'Escola São João', status: 'extraido' };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.ai.mockResolvedValue(JSON.stringify(dados));
  mocks.saved.mockResolvedValue({ data: [linha], error: null });
  mocks.upsert.mockReturnValue({ select: mocks.saved });
  mocks.update.mockReturnValue({ eq: async () => ({ error: null }) });
  mocks.gate.mockResolvedValue({
    from: (table: string) => table === 'ppp_escolas'
      ? { upsert: mocks.upsert }
      : {
          select: () => ({ eq: () => ({ single: async () => ({ data: { nome: 'Rede', segmento: 'Educação' }, error: null }) }) }),
          update: mocks.update,
        },
  });
});

describe('extração e salvamento do PPP enviado', () => {
  it('retorna a linha confirmada pelo banco para o PPP aparecer imediatamente na tela', async () => {
    const r = await extrairPPP(empresaId, { textos: ['[Arquivo: PPP.pdf]\nProjeto pedagógico da Escola São João.'], nomeEscola: ' Escola São João ' });
    expect(r.success).toBe(true);
    expect(r.ppp).toEqual(linha);
    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({ escola: 'Escola São João', status: 'extraido', empresa_id: empresaId }), { onConflict: 'empresa_id,escola' });
    const gravado = mocks.upsert.mock.calls[0][0];
    expect(JSON.parse(gravado.extracao).competencias).toEqual(dados.competencias_priorizadas);
    expect(gravado.valores).toEqual(['Inclusão']);
    expect(mocks.ai.mock.calls[0][1]).toContain('Projeto pedagógico da Escola São João.');
  });

  it('envia por padrão o mesmo modelo que aparece selecionado na tela', async () => {
    await extrairPPP(empresaId, { textos: ['Projeto pedagógico.'] });
    expect(PPP_AI_MODELS.some(m => m.id === DEFAULT_PPP_MODEL)).toBe(true);
    expect(mocks.ai.mock.calls[0][2]).toEqual({ model: DEFAULT_PPP_MODEL });
  });

  it('informa erro de gravação e não confirma sucesso', async () => {
    mocks.saved.mockResolvedValue({ data: null, error: { message: 'Falha ao gravar PPP' } });
    const r = await extrairPPP(empresaId, { textos: ['Projeto pedagógico.'] });
    expect(r).toEqual({ success: false, error: 'Falha ao gravar PPP' });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('não confirma salvamento sem uma linha devolvida pelo banco', async () => {
    mocks.saved.mockResolvedValue({ data: null, error: null });
    const r = await extrairPPP(empresaId, { textos: ['Projeto pedagógico.'] });
    expect(r.success).toBe(false);
    expect(r.error).toContain('confirmar o salvamento');
  });

  it('não grava uma extração que falhou na IA', async () => {
    mocks.ai.mockRejectedValue(new Error('Tempo de execução esgotado'));
    expect(await extrairPPP(empresaId, { textos: ['Projeto pedagógico.'] })).toEqual({ success: false, error: 'Tempo de execução esgotado' });
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it('não grava saída inválida da IA', async () => {
    mocks.ai.mockResolvedValue('Resposta incompleta');
    const r = await extrairPPP(empresaId, { textos: ['Projeto pedagógico.'] });
    expect(r.success).toBe(false);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
});
