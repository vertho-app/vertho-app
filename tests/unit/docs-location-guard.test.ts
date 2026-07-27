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
  /(^|\/)README\.md$/i,
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
  });
});
