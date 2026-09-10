import { describe, it, expect, beforeEach, vi } from 'vitest';
import { criarSupabaseMock } from '../helpers/supabase-mock';

/**
 * O filtro de FUNÇÃO da tela do gestor/RH — a LIGAÇÃO, não a régua.
 *
 * A régua vive em `lib/engajamento/roll-up` e já tem prova própria
 * (`engajamento-filtro-funcao.test.ts`): o recorte corta a POPULAÇÃO antes de
 * qualquer cálculo. O que este arquivo cobre é o outro lado do fio — o núcleo
 * aceitava `cargo` desde 08/09/2026, e `/dashboard/gestor/engajamento`
 * simplesmente não passava o parâmetro. Capacidade sem call-site é capacidade
 * que não existe, e o sintoma é uma tela que parece completa.
 *
 * São dois eixos de recorte na MESMA chamada, e trocá-los tem consequências
 * opostas: o 3º argumento é a população do papel (fail-closed — gestor sem
 * liderados vê zero), o 4º é a função escolhida na tela (vazio = todas). Por
 * isso cada `it` olha a posição, não só o valor.
 */

const CHAMADAS: any[][] = [];
const RESPOSTA_DO_NUCLEO = {
  resumo: { inscritos: 2 },
  colaboradores: [
    { colaboradorId: 'p1', nome: 'Ana', cargo: 'Professor(a)' },
    { colaboradorId: 'p2', nome: 'Bia', cargo: 'Professor(a)' },
  ],
  semanas: [1, 2, 3],
  cargos: ['Diretor(a) Escolar', 'Professor(a)'],
};

const LIDERADOS = [
  { id: 'p1', nome_completo: 'Ana', cargo: 'Professor(a)', email: 'ana@x.com', gestor_email: 'gestor@x.com' },
  { id: 'p2', nome_completo: 'Bia', cargo: 'Professor(a)', email: 'bia@x.com', gestor_email: 'gestor@x.com' },
];

const sb = criarSupabaseMock({
  lista: (tabela) => (tabela === 'colaboradores' ? LIDERADOS : []),
});

let ctx: any = null;

vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => sb.client }));
vi.mock('@/lib/tenant-db', () => ({ tenantDb: () => sb.client }));
vi.mock('@/lib/authz', () => ({ getUserContext: async () => ctx }));
vi.mock('@/lib/auth/action-context', () => ({
  getAuthenticatedEmailFromAction: async () => ctx?.colaborador?.email || null,
}));
vi.mock('@/lib/engajamento/roll-up', () => ({
  rollUpEngajamento: (...args: any[]) => {
    CHAMADAS.push(args);
    return Promise.resolve(RESPOSTA_DO_NUCLEO);
  },
}));

import { getEngajamentoDoTime } from '@/app/dashboard/gestor/actions';

const COMO_GESTOR = {
  colaborador: { id: 'g1', email: 'gestor@x.com', empresa_id: 'emp-1' },
  role: 'gestor',
  isPlatformAdmin: false,
};
const COMO_RH = {
  colaborador: { id: 'rh1', email: 'rh@x.com', empresa_id: 'emp-1' },
  role: 'rh',
  isPlatformAdmin: false,
};

/** Os argumentos com que o núcleo foi chamado na última leitura da tela. */
const ultimaChamada = () => CHAMADAS[CHAMADAS.length - 1];

beforeEach(() => {
  sb.reset();
  CHAMADAS.length = 0;
  ctx = COMO_GESTOR;
});

describe('engajamento do time · recorte por função', () => {
  it('🔴 a função escolhida na tela chega ao núcleo', async () => {
    const r = await getEngajamentoDoTime(null, 'Professor(a)');
    expect(r.ok).toBe(true);
    // 4ª posição: é o eixo da FUNÇÃO. Na 3ª ele seria lido como lista de ids.
    expect(ultimaChamada()[3]).toBe('Professor(a)');
  });

  it('o recorte do papel continua no lugar dele — os dois eixos convivem', async () => {
    await getEngajamentoDoTime(2, 'Professor(a)');
    const [empresaId, semana, recorte, cargo] = ultimaChamada();
    expect(empresaId).toBe('emp-1');
    expect(semana).toBe(2);
    expect(recorte).toEqual(['p1', 'p2']); // só os liderados do gestor
    expect(cargo).toBe('Professor(a)');
  });

  it('sem função escolhida, o núcleo recebe null (todas), não um recorte vazio', async () => {
    await getEngajamentoDoTime(null);
    expect(ultimaChamada()[3]).toBeNull();
  });

  it('🔴 as funções disponíveis voltam para a tela — sem elas o seletor não existe', async () => {
    const r = await getEngajamentoDoTime(null, 'Professor(a)');
    // A lista é calculada ANTES do recorte no núcleo; perdê-la aqui prenderia a
    // pessoa na função que ela acabou de escolher.
    expect(r.cargos).toEqual(['Diretor(a) Escolar', 'Professor(a)']);
  });

  it('para RH o eixo do papel é o tenant inteiro, e a função recorta por cima', async () => {
    ctx = COMO_RH;
    const r = await getEngajamentoDoTime(null, 'Diretor(a) Escolar');
    const [, , recorte, cargo] = ultimaChamada();
    expect(recorte).toBeNull();
    expect(cargo).toBe('Diretor(a) Escolar');
    expect(r.scope).toBe('rh');
    expect(r.cargos).toContain('Professor(a)');
  });

  it('quem não é gestor/tutor/RH não passa nem com função escolhida', async () => {
    ctx = { colaborador: { id: 'c1', email: 'colab@x.com', empresa_id: 'emp-1' }, role: 'colaborador', isPlatformAdmin: false };
    const r = await getEngajamentoDoTime(null, 'Professor(a)');
    expect(r.ok).toBe(false);
    expect(CHAMADAS).toHaveLength(0);
  });
});
