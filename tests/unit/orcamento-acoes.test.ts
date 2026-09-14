/**
 * As quatro actions de "orçamentos salvos" (actions/orcamento/cenarios.ts).
 *
 * O que se prova aqui:
 *
 *  · O GATE é de plataforma, com a permissão certa em cada lado — `manage` na
 *    escrita, `view` na leitura. `requirePlataformaSupabase` exige
 *    `isPlatformAdmin`, e é essa a postura decidida na Sprint 2 (24/08) para
 *    recurso que não é de tenant nenhum: gatar só por permissão deixava o RH de
 *    qualquer cliente operar uma linha que serve a todos.
 *  · Entrada inválida NÃO escreve e NÃO audita. Auditoria de escrita que não
 *    aconteceu é pior que auditoria nenhuma: o log passa a mentir.
 *  · Todo `error` do supabase-js é checado e vira `{success:false}` — ele RETORNA
 *    o erro, não lança.
 *  · A listagem pede ordenação explícita: sem `.order()`, "mais recentes
 *    primeiro" é o que o Postgres quiser devolver naquele dia.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { criarSupabaseMock, type SupabaseMock } from '../helpers/supabase-mock';

const TABELA = 'orcamento_cenarios';
const ADMIN = 'rodrigo@vertho.ai';

let sb: SupabaseMock = criarSupabaseMock();
const gate = vi.fn(async (..._args: any[]) => sb.client);
const emailSessao = vi.fn(async () => ADMIN as string | null);
const auditoria = vi.fn(async (..._args: any[]) => {});

vi.mock('@/lib/admin-supabase', () => ({
  requirePlataformaSupabase: (...args: any[]) => gate(...(args as [])),
  requireAdminSupabase: vi.fn(),
}));
vi.mock('@/lib/auth/action-context', () => ({
  getAuthenticatedEmailFromAction: () => emailSessao(),
}));
vi.mock('@/lib/audit', () => ({
  logAdminAction: (...args: any[]) => auditoria(...(args as [])),
}));

import {
  carregarOrcamento,
  excluirOrcamento,
  listarOrcamentos,
  salvarOrcamento,
} from '@/actions/orcamento/cenarios';

const ENTRADAS = {
  nClusters: 1, nPerfis: 3, nColabs: 100, matrizNovas: 3, ciclosPorAno: 1,
  metodo: 'votacao', tipoComissao: 'rc', preset: 'atual', jornada: 'jornada',
  conteudoColab: { video: 12, podcast: 12, texto: 12, case: 12 },
  nVideosExtraidos: 0, auditarExtracao: true, comAvatar: true,
  pricing: { cotacao: 5.12, precoSetupGeral: 2000, clientesAtivos: 2 },
};

const RESULTADO = {
  valorTabela: 32000, valorFinal: 32000, desconto: 0, parcela: 16000, parcelas: 2,
  margemAbs: 9000, margemPct: 28.1, descontoMaxPct: 11, acimaDoPiso: true,
  custoTotalBrl: 23000, custoOperacionalBrl: 18000, custoIABrl: 4200,
  investimentoPorPessoaBrl: 320, custoPorPessoaBrl: 230, mesesPrograma: 2, ciclos: 1,
  pessoas: 100, unidades: 1, cargos: 3, jornada: 'jornada',
  piorSaldo: { mes: 1, saldo: -7000 },
};

/** Cenário válido mínimo para os testes de escrita. */
function payloadValido(extra: Record<string, any> = {}) {
  return { nome: 'Rede X · 100 pessoas', cliente: 'Rede X', entradas: ENTRADAS, resultado: RESULTADO, ...extra };
}

