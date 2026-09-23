import { describe, it } from 'vitest';
import { execFileSync } from 'child_process';

/**
 * Guard: `.md` só nasce em `docs/`.
 *
 * Motivo (27/07/2026): 64 documentos espalhados, o mesmo assunto em 3-5 lugares e
 * versões que se contradiziam — `migrations-workflow.md` ensinou `supabase db push`
 * por meses ao lado do `SCHEMA-PROCESS.md`, que ensinava o certo. Consolidados 21
 * em 6 e a raiz esvaziada; este guard existe para a entropia não voltar.
 *
 * As exceções NÃO são preferência de organização — são contrato técnico:
 *  - `CLAUDE.md` / `AGENTS.md`: carregados por convenção de CAMINHO. Movidos, o
 *    agente perde as regras do projeto em toda sessão.
 *  - `.claude/skills/<nome>/*.md`: o caminho É o identificador da skill.
 *  - `.claude/agents/<nome>.md`: mesma razão, o caminho É o identificador do
 *    subagent. Movido para `docs/`, ele deixa de ser invocável.
 *  - `README.md` de subprojeto: pertence à pasta que descreve.
 *
 * ⚠️ Varre apenas arquivos VERSIONADOS (`git ls-files`), igual aos outros guards do
 * repo: um `.md` novo ainda não commitado passa verde localmente e derruba o CI no
 * commit. Ao criar doc fora de `docs/`, rode isto com o arquivo já em stage.
 */

const EXCECOES = [
  /^CLAUDE\.md$/,
  /^AGENTS\.md$/,
  /^\.claude\/skills\/[^/]+\/.*\.md$/i,
  /^\.claude\/agents\/[^/]+\.md$/i,
  /(^|\/)README\.md$/i,
];

/**
 * 🔴 Docs apagados DE PROPÓSITO, que não podem voltar (22/09/2026).
 *
 * Em 29/08/2026 um commit de "artefatos acumulados do workspace" (`dc2e4895`, 255
 * arquivos) re-adicionou 23 docs que a consolidação de 27/07 tinha apagado,
 * IDÊNTICOS à versão apagada. Entre eles, `migrations-workflow.md` (ensinava
 * `supabase db push`), `rotina-antifalha.md` e `checklist-antes-de-prompt-grande.md`
 * (`git add -A`) e a matriz de competências de um cliente, num repo público. O
 * teste de LUGAR acima não viu nada, porque todos estavam dentro de `docs/`, e
 * eles ficaram 24 dias no ar. Saíram de novo em `c5dcf819`.
 *
 * É lápide, não allowlist: para trazer um de volta de propósito, tire o nome
 * daqui no MESMO commit e diga por quê.
 */
const APAGADOS_DE_PROPOSITO = [
  'docs/ANALISE-RISCOS-PIPELINE-TRILHA.md',
  'docs/CONTEUDO-GERACAO-PEGADINHAS.md',
  'docs/GO-LIVE-CHECKLIST.md',
  'docs/JORNADA_DE-PARA_GAS-NEXTJS.md',
  'docs/MAPEAMENTO_COMPARATIVO_GAS_NEXTJS.md',
  'docs/TEMPLATE-MODULO-BASE.md',
  'docs/auditoria-arquitetura-2026-06.md',
  'docs/auditoria-final-sistema.md',
  'docs/auditoria-tecnica-rotas-acoes.md',
  'docs/auditoria-ux-funcional.md',
  'docs/checklist-antes-de-deploy.md',
  'docs/checklist-antes-de-prompt-grande.md',
  'docs/ibipeba-gestao-escolar-competencias-descritores.md',
  'docs/migrations-workflow.md',
  'docs/paridade-gas-next-auditoria.md',
  'docs/permissions-plan.md',
  'docs/refatoracao-arquitetural-sugestoes.md',
  'docs/rotina-antifalha.md',
  'docs/service-role-allowlist.md',
  'docs/smoke-test-report.md',
  'docs/templates-video-miolo.md',
  'docs/tenant-db-migration.md',
  'docs/typescript-migration.md',
];

function mdsVersionados(): string[] {
  const out = execFileSync('git', ['ls-files', '-z', '*.md'], {
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  return out.split('\0').filter(Boolean);
}

describe('Guard: documentação vive em docs/', () => {
  it('nenhum .md novo fora de docs/ (salvo as 4 exceções de contrato)', () => {
    const foraDeDocs = mdsVersionados()
      .filter((f) => !f.startsWith('docs/'))
      .filter((f) => !EXCECOES.some((re) => re.test(f)));

    if (foraDeDocs.length > 0) {
      throw new Error(
        `${foraDeDocs.length} arquivo(s) .md fora de \`docs/\`:\n`
        + foraDeDocs.map((f) => `  ❌ ${f}`).join('\n')
        + '\n\nMova para `docs/` (é o único lugar de doc novo) ou, se for contrato'
        + ' técnico, acrescente a exceção NESTE arquivo com a justificativa.'
        + '\nDump de dados de tenant e notas de sessão não entram no repo — ele é PÚBLICO.',
      );
    }
  });

  it('docs apagados de propósito não voltam ao repositório', () => {
    const todos = new Set(mdsVersionados());
    // Canário: sem ele, uma listagem que não enxergasse `docs/` passaria o teste
    // por AUSÊNCIA de tudo, não por ausência das lápides.
    if (!todos.has('docs/FEATURES-E-BENEFICIOS.md')) {
      throw new Error('A listagem não enxergou docs/FEATURES-E-BENEFICIOS.md: este teste não mediria nada.');
    }
    const voltaram = APAGADOS_DE_PROPOSITO.filter((f) => todos.has(f));
    if (voltaram.length > 0) {
      throw new Error(
        `${voltaram.length} doc(s) apagado(s) de propósito voltaram:\n`
        + voltaram.map((f) => `  ❌ ${f}`).join('\n')
        + '\n\nForam apagados porque ensinavam o caminho errado ou vazavam dado de cliente;'
        + ' o conteúdo útil já vive no doc canônico do assunto. Tire do commit. Se a volta'
        + ' for de propósito, remova o nome de APAGADOS_DE_PROPOSITO neste arquivo, no mesmo'
        + ' commit, dizendo por quê.',
      );
    }
  });

  it('as exceções de contrato continuam existindo (o guard não é vacuamente verdadeiro)', () => {
    const todos = mdsVersionados();
    for (const esperado of ['CLAUDE.md', 'AGENTS.md']) {
      if (!todos.includes(esperado)) {
        throw new Error(
          `${esperado} não está mais versionado na raiz. Se foi movido de propósito, `
          + 'remova a exceção deste guard; se não, restaure — ele é carregado por caminho.',
        );
      }
    }
    if (!todos.some((f) => /^\.claude\/skills\/[^/]+\/SKILL\.md$/.test(f))) {
      throw new Error('Nenhuma SKILL.md encontrada — o padrão de caminho das skills mudou?');
    }
    // Mesmo canário para a exceção dos agents: sem ele, a linha da EXCECOES
    // vira letra morta e ninguém percebe se o caminho mudar.
    if (!todos.some((f) => /^\.claude\/agents\/[^/]+\.md$/.test(f))) {
      throw new Error('Nenhum agent em .claude/agents/ — o padrão de caminho dos subagents mudou?');
    }
  });
});
