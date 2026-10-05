import { beforeEach, describe, expect, it, vi } from 'vitest';
import { criarSupabaseMock } from '../../helpers/supabase-mock';

/**
 * DRE por tenant: gate, validação, auditoria e falha de banco das actions.
 *
 * Os gates aqui são os REAIS (`requirePlataformaComContexto` →
 * `requireAdminAction` → `can` com `BASE_ROLE_PERMISSIONS`). Só a sessão e o
 * contexto são simulados, e `permission_overrides` volta vazio: o teste mede o
 * CÓDIGO (em produção o papel `socio` tem overrides, ver o comentário de
 * `socio-permissao-dominio.test.ts`).
 *
 * O que estes testes existem para impedir, em ordem de dano:
 *
 * 1. **O RH do CLIENTE ler ou lançar na DRE.** A DRE mostra o que a Vertho ganha
 *    com ele. Toda action tem de recusar quem não é da plataforma, e recusar ANTES
 *    de tocar em qualquer tabela.
 * 2. **Escrita de dinheiro sem rastro.** Toda escrita bem-sucedida audita com o
 *    e-mail da SESSÃO (nunca o do corpo do pedido) e o antes/depois.
 * 3. **Falha de banco virar sucesso.** `{ error }` do supabase-js é RETORNADO, e
 *    um `update` que falha não pode terminar em `success: true` com auditoria
 *    de uma escrita que não aconteceu.
 * 4. **Valor calculado vir do cliente.** O valor das horas é horas × custo/hora
 *    no servidor; o número que o cliente manda é ignorado.
 */
const estado = vi.hoisted(() => ({ ctx: null as any }));
const dados = vi.hoisted(() => ({} as Record<string, any>));
const auditar = vi.hoisted(() => vi.fn(async (_e: any) => true));

const sb = criarSupabaseMock({
  resolver: (tabela) => dados[tabela] ?? null,
  lista: (tabela) => (Array.isArray(dados[`lista:${tabela}`]) ? dados[`lista:${tabela}`] : []),
  escritaUnica: (tabela, _op, payload) => (tabela === 'dre_contratos' ? { ...payload, id: 'contrato-novo' } : tabela === 'dre_parcelas' ? { ...payload, id: 'parcela-nova' } : { ...payload, id: 'lanc-novo' }),
});

vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => sb.client }));
vi.mock('@/lib/auth/supabase-server', () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { email: estado.ctx?.email } }, error: null }) },
  }),
}));
vi.mock('@/lib/authz', () => ({
  getUserContext: async () => estado.ctx,
  isPlatformAdmin: async () => !!estado.ctx?.isPlatformAdmin,
}));
vi.mock('@/lib/audit', () => ({ logAdminAction: auditar }));
// O fechamento fala com o BCB e com a RPC do ledger: aqui só interessa o gate.
vi.mock('@/lib/dre/fechamento', () => ({
  fecharSemana: vi.fn(async (_sb: any, semana: string) => ({ semana, cambio: { usdBrl: 5, fonte: 'ptax_bcb' }, grupos: 1, totalUsd: 1, linhasSemCusto: 0, removidos: 0 })),
}));

import { atualizarContrato, criarContrato, excluirContrato, listarOrcamentosParaContrato, regerarParcelas } from '@/actions/dre/contratos';
import { adicionarParcela, atualizarParcela, desfazerRecebimento, excluirParcela, registrarRecebimento } from '@/actions/dre/parcelas';
import { excluirLancamento, salvarLancamento } from '@/actions/dre/lancamentos';
import { definirCambio, recalcularSemana } from '@/actions/dre/cambio';
import { dataBRT, semanaAtualBRT, somarDias } from '@/lib/dre/semana';

