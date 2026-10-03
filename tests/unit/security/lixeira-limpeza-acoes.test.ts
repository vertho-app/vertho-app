import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { criarSupabaseMock } from '../../helpers/supabase-mock';

/**
 * R-64, R-65 e R-130 (revisão de 02/10/2026): a Lixeira e a limpeza de dados do
 * admin, testadas pelo COMPORTAMENTO das actions, com o gate de verdade.
 *
 * Só o login e o contexto do usuário são simulados. `requireAdminAction`, o
 * `can()` e a leitura dos overrides de `permission_overrides` rodam como em
 * produção, e o `logAdminAction` também: o rastro aparece como escrita em
 * `admin_audit_log`. Antes, a única prova de permissão era a TABELA base
 * (`permissions.test.ts`), que não diz nada sobre o que uma action faz.
 */
const estado = vi.hoisted(() => ({
  email: 'master@vertho.ai' as string | null,
  ctx: null as any,
  overrides: [] as any[],
  trash: [] as any[],
  linhas: {} as Record<string, any[]>,
}));

const sb = criarSupabaseMock({
  lista: (tabela, _cols, cadeia) => {
    if (tabela === 'permission_overrides') {
      const chaves: string[] = cadeia.find((c) => c.metodo === 'in')?.args[1] || [];
      return estado.overrides.filter((o) => chaves.includes(o.scope_key));
    }
    if (tabela === 'trash') {
      const ids: string[] = cadeia.find((c) => c.metodo === 'in' && c.args[0] === 'id')?.args[1] || [];
      return estado.trash.filter((t) => ids.includes(t.id));
    }
    const todas = estado.linhas[tabela] || [];
    const range = cadeia.find((c) => c.metodo === 'range');
    return range ? todas.slice(range.args[0], range.args[1] + 1) : todas;
  },
  // O insert na lixeira devolve os ids gerados (é o que a compensação usa).
  escrita: (tabela, op, payload) => (tabela === 'trash' && op === 'insert'
    ? payload.map((p: any) => ({ id: `lx-${p.registro_id}`, registro_id: p.registro_id }))
    : null),
});

vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => sb.client }));
vi.mock('@/lib/admin-supabase', () => ({ requireAdminSupabase: async () => sb.client }));
vi.mock('@/lib/auth/supabase-server', () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: async () => ({ data: { user: estado.email ? { email: estado.email } : null }, error: null }) },
  }),
}));
vi.mock('@/lib/authz', () => ({ getUserContext: async () => (estado.ctx ? { ...estado.ctx } : null) }));
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('@/lib/vercel-domain', () => ({ removeVercelDomain: vi.fn() }));
vi.mock('@/lib/internal-emails', () => ({ excludeInternalEmails: (q: any) => q }));
vi.mock('@/lib/simulador-vendas/exclusao', () => ({ preverExclusaoPace: vi.fn(), excluirCadastroComBackupPace: vi.fn() }));
vi.mock('@/lib/simulador-vendas/core', () => ({ SimuladorError: class extends Error {} }));

import {
  restaurarDaLixeira, esvaziarLixeira, limparRegistros, limparCenariosB,
  limparReavaliacaoSessoes, limparMapeamentoCompetencias, limparMapeamento,
} from '@/app/admin/empresas/[empresaId]/actions';

const MASTER = { role: 'colaborador', isPlatformAdmin: true, platformAdminRole: 'master', empresaId: null, colaborador: null };
const SOCIO = { role: 'colaborador', isPlatformAdmin: true, platformAdminRole: 'socio', empresaId: null, colaborador: null };
const RH = { role: 'rh', isPlatformAdmin: false, platformAdminRole: null, empresaId: 'emp-1', colaborador: { id: 'c-rh' } };

const auditorias = () => sb.escritas.filter((e) => e.tabela === 'admin_audit_log').map((e) => e.payload);
/** Escritas de NEGÓCIO (tudo menos o rastro). */
const escritasDeDados = () => sb.escritas.filter((e) => e.tabela !== 'admin_audit_log');

/** Ids filtrados por `.in('id', …)` nas cadeias de DELETE de uma tabela. */
function idsApagadosEm(tabela: string): string[] {
  const ids: string[] = [];
  let emDelete = false;
  for (const c of sb.chamadas) {
    if (c.tabela !== tabela) continue;
    if (c.metodo === 'delete') { emDelete = true; continue; }
    if (['select', 'insert', 'update', 'upsert'].includes(c.metodo)) { emDelete = false; continue; }
    if (emDelete && c.metodo === 'in' && c.args[0] === 'id') ids.push(...c.args[1]);
  }
  return ids;
}

