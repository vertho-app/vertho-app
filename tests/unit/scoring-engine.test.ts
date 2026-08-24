import { describe, it, expect } from 'vitest';
import {
  traitFit, inferDirection, scoreCandidate, colorBand,
  type RoleSpec, type CandidateProfile, type BandTrait,
} from '@/lib/scoring/engine';
import { parseFaixa, faixaDe, LATEST_SPEC_VERSION } from '@/lib/scoring/role-spec';

/**
 * E6 (auditoria de 22/08) — `lib/scoring` não tinha NENHUM teste.
 *
 * `Medido em 24/08:` 8 arquivos, 1.197 linhas, 20+ exports, e **0 referências**
 * a `calcularFitUnificado`, `scoreCandidate`, `traitFit`, `parseFaixa`,
 * `inferDirection` (e os demais) nos 117 arquivos de teste do repo.
 *
 * É o código que produz o Ranking de Adequação e o Fit v2 — recomendação sobre
 * PESSOAS, com knockout como gate. Um erro de faixa ou de direção muda a
 * recomendação **sem sintoma nenhum**: não há exceção, não há log, o número
 * simplesmente sai diferente. E é matemática pura, o tipo mais barato de testar,
 * que o próprio CLAUDE.md manda cobrir.
 *
 * A escolha do que testar veio de LER o código, não de fotografar a saída: as
 * invariantes abaixo são as que os comentários do motor descrevem como já
 * violadas uma vez, ou como razão de existir de uma decisão.
 */

// ── Fixtures ──────────────────────────────────────────────────────────────

const banda = (over: Partial<BandTrait> & { key: string; lo: number; hi: number }): BandTrait => ({
  block: 'DISC', kind: 'band', ...over,
});

/** Spec mínima com um traço por bloco e um knockout de traço. */
function specDeTeste(over: Partial<RoleSpec> = {}): RoleSpec {
  return {
    cargo: 'Coordenador',
    specVersion: 4,
    bandHigh: 0.865, bandMid: 0.754, driverThreshold: 0.65,
    traits: [banda({ key: 'comp_d', lo: 60, hi: 80, direction: 'target', label: 'Dominância' })],
    blockWeights: { Competencia: 0, Lideranca: 0, DISC: 1, Mapeamento: 0 } as any,
    ...over,
  };
}

// ── parseFaixa / faixaDe ──────────────────────────────────────────────────

describe('E6 · parseFaixa: a string da IA vira faixa', () => {
  it.each([
    ['Alto (41-60)', 41, 60],
    ['Muito alto (61–80)', 61, 80],     // travessão, não hífen
    ['30 a 45', 30, 45],
    ['(0-20)', 0, 20],
  ])('%s → [%i, %i]', (entrada, lo, hi) => {
    expect(parseFaixa(entrada)).toEqual({ lo, hi });
  });

  /**
   * 🔴 O fallback é a faixa INTEIRA — e isso é o que o torna perigoso: uma
   * string que a IA emitiu num formato novo não explode nem registra, ela vira
   * "0 a 100", em que qualquer candidato tem aderência plena. O traço deixa de
   * discriminar e ninguém vê. Este teste existe para que a decisão fique
   * consciente: se um dia o fallback tiver de falhar alto, é aqui que se muda.
   */
  it('🔴 string sem faixa reconhecível vira [0,100] — o traço para de discriminar', () => {
    expect(parseFaixa('Alto')).toEqual({ lo: 0, hi: 100 });
    expect(parseFaixa(null)).toEqual({ lo: 0, hi: 100 });
    expect(parseFaixa('')).toEqual({ lo: 0, hi: 100 });

    const t = banda({ key: 'x', ...parseFaixa('Alto'), direction: 'target' });
    expect(traitFit(0, t), 'com a faixa cheia, até o extremo tem aderência alta').toBeGreaterThan(0.8);
  });

  it('faixaDe normaliza limites invertidos (min/max, não lo/hi da string)', () => {
    expect(faixaDe('Muito alto (61-80)', 'Baixo (10-25)')).toEqual({ min: 25, max: 61 });
  });
});

