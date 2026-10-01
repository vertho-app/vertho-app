import { beforeEach, describe, expect, it, vi } from 'vitest';
import { criarSupabaseMock } from '../helpers/supabase-mock';
import {
  colunasDePreferencias,
  FORMATOS_PREFERENCIA,
  precisaPreferenciasAprendizagem,
  usaMapeamentoComportamentalNativo,
} from '@/lib/access-gates';

/**
 * PREFERÊNCIAS DE APRENDIZAGEM FORA DO DISC (01/10/2026).
 *
 * O formulário era a última etapa do Mapeamento Comportamental. Quem não faz o
 * DISC nativo (fonte externa de perfil, ex.: Boehringer/OPQ32) nunca passava por
 * ela e ficava com `pref_* = 0`. Agora a tela é pedida ao fim do primeiro
 * mapeamento de competências — e só para esse público.
 */

const TODAS = Object.fromEntries(FORMATOS_PREFERENCIA.map((f) => [f.id, 4]));

describe('usaMapeamentoComportamentalNativo', () => {
  it('fonte externa de perfil = NÃO usa o DISC nativo', () => {
    expect(usaMapeamentoComportamentalNativo({ perfil_externo_fonte: 'opq32' })).toBe(false);
    expect(usaMapeamentoComportamentalNativo({ perfil_externo_fonte: 'hogan' })).toBe(false);
  });

  it('sem fonte externa usa — e perfil bloqueado sozinho NÃO tira o tenant do DISC (é estado da turma)', () => {
    expect(usaMapeamentoComportamentalNativo({})).toBe(true);
    expect(usaMapeamentoComportamentalNativo(null)).toBe(true);
    expect(usaMapeamentoComportamentalNativo({ perfil_externo_fonte: null })).toBe(true);
    expect(usaMapeamentoComportamentalNativo({ perfil_comportamental_liberado: false })).toBe(true);
  });
});

describe('precisaPreferenciasAprendizagem', () => {
  const externo = { perfil_externo_fonte: 'opq32' };

  it('só pede com as três condições juntas: sem DISC nativo, primeira competência respondida, ainda não preencheu', () => {
    expect(precisaPreferenciasAprendizagem({ config: externo, jaPreencheu: false, primeiraCompetenciaRespondida: true })).toBe(true);
  });

  it('não pede antes de a primeira competência ser respondida', () => {
    expect(precisaPreferenciasAprendizagem({ config: externo, jaPreencheu: false, primeiraCompetenciaRespondida: false })).toBe(false);
  });

  it('não pede de novo a quem já preencheu', () => {
    expect(precisaPreferenciasAprendizagem({ config: externo, jaPreencheu: true, primeiraCompetenciaRespondida: true })).toBe(false);
  });

  it('🔴 tenant com DISC nativo NÃO é puxado: lá a etapa já vive no mapeamento comportamental', () => {
    expect(precisaPreferenciasAprendizagem({ config: {}, jaPreencheu: false, primeiraCompetenciaRespondida: true })).toBe(false);
    expect(precisaPreferenciasAprendizagem({ config: null, jaPreencheu: false, primeiraCompetenciaRespondida: true })).toBe(false);
  });
});

describe('colunasDePreferencias', () => {
  it('traduz os 8 formatos para as colunas pref_* de colaboradores', () => {
    expect(colunasDePreferencias(TODAS)).toEqual({
      pref_video_curto: 4, pref_video_longo: 4, pref_texto: 4, pref_audio: 4,
      pref_infografico: 4, pref_exercicio: 4, pref_mentor: 4, pref_estudo_caso: 4,
    });
  });

  it('recusa formulário parcial, fora de 1..5 ou não inteiro — meio formulário não é preferência', () => {
    const { text: _omitido, ...faltando } = TODAS as Record<string, number>;
    expect(colunasDePreferencias(faltando)).toBeNull();
    expect(colunasDePreferencias({ ...TODAS, text: 0 })).toBeNull();
    expect(colunasDePreferencias({ ...TODAS, text: 6 })).toBeNull();
    expect(colunasDePreferencias({ ...TODAS, text: 2.5 })).toBeNull();
    expect(colunasDePreferencias({ ...TODAS, text: '3' })).toBeNull();
    expect(colunasDePreferencias(null)).toBeNull();
    expect(colunasDePreferencias('x')).toBeNull();
  });
});

