/**
 * Guard: toda `taskKey` do código está declarada em `AI_TASKS`, e vice-versa.
 *
 * Por que existe (27/08/2026): em UM dia apareceram TRÊS etiquetas que
 * resolviam modelo por omissão — `pulse_classify`, `conteudo_tags` e
 * `arguicao`. Nenhuma constava do catálogo, então nenhuma era roteável por
 * `getModelForTask` nem aparecia na tela: rodavam no `FALLBACK_GLOBAL` **sem
 * ninguém ter decidido isso**. Três no mesmo dia não é coincidência, é padrão.
 *
 * 🔴 E a direção contrária mordeu mais forte. `AI_TASKS` declarava
 * `ia4_avaliar`; o código sempre rodou `ia4_avaliacao`. A tela de configuração
 * itera `AI_TASKS` e grava `ai.modelos[task.key]` — então o modelo que o
 * operador escolhia para a IA4 ia para uma chave que `resolveTaskModel` nunca
 * consultava. Escolha silenciosamente descartada, na tela feita para escolher.
 *
 * As duas direções importam, e por motivos diferentes:
 *   · usada e NÃO declarada → o operador não consegue configurar o que roda
 *   · declarada e NÃO usada → o operador configura o que não roda
 *
 * A segunda é pior: a primeira só limita, a segunda MENTE.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { AI_TASKS } from '@/lib/ai-tasks';

const CATALOGO = 'lib/ai-tasks.ts';

/**
 * Etiquetas de INSTRUMENTO (probe, canário, piloto) — existem para medir, não
 * são tarefas do produto e não pertencem à tela de configuração. Só encolhe.
 */
const INSTRUMENTOS = new Set([
  // ⚠️ A 1a versao listava 6. Tres (`probe_cache_hist`, `pdi_compare_0708`,
  // `pdi_compare_4modelos`) so existem no LEDGER, de rodadas passadas: o script
  // que as usava nao esta mais no repo. Allowlist com entrada que nao
  // corresponde a codigo nenhum e a mesma classe de guard sobre alvo morto —
  // ocupa espaco e nao protege nada.
  'canario_contrato', 'probe_provedor', 'pdi_leitura_cega',
  // 27/08: o proprio guard pegou estas duas quando eu escrevi o experimento
  // pareado Opus x Sonnet. Sao instrumento — nao vao para a tela do operador.
  'pdi_experimento', 'pdi_experimento_check',
]);

/**
 * Declaradas que NENHUMA linha de código referencia. Dívida DECLARADA: o
 * operador vê o controle na tela e ele não faz nada.
 *
 * ⚠️ Estas 6 são a família `temporada_*` — o motor de temporadas nasceu com
 * elas e passou a resolver modelo por outro caminho. Tirá-las da tela é decisão
 * de produto (a tela perde 6 linhas), então ficam declaradas aqui até alguém
 * decidir. Entrada NOVA nesta lista é exatamente o bug que o guard pega.
 */
const ORFAS_CONHECIDAS = new Set([
  'temporada_desafio', 'temporada_cenario', 'temporada_reflexao',
  'temporada_feedback', 'temporada_qualitativa', 'temporada_rubrica',
]);

/**
 * Catálogos são DESCRIÇÃO, não call-site. Citar uma task neles não prova que
 * alguém a executa — e é justamente a prova que este guard procura.
 *
 * 01/09/2026: `lib/ia-cost-catalog.ts` passou a carregar `taskKey` para ligar o
 * custo estimado ao real do ledger, e três das seis órfãs declaradas
 * (`temporada_desafio`, `temporada_cenario`, `temporada_feedback`) ganharam uma
 * "referência" só por aparecerem lá. O guard as deu por resolvidas: dívida real
 * — seis controles na tela do operador que não roteiam nada — apagada por uma
 * citação em tabela de preço. Um catálogo referenciando outro não é uso.
 */
const CATALOGOS = new Set([CATALOGO, 'lib/ia-cost-catalog.ts']);