const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const admin = (role: 'socio' | 'master') => ({
  email: `${role}@vertho.ai`,
  colaborador: null,
  role: 'colaborador',
  empresaId: null,
  isPlatformAdmin: true,
  platformAdminRole: role,
});
const rh = () => ({ email: 'rh@cliente.com', colaborador: { id: 'c1' }, role: 'rh', empresaId: 'e1', isPlatformAdmin: false, platformAdminRole: null });

const TODAS = {
  listarOrcamentosParaContrato,
  criarContrato,
  atualizarContrato,
  excluirContrato,
  regerarParcelas,
  registrarRecebimento,
  desfazerRecebimento,
  atualizarParcela,
  adicionarParcela,
  excluirParcela,
  salvarLancamento,
  excluirLancamento,
  definirCambio,
  recalcularSemana,
} as const;

const SEMANA_PASSADA = '2026-09-28'; // segunda-feira, já encerrada
const HOJE = dataBRT(new Date());

beforeEach(() => {
  sb.reset();
  auditar.mockClear();
  for (const k of Object.keys(dados)) delete dados[k];
  estado.ctx = null;
});

/** Escritas feitas nas tabelas da DRE (a leitura de `permission_overrides` do gate não conta). */
const escritasDre = () => sb.escritas.filter((e) => e.tabela.startsWith('dre_'));
/** Tudo o que foi lido/escrito além do próprio gate. */
const tocouAlemDoGate = () => sb.chamadas.filter((c) => c.tabela !== 'permission_overrides');

describe('gate: só a plataforma entra, e antes de tocar em qualquer tabela', () => {
  for (const [nome, fn] of Object.entries(TODAS)) {
    it(`🔴 ${nome}: o RH do cliente é recusado (FORBIDDEN), sem leitura nem escrita nem auditoria`, async () => {
      estado.ctx = rh();
      const r: any = await (fn as any)({});
      expect(r.success).toBe(false);
      expect(r.code).toBe('FORBIDDEN');
      expect(tocouAlemDoGate()).toHaveLength(0);
      expect(auditar).not.toHaveBeenCalled();
    });

    it(`${nome}: sem sessão é recusado (AUTH)`, async () => {
      estado.ctx = null;
      const r: any = await (fn as any)({});
      expect(r.success).toBe(false);
      expect(r.code).toBe('AUTH');
      expect(tocouAlemDoGate()).toHaveLength(0);
    });
  }

  it('🔴 a permissão é exigida NA ACTION, não só no menu: sócio com override DENY em dre.manage é recusado em toda escrita', async () => {
    estado.ctx = admin('socio');
    dados['lista:permission_overrides'] = [
      { scope_type: 'role', scope_key: 'role:socio', permission_key: 'dre.manage', effect: 'deny' },
    ];
    for (const [nome, fn] of Object.entries(TODAS)) {
      const r: any = await (fn as any)({});
      expect(r.code, nome).toBe('FORBIDDEN');
    }
    expect(escritasDre()).toHaveLength(0);
    expect(auditar).not.toHaveBeenCalled();
  });

  it('master e sócio passam do gate (controle positivo: caem na validação do corpo, não em FORBIDDEN)', async () => {
    for (const papel of ['master', 'socio'] as const) {
      estado.ctx = admin(papel);
      const r: any = await registrarRecebimento({});
      expect(r.code, papel).toBe('VALIDATION');
    }
  });
});

