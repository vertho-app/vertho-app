import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseMock } from '../helpers/supabase-mock';
import { criarMockDeTabelas } from '../helpers/tabela-filtrada';

/**
 * A MESMA MATRIZ EM DOIS CARGOS DA MESMA EMPRESA (16/09/2026).
 *
 * A matriz é gravada por cargo (`competencias.cargo`). Usar a régua de professor
 * também para a auxiliar, cada uma com o seu cenário, são duas cópias com o
 * mesmo `cod_comp` no mesmo tenant — estado que nenhum tenant tinha (medido: 1
 * `cod_comp` em 2 cargos no banco inteiro, sem descritores). No primeiro que
 * tivesse, o import descartaria a cópia, a IA3 receberia 12 descritores em vez
 * de 6, a IA4 pontuaria contra régua repetida e o IA1 gravaria o id do cargo
 * errado.
 *
 * O mock responde pela TABELA filtrada de verdade (eq/in/is/not), não por "o
 * código chamou `.eq('cargo')`": esquecer o filtro devolve as linhas dos dois
 * cargos, e é isso que os testes veem. A tabela ainda tem a mesma matriz em
 * OUTRA empresa, para o escopo de tenant contar junto.
 */

let sb: SupabaseMock;
let tabelas: Record<string, any[]> = {};
const prompts: string[] = [];

vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => sb.client }));
vi.mock('@/lib/admin-supabase', () => ({
  requireEmpresaSupabase: vi.fn(async () => sb.client),
  requireAdminSupabase: vi.fn(async () => sb.client),
}));
vi.mock('@/lib/auth/action-context', () => ({
  requireAdminAction: vi.fn(async () => ({ email: 'admin@vertho.ai' })),
  requireUserAction: vi.fn(),
  requirePermissionAction: vi.fn(),
  assertTenantAccessAction: vi.fn(),
  getAuthenticatedEmailFromAction: vi.fn(async () => 'admin@vertho.ai'),
}));
vi.mock('@/lib/audit', () => ({ logAdminAction: vi.fn(async () => {}) }));
vi.mock('@/actions/ai-client', () => ({
  // Guarda o prompt e devolve lixo: o que se mede aqui é o que ENTROU no modelo.
  callAI: vi.fn(async (_system: string, user: string) => { prompts.push(user); return 'não é json'; }),
  callAIChat: vi.fn(async () => ''),
}));
vi.mock('@/lib/ia2-gabarito', () => ({
  buscarContextoPPP: vi.fn(async () => ''),
  buscarValores: vi.fn(async () => []),
  buscarValoresDaRede: vi.fn(async () => []),
}));
vi.mock('@/lib/ai-tasks', () => ({
  getModelForTask: vi.fn(async () => 'claude-sonnet-5'),
  DEFAULT_TASK_MODELS: {},
}));

import { tenantDb } from '@/lib/tenant-db';
import { buscarDescritoresDaCompetencia, casarSelecaoIA1, chaveDaLinhaDaMatriz } from '@/lib/matriz-por-cargo';
import { montarContextoIA3, montarCheckIA3Prompt } from '@/lib/ia3-cenarios';
import { carregarContextoRespostaIA4 } from '@/lib/ia4-avaliacao';
import { reavaliarRespostaCore } from '@/lib/ia4-reavaliacao';
import { montarCheckIA4Prompt } from '@/lib/check-ia4-core';
import { importarCompetenciasCSV } from '@/app/admin/competencias/actions';
import { iniciarReavaliacaoLote } from '@/actions/fase5/reavaliacao';
import { checkCenarioBUm } from '@/actions/fase5/cenarios-b';

const EMP = 'emp-A';
const OUTRA = 'emp-B';
const PROF = 'Professor(a) de Educação Infantil';
const AUX = 'Auxiliar de Desenvolvimento Infantil';