// ── inferDirection ────────────────────────────────────────────────────────

describe('E6 · inferDirection: o fallback de quando a IA omite', () => {
  it('faixa encostada no teto → floor (quanto mais, melhor)', () => {
    expect(inferDirection(70, 100)).toBe('floor');
    expect(inferDirection(70, 99), 'a borda tolera 1 ponto').toBe('floor');
  });

  it('faixa encostada no piso e na metade INFERIOR → ceiling (manter baixo)', () => {
    expect(inferDirection(0, 30)).toBe('ceiling');
  });

  /**
   * A fronteira exata: encostar no piso não basta, o CENTRO da faixa também
   * precisa cair na metade inferior (≤ 45% da escala). Uma faixa larga demais a
   * partir do zero descreve "aceita quase tudo", não "manter baixo" — e ler isso
   * como ceiling satura o fit em 1 para quem tem valor mínimo, invertendo a
   * leitura do traço sem sintoma.
   */
  it('🔴 encostar no piso não basta: o centro tem que estar na metade inferior', () => {
    expect(inferDirection(0, 89), 'centro 44,5 — ainda é metade inferior').toBe('ceiling');
    expect(
      inferDirection(0, 91),
      'centro 45,5 passou do limiar e continuou "manter baixo" — o traço satura em 1 para quem tem o mínimo',
    ).toBe('target');
  });

  it('faixa que toca os DOIS extremos não é floor', () => {
    expect(inferDirection(0, 100)).not.toBe('floor');
  });

  it('faixa no meio → target', () => {
    expect(inferDirection(40, 60)).toBe('target');
  });
});

// ── traitFit ──────────────────────────────────────────────────────────────

describe('E6 · traitFit: o núcleo psicométrico', () => {
  it('floor/ceiling têm PLATÔ dentro da faixa (não pico)', () => {
    const f = banda({ key: 'x', lo: 60, hi: 80, direction: 'floor' });
    expect(traitFit(60, f)).toBe(1);
    expect(traitFit(70, f)).toBe(1);
    expect(traitFit(80, f)).toBe(1);
  });

  it('🔴 floor satura ACIMA e ceiling satura ABAIXO — é a direção que decide', () => {
    const floor = banda({ key: 'x', lo: 60, hi: 80, direction: 'floor' });
    const ceiling = banda({ key: 'x', lo: 60, hi: 80, direction: 'ceiling' });

    expect(traitFit(100, floor), 'ter mais deveria ser aceitável num piso').toBe(1);
    expect(traitFit(0, ceiling), 'ficar baixo deveria ser aceitável num teto').toBe(1);
    // E o inverso NÃO satura: é aí que a direção invertida mudaria a recomendação.
    expect(traitFit(0, floor)).toBeLessThan(1);
    expect(traitFit(100, ceiling)).toBeLessThan(1);
  });

  it('target tem pico no CENTRO e cai até a borda', () => {
    const t = banda({ key: 'x', lo: 60, hi: 80, direction: 'target', peakedness: 0.15 });
    expect(traitFit(70, t)).toBeCloseTo(1, 5);
    expect(traitFit(60, t)).toBeCloseTo(0.85, 5);  // borda = 1 − peakedness
    expect(traitFit(80, t)).toBeCloseTo(0.85, 5);
    expect(traitFit(65, t)).toBeGreaterThan(traitFit(61, t));
  });

  it('fora da faixa, a aderência chega a ZERO na distância da tolerância', () => {
    const t = banda({ key: 'x', lo: 60, hi: 80, direction: 'target', tLo: 20, tHi: 20 });
    expect(traitFit(40, t), 'a 20 pontos abaixo (tLo) o fit deveria zerar').toBe(0);
    expect(traitFit(10, t), 'mais longe ainda continua zero, nunca negativo').toBe(0);
  });

  /**
   * 🔑 A tolerância é a ALAVANCA: alargá-la levanta o fit de quem está fora da
   * faixa. Isso é intencional para o SCORE (a v4 usa tol=30 para dar gradiente),
   * e é exatamente por isso que o gate de knockout não pode ler esta rampa —
   * ver o caso `knockout` abaixo.
   */
  it('tolerância maior levanta o fit de quem está fora da faixa', () => {
    const estreita = banda({ key: 'x', lo: 60, hi: 80, direction: 'target', tLo: 20 });
    const larga = banda({ key: 'x', lo: 60, hi: 80, direction: 'target', tLo: 30 });
    expect(traitFit(45, larga)).toBeGreaterThan(traitFit(45, estreita));
  });
});

