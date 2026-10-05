/**
 * DRE: a consolidação (receita por caixa, custos, cobertura, previsto × realizado).
 *
 * O que estes testes existem para impedir, em ordem de dano:
 *
 * 1. **Receita que não entrou.** Parcela a receber somada como receita faz a
 *    DRE mostrar caixa que não existe. Só `recebido_em` conta, na semana em que
 *    o dinheiro entrou (inclusive o de domingo, que é da semana que termina).
 * 2. **Margem inflada por custo que ninguém lançou.** Categoria sem lançamento é
 *    `nao_lancado`, não zero; e margem sem receita é `null` (nunca 0% nem NaN).
 * 3. **Tenant excluído sumir ou se fundir com outro.** `empresa_id` vira NULL,
 *    mas a `chave_empresa` agrupa: dois tenants excluídos continuam dois.
 * 4. **Fora de cliente misturado com cliente.** P&D e plataforma não entram na
 *    margem de nenhum tenant, mas ENTRAM no total geral, por categoria.
 */

import { describe, it, expect } from 'vitest';
import { consolidar, mesesEntre, type EntradaConsolidar } from '@/lib/dre/consolidar';
import type { ContratoDRE, CustoIASemanaDRE, LancamentoDRE, ParcelaDRE, PrevistoContrato } from '@/lib/dre/tipos';

const SEMANAS = ['2026-09-21', '2026-09-28', '2026-10-05'];

function parcela(p: Partial<ParcelaDRE> & { numero: number }): ParcelaDRE {
  return {
    id: `p${p.numero}`,
    contratoId: 'c1',
    vencimento: '2026-10-10',
    valorPrevistoBrl: 1000,
    recebidoEm: null,
    valorRecebidoBrl: null,
    notaFiscal: null,
    observacao: null,
    ...p,
  };
}

function contrato(p: Partial<ContratoDRE> = {}): ContratoDRE {
  return {
    id: 'c1',
    empresaId: 'emp-a',
    empresaNome: 'Escola A',
    chaveEmpresa: 'emp-a',
    nome: 'Projeto A',
    valorTotalBrl: 12_000,
    inicio: '2026-09-01',
    status: 'em_vigor',
    orcamentoId: null,
    previsto: null,
    previstoCongeladoEm: null,
    parcelas: [],
    ...p,
  };
}

function lanc(p: Partial<LancamentoDRE>): LancamentoDRE {
  return {
    id: 'l1',
    escopo: 'empresa',
    empresaId: 'emp-a',
    empresaNome: 'Escola A',
    chaveEmpresa: 'emp-a',
    semanaInicio: '2026-09-28',
    categoria: 'horas',
    descricao: null,
    horas: null,
    custoHoraBrl: null,
    responsavel: null,
    valorBrl: 100,
    criadoPor: 'socio@vertho.ai',
    atualizadoPor: null,
    ...p,
  };
}

function ia(p: Partial<CustoIASemanaDRE>): CustoIASemanaDRE {
  return {
    semanaInicio: '2026-09-28',
    natureza: 'operacao',
    chaveEmpresa: 'emp-a',
    empresaId: 'emp-a',
    empresaNome: 'Escola A',
    custoUsd: 0,
    usdBrl: 5,
    custoBrl: 0,
    chamadas: 1,
    linhasSemCusto: 0,
    aoVivo: false,
    ...p,
  };
}

function entrada(p: Partial<EntradaConsolidar> = {}): EntradaConsolidar {
  return {
    semanas: SEMANAS,
    janela: SEMANAS,
    contratos: [],
    lancamentos: [],
    custoIA: [],
    cambios: [],
    hoje: '2026-10-06',
    ...p,
  };
}

const PREVISTO: PrevistoContrato = {
  valorFinal: 12_000,
  parcela: 1000,
  parcelas: 12,
  custoTotalBrl: 5_000,
  custoIABrl: 800,
  custoOperacionalBrl: 3_000,
  margemPct: 58,
  mesesPrograma: 11,
  piorSaldoMes: 2,
  piorSaldoBrl: -1_500,
  cotacao: 5.3,
  orcamentoNome: 'Orçamento A',
};