function comoMaster() { estado.email = 'master@vertho.ai'; estado.ctx = MASTER; }

beforeEach(() => {
  sb.reset();
  comoMaster();
  estado.overrides = [];
  estado.trash = [];
  estado.linhas = {};
});

describe('restaurarDaLixeira', () => {
  beforeEach(() => {
    estado.trash = [
      { id: 't-rel', empresa_id: 'emp-1', tabela_origem: 'relatorios', payload: { id: 'r1', colaborador_id: 'c1' }, deletado_em: '2026-10-01T10:00:00Z' },
      { id: 't-c1', empresa_id: 'emp-1', tabela_origem: 'colaboradores', payload: { id: 'c1' }, deletado_em: '2026-10-01T10:05:00Z' },
      { id: 't-c2', empresa_id: 'emp-1', tabela_origem: 'colaboradores', payload: { id: 'c2' }, deletado_em: '2026-10-01T10:05:00Z' },
    ];
  });

  it('🔴 R-64: a tabela recusada FICA na lixeira; sai só o que voltou para a origem', async () => {
    sb.falharEm({ tabela: 'relatorios', op: 'upsert', mensagem: 'violates foreign key constraint' });

    const r = await restaurarDaLixeira(['t-rel', 't-c1', 't-c2']);

    expect(r.success).toBe(false);
    expect(r.restaurados).toBe(2);
    expect(r.pendentes).toBe(1);
    expect(r.tabelasComErro).toEqual(['relatorios']);
    // O defeito era este delete levar os três ids pedidos.
    expect(idsApagadosEm('trash').sort()).toEqual(['t-c1', 't-c2']);
  });

  it('a tabela apagada por último volta primeiro (o pai antes do filho)', async () => {
    await restaurarDaLixeira(['t-rel', 't-c1', 't-c2']);
    const ordem = sb.escritas.filter((e) => e.op === 'upsert').map((e) => e.tabela);
    expect(ordem).toEqual(['colaboradores', 'relatorios']);
  });

  it('registra o rastro com o que voltou e o que ficou', async () => {
    sb.falharEm({ tabela: 'relatorios', op: 'upsert', mensagem: 'fk' });
    await restaurarDaLixeira(['t-rel', 't-c1', 't-c2']);

    const [a] = auditorias();
    expect(a).toMatchObject({ acao: 'lixeira.restaurar', admin_email: 'master@vertho.ai', empresa_id: 'emp-1', resultado: 'parcial' });
    expect(a.detalhes).toMatchObject({ restaurados: 2, pendentes: 1 });
    expect(a.detalhes.tabelasComErro[0]).toMatchObject({ tabela: 'relatorios', itens: 1 });
  });

  it('falha ao LER a lixeira: nada é restaurado nem apagado', async () => {
    sb.falharEm({ tabela: 'trash', op: 'select', mensagem: 'timeout' });
    const r = await restaurarDaLixeira(['t-c1']);
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/timeout/);
    expect(escritasDeDados()).toEqual([]);
  });

  it('restaurou mas a cópia não saiu da lixeira: o operador fica sabendo (restaurar de novo sobrescreveria a versão atual)', async () => {
    sb.falharEm({ tabela: 'trash', op: 'delete', mensagem: 'pool cheio' });
    const r = await restaurarDaLixeira(['t-c1', 't-c2']);
    expect(r.success).toBe(false);
    expect(r.restaurados).toBe(2);
    expect(r.copiasRemovidas).toBe(false);
    expect(auditorias()[0]).toMatchObject({ resultado: 'parcial' });
    expect(auditorias()[0].detalhes.copiasRemovidasDaLixeira).toBe(false);
  });

  it('tudo certo: success, todos saem da lixeira, rastro ok', async () => {
    const r = await restaurarDaLixeira(['t-rel', 't-c1', 't-c2']);
    expect(r).toMatchObject({ success: true, restaurados: 3, pendentes: 0, copiasRemovidas: true });
    expect(idsApagadosEm('trash').sort()).toEqual(['t-c1', 't-c2', 't-rel']);
    expect(auditorias()[0].resultado).toBe('ok');
  });
});

