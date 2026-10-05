import { beforeEach, describe, expect, it, vi } from 'vitest';
import { criarSupabaseMock } from '../../helpers/supabase-mock';

/**
 * DRE por tenant: a carga da tela (`carregarDRE`).
 *
 * O que estes testes existem para impedir, em ordem de dano:
 *
 * 1. **O RH do cliente ver a DRE.** O loader tem o próprio gate (`dre.view`):
 *    a página chama a função direto, sem passar por action.
 * 2. **Falha de leitura virar zero.** Se a RPC do ledger cai para a semana em
 *    curso, o custo de IA dela NÃO é zero: tem de aparecer como aviso. "Não
 *    consegui ler" e "não gastamos" são números diferentes.
 * 3. **Cortar a cauda em silêncio.** O PostgREST corta em 1.000 linhas; a carga
 *    pagina com `.range()` ordenado e vai até a página curta.
 * 4. **Gastar RPC à toa.** Semana com fechamento não consulta o ledger: só a
 *    aberta é calculada ao vivo.
 */
const estado = vi.hoisted(() => ({ ctx: null as any }));
const dados = vi.hoisted(() => ({} as Record<string, any>));
const coletar = vi.hoisted(() => vi.fn());

const sb = criarSupabaseMock({
  resolver: (tabela) => dados[tabela] ?? null,
  lista: (tabela, _cols, cadeia) => {
    const pagina = dados[`paginas:${tabela}`] as ((de: number, ate: number) => any[]) | undefined;
    if (pagina) {
      const r = cadeia.find((c) => c.metodo === 'range');
      return pagina(r?.args[0] ?? 0, r?.args[1] ?? 999);
    }
    return Array.isArray(dados[`lista:${tabela}`]) ? dados[`lista:${tabela}`] : [];
  },
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
vi.mock('@/lib/custo-ia/relatorio-semanal', () => ({ coletarJanela: coletar }));

import { carregarDRE, normalizarJanela } from '@/lib/dre/carregar';

const AGORA = new Date('2026-10-06T15:00:00Z'); // terça; a semana em curso começa em 05/10
const admin = (role: 'socio' | 'master') => ({
  email: `${role}@vertho.ai`,
  colaborador: null,
  role: 'colaborador',
  empresaId: null,
  isPlatformAdmin: true,
  platformAdminRole: role,
});
const rh = () => ({ email: 'rh@cliente.com', colaborador: { id: 'c1' }, role: 'rh', empresaId: 'e1', isPlatformAdmin: false, platformAdminRole: null });

const linhaLedger = (p: Record<string, unknown> = {}) => ({
  empresaId: 'emp-a',
  empresaNome: 'Escola A',
  empresaSlug: 'escola-a',
  empresaIsDemo: false,
  feature: 'conteudo_texto',
  source: 'wrapper',
  provider: 'anthropic',
  model: 'm',
  chamadas: 1,
  chamadasNaoOk: 0,
  linhasSemCusto: 0,
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  custoUsd: 10,
  ...p,
});

const fechado = (semana: string, custo: number) => ({
  id: `f-${semana}`,
  semana_inicio: semana,
  natureza: 'operacao',
  chave_empresa: 'emp-a',
  empresa_id: 'emp-a',
  empresa_nome: 'Escola A',
  custo_usd: custo / 5,
  usd_brl: 5,
  custo_brl: custo,
  chamadas: 3,
  linhas_sem_custo: 0,
});

beforeEach(() => {
  sb.reset();
  coletar.mockReset();
  coletar.mockResolvedValue([]);
  for (const k of Object.keys(dados)) delete dados[k];
  estado.ctx = admin('socio');
});

/** Cenário-base: contrato com início em 14/09 e as 3 semanas anteriores já fechadas. */
function cenarioBase() {
  dados['lista:dre_contratos'] = [
    { id: 'c1', empresa_id: 'emp-a', empresa_nome: 'Escola A', chave_empresa: 'emp-a', nome: 'Projeto A', valor_total_brl: 12000, inicio: '2026-09-14', status: 'em_vigor', orcamento_id: null, previsto: null, previsto_congelado_em: null },
  ];
  dados['lista:dre_parcelas'] = [
    { id: 'p1', contrato_id: 'c1', numero: 1, vencimento: '2026-09-28', valor_previsto_brl: 1000, recebido_em: '2026-09-30', valor_recebido_brl: 1000, nota_fiscal: null, observacao: null },
    { id: 'p2', contrato_id: 'c1', numero: 2, vencimento: '2026-10-28', valor_previsto_brl: 1000, recebido_em: null, valor_recebido_brl: null, nota_fiscal: null, observacao: null },
  ];
  dados['lista:dre_custo_ia_semana'] = [fechado('2026-09-14', 10), fechado('2026-09-21', 20), fechado('2026-09-28', 30)];
  dados['lista:dre_cambio_semanal'] = [{ semana_inicio: '2026-09-28', usd_brl: 5.2, fonte: 'ptax_bcb' }];
  dados['lista:empresas'] = [{ id: 'emp-a', nome: 'Escola A', slug: 'escola-a', is_demo: false }, { id: 'emp-demo', nome: 'ACME', slug: 'acme', is_demo: true }];
}

describe('gate do loader', () => {
  it('🔴 o RH do cliente é recusado antes de qualquer leitura', async () => {
    estado.ctx = rh();
    await expect(carregarDRE({ agora: AGORA })).rejects.toThrow(/FORBIDDEN/);
    expect(sb.chamadas.filter((c) => c.tabela !== 'permission_overrides')).toHaveLength(0);
    expect(coletar).not.toHaveBeenCalled();
  });

  it('sem sessão: recusado', async () => {
    estado.ctx = null;
    await expect(carregarDRE({ agora: AGORA })).rejects.toThrow(/UNAUTHORIZED/);
  });

  it('o sócio lê E pode lançar (canManage); com override deny em dre.manage lê, mas sem os botões', async () => {
    cenarioBase();
    expect((await carregarDRE({ agora: AGORA })).canManage).toBe(true);
    dados['lista:permission_overrides'] = [{ scope_type: 'role', scope_key: 'role:socio', permission_key: 'dre.manage', effect: 'deny' }];
    expect((await carregarDRE({ agora: AGORA })).canManage).toBe(false);
  });

  it('🔴 com override deny em dre.view o sócio nem lê', async () => {
    dados['lista:permission_overrides'] = [{ scope_type: 'role', scope_key: 'role:socio', permission_key: 'dre.view', effect: 'deny' }];
    await expect(carregarDRE({ agora: AGORA })).rejects.toThrow(/FORBIDDEN/);
  });
});

describe('o que a carga monta', () => {
  it('semana FECHADA não consulta o ledger; só a em curso é calculada ao vivo, no câmbio estimado, e marcada provisória', async () => {
    cenarioBase();
    coletar.mockResolvedValue([linhaLedger({ custoUsd: 10 })]);
    const d = await carregarDRE({ agora: AGORA, semanas: 4 });

    expect(coletar).toHaveBeenCalledTimes(1);
    const j = coletar.mock.calls[0][0];
    expect(j.ini.toISOString()).toBe('2026-10-05T03:00:00.000Z');
    expect(j.fim.toISOString()).toBe('2026-10-12T03:00:00.000Z');

    expect(d.semanaAtual).toBe('2026-10-05');
    expect(d.hoje).toBe('2026-10-06');
    expect(d.resultado.janela).toEqual(['2026-09-14', '2026-09-21', '2026-09-28', '2026-10-05']);
    const a = d.resultado.tenants.find((t) => t.chave === 'emp-a')!;
    expect(a.porSemana['2026-09-14'].ia).toBe(10); // do fechamento (câmbio congelado)
    expect(a.porSemana['2026-09-28']).toMatchObject({ ia: 30, receita: 1000 });
    expect(a.porSemana['2026-10-05'].ia).toBe(52); // ao vivo: US$ 10 × 5,20 (o da semana anterior)
    expect(a.iaProvisoria).toBe(true);
    expect(d.avisos).toEqual([]);
    expect(d.empresas.map((e) => e.id)).toEqual(['emp-a', 'emp-demo']);
    expect(d.empresas[1].isDemo).toBe(true);
  });

  it('o tenant do ledger ao vivo que não tem contrato aparece, marcado semContrato', async () => {
    cenarioBase();
    coletar.mockResolvedValue([linhaLedger({ empresaId: 'emp-b', empresaNome: 'Escola B', custoUsd: 4 })]);
    const d = await carregarDRE({ agora: AGORA, semanas: 4 });
    const b = d.resultado.tenants.find((t) => t.chave === 'emp-b')!;
    expect(b).toMatchObject({ nome: 'Escola B', semContrato: true });
    expect(b.total.ia).toBe(20.8); // US$ 4 × 5,20
  });

  it('🔴 falha da RPC na semana em curso vira AVISO ("não é zero"), e o resto da DRE continua', async () => {
    cenarioBase();
    coletar.mockRejectedValue(new Error('custo_ia_agregado falhou: timeout'));
    const d = await carregarDRE({ agora: AGORA, semanas: 4 });
    expect(d.avisos).toHaveLength(1);
    expect(d.avisos[0]).toMatch(/05\/10/);
    expect(d.avisos[0]).toMatch(/Não é zero/);
    expect(d.avisos[0]).toMatch(/timeout/);
    // a receita e o custo fechado seguem lá
    const a = d.resultado.tenants.find((t) => t.chave === 'emp-a')!;
    expect(a.total.receita).toBe(1000);
    expect(a.total.ia).toBe(60);
  });

  it('🔴 falha ao LER uma tabela da DRE lança (a tela não mostra uma DRE pela metade com cara de completa)', async () => {
    cenarioBase();
    sb.falharEm({ tabela: 'dre_lancamentos', op: 'select', mensagem: 'permission denied' });
    await expect(carregarDRE({ agora: AGORA })).rejects.toThrow(/dre_lancamentos: leitura falhou/);
  });

  it('🔴 lê MAIS de 1.000 linhas: pagina até a página curta, sem cortar a cauda', async () => {
    cenarioBase();
    const total = 1005;
    dados['paginas:dre_lancamentos'] = (de: number, ate: number) => {
      const out = [];
      for (let i = de; i <= ate && i < total; i++) {
        out.push({ id: `l${i}`, escopo: 'empresa', empresa_id: 'emp-a', empresa_nome: 'Escola A', chave_empresa: 'emp-a', semana_inicio: '2026-09-28', categoria: 'outros', valor_brl: 1, criado_por: 'x' });
      }
      return out;
    };
    const d = await carregarDRE({ agora: AGORA, semanas: 4 });
    const a = d.resultado.tenants.find((t) => t.chave === 'emp-a')!;
    expect(a.porSemana['2026-09-28'].outros).toBe(1005); // não 1000
    expect(d.lancamentos).toHaveLength(1005);
    // toda leitura paginada é ORDENADA (limit/offset sem order by pode repetir ou pular linha)
    const ranges = sb.chamadas.filter((c) => c.tabela === 'dre_lancamentos' && c.metodo === 'range').map((c) => c.args);
    expect(ranges).toEqual([[0, 999], [1000, 1999]]);
    expect(sb.usou('dre_lancamentos', 'order')).toBe(true);
  });

  it('🔴 lançamento MENSAL entra no período se alguma semana dele está na janela, rateado por dia, e não duplica', async () => {
    cenarioBase();
    const mensal = (id: string, mes: string, valor: number) => ({
      id, escopo: 'plataforma', empresa_id: null, empresa_nome: null, chave_empresa: 'sem-tenant', periodicidade: 'mensal',
      semana_inicio: null, mes_competencia: mes, categoria: 'infra', valor_brl: valor, criado_por: 'x',
    });
    // Um mensal de cliente (setembro) e dois de plataforma (setembro e julho).
    const doCliente = { ...mensal('m-a', '2026-09-01', 3000), escopo: 'empresa', empresa_id: 'emp-a', empresa_nome: 'Escola A', chave_empresa: 'emp-a' };
    dados['lista:dre_lancamentos'] = [mensal('m-set', '2026-09-01', 3000), mensal('m-jul', '2026-07-01', 3100), doCliente];
    const d = await carregarDRE({ agora: AGORA, semanas: 4 });

    // janela = 14/09, 21/09, 28/09 e 05/10: setembro toca três delas (700 + 700 + 300)
    expect(d.resultado.foraDeCliente.total.plataformaBrl).toBe(1700);
    expect(d.resultado.foraDeCliente.porSemana['2026-09-28'].plataformaBrl).toBe(300);
    // os de setembro aparecem na lista de lançamentos do período; o de julho (nenhuma semana na janela) não
    expect(d.lancamentos.map((l) => l.id).sort()).toEqual(['m-a', 'm-set']);
    expect(d.lancamentos[0]).toMatchObject({ periodicidade: 'mensal', mesCompetencia: '2026-09-01', semanaInicio: null });

    // 🔴 o acumulado de caixa do cliente enxerga o mês INTEIRO, inclusive as semanas ANTERIORES à janela
    // (31/08 e 07/09): a conta parte da semana que contém o dia 1, não da 1ª semana exibida.
    const a = d.resultado.tenants.find((t) => t.chave === 'emp-a')!;
    expect(a.total.infra).toBe(1700); // só as 3 semanas da janela
    expect(a.caixaAcumuladoBrl).toBe(-2060); // 1.000 recebidos − 60 de IA − 3.000 de infra (o mês todo)
  });

  it('linha antiga, sem as colunas da mig 280, é lida como semanal', async () => {
    cenarioBase();
    dados['lista:dre_lancamentos'] = [
      { id: 'velha', escopo: 'plataforma', empresa_id: null, chave_empresa: 'sem-tenant', semana_inicio: '2026-09-28', categoria: 'infra', valor_brl: 100, criado_por: 'x' },
    ];
    const d = await carregarDRE({ agora: AGORA, semanas: 4 });
    expect(d.lancamentos[0]).toMatchObject({ periodicidade: 'semanal', semanaInicio: '2026-09-28', mesCompetencia: null });
    expect(d.resultado.foraDeCliente.total.plataformaBrl).toBe(100);
  });

  it('as semanas antigas sem fechamento além do limite viram aviso (não zero)', async () => {
    cenarioBase();
    // um contrato começando há ~2 anos exige muitas semanas abertas
    dados['lista:dre_contratos'][0].inicio = '2024-10-07';
    const d = await carregarDRE({ agora: AGORA, semanas: 4 });
    expect(d.avisos.some((a) => /fora do cálculo ao vivo/.test(a))).toBe(true);
    // só as 13 mais novas foram consultadas
    expect(coletar.mock.calls.length).toBeLessThanOrEqual(13);
  });

  it('normalizarJanela: só 4, 12, 26 ou 52 semanas; qualquer outra coisa cai em 12', () => {
    expect([4, 12, 26, 52].map(normalizarJanela)).toEqual([4, 12, 26, 52]);
    for (const x of [undefined, 0, 7, 1000, NaN]) expect(normalizarJanela(x as any)).toBe(12);
  });
});