// ── scoreCandidate: o gate ────────────────────────────────────────────────

describe('E6 · scoreCandidate: knockout é gate, não nota', () => {
  /**
   * 🔴 O caso que prova que o gate EXISTE: um candidato que o score aprovaria.
   *
   * Descoberto por mutação (24/08): a primeira versão deste teste usava um
   * perfil ruim em tudo — desligar o knockout no motor não mudava o veredito,
   * porque o Beta já era vermelho e reprovava sozinho. O teste dizia "knockout
   * bloqueia" e media "candidato ruim é reprovado", que é outra coisa.
   *
   * Aqui o traço com peso 19 satura e leva o Beta ao verde; o traço com peso 1
   * está fora da faixa e é o que o knockout exige. Sem gate, ele passaria.
   */
  it('🔴 knockout reprova mesmo quem o SCORE aprovaria', () => {
    const spec = specDeTeste({
      traits: [
        banda({ key: 'comp_i', lo: 60, hi: 80, direction: 'floor', weight: 19 }),
        banda({ key: 'comp_d', lo: 60, hi: 80, direction: 'target', weight: 1, tLo: 30, tHi: 30 }),
      ],
      driverThreshold: 0, // isolando o gate: sem o rebaixamento driver-aware
      knockouts: [{ scope: 'trait', key: 'comp_d', min: 0.9, label: 'Dominância mínima' }],
    });
    const perfil = { comp_i: 100, comp_d: 45 } as CandidateProfile;

    const semGate = scoreCandidate({ ...spec, knockouts: [] }, perfil);
    expect(
      semGate.status,
      'a fixture não produz um aprovado — sem isso o caso não distingue gate de nota',
    ).toBe('recomendado');

    const comGate = scoreCandidate(spec, perfil);
    expect(comGate.status, 'o knockout não barrou quem o score tinha aprovado').toBe('bloqueado');
    expect(comGate.recommendation).toBe('nao_recomendado');
    expect(comGate.knockouts.some((k) => !k.passed), 'o motivo do bloqueio não foi registrado').toBe(true);
  });

  it('dentro da faixa, o mesmo knockout passa', () => {
    const spec = specDeTeste({
      knockouts: [{ scope: 'trait', key: 'comp_d', min: 0.6, label: 'Dominância mínima' }],
    });
    const r = scoreCandidate(spec, { comp_d: 70 } as CandidateProfile);

    expect(r.status).not.toBe('bloqueado');
  });

  /**
   * 🔴 A invariante mais cara deste arquivo, e a que o próprio motor documenta
   * como lição da v4:
   *
   *   "o gate é binário sobre o mín%, mas o valor medido é o FIT, e o fit é
   *    desenhado pela rampa — alargar a tolerância levanta o fit de quem está
   *    abaixo do piso e AFROUXA o corte eliminatório sem ninguém pedir"
   *
   * O comentário chama isso de "guardião knockout_acoplado_piso". O guardião não
   * existia. Este é ele: o mesmo candidato, a mesma regra de knockout, e a spec
   * mudando SÓ a rampa de score (tol 20 → 30). O veredito do gate não pode mudar.
   */
  it('🔴 alargar a rampa de SCORE não pode afrouxar o KNOCKOUT', () => {
    const ko = [{ scope: 'trait' as const, key: 'comp_d', min: 0.6, label: 'Dominância mínima' }];
    const perfil = { comp_d: 45 } as CandidateProfile; // 15 abaixo do piso 60

    const specTolPadrao = specDeTeste({
      knockouts: ko,
      traits: [banda({ key: 'comp_d', lo: 60, hi: 80, direction: 'target', tLo: 20, tHi: 20 })],
    });
    const specTolLarga = specDeTeste({
      knockouts: ko,
      traits: [banda({ key: 'comp_d', lo: 60, hi: 80, direction: 'target', tLo: 30, tHi: 30 })],
    });

    const a = scoreCandidate(specTolPadrao, perfil);
    const b = scoreCandidate(specTolLarga, perfil);

    expect(
      b.status,
      'a rampa larga levantou o fit e destravou o gate — é o corte eliminatório se movendo sem ninguém pedir',
    ).toBe(a.status);

    // E a rampa larga DEVE mesmo mudar o score: é para isso que ela existe. Se
    // este segundo expect falhar, o teste acima passou por não medir nada.
    expect(b.beta, 'a tolerância não afetou o score — a fixture não exercita a rampa').toBeGreaterThan(a.beta);
  });

  /**
   * v4: um VERDE com um driver (band trait) em déficit não é "recomendado
   * limpo" — o Beta é média ponderada e MASCARA o furo local.
   */
  it('🔴 driver em déficit rebaixa VERDE para "com ressalvas"', () => {
    const spec = specDeTeste({
      driverThreshold: 0.65,
      traits: [
        banda({ key: 'comp_d', lo: 60, hi: 80, direction: 'floor', weight: 9 }),
        banda({ key: 'comp_i', lo: 60, hi: 80, direction: 'target', weight: 1 }),
      ],
    });
    // comp_d saturado (fit 1, peso 9) puxa o Beta para o verde; comp_i em 30
    // está muito abaixo do piso → fit baixo, mas com peso 1 quase não pesa.
    const r = scoreCandidate(spec, { comp_d: 100, comp_i: 30 } as CandidateProfile);

    expect(r.beta, 'a fixture não produziu um Beta verde — o caso não exercita o rebaixamento').toBeGreaterThanOrEqual(0.865);
    expect(
      r.status,
      'o Beta verde mascarou um driver furado e o selo saiu "recomendado limpo"',
    ).toBe('recomendado_com_ressalvas');
  });

  it('com driverThreshold desligado (legado), o mesmo caso continua VERDE', () => {
    const spec = specDeTeste({
      driverThreshold: 0,
      traits: [
        banda({ key: 'comp_d', lo: 60, hi: 80, direction: 'floor', weight: 9 }),
        banda({ key: 'comp_i', lo: 60, hi: 80, direction: 'target', weight: 1 }),
      ],
    });
    const r = scoreCandidate(spec, { comp_d: 100, comp_i: 30 } as CandidateProfile);
    expect(r.status, 'o driver-aware vazou para specs legadas e mexeu no histórico').toBe('recomendado');
  });
});

