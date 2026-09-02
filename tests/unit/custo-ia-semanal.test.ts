/**
 * Relatório semanal de custo de IA — janela, agregação e e-mail.
 *
 * O que estes testes existem para impedir, em ordem de dano:
 *
 * 1. **A semana errada.** O relatório fecha na segunda às 04:00 de Brasília e o
 *    Vercel agenda em UTC. Um erro de três horas aqui não quebra nada: ele
 *    produz um relatório completo, bonito e com o período errado — o pior modo
 *    de falha possível para um número que vai virar decisão de custo.
 * 2. **Perder a fatia de plataforma.** 35% do dinheiro não tem `empresa_id`.
 *    Um "por empresa" que filtre nulo devolve dois terços da conta com cara de
 *    conta inteira.
 * 3. **Cortar a cauda em silêncio.** O detalhe por empresa tem teto; sem a
 *    linha de resto, a tabela não fecha com o total do topo.
 */

import { describe, it, expect } from 'vitest';
import {
  janelaSemanaFechada,
  montarRelatorio,
  rotuloPeriodo,
  destinosDoRelatorio,
  avisoInstrumento,
  type LinhaAgregada,
} from '@/lib/custo-ia/relatorio-semanal';
import { montarEmailCustoIA, variacao, fmtUsd } from '@/lib/custo-ia/email';

/** Uma linha da RPC, com só o que o teste precisa dizer. */
function linha(p: Partial<LinhaAgregada> = {}): LinhaAgregada {
  return {
    empresaId: null,
    empresaNome: null,
    empresaSlug: null,
    feature: 'ia3_cenarios',
    provider: 'anthropic',
    model: 'claude-sonnet-5',
    chamadas: 1,
    chamadasNaoOk: 0,
    linhasSemCusto: 0,
    inputTokens: 1000,
    outputTokens: 500,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    custoUsd: 1,
    ...p,
  };
}

const JANELA_FIXA = {
  ini: new Date('2026-08-24T03:00:00Z'),
  fim: new Date('2026-08-31T03:00:00Z'),
};

describe('janela: a semana FECHADA em Brasília', () => {
  // 07:00 UTC de segunda = 04:00 BRT, que é o horário do cron no vercel.json.
  const NA_HORA_DO_CRON = new Date('2026-09-07T07:00:00Z');

  it('🔴 fecha em segunda 00:00 BRT e cobre os 7 dias anteriores', () => {
    const j = janelaSemanaFechada(NA_HORA_DO_CRON);
    // 03:00Z é meia-noite em Brasília. Se algum dia estes ISOs virarem 00:00Z,
    // o relatório passou a cobrir de domingo 21:00 a domingo 21:00.
    expect(j.ini.toISOString()).toBe('2026-08-31T03:00:00.000Z');
    expect(j.fim.toISOString()).toBe('2026-09-07T03:00:00.000Z');
    expect(j.fim.getTime() - j.ini.getTime()).toBe(7 * 86_400_000);
  });

  it('🔴 domingo 23:59:59 BRT entra; segunda 00:00 BRT não', () => {
    const { ini, fim } = janelaSemanaFechada(NA_HORA_DO_CRON);
    const ultimoInstanteDoDomingo = new Date('2026-09-07T02:59:59Z');
    const primeiroInstanteDaSegunda = new Date('2026-09-07T03:00:00Z');

    expect(ultimoInstanteDoDomingo >= ini && ultimoInstanteDoDomingo < fim).toBe(true);
    // Fim EXCLUSIVO: com fim inclusivo esta chamada entraria em duas semanas.
    expect(primeiroInstanteDaSegunda < fim).toBe(false);

    // E a segunda que ABRE a janela entra (a borda de baixo é inclusiva).
    expect(new Date('2026-08-31T03:00:00Z') >= ini).toBe(true);
  });

  it('a janela não muda ao longo da segunda-feira', () => {
    const madrugada = janelaSemanaFechada(new Date('2026-09-07T07:00:00Z'));
    const fimDaTarde = janelaSemanaFechada(new Date('2026-09-07T23:00:00Z'));
    expect(fimDaTarde).toEqual(madrugada);
  });

  it('rodando no domingo, devolve a semana anterior à que está em curso', () => {
    // Domingo 06/09, 12:00 BRT. A semana em curso (31/08–06/09) ainda não fechou.
    const j = janelaSemanaFechada(new Date('2026-09-06T15:00:00Z'));
    expect(rotuloPeriodo(j)).toBe('24/08 a 30/08/2026');
  });

  it('o rótulo nomeia o último dia COBERTO, não a borda exclusiva', () => {
    // A janela termina em 31/08 00:00, mas o último dia com dado é 30/08.
    expect(rotuloPeriodo(JANELA_FIXA)).toBe('24/08 a 30/08/2026');
  });
});

