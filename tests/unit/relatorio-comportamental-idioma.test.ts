import { beforeEach, describe, expect, it, vi } from 'vitest';
import { criarSupabaseMock } from '../helpers/supabase-mock';

// Estes testes geram o PDF do relatório de verdade: sob a suíte inteira passam dos 20 s globais.
vi.setConfig({ testTimeout: 120_000 });

/**
 * Onda E (04/10/2026): o Perfil Comportamental da PESSOA fala no idioma dela. Três textos saem da IA para o
 * mesmo perfil, e cada um tem a sua regra:
 *
 *  - os textos interpretativos do relatório (`relatorio_comportamental`) e os insights executivos
 *    (`insights_executivos`) ficam no cadastro da pessoa e são lidos por ela: o `callAI` recebe o idioma dela
 *    (`colaboradores.locale`, senão `empresas.default_locale`, senão pt-BR) como opção EXPLÍCITA, e não o cookie
 *    de quem disparou (no `after()` do mapeamento não há cookie, e o texto saía em pt-BR para quem lê em outro);
 *  - o roteiro da devolutiva em VOZ (`devolutiva_comportamental`) fica em pt-BR DE PROPÓSITO: a voz é pt-BR
 *    (`languageCode: 'pt-BR'` em `lib/gemini-tts.ts` e a direção "Narre em português do Brasil" em
 *    `lib/tts/elenco.ts`), e um roteiro em outro idioma seria lido por voz brasileira. Sem a opção, o idioma do
 *    roteiro era o do cookie de quem clicou em "Ouvir".
 */

const h = vi.hoisted(() => ({
  locale: { colab: null as string | null, empresa: null as string | null },
  chamadas: [] as Array<{ taskKey?: string; opcoes: any }>,
}));

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
  insights_executivos: null,
  insights_executivos_at: null,
};

let sb: ReturnType<typeof criarSupabaseMock>;
const montar = () => {
  sb = criarSupabaseMock({
    resolver: (table) => {
      if (table === 'colaboradores') return { ...colab, locale: h.locale.colab };
      if (table === 'empresas') return { nome: 'ACME', default_locale: h.locale.empresa };
      if (table === 'cargos_empresa') return { nome: 'Analista Financeiro' };
      return null;
    },
  });
};

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => sb.client }));
vi.mock('@/lib/authz', () => ({
  findColabByEmail: vi.fn(async () => ({ ...colab, locale: h.locale.colab })),
  canViewColabJourney: vi.fn(async () => true),
  getUserContext: vi.fn(async () => null),
}));
vi.mock('@/lib/auth/action-context', () => ({ getAuthenticatedEmailFromAction: async () => 'marina@acme.test' }));
vi.mock('@/lib/ai-tasks', () => ({ getModelForTask: async () => 'modelo', DEFAULT_TASK_MODELS: {} }));
vi.mock('@/actions/ai-client', () => ({
  callAI: vi.fn(async (_s: string, _u: string, _c: any, _m: number, opcoes: any) => {
    h.chamadas.push({ taskKey: opcoes?.taskKey, opcoes });
    if (opcoes?.taskKey === 'devolutiva_comportamental') return 'Olá, Marina. Este é o roteiro.';
    // sem taskKey: os insights executivos
    if (!opcoes?.taskKey) return JSON.stringify({ insights: ['a', 'b', 'c'] });
    return JSON.stringify({ versao: 'x' });
  }),
}));
vi.mock('@/lib/gemini-tts', () => ({
  extractNarration: (t: string) => t,
  generateNarrationAudio: async () => ({ buffer: Buffer.from('mp3'), contentType: 'audio/mpeg', qa: { ok: true, motivos: [] } }),
}));
vi.mock('@react-pdf/renderer', async (original) => ({
  ...(await original<typeof import('@react-pdf/renderer')>()),
  renderToBuffer: async () => Buffer.from('%PDF-1.7'),
}));

