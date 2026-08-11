import { readFileSync, existsSync } from 'fs';
import { execFileSync } from 'child_process';
import ts from 'typescript';
import { describe, it } from 'vitest';

/**
 * Guard: chamada de IA sem `taskKey` no ledger.
 *
 * F13 da auditoria de 09-10/08/2026. Medido no `ia_usage_log` (90 dias):
 * **$99,88 de $130,27 — 76,7% do custo — caem em `feature: 'untagged'`**, e
 * 100% desse untagged vem de `source: 'wrapper'`, ou seja, de call-sites de
 * `callAI`/`callAIChat` que não passam `taskKey`. O ledger responde "quanto" e
 * nunca "onde".
 *
 * O achado tem um detalhe que decide a correção: uma etiquetagem pontual foi
 * feita em 31/07 e **a tendência não mudou** — re-medido em 10/08, **56 das 102
 * chamadas dos últimos 7 dias ainda nascem sem etiqueta**. Etiquetar os
 * call-sites de hoje resolve o passado; o que impede a volta é um guard, porque
 * o custo não sobe por causa dos call-sites que existem — sobe pelos que serão
 * escritos amanhã.
 *
 * A allowlist é dívida DECLARADA e só encolhe. Entrada nova nela é exatamente o
 * que este guard existe para pegar.
 */

const ALLOWLIST_PATH = 'config/ia-taskkey-allowlist.json';

interface Achado { file: string; line: number; fn: string }

function trackedTsFiles(): string[] {
  try {
    return execFileSync('git', ['ls-files', '-z'], { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] })
      .split('\0')
      .filter((f) => /\.tsx?$/.test(f) && !f.includes('/tests/') && !f.startsWith('tests/'));
  } catch {
    return [];
  }
}

/**
 * `taskKey` em qualquer objeto passado como argumento da chamada.
 *
 * ⚠️ O spread (`...options`) conta como etiquetado, e isso é uma concessão
 * DECLARADA, não um descuido: quem repassa o que recebeu depende do chamador
 * para etiquetar, e o guard não segue essa cadeia. Um call-site pode se
 * esconder atrás de um spread vazio. Se a proporção de untagged parar de cair
 * mesmo com a allowlist encolhendo, é aqui que se olha primeiro.
 */
function temTaskKey(call: ts.CallExpression, sf: ts.SourceFile): boolean {
  for (const arg of call.arguments) {
    if (!ts.isObjectLiteralExpression(arg)) continue;
    for (const p of arg.properties) {
      const nome = p.name?.getText(sf);
      if (nome === 'taskKey') return true;
      if (ts.isSpreadAssignment(p)) return true;
    }
  }
  return false;
}

export function varrer(files: string[]): Achado[] {
  const achados: Achado[] = [];
  for (const file of files) {
    let src: string;
    try { src = readFileSync(file, 'utf-8'); } catch { continue; }
    if (!/\bcallAI(Chat)?\s*\(/.test(src)) continue;

    const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node)) {
        const nome = ts.isIdentifier(node.expression) ? node.expression.text
          : ts.isPropertyAccessExpression(node.expression) ? node.expression.name.text : '';
        if ((nome === 'callAI' || nome === 'callAIChat') && !temTaskKey(node, sf)) {
          const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
          achados.push({ file, line: line + 1, fn: nome });
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  return achados;
}

const achados = varrer(trackedTsFiles());
const contagem: Record<string, number> = {};
for (const a of achados) contagem[a.file] = (contagem[a.file] || 0) + 1;

const allowlist: Record<string, number> = existsSync(ALLOWLIST_PATH)
  ? JSON.parse(readFileSync(ALLOWLIST_PATH, 'utf-8')).allowlist
  : {};

describe('Guard: chamada de IA sem taskKey (ledger cego)', () => {
  it('o guard enxerga o repositório (não passou vazio por engano)', () => {
    const arquivos = trackedTsFiles();
    if (arquivos.length < 100) throw new Error(`git ls-files devolveu ${arquivos.length} arquivos — guard cego`);
  });

  it('nenhuma chamada NOVA de IA sem taskKey', () => {
    const violacoes = Object.keys(contagem).filter((f) => !(f in allowlist));
    if (violacoes.length > 0) {
      throw new Error(
        `${violacoes.length} arquivo(s) chamam IA sem \`taskKey\`:\n` +
        violacoes.map((f) =>
          `  ❌ ${f}\n` + achados.filter((a) => a.file === f).map((a) => `       ${a.fn}()  :${a.line}`).join('\n'),
        ).join('\n') +
        '\n\nSem `taskKey` o custo cai em `feature: "untagged"` — hoje 76,7% do gasto de IA.\n' +
        'Passe `taskKey` nas options: callAI(system, user, cfg, maxTokens, { taskKey: "nome_da_fase", empresaId }).\n',
      );
    }
  });

  it('contagem não aumentou em arquivo já allowlisted', () => {
    const aumentou = Object.entries(allowlist)
      .filter(([file, esperado]) => (contagem[file] || 0) > esperado)
      .map(([file, esperado]) => `  ⚠️ ${file}: esperado ${esperado}, encontrado ${contagem[file]}`);
    if (aumentou.length > 0) {
      throw new Error(`chamadas sem taskKey AUMENTARAM:\n${aumentou.join('\n')}\n\nA allowlist só encolhe.`);
    }
  });

  it('nenhuma entrada stale na allowlist', () => {
    const stale = Object.entries(allowlist).filter(([file]) => !contagem[file]);
    if (stale.length > 0) {
      throw new Error(
        `${stale.length} entrada(s) stale — remova da allowlist:\n` +
        stale.map(([f]) => `  🗑️ ${f}${existsSync(f) ? ' — já etiqueta (ótimo!)' : ' — arquivo não existe'}`).join('\n'),
      );
    }
  });
});
