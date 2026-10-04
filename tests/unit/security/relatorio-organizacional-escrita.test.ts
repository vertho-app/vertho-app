import { beforeEach, describe, expect, it, vi } from 'vitest';
import { criarSupabaseMock } from '../../helpers/supabase-mock';

/**
 * R-74 (revisão de 02/10/2026), lado do ESCRITOR e das actions do ranking.
 *
 * Os quatro relatórios com dado de pessoa (Perfil Organizacional, DNA, Ranking
 * de Adequação, Adequação ao Cargo) iam para o bucket `conteudos`, que é
 * PÚBLICO, e a action devolvia `getPublicUrl`. Aqui se prova, pelo bucket de
 * cada chamada de storage (`sb.storageChamadas`), que:
 *  · o escritor grava no bucket PRIVADO `relatorios-pdf`, em
 *    `{empresaId}/{tipo}/...`, e devolve o CAMINHO e a rota que autoriza;
 *  · nenhum escritor toca o bucket público nem pede URL pública;
 *  · o export do ranking assina no bucket privado, com link curto, e só depois
 *    do gate do RH (quem não passa não gera link nenhum);
 *  · a leitura do snapshot aceita o formato novo e o antigo.
 *
 * Os gates são os REAIS (`requirePlataformaSupabase`, `requireEmpresaSupabase`,
 * `ctxRh`); só a sessão e o contexto são simulados.
 */
const estado = vi.hoisted(() => ({
  ctx: null as any,
  arquivos: {} as Record<string, string[]>,
  conteudo: {} as Record<string, string>,
  cargos: [] as any[],
}));

const EMP_A = '11111111-1111-4111-8111-111111111111';
const EMP_B = '22222222-2222-4222-8222-222222222222';