/** Linha-competência + 6 descritores. O `nome_curto` carrega o cargo, para o vazamento aparecer no texto. */
function matriz(empresa_id: string, cargo: string, prefixo: string) {
  const linhas: any[] = [{ id: `${prefixo}-comp`, empresa_id, cargo, cod_comp: 'TCH12', nome: 'Autocuidado', pilar: 'P', descricao: 'Desc', cod_desc: null, nome_curto: null }];
  for (let i = 1; i <= 6; i++) {
    linhas.push({
      id: `${prefixo}-d${i}`, empresa_id, cargo, cod_comp: 'TCH12', nome: 'Autocuidado', pilar: 'P', descricao: 'Desc',
      cod_desc: `TCH12_D${i}`, nome_curto: `Descritor ${i} [${cargo}]`, descritor_completo: '',
      n1_gap: 'n1', n2_desenvolvimento: 'n2', n3_meta: 'n3', n4_referencia: 'n4',
    });
  }
  return linhas;
}

// Filtra e projeta colunas como o PostgREST (tests/helpers/tabela-filtrada).
const novoMock = () => criarMockDeTabelas(() => tabelas);

beforeEach(() => {
  // Professor primeiro: um `find` sem cargo pega a linha dele quando se pede a auxiliar.
  tabelas = {
    competencias: [...matriz(EMP, PROF, 'p'), ...matriz(EMP, AUX, 'a'), ...matriz(OUTRA, AUX, 'o')],
    empresas: [{ id: EMP, nome: 'Escola', segmento: 'Educação' }],
    cargos_empresa: [],
  };
  prompts.length = 0;
  sb = novoMock();
});

const soDoCargo = (texto: string) => {
  expect(texto).toContain(`Descritor 6 [${AUX}]`);
  expect(texto).not.toContain(`[${PROF}]`);
  expect(texto.split(`Descritor 1 [${AUX}]`).length - 1).toBe(1);   // nem repetido da outra empresa
};

describe('buscarDescritoresDaCompetencia', () => {
  it('com a mesma matriz em 2 cargos (e em outra empresa), devolve só a régua do cargo da competência', async () => {
    const descs = await buscarDescritoresDaCompetencia(tenantDb(EMP), { cod_comp: 'TCH12', cargo: AUX }, 'cod_desc, nome_curto');
    expect(descs).toHaveLength(6);
    expect(descs.every((d) => d.nome_curto.includes(AUX))).toBe(true);
  });

  it('competência com cargo NULL lê as irmãs sem cargo, não as de cargo nenhum', async () => {
    tabelas.competencias.push(
      { id: 'x1', empresa_id: EMP, cargo: null, cod_comp: 'X01', cod_desc: 'X01_D1', nome_curto: 'sem cargo' },
      { id: 'x2', empresa_id: EMP, cargo: 'Outro', cod_comp: 'X01', cod_desc: 'X01_D1', nome_curto: 'de outro cargo' },
    );
    const descs = await buscarDescritoresDaCompetencia(tenantDb(EMP), { cod_comp: 'X01', cargo: null }, 'nome_curto');
    expect(descs.map((d) => d.nome_curto)).toEqual(['sem cargo']);
  });

  it('coluna cargo AUSENTE na linha (select esqueceu) é erro, não "sem cargo"', async () => {
    await expect(buscarDescritoresDaCompetencia(tenantDb(EMP), { cod_comp: 'TCH12' }, 'nome_curto'))
      .rejects.toThrow(/sem a coluna "cargo"/);
  });

  it('sem cod_comp não consulta nada', async () => {
    expect(await buscarDescritoresDaCompetencia(tenantDb(EMP), { cod_comp: null, cargo: AUX }, 'nome_curto')).toEqual([]);
    expect(sb.chamadas).toHaveLength(0);
  });

  it('erro de leitura LANÇA — régua vazia viraria avaliação sem régua', async () => {
    sb.falharEm({ tabela: 'competencias', op: 'select', mensagem: 'timeout no pool' });
    await expect(buscarDescritoresDaCompetencia(tenantDb(EMP), { cod_comp: 'TCH12', cargo: AUX }, 'nome_curto'))
      .rejects.toThrow(/TCH12 \(Auxiliar de Desenvolvimento Infantil\): timeout no pool/);
  });
});