/** Mock com a linha que as leituras de existência encontram. */
function mockComLinha(linha: any = { id: 'orc-1', nome: 'Rede X · 100 pessoas' }) {
  return criarSupabaseMock({
    resolver: (tabela) => (tabela === TABELA ? linha : null),
    lista: (tabela) => (tabela === TABELA
      ? [{
          id: 'orc-1', nome: 'Rede X · 100 pessoas', cliente: 'Rede X',
          resultado: RESULTADO, criado_por: ADMIN, atualizado_por: null,
          created_at: '2026-09-14T10:00:00Z', updated_at: '2026-09-14T10:00:00Z',
        }]
      : []),
  });
}

const escritasNaTabela = () => sb.escritas.filter((e) => e.tabela === TABELA);
const payloadGravado = (op: string) => escritasNaTabela().find((e) => e.op === op)?.payload;

beforeEach(() => {
  sb = mockComLinha();
  gate.mockClear();
  auditoria.mockClear();
  emailSessao.mockClear();
  emailSessao.mockImplementation(async () => ADMIN);
});

describe('gate de plataforma', () => {
  it('escrita exige sales_channel.manage', async () => {
    await salvarOrcamento(payloadValido() as any);
    expect(gate).toHaveBeenCalledWith('sales_channel.manage');
  });

  it('leitura exige sales_channel.view (sócio enxerga, mas não escreve)', async () => {
    await listarOrcamentos();
    expect(gate).toHaveBeenCalledWith('sales_channel.view');

    gate.mockClear();
    await carregarOrcamento('orc-1');
    expect(gate).toHaveBeenCalledWith('sales_channel.view');
  });

  it('exclusão exige sales_channel.manage', async () => {
    await excluirOrcamento('orc-1');
    expect(gate).toHaveBeenCalledWith('sales_channel.manage');
  });

  it('gate que lança impede a escrita (o gate vem ANTES do banco)', async () => {
    gate.mockRejectedValueOnce(new Error('FORBIDDEN: apenas platform admin'));
    await expect(salvarOrcamento(payloadValido() as any)).rejects.toThrow(/FORBIDDEN/);
    expect(escritasNaTabela()).toHaveLength(0);
    expect(auditoria).not.toHaveBeenCalled();
  });

  it('sessão expirada não escreve nem audita', async () => {
    emailSessao.mockImplementation(async () => null);
    const r: any = await salvarOrcamento(payloadValido() as any);
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/Sessão expirada/);
    expect(escritasNaTabela()).toHaveLength(0);
    expect(auditoria).not.toHaveBeenCalled();
  });
});

describe('salvarOrcamento — criação', () => {
  it('grava nome, cliente, entradas, resultado e a autoria; audita', async () => {
    const r: any = await salvarOrcamento(payloadValido() as any);
    expect(r.success).toBe(true);

    const gravado = payloadGravado('insert');
    expect(gravado).toMatchObject({
      nome: 'Rede X · 100 pessoas',
      cliente: 'Rede X',
      entradas: ENTRADAS,
      criado_por: ADMIN,
    });
    // O resultado vai NORMALIZADO, não o jsonb que o cliente mandou.
    expect(gravado.resultado.valorFinal).toBe(32000);
    expect(gravado.resultado.piorSaldo).toEqual({ mes: 1, saldo: -7000 });

    expect(auditoria).toHaveBeenCalledTimes(1);
    expect(auditoria.mock.calls[0][0]).toMatchObject({
      adminEmail: ADMIN, acao: 'orcamento.salvar', alvo: 'Rede X · 100 pessoas',
    });
  });

  it('sem nome não grava nada nem audita', async () => {
    const r: any = await salvarOrcamento(payloadValido({ nome: '   ' }) as any);
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/nome/i);
    expect(escritasNaTabela()).toHaveLength(0);
    expect(auditoria).not.toHaveBeenCalled();
  });

  it('cliente vazio vai como null, e nome é aparado', async () => {
    await salvarOrcamento(payloadValido({ nome: '  Cenário  ', cliente: '' }) as any);
    expect(payloadGravado('insert')).toMatchObject({ nome: 'Cenário', cliente: null });
  });

  it('entradas que não são objeto são recusadas (jsonb tem CHECK de objeto no banco)', async () => {
    for (const entradas of [null, 'texto', 42, ['lista']]) {
      sb = mockComLinha();
      const r: any = await salvarOrcamento(payloadValido({ entradas }) as any);
      expect(r.success).toBe(false);
      expect(escritasNaTabela()).toHaveLength(0);
    }
  });

  it('payload acima do teto é recusado — jsonb livre sem limite vira linha gigante', async () => {
    const r: any = await salvarOrcamento(
      payloadValido({ entradas: { ...ENTRADAS, lixo: 'a'.repeat(40_000) } }) as any,
    );
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/grande demais/);
    expect(escritasNaTabela()).toHaveLength(0);
  });

  it('erro do banco vira {success:false} com a mensagem — não lança, não finge sucesso', async () => {
    sb.falharEm({ tabela: TABELA, op: 'insert', mensagem: 'violates check constraint' });
    const r: any = await salvarOrcamento(payloadValido() as any);
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/check constraint/);
    expect(auditoria).not.toHaveBeenCalled();
  });
});

