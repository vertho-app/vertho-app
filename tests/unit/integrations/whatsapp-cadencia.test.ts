// Política de cadência dos lotes de WhatsApp (lib/whatsapp/cadencia.ts).
//
// Existe por causa do bloqueio de 11/08/2026: 155 mensagens publicadas com
// `idx * 2s` (~30/min) derrubaram o número em 1min47s. O que está sob teste é
// a política — intervalo, jitter, monotonicidade e o teto que NÃO corta calado.
//
// Invariantes (uma por `it`):
//   1. Intervalo default ≫ os 2s do incidente, e configurável por env.
//   2. Atrasos são MONÓTONOS — jitter não pode reordenar o lote.
//   3. Jitter fica dentro da faixa e não é constante (o padrão perfeito é
//      assinatura de robô).
//   4. Teto corta o excedente E devolve, com aviso — nunca em silêncio.
//   5. Teto não interfere quando o lote cabe.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  aplicarTetoLote,
  atrasosDoLote,
  criarPaceadorSincrono,
  criarRelogioCadencia,
  duracaoEstimada,
  intervaloLoteMs,
  maxPorDisparo,
} from '@/lib/whatsapp/cadencia';

const ENVS = ['WHATSAPP_LOTE_INTERVALO_MS', 'WHATSAPP_LOTE_MAX', 'WHATSAPP_LOTE_JITTER'] as const;

describe('cadência de lote — intervalo', () => {
  beforeEach(() => ENVS.forEach((e) => delete process.env[e]));
  afterEach(() => ENVS.forEach((e) => delete process.env[e]));

  it('usa default muito acima dos 2s que causaram o bloqueio', () => {
    expect(intervaloLoteMs()).toBe(15_000);
    // A régua do incidente: qualquer default que permita ~30 msg/min é regressão.
    expect(60_000 / intervaloLoteMs()).toBeLessThanOrEqual(10);
  });

  it('respeita WHATSAPP_LOTE_INTERVALO_MS', () => {
    process.env.WHATSAPP_LOTE_INTERVALO_MS = '30000';
    expect(intervaloLoteMs()).toBe(30_000);
  });

  it('ignora env inválida em vez de virar 0 (que restauraria a rajada)', () => {
    for (const ruim of ['abc', '0', '-5', '']) {
      process.env.WHATSAPP_LOTE_INTERVALO_MS = ruim;
      expect(intervaloLoteMs()).toBe(15_000);
    }
  });
});

describe('cadência de lote — atrasos', () => {
  beforeEach(() => ENVS.forEach((e) => delete process.env[e]));
  afterEach(() => ENVS.forEach((e) => delete process.env[e]));

  it('primeira mensagem sai imediatamente', () => {
    expect(atrasosDoLote(5)[0]).toBe(0);
  });

  it('atrasos são monótonos — jitter não reordena o lote', () => {
    // rng nos extremos (0 e 1) = jitter máximo para os dois lados.
    let i = 0;
    const rng = () => [0, 1, 0.5, 0, 1][i++ % 5];
    const at = atrasosDoLote(40, rng);

    for (let k = 1; k < at.length; k++) {
      expect(at[k]).toBeGreaterThanOrEqual(at[k - 1]);
    }
  });

  it('aplica jitter dentro da faixa e não gera intervalo constante', () => {
    process.env.WHATSAPP_LOTE_INTERVALO_MS = '10000';
    let i = 0;
    const rng = () => [0, 1, 0.25, 0.75][i++ % 4]; // varia de propósito
    const at = atrasosDoLote(30, rng);

    const deltas: number[] = [];
    for (let k = 1; k < at.length; k++) deltas.push(at[k] - at[k - 1]);

    // ±30% de 10s => [7s, 13s]
    for (const d of deltas) {
      expect(d).toBeGreaterThanOrEqual(6);
      expect(d).toBeLessThanOrEqual(14);
    }
    expect(new Set(deltas).size).toBeGreaterThan(1); // não é cadência robótica
  });

  it('com jitter desligado o intervalo é exatamente o configurado', () => {
    process.env.WHATSAPP_LOTE_INTERVALO_MS = '12000';
    process.env.WHATSAPP_LOTE_JITTER = '0';

    expect(atrasosDoLote(4, () => 0.5)).toEqual([0, 12, 24, 36]);
  });

  it('lote de 155 leva dezenas de minutos, não 5 (a régua do incidente)', () => {
    const at = atrasosDoLote(155, () => 0.5);
    const totalMin = at[at.length - 1] / 60;

    expect(totalMin).toBeGreaterThan(30);
  });
});