const sb = criarSupabaseMock({
  resolver: (tabela) => (tabela === 'empresas' ? { id: EMP_A, nome: 'Empresa A', segmento: 'educacao', sys_config: {} } : null),
  lista: (tabela) => (tabela === 'cargos_empresa' ? estado.cargos : []),
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
vi.mock('@/lib/perfil-organizacional/aggregate', () => ({ aggregatePerfilOrg: vi.fn(async () => ({ semDados: false, avaliados: 3 })) }));
vi.mock('@/lib/perfil-organizacional-pdf', () => ({ renderPerfilOrgPDF: vi.fn(async () => new Uint8Array([37, 80, 68, 70])) }));
vi.mock('@/lib/dna-organizacional/aggregate', () => ({ aggregateDna: vi.fn(async () => ({ semDados: false, avaliados: 3 })) }));
vi.mock('@/lib/dna-organizacional/narrative', () => ({ gerarNarrativaDna: vi.fn(async () => ({})) }));
vi.mock('@/lib/dna-organizacional-pdf', () => ({ renderDnaPDF: vi.fn(async () => new Uint8Array([37, 80, 68, 70])) }));
vi.mock('@/lib/adequacao-cargo/aggregate', () => ({ aggregateAdequacao: vi.fn(async () => ({ avaliados: 2, pessoas: [] })) }));
vi.mock('@/lib/adequacao-cargo-pdf', () => ({
  renderAdequacaoCargoPDF: vi.fn(async () => Buffer.from('%PDF')),
  reRenderAdequacaoFromSnapshot: vi.fn(async () => Buffer.from('%PDF')),
}));
vi.mock('@/lib/adequacao-cargo/ranking-pdf', () => ({ renderRankingAdequacaoPDF: vi.fn(async () => Buffer.from('%PDF')) }));

import { gerarPerfilOrganizacional } from '@/actions/perfil-organizacional';
import { gerarDnaOrganizacional } from '@/actions/dna-organizacional';
import { gerarRelatorioAdequacao, reproduzirRelatorioAdequacao } from '@/actions/adequacao-cargo';
import {
  exportarRankingPDF,
  exportarRankingPDFAdmin,
  getRankingAdequacao,
  listarCargosComRanking,
} from '@/actions/ranking-adequacao';
import { TTL_LINK_RELATORIO_SEGUNDOS, interpretarRefRelatorio } from '@/lib/relatorios/relatorio-privado';

const master = { email: 'master@vertho.ai', colaborador: null, role: 'colaborador', empresaId: null, isPlatformAdmin: true, platformAdminRole: 'master' };
const rh = (empresaId: string) => ({ email: 'rh@empresa.com', colaborador: { id: 'rh-1' }, role: 'rh', empresaId, isPlatformAdmin: false, platformAdminRole: null });
const gestor = { email: 'gestor@empresa.com', colaborador: { id: 'g-1' }, role: 'gestor', empresaId: EMP_A, isPlatformAdmin: false, platformAdminRole: null };

const uploads = () => sb.storageChamadas.filter((c) => c.metodo === 'upload');
const assinaturas = () => sb.storageChamadas.filter((c) => c.metodo === 'createSignedUrl');
const tocouBucketPublico = () => sb.storageChamadas.some((c) => c.bucket === 'conteudos' && c.metodo !== 'list' && c.metodo !== 'download');
const pediuUrlPublica = () => sb.storageChamadas.some((c) => c.metodo === 'getPublicUrl');

const snapshot = (nomes: string[]) => JSON.stringify({
  empresaNome: 'Empresa A', dataISO: '2026-10-01T10:00:00Z', narrativas: {},
  data: {
    perfilIdeal: { pesos: [{ bloco: 'Competência', pct: 60 }] },
    pessoas: nomes.map((nome) => ({ nome, status: 'recomendado', beta: { pct: 80 }, competencia: { pct: 80 } })),
  },
});

describe('escritores dos relatórios organizacionais (R-74)', () => {
  beforeEach(() => { sb.reset(); estado.arquivos = {}; estado.conteudo = {}; estado.ctx = master; });

  it('Perfil Organizacional: grava no bucket PRIVADO e devolve caminho + rota, nunca URL pública', async () => {
    const r = await gerarPerfilOrganizacional(EMP_A);
    expect(r.success).toBe(true);
    const [up] = uploads();
    expect(up.bucket).toBe('relatorios-pdf');
    expect(up.args[0]).toMatch(new RegExp(`^${EMP_A}/perfil-org/\\d+\\.pdf$`));
    expect(r.caminho).toBe(up.args[0]);
    expect(r.url).toBe(`/api/relatorios/organizacional?ref=${encodeURIComponent(up.args[0])}`);
    expect(tocouBucketPublico()).toBe(false);
    expect(pediuUrlPublica()).toBe(false);
  });

  it('DNA Organizacional: idem', async () => {
    const r = await gerarDnaOrganizacional(EMP_A);
    expect(r.success).toBe(true);
    const [up] = uploads();
    expect(up.bucket).toBe('relatorios-pdf');
    expect(up.args[0]).toMatch(new RegExp(`^${EMP_A}/dna/\\d+\\.pdf$`));
    expect(r.url).toContain('/api/relatorios/organizacional?ref=');
    expect(tocouBucketPublico()).toBe(false);
    expect(pediuUrlPublica()).toBe(false);
  });

  it('Adequação ao Cargo: PDF e snapshot no bucket PRIVADO, mesmo nome-base, e o leitor reconhece o caminho', async () => {
    const r = await gerarRelatorioAdequacao(EMP_A, 'Coordenação Pedagógica');
    expect(r.success).toBe(true);
    const caminhos = uploads().map((c) => `${c.bucket}:${c.args[0]}`);
    expect(caminhos).toHaveLength(2);
    expect(caminhos[0]).toMatch(new RegExp(`^relatorios-pdf:${EMP_A}/adequacao-cargo/CoordenaC3A7C3A3o20PedagC3B3gica-\\d+\\.pdf$`));
    expect(caminhos[1]).toBe(caminhos[0].replace(/\.pdf$/, '.json'));
    expect(interpretarRefRelatorio(r.caminho)).toMatchObject({ bucket: 'relatorios-pdf', empresaId: EMP_A, tipo: 'adequacao-cargo' });
    expect(tocouBucketPublico()).toBe(false);
    expect(pediuUrlPublica()).toBe(false);
  });

  it('upload que falha volta como erro, não como link para o nada', async () => {
    sb.falharEm({ tabela: '__storage__:relatorios-pdf', metodo: 'upload', mensagem: 'bucket cheio' });
    const r = await gerarPerfilOrganizacional(EMP_A);
    expect(r.success).toBe(false);
    expect(r.error).toContain('bucket cheio');
    expect(r.url).toBeUndefined();
  });

  it('reprodução do snapshot: recusa caminho fora do formato (antes baixava o que o cliente pedisse)', async () => {
    const r = await reproduzirRelatorioAdequacao('final/perso/c1/e1/SC.pdf');
    expect(r.success).toBe(false);
    expect(sb.storageChamadas).toHaveLength(0);
  });

  it('reprodução do snapshot ANTIGO: lê no bucket antigo e grava o PDF no PRIVADO', async () => {
    const antigo = `final/adequacao-cargo/${EMP_A}-Professor-100.json`;
    estado.conteudo[`conteudos:${antigo}`] = snapshot(['Ana']);
    const r = await reproduzirRelatorioAdequacao(antigo);
    expect(r.success).toBe(true);
    expect(sb.storageChamadas.find((c) => c.metodo === 'download')).toMatchObject({ bucket: 'conteudos', args: [antigo] });
    const [up] = uploads();
    expect(up.bucket).toBe('relatorios-pdf');
    expect(up.args[0]).toMatch(new RegExp(`^${EMP_A}/adequacao-cargo/Professor-100-repro-\\d+\\.pdf$`));
  });
});

describe('ranking de adequação: export e leitura do snapshot (R-74)', () => {
  beforeEach(() => { sb.reset(); estado.arquivos = {}; estado.conteudo = {}; estado.cargos = []; });

  const comSnapshotNovo = (rotulo: string, ts: number, nomes = ['Ana']) => {
    const chave = `relatorios-pdf:${EMP_A}/adequacao-cargo`;
    (estado.arquivos[chave] ||= []).push(`${rotulo}-${ts}.json`);
    estado.conteudo[`relatorios-pdf:${EMP_A}/adequacao-cargo/${rotulo}-${ts}.json`] = snapshot(nomes);
  };
  const comSnapshotAntigo = (empresaId: string, rotulo: string, ts: number, nomes = ['Bia']) => {
    const chave = 'conteudos:final/adequacao-cargo';
    (estado.arquivos[chave] ||= []).push(`${empresaId}-${rotulo}-${ts}.json`);
    estado.conteudo[`conteudos:final/adequacao-cargo/${empresaId}-${rotulo}-${ts}.json`] = snapshot(nomes);
  };

  it('🔴 gestor não exporta o ranking: nenhum upload, nenhum link', async () => {
    estado.ctx = gestor;
    comSnapshotNovo('Professor', 200);
    const r: any = await exportarRankingPDF('Professor');
    expect(r.success).toBe(false);
    expect(uploads()).toHaveLength(0);
    expect(assinaturas()).toHaveLength(0);
  });

  it('🔴 RH (de outra empresa) não usa o export de admin: nenhum link', async () => {
    estado.ctx = rh(EMP_B);
    comSnapshotNovo('Professor', 200);
    await expect(exportarRankingPDFAdmin(EMP_A, 'Professor')).rejects.toThrow(/FORBIDDEN/);
    expect(assinaturas()).toHaveLength(0);
  });

  it('RH da empresa: o PDF vai para o bucket PRIVADO e o link é assinado ali, curto', async () => {
    estado.ctx = rh(EMP_A);
    comSnapshotNovo('Professor', 200);
    const r: any = await exportarRankingPDF('Professor');
    expect(r.success).toBe(true);
    const [up] = uploads();
    expect(up.bucket).toBe('relatorios-pdf');
    expect(up.args[0]).toBe(`${EMP_A}/ranking-adequacao/Professor-200.pdf`);
    const [assinatura] = assinaturas();
    expect(assinatura.bucket).toBe('relatorios-pdf');
    expect(assinatura.args[0]).toBe(up.args[0]);
    expect(assinatura.args[1]).toBe(TTL_LINK_RELATORIO_SEGUNDOS);
    expect(assinatura.args[1]).toBeLessThanOrEqual(300);
    expect(r.url).toBe(`https://signed/${up.args[0]}`);
    expect(tocouBucketPublico()).toBe(false);
  });

  it('lê o snapshot ANTIGO enquanto não há novo (registros de antes da migração)', async () => {
    estado.ctx = rh(EMP_A);
    comSnapshotAntigo(EMP_A, 'Professor', 100, ['Bia']);
    const r = await getRankingAdequacao('Professor');
    expect(r.success).toBe(true);
    expect(r.elegiveis.map((p: any) => p.nome)).toEqual(['Bia']);
    expect(sb.storageChamadas.find((c) => c.metodo === 'download')).toMatchObject({ bucket: 'conteudos' });
  });

  it('com os dois formatos, vence o mais recente; o cargo casa pelo rótulo EXATO', async () => {
    estado.ctx = rh(EMP_A);
    comSnapshotAntigo(EMP_A, 'Professor', 100, ['Bia']);
    comSnapshotNovo('Professor', 300, ['Ana']);
    comSnapshotNovo('Professor-A', 900, ['Intrusa']); // "Professor-A" não é "Professor"
    const r = await getRankingAdequacao('Professor');
    expect(r.elegiveis.map((p: any) => p.nome)).toEqual(['Ana']);
  });

  it('🔴 o snapshot antigo de OUTRA empresa cujo nome só CONTÉM o id não entra', async () => {
    estado.ctx = rh(EMP_A);
    // `search` do Storage é substring: este nome passaria no filtro do servidor.
    comSnapshotAntigo(`${EMP_B}-${EMP_A}`, 'Professor', 999, ['Outra empresa']);
    const r = await getRankingAdequacao('Professor');
    expect(r.success).toBe(false);
    expect(r.semSnapshot).toBe(true);
  });

  it('listar cargos enxerga os dois formatos (e só cargo com snapshot)', async () => {
    estado.ctx = rh(EMP_A);
    estado.cargos = ['Professor', 'Diretor', 'Vice'].map((nome) => ({ nome, gabarito: { tela4: {} } }));
    comSnapshotNovo('Professor', 300);
    comSnapshotAntigo(EMP_A, 'Diretor', 100);
    const r = await listarCargosComRanking();
    expect(r.cargos).toEqual(['Diretor', 'Professor']);
  });

  it('falha ao LISTAR não vira "ranking não gerado"', async () => {
    estado.ctx = rh(EMP_A);
    sb.falharEm({ tabela: '__storage__', metodo: 'list', mensagem: 'timeout' });
    const r = await getRankingAdequacao('Professor');
    expect(r.success).toBe(false);
    expect(r.semSnapshot).toBeUndefined();
    expect(r.codigo).toBe('leitura-indisponivel');
  });
});