describe('gate da Lixeira: trash.manage, com override lido do banco', () => {
  it('sócio no papel base (sem trash.manage) é recusado antes de qualquer escrita', async () => {
    estado.email = 'socia@vertho.ai'; estado.ctx = SOCIO;
    await expect(restaurarDaLixeira(['t-c1'])).rejects.toThrow(/trash\.manage/);
    await expect(esvaziarLixeira(null)).rejects.toThrow(/trash\.manage/);
    await expect(limparRegistros('emp-1', ['respostas'])).rejects.toThrow(/trash\.manage/);
    expect(sb.escritas).toEqual([]);
  });

  it('o override por usuário vale no gate (allow abre, deny fecha)', async () => {
    estado.email = 'socia@vertho.ai'; estado.ctx = SOCIO;
    estado.overrides = [{ scope_type: 'user', scope_key: 'user:socia@vertho.ai', permission_key: 'trash.manage', effect: 'allow' }];
    const r = await esvaziarLixeira(null);
    expect(r.success).toBe(true);

    sb.reset(); comoMaster();
    estado.overrides = [{ scope_type: 'user', scope_key: 'user:master@vertho.ai', permission_key: 'trash.manage', effect: 'deny' }];
    await expect(esvaziarLixeira(null)).rejects.toThrow(/trash\.manage/);
    expect(sb.escritas).toEqual([]);
  });

  it('RH da empresa não é admin da plataforma: recusado', async () => {
    estado.email = 'rh@cliente.com'; estado.ctx = RH;
    await expect(restaurarDaLixeira(['t-c1'])).rejects.toThrow(/platform admin/);
    expect(sb.escritas).toEqual([]);
  });
});

describe('limparRegistros (vai para a lixeira)', () => {
  it('🔴 falha ao LER a cópia: nada é apagado da origem', async () => {
    estado.linhas.respostas = [{ id: 'r1', empresa_id: 'emp-1' }];
    sb.falharEm({ tabela: 'respostas', op: 'select', mensagem: 'canceling statement due to statement timeout' });

    const r: any = await limparRegistros('emp-1', ['respostas']);

    expect(r.success).toBe(false);
    expect(sb.escritas.filter((e) => e.tabela === 'respostas')).toEqual([]);
    expect(sb.escritas.filter((e) => e.tabela === 'trash')).toEqual([]);
    expect(auditorias()[0]).toMatchObject({ acao: 'dados.limpar', resultado: 'erro' });
  });

  it('🔴 passa de 1.000 linhas: copia TODAS e apaga só os ids copiados', async () => {
    estado.linhas.respostas = Array.from({ length: 1003 }, (_, i) => ({ id: `r${i}`, empresa_id: 'emp-1' }));

    const r: any = await limparRegistros('emp-1', ['respostas']);

    expect(r.success).toBe(true);
    const copiados = sb.escritas.filter((e) => e.tabela === 'trash' && e.op === 'insert').flatMap((e) => e.payload);
    expect(copiados).toHaveLength(1003);
    const apagados = idsApagadosEm('respostas');
    expect(new Set(apagados)).toEqual(new Set(estado.linhas.respostas.map((l) => l.id)));
    // nenhum DELETE pelo filtro largo: toda cadeia de DELETE da origem leva `.in('id', …)`
    const deletes = sb.chamadas.filter((c) => c.tabela === 'respostas' && c.metodo === 'delete').length;
    const deletesPorId = sb.chamadas.filter((c) => c.tabela === 'respostas' && c.metodo === 'in' && c.args[0] === 'id').length;
    expect(deletesPorId).toBe(deletes);
  });

  it('a cópia leva quem apagou (deletado_por) e o rastro leva a contagem', async () => {
    estado.linhas.relatorios = [{ id: 'r1', empresa_id: 'emp-1', colaborador_id: 'c1' }];
    await limparRegistros('emp-1', ['relatorios']);

    const [copia] = sb.escritas.find((e) => e.tabela === 'trash' && e.op === 'insert')!.payload;
    expect(copia).toMatchObject({ tabela_origem: 'relatorios', registro_id: 'r1', deletado_por: 'master@vertho.ai' });
    expect(auditorias()[0]).toMatchObject({ acao: 'dados.limpar', resultado: 'ok', empresa_id: 'emp-1' });
    expect(auditorias()[0].detalhes).toMatchObject({ movidosLixeira: 1, tabelasConcluidas: ['relatorios'] });
  });

  it('DELETE da origem falha: as cópias das linhas que seguem vivas saem da lixeira', async () => {
    estado.linhas.relatorios = [{ id: 'r1', empresa_id: 'emp-1' }, { id: 'r2', empresa_id: 'emp-1' }];
    sb.falharEm({ tabela: 'relatorios', op: 'delete', mensagem: 'deadlock' });

    const r: any = await limparRegistros('emp-1', ['relatorios']);

    expect(r.success).toBe(false);
    expect(r.error).toMatch(/deadlock/);
    expect(idsApagadosEm('trash').sort()).toEqual(['lx-r1', 'lx-r2']);
    expect(auditorias()[0]).toMatchObject({ resultado: 'erro' });
  });

  it('colaborador escolhido: `colaboradores` sai pelo id, nunca por `colaborador_id`', async () => {
    estado.linhas.colaboradores = [{ id: 'c1', empresa_id: 'emp-1' }];
    const r: any = await limparRegistros('emp-1', ['colaboradores'], 'c1');

    expect(r.success).toBe(true);
    expect(sb.usou('colaboradores', 'eq', 'colaborador_id')).toBe(false);
    expect(sb.usou('colaboradores', 'eq', 'id')).toBe(true);
    expect(idsApagadosEm('colaboradores')).toEqual(['c1']);
  });

  it('colaborador escolhido e tabela SEM registro por pessoa: recusa antes de mexer em qualquer coisa', async () => {
    estado.linhas.competencias = [{ id: 'k1', empresa_id: 'emp-1' }];
    const r: any = await limparRegistros('emp-1', ['respostas', 'competencias'], 'c1');

    expect(r.success).toBe(false);
    expect(r.error).toMatch(/competencias/);
    expect(sb.chamadas.filter((c) => c.tabela === 'competencias' || c.tabela === 'respostas')).toEqual([]);
    expect(escritasDeDados()).toEqual([]);
  });

  it('nome de tabela que casa com o protótipo ("constructor") não passa pelo escopo por pessoa', async () => {
    const r: any = await limparRegistros('emp-1', ['constructor'], 'c1');
    expect(r.success).toBe(false);
    expect(sb.chamadas.filter((c) => c.tabela === 'constructor')).toEqual([]);
  });

  it('zerar campos (UPDATE) também deixa rastro', async () => {
    await limparRegistros('emp-1', ['respostas'], null, { nivel_ia4: null });
    expect(auditorias()[0]).toMatchObject({ acao: 'dados.limpar', resultado: 'ok' });
    expect(auditorias()[0].detalhes.operacao).toBe('UPDATE (nullify)');
  });
});