describe('receita por caixa', () => {
  const c = contrato({
    parcelas: [
      parcela({ numero: 1, recebidoEm: '2026-09-30', valorRecebidoBrl: 1000 }), // quarta da semana 28/09
      parcela({ numero: 2, recebidoEm: '2026-10-04', valorRecebidoBrl: 1000 }), // DOMINGO: ainda é a semana 28/09
      parcela({ numero: 3, vencimento: '2026-10-10' }), // a receber
      parcela({ numero: 4, vencimento: '2026-09-01' }), // atrasada
    ],
  });

  it('só parcela RECEBIDA é receita, e cai na semana do recebimento (domingo é da semana que termina)', () => {
    const r = consolidar(entrada({ contratos: [c] }));
    const a = r.tenants[0];
    expect(a.porSemana['2026-09-28'].receita).toBe(2000);
    expect(a.porSemana['2026-10-05'].receita).toBe(0);
    expect(a.porSemana['2026-09-21'].receita).toBe(0);
    expect(a.total.receita).toBe(2000); // as duas parcelas a receber NÃO entram
  });

  it('o recebimento de segunda 00:00 abre a semana seguinte', () => {
    const c2 = contrato({ parcelas: [parcela({ numero: 1, recebidoEm: '2026-10-05', valorRecebidoBrl: 700 })] });
    const r = consolidar(entrada({ contratos: [c2] }));
    expect(r.tenants[0].porSemana['2026-10-05'].receita).toBe(700);
    expect(r.tenants[0].porSemana['2026-09-28'].receita).toBe(0);
  });

  it('o valor RECEBIDO manda, não o previsto (entrou menos que o combinado)', () => {
    const c2 = contrato({ parcelas: [parcela({ numero: 1, valorPrevistoBrl: 1000, recebidoEm: '2026-09-30', valorRecebidoBrl: 850.5 })] });
    expect(consolidar(entrada({ contratos: [c2] })).tenants[0].total.receita).toBe(850.5);
  });

  it('resumo do contrato: recebido, a receber, % recebido, atrasadas e a vencer', () => {
    const r = consolidar(entrada({ contratos: [c] }));
    const s = r.tenants[0].contratos[0];
    expect(s.recebidoBrl).toBe(2000);
    expect(s.aReceberBrl).toBe(2000);
    expect(s.pctRecebido).toBe(16.67);
    expect(s.atrasadas).toEqual({ qtd: 1, valorBrl: 1000 });
    expect(s.proximas4Semanas).toEqual({ qtd: 1, valorBrl: 1000 });
    expect(r.parcelas.atrasadas).toEqual({ qtd: 1, valorBrl: 1000 });
    expect(r.parcelas.proximas4Semanas).toEqual({ qtd: 1, valorBrl: 1000 });
  });

  it('contrato cancelado não cobra mais (sem a receber nem atraso), mas o que já entrou continua receita', () => {
    const cancelado = contrato({ status: 'cancelado', parcelas: c.parcelas });
    const r = consolidar(entrada({ contratos: [cancelado] }));
    expect(r.tenants[0].total.receita).toBe(2000);
    expect(r.tenants[0].contratos[0].aReceberBrl).toBe(0);
    expect(r.parcelas.atrasadas.qtd).toBe(0);
    expect(r.tenants[0].semContrato).toBe(true); // só cancelado = sem contrato vivo
  });

  it('contrato de valor zero: % recebido é null, não NaN', () => {
    const grátis = contrato({ valorTotalBrl: 0, parcelas: [] });
    expect(consolidar(entrada({ contratos: [grátis] })).tenants[0].contratos[0].pctRecebido).toBeNull();
  });

  it('recebimento numa semana fora das conhecidas é ignorado sem quebrar', () => {
    const antigo = contrato({ parcelas: [parcela({ numero: 1, recebidoEm: '2025-01-10', valorRecebidoBrl: 999 })] });
    expect(consolidar(entrada({ contratos: [antigo] })).tenants[0].total.receita).toBe(0);
  });
});