describe('validação: nada que decide dinheiro entra sem passar pelo schema', () => {
  beforeEach(() => {
    estado.ctx = admin('socio');
  });

  it('recebimento com valor negativo, zero, texto ou id inválido é recusado e NADA é gravado', async () => {
    for (const valorRecebidoBrl of [-10, 0, '100', NaN, null]) {
      const r: any = await registrarRecebimento({ parcelaId: ID(1), recebidoEm: '2026-09-30', valorRecebidoBrl });
      expect(r.success, String(valorRecebidoBrl)).toBe(false);
      expect(r.code).toBe('VALIDATION');
    }
    const r2: any = await registrarRecebimento({ parcelaId: 'não-é-uuid', recebidoEm: '2026-09-30', valorRecebidoBrl: 10 });
    expect(r2.code).toBe('VALIDATION');
    const r3: any = await registrarRecebimento({ parcelaId: ID(1), recebidoEm: '2026-02-30', valorRecebidoBrl: 10 });
    expect(r3.code).toBe('VALIDATION');
    expect(escritasDre()).toHaveLength(0);
  });

  it('valor acima do teto de R$ 1 bilhão (erro de zeros) é recusado com mensagem para a pessoa', async () => {
    const r: any = await registrarRecebimento({ parcelaId: ID(1), recebidoEm: '2026-09-30', valorRecebidoBrl: 5_000_000_000 });
    expect(r.code).toBe('VALIDATION');
    expect(r.error).toMatch(/teto/i);
  });

  it('o ator vem da SESSÃO: um `adminEmail` no corpo é ignorado (o schema nem o conhece)', async () => {
    dados.dre_parcelas = { id: ID(1), contrato_id: ID(2), numero: 1, recebido_em: null, valor_recebido_brl: null, nota_fiscal: null };
    dados.dre_contratos = { id: ID(2), nome: 'Projeto A', empresa_id: ID(3) };
    const r: any = await registrarRecebimento({ parcelaId: ID(1), recebidoEm: '2026-09-30', valorRecebidoBrl: 10, adminEmail: 'outro@vertho.ai', criado_por: 'outro@vertho.ai' });
    expect(r.success).toBe(true);
    expect(auditar.mock.calls[0][0].adminEmail).toBe('socio@vertho.ai');
    expect(JSON.stringify(sb.escritas)).not.toContain('outro@vertho.ai');
  });
});