describe('cadência de lote — teto de volume', () => {
  beforeEach(() => ENVS.forEach((e) => delete process.env[e]));
  afterEach(() => ENVS.forEach((e) => delete process.env[e]));

  it('não mexe no lote que cabe no teto', () => {
    const itens = Array.from({ length: 10 }, (_, i) => i);
    const r = aplicarTetoLote(itens);

    expect(r.enviar).toEqual(itens);
    expect(r.adiados).toEqual([]);
    expect(r.aviso).toBe('');
  });

  it('corta o excedente E devolve — o corte nunca é silencioso', () => {
    process.env.WHATSAPP_LOTE_MAX = '100';
    const itens = Array.from({ length: 155 }, (_, i) => i);
    const r = aplicarTetoLote(itens);

    expect(r.enviar).toHaveLength(100);
    expect(r.adiados).toHaveLength(55);
    // O que garante que ninguém suma: enviar + adiados = tudo, na ordem.
    expect([...r.enviar, ...r.adiados]).toEqual(itens);
    expect(r.aviso).toContain('55');
    expect(r.aviso).toContain('NÃO enviados');
  });

  it('teto default protege um lote grande sem env nenhuma', () => {
    expect(maxPorDisparo()).toBe(120);
    expect(aplicarTetoLote(Array.from({ length: 500 }, (_, i) => i)).adiados).toHaveLength(380);
  });
});

// O relógio incremental existe para quem NÃO sabe o total de antemão — o cron
// diário descobre as mensagens no loop (pílula, missão, nudge, evidência), e era
// ele que ainda rodava a 2s/mensagem depois da correção dos disparos manuais.
describe('cadência de lote — relógio incremental', () => {
  beforeEach(() => ENVS.forEach((e) => delete process.env[e]));
  afterEach(() => ENVS.forEach((e) => delete process.env[e]));

  it('produz a MESMA sequência que atrasosDoLote (uma política, não duas)', () => {
    process.env.WHATSAPP_LOTE_JITTER = '0';
    const relogio = criarRelogioCadencia(() => 0.5);
    const passo = [0, 1, 2, 3, 4].map(() => relogio.proximo());

    expect(passo).toEqual(atrasosDoLote(5, () => 0.5));
  });

  it('conta o que agendou e avisa quando o teto foi consumido', () => {
    process.env.WHATSAPP_LOTE_MAX = '3';
    const relogio = criarRelogioCadencia(() => 0.5);

    expect(relogio.tetoAtingido()).toBe(false);
    relogio.proximo(); relogio.proximo();
    expect(relogio.agendadas()).toBe(2);
    expect(relogio.tetoAtingido()).toBe(false);

    relogio.proximo();
    // A 3ª consumiu o teto: perguntar ANTES de agendar é o que impede a 4ª.
    expect(relogio.agendadas()).toBe(3);
    expect(relogio.tetoAtingido()).toBe(true);
  });

  it('o teto é lido na CRIAÇÃO — trocar a env no meio não afrouxa o disparo', () => {
    process.env.WHATSAPP_LOTE_MAX = '2';
    const relogio = criarRelogioCadencia(() => 0.5);
    relogio.proximo(); relogio.proximo();

    process.env.WHATSAPP_LOTE_MAX = '500';
    expect(relogio.tetoAtingido()).toBe(true);
  });

  it('a cadência do cron diário não pode voltar a ~30 msg/min', () => {
    // A régua do incidente aplicada ao caminho automático: 36 mensagens (a coorte
    // de Ibipeba hoje) levavam 72s a 2s/msg. Com a política, minutos.
    const relogio = criarRelogioCadencia(() => 0.5);
    let ultimo = 0;
    for (let i = 0; i < 36; i++) ultimo = relogio.proximo();

    expect(ultimo / 60).toBeGreaterThan(5);
  });
});

describe('duracaoEstimada', () => {
  beforeEach(() => ENVS.forEach((e) => delete process.env[e]));
  afterEach(() => ENVS.forEach((e) => delete process.env[e]));

  it('descreve a duração para a UI', () => {
    expect(duracaoEstimada(0)).toBe('imediato');
    expect(duracaoEstimada(1)).toBe('imediato');
    expect(duracaoEstimada(5)).toBe('~1 min');
    expect(duracaoEstimada(155)).toBe('~39 min');
    expect(duracaoEstimada(300)).toBe('~1h15');
  });
});