describe('salvarOrcamento — atualização', () => {
  it('com id, sobrescreve e carimba quem atualizou', async () => {
    const r: any = await salvarOrcamento(payloadValido({ id: 'orc-1', nome: 'Versão 2' }) as any);
    expect(r.success).toBe(true);
    expect(r.data).toBe('orc-1');

    const gravado = payloadGravado('update');
    expect(gravado).toMatchObject({ nome: 'Versão 2', atualizado_por: ADMIN });
    expect(gravado.updated_at).toBeTruthy();
    // Não vira INSERT: sobrescrever é o comportamento de quem já tem o cenário aberto.
    expect(payloadGravado('insert')).toBeUndefined();
    expect(auditoria.mock.calls[0][0].acao).toBe('orcamento.atualizar');
  });

  it('id inexistente NÃO vira sucesso silencioso (update afeta 0 linhas e volta error:null)', async () => {
    sb = mockComLinha(null);
    const r: any = await salvarOrcamento(payloadValido({ id: 'orc-que-ja-era' }) as any);
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/não encontrado/i);
    expect(escritasNaTabela().filter((e) => e.op === 'update')).toHaveLength(0);
    expect(auditoria).not.toHaveBeenCalled();
  });

  it('falha na leitura de existência não vira escrita', async () => {
    sb.falharEm({ tabela: TABELA, op: 'select', mensagem: 'timeout no pool' });
    const r: any = await salvarOrcamento(payloadValido({ id: 'orc-1' }) as any);
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/timeout/);
    expect(escritasNaTabela().filter((e) => e.op === 'update')).toHaveLength(0);
  });
});

describe('listarOrcamentos', () => {
  it('ordena por recência e limita — sem order, "mais recentes" é o que o Postgres quiser', async () => {
    const r: any = await listarOrcamentos();
    expect(r.success).toBe(true);
    expect(sb.usou(TABELA, 'order', 'created_at')).toBe(true);
    expect(sb.usou(TABELA, 'limit')).toBe(true);
  });

  it('devolve o resumo normalizado e não o jsonb cru', async () => {
    const r: any = await listarOrcamentos();
    expect(r.data).toHaveLength(1);
    expect(r.data[0]).toMatchObject({
      id: 'orc-1', nome: 'Rede X · 100 pessoas', cliente: 'Rede X', criadoPor: ADMIN,
    });
    expect(r.data[0].resultado.valorFinal).toBe(32000);
    expect(r.data[0].resultado.parcelas).toBe(2);
  });

  it('linha com resumo corrompido continua listável, com resultado null', async () => {
    sb = criarSupabaseMock({
      lista: () => [{ id: 'orc-2', nome: 'Sem resumo', resultado: 'quebrado', criado_por: ADMIN }],
    });
    const r: any = await listarOrcamentos();
    expect(r.success).toBe(true);
    expect(r.data[0].resultado).toBeNull();
    expect(r.data[0].nome).toBe('Sem resumo');
  });

  it('erro do banco vira {success:false}', async () => {
    sb.falharEm({ tabela: TABELA, op: 'select', mensagem: 'relation does not exist' });
    const r: any = await listarOrcamentos();
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/relation does not exist/);
  });
});