describe('recebimento: a única porta da receita', () => {
  beforeEach(() => {
    estado.ctx = admin('socio');
    dados.dre_parcelas = { id: ID(1), contrato_id: ID(2), numero: 3, recebido_em: null, valor_recebido_brl: null, nota_fiscal: null };
    dados.dre_contratos = { id: ID(2), nome: 'Projeto A', empresa_id: ID(3) };
  });

  it('grava recebido_em e o valor, audita com antes e depois no tenant certo', async () => {
    const r: any = await registrarRecebimento({ parcelaId: ID(1), recebidoEm: '2026-09-30', valorRecebidoBrl: 1500.456, notaFiscal: 'NF 123' });
    expect(r).toMatchObject({ success: true, data: { id: ID(1) } });
    const up = sb.escritas.find((e) => e.tabela === 'dre_parcelas' && e.op === 'update')!;
    expect(up.payload).toMatchObject({ recebido_em: '2026-09-30', valor_recebido_brl: 1500.46, nota_fiscal: 'NF 123', atualizado_por: 'socio@vertho.ai' }); // a centavo
    expect(auditar).toHaveBeenCalledTimes(1);
    expect(auditar.mock.calls[0][0]).toMatchObject({
      adminEmail: 'socio@vertho.ai',
      acao: 'dre.parcela.receber',
      empresaId: ID(3),
      alvo: 'Projeto A · parcela 3',
    });
    expect(auditar.mock.calls[0][0].detalhes).toMatchObject({
      antes: { recebido_em: null, valor_recebido_brl: null },
      depois: { recebido_em: '2026-09-30', valor_recebido_brl: 1500.46 },
    });
  });

  it('🔴 data de recebimento FUTURA é recusada: parcela que não entrou fica a receber', async () => {
    const r: any = await registrarRecebimento({ parcelaId: ID(1), recebidoEm: somarDias(HOJE, 1), valorRecebidoBrl: 100 });
    expect(r).toMatchObject({ success: false, code: 'DOMAIN' });
    expect(r.error).toMatch(/futura/);
    expect(escritasDre()).toHaveLength(0);
    expect(auditar).not.toHaveBeenCalled();
  });

  it('hoje (em Brasília) é aceito', async () => {
    const r: any = await registrarRecebimento({ parcelaId: ID(1), recebidoEm: HOJE, valorRecebidoBrl: 100 });
    expect(r.success).toBe(true);
  });

  it('🔴 falha do banco no update NÃO vira sucesso, NÃO audita e NÃO vaza a mensagem do Postgres', async () => {
    sb.falharEm({ tabela: 'dre_parcelas', op: 'update', mensagem: 'duplicate key value violates constraint "dre_parcelas_numero_unico"' });
    const r: any = await registrarRecebimento({ parcelaId: ID(1), recebidoEm: '2026-09-30', valorRecebidoBrl: 100 });
    expect(r.success).toBe(false);
    expect(r.code).toBe('INTERNAL');
    expect(r.error).not.toMatch(/duplicate|constraint|dre_parcelas/i);
    expect(auditar).not.toHaveBeenCalled();
  });

  it('parcela inexistente: erro de domínio, nada gravado', async () => {
    delete dados.dre_parcelas;
    const r: any = await registrarRecebimento({ parcelaId: ID(1), recebidoEm: '2026-09-30', valorRecebidoBrl: 100 });
    expect(r).toMatchObject({ success: false, code: 'DOMAIN', error: 'Parcela não encontrada.' });
    expect(escritasDre()).toHaveLength(0);
  });

  it('desfazer: zera os DOIS campos do par; recusa parcela que não estava recebida', async () => {
    const naoRecebida: any = await desfazerRecebimento({ parcelaId: ID(1) });
    expect(naoRecebida).toMatchObject({ success: false, code: 'DOMAIN' });
    expect(escritasDre()).toHaveLength(0);

    dados.dre_parcelas = { ...dados.dre_parcelas, recebido_em: '2026-09-30', valor_recebido_brl: 900 };
    const r: any = await desfazerRecebimento({ parcelaId: ID(1) });
    expect(r.success).toBe(true);
    const up = sb.escritas.find((e) => e.tabela === 'dre_parcelas' && e.op === 'update')!;
    expect(up.payload).toMatchObject({ recebido_em: null, valor_recebido_brl: null });
    expect(auditar.mock.calls[0][0]).toMatchObject({ acao: 'dre.parcela.desfazer_recebimento' });
  });

  it('parcela já recebida não se apaga (desfaça o recebimento antes)', async () => {
    dados.dre_parcelas = { ...dados.dre_parcelas, recebido_em: '2026-09-30', valor_recebido_brl: 900 };
    const r: any = await excluirParcela({ id: ID(1) });
    expect(r).toMatchObject({ success: false, code: 'DOMAIN' });
    expect(sb.escritas.some((e) => e.op === 'delete')).toBe(false);
  });
});