describe('chaveDaLinhaDaMatriz', () => {
  it('mesma competência e descritor em outro cargo NÃO é repetida', () => {
    const linha = { cod_comp: 'TCH12', cod_desc: 'TCH12_D1', nome: 'Autocuidado' };
    expect(chaveDaLinhaDaMatriz({ ...linha, cargo: PROF })).not.toBe(chaveDaLinhaDaMatriz({ ...linha, cargo: AUX }));
  });

  it('maiúscula e espaço nas pontas não criam duplicata', () => {
    expect(chaveDaLinhaDaMatriz({ cargo: ` ${AUX.toUpperCase()} `, cod_comp: 'tch12 ', cod_desc: 'TCH12_D1' }))
      .toBe(chaveDaLinhaDaMatriz({ cargo: AUX, cod_comp: 'TCH12', cod_desc: 'tch12_d1' }));
  });
});

describe('casarSelecaoIA1', () => {
  it('casa por código só entre as linhas do cargo — a do professor vem antes na lista', () => {
    const m = casarSelecaoIA1(tabelas.competencias, AUX, { id: 'TCH12' }, new Set());
    expect(m?.cargo).toBe(AUX);
  });

  it('o fallback por NOME também fica no cargo', () => {
    const m = casarSelecaoIA1(tabelas.competencias, AUX, { nome: 'autocuidado' }, new Set());
    expect(m?.cargo).toBe(AUX);
  });

  it('esgotadas as linhas do cargo, não pula para o outro cargo', () => {
    const usados = new Set(tabelas.competencias.filter((c) => c.cargo === AUX).map((c) => c.id));
    expect(casarSelecaoIA1(tabelas.competencias, AUX, { id: 'TCH12', nome: 'Autocuidado' }, usados)).toBeUndefined();
  });

  it('linha de nome vazio não casa com qualquer seleção', () => {
    const linhas = [{ id: 'v', cargo: AUX, cod_comp: null, nome: '' }];
    expect(casarSelecaoIA1(linhas, AUX, { nome: 'liderança' }, new Set())).toBeUndefined();
  });
});

describe('importarCompetenciasCSV', () => {
  const csv = (cargo: string) => matriz(EMP, cargo, 'csv').map(({ id: _id, empresa_id: _e, ...l }) => l);

  it('a mesma matriz para o 2º cargo ENTRA; reimportar o 1º continua deduplicando', async () => {
    tabelas.competencias = matriz(EMP, PROF, 'p');

    const r = await importarCompetenciasCSV(EMP, csv(AUX));
    expect(r).toEqual({ success: true, message: '7 competências importadas' });
    const insert = sb.escritas.find((e) => e.tabela === 'competencias' && e.op === 'insert')!;
    expect(insert.payload).toHaveLength(7);
    expect(insert.payload.every((l: any) => l.cargo === AUX)).toBe(true);

    sb.reset();
    expect(await importarCompetenciasCSV(EMP, csv(PROF))).toEqual({ success: true, message: '0 novas (todas já existiam)' });
    expect(sb.escritas).toHaveLength(0);
  });
});

