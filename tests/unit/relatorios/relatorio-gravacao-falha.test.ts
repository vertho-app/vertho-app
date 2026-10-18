import { beforeEach, describe, expect, it, vi } from 'vitest';
import { criarSupabaseMock } from '../../helpers/supabase-mock';

/**
 * 13/10/2026: a geração dos relatórios de Gestor e RH não olhava o `error` da GRAVAÇÃO. A IA era paga, o relatório
 * se perdia e a tela da operação dizia "gerado" (Gestor: `ok: true`; RH: "Relatório RH gerado").
 *
 * O caso que aparece na 4Life: os gestores não têm cadastro no tenant, então `colaborador_id` é NULL e a coluna
 * gerada `colab_key` vira o mesmo UUID para todos. O 2º gestor bate em `uq_relatorios_agregado`, que não é o alvo
 * do `onConflict`, e o Postgres devolve 23505. Agora a falha aparece em `erro` (Gestor) e em `success: false` (RH).
 */

vi.mock('server-only', () => ({}));
vi.mock('@/actions/ai-client', () => ({ callAI: vi.fn(async () => '{}') }));
vi.mock('@/actions/utils', () => ({ extractJSON: async (t: string) => JSON.parse(t) }));
vi.mock('@/lib/rag', () => ({ retrieveContext: vi.fn(async () => []), formatGroundingBlock: () => '' }));
vi.mock('@react-pdf/renderer', async (original) => ({ ...(await original<any>()), renderToBuffer: vi.fn(async () => Buffer.from('%PDF')) }));

const EMPRESA = 'emp-grav-falha';
let rhExistente: { id: string; gestor_email?: string } | null = null;

const COLABS_GESTOR = [
  { id: 'c1', nome_completo: 'Caio', email: 'caio@x.test', cargo: 'Professor', gestor_email: 'externo@x.test', gestor_nome: 'Externo', role: 'colaborador', perfil_dominante: 'Alto C' },
];
const COLAB_RH = { id: 'a1', nome_completo: 'Ana', email: 'ana@x.test', cargo: 'Professor', perfil_dominante: 'Alto D' };

const sb = criarSupabaseMock({
  resolver: (tabela) => {
    if (tabela === 'empresas') return { nome: 'Empresa', segmento: 'educacao', default_locale: 'pt-BR' };
    if (tabela === 'relatorios') return rhExistente;
    return null;
  },
  lista: (tabela, cols) => {
    if (tabela === 'colaboradores') {
      if (cols.includes('gestor_email')) return COLABS_GESTOR; // leitura do Gestor
      if (cols === 'id') return [];                          // RH: ninguém é interno (@vertho.ai)
      return [COLAB_RH];                                     // RH: dados dos avaliados
    }
    if (tabela === 'respostas') return [{ colaborador_id: 'a1', competencia_id: 'k1', avaliacao_ia: { consolidacao: { nivel_geral: 2 } }, nivel_ia4: 2, nota_ia4: 5 }];
    if (tabela === 'competencias') return [{ id: 'k1', nome: 'Comunicação' }];
    return [];
  },
});
vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => sb.client }));

import { gerarRelatorioGestorCore, gerarRelatorioRHCore } from '@/lib/relatorios/gestor-rh-core';

const DUPLICADA = 'duplicate key value violates unique constraint "uq_relatorios_agregado"';

describe('relatório do gestor: gravação que falhou não é "ok"', () => {
  beforeEach(() => { sb.reset(); rhExistente = null; });

  it('controle: gravando bem, o gestor sai como gerado', async () => {
    const r: any = await gerarRelatorioGestorCore(sb.client as any, EMPRESA, {});
    expect(r.success).toBe(true);
    expect(r.detalhes).toHaveLength(1); // sem isto o teste abaixo passaria olhando um array vazio
    expect(r.detalhes[0].ok).toBe(true);
    expect(r.detalhes[0].erro).toBeUndefined();
  });

  it('🔴 gravação recusada (23505): o gestor sai com `erro`, sem `ok`, e a mensagem conta o erro', async () => {
    sb.falharEm({ tabela: 'relatorios', op: 'insert', mensagem: DUPLICADA });
    const r: any = await gerarRelatorioGestorCore(sb.client as any, EMPRESA, {});
    expect(r.detalhes).toHaveLength(1);
    expect(r.detalhes[0].ok).toBeUndefined();
    expect(r.detalhes[0].erro).toContain('não gravado');
    expect(r.detalhes[0].erro).toContain('uq_relatorios_agregado');
    expect(r.message).toMatch(/^0 relatórios de gestor gerados · 1 erros$/);
  });
});

