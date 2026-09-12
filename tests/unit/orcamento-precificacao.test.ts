/**
 * A régua do orçamento: o preço vem do ESCOPO, o prazo só divide.
 *
 * O primeiro teste é o que existe por causa de um bug real (07/09/2026): a
 * receita fazia `mensalidade × meses` e o custo `custo × ciclos`, então parcelar
 * o mesmo projeto em 24 meses quase dobrava o preço (medido: ×1,96) e entregar
 * dois ciclos não mexia nele (×1,00). Um erro de modelo não some sozinho — volta
 * na próxima vez que alguém "corrigir" a fórmula para premiar contrato longo.
 */
import { describe, expect, it } from 'vitest';
import {
  CONTEUDO_POR_FORMATO_DEFAULT,
  OPCOES_COMISSAO_ORCAMENTO,
  ORCAMENTO_DEFAULTS,
  calcularProjeto,
  custoConteudoComReuso,
  distribuirMatrizes,
  obterComissaoOrcamento,
  parcelasPorCiclos,
  ratearCustoPorPessoa,
  reusoConteudoPorCelula,
  type TabelaPreco,
  type EscopoProjeto,
  type CustoProjeto,
} from '@/lib/orcamento/precificacao';

const PRECO: TabelaPreco = {
  setupGeral: 2000,
  pessoaCiclo: 300,
  unidade: 2000,
  matrizNova: 1000,
  matrizAdaptada: 500,
  workshop: 15000,
  descontoPct: 0,
  margemAlvoPct: 50,
};

const BASE: EscopoProjeto = {
  pessoas: 100,
  ciclos: 1,
  unidades: 1,
  matrizesNovas: 3,
  matrizesAdaptadas: 0,
  workshop: false,
  parcelas: 12,
};

const CUSTO: CustoProjeto = { totalBrl: 8000, oneTimeBrl: 5000, mesesPrograma: 4 };

describe('premissas comerciais do orçamento', () => {
  it('mantém os padrões aprovados na régua única', () => {
    expect(ORCAMENTO_DEFAULTS).toMatchObject({
      precoPessoaCiclo: 300,
      precoMatrizNova: 1000,
      precoMatrizAdaptada: 500,
      margemAlvoPct: 50,
      impostosPct: 20,
      contingenciaPct: 10,
      horasWorkshop: 8,
      msgsPorPessoaCiclo: 25,
      custoMsgUnitario: 0.035,
    });
    expect(CONTEUDO_POR_FORMATO_DEFAULT).toBe(12);
  });

  it('oferece as três políticas de comissão aprovadas', () => {
    expect(OPCOES_COMISSAO_ORCAMENTO.map(({ key, percentual }) => ({ key, percentual }))).toEqual([
      { key: 'rc', percentual: 20 },
      { key: 'consultor_parceiro', percentual: 10 },
      { key: 'consultor_integrador', percentual: 0 },
    ]);
    expect(obterComissaoOrcamento('canal_invalido').key).toBe('rc');
  });

  it('rateia o custo all-in por pessoa no contrato e por ciclo', () => {
    expect(ratearCustoPorPessoa(6000, 100, 3)).toEqual({ contrato: 60, porCiclo: 20 });
    expect(ratearCustoPorPessoa(6000, 0, 3)).toEqual({ contrato: 0, porCiclo: 0 });
  });

  it('deriva duas parcelas por ciclo', () => {
    expect(parcelasPorCiclos(1)).toBe(2);
    expect(parcelasPorCiclos(3)).toBe(6);
  });

  it('transforma todos os cargos restantes em matrizes adaptadas', () => {
    expect(distribuirMatrizes(50, 3)).toEqual({ novas: 3, adaptadas: 47 });
    expect(distribuirMatrizes(2, 5)).toEqual({ novas: 2, adaptadas: 0 });
  });

  it('calcula o reúso médio por cargo e pelos quatro perfis DISC', () => {
    expect(reusoConteudoPorCelula(3000, 50)).toBe(15);
    expect(reusoConteudoPorCelula(2, 50)).toBe(1);
  });

  it('inclui vídeo, podcast, texto e estudo de caso no custo compartilhado', () => {
    const custo = custoConteudoComReuso(
      { video: 12, podcast: 12, texto: 12, case: 12 },
      { video: 1, podcast: 2, texto: 3, case: 4 },
      3000,
      15,
    );

    expect(custo.porPessoa).toBe(8);
    expect(custo.total).toBe(24_000);
  });
});