describe('custos, margem e cobertura', () => {
  const base = entrada({
    contratos: [
      contrato({
        parcelas: [
          parcela({ numero: 1, recebidoEm: '2026-09-30', valorRecebidoBrl: 1000 }),
          parcela({ numero: 2, recebidoEm: '2026-10-04', valorRecebidoBrl: 1000 }),
        ],
      }),
    ],
    lancamentos: [lanc({ categoria: 'horas', valorBrl: 500, horas: 1, custoHoraBrl: 500 })],
    custoIA: [
      ia({ custoBrl: 200, custoUsd: 40 }),
      ia({ semanaInicio: '2026-10-05', custoBrl: 30, custoUsd: 6, aoVivo: true }),
    ],
  });

  it('resultado = receita − todos os custos; margem em %, a 2 casas', () => {
    const a = consolidar(base).tenants[0];
    const s = a.porSemana['2026-09-28'];
    expect(s).toMatchObject({ receita: 2000, ia: 200, horas: 500, custo: 700, resultado: 1300, margemPct: 65 });
    expect(a.total).toMatchObject({ receita: 2000, ia: 230, horas: 500, custo: 730, resultado: 1270, margemPct: 63.5 });
  });

  it('🔴 semana de custo SEM receita: margem é null (não 0% nem NaN) e o resultado é o prejuízo', () => {
    const s = consolidar(base).tenants[0].porSemana['2026-10-05'];
    expect(s.receita).toBe(0);
    expect(s.custo).toBe(30);
    expect(s.resultado).toBe(-30);
    expect(s.margemPct).toBeNull();
    expect(Number.isNaN(s.resultado)).toBe(false);
  });

  it('semana sem nenhum movimento é uma célula ZERADA, não ausente', () => {
    const s = consolidar(base).tenants[0].porSemana['2026-09-21'];
    expect(s).toMatchObject({ receita: 0, custo: 0, resultado: 0, margemPct: null });
  });

  it('🔴 categoria sem lançamento é nao_lancado (não custo zero); a IA é medida', () => {
    const cob = consolidar(base).tenants[0].cobertura;
    expect(cob.ia).toBe('medido');
    expect(cob.horas).toBe('manual');
    for (const cat of ['impostos', 'comissao', 'infra', 'whatsapp', 'terceiros', 'outros'] as const) {
      expect(cob[cat], cat).toBe('nao_lancado');
    }
  });

  it('a cobertura olha só a janela exibida: lançamento fora da janela não acende o selo', () => {
    const r = consolidar(
      entrada({
        semanas: SEMANAS,
        janela: ['2026-10-05'],
        contratos: [contrato()],
        lancamentos: [lanc({ semanaInicio: '2026-09-21', categoria: 'impostos', valorBrl: 90 })],
      }),
    );
    expect(r.tenants[0].cobertura.impostos).toBe('nao_lancado');
    // mas o acumulado de caixa enxerga a semana inteira
    expect(r.tenants[0].caixaAcumuladoBrl).toBe(-90);
  });

  it('IA da semana em curso (ao vivo) marca o tenant como provisório; fechada não', () => {
    expect(consolidar(base).tenants[0].iaProvisoria).toBe(true);
    const fechada = entrada({ custoIA: [ia({ custoBrl: 10 })] });
    expect(consolidar(fechada).tenants[0].iaProvisoria).toBe(false);
  });

  it('chamadas de IA sem preço no catálogo são somadas (o custo é PISO enquanto > 0)', () => {
    const r = consolidar(entrada({ custoIA: [ia({ linhasSemCusto: 3 }), ia({ semanaInicio: '2026-10-05', linhasSemCusto: 2 })] }));
    expect(r.tenants[0].iaLinhasSemCusto).toBe(5);
  });

  it('a soma de centavos não deriva (0,1 + 0,2 = 0,30)', () => {
    const r = consolidar(entrada({ lancamentos: [lanc({ valorBrl: 0.1, categoria: 'outros' }), lanc({ id: 'l2', valorBrl: 0.2, categoria: 'outros' })] }));
    expect(r.tenants[0].total.outros).toBe(0.3);
  });
});