describe('contratos', () => {
  beforeEach(() => {
    estado.ctx = admin('socio');
  });

  it('🔴 contrato com recebimento NÃO é apagado (vira cancelado): o dinheiro que entrou continua na DRE', async () => {
    dados.dre_contratos = { id: ID(2), nome: 'Projeto A', empresa_id: ID(3) };
    dados['lista:dre_parcelas'] = [{ id: ID(1), numero: 1, recebido_em: '2026-09-30', valor_recebido_brl: 500 }];
    const r: any = await excluirContrato({ id: ID(2) });
    expect(r).toMatchObject({ success: false, code: 'DOMAIN' });
    expect(r.error).toMatch(/Cancele/);
    expect(sb.escritas.some((e) => e.op === 'delete')).toBe(false);
  });

  it('contrato sem recebimento: apaga as parcelas ANTES do contrato (o RESTRICT do banco impõe a ordem) e audita o que apagou', async () => {
    dados.dre_contratos = { id: ID(2), nome: 'Projeto A', empresa_id: ID(3), valor_total_brl: 100 };
    dados['lista:dre_parcelas'] = [{ id: ID(1), numero: 1, recebido_em: null }];
    const r: any = await excluirContrato({ id: ID(2) });
    expect(r.success).toBe(true);
    const dels = sb.escritas.filter((e) => e.op === 'delete').map((e) => e.tabela);
    expect(dels).toEqual(['dre_parcelas', 'dre_contratos']);
    expect(auditar.mock.calls[0][0]).toMatchObject({ acao: 'dre.contrato.excluir', empresaId: ID(3) });
    expect(auditar.mock.calls[0][0].detalhes.parcelasApagadas).toHaveLength(1);
  });

  it('criar com parcelas: grava o contrato (com o previsto congelado do orçamento) e o calendário, e audita', async () => {
    dados.empresas = { id: ID(3), nome: 'Escola A' };
    dados.orcamento_cenarios = {
      id: ID(4),
      nome: 'Orçamento A',
      entradas: { pricing: { cotacao: 5.3 } },
      resultado: { valorFinal: 12000, parcela: 1000, parcelas: 12, custoTotalBrl: 5000, custoIABrl: 800, custoOperacionalBrl: 3000, margemPct: 58, mesesPrograma: 11, piorSaldo: { mes: 2, saldo: -1500 } },
    };
    const r: any = await criarContrato({
      empresaId: ID(3),
      nome: 'Projeto A',
      valorTotalBrl: 12000,
      inicio: '2026-09-01',
      orcamentoId: ID(4),
      parcelas: { n: 12, primeiroVencimento: '2026-10-10' },
    });
    expect(r).toMatchObject({ success: true, data: { id: 'contrato-novo', parcelas: 12 } });
    const c = sb.escritas.find((e) => e.tabela === 'dre_contratos' && e.op === 'insert')!.payload;
    expect(c).toMatchObject({ empresa_id: ID(3), empresa_nome: 'Escola A', chave_empresa: ID(3), valor_total_brl: 12000, status: 'em_vigor', criado_por: 'socio@vertho.ai' });
    expect(c.previsto).toMatchObject({ valorFinal: 12000, custoIABrl: 800, piorSaldoBrl: -1500, cotacao: 5.3, orcamentoNome: 'Orçamento A' });
    expect(c.previsto_congelado_em).toBeTruthy();
    const ps = sb.escritas.find((e) => e.tabela === 'dre_parcelas' && e.op === 'insert')!.payload as any[];
    expect(ps).toHaveLength(12);
    expect(ps.reduce((s, p) => s + p.valor_previsto_brl, 0)).toBeCloseTo(12000, 2);
    expect(auditar.mock.calls[0][0]).toMatchObject({ acao: 'dre.contrato.criar', empresaId: ID(3) });
  });

  it('🔴 se as parcelas falham, o contrato é DESFEITO (supabase-js não tem transação; sem isso sobra contrato órfão)', async () => {
    dados.empresas = { id: ID(3), nome: 'Escola A' };
    sb.falharEm({ tabela: 'dre_parcelas', op: 'insert', mensagem: 'timeout' });
    const r: any = await criarContrato({ empresaId: ID(3), nome: 'Projeto A', valorTotalBrl: 1200, inicio: '2026-09-01', parcelas: { n: 12, primeiroVencimento: '2026-10-10' } });
    expect(r).toMatchObject({ success: false, code: 'INTERNAL' });
    const del = sb.escritas.find((e) => e.tabela === 'dre_contratos' && e.op === 'delete');
    expect(del).toBeDefined();
    expect(auditar).not.toHaveBeenCalled();
  });

  it('empresa inexistente e orçamento sem folha de decisão são erros de domínio, sem gravar', async () => {
    const semEmpresa: any = await criarContrato({ empresaId: ID(3), nome: 'X', valorTotalBrl: 1, inicio: '2026-09-01' });
    expect(semEmpresa).toMatchObject({ success: false, error: 'Empresa não encontrada.' });
    dados.empresas = { id: ID(3), nome: 'Escola A' };
    dados.orcamento_cenarios = { id: ID(4), nome: 'Velho', entradas: {}, resultado: null };
    const semFolha: any = await criarContrato({ empresaId: ID(3), nome: 'X', valorTotalBrl: 1, inicio: '2026-09-01', orcamentoId: ID(4) });
    expect(semFolha).toMatchObject({ success: false, code: 'DOMAIN' });
    expect(semFolha.error).toMatch(/folha de decisão/);
    expect(escritasDre()).toHaveLength(0);
  });

  it('atualizar sem nenhuma mudança real é recusado; com mudança audita só o que mudou (antes e depois)', async () => {
    dados.dre_contratos = { id: ID(2), nome: 'Projeto A', empresa_id: ID(3), valor_total_brl: 12000, inicio: '2026-09-01', status: 'em_vigor' };
    const nada: any = await atualizarContrato({ id: ID(2), nome: 'Projeto A', valorTotalBrl: 12000 });
    expect(nada).toMatchObject({ success: false, error: 'Nada para atualizar.' });
    const r: any = await atualizarContrato({ id: ID(2), status: 'cancelado', valorTotalBrl: 11000 });
    expect(r.success).toBe(true);
    expect(auditar.mock.calls[0][0].detalhes).toMatchObject({
      antes: { status: 'em_vigor', valor_total_brl: 12000 },
      depois: { status: 'cancelado', valor_total_brl: 11000 },
    });
  });

  it('refazer o calendário é recusado quando já há parcela recebida (nada é apagado)', async () => {
    dados.dre_contratos = { id: ID(2), nome: 'Projeto A', empresa_id: ID(3), valor_total_brl: 1200 };
    dados['lista:dre_parcelas'] = [{ id: ID(1), numero: 1, recebido_em: '2026-09-30', valor_recebido_brl: 100 }];
    const r: any = await regerarParcelas({ contratoId: ID(2), n: 6, primeiroVencimento: '2026-11-10' });
    expect(r).toMatchObject({ success: false, code: 'DOMAIN' });
    expect(sb.escritas.some((e) => e.op === 'delete')).toBe(false);
  });

  it('listar orçamentos: o sócio vê; só entram os que têm folha de decisão', async () => {
    dados['lista:orcamento_cenarios'] = [
      { id: ID(4), nome: 'Com folha', cliente: 'Cliente', resultado: { valorFinal: 100, parcelas: 3, parcela: 33.33, margemPct: 50 }, created_at: '2026-09-10' },
      { id: ID(5), nome: 'Sem folha', cliente: null, resultado: null, created_at: '2026-09-01' },
    ];
    const r: any = await listarOrcamentosParaContrato({});
    expect(r.success).toBe(true);
    expect(r.data.map((o: any) => o.nome)).toEqual(['Com folha']);
  });
});

