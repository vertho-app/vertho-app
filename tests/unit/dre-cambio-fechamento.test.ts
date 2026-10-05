/**
 * DRE: câmbio semanal e fechamento do custo de IA.
 *
 * O que estes testes existem para impedir, em ordem de dano:
 *
 * 1. **Apagar o histórico do tenant excluído.** `ia_usage_log` é CASCADE: o
 *    fechamento é o ÚNICO lugar onde o custo dele sobrevive. Refazer a semana não
 *    pode removê-lo só porque a RPC já não o enxerga.
 * 2. **Sobrescrever o câmbio que um sócio definiu.** `manual` nunca é trocado,
 *    nem pelo cron.
 * 3. **BCB fora do ar virar silêncio.** A queda tem de herdar a cotação E deixar
 *    rastro em `degradacao_log`; e o provisório (`herdado`/`orcamento`) tem de ser
 *    trocado pela PTAX quando ela aparecer.
 * 4. **Falha do banco virar semana fechada em branco.** `fecharSemana` LANÇA.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { criarSupabaseMock } from '../helpers/supabase-mock';

const degradacoes = vi.hoisted(() => [] as any[]);
vi.mock('@/lib/degradacao', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/degradacao')>();
  return { ...original, registrarDegradacao: vi.fn(async (input: any) => { degradacoes.push(input); }) };
});

import { cambioParaConverter, garantirCambio } from '@/lib/dre/cambio';
import { agruparCustoIA, executarFechamentoSemanal, fecharSemana, staleRemovivel } from '@/lib/dre/fechamento';
import type { LinhaAgregada } from '@/lib/custo-ia/relatorio-semanal';
import { ORCAMENTO_DEFAULTS } from '@/lib/orcamento/precificacao';

const SEMANA = '2026-09-28';

function linha(p: Partial<LinhaAgregada> = {}): LinhaAgregada {
  return {
    empresaId: 'emp-a',
    empresaNome: 'Escola A',
    empresaSlug: 'escola-a',
    empresaIsDemo: false,
    feature: 'conteudo_texto',
    source: 'wrapper',
    provider: 'anthropic',
    model: 'claude-sonnet-5',
    chamadas: 1,
    chamadasNaoOk: 0,
    linhasSemCusto: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    custoUsd: 1,
    ...p,
  };
}

const ptaxOk = (usdBrl = 5.2) => vi.fn(async () => ({ usdBrl, dias: 5 }));
const ptaxNulo = () => vi.fn(async () => null);
const ptaxQuebrado = (msg = 'BCB PTAX respondeu HTTP 503') =>
  vi.fn(async () => {
    throw new Error(msg);
  });

describe('agruparCustoIA (pura)', () => {
  it('agrupa por (natureza, tenant): soma custo, chamadas e linhas sem preço', () => {
    const g = agruparCustoIA([
      linha({ custoUsd: 10, chamadas: 2, linhasSemCusto: 1 }),
      linha({ feature: 'kit_desafio', custoUsd: 5, chamadas: 3 }),
    ]);
    expect(g).toEqual([
      { natureza: 'operacao', chaveEmpresa: 'emp-a', empresaId: 'emp-a', empresaNome: 'Escola A', custoUsd: 15, chamadas: 5, linhasSemCusto: 1 },
    ]);
  });

  it('segue a régua do e-mail: demo, slug não-cliente e trabalho sem tenant são P&D; o grupo sem tenant tem chave estável', () => {
    const g = agruparCustoIA([
      linha({ empresaId: 'emp-demo', empresaIsDemo: true, empresaNome: 'ACME Demo' }),
      linha({ empresaId: 'emp-acme', empresaSlug: 'acme', empresaNome: 'ACME' }),
      linha({ empresaId: null, empresaNome: null, empresaSlug: null, feature: 'copiloto_ao_vivo' }),
      linha({ source: 'experimento' }),
    ]);
    const por = Object.fromEntries(g.map((x) => [`${x.natureza}|${x.chaveEmpresa}`, x]));
    expect(por['pd|emp-demo']).toBeDefined();
    expect(por['pd|emp-acme']).toBeDefined();
    expect(por['pd|sem-tenant']).toBeDefined();
    expect(por['pd|emp-a']).toBeDefined(); // source de medição: P&D mesmo com tenant real
    expect(g.every((x) => x.natureza === 'pd')).toBe(true);
  });

  it('a soma de USD não deriva do ponto flutuante (6 casas, a precisão da coluna)', () => {
    const g = agruparCustoIA([linha({ custoUsd: 0.1 }), linha({ custoUsd: 0.2 })]);
    expect(g[0].custoUsd).toBe(0.3);
  });
});

describe('staleRemovivel', () => {
  const novas = new Set(['operacao|emp-a']);
  it('o que o ledger ainda produz fica; o que sumiu de um tenant que existe é removido', () => {
    expect(staleRemovivel({ natureza: 'operacao', chave_empresa: 'emp-a', empresa_id: 'emp-a' }, novas)).toBe(false);
    expect(staleRemovivel({ natureza: 'operacao', chave_empresa: 'emp-b', empresa_id: 'emp-b' }, novas)).toBe(true);
    expect(staleRemovivel({ natureza: 'pd', chave_empresa: 'sem-tenant', empresa_id: null }, novas)).toBe(true);
  });

  it('🔴 linha de tenant EXCLUÍDO (empresa_id nulo, chave de tenant) NUNCA é removida: a RPC já não a enxerga', () => {
    expect(staleRemovivel({ natureza: 'operacao', chave_empresa: 'uuid-excluido', empresa_id: null }, novas)).toBe(false);
  });
});

describe('garantirCambio', () => {
  const sb = criarSupabaseMock();
  beforeEach(() => {
    sb.reset();
    degradacoes.length = 0;
  });

  const existente = (fonte: string, usd = 5.5) => ({ semana_inicio: SEMANA, usd_brl: usd, fonte });
  const mockCom = (opts: { atual?: any; anteriores?: any[] }) =>
    criarSupabaseMock({
      resolver: (t) => (t === 'dre_cambio_semanal' ? opts.atual ?? null : null),
      lista: (t) => (t === 'dre_cambio_semanal' ? opts.anteriores ?? [] : []),
    });

  it('🔴 câmbio MANUAL nunca é sobrescrito: não consulta o BCB nem grava', async () => {
    const m = mockCom({ atual: existente('manual', 5.99) });
    const buscar = ptaxOk(5.2);
    const r = await garantirCambio(m.client, SEMANA, { buscar });
    expect(r).toMatchObject({ usdBrl: 5.99, fonte: 'manual', alterado: false });
    expect(buscar).not.toHaveBeenCalled();
    expect(m.escritas).toHaveLength(0);
  });

  it('PTAX já gravada também não é refeita', async () => {
    const m = mockCom({ atual: existente('ptax_bcb', 5.21) });
    const buscar = ptaxOk();
    expect((await garantirCambio(m.client, SEMANA, { buscar })).alterado).toBe(false);
    expect(buscar).not.toHaveBeenCalled();
  });

  it('sem linha e BCB ok: grava a média como ptax_bcb', async () => {
    const m = mockCom({});
    const r = await garantirCambio(m.client, SEMANA, { buscar: ptaxOk(5.2092) });
    expect(r).toMatchObject({ usdBrl: 5.2092, fonte: 'ptax_bcb', alterado: true });
    expect(m.escritas).toHaveLength(1);
    expect(m.escritas[0]).toMatchObject({ tabela: 'dre_cambio_semanal', op: 'upsert' });
    expect(m.escritas[0].payload).toMatchObject({ semana_inicio: SEMANA, usd_brl: 5.2092, fonte: 'ptax_bcb', definido_por: null });
    expect(degradacoes).toHaveLength(0);
  });

  it('🔴 BCB fora do ar: HERDA a semana anterior E registra a degradação (fallback nunca silencioso)', async () => {
    const m = mockCom({ anteriores: [{ semana_inicio: '2026-09-21', usd_brl: 5.13, fonte: 'ptax_bcb' }] });
    const r = await garantirCambio(m.client, SEMANA, { buscar: ptaxQuebrado() });
    expect(r).toMatchObject({ usdBrl: 5.13, fonte: 'herdado', alterado: true });
    expect(m.escritas[0].payload).toMatchObject({ usd_brl: 5.13, fonte: 'herdado' });
    expect(degradacoes).toHaveLength(1);
    expect(degradacoes[0]).toMatchObject({ fluxo: 'dre', tipo: 'dre-cambio-sem-ptax', chave: SEMANA, severidade: 'aviso' });
    expect(degradacoes[0].detalhe.motivo).toMatch(/503/);
  });

  it('BCB fora do ar e nenhuma semana anterior: usa a cotação do ORÇAMENTO, marcada como tal', async () => {
    const m = mockCom({});
    const r = await garantirCambio(m.client, SEMANA, { buscar: ptaxQuebrado() });
    expect(r).toMatchObject({ usdBrl: ORCAMENTO_DEFAULTS.cotacao, fonte: 'orcamento' });
    expect(degradacoes[0].detalhe.fonte).toBe('orcamento');
  });

  it('semana sem dia útil publicado (BCB devolve vazio) também cai no provisório, com o motivo certo', async () => {
    const m = mockCom({ anteriores: [{ semana_inicio: '2026-09-21', usd_brl: 5.1, fonte: 'ptax_bcb' }] });
    const r = await garantirCambio(m.client, SEMANA, { buscar: ptaxNulo() });
    expect(r.fonte).toBe('herdado');
    expect(degradacoes[0].detalhe.motivo).toMatch(/sem dia útil/);
  });

  it('o provisório (herdado) é TROCADO pela PTAX quando ela aparece', async () => {
    const m = mockCom({ atual: existente('herdado', 5.13) });
    const r = await garantirCambio(m.client, SEMANA, { buscar: ptaxOk(5.2) });
    expect(r).toMatchObject({ usdBrl: 5.2, fonte: 'ptax_bcb', alterado: true });
    expect(m.escritas[0].payload).toMatchObject({ fonte: 'ptax_bcb', usd_brl: 5.2 });
  });

  it('provisório que continua sem PTAX: não regrava, mas segue registrando a degradação', async () => {
    const m = mockCom({ atual: existente('herdado', 5.13) });
    const r = await garantirCambio(m.client, SEMANA, { buscar: ptaxQuebrado() });
    expect(r).toMatchObject({ usdBrl: 5.13, fonte: 'herdado', alterado: false });
    expect(m.escritas).toHaveLength(0);
    expect(degradacoes).toHaveLength(1);
  });

  it('falha do BANCO ao gravar LANÇA (o BCB fora do ar é previsto; o banco fora, não)', async () => {
    const m = mockCom({});
    m.falharEm({ tabela: 'dre_cambio_semanal', op: 'upsert', mensagem: 'timeout no pool' });
    await expect(garantirCambio(m.client, SEMANA, { buscar: ptaxOk() })).rejects.toThrow(/gravação falhou/);
  });

  it('cambioParaConverter: o da semana > o mais recente antes > o do orçamento (e diz quando é estimado)', async () => {
    const da = mockCom({ atual: existente('ptax_bcb', 5.2) });
    expect(await cambioParaConverter(da.client, SEMANA)).toEqual({ usdBrl: 5.2, fonte: 'ptax_bcb', estimado: false });
    const antes = mockCom({ anteriores: [{ semana_inicio: '2026-09-21', usd_brl: 5.1, fonte: 'manual' }] });
    expect(await cambioParaConverter(antes.client, SEMANA)).toEqual({ usdBrl: 5.1, fonte: 'manual', estimado: true });
    const nada = mockCom({});
    expect(await cambioParaConverter(nada.client, SEMANA)).toEqual({ usdBrl: ORCAMENTO_DEFAULTS.cotacao, fonte: 'orcamento', estimado: true });
  });
});

describe('fecharSemana', () => {
  beforeEach(() => {
    degradacoes.length = 0;
  });

  const existentes = [
    { id: 'old-existe', natureza: 'operacao', chave_empresa: 'emp-b', empresa_id: 'emp-b' }, // tenant vivo, sumiu do ledger
    { id: 'old-excluido', natureza: 'operacao', chave_empresa: 'uuid-excluido', empresa_id: null }, // tenant EXCLUÍDO
    { id: 'mantem', natureza: 'operacao', chave_empresa: 'emp-a', empresa_id: 'emp-a' },
  ];

  const montar = (linhas: LinhaAgregada[], extra: Parameters<typeof criarSupabaseMock>[0] = {}) => {
    const sb = criarSupabaseMock({
      resolver: () => null,
      lista: (t) => (t === 'dre_custo_ia_semana' ? existentes : []),
      ...extra,
    });
    const coletar = vi.fn(async () => linhas);
    return { sb, coletar };
  };

  it('grava um grupo por (natureza, tenant), com o câmbio da semana CONGELADO na linha', async () => {
    const { sb, coletar } = montar([linha({ custoUsd: 10 }), linha({ feature: 'kit_desafio', custoUsd: 5 }), linha({ empresaId: null, empresaNome: null, empresaSlug: null, custoUsd: 2 })]);
    const r = await fecharSemana(sb.client, SEMANA, { coletar, buscar: ptaxOk(5) });

    const up = sb.escritas.find((e) => e.tabela === 'dre_custo_ia_semana' && e.op === 'upsert')!;
    const rows = up.payload as any[];
    expect(rows).toHaveLength(2);
    const a = rows.find((x) => x.chave_empresa === 'emp-a');
    expect(a).toMatchObject({ semana_inicio: SEMANA, natureza: 'operacao', custo_usd: 15, usd_brl: 5, custo_brl: 75, empresa_id: 'emp-a', empresa_nome: 'Escola A' });
    const sem = rows.find((x) => x.chave_empresa === 'sem-tenant');
    expect(sem).toMatchObject({ natureza: 'pd', custo_usd: 2, custo_brl: 10, empresa_id: null });
    expect(sb.chamadas.find((c) => c.metodo === 'upsert' && c.tabela === 'dre_custo_ia_semana')!.args[1]).toEqual({ onConflict: 'semana_inicio,natureza,chave_empresa' });
    expect(r).toMatchObject({ semana: SEMANA, grupos: 2, totalUsd: 17, cambio: { usdBrl: 5, fonte: 'ptax_bcb' } });
    // a janela consultada é a MESMA do e-mail: segunda 00:00 BRT a segunda seguinte 00:00 BRT
    const j = (coletar.mock.calls as any[][])[0][0];
    expect(j.ini.toISOString()).toBe('2026-09-28T03:00:00.000Z');
    expect(j.fim.toISOString()).toBe('2026-10-05T03:00:00.000Z');
  });

  it('🔴 refazer a semana remove o que o ledger deixou de produzir, mas PRESERVA o tenant excluído', async () => {
    const { sb, coletar } = montar([linha({ custoUsd: 10 })]);
    const r = await fecharSemana(sb.client, SEMANA, { coletar, buscar: ptaxOk() });
    const del = sb.escritas.find((e) => e.tabela === 'dre_custo_ia_semana' && e.op === 'delete');
    expect(del).toBeDefined();
    const filtroIn = sb.chamadas.find((c) => c.tabela === 'dre_custo_ia_semana' && c.metodo === 'in' && c.args[0] === 'id')!;
    expect(filtroIn.args[1]).toEqual(['old-existe']); // NÃO 'old-excluido', NÃO 'mantem'
    expect(r.removidos).toBe(1);
  });

  it('semana sem uso de IA: não grava linha nova, mas ainda limpa o velho (e não chama upsert com lista vazia)', async () => {
    const { sb, coletar } = montar([]);
    const r = await fecharSemana(sb.client, SEMANA, { coletar, buscar: ptaxOk() });
    expect(sb.escritas.some((e) => e.tabela === 'dre_custo_ia_semana' && e.op === 'upsert')).toBe(false);
    expect(r).toMatchObject({ grupos: 0, totalUsd: 0 });
  });

  it('🔴 falha do banco ao gravar LANÇA e NÃO apaga nada (semana fechada em branco com 200 é o pior resultado)', async () => {
    const { sb, coletar } = montar([linha()]);
    sb.falharEm({ tabela: 'dre_custo_ia_semana', op: 'upsert', mensagem: 'deadlock' });
    await expect(fecharSemana(sb.client, SEMANA, { coletar, buscar: ptaxOk() })).rejects.toThrow(/gravação falhou/);
    expect(sb.escritas.some((e) => e.op === 'delete')).toBe(false);
  });

  it('🔴 falha da RPC do ledger LANÇA: nunca vira "semana sem custo"', async () => {
    const sb = criarSupabaseMock();
    const coletar = vi.fn(async () => {
      throw new Error('custo_ia_agregado falhou: timeout');
    });
    await expect(fecharSemana(sb.client, SEMANA, { coletar, buscar: ptaxOk() })).rejects.toThrow(/custo_ia_agregado/);
    expect(sb.escritas.filter((e) => e.tabela === 'dre_custo_ia_semana')).toHaveLength(0);
  });

  it('falha ao LER os velhos também lança (não dá para decidir o que remover às cegas)', async () => {
    const { sb, coletar } = montar([linha()]);
    sb.falharEm({ tabela: 'dre_custo_ia_semana', op: 'select', mensagem: 'permission denied' });
    await expect(fecharSemana(sb.client, SEMANA, { coletar, buscar: ptaxOk() })).rejects.toThrow(/leitura dos velhos falhou/);
  });
});

describe('executarFechamentoSemanal (o que o cron faz)', () => {
  // 05/10/2026 04:30 BRT: a última semana encerrada é a de 28/09.
  const AGORA = new Date('2026-10-05T07:30:00Z');

  const montar = (semanasFechadas: string[]) => {
    const sb = criarSupabaseMock({
      lista: (t, cols) => {
        if (t !== 'dre_custo_ia_semana') return [];
        return cols.includes('id') ? [] : semanasFechadas.map((s) => ({ semana_inicio: s }));
      },
    });
    const coletar = vi.fn(async () => [linha()]);
    return { sb, coletar };
  };

  it('dry-run só LISTA: não grava, não consulta o ledger nem o BCB', async () => {
    const { sb, coletar } = montar(['2026-09-21', '2026-09-14']);
    const buscar = ptaxOk();
    const r = await executarFechamentoSemanal(sb.client, AGORA, { dry: true, coletar, buscar });
    expect(r).toMatchObject({ dry: true, ultimaSemana: '2026-09-28', principal: null, adicionais: [] });
    expect(r.pendentesAntes).not.toContain('2026-09-21');
    expect(r.pendentesAntes).not.toContain('2026-09-14');
    expect(r.pendentesAntes).toHaveLength(10); // 12 candidatas − 2 já fechadas
    expect(sb.escritas).toHaveLength(0);
    expect(coletar).not.toHaveBeenCalled();
    expect(buscar).not.toHaveBeenCalled();
  });

  it('a última semana encerrada é SEMPRE refeita (linha tardia do Batch) e as pendentes são fechadas', async () => {
    // a 28/09 já tem fechamento, e mesmo assim é refeita
    const { sb, coletar } = montar(['2026-09-28', '2026-09-21']);
    const r = await executarFechamentoSemanal(sb.client, AGORA, { coletar, buscar: ptaxOk() });
    expect(r.principal?.semana).toBe('2026-09-28');
    // candidatas: as 12 semanas ANTERIORES à última; a 21/09 já tinha fechamento
    expect(r.adicionais).toHaveLength(11);
    expect(r.adicionais.map((x) => x.semana)).not.toContain('2026-09-21');
    expect(coletar).toHaveBeenCalledTimes(12);
  });
});
