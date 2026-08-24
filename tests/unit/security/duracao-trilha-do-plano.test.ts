import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { totalSemanasDoPlano } from '@/lib/season-engine/trilha-runtime';
import { getProgramaConfigDaTrilha } from '@/lib/season-engine/programa-config';

/**
 * D1 (auditoria 22/08) — a duração da trilha é do PLANO, não o literal 14.
 *
 * Os 5 presets valem 14 (regular), 10 (onboarding), 14 (regular_duo), 3
 * (piloto) e 7 (jornada). Três telas ignoravam os dois helpers que já existiam
 * para responder isso — e o mesmo arquivo `lib/home/loaders.ts` documentava
 * `SEMANAS_IMPLEMENTACAO` como "fallback histórico", delegando corretamente a
 * `ehSemanaDeImplementacao`, enquanto deixava o TOTAL cravado duas linhas acima.
 *
 * O que a pessoa via: "Semana 3 de 14" numa jornada de 7, em toda visita; o card
 * "Próximo marco" listando pílulas de semanas que não existem no plano dela; e,
 * no painel do gestor, "Fim de trilha" agendado ~7 semanas depois do fim real —
 * o alerta que existe para dar tempo de agir chegava quando não havia mais o que
 * fazer.
 *
 * 🔑 POR QUE O GUARD OLHA A CHAMADA, E NÃO O LITERAL.
 * Procurar `14` nesses arquivos daria falso positivo em toda parte (`size={14}`,
 * semanas 13/14 do formato regular, `slice(0, 14)`) e falso negativo no dia em
 * que alguém escrever `const T = 7 * 2`. O que interessa é se o site DERIVA a
 * duração — então o guard exige a chamada do helper, que é o que a DoD do plano
 * pediu explicitamente.
 */

/**
 * 🔑 O mínimo é por SITE, não "aparece no arquivo" — e isso foi aprendido por
 * mutação, aqui mesmo.
 *
 * A primeira versão exigia que o helper APARECESSE. Ao validar por mutação
 * (devolver o literal `14` às chamadas), o guard passou VERDE: sobrava uma
 * chamada em outro ponto do mesmo arquivo, e "aparece pelo menos uma vez" é
 * satisfeito por ela. Um guard assim protege um site e abandona os outros.
 *
 * Com o mínimo, reverter QUALQUER site derruba o CI.
 */
const SITES: Array<{ arquivo: string; helper: RegExp; minimo: number; oQueMostra: string }> = [
  {
    arquivo: 'lib/home/loaders.ts',
    helper: /totalSemanasDoPlano\s*\(/g,
    minimo: 5, // semana atual · "Semana X de N" · horizonte · fim · total da pílula
    oQueMostra: 'o "Semana X de N" da home, o horizonte do card "Próximo marco" e a barra da fase 4',
  },
  {
    arquivo: 'app/dashboard/gestor/actions.ts',
    helper: /getProgramaConfigDaTrilha\s*\(/g,
    minimo: 3, // distribuição por semana · semana do liderado · fim de trilha
    oQueMostra: 'a semana atual de cada liderado, a distribuição por semana e o alerta de fim de trilha',
  },
  {
    // 🔴 O site que ESCAPOU da primeira rodada do D1 (24/08). O literal vivia
    // DENTRO da interpolação do i18n — `t('header.weekOf', { total: 14 })` —, e
    // procurar a string "de 14" não acha isso. É a tela onde a pessoa passa a
    // trilha inteira: numa jornada de 7 semanas ela lia "Semana 3 de 14" em
    // toda visita.
    arquivo: 'app/dashboard/temporada/semana/[week]/page.tsx',
    helper: /totalSemanasDoPlano\s*\(/g,
    minimo: 1,
    oQueMostra: 'o "Semana X de N" do cabeçalho da própria semana',
  },
  {
    // Barra de progresso do hub do gestor: o TETO era 14, então uma jornada de
    // 7 semanas nunca passava de 50% — a barra dizia "metade" para quem tinha
    // terminado.
    arquivo: 'app/dashboard/gestor/page.tsx',
    helper: /totalSemanas[^A-Za-z]/g,
    minimo: 1,
    oQueMostra: 'a largura da barra de progresso de cada liderado',
  },
  {
    // Barra da fase 4 na home do colaborador.
    arquivo: 'app/dashboard/page.tsx',
    helper: /totalSemanasTrilha[^A-Za-z]/g,
    minimo: 2,
    oQueMostra: 'o avanço dentro da fase 4 na home',
  },
];

describe('D1 · a duração da trilha vem do plano/programa', () => {
  it.each(SITES)('$arquivo deriva a duração em TODOS os sites', ({ arquivo, helper, minimo, oQueMostra }) => {
    const src = readFileSync(arquivo, 'utf-8');
    const n = (src.match(helper) || []).length;
    expect(
      n,
      `${arquivo} tem ${n} derivação(ões) de duração, esperado ao menos ${minimo}. ` +
      `É esse helper que decide ${oQueMostra}. ` +
      'Use totalSemanasDoPlano(trilha.temporada_plano, fallback) ou ' +
      'getProgramaConfigDaTrilha(trilha).semanas — em CADA site, não em um só.',
    ).toBeGreaterThanOrEqual(minimo);
  });

  /**
   * A sentinela do fallback: ele PODE existir (plano vazio precisa de um
   * número), mas não pode voltar a ser a resposta. Se o nome sumir, é porque
   * alguém trocou a derivação por um literal de novo.
   */
  it('o 14 da home continua sendo FALLBACK declarado, não a duração', () => {
    const src = readFileSync('lib/home/loaders.ts', 'utf-8');
    expect(src).toMatch(/TOTAL_SEMANAS_FALLBACK/);
    expect(
      /const TOTAL_SEMANAS\s*=/.test(src),
      'voltou a existir um TOTAL_SEMANAS sem "FALLBACK" no nome — é a forma antiga do bug',
    ).toBe(false);
  });
});

/**
 * O comportamento dos helpers, para o guard acima não ser só sobre nomes.
 */
describe('D1 · os helpers respondem por programa, não por formato', () => {
  const semanas = (n: number) => Array.from({ length: n }, (_, i) => ({ semana: i + 1 }));

  it('jornada de 7 semanas devolve 7, não 14', () => {
    expect(totalSemanasDoPlano(semanas(7), 14)).toBe(7);
  });

  it('piloto de 3 devolve 3', () => {
    expect(totalSemanasDoPlano(semanas(3), 14)).toBe(3);
  });

  it('plano vazio cai no fallback (é para isso que ele existe)', () => {
    expect(totalSemanasDoPlano([], 14)).toBe(14);
    expect(totalSemanasDoPlano(null, 10)).toBe(10);
  });

  it('`calendario_semana` manda quando existe (piloto usa espelho)', () => {
    expect(totalSemanasDoPlano([{ semana: 1, calendario_semana: 1 }, { semana: 2, calendario_semana: 13 }], 14)).toBe(13);
  });

  it.each([
    ['jornada', 7],
    ['piloto', 3],
    ['onboarding', 10],
  ])('programa %s tem %i semanas', (modo, esperado) => {
    expect(getProgramaConfigDaTrilha({ programa_modo: modo }).semanas).toBe(esperado);
  });
});
