import { beforeEach, describe, expect, it, vi } from 'vitest';
import { criarSupabaseMock, type Chamada } from '../helpers/supabase-mock';

/**
 * Lote 5b (04/10/2026): o Ranking de Adequação do RH não lista, não lê e não exporta
 * as VAGAS da Seleção enquanto a Seleção estiver off-line.
 *
 * Antes: `listarCargosComRanking` passava `incluirVagas = true` fixo, e a tela do
 * produto "Ranking de Adequação" mostrava cargos de um bloco que saiu do ar em
 * 31/08/2026 (hoje 2 vagas, as duas em projetomacae). Como o arquivo é `'use server'`
 * (todo export é endpoint), esconder só a lista deixaria `getRankingAdequacao(vaga)`
 * e `exportarRankingPDF(vaga)` servindo o ranking nominal por nome de cargo.
 *
 * A regra é a do registro (`blocoEstaOffline('selecao')`), não um `false` fixo: religar
 * a Seleção devolve as vagas. Nenhum dado é apagado.
 */
const estado = vi.hoisted(() => ({
  selecaoOffline: true,
  cargos: [] as Array<{ nome: string; eh_vaga: boolean; gabarito: any }>,
  arquivos: {} as Record<string, string[]>,
  conteudo: {} as Record<string, string>,
  ctx: null as any,
}));

vi.mock('@/lib/blocos-offline', async (original) => ({
  ...(await original<any>()),
  blocoEstaOffline: (bloco: string) => (bloco === 'selecao' ? estado.selecaoOffline : false),
}));

const EMP = '11111111-1111-4111-8111-111111111111';
const ANALISTA = { nome: 'Analista de Treinamento', eh_vaga: true, gabarito: { tela4: {} } };
const COORDENADOR_TI = { nome: 'Coordenador de TI', eh_vaga: true, gabarito: { tela4: {} } };
const PROFESSOR = { nome: 'Professor', eh_vaga: false, gabarito: { tela4: {} } };

/** Aplica os `.eq()` da cadeia às linhas, como o banco faria (o mock não filtra sozinho). */
function filtrar(rows: any[], cadeia: Chamada[]) {
  let saida = rows;
  for (const elo of cadeia) {
    if (elo.metodo !== 'eq') continue;
    const [coluna, valor] = elo.args;
    if (coluna === 'eh_vaga' || coluna === 'nome') saida = saida.filter((r) => r[coluna] === valor);
  }
  return saida;
}

const sb = criarSupabaseMock({
  lista: (tabela, _cols, cadeia) => (tabela === 'cargos_empresa' ? filtrar(estado.cargos, cadeia) : []),
  storage: {
    list: (bucket, pasta) => (estado.arquivos[`${bucket}:${pasta}`] || []).map((name) => ({ name })),
    download: (bucket, caminho) => estado.conteudo[`${bucket}:${caminho}`] ?? null,
  },
});

vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => sb.client }));
vi.mock('@/lib/auth/supabase-server', () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: async () => ({ data: { user: estado.ctx ? { email: estado.ctx.email } : null }, error: null }) },
  }),
}));
vi.mock('@/lib/authz', () => ({
  getUserContext: async () => estado.ctx,
  isPlatformAdmin: async () => !!estado.ctx?.isPlatformAdmin,
}));
vi.mock('@/lib/audit', () => ({ logAdminAction: vi.fn(async () => {}) }));
vi.mock('@/lib/adequacao-cargo/ranking-pdf', () => ({ renderRankingAdequacaoPDF: vi.fn(async () => Buffer.from('%PDF')) }));

import { BLOCOS_OFFLINE } from '@/lib/blocos-offline';
import { rotuloCargo } from '@/lib/relatorios/relatorio-privado';
import {
  exportarRankingPDF, getRankingAdequacao, listarCargosComRanking, listarCargosComRankingAdmin,
} from '@/actions/ranking-adequacao';

const rh = { email: 'rh@empresa.com', colaborador: { id: 'rh-1' }, role: 'rh', empresaId: EMP, isPlatformAdmin: false, platformAdminRole: null };
const master = { email: 'master@vertho.ai', colaborador: null, role: 'colaborador', empresaId: null, isPlatformAdmin: true, platformAdminRole: 'master' };

const snapshot = (nomes: string[]) => JSON.stringify({
  empresaNome: 'Empresa A', dataISO: '2026-10-01T10:00:00Z', narrativas: {},
  data: {
    perfilIdeal: { pesos: [{ bloco: 'Competência', pct: 60 }] },
    pessoas: nomes.map((nome) => ({ nome, status: 'recomendado', beta: { pct: 80 }, competencia: { pct: 80 } })),
  },
});
const comSnapshot = (rotulo: string, ts: number, nomes = ['Ana']) => {
  (estado.arquivos[`relatorios-pdf:${EMP}/adequacao-cargo`] ||= []).push(`${rotulo}-${ts}.json`);
  estado.conteudo[`relatorios-pdf:${EMP}/adequacao-cargo/${rotulo}-${ts}.json`] = snapshot(nomes);
};
const downloads = () => sb.storageChamadas.filter((c) => c.metodo === 'download');
const uploads = () => sb.storageChamadas.filter((c) => c.metodo === 'upload');
const assinaturas = () => sb.storageChamadas.filter((c) => c.metodo === 'createSignedUrl');