describe('precificação do projeto', () => {
  it('o prazo NÃO muda o valor do projeto — só a parcela', () => {
    const em12 = calcularProjeto(BASE, PRECO, CUSTO);
    const em24 = calcularProjeto({ ...BASE, parcelas: 24 }, PRECO, CUSTO);

    expect(em24.valorFinal).toBe(em12.valorFinal);
    expect(em24.parcela).toBeCloseTo(em12.parcela / 2, 6);
  });

  it('o ciclo a mais MUDA o valor do projeto', () => {
    const um = calcularProjeto(BASE, PRECO, CUSTO);
    const dois = calcularProjeto({ ...BASE, ciclos: 2 }, PRECO, CUSTO);

    // O one-time não dobra (implantação é uma só); o programa sim.
    expect(dois.programa).toBe(um.programa * 2);
    expect(dois.oneTime).toBe(um.oneTime);
    expect(dois.valorFinal).toBeGreaterThan(um.valorFinal);
  });

  it('aplica o novo preço de R$ 300 por pessoa/ciclo', () => {
    // 100 pessoas × R$ 300/ciclo + R$ 7.000 de one-time.
    const r = calcularProjeto(BASE, PRECO, CUSTO);
    expect(r.valorTabela).toBe(37_000);
  });

  it('matriz reusada não entra na conta; adaptada entra pela metade', () => {
    const tresNovas = calcularProjeto(BASE, PRECO, CUSTO);
    const umaNovaDuasReusadas = calcularProjeto({ ...BASE, matrizesNovas: 1 }, PRECO, CUSTO);
    const umaNovaDuasAdaptadas = calcularProjeto({ ...BASE, matrizesNovas: 1, matrizesAdaptadas: 2 }, PRECO, CUSTO);

    expect(tresNovas.oneTime - umaNovaDuasReusadas.oneTime).toBe(2 * PRECO.matrizNova);
    expect(umaNovaDuasAdaptadas.oneTime - umaNovaDuasReusadas.oneTime).toBe(2 * PRECO.matrizAdaptada);
  });

  it('o desconto máximo é o que ainda entrega a margem-alvo', () => {
    const r = calcularProjeto(BASE, PRECO, CUSTO);
    // Aplicar exatamente o piso deve deixar a margem na alvo (com folga de arredondamento).
    const noPiso = calcularProjeto(BASE, { ...PRECO, descontoPct: r.descontoMaxPct }, CUSTO);
    expect(noPiso.margemPct).toBeCloseTo(PRECO.margemAlvoPct, 6);
    expect(noPiso.acimaDoPiso).toBe(false);

    const umPontoAcima = calcularProjeto(BASE, { ...PRECO, descontoPct: r.descontoMaxPct + 1 }, CUSTO);
    expect(umPontoAcima.acimaDoPiso).toBe(true);
    expect(umPontoAcima.margemPct).toBeLessThan(PRECO.margemAlvoPct);
  });

  it('comissão e impostos entram na margem e no desconto máximo', () => {
    const comEncargos: CustoProjeto = {
      ...CUSTO,
      percentualSobreReceita: 0.21,
    };
    const r = calcularProjeto(BASE, PRECO, comEncargos);

    expect(r.custoSobreReceita).toBeCloseTo(r.valorFinal * 0.21, 6);
    expect(r.margemAbs).toBeCloseTo(r.valorFinal - CUSTO.totalBrl - r.custoSobreReceita, 6);

    const noPiso = calcularProjeto(BASE, { ...PRECO, descontoPct: r.descontoMaxPct }, comEncargos);
    expect(noPiso.margemPct).toBeCloseTo(PRECO.margemAlvoPct, 6);
    expect(noPiso.acimaDoPiso).toBe(false);
  });

  it('a exposição começa negativa e o pior mês não é o último', () => {
    // Com implantação concentrada na largada, o caixa afunda antes de virar.
    const r = calcularProjeto(BASE, PRECO, { totalBrl: 90_000, oneTimeBrl: 70_000, mesesPrograma: 4 });
    expect(r.exposicao[0].saldo).toBeLessThan(0);
    expect(r.piorSaldo.mes).toBeLessThan(r.exposicao.length);
    expect(r.exposicao[r.exposicao.length - 1].saldo).toBeGreaterThan(r.piorSaldo.saldo);
  });

  it('mais parcelas afundam mais o caixa, com o mesmo projeto', () => {
    const custoPesado: CustoProjeto = { totalBrl: 90_000, oneTimeBrl: 70_000, mesesPrograma: 4 };
    const em12 = calcularProjeto(BASE, PRECO, custoPesado);
    const em36 = calcularProjeto({ ...BASE, parcelas: 36 }, PRECO, custoPesado);

    // É por isso que prazo longo não merece desconto: ele não aumenta o que o
    // cliente compra, aumenta o tempo em que a Vertho financia a entrega.
    expect(em36.piorSaldo.saldo).toBeLessThan(em12.piorSaldo.saldo);
    expect(em36.valorFinal).toBe(em12.valorFinal);
  });

  it('o último saldo de caixa é a margem depois dos custos sobre a receita', () => {
    const r = calcularProjeto(BASE, PRECO, { ...CUSTO, percentualSobreReceita: 0.21 });
    expect(r.exposicao.at(-1)?.saldo).toBeCloseTo(r.margemAbs, 6);
  });
});