describe('quem é tenant e quem é fora de cliente', () => {
  it('🔴 tenant EXCLUÍDO (empresa_id nulo) continua na conta, agrupado pela chave, com o nome guardado', () => {
    const r = consolidar(
      entrada({
        custoIA: [ia({ chaveEmpresa: 'uuid-x', empresaId: null, empresaNome: 'Colégio X', custoBrl: 40 })],
        lancamentos: [lanc({ chaveEmpresa: 'uuid-x', empresaId: null, empresaNome: 'Colégio X', valorBrl: 60 })],
      }),
    );
    expect(r.tenants).toHaveLength(1);
    expect(r.tenants[0]).toMatchObject({ chave: 'uuid-x', nome: 'Colégio X', empresaRemovida: true });
    expect(r.tenants[0].total.custo).toBe(100);
  });

  it('dois tenants excluídos continuam DOIS (a chave não colapsa em "nulo")', () => {
    const r = consolidar(
      entrada({
        custoIA: [
          ia({ chaveEmpresa: 'uuid-x', empresaId: null, empresaNome: 'Colégio X', custoBrl: 10 }),
          ia({ chaveEmpresa: 'uuid-y', empresaId: null, empresaNome: 'Colégio Y', custoBrl: 20 }),
        ],
      }),
    );
    expect(r.tenants.map((t) => t.nome).sort()).toEqual(['Colégio X', 'Colégio Y']);
  });

  it('tenant só com custo e sem contrato aparece, marcado semContrato (custo sem receita é informação)', () => {
    const r = consolidar(entrada({ custoIA: [ia({ chaveEmpresa: 'emp-b', empresaId: 'emp-b', empresaNome: 'Escola B', custoBrl: 77 })] }));
    expect(r.tenants[0]).toMatchObject({ nome: 'Escola B', semContrato: true });
    expect(r.tenants[0].total.resultado).toBe(-77);
  });

  it('🔴 IA de P&D e lançamento de plataforma saem do tenant e vão para "fora de cliente"; o total geral soma TUDO, por categoria', () => {
    const r = consolidar(
      entrada({
        contratos: [contrato({ parcelas: [parcela({ numero: 1, recebidoEm: '2026-09-30', valorRecebidoBrl: 2000 })] })],
        custoIA: [
          ia({ custoBrl: 200 }),
          ia({ natureza: 'pd', chaveEmpresa: 'sem-tenant', empresaId: null, empresaNome: null, custoBrl: 50 }),
          // demo é P&D mesmo com tenant: não é margem de cliente nenhum
          ia({ natureza: 'pd', chaveEmpresa: 'emp-demo', empresaId: 'emp-demo', empresaNome: 'ACME Demo', custoBrl: 25 }),
        ],
        lancamentos: [
          lanc({ categoria: 'horas', valorBrl: 500 }),
          lanc({ id: 'l2', escopo: 'plataforma', empresaId: null, empresaNome: null, chaveEmpresa: 'sem-tenant', categoria: 'infra', valorBrl: 100 }),
        ],
      }),
    );
    // o tenant NÃO carrega P&D nem infra geral
    expect(r.tenants).toHaveLength(1);
    expect(r.tenants[0].total).toMatchObject({ ia: 200, horas: 500, infra: 0, custo: 700 });
    // fora de cliente
    expect(r.foraDeCliente.total).toEqual({ iaPdBrl: 75, plataformaBrl: 100, totalBrl: 175 });
    expect(r.foraDeCliente.porSemana['2026-09-28']).toEqual({ iaPdBrl: 75, plataformaBrl: 100, totalBrl: 175 });
    // operação x geral
    expect(r.totais.operacao).toMatchObject({ receita: 2000, custo: 700, resultado: 1300 });
    expect(r.totais.geral).toMatchObject({ receita: 2000, ia: 275, horas: 500, infra: 100, custo: 875, resultado: 1125 });
    // por semana
    expect(r.totais.porSemanaGeral['2026-09-28'].custo).toBe(875);
    expect(r.totais.porSemanaOperacao['2026-09-28'].custo).toBe(700);
  });

  it('as semanas anteriores à janela entram no acumulado de caixa, não na tabela', () => {
    const r = consolidar(
      entrada({
        janela: ['2026-10-05'],
        contratos: [contrato({ parcelas: [parcela({ numero: 1, recebidoEm: '2026-09-23', valorRecebidoBrl: 1000 })] })],
        custoIA: [ia({ semanaInicio: '2026-09-21', custoBrl: 300 })],
      }),
    );
    const a = r.tenants[0];
    expect(a.total.receita).toBe(0); // janela = só a semana de 05/10
    expect(a.caixaAcumuladoBrl).toBe(700); // 1000 recebidos − 300 de IA, desde a 1ª semana
    expect(Object.keys(a.porSemana)).toEqual(['2026-10-05']);
  });
});