describe('quem monta régua para a IA lê a matriz do cargo da competência', () => {
  it('montarContextoIA3 (geração do cenário): 6 descritores, não 12', async () => {
    const mc = await montarContextoIA3(sb.client, EMP, AUX, 'a-d1', null);
    if (!('ctx' in mc)) throw new Error(mc.error);
    expect(mc.ctx.descritores).toHaveLength(6);
    soDoCargo(mc.ctx.descritores.map((d: any) => d.nome_curto).join('\n'));
  });

  it('montarContextoIA3 devolve erro legível quando a leitura dos DESCRITORES falha (não régua vazia)', async () => {
    // 1ª leitura de `competencias` = a competência por id; a 2ª = os descritores.
    let leituras = 0;
    sb.falharEm({ tabela: 'competencias', op: 'select', mensagem: 'timeout no pool', quando: () => ++leituras === 2 });
    const mc = await montarContextoIA3(sb.client, EMP, AUX, 'a-d1', null);
    expect(mc).toEqual({ ok: false, error: `Descritores de TCH12 (${AUX}): timeout no pool` });
  });

  it('montarCheckIA3Prompt (auditoria do cenário)', async () => {
    const { user } = await montarCheckIA3Prompt(sb.client, {
      empresa_id: EMP, competencia_id: 'a-d1', cargo: AUX, titulo: 'T', descricao: 'D', alternativas: { perguntas: [] },
    });
    soDoCargo(user);
    expect(user).not.toContain('D7:');
  });

  it('carregarContextoRespostaIA4 (avaliação da resposta)', async () => {
    const ctx = await carregarContextoRespostaIA4(tenantDb(EMP), sb.client, { competencia_id: 'a-d1', cenario_id: null });
    expect(ctx.descsOficiais).toHaveLength(6);
    soDoCargo(ctx.descritoresTexto);
  });

  it('montarCheckIA4Prompt (auditoria da avaliação) — escopo de empresa incluído', async () => {
    tabelas.colaboradores = [{ id: 'c1', empresa_id: EMP, nome_completo: 'Ana', cargo: AUX }];
    const { prefix, user } = await montarCheckIA4Prompt(sb.client, {
      colaborador_id: 'c1', competencia_id: 'a-d1', cenario_id: null, avaliacao_ia: { consolidacao: {} },
    }, EMP);
    soDoCargo(`${prefix}\n${user}`);
  });

  it('reavaliarRespostaCore (revisão da avaliação)', async () => {
    tabelas.respostas = [{ id: 'r1', empresa_id: EMP, colaborador_id: 'c1', competencia_id: 'a-d1', cenario_id: null, avaliacao_ia: null, payload_ia4: null }];
    tabelas.colaboradores = [{ id: 'c1', empresa_id: EMP, nome_completo: 'Ana', cargo: AUX }];
    await reavaliarRespostaCore(sb.client, 'r1');
    expect(prompts.length).toBeGreaterThan(0);
    soDoCargo(prompts[0]);
  });

  it('checkCenarioBUm (auditoria do cenário B)', async () => {
    tabelas.banco_cenarios = [{ id: 'cb1', empresa_id: EMP, competencia_id: 'a-d1', cargo: AUX, titulo: 'B', descricao: 'D', alternativas: { perguntas: [] }, tipo_cenario: 'cenario_b' }];
    await checkCenarioBUm('cb1', 'claude-sonnet-5');
    expect(prompts.length).toBeGreaterThan(0);
    soDoCargo(prompts[0]);
  });

  it('iniciarReavaliacaoLote grava na sessão a régua do cargo, agrupada por cod_comp E cargo', async () => {
    tabelas.colaboradores = [{ id: 'c1', empresa_id: EMP, nome_completo: 'Ana', cargo: AUX }];
    tabelas.banco_cenarios = [{ id: 'cb1', empresa_id: EMP, competencia_id: 'a-comp', cargo: AUX, tipo_cenario: 'cenario_b' }];
    tabelas.respostas = [{ empresa_id: EMP, colaborador_id: 'c1', competencia_id: 'a-comp', nivel_ia4: 2, avaliacao_ia: {} }];

    const r = await iniciarReavaliacaoLote(EMP);
    expect(r).toMatchObject({ success: true });
    const sessao = sb.escritas.find((e) => e.tabela === 'reavaliacao_sessoes' && e.op === 'insert')!;
    const descritores = sessao.payload.extracao_qualitativa._contexto_sessao.descritores;
    expect(descritores).toHaveLength(6);
    soDoCargo(descritores.map((d: any) => d.nome).join('\n'));
  });
});