describe('agregação por empresa', () => {
  const linhas = [
    linha({ empresaId: 'e1', empresaNome: 'Ibipeba', empresaSlug: 'ibipeba', custoUsd: 60, chamadas: 400 }),
    linha({ empresaId: 'e1', empresaNome: 'Ibipeba', empresaSlug: 'ibipeba', feature: 'kit_semanal', model: 'gemini-3.1-flash', custoUsd: 2, chamadas: 40 }),
    linha({ empresaId: 'e2', empresaNome: 'Macaé', custoUsd: 8, chamadas: 30 }),
    linha({ empresaId: null, feature: 'ia4_check', custoUsd: 30, chamadas: 300 }),
  ];

  it('🔴 a fatia sem empresa_id vira bloco de plataforma e ENTRA no total', () => {
    const r = montarRelatorio(JANELA_FIXA, linhas, []);
    expect(r.plataforma).not.toBeNull();
    expect(r.plataforma!.custoUsd).toBe(30);
    expect(r.plataforma!.atribuida).toBe(false);
    // A invariante que importa: o total fecha com TUDO, atribuído ou não.
    expect(r.totalUsd).toBe(100);
    // E ela não se disfarça de tenant na lista de empresas.
    expect(r.empresas.map((e) => e.nome)).toEqual(['Ibipeba', 'Macaé']);
  });

  it('soma as features do mesmo tenant e ordena por custo', () => {
    const r = montarRelatorio(JANELA_FIXA, linhas, []);
    const ibipeba = r.empresas[0];
    expect(ibipeba.custoUsd).toBe(62);
    expect(ibipeba.chamadas).toBe(440);
    expect(ibipeba.features.map((f) => f.nome)).toEqual(['ia3_cenarios', 'kit_semanal']);
    expect(ibipeba.modelos.map((m) => m.nome)).toEqual(['claude-sonnet-5', 'gemini-3.1-flash']);
  });

  it('empresa sem cadastro fica identificada pelo id, não vira plataforma', () => {
    const r = montarRelatorio(JANELA_FIXA, [linha({ empresaId: 'abcdef12-3456', empresaNome: null, custoUsd: 5 })], []);
    expect(r.plataforma).toBeNull();
    expect(r.empresas[0].nome).toContain('abcdef12');
    expect(r.empresas[0].atribuida).toBe(true);
  });

  it('o Δ por empresa vem da MESMA chave na semana anterior', () => {
    const anteriores = [
      linha({ empresaId: 'e1', custoUsd: 40 }),
      linha({ empresaId: null, custoUsd: 10 }),
    ];
    const r = montarRelatorio(JANELA_FIXA, linhas, anteriores);
    expect(r.empresas[0].custoAnteriorUsd).toBe(40); // Ibipeba: 40 → 62
    expect(r.empresas[1].custoAnteriorUsd).toBeNull(); // Macaé não existia lá
    expect(r.plataforma!.custoAnteriorUsd).toBe(10);
    expect(r.totalAnteriorUsd).toBe(50);
  });

  it('chamada sem custo gravado é contada, não somada como zero calado', () => {
    const r = montarRelatorio(
      JANELA_FIXA,
      [linha({ empresaId: 'e1', custoUsd: 0, linhasSemCusto: 7, chamadas: 7 })],
      [],
    );
    expect(r.totalSemCusto).toBe(7);
    expect(r.empresas[0].linhasSemCusto).toBe(7);
  });

  it('semana sem nenhuma linha é resultado, não erro', () => {
    const r = montarRelatorio(JANELA_FIXA, [], []);
    expect(r.semDados).toBe(true);
    expect(r.totalUsd).toBe(0);
  });
});

describe('variação contra a semana anterior', () => {
  it('🔴 base zero ou ausente não vira divisão por zero', () => {
    expect(variacao(10, null).texto).toBe('novo');
    expect(variacao(10, 0).texto).toBe('novo');
    expect(variacao(0, 0).texto).toBe('—');
  });

  it('sinal e arredondamento', () => {
    expect(variacao(150, 100).texto).toBe('+50%');
    expect(variacao(50, 100).texto).toBe('-50%');
  });
});