describe('previsto × realizado', () => {
  const comPrevisto = (extra: Partial<ContratoDRE> = {}) =>
    contrato({
      previsto: PREVISTO,
      parcelas: [parcela({ numero: 1, recebidoEm: '2026-09-30', valorRecebidoBrl: 1000 })],
      ...extra,
    });

  it('com um contrato e previsto: compara IA orçada × realizada e o pior saldo previsto × o caixa acumulado', () => {
    const r = consolidar(
      entrada({
        contratos: [comPrevisto()],
        custoIA: [ia({ custoBrl: 120 }), ia({ semanaInicio: '2026-10-05', custoBrl: 80 })],
        lancamentos: [lanc({ categoria: 'horas', valorBrl: 500 })],
      }),
    );
    expect(r.tenants[0].comparacao).toEqual({
      iaOrcadoBrl: 800,
      iaRealizadoBrl: 200,
      piorSaldoPrevistoBrl: -1500,
      resultadoCaixaAcumuladoBrl: 300, // 1000 − 120 − 80 − 500
      mesesDecorridos: 1, // 01/09 → 06/10
      mesesPrograma: 11,
    });
  });

  it('IA realizada só conta DESDE a semana do início do contrato', () => {
    const r = consolidar(entrada({ contratos: [comPrevisto({ inicio: '2026-10-01' })], custoIA: [ia({ semanaInicio: '2026-09-21', custoBrl: 999 }), ia({ custoBrl: 50 })] }));
    expect(r.tenants[0].comparacao?.iaRealizadoBrl).toBe(50); // 01/10 cai na semana de 28/09
  });

  it('🔴 sem previsto, ou com mais de um contrato vivo, NÃO compara (comparar com o contrato errado é pior que não comparar)', () => {
    expect(consolidar(entrada({ contratos: [contrato()] })).tenants[0].comparacao).toBeNull();
    const dois = [comPrevisto(), comPrevisto({ id: 'c2', nome: 'Renovação' })];
    expect(consolidar(entrada({ contratos: dois })).tenants[0].comparacao).toBeNull();
    // cancelado não conta como "vivo": sobra um só, e compara
    const cancelado = [comPrevisto(), comPrevisto({ id: 'c2', status: 'cancelado' })];
    expect(consolidar(entrada({ contratos: cancelado })).tenants[0].comparacao).not.toBeNull();
  });
});

describe('câmbio exibido', () => {
  it('mostra a fonte de cada semana e marca estimado quando não há linha', () => {
    const r = consolidar(entrada({ cambios: [{ semanaInicio: '2026-09-28', usdBrl: 5.2092, fonte: 'ptax_bcb' }] }));
    expect(r.cambios['2026-09-28']).toEqual({ usdBrl: 5.2092, fonte: 'ptax_bcb', estimado: false });
    expect(r.cambios['2026-10-05']).toEqual({ usdBrl: null, fonte: null, estimado: true });
  });
});

describe('mesesEntre', () => {
  it('meses inteiros de calendário; nunca negativo', () => {
    expect(mesesEntre('2026-09-01', '2026-10-06')).toBe(1);
    expect(mesesEntre('2026-09-15', '2026-10-14')).toBe(0);
    expect(mesesEntre('2026-09-15', '2026-10-15')).toBe(1);
    expect(mesesEntre('2025-12-31', '2026-02-28')).toBe(1);
    expect(mesesEntre('2026-12-01', '2026-10-06')).toBe(0);
  });
});