import { mapSupabaseToCISRawData } from '@/lib/supabase/mapCISProfile';
import { gerarEsalvarRelatorioComportamentalCore, gerarTextosLLM } from '@/lib/relatorio-comportamental/relatorio-core';
import { gerarDevolutivaEmAudioCore } from '@/lib/relatorio-comportamental/devolutiva-audio';
import { gerarInsightsExecutivos } from '@/app/dashboard/perfil-comportamental/perfil-comportamental-actions';

const daTarefa = (taskKey?: string) => h.chamadas.filter((c) => c.taskKey === taskKey);

beforeEach(() => {
  h.chamadas = [];
  h.locale = { colab: null, empresa: null };
  montar();
});

describe('relatório comportamental: os textos saem no idioma da pessoa', () => {
  it('o núcleo (mapeamento e download) passa o idioma da pessoa; sem idioma, o da empresa', async () => {
    h.locale.colab = 'en-US';
    h.locale.empresa = 'es-ES';
    montar();
    const r: any = await gerarEsalvarRelatorioComportamentalCore({ colab: { ...colab }, empresaId: 'emp-1' });
    expect(r.success, r.error).toBe(true);
    expect(daTarefa('relatorio_comportamental')).toHaveLength(1);
    expect(daTarefa('relatorio_comportamental')[0].opcoes.locale).toBe('en-US');

    h.chamadas = [];
    h.locale.colab = null;
    montar();
    await gerarEsalvarRelatorioComportamentalCore({ colab: { ...colab }, empresaId: 'emp-1' });
    expect(daTarefa('relatorio_comportamental')[0].opcoes.locale).toBe('es-ES');
  });

  it('sem idioma na pessoa nem na empresa: pt-BR explícito', async () => {
    await gerarEsalvarRelatorioComportamentalCore({ colab: { ...colab }, empresaId: 'emp-1' });
    expect(daTarefa('relatorio_comportamental')[0].opcoes.locale).toBe('pt-BR');
  });

  it('`gerarTextosLLM` sem idioma segue como sempre (nenhuma opção de idioma na chamada)', async () => {
    const raw = mapSupabaseToCISRawData(colab);
    await gerarTextosLLM(raw, 'emp-1');
    expect(daTarefa('relatorio_comportamental')[0].opcoes).not.toHaveProperty('locale');
    await gerarTextosLLM(raw, 'emp-1', 'pt-PT');
    expect(daTarefa('relatorio_comportamental')[1].opcoes.locale).toBe('pt-PT');
  });
});

describe('insights executivos: no idioma da pessoa', () => {
  it('o `callAI` recebe o idioma da pessoa', async () => {
    h.locale.colab = 'es-ES';
    montar();
    const r: any = await gerarInsightsExecutivos({ force: true });
    expect(r.error, r.error).toBeUndefined();
    expect(r.insights).toEqual(['a', 'b', 'c']);
    expect(daTarefa(undefined)).toHaveLength(1);
    expect(daTarefa(undefined)[0].opcoes.locale).toBe('es-ES');
  });

  it('sem idioma na pessoa nem na empresa: pt-BR explícito', async () => {
    await gerarInsightsExecutivos({ force: true });
    expect(daTarefa(undefined)[0].opcoes.locale).toBe('pt-BR');
  });
});

describe('devolutiva em voz: o roteiro fica em pt-BR porque a voz é pt-BR', () => {
  it('mesmo para quem lê em outro idioma, o `callAI` do roteiro leva `locale: pt-BR`', async () => {
    h.locale.colab = 'en-US';
    montar();
    const r: any = await gerarDevolutivaEmAudioCore({
      colab: { ...colab, locale: 'en-US' }, raw: mapSupabaseToCISRawData(colab), texts: { versao: 'x' }, sb: sb.client,
    });
    expect(r.error, r.error).toBeUndefined();
    expect(daTarefa('devolutiva_comportamental')).toHaveLength(1);
    expect(daTarefa('devolutiva_comportamental')[0].opcoes.locale).toBe('pt-BR');
  });
});