describe('Ranking de Adequação: vagas da Seleção com o bloco off-line', () => {
  beforeEach(() => {
    sb.reset();
    estado.selecaoOffline = true;
    estado.cargos = [ANALISTA, COORDENADOR_TI, PROFESSOR];
    estado.arquivos = {};
    estado.conteudo = {};
    estado.ctx = rh;
    // O arquivo leva o rótulo EXATO do cargo; com outro nome o snapshot nem casaria e o teste provaria o vazio.
    comSnapshot(rotuloCargo(ANALISTA.nome), 100, ['Candidata A']);
    comSnapshot(rotuloCargo(COORDENADOR_TI.nome), 100, ['Candidato B']);
    comSnapshot(rotuloCargo(PROFESSOR.nome), 100, ['Ana']);
  });

  it('o registro de hoje tem a Seleção off-line (senão este arquivo prova uma regra sem alvo)', () => {
    expect(Object.keys(BLOCOS_OFFLINE)).toContain('selecao');
  });

  it('a lista do RH não traz as vagas, só o cargo; a consulta pede eh_vaga = false', async () => {
    const r = await listarCargosComRanking();
    expect(r.cargos).toEqual(['Professor']);
    const pedido = sb.chamadas.find((c) => c.tabela === 'cargos_empresa' && c.metodo === 'eq' && c.args[0] === 'eh_vaga');
    expect(pedido?.args[1]).toBe(false);
  });

  it('🔴 ler o ranking de uma vaga por nome responde "não gerado" e NÃO abre o snapshot nominal', async () => {
    const r = await getRankingAdequacao('Analista de Treinamento');
    expect(r.success).toBe(false);
    expect(r.semSnapshot).toBe(true);
    expect(r.codigo).toBe('ranking-nao-gerado');
    expect(downloads()).toHaveLength(0);
    // a resposta é a mesma de um cargo sem relatório: não confirma que a vaga existe
    const inexistente = await getRankingAdequacao('Cargo que não existe');
    expect(r.codigo).toBe(inexistente.codigo);
  });

  it('🔴 exportar o PDF de uma vaga não grava nada nem assina link', async () => {
    const r: any = await exportarRankingPDF('Coordenador de TI');
    expect(r.success).toBe(false);
    expect(r.codigo).toBe('ranking-nao-gerado');
    expect(downloads()).toHaveLength(0);
    expect(uploads()).toHaveLength(0);
    expect(assinaturas()).toHaveLength(0);
  });

  it('o cargo de verdade segue inteiro: lê o ranking e exporta o PDF', async () => {
    const lido = await getRankingAdequacao('Professor');
    expect(lido.success).toBe(true);
    expect(lido.elegiveis.map((p: any) => p.nome)).toEqual(['Ana']);
    const pdf: any = await exportarRankingPDF('Professor');
    expect(pdf.success).toBe(true);
    expect(uploads()).toHaveLength(1);
  });

  it('falha ao ler o cargo é falha FECHADA: nada do snapshot é servido', async () => {
    sb.falharEm({ tabela: 'cargos_empresa', op: 'select', mensagem: 'timeout' });
    const lido = await getRankingAdequacao('Analista de Treinamento');
    expect(lido.success).toBe(false);
    expect(lido.codigo).toBe('leitura-indisponivel');
    expect(downloads()).toHaveLength(0);
    const pdf: any = await exportarRankingPDF('Analista de Treinamento');
    expect(pdf.success).toBe(false);
    expect(uploads()).toHaveLength(0);
  });

  it('religar a Seleção (tirar a entrada do registro) devolve as vagas, sem tocar em dado', async () => {
    estado.selecaoOffline = false;
    const r = await listarCargosComRanking();
    expect(r.cargos).toEqual(['Analista de Treinamento', 'Coordenador de TI', 'Professor']);
    const lido = await getRankingAdequacao('Analista de Treinamento');
    expect(lido.success).toBe(true);
    expect(lido.elegiveis.map((p: any) => p.nome)).toEqual(['Candidata A']);
    // com o bloco no ar a leitura nem precisa perguntar se o cargo é vaga
    expect(sb.chamadas.some((c) => c.tabela === 'cargos_empresa' && c.metodo === 'eq' && c.args[0] === 'nome')).toBe(false);
    expect(sb.escritas).toHaveLength(0);
  });

  it('o preview do admin segue como estava: nunca lista vagas, com o bloco no ar ou fora', async () => {
    estado.ctx = master;
    for (const offline of [true, false]) {
      estado.selecaoOffline = offline;
      const r = await listarCargosComRankingAdmin(EMP);
      expect(r.cargos).toEqual(['Professor']);
    }
  });

  it('nada foi apagado: as duas vagas seguem no cadastro e os snapshots no storage', async () => {
    await listarCargosComRanking();
    await getRankingAdequacao('Analista de Treinamento');
    expect(estado.cargos.filter((c) => c.eh_vaga)).toHaveLength(2);
    expect(sb.escritas).toHaveLength(0);
    expect(sb.storageChamadas.some((c) => c.metodo === 'remove')).toBe(false);
  });
});