function arquivosDeCodigo(): string[] {
  try {
    return execFileSync('git', ['ls-files', '-z', '*.ts', '*.tsx'], { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] })
      .split('\0')
      .filter((f) => f && !f.startsWith('tests/') && !CATALOGOS.has(f) && existsSync(f));
  } catch {
    return [];
  }
}

const arquivos = arquivosDeCodigo();
const fontes = new Map(arquivos.map((f) => [f, readFileSync(f, 'utf-8')]));
const declaradas = new Set(AI_TASKS.map((t) => t.key));

/** `taskKey: 'x'` literal — o uso que o ledger enxerga. */
const usadas = new Map<string, string>();
for (const [f, src] of fontes) {
  for (const m of src.matchAll(/taskKey:\s*'([a-z0-9_]+)'/g)) {
    if (!usadas.has(m[1])) usadas.set(m[1], f);
  }
}

/**
 * Referência em QUALQUER forma. Mais permissivo que `taskKey:` de propósito:
 * vários call-sites computam a etiqueta (`formato === 'texto' ? 'conteudo_texto'`),
 * e um guard que só olha `taskKey:` acusaria essas como órfãs — falso positivo
 * que ensina a ignorar o guard.
 */
function referenciada(k: string): boolean {
  for (const src of fontes.values()) if (src.includes(`'${k}'`)) return true;
  return false;
}

describe('Guard: taskKey declarada em AI_TASKS', () => {
  it('há código para varrer e catálogo para comparar', () => {
    expect(arquivos.length).toBeGreaterThan(100);
    expect(declaradas.size).toBeGreaterThan(20);
  });

  // Direção 1: o operador não consegue configurar o que roda.
  it('toda taskKey usada no código está declarada', () => {
    const faltando = [...usadas.entries()]
      .filter(([k]) => !declaradas.has(k) && !INSTRUMENTOS.has(k))
      .map(([k, f]) => `${k}  (${f})`);
    expect(faltando, `taskKey usada e NÃO declarada em AI_TASKS:\n  ${faltando.join('\n  ')}\n\n`
      + 'Sem a declaração ela não é roteável por getModelForTask nem aparece na tela de '
      + 'modelos: roda no FALLBACK_GLOBAL sem ninguém ter decidido.').toEqual([]);
  });

  // Direção 2 — a que mentiu: o operador configura o que não roda.
  it('toda task declarada é referenciada por alguma linha de código', () => {
    const orfas = [...declaradas].filter((k) => !referenciada(k) && !ORFAS_CONHECIDAS.has(k));
    expect(orfas, `declarada em AI_TASKS e SEM nenhuma referência no código:\n  ${orfas.join('\n  ')}\n\n`
      + 'A tela de configuração itera AI_TASKS e grava ai.modelos[task.key]. Task que ninguém '
      + 'lê vira controle que não faz nada — foi assim que a escolha de modelo da IA4 '
      + 'era descartada em silêncio (ia4_avaliar × ia4_avaliacao).').toEqual([]);
  });

  it('a allowlist de órfãs só encolhe', () => {
    const stale = [...ORFAS_CONHECIDAS].filter((k) => referenciada(k) || !declaradas.has(k));
    expect(stale, `entradas que já não são dívida — remova:\n  ${stale.join('\n  ')}`).toEqual([]);
  });

  it('a lista de instrumentos só encolhe', () => {
    const stale = [...INSTRUMENTOS].filter((k) => declaradas.has(k) || !usadas.has(k));
    expect(stale, `instrumento que virou task declarada, ou sumiu do código:\n  ${stale.join('\n  ')}`).toEqual([]);
  });

  // O caso concreto que motivou o arquivo, travado nominalmente.
  it('🔴 a task da IA4 é `ia4_avaliacao` — o nome que o código roda', () => {
    expect(declaradas.has('ia4_avaliacao'), 'AI_TASKS perdeu ia4_avaliacao').toBe(true);
    expect(declaradas.has('ia4_avaliar'), 'ia4_avaliar voltou: a tela grava numa chave que ninguém lê').toBe(false);
  });
});
