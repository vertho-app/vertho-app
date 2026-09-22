import { beforeEach, describe, expect, it, vi } from 'vitest';
import { criarSupabaseMock } from '../helpers/supabase-mock';

/**
 * TUDO na linha fala da semana atual DA PESSOA — inclusive a pílula.
 *
 * `Medido: 22/09/2026` (Amanda Rosa, ibipeba, print do dono): a linha dizia
 * "Semana 4 · etapa pendente" e, ao lado, P1 e P2 "Enviada · abriu". As duas
 * coisas eram verdade sobre semanas DIFERENTES: a etapa dela é a 4 (a missão
 * da semana 4 está em andamento desde 31/08), enquanto a cadência já está na
 * semana 10 (`fase4_envios.semana_atual`), e era da semana 10 aquele "Enviada".
 *
 * A régua do dono é uma só: conteúdo, evidência e envio se referem à semana
 * atual do colaborador. O carimbo de pílula guarda só o ÚLTIMO envio, então
 * quando a pessoa está atrás da cadência ele não sabe responder pela etapa
 * dela — e a resposta honesta é `null` ("sem registro"), nunca um ✓ emprestado
 * de outra semana.
 */

const INICIO = '2026-07-14';

// Plano de 10 semanas, como o de Ibipeba.
const PLANO = Array.from({ length: 10 }, (_, i) => ({ semana: i + 1, descritor: `d${i + 1}` }));

const ENVIOS = [
  {
    colaborador_id: 'amanda', semana_atual: 10, status: 'ativo', data_inicio: INICIO,
    ultima_evidencia_em: '2026-08-31T11:42:21.905Z',
    ultima_pilula1_em: '2026-09-14T11:00:13.511Z',   // pílula da semana 10
    ultima_pilula2_em: '2026-09-15T11:00:31.289Z',
    colaboradores: { nome_completo: 'Amanda', cargo: 'Gestão Educacional' },
  },
  {
    colaborador_id: 'emdia', semana_atual: 10, status: 'ativo', data_inicio: INICIO,
    ultima_evidencia_em: '2026-09-14T10:00:00.000Z',
    ultima_pilula1_em: '2026-09-15T11:00:00.000Z',
    ultima_pilula2_em: null,
    colaboradores: { nome_completo: 'Bruna', cargo: 'Gestão Educacional' },
  },
];

const TRILHAS = [
  { id: 'tr-amanda', colaborador_id: 'amanda', numero_temporada: 1, temporada_plano: PLANO, data_inicio: INICIO },
  { id: 'tr-emdia', colaborador_id: 'emdia', numero_temporada: 1, temporada_plano: PLANO, data_inicio: INICIO },
];

// Amanda: 1-3 concluídas, 4 (missão) em andamento → etapa = 4, atrás da cadência.
// Bruna: 1-9 concluídas → etapa = 10, em dia com a cadência.
const PROGRESSO = [
  ...[1, 2, 3].map((semana) => ({
    trilha_id: 'tr-amanda', colaborador_id: 'amanda', semana, tipo: 'conteudo',
    status: 'concluido', conteudo_consumido: true, qualidade: 'media',
  })),
  { trilha_id: 'tr-amanda', colaborador_id: 'amanda', semana: 4, tipo: 'aplicacao', status: 'em_andamento', conteudo_consumido: null, qualidade: null },
  ...Array.from({ length: 9 }, (_, i) => ({
    trilha_id: 'tr-emdia', colaborador_id: 'emdia', semana: i + 1, tipo: 'conteudo',
    status: 'concluido', conteudo_consumido: true, qualidade: 'alta',
  })),
];

const sb = criarSupabaseMock({
  lista: (tabela, cols) => {
    if (tabela === 'fase4_envios') return ENVIOS;
    if (tabela === 'trilhas') return TRILHAS;
    if (tabela === 'temporada_semana_progresso') return cols.includes('tipo') ? PROGRESSO : [];
    return [];
  },
});

vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => sb.client }));
vi.mock('@/lib/tenant-db', () => ({ tenantDb: () => sb.client }));

import { rollUpEngajamento } from '@/lib/engajamento/roll-up';

const porNome = (r: any) => Object.fromEntries(r.colaboradores.map((c: any) => [c.nome, c]));

describe('os sinais da linha são da etapa da PESSOA', () => {
  beforeEach(() => sb.reset());

  it('a etapa individual não é o relógio da cadência', async () => {
    const p = porNome(await rollUpEngajamento('emp-1'));
    expect(p.Amanda.semanaAcessivel).toBe(4);
    expect(p.Amanda.semanaCalendario).toBe(10);
    expect(p.Amanda.jornadaAtrasada).toBe(true);
    expect(p.Bruna.semanaAcessivel).toBe(10);
  });

  it('🔴 quem está atrás da cadência não exibe a pílula de outra semana', async () => {
    const p = porNome(await rollUpEngajamento('emp-1'));
    // null = "sem registro por semana". NÃO é `true` (✓ de outra semana) nem
    // `false` (afirmar que não recebeu, o que o carimbo também não prova).
    expect(p.Amanda.recebeuP1).toBeNull();
    expect(p.Amanda.recebeuP2).toBeNull();
  });

  it('quem está na semana da cadência mantém o envio afirmado', async () => {
    const p = porNome(await rollUpEngajamento('emp-1'));
    expect(p.Bruna.recebeuP1).toBe(true);   // carimbo posterior ao último avanço
    expect(p.Bruna.recebeuP2).toBe(false);  // sem carimbo: aí dá para negar
  });

  it('🔴 evidência e qualidade também são da etapa, não do histórico', async () => {
    const p = porNome(await rollUpEngajamento('emp-1'));
    // Amanda entregou as semanas 1-3 (média), mas a etapa dela é a 4: a linha
    // não pode dizer "entregou" enquanto mostra "semana 4 pendente".
    expect(p.Amanda.enviouEvidencia).toBe(false);
    expect(p.Amanda.qualidadeEvidencia).toBeNull();
  });
});
