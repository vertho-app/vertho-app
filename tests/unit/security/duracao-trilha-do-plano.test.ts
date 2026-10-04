import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { totalSemanasDoPlano } from '@/lib/season-engine/trilha-runtime';
import { getProgramaConfigDaTrilha } from '@/lib/season-engine/programa-config';
import { duracaoDaTrilha } from '@/lib/season-engine/duracao-trilha';

/**
 * D1 (auditoria 22/08) e R-29 (revisão de 02/10/2026): a duração da trilha vem de
 * UMA função (`duracaoDaTrilha`), não do literal 14 nem de uma conta por peça.
 *
 * Os 5 presets valem 14 (regular), 9 (onboarding), 14 (regular_duo), 3
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
 * pediu explicitamente. (O que o literal PODE ser vigiado é o `|| 14` / `?? 14`
 * de fallback, que é uma forma só e não tem uso legítimo: ver o último bloco.)
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
    helper: /duracaoDaTrilha\s*\(/g,
    minimo: 5, // semana atual · "Semana X de N" · horizonte · fim · total da pílula
    oQueMostra: 'o "Semana X de N" da home, o horizonte do card "Próximo marco" e a barra da fase 4',
  },
  {
    arquivo: 'app/dashboard/gestor/actions.ts',
    helper: /duracaoDaTrilha\s*\(/g,
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
    helper: /(duracaoDaTrilha|ehUltimaSemanaDaTrilha)\s*\(/g,
    minimo: 3, // cabeçalho · faixa de fim de trilha · "Próxima semana libera" (R-30)
    oQueMostra: 'o "Semana X de N" do cabeçalho, a faixa de fim de trilha e a mensagem do fim da conversa',
  },
  {
    // R-29: a peça que dizia "são N semanas" pelo TAMANHO do plano.
    arquivo: 'lib/notifications/envio-template-lote.ts',
    helper: /duracaoDaTrilha\s*\(/g,
    minimo: 1,
    oQueMostra: 'o {{3}} de "trilha liberada" e "trilha concluída" no WhatsApp',
  },
  {
    // R-29: a conclusão tinha `plano.length || 14`.
    arquivo: 'actions/temporada-concluida.ts',
    helper: /duracaoDaTrilha\s*\(/g,
    minimo: 1,
    oQueMostra: 'o "N semanas dedicadas" da tela e do PDF de conclusão',
  },
  {
    // R-101: o resumo semanal ao gestor dizia "sem X/14" para um programa de 9.
    arquivo: 'lib/notifications/resumo-gestor.ts',
    helper: /duracaoDaTrilha\s*\(/g,
    minimo: 1,
    oQueMostra: 'a semana de cada liderado no resumo de WhatsApp ao gestor',
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

/**
 * Só o CÓDIGO: um comentário que cita `duracaoDaTrilha(trilha)` somava ao mínimo e
 * deixava passar um site revertido para o literal (provado por mutação: trocar uma
 * chamada de `lib/home/loaders.ts` por `14` seguia verde, porque o doc do arquivo
 * citava a chamada).
 */
const semComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('D1 · a duração da trilha vem do plano/programa', () => {
  it.each(SITES)('$arquivo deriva a duração em TODOS os sites', ({ arquivo, helper, minimo, oQueMostra }) => {
    const src = semComentarios(readFileSync(arquivo, 'utf-8'));
    const n = (src.match(helper) || []).length;
    expect(
      n,
      `${arquivo} tem ${n} derivação(ões) de duração, esperado ao menos ${minimo}. ` +
      `É esse helper que decide ${oQueMostra}. ` +
      'Use duracaoDaTrilha(trilha), a fonte única de duração, em CADA site, não em um só.',
    ).toBeGreaterThanOrEqual(minimo);
  });

  /**
   * O fallback de duração não existe mais como constante: quando a fonte não
   * responde, o site OMITE o número em vez de usar o de outro programa. O que
   * este guard vigia é a forma antiga do bug (`|| 14` / `?? 14` e a constante
   * `TOTAL_SEMANAS*`), em todo site que mostra ou conta duração.
   */
  const SITES_SEM_LITERAL = [
    'lib/home/loaders.ts',
    'app/dashboard/page.tsx',
    'app/dashboard/gestor/page.tsx',
    'app/dashboard/gestor/actions.ts',
    'actions/temporada-concluida.ts',
    'lib/temporada-concluida-pdf.tsx',
    'components/temporada/relatorio-temporada-concluida.tsx',
    'lib/notifications/resumo-gestor.ts',
    'lib/notifications/envio-template-lote.ts',
  ];

  it.each(SITES_SEM_LITERAL)('%s não tem `|| 14` nem `?? 14` de duração', (arquivo) => {
    const src = semComentarios(readFileSync(arquivo, 'utf-8'));
    expect(
      /(\|\||\?\?)\s*14\b/.test(src),
      `${arquivo} voltou a ter um fallback 14 de duração: use duracaoDaTrilha e omita o número quando ela não responder`,
    ).toBe(false);
    expect(/const TOTAL_SEMANAS\w*\s*=/.test(src), `${arquivo} voltou a ter uma constante de duração`).toBe(false);
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
    ['onboarding', 9],
  ])('programa %s tem %i semanas', (modo, esperado) => {
    expect(getProgramaConfigDaTrilha({ programa_modo: modo }).semanas).toBe(esperado);
    expect(duracaoDaTrilha({ programa_modo: modo })).toBe(esperado);
  });
});