const sb = criarSupabaseMock({
  resolver: (tabela) => (tabela === 'colaboradores'
    ? { pref_video_curto: 5, pref_video_longo: 0, pref_texto: null, pref_audio: 3, pref_infografico: 1, pref_exercicio: 2, pref_mentor: 4, pref_estudo_caso: 9 }
    : null),
});
const sessao = { email: 'ana@cliente.com' as string | null };

vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => sb.client }));
vi.mock('@/lib/authz', () => ({
  findColabByEmail: vi.fn(async () => ({ id: 'colab-1', empresa_id: 'emp-1' })),
}));
vi.mock('@/lib/auth/action-context', () => ({
  getAuthenticatedEmailFromAction: vi.fn(async () => sessao.email),
}));

describe('actions da tela de preferências', () => {
  let acoes: typeof import('@/app/dashboard/preferencias-aprendizagem/actions');
  beforeEach(async () => {
    sb.reset();
    sessao.email = 'ana@cliente.com';
    acoes = await import('@/app/dashboard/preferencias-aprendizagem/actions');
  });

  it('salva SÓ as colunas pref_*, no colaborador e no tenant da sessão', async () => {
    const r: any = await acoes.salvarPreferenciasAprendizagem(TODAS);
    expect(r).toEqual({ success: true });

    const escritas = sb.escritas.filter((e) => e.tabela === 'colaboradores');
    expect(escritas).toHaveLength(1);
    expect(escritas[0].op).toBe('update');
    expect(Object.keys(escritas[0].payload).sort()).toEqual(FORMATOS_PREFERENCIA.map((f) => f.coluna).sort());
    expect(sb.usou('colaboradores', 'eq', 'id')).toBe(true);
    expect(sb.usou('colaboradores', 'eq', 'empresa_id')).toBe(true);
  });

  it('formulário inválido não escreve nada', async () => {
    const r: any = await acoes.salvarPreferenciasAprendizagem({ ...TODAS, audio: 0 });
    expect(r.success).toBe(false);
    expect(sb.escritas).toHaveLength(0);
  });

  it('sem sessão não escreve nada', async () => {
    sessao.email = null;
    const r: any = await acoes.salvarPreferenciasAprendizagem(TODAS);
    expect(r.success).toBe(false);
    expect(sb.escritas).toHaveLength(0);
  });

  it('🔴 falha do update vira success:false (o supabase-js RETORNA o erro, não lança)', async () => {
    sb.falharEm({ tabela: 'colaboradores', op: 'update', mensagem: 'timeout no pool' });
    const r: any = await acoes.salvarPreferenciasAprendizagem(TODAS);
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/timeout no pool/);
  });

  it('a leitura devolve o que está gravado e zera o que é inválido (null, 0, 9)', async () => {
    const r: any = await acoes.getMinhasPreferenciasAprendizagem();
    expect(r.prefs).toEqual({
      video_short: 5, video_long: 0, text: 0, audio: 3, infographic: 1, exercise: 2, mentor: 4, case: 0,
    });
  });

  it('falha de leitura devolve erro, não "nenhuma preferência"', async () => {
    sb.falharEm({ tabela: 'colaboradores', op: 'select', mensagem: 'coluna inexistente' });
    const r: any = await acoes.getMinhasPreferenciasAprendizagem();
    expect(r.prefs).toBeUndefined();
    expect(r.error).toMatch(/coluna inexistente/);
  });
});