describe('relatório do RH: gravação que falhou não é "Relatório RH gerado"', () => {
  beforeEach(() => { sb.reset(); rhExistente = null; });

  it('controle: gravando bem (insert), devolve sucesso', async () => {
    const r: any = await gerarRelatorioRHCore(sb.client as any, EMPRESA, {});
    expect(r.success).toBe(true);
    expect(sb.escritas.some((e) => e.tabela === 'relatorios' && e.op === 'insert')).toBe(true); // o caminho exercitado existe
  });

  it('🔴 insert recusado: `success: false`, com o motivo', async () => {
    sb.falharEm({ tabela: 'relatorios', op: 'insert', mensagem: DUPLICADA });
    const r: any = await gerarRelatorioRHCore(sb.client as any, EMPRESA, {});
    expect(r.success).toBe(false);
    expect(r.error).toContain('não gravado');
    expect(r.error).toContain('uq_relatorios_agregado');
  });

  it('🔴 update recusado (já existia um RH): `success: false`, com o motivo', async () => {
    rhExistente = { id: 'rh-antigo' };
    sb.falharEm({ tabela: 'relatorios', op: 'update', mensagem: 'permission denied for table relatorios' });
    const r: any = await gerarRelatorioRHCore(sb.client as any, EMPRESA, {});
    expect(r.success).toBe(false);
    expect(r.error).toContain('não gravado');
    expect(r.error).toContain('permission denied');
  });
});

// 17/10/2026, 4Life: o gestor SEM cadastro (`colaborador_id` NULL) gerava na 1ª vez e não regerava mais: o upsert com
// `onConflict: empresa_id,colaborador_id,tipo` nunca casa NULL, virava INSERT e batia em `uq_relatorios_agregado`.
describe('relatório do gestor sem cadastro no tenant', () => {
  beforeEach(() => { sb.reset(); rhExistente = null; });

  it('1ª geração: insere (não upsert)', async () => {
    const r: any = await gerarRelatorioGestorCore(sb.client as any, EMPRESA, {});
    expect(r.detalhes[0].ok).toBe(true);
    const gravacoes = sb.escritas.filter((e) => e.tabela === 'relatorios');
    expect(gravacoes.map((e) => e.op)).toEqual(['insert']);
    expect(gravacoes[0].payload).toMatchObject({ colaborador_id: null, tipo: 'gestor' });
  });

  it('regerar o MESMO gestor atualiza o relatório dele (é o que quebrava)', async () => {
    rhExistente = { id: 'g1', gestor_email: 'Externo@x.test' };
    const r: any = await gerarRelatorioGestorCore(sb.client as any, EMPRESA, {});
    expect(r.detalhes[0].ok).toBe(true);
    expect(sb.escritas.filter((e) => e.tabela === 'relatorios').map((e) => e.op)).toEqual(['update']);
  });

  it('outro gestor sem cadastro já na vaga: erro explícito e NADA gravado (não sobrescreve o relatório dele)', async () => {
    rhExistente = { id: 'g1', gestor_email: 'outro@x.test' };
    const r: any = await gerarRelatorioGestorCore(sb.client as any, EMPRESA, {});
    expect(r.detalhes[0].ok).toBeUndefined();
    expect(r.detalhes[0].erro).toMatch(/outro gestor sem cadastro \(outro@x\.test\)/);
    expect(sb.escritas.filter((e) => e.tabela === 'relatorios')).toEqual([]);
  });
});