describe('e-mail', () => {
  const base = montarRelatorio(
    JANELA_FIXA,
    [
      linha({ empresaId: 'e1', empresaNome: 'Ibipeba', empresaSlug: 'ibipeba', custoUsd: 62 }),
      linha({ empresaId: null, feature: 'ia4_check', custoUsd: 33 }),
    ],
    [linha({ empresaId: 'e1', custoUsd: 40 })],
  );

  it('o assunto carrega período e total (é a única linha que se lê fechado)', () => {
    const { assunto } = montarEmailCustoIA(base);
    expect(assunto).toContain('24/08 a 30/08/2026');
    expect(assunto).toContain('95,00');
  });

  it('🔴 o corpo mostra a fatia de plataforma, não só os tenants', () => {
    const { html } = montarEmailCustoIA(base);
    expect(html).toContain('Ibipeba');
    expect(html).toContain('não atribuído a tenant');
    // A nota de cobertura é o que impede ler o total como "todo o custo de IA".
    expect(html).toContain('Ficam de fora');
  });

  it('🔴 nome vindo do banco é escapado', () => {
    const r = montarRelatorio(
      JANELA_FIXA,
      [linha({ empresaId: 'e1', empresaNome: '<script>alert(1)</script>', custoUsd: 1 })],
      [],
    );
    const { html } = montarEmailCustoIA(r);
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('🔴 o corte da cauda devolve o resto somado, e o detalhe fecha com o bloco', () => {
    const muitas = Array.from({ length: 20 }, (_, i) =>
      linha({ empresaId: 'e1', empresaNome: 'Ibipeba', feature: `feature_${i}`, custoUsd: i + 1 }),
    );
    const r = montarRelatorio(JANELA_FIXA, muitas, []);
    const { html } = montarEmailCustoIA(r);
    expect(html).toContain('outras 8 atividades');
    // Soma da coluna renderizada = custo do bloco (1..20 = 210).
    expect(r.empresas[0].custoUsd).toBe(210);
    const exibidos = r.empresas[0].features.slice(0, 12).reduce((s, f) => s + f.custoUsd, 0);
    const resto = r.empresas[0].features.slice(12).reduce((s, f) => s + f.custoUsd, 0);
    expect(exibidos + resto).toBe(210);
  });

  it('semana vazia gera e-mail que diz isso, e sugere olhar o ledger', () => {
    const { assunto, html } = montarEmailCustoIA(montarRelatorio(JANELA_FIXA, [], []));
    expect(assunto).toContain('nenhuma chamada registrada');
    expect(html).toContain('ia-ledger');
  });

  it('valor abaixo de um centavo não é apresentado como zero', () => {
    expect(fmtUsd(0.004)).toBe('menos de US$ 0,01');
    expect(fmtUsd(0)).toBe('US$ 0,00');
  });
});

describe('aviso de mudança de instrumento (TTS no ledger desde 30/08/2026)', () => {
  it('avisa enquanto a comparação alcança a semana anterior à virada', () => {
    expect(avisoInstrumento({ ini: new Date('2026-08-31T03:00:00Z') })).toContain('TTS');
  });

  it('cala quando as duas semanas comparadas já medem TTS', () => {
    expect(avisoInstrumento({ ini: new Date('2026-09-14T03:00:00Z') })).toBeNull();
  });
});

describe('destinatários', () => {
  it('🔴 ADMIN_EMAILS não é fallback: aquela env concede admin de plataforma', () => {
    const admin = process.env.ADMIN_EMAILS;
    const proprio = process.env.CUSTO_IA_REPORT_EMAILS;
    try {
      process.env.ADMIN_EMAILS = 'invasor@exemplo.com';
      delete process.env.CUSTO_IA_REPORT_EMAILS;
      expect(destinosDoRelatorio()).toEqual(['rodrigo@vertho.ai']);

      process.env.CUSTO_IA_REPORT_EMAILS = 'a@vertho.ai, b@vertho.ai , a@vertho.ai';
      expect(destinosDoRelatorio()).toEqual(['a@vertho.ai', 'b@vertho.ai']);
    } finally {
      if (admin === undefined) delete process.env.ADMIN_EMAILS;
      else process.env.ADMIN_EMAILS = admin;
      if (proprio === undefined) delete process.env.CUSTO_IA_REPORT_EMAILS;
      else process.env.CUSTO_IA_REPORT_EMAILS = proprio;
    }
  });
});