// ── Paceador síncrono ────────────────────────────────────────────────────────
//
// Para os emissores que NÃO passam pela fila: `lib/conarh/regua.ts` (que mandava
// sem intervalo nenhum) e `actions/automacao-envios.ts` (1,5s, com documento).
// O relógio é injetado — o teste mede a POLÍTICA, não a paciência de quem roda
// a suíte.
describe('paceador síncrono', () => {
  beforeEach(() => [...ENVS, 'WHATSAPP_LOTE_SINCRONO_ORCAMENTO_MS'].forEach((e) => delete process.env[e]));
  afterEach(() => [...ENVS, 'WHATSAPP_LOTE_SINCRONO_ORCAMENTO_MS'].forEach((e) => delete process.env[e]));

  /** Relógio falso: `dormir` avança o tempo, `gastar` simula a chamada de rede. */
  function relogioFalso() {
    let t = 0;
    return {
      agora: () => t,
      dormir: async (ms: number) => { t += ms; },
      gastar: (ms: number) => { t += ms; },
      lido: () => t,
    };
  }

  it('a primeira mensagem não espera', async () => {
    const rel = relogioFalso();
    const p = criarPaceadorSincrono({ rng: () => 0.5, dormir: rel.dormir, agora: rel.agora });

    await p.aguardarVez();

    expect(rel.lido()).toBe(0);
    expect(p.liberadas()).toBe(1);
  });

  it('a segunda espera o intervalo da política, não um literal', async () => {
    const rel = relogioFalso();
    const p = criarPaceadorSincrono({ rng: () => 0.5, dormir: rel.dormir, agora: rel.agora });

    await p.aguardarVez();
    await p.aguardarVez();

    // rng 0.5 → fator 1 → intervalo cheio. O que importa: ≫ os 1,2s-2s do incidente.
    expect(rel.lido()).toBe(15_000);
  });

  it('desconta o tempo que a iteração anterior gastou — a política é TAXA, não sleep', async () => {
    const rel = relogioFalso();
    const p = criarPaceadorSincrono({ rng: () => 0.5, dormir: rel.dormir, agora: rel.agora });

    await p.aguardarVez();
    rel.gastar(9_000);      // render do PDF + envio demoraram 9s
    await p.aguardarVez();

    // 9s já passaram: espera só os 6s que faltam para completar o intervalo.
    expect(rel.lido()).toBe(15_000);
  });

  it('iteração mais lenta que o intervalo não dorme nada (nunca atraso negativo)', async () => {
    const rel = relogioFalso();
    const p = criarPaceadorSincrono({ rng: () => 0.5, dormir: rel.dormir, agora: rel.agora });

    await p.aguardarVez();
    rel.gastar(40_000);
    await p.aguardarVez();

    expect(rel.lido()).toBe(40_000);
  });

  it('teto de VOLUME fecha a porta no limite configurado', async () => {
    process.env.WHATSAPP_LOTE_MAX = '3';
    const rel = relogioFalso();
    const p = criarPaceadorSincrono({ rng: () => 0.5, dormir: rel.dormir, agora: rel.agora });

    for (let i = 0; i < 3; i++) {
      expect(p.tetoAtingido()).toBe(false);
      await p.aguardarVez();
    }

    expect(p.tetoAtingido()).toBe(true);
    expect(p.motivoDoTeto()).toBe('volume');
  });

  // ── a que mais importa ─────────────────────────────────────────────────────
  it('teto de TEMPO impede o lote cortado no meio pela lambda', async () => {
    // 4 min de orçamento, 15s por mensagem → cabem 16, não as 120 do teto de volume.
    process.env.WHATSAPP_LOTE_SINCRONO_ORCAMENTO_MS = '60000';
    const rel = relogioFalso();
    const p = criarPaceadorSincrono({ rng: () => 0.5, dormir: rel.dormir, agora: rel.agora });

    let liberadas = 0;
    while (!p.tetoAtingido()) { await p.aguardarVez(); liberadas++; }

    // 0s, 15s, 30s, 45s, 60s — a 6ª precisaria de 75s e não cabe no orçamento.
    expect(liberadas).toBe(5);
    expect(p.motivoDoTeto()).toBe('tempo');
    expect(p.liberadas()).toBe(5);
  });
});
