import { beforeEach, describe, expect, it, vi } from 'vitest';
import { criarSupabaseMock } from '../helpers/supabase-mock';

/**
 * Pré-geração da devolutiva em voz no `after()` do DISC.
 *
 * `Medido 01/09/2026:` 47 das 112 pessoas que fizeram o DISC nos últimos 30 dias
 * pediram o áudio — e quem pedia esperava o encadeamento inteiro (roteiro por IA
 * + TTS, 17,6s de mediana só no TTS). O que estes testes protegem não é a
 * geração em si, é a ORDEM e o ISOLAMENTO: o áudio reusa os textos que o
 * relatório acabou de produzir, e falhar nele não pode derrubar o PDF.
 */

const colab = {
  id: 'colab-1',
  empresa_id: 'emp-1',
  nome_completo: 'Marina Souza',
  cargo: 'Analista Financeiro',
  perfil_dominante: 'DC',
  d_natural: 70,
  i_natural: 30,
  s_natural: 40,
  c_natural: 80,
  report_texts: null,
  report_generated_at: null,
};

const sb = criarSupabaseMock({
  resolver: (table) => {
    if (table === 'colaboradores') return colab;
    if (table === 'empresas') return { nome: 'ACME' };
    if (table === 'cargos_empresa') return { nome: 'Analista Financeiro' };
    return null;
  },
});

const audioCore = vi.fn(async (_args: any): Promise<any> => ({ success: true as const, path: 'emp-1/devolutiva.mp3' }));
const renderPdf = vi.fn(async () => Buffer.from('pdf'));
const callAI = vi.fn(async () => JSON.stringify({ versao: 'x' }));

vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => sb.client }));
vi.mock('@/lib/tenant-db', () => ({ tenantDb: () => sb.client }));
vi.mock('@/lib/authz', () => ({ findColabByEmail: vi.fn(async () => colab) }));
vi.mock('@/actions/ai-client', () => ({ callAI: (...a: any[]) => callAI(...(a as [])) }));
vi.mock('@/lib/relatorio-comportamental/devolutiva-audio', () => ({
  gerarDevolutivaEmAudioCore: (args: any) => audioCore(args),
}));

vi.mock('@/lib/relatorio-comportamental/relatorio-core', async (importOriginal) => {
  const real = await importOriginal<any>();
  return real;
});

// o render do PDF é caro e irrelevante aqui: o alvo é o encadeamento
vi.mock('@/components/pdf/behavioral-report-pdf', () => ({ default: () => null }));

import { gerarEsalvarRelatorioComportamentalCore } from '@/lib/relatorio-comportamental/relatorio-core';

describe('devolutiva em voz pré-gerada junto do relatório', () => {
  beforeEach(() => {
    sb.reset();
    audioCore.mockClear();
    renderPdf.mockClear();
    callAI.mockClear();
    audioCore.mockResolvedValue({ success: true as const, path: 'emp-1/devolutiva.mp3' });
  });

  it('não gera áudio quando ninguém pediu — o botão continua sob demanda', async () => {
    await gerarEsalvarRelatorioComportamentalCore({ colab: { ...colab }, empresaId: 'emp-1' });
    expect(audioCore).not.toHaveBeenCalled();
  });

  it('com `comAudio`, o áudio reusa os MESMOS textos do relatório', async () => {
    await gerarEsalvarRelatorioComportamentalCore({ colab: { ...colab }, empresaId: 'emp-1', comAudio: true });

    expect(audioCore).toHaveBeenCalledTimes(1);
    const arg: any = (audioCore.mock.calls[0] as any[])[0];
    // é isto que impede pagar a geração de textos duas vezes: o núcleo do áudio
    // recebe `texts` prontos, em vez de resolver o cache por conta própria
    expect(arg.texts).toBeTruthy();
    expect(arg.raw).toBeTruthy();
    expect(arg.colab?.id).toBe('colab-1');
  });

  it('falha no áudio NÃO derruba o relatório: o PDF continua entregue', async () => {
    audioCore.mockResolvedValueOnce({ error: 'TTS fora do ar' } as any);

    const r: any = await gerarEsalvarRelatorioComportamentalCore({
      colab: { ...colab }, empresaId: 'emp-1', comAudio: true,
    });

    expect(r.success).toBe(true);
    expect(r.path).toBeTruthy();
    expect(r.audio?.error).toBe('TTS fora do ar');
  });

  it('exceção no áudio também é contida', async () => {
    audioCore.mockRejectedValueOnce(new Error('boom'));

    const r: any = await gerarEsalvarRelatorioComportamentalCore({
      colab: { ...colab }, empresaId: 'emp-1', comAudio: true,
    });

    expect(r.success).toBe(true);
    expect(r.audio?.error).toBe('boom');
  });
});