describe('esvaziarLixeira', () => {
  it('o piso de 30 dias vale mesmo se o cliente mandar 0', async () => {
    const antes = Date.now();
    await esvaziarLixeira(null, 0);
    const corte = sb.chamadas.find((c) => c.tabela === 'trash' && c.metodo === 'lt')!.args[1];
    expect(Date.parse(corte)).toBeLessThanOrEqual(antes - 30 * 86400 * 1000 + 1000);
    expect(auditorias()[0]).toMatchObject({ acao: 'lixeira.esvaziar', resultado: 'ok' });
    expect(auditorias()[0].detalhes.dias).toBe(30);
  });

  it('falha no DELETE: devolve o erro e registra', async () => {
    sb.falharEm({ tabela: 'trash', op: 'delete', mensagem: 'sem conexão' });
    const r: any = await esvaziarLixeira('emp-1');
    expect(r.success).toBe(false);
    expect(auditorias()[0]).toMatchObject({ acao: 'lixeira.esvaziar', resultado: 'erro', empresa_id: 'emp-1' });
  });
});

describe('limpezas que apagam direto (sem lixeira) deixam rastro', () => {
  it.each([
    ['dados.limpar_cenarios_b', () => limparCenariosB('emp-1'), 'banco_cenarios'],
    ['dados.limpar_reavaliacao', () => limparReavaliacaoSessoes('emp-1'), 'reavaliacao_sessoes'],
    ['dados.limpar_mapeamento_competencias', () => limparMapeamentoCompetencias('emp-1', 'c1'), 'respostas'],
  ] as const)('%s: ok e erro', async (acao, rodar, tabela) => {
    let r: any = await rodar();
    expect(r.success).toBe(true);
    expect(auditorias()[0]).toMatchObject({ acao, resultado: 'ok', empresa_id: 'emp-1' });
    expect(auditorias()[0].detalhes.lixeira).toBe(false);

    sb.reset();
    sb.falharEm({ tabela, op: 'delete', mensagem: 'falhou' });
    r = await rodar();
    expect(r.success).toBe(false);
    expect(auditorias()[0]).toMatchObject({ acao, resultado: 'erro' });
  });

  it('mapeamento comportamental: PDF que não sai do Storage para tudo antes de zerar as colunas', async () => {
    estado.linhas.colaboradores = [{ comportamental_pdf_path: 'emp-1/c1.pdf' }];
    sb.falharEm({ tabela: '__storage__:relatorios-pdf', metodo: 'remove', mensagem: 'storage fora' });

    const r: any = await limparMapeamento('emp-1', 'c1');

    expect(r.success).toBe(false);
    expect(sb.escritas.filter((e) => e.tabela === 'colaboradores')).toEqual([]);
    expect(auditorias()[0]).toMatchObject({ acao: 'dados.limpar_mapeamento_comportamental', resultado: 'erro' });
  });

  it('mapeamento comportamental: sucesso remove os PDFs, zera e registra', async () => {
    estado.linhas.colaboradores = [{ comportamental_pdf_path: 'emp-1/c1.pdf' }];
    const r: any = await limparMapeamento('emp-1', 'c1');
    expect(r.success).toBe(true);
    expect(sb.storageChamadas).toContainEqual({ bucket: 'relatorios-pdf', metodo: 'remove', args: [['emp-1/c1.pdf']] });
    expect(sb.escritas.some((e) => e.tabela === 'colaboradores' && e.op === 'update')).toBe(true);
    expect(auditorias()[0]).toMatchObject({ acao: 'dados.limpar_mapeamento_comportamental', resultado: 'ok' });
    expect(auditorias()[0].detalhes.pdfsRemovidos).toBe(1);
  });
});

