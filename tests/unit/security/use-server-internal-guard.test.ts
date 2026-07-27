/**
 * Guard: nenhuma NOVA server action pode aceitar uma flag `internal`.
 *
 * Num arquivo `'use server'`, TODO export é um endpoint HTTP. Logo um parâmetro
 * que pula o gate de autorização é escolhido pelo CLIENTE, não pelo servidor.
 * Em 09/07/2026 isso era explorável: o action id de `gerarBlueprint` estava no
 * bundle público, e `gerarBlueprint({ colaboradorId, internal: { empresaId } })`
 * rodava service-role sem sessão. Ver docs/SECURITY-STATUS.md e CLAUDE.md.
 *
 * Caminho headless (script/seed/task/cron) NÃO usa flag: extrai um núcleo sem
 * gate pra `lib/` (modelos: `lib/blueprint/core.ts`, `lib/modulo-base-auditor.ts`)
 * e a action `'use server'` gata sempre e delega.
 *
 * Detecção por AST (regex não pega os 3 formatos reais):
 *   1. identificador     — `enviarWhatsApp(tel, msg, internal = false)`
 *   2. destructuring     — `gerarBlueprint({ colaboradorId, internal })`
 *   3. membro-do-tipo    — `rodarIA4(id, cfg, opts: { internal?: boolean })`
 *
 * Só arquivos VERSIONADOS entram (mesma razão do service-role guard: rascunho
 * local não deve deixar o guard vermelho na máquina do dev).
 */
import { readFileSync, existsSync } from 'fs';
import { execFileSync } from 'child_process';
import ts from 'typescript';
import { describe, it } from 'vitest';

interface Achado {
  file: string;
  fn: string;
  line: number;
  via: string;
}

const config = JSON.parse(readFileSync('config/use-server-internal-allowlist.json', 'utf-8'));
const allowlist: string[] = config.allowlist;

/** `arquivo::funcao` — chave estável, não depende de linha. */
const chave = (a: Pick<Achado, 'file' | 'fn'>) => `${a.file}::${a.fn}`;

function trackedTsFiles(): string[] {
  try {
    const out = execFileSync('git', ['ls-files', '-z'], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return out.split('\0').filter((f) => /\.tsx?$/.test(f));
  } catch {
    return [];
  }
}

/** Primeiro statement é a diretiva `'use server'`? (não basta conter a string) */
function isUseServer(sf: ts.SourceFile): boolean {
  const first = sf.statements[0];
  if (!first || !ts.isExpressionStatement(first)) return false;
  const e = first.expression;
  return ts.isStringLiteral(e) && e.text === 'use server';
}

function paramCarriesInternal(param: ts.ParameterDeclaration): string[] {
  const via: string[] = [];
  if (ts.isIdentifier(param.name) && param.name.text === 'internal') via.push('identificador');
  if (ts.isObjectBindingPattern(param.name)) {
    for (const el of param.name.elements) {
      const n = el.propertyName ?? el.name;
      if (ts.isIdentifier(n) && n.text === 'internal') via.push('destructuring');
    }
  }
  if (param.type && ts.isTypeLiteralNode(param.type)) {
    for (const m of param.type.members) {
      if (m.name && ts.isIdentifier(m.name) && m.name.text === 'internal') via.push('membro-do-tipo');
    }
  }
  return via;
}

const isExported = (node: ts.Node): boolean =>
  (ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined)?.some(
    (m) => m.kind === ts.SyntaxKind.ExportKeyword,
  ) ?? false;

function varrer(): Achado[] {
  const achados: Achado[] = [];
  for (const file of trackedTsFiles()) {
    let src: string;
    try { src = readFileSync(file, 'utf-8'); } catch { continue; }
    if (!src.includes('use server')) continue; // filtro barato antes do parse

    const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    if (!isUseServer(sf)) continue;

    const registrar = (fn: string, params: readonly ts.ParameterDeclaration[], node: ts.Node) => {
      const via = params.flatMap(paramCarriesInternal);
      if (!via.length) return;
      const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
      achados.push({ file, fn, line: line + 1, via: [...new Set(via)].join('+') });
    };

    for (const st of sf.statements) {
      if (ts.isFunctionDeclaration(st) && isExported(st) && st.name) {
        registrar(st.name.text, st.parameters, st);
      }
      if (ts.isVariableStatement(st) && isExported(st)) {
        for (const d of st.declarationList.declarations) {
          const init = d.initializer;
          if (init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) && ts.isIdentifier(d.name)) {
            registrar(d.name.text, init.parameters, st);
          }
        }
      }
    }
  }
  return achados;
}

const achados = varrer();

describe("Guard: nenhuma server action nova com flag `internal`", () => {
  it('nenhuma action fora da allowlist', () => {
    const permitidas = new Set(allowlist);
    const violacoes = achados.filter((a) => !permitidas.has(chave(a)));
    if (violacoes.length > 0) {
      throw new Error(
        `${violacoes.length} server action(s) com flag \`internal\` fora da allowlist:\n` +
        violacoes.map((v) => `  ❌ ${v.file}:${v.line} — ${v.fn}() [${v.via}]`).join('\n') +
        '\n\nEm arquivo \'use server\' todo export é endpoint HTTP: `internal` é escolhida pelo CLIENTE.\n' +
        'Caminho headless → extraia um núcleo sem gate pra lib/ (modelo: lib/blueprint/core.ts)\n' +
        'e deixe a action sempre gatada. NÃO adicione à allowlist para "passar o CI".',
      );
    }
  });

  it('nenhuma entrada stale na allowlist', () => {
    const vivas = new Set(achados.map(chave));
    const stale = allowlist.filter((k) => !vivas.has(k));
    if (stale.length > 0) {
      const [arquivosSumidos, corrigidas] = [
        stale.filter((k) => !existsSync(k.split('::')[0])),
        stale.filter((k) => existsSync(k.split('::')[0])),
      ];
      throw new Error(
        `${stale.length} entrada(s) stale na allowlist:\n` +
        corrigidas.map((k) => `  🗑️ ${k} — não tem mais \`internal\` (ótimo: remova da allowlist)`).join('\n') +
        (corrigidas.length && arquivosSumidos.length ? '\n' : '') +
        arquivosSumidos.map((k) => `  🗑️ ${k} — arquivo não existe mais`).join('\n'),
      );
    }
  });

  it('o guard enxerga os arquivos (sanidade: não passou vazio por engano)', () => {
    const total = trackedTsFiles().length;
    if (total < 100) {
      throw new Error(
        `git ls-files devolveu só ${total} arquivos .ts/.tsx — guard cego. ` +
        'Um guard que não lê nada passa sempre.',
      );
    }
  });
});
