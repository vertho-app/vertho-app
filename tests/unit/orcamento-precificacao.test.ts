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
import { calcularProjeto, type TabelaPreco, type EscopoProjeto, type CustoProjeto } from '@/lib/orcamento/precificacao';

const PRECO: TabelaPreco = {
  setupGeral: 2000,
  pessoaCiclo: 1200,
  unidade: 2000,
  matrizNova: 500,
  matrizAdaptada: 250,
  workshop: 15000,
  descontoPct: 0,
  margemAlvoPct: 60,
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

const CUSTO: CustoProjeto = { totalBrl: 20000, oneTimeBrl: 12000, mesesPrograma: 4 };

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

  it('preserva o valor que a tela praticava antes da mudança', () => {
    // 100 pessoas × R$ 100/mês × 12 meses + R$ 5.500 de one-time = R$ 125.500.
    // A mecânica mudou; o preço do cenário base, não.
    const r = calcularProjeto(BASE, PRECO, CUSTO);
    expect(r.valorTabela).toBe(125_500);
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
});
