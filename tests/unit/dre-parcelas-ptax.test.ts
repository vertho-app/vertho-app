/**
 * DRE: calendário de parcelas e PTAX do BCB.
 *
 * O que estes testes existem para impedir:
 *
 * 1. **Centavo perdido ou inventado nas parcelas.** A soma do calendário tem de
 *    ser SEMPRE o valor do contrato: R$ 100.000,00 em 7 parcelas não divide
 *    exato, e a diferença não pode sumir nem duplicar.
 * 2. **PTAX malformada virar zero na média.** Um registro sem número entraria
 *    como 0 e arrastaria o câmbio da semana (e todo o custo em reais dela) para
 *    baixo, sem erro nenhum.
 * 3. **Semana sem dia útil virar câmbio.** `value: []` (a semana em curso) é
 *    "ainda não sei", nunca uma cotação.
 */

import { describe, it, expect } from 'vitest';
import { estaAtrasada, gerarParcelas, somarMeses, venceEm } from '@/lib/dre/parcelas';
import { somar } from '@/lib/dre/dinheiro';
import { buscarPtaxDaSemana, interpretarPtax, mediaPtaxDaSemana, urlPtax } from '@/lib/dre/cambio-ptax';

describe('gerarParcelas', () => {
  it('a soma é SEMPRE o total, e a última absorve a diferença do arredondamento', () => {
    const p = gerarParcelas({ valorTotalBrl: 100_000, n: 7, primeiroVencimento: '2026-10-10' });
    expect(p).toHaveLength(7);
    expect(somar(p.map((x) => x.valorPrevistoBrl))).toBe(100_000);
    // 100000 / 7 = 14285,714… → 6 parcelas de 14.285,71 e a última de 14.285,74
    expect(p[0].valorPrevistoBrl).toBe(14_285.71);
    expect(p[6].valorPrevistoBrl).toBe(14_285.74);
    expect(p.map((x) => x.numero)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('divisão exata fica igual; 1 parcela é o total', () => {
    const p = gerarParcelas({ valorTotalBrl: 12_000, n: 12, primeiroVencimento: '2026-01-05' });
    expect(new Set(p.map((x) => x.valorPrevistoBrl))).toEqual(new Set([1000]));
    expect(gerarParcelas({ valorTotalBrl: 555.55, n: 1, primeiroVencimento: '2026-01-05' })).toEqual([
      { numero: 1, vencimento: '2026-01-05', valorPrevistoBrl: 555.55 },
    ]);
  });

  it('a soma fecha para qualquer n (varredura): nenhum centavo sobra nem falta', () => {
    for (const total of [0.01, 1, 99.99, 1234.56, 5_569_000.17]) {
      for (let n = 1; n <= 60; n++) {
        const p = gerarParcelas({ valorTotalBrl: total, n, primeiroVencimento: '2026-03-31' });
        expect(somar(p.map((x) => x.valorPrevistoBrl)), `${total} em ${n}`).toBe(total);
      }
    }
  });

  it('vencimento mensal preserva o dia, e dia 31 cai no último dia dos meses curtos', () => {
    const p = gerarParcelas({ valorTotalBrl: 300, n: 4, primeiroVencimento: '2026-01-31' });
    expect(p.map((x) => x.vencimento)).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
    expect(somarMeses('2028-01-31', 1)).toBe('2028-02-29'); // ano bissexto
    expect(somarMeses('2026-11-15', 3)).toBe('2027-02-15'); // virada de ano
  });

  it('recusa entrada que produziria calendário inválido', () => {
    expect(() => gerarParcelas({ valorTotalBrl: 100, n: 0, primeiroVencimento: '2026-01-01' })).toThrow();
    expect(() => gerarParcelas({ valorTotalBrl: 100, n: 121, primeiroVencimento: '2026-01-01' })).toThrow();
    expect(() => gerarParcelas({ valorTotalBrl: -1, n: 2, primeiroVencimento: '2026-01-01' })).toThrow();
    expect(() => gerarParcelas({ valorTotalBrl: 100, n: 2, primeiroVencimento: '2026-02-30' })).toThrow();
  });
});

describe('atraso e vencimento de parcela', () => {
  const hoje = '2026-10-05';
  it('atrasada: venceu antes de hoje E não entrou. Parcela recebida nunca é atrasada', () => {
    expect(estaAtrasada({ vencimento: '2026-10-04', recebidoEm: null }, hoje)).toBe(true);
    expect(estaAtrasada({ vencimento: '2026-10-05', recebidoEm: null }, hoje)).toBe(false); // vence hoje: não atrasou
    expect(estaAtrasada({ vencimento: '2026-09-01', recebidoEm: '2026-09-10' }, hoje)).toBe(false);
  });

  it('vence nos próximos N dias, contando hoje', () => {
    expect(venceEm({ vencimento: '2026-10-05', recebidoEm: null }, hoje, 28)).toBe(true);
    expect(venceEm({ vencimento: '2026-11-01', recebidoEm: null }, hoje, 28)).toBe(true); // dia 28
    expect(venceEm({ vencimento: '2026-11-02', recebidoEm: null }, hoje, 28)).toBe(false); // dia 29
    expect(venceEm({ vencimento: '2026-10-04', recebidoEm: null }, hoje, 28)).toBe(false);
    expect(venceEm({ vencimento: '2026-10-10', recebidoEm: '2026-10-01' }, hoje, 28)).toBe(false);
  });
});

describe('PTAX do BCB', () => {
  // Forma medida em 05/10/2026 contra o serviço real (semana de 28/09 a 02/10).
  const corpoReal = {
    '@odata.context': 'https://was-p.bcnet.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata$metadata#_CotacaoDolarPeriodo(cotacaoVenda,dataHoraCotacao)',
    value: [
      { cotacaoVenda: 5.2132, dataHoraCotacao: '2026-09-28 13:03:11.35885' },
      { cotacaoVenda: 5.2204, dataHoraCotacao: '2026-09-29 13:06:06.446305' },
      { cotacaoVenda: 5.1809, dataHoraCotacao: '2026-09-30 13:11:44.783262' },
      { cotacaoVenda: 5.2079, dataHoraCotacao: '2026-10-01 13:10:35.4469' },
      { cotacaoVenda: 5.2238, dataHoraCotacao: '2026-10-02 13:03:16.256632' },
    ],
  };

  it('a URL usa o formato MM-DD-YYYY entre aspas que o OData do BCB exige', () => {
    const u = urlPtax('2026-09-28');
    expect(u).toContain("@dataInicial='09-28-2026'");
    expect(u).toContain("@dataFinalCotacao='10-04-2026'"); // o domingo da semana
    expect(u).toContain('$format=json');
    expect(u.startsWith('https://olinda.bcb.gov.br/')).toBe(true);
  });

  it('média simples dos dias úteis da semana, a 4 casas', () => {
    const m = mediaPtaxDaSemana(interpretarPtax(corpoReal), '2026-09-28');
    expect(m).toEqual({ usdBrl: 5.2092, dias: 5 }); // (5,2132+5,2204+5,1809+5,2079+5,2238)/5 = 5,20924
  });

  it('só entra a cotação que cai DENTRO da semana pedida', () => {
    const todas = interpretarPtax(corpoReal);
    const semanaSeguinte = mediaPtaxDaSemana(todas, '2026-10-05');
    expect(semanaSeguinte).toBeNull();
    // uma cotação de sexta anterior não contamina a média
    const comVizinha = [...todas, { data: '2026-09-25', venda: 9.99 }];
    expect(mediaPtaxDaSemana(comVizinha, '2026-09-28')?.dias).toBe(5);
  });

  it('registro malformado é DESCARTADO, não vira zero na média', () => {
    const c = interpretarPtax({
      value: [
        { cotacaoVenda: 5.2, dataHoraCotacao: '2026-09-28 13:00:00' },
        { cotacaoVenda: null, dataHoraCotacao: '2026-09-29 13:00:00' },
        { cotacaoVenda: 0, dataHoraCotacao: '2026-09-30 13:00:00' },
        { cotacaoVenda: 'abc', dataHoraCotacao: '2026-10-01 13:00:00' },
        { cotacaoVenda: 5.4, dataHoraCotacao: 'lixo' },
        { cotacaoVenda: 5.4 },
      ],
    });
    expect(c).toEqual([{ data: '2026-09-28', venda: 5.2 }]);
    expect(interpretarPtax(null)).toEqual([]);
    expect(interpretarPtax({ value: 'x' })).toEqual([]);
  });

  it('buscar: resposta válida devolve a média; semana sem dia útil devolve null (não zero)', async () => {
    const ok = (corpo: unknown) => (async () => new Response(JSON.stringify(corpo), { status: 200 })) as unknown as typeof fetch;
    expect(await buscarPtaxDaSemana('2026-09-28', { fetchImpl: ok(corpoReal) })).toEqual({ usdBrl: 5.2092, dias: 5 });
    expect(await buscarPtaxDaSemana('2026-10-05', { fetchImpl: ok({ value: [] }) })).toBeNull();
  });

  it('buscar: HTTP de erro LANÇA (quem chama decide a política), em vez de virar cotação', async () => {
    const quebrado = (async () => new Response('erro', { status: 503 })) as unknown as typeof fetch;
    await expect(buscarPtaxDaSemana('2026-09-28', { fetchImpl: quebrado })).rejects.toThrow(/HTTP 503/);
    const rede = (async () => {
      throw new Error('ECONNRESET');
    }) as unknown as typeof fetch;
    await expect(buscarPtaxDaSemana('2026-09-28', { fetchImpl: rede })).rejects.toThrow(/ECONNRESET/);
  });
});