// ── Congelamento por versão ───────────────────────────────────────────────

describe('E6 · spec_version congela o histórico', () => {
  /**
   * 🔴 A régua de cor é versionada justamente para que um gabarito antigo não
   * mude de veredito quando recalibramos a nova. Sem um teste, "congelado" é
   * uma intenção escrita em comentário.
   *
   * O caso: um Beta que cai ENTRE as duas réguas (0,85 legado × 0,865 v4). Ele é
   * verde na régua antiga e amarelo na nova — se a versão for ignorada em algum
   * ponto, o veredito histórico vira.
   */
  it('🔴 o mesmo perfil tem vereditos diferentes conforme a régua da spec', () => {
    // 60,4 numa faixa 60–80 com peakedness 0,15 → fit = 1 − 0,15·(0,96)² =
    // 0,8618, que cai EXATAMENTE entre as duas réguas (0,85 legado e 0,865 v4).
    const traits = [banda({ key: 'comp_d', lo: 60, hi: 80, direction: 'target', peakedness: 0.15 })];
    const perfil = { comp_d: 60.4 } as CandidateProfile;

    const legado = scoreCandidate(
      specDeTeste({ specVersion: 1, bandHigh: 0.85, bandMid: 0.6, driverThreshold: 0, traits }),
      perfil,
    );
    const v4 = scoreCandidate(
      specDeTeste({ specVersion: 4, bandHigh: 0.865, bandMid: 0.754, driverThreshold: 0.65, traits }),
      perfil,
    );

    expect(legado.beta, 'as duas specs deveriam produzir o MESMO beta — só a régua muda').toBeCloseTo(v4.beta, 6);
    expect(legado.beta).toBeGreaterThanOrEqual(0.85);
    expect(legado.beta).toBeLessThan(0.865);

    expect(legado.betaBand, 'o gabarito legado mudou de faixa — o histórico descongelou').toBe('verde');
    expect(v4.betaBand, 'a régua nova não está sendo aplicada na v4').toBe('amarelo');
  });

  /**
   * Congelamento numérico. 🔑 O esperado é DERIVADO da fórmula que o motor
   * documenta, não copiado da saída — âncora fotografada só prova que o código
   * continua igual a si mesmo, inclusive se estiver errado. Aqui, se a curva
   * mudar, o teste diz qual das duas partes divergiu.
   *
   * Fórmula (engine.ts): fora da faixa,
   *   fit = edgeFit · (1 − min(d,1)^outExp),  d = distância/tolerância
   *   edgeFit = 1 − peakedness  para `target`;  1  para floor/ceiling
   */
  it('🔴 âncora numérica da v4 (mudou o motor? bumpe a versão)', () => {
    const PEAK = 0.15, OUT_EXP = 2, TOL = 30;
    const spec = specDeTeste({
      traits: [
        banda({ key: 'comp_d', lo: 60, hi: 80, direction: 'target', tLo: TOL, tHi: TOL }),
        banda({ key: 'comp_i', lo: 40, hi: 60, direction: 'floor', tLo: TOL, tHi: TOL }),
      ],
    });

    // Dentro das duas faixas: centro do target e platô do floor → 1.
    expect(scoreCandidate(spec, { comp_d: 70, comp_i: 50 } as CandidateProfile).beta).toBeCloseTo(1, 6);

    // Os dois ABAIXO do piso, em distâncias diferentes.
    const dD = (60 - 55) / TOL;                                   // target: 5 pontos abaixo
    const dI = (40 - 30) / TOL;                                   // floor:  10 pontos abaixo
    const fitD = (1 - PEAK) * (1 - Math.pow(Math.min(dD, 1), OUT_EXP));
    const fitI = 1 * (1 - Math.pow(Math.min(dI, 1), OUT_EXP));
    const esperado = (fitD + fitI) / 2;                            // pesos iguais no mesmo bloco

    const meio = scoreCandidate(spec, { comp_d: 55, comp_i: 30 } as CandidateProfile);
    expect(
      meio.beta,
      'a curva do motor divergiu da fórmula documentada em engine.ts. Se a mudança foi '
      + 'de propósito, bumpe LATEST_SPEC_VERSION e atualize o comentário — senão todo '
      + 'gabarito histórico passa a ser lido por uma régua que não é a dele',
    ).toBeCloseTo(esperado, 6);

    // E a âncora tem que valer alguma coisa: se a fórmula desse 1 (ou 0), o
    // expect acima passaria sem exercitar a rampa.
    expect(esperado).toBeGreaterThan(0.8);
    expect(esperado).toBeLessThan(0.9);
  });

  it('LATEST_SPEC_VERSION é a versão que as fixtures acima descrevem', () => {
    expect(
      LATEST_SPEC_VERSION,
      'a versão subiu: confira se a âncora numérica e a régua de cor deste arquivo ainda descrevem a régua atual',
    ).toBe(4);
  });
});

describe('E6 · colorBand', () => {
  it('as três faixas, nas bordas', () => {
    expect(colorBand(0.86)).toBe('verde');
    expect(colorBand(0.85)).toBe('verde');
    expect(colorBand(0.84)).toBe('amarelo');
    expect(colorBand(0.60)).toBe('amarelo');
    expect(colorBand(0.59)).toBe('vermelho');
  });
});