/**
 * As telas (leitura do fonte: a suíte roda em `node`, sem DOM). Prova a forma,
 * não o visual: que cada botão destrutivo só aparece com a permissão que a
 * action exige, e que o "ocupado" é desligado num `finally`. Antes, a action do
 * Sócio lançava FORBIDDEN, o `setBusy(false)` da linha seguinte nunca rodava e a
 * tela ficava travada.
 */
describe('telas: botão só com a permissão da action, e "ocupado" que sempre volta', () => {
  const lixeira = readFileSync('app/admin/lixeira/page.tsx', 'utf8');
  const pipeline = readFileSync('app/admin/empresas/[empresaId]/page.tsx', 'utf8');

  /** Entre a chamada e o próximo `desliga`, tem que haver um `finally {`. */
  const desligaNoFinally = (tela: string, chamada: string, desliga: string) => {
    const i = tela.indexOf(chamada);
    expect(i, chamada).toBeGreaterThan(-1);
    const trecho = tela.slice(i, tela.indexOf(desliga, i));
    expect(trecho, chamada).toContain('finally {');
  };

  /** O gate aparece logo antes do botão (no máximo `janela` caracteres antes). */
  const gateAntes = (tela: string, alvo: string, gate: string, janela = 300) => {
    const i = tela.indexOf(alvo);
    expect(i, alvo).toBeGreaterThan(-1);
    expect(tela.slice(Math.max(0, i - janela), i), alvo).toContain(gate);
  };

  it('Lixeira: restaurar e esvaziar só com trash.manage', () => {
    expect(lixeira).toContain("const podeGerir = podeVer('trash.manage')");
    gateAntes(lixeira, 'onClick={handleEsvaziar}', 'podeGerir && (');
    gateAntes(lixeira, 'onClick={handleRestaurar}', 'podeGerir && (');
  });

  it('Lixeira: o ocupado volta mesmo quando a action lança', () => {
    desligaNoFinally(lixeira, 'await restaurarDaLixeira(', 'setBusy(false)');
    desligaNoFinally(lixeira, 'await esvaziarLixeira(', 'setBusy(false)');
    desligaNoFinally(lixeira, 'await executarBackupDiario(', 'setBusy(false)');
  });

  it('Pipeline: limpar dados com trash.manage, senha de teste com users.manage, excluir com companies.manage', () => {
    expect(pipeline).toContain("const podeLimparDados = podeVer('trash.manage')");
    expect(pipeline).toContain("const podeSenhaTeste = podeVer('users.manage')");
    gateAntes(pipeline, '{/* Escopo */}', 'podeLimparDados && (');
    gateAntes(pipeline, 'const previa = await preverExclusaoEmpresa(empresaId)', 'podeGerenciarEmpresa && (');
    gateAntes(pipeline, "<p className=\"text-[9px] font-bold uppercase tracking-widest mt-3 mb-2\"", 'podeSenhaTeste && data?.empresa?.is_demo === true');
  });

  it('Pipeline: o ocupado da zona de perigo volta mesmo quando a action lança', () => {
    desligaNoFinally(pipeline, 'await definirSenhaTesteEmpresa(empresaId)', 'setDangerLoading(false)');
    desligaNoFinally(pipeline, 'r = await limparRegistros(', 'setDangerLoading(false)');
  });
});