describe('lançamentos manuais', () => {
  beforeEach(() => {
    estado.ctx = admin('socio');
    dados.empresas = { id: ID(3), nome: 'Escola A' };
  });

  it('🔴 o valor das horas é horas × custo/hora calculado NO SERVIDOR; o `valorBrl` do cliente é ignorado', async () => {
    const r: any = await salvarLancamento({
      escopo: 'empresa',
      empresaId: ID(3),
      semanaInicio: SEMANA_PASSADA,
      categoria: 'horas',
      horas: 0.15,
      custoHoraBrl: 3.3,
      valorBrl: 99999, // o cliente tenta ditar o valor
      responsavel: 'Rodrigo',
    });
    expect(r.success).toBe(true);
    const l = sb.escritas.find((e) => e.tabela === 'dre_lancamentos' && e.op === 'insert')!.payload;
    expect(l).toMatchObject({ categoria: 'horas', horas: 0.15, custo_hora_brl: 3.3, valor_brl: 0.5, chave_empresa: ID(3), empresa_nome: 'Escola A', responsavel: 'Rodrigo', criado_por: 'socio@vertho.ai' });
  });

  it('sem custo/hora informado, usa o do orçamento (R$ 500) e grava na linha', async () => {
    await salvarLancamento({ escopo: 'empresa', empresaId: ID(3), semanaInicio: SEMANA_PASSADA, categoria: 'horas', horas: 3 });
    const l = sb.escritas.find((e) => e.tabela === 'dre_lancamentos')!.payload;
    expect(l).toMatchObject({ horas: 3, custo_hora_brl: 500, valor_brl: 1500 });
  });

  it('categoria que não é horas usa o valor informado e zera horas/custo-hora', async () => {
    await salvarLancamento({ escopo: 'empresa', empresaId: ID(3), semanaInicio: SEMANA_PASSADA, categoria: 'impostos', valorBrl: 321.987, horas: 5, custoHoraBrl: 500 });
    const l = sb.escritas.find((e) => e.tabela === 'dre_lancamentos')!.payload;
    expect(l).toMatchObject({ categoria: 'impostos', valor_brl: 321.99, horas: null, custo_hora_brl: null });
  });

  it('custo de plataforma não tem tenant: chave fixa "sem-tenant" e nenhuma leitura de empresa', async () => {
    delete dados.empresas;
    const r: any = await salvarLancamento({ escopo: 'plataforma', semanaInicio: SEMANA_PASSADA, categoria: 'infra', valorBrl: 800, descricao: 'Supabase + Vercel' });
    expect(r.success).toBe(true);
    const l = sb.escritas.find((e) => e.tabela === 'dre_lancamentos')!.payload;
    expect(l).toMatchObject({ escopo: 'plataforma', empresa_id: null, chave_empresa: 'sem-tenant' });
    expect(sb.usou('empresas', 'select')).toBe(false);
  });

  it('recusas de domínio: empresa sem id, semana que ainda não começou, categoria sem valor, horas sem horas', async () => {
    const semEmpresa: any = await salvarLancamento({ escopo: 'empresa', semanaInicio: SEMANA_PASSADA, categoria: 'infra', valorBrl: 10 });
    expect(semEmpresa).toMatchObject({ success: false, code: 'DOMAIN' });
    const futura: any = await salvarLancamento({ escopo: 'plataforma', semanaInicio: somarDias(semanaAtualBRT(new Date()), 7), categoria: 'infra', valorBrl: 10 });
    expect(futura).toMatchObject({ success: false, code: 'DOMAIN' });
    expect(futura.error).toMatch(/ainda não começou/);
    const semValor: any = await salvarLancamento({ escopo: 'plataforma', semanaInicio: SEMANA_PASSADA, categoria: 'infra' });
    expect(semValor).toMatchObject({ success: false, code: 'DOMAIN' });
    const semHoras: any = await salvarLancamento({ escopo: 'plataforma', semanaInicio: SEMANA_PASSADA, categoria: 'horas' });
    expect(semHoras).toMatchObject({ success: false, code: 'DOMAIN' });
    expect(escritasDre()).toHaveLength(0);
  });

  it('semana que não começa numa segunda-feira é recusada pelo schema', async () => {
    const r: any = await salvarLancamento({ escopo: 'plataforma', semanaInicio: '2026-09-30', categoria: 'infra', valorBrl: 10 });
    expect(r).toMatchObject({ success: false, code: 'VALIDATION' });
    expect(r.error).toMatch(/segunda/);
  });

  it('criar audita com o `depois`; editar audita antes e depois; excluir audita a linha inteira', async () => {
    await salvarLancamento({ escopo: 'plataforma', semanaInicio: SEMANA_PASSADA, categoria: 'infra', valorBrl: 800 });
    expect(auditar.mock.calls[0][0]).toMatchObject({ acao: 'dre.lancamento.criar' });

    dados.dre_lancamentos = { id: ID(9), escopo: 'plataforma', empresa_id: null, categoria: 'infra', semana_inicio: SEMANA_PASSADA, valor_brl: 800 };
    auditar.mockClear();
    await salvarLancamento({ id: ID(9), escopo: 'plataforma', semanaInicio: SEMANA_PASSADA, categoria: 'infra', valorBrl: 900 });
    expect(auditar.mock.calls[0][0]).toMatchObject({ acao: 'dre.lancamento.atualizar' });
    expect(auditar.mock.calls[0][0].detalhes.antes.valor_brl).toBe(800);
    expect(auditar.mock.calls[0][0].detalhes.depois.valor_brl).toBe(900);

    auditar.mockClear();
    const del: any = await excluirLancamento({ id: ID(9) });
    expect(del.success).toBe(true);
    expect(auditar.mock.calls[0][0]).toMatchObject({ acao: 'dre.lancamento.excluir' });
    expect(auditar.mock.calls[0][0].detalhes.lancamento.valor_brl).toBe(800);
  });

  it('🔴 falha do banco ao gravar o lançamento NÃO audita uma escrita que não aconteceu', async () => {
    sb.falharEm({ tabela: 'dre_lancamentos', op: 'insert', mensagem: 'check constraint violated' });
    const r: any = await salvarLancamento({ escopo: 'plataforma', semanaInicio: SEMANA_PASSADA, categoria: 'infra', valorBrl: 10 });
    expect(r).toMatchObject({ success: false, code: 'INTERNAL' });
    expect(auditar).not.toHaveBeenCalled();
  });
});

