/**
 * Guard: o elo entre o catálogo de CUSTO e o registro de TAREFAS de IA.
 *
 * Por que existe (01/09/2026): `lib/ia-cost-catalog.ts` (quanto uma chamada
 * custa) e `lib/ai-tasks.ts` (que tarefas de IA existem) descreviam o mesmo
 * universo com chaves DIFERENTES — `ia4-avaliacao` de um lado, `ia4_avaliacao`
 * do outro. Como o ledger etiqueta com a chave de `ai-tasks`, o painel
 * "estimado × real" nunca casava linha nenhuma: as duas metades da conta de
 * custo não se falavam, e ninguém percebia porque cada uma, sozinha, parecia
 * completa.
 *
 * O `taskKey` em cada item de CALLS é esse elo. Um typo ali não quebra nada —
 * só devolve a tela ao estado anterior, com a coluna "est." vazia e sem erro.
 * Falha silenciosa é o que este guard existe para tornar barulhenta.
 *
 * Validado por mutação: trocar um `taskKey` por `'ia4_avaliacaoX'` reprova o
 * primeiro teste; apagar `escala` de `evidencias-socratic` reprova o terceiro.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { AI_TASKS } from '@/lib/ai-tasks';
import { CALLS, execNaJornada } from '@/lib/ia-cost-catalog';
import { PROGRAMA_REGULAR_DUO, PROGRAMA_JORNADA, PROGRAMA_PILOTO } from '@/lib/season-engine/programa-config';

/**
 * O elo tem que apontar para uma etiqueta que ALGUÉM ESCREVE no ledger — que é
 * um conjunto maior do que `AI_TASKS`. As de TTS são o caso: `tts_podcast` e
 * `tts_video_cena` etiquetam o ledger desde 30/08/2026, mas não são tarefas
 * roteáveis por modelo (o modelo vem do serviço, não da tela do operador).
 * Declará-las em `AI_TASKS` só para satisfazer um guard criaria controle que não
 * controla nada — exatamente o que `taskkey-declarada-guard` chama de "declarada
 * e não usada → o operador configura o que não roda".
 *
 * Por isso a régua é o CÓDIGO, não o catálogo de tarefas.
 */
function etiquetasEscritasNoCodigo(): Set<string> {
  let arquivos: string[] = [];
  try {
    arquivos = execFileSync('git', ['ls-files', '-z', '*.ts', '*.tsx'], { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] })
      .split('\0')
      .filter((f) => f && !f.startsWith('tests/') && f !== 'lib/ia-cost-catalog.ts' && existsSync(f));
  } catch {
    return new Set();
  }
  const achadas = new Set<string>();
  for (const f of arquivos) {
    const src = readFileSync(f, 'utf-8');
    for (const m of src.matchAll(/(?:taskKey|feature):\s*'([a-z0-9_]+)'/g)) achadas.add(m[1]);
  }
  return achadas;
}

describe('catálogo de custo ↔ registro de tarefas de IA', () => {
  it('todo taskKey do catálogo aponta para etiqueta que existe de fato', () => {
    const noCodigo = etiquetasEscritasNoCodigo();
    // Sem git (tarball, sandbox), o teste não tem como varrer: não invente
    // veredito — declare que não observou.
    if (noCodigo.size === 0) return;

    const conhecidas = new Set([...AI_TASKS.map((t) => t.key), ...noCodigo]);
    const orfaos = CALLS
      .map((c) => ({ id: c.id, taskKey: (c as any).taskKey }))
      .filter((c) => c.taskKey && !conhecidas.has(c.taskKey));

    expect(
      orfaos,
      `taskKey que ninguém escreve — a tela mostra "sem estimativa" sem erro nenhum:\n` +
      orfaos.map((o) => `  ❌ CALLS['${o.id}'].taskKey = '${o.taskKey}'`).join('\n'),
    ).toEqual([]);
  });

  it('taskKey não repete com escala incompatível dentro do mesmo scaleType', () => {
    // Várias linhas de custo podem cair na mesma task (as três extrações de chat
    // são `temporada_extracao`). O que não pode é a mesma task aparecer em
    // unidades de escala diferentes: aí a média por chamada mistura maçã com
    // laranja e a comparação com o real passa a mentir.
    const porTask: Record<string, Set<string>> = {};
    for (const c of CALLS) {
      const k = (c as any).taskKey;
      if (!k) continue;
      (porTask[k] ||= new Set()).add(c.scaleType);
    }
    const misturadas = Object.entries(porTask)
      .filter(([, escalas]) => escalas.size > 1)
      .map(([k, escalas]) => `  ❌ '${k}' aparece em ${[...escalas].join(' e ')}`);

    expect(misturadas, `taskKey em mais de uma unidade de escala:\n${misturadas.join('\n')}`).toEqual([]);
  });

  it('toda chamada por colaborador declara a escala do programa', () => {
    // Sem `escala`, `execNaJornada` cai no `exec` fixo — que descreve o Regular
    // DUO. A chamada nova entraria em TODA jornada com o número de 14 semanas,
    // inflando piloto e jornada em silêncio.
    const semEscala = CALLS
      .filter((c) => c.scaleType === 'colab' && !(c as any).escala)
      .map((c) => `  ❌ ${c.id}`);

    expect(
      semEscala,
      `chamada por colaborador sem \`escala\` — entra em toda jornada com o exec do DUO:\n${semEscala.join('\n')}`,
    ).toEqual([]);
  });

  it('jornada mais curta custa menos que a mais longa', () => {
    // A invariante que qualquer erro de decomposição quebra: o Piloto (2 semanas
    // de conteúdo, sem missão, sem qualitativa) não pode custar o mesmo que o
    // DUO (9 semanas, 3 missões, 2 competências).
    const somaExec = (cfg: any) => CALLS
      .filter((c) => c.scaleType === 'colab')
      .reduce((s, c) => s + execNaJornada(c, cfg), 0);

    const piloto = somaExec(PROGRAMA_PILOTO);
    const jornada = somaExec(PROGRAMA_JORNADA);
    const duo = somaExec(PROGRAMA_REGULAR_DUO);

    expect(piloto).toBeGreaterThan(0);
    expect(piloto).toBeLessThan(jornada);
    expect(jornada).toBeLessThan(duo);
  });
});