describe('carregarOrcamento', () => {
  it('devolve as entradas cruas para a TELA normalizar (as listas de preset/jornada são dela)', async () => {
    sb = criarSupabaseMock({
      resolver: () => ({ id: 'orc-1', nome: 'Rede X', cliente: 'Rede X', entradas: ENTRADAS, resultado: RESULTADO }),
    });
    const r: any = await carregarOrcamento('orc-1');
    expect(r.success).toBe(true);
    expect(r.data.entradas).toEqual(ENTRADAS);
    expect(r.data.resultado.valorFinal).toBe(32000);
  });

  it('id vazio é recusado sem ir ao banco', async () => {
    const r: any = await carregarOrcamento('');
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/Id obrigatório/);
    expect(sb.chamadas).toHaveLength(0);
  });

  it('cenário inexistente volta como erro nomeado', async () => {
    sb = criarSupabaseMock({ resolver: () => null });
    const r: any = await carregarOrcamento('orc-fantasma');
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/não encontrado/i);
  });
});

describe('excluirOrcamento', () => {
  it('apaga e audita com o nome do cenário', async () => {
    const r: any = await excluirOrcamento('orc-1');
    expect(r.success).toBe(true);
    expect(escritasNaTabela().some((e) => e.op === 'delete')).toBe(true);
    expect(auditoria).toHaveBeenCalledTimes(1);
    expect(auditoria.mock.calls[0][0]).toMatchObject({
      adminEmail: ADMIN, acao: 'orcamento.excluir', alvo: 'Rede X · 100 pessoas',
    });
  });

  it('id inexistente não finge que excluiu', async () => {
    sb = mockComLinha(null);
    const r: any = await excluirOrcamento('orc-fantasma');
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/não encontrado/i);
    expect(escritasNaTabela().filter((e) => e.op === 'delete')).toHaveLength(0);
    expect(auditoria).not.toHaveBeenCalled();
  });

  it('erro no delete vira {success:false} e não audita exclusão que não houve', async () => {
    sb.falharEm({ tabela: TABELA, op: 'delete', mensagem: 'permission denied' });
    const r: any = await excluirOrcamento('orc-1');
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/permission denied/);
    expect(auditoria).not.toHaveBeenCalled();
  });
});

describe('a migration que cria a tabela', () => {
  it('existe, é idempotente e tranca o acesso direto por chave anon', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const sql = readFileSync(join(process.cwd(), 'migrations', '253-orcamento-cenarios.sql'), 'utf8');

    expect(sql).toContain('CREATE TABLE IF NOT EXISTS orcamento_cenarios');
    // Entradas e resultado são os dois lados do cenário: um reproduz, o outro congela.
    expect(sql).toMatch(/entradas\s+jsonb NOT NULL CHECK \(jsonb_typeof\(entradas\) = 'object'\)/);
    expect(sql).toMatch(/resultado\s+jsonb NOT NULL CHECK \(jsonb_typeof\(resultado\) = 'object'\)/);
    expect(sql).toContain('ENABLE ROW LEVEL SECURITY');
    expect(sql).toContain('REVOKE ALL ON orcamento_cenarios FROM anon');
    expect(sql).toContain('REVOKE ALL ON orcamento_cenarios FROM authenticated');
    expect(sql).toMatch(/USING \(false\)/);
    // Sem isto o PostgREST não enxerga a tabela nova.
    expect(sql).toContain("NOTIFY pgrst, 'reload schema'");
  });
});