describe('câmbio e fechamento', () => {
  beforeEach(() => {
    estado.ctx = admin('socio');
  });

  it('definir câmbio grava como MANUAL com o autor e reconverte o custo de IA já fechado da semana', async () => {
    dados['lista:dre_custo_ia_semana'] = [
      { id: ID(11), custo_usd: 10 },
      { id: ID(12), custo_usd: 2.5 },
    ];
    const r: any = await definirCambio({ semanaInicio: SEMANA_PASSADA, usdBrl: 5.4 });
    expect(r).toMatchObject({ success: true, data: { linhasReconvertidas: 2 } });
    const cambio = sb.escritas.find((e) => e.tabela === 'dre_cambio_semanal')!.payload;
    expect(cambio).toMatchObject({ semana_inicio: SEMANA_PASSADA, usd_brl: 5.4, fonte: 'manual', definido_por: 'socio@vertho.ai' });
    const updates = sb.escritas.filter((e) => e.tabela === 'dre_custo_ia_semana' && e.op === 'update').map((e) => e.payload);
    expect(updates).toEqual([
      { usd_brl: 5.4, custo_brl: 54 },
      { usd_brl: 5.4, custo_brl: 13.5 },
    ]);
    expect(auditar.mock.calls[0][0]).toMatchObject({ acao: 'dre.cambio.definir' });
  });

  it('cotação implausível (vírgula no lugar errado) é recusada', async () => {
    for (const usdBrl of [52.1, 0.5, 0, -5, NaN]) {
      const r: any = await definirCambio({ semanaInicio: SEMANA_PASSADA, usdBrl });
      expect(r.code, String(usdBrl)).toBe('VALIDATION');
    }
    expect(escritasDre()).toHaveLength(0);
  });

  it('recalcular: só semana ENCERRADA (a em curso é calculada ao vivo)', async () => {
    const emCurso: any = await recalcularSemana({ semanaInicio: semanaAtualBRT(new Date()) });
    expect(emCurso).toMatchObject({ success: false, code: 'DOMAIN' });
    expect(auditar).not.toHaveBeenCalled();

    const ok: any = await recalcularSemana({ semanaInicio: SEMANA_PASSADA });
    expect(ok).toMatchObject({ success: true, data: { semana: SEMANA_PASSADA } });
    expect(auditar.mock.calls[0][0]).toMatchObject({ acao: 'dre.fechamento.recalcular' });
  });
});
