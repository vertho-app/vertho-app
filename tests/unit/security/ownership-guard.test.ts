/**
 * Guard: "gate de SESSÃO sem gate de POSSE" — export `'use server'` que recebe
 * um id do CLIENTE e só verifica que existe alguém logado.
 *
 * Num arquivo `'use server'`, todo export é um endpoint HTTP e todo parâmetro é
 * escolhido pelo cliente. `requireUserAction()` prova que existe ALGUÉM logado —
 * não que esse alguém é dono do id que ele mandou. A distância entre as duas
 * coisas foi a classe inteira de IDORs de 16/07/2026: 9 exports, 4 deles
 * vazando PII cross-tenant (temporada + transcripts de qualquer colaborador;
 * clima organizacional de qualquer empresa).
 *
 * Por que os outros guards não pegam isto — e não é falha deles:
 *  - `tenant-read-guard` cobre `.from('<tabela>')` sem `empresa_id`. Mas
 *    `loadTemporada` fazia o bootstrap CERTO (`tenantDb(colab.empresa_id)`): o
 *    escopo era consistente, só que derivado do id que o CLIENTE pediu. Escopo
 *    consistente não é autorização — é o limite #2 documentado lá.
 *  - As actions de `pulse` checavam `ciclo.empresa_id === empresaId`, ou seja,
 *    comparavam o pedido com o próprio pedido. Passa em revisão apressada.
 * Nenhum guard de QUERY vê isso; é um guard de GATE.
 *
 * Heurística deliberada — SINAL, não prova (igual aos irmãos):
 *   flagra   = export 'use server' + gate fraco (requireUserAction/RoleAction)
 *              + parâmetro que parece id + NENHUM sinal de posse no corpo.
 *   sanciona = qualquer sinal de posse: canViewColabJourney, comparação com
 *              ctx.colaborador.id, ctx.empresaId, assertTenantAccess*,
 *              findColabByEmail (resolve o colab PELA SESSÃO, não pelo input).
 *
 * LIMITES CONHECIDOS (assumidos):
 *  1. Vê que EXISTE checagem de posse, não que ela está correta. Comparar com o
 *     id errado passa. Contra isso, só revisão humana.
 *  2. Sinal por regex no corpo: quem escrever a checagem de um jeito muito
 *     diferente vira falso positivo (declare na allowlist com o motivo no
 *     código) — preferimos falso positivo a falso negativo, porque aqui o
 *     falso negativo é vazamento de PII.
 *  3. Gates FORTES (requireAdminAction, protectedAction, requireEmpresaSupabase…)
 *     saem do escopo: quem exige admin/permissão já decidiu quem entra.
 */
import { readFileSync, existsSync } from 'fs';
import { execFileSync } from 'child_process';
import ts from 'typescript';
import { describe, it } from 'vitest';

const config = JSON.parse(readFileSync('config/ownership-allowlist.json', 'utf-8'));
const allowlist: Record<string, number> = config.allowlist;

/** Gate que prova SESSÃO, não posse. */
const GATES_FRACOS = /requireUserAction|requireRoleAction/;
/** Gate que já decide quem entra (admin/permissão/tenant explícito). */
const GATES_FORTES = /requireAdminAction|requireAdminSupabase|protectedAction|requirePermissionAction|requireEmpresaSupabase|requireAdminOrCron/;

/** Sinais de que o código confere a POSSE do recurso pedido. */
const SINAIS_POSSE = [
  /canViewColabJourney/,
  /ctx\.colaborador\??\.id\s*!==/, /ctx\.colaborador\??\.id\s*===/,
  /!==\s*ctx\.colaborador\??\.id/, /===\s*ctx\.colaborador\??\.id/,
  /assertTenantAccess/,
  /findColabByEmail/, /getColabByEmail/,
  /colaborador_id['"]?\s*,\s*ctx\./,
  /\bctx\.empresaId\b/, /auth\.empresaId/,
  /colab\.id\s*!==/, /\.id\s*!==\s*colab/,
];

const PARECE_ID = /(^|[a-z])(Id|_id|Ids)$|^id$/;

function trackedTsFiles(): string[] {
  try {
    const out = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] });
    return out.split('\0').filter((f) => /\.tsx?$/.test(f) && !f.includes('/tests/') && !f.startsWith('tests/'));
  } catch {
    return [];
  }
}

function isUseServer(sf: ts.SourceFile): boolean {
  const first = sf.statements[0];
  if (!first || !ts.isExpressionStatement(first)) return false;
  return ts.isStringLiteral(first.expression) && first.expression.text === 'use server';
}

interface Achado { file: string; line: number; nome: string; ids: string[] }

function varrer(): Achado[] {
  const achados: Achado[] = [];

  for (const file of trackedTsFiles()) {
    let src: string;
    try { src = readFileSync(file, 'utf-8'); } catch { continue; }
    if (!src.includes("'use server'")) continue; // filtro barato

    const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    if (!isUseServer(sf)) continue;

    for (const node of sf.statements) {
      let nome: string | null = null;
      let fn: ts.FunctionLikeDeclaration | null = null;

      const exportado = (mods?: readonly ts.ModifierLike[]) =>
        mods?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) ?? false;

      if (ts.isFunctionDeclaration(node) && node.name && exportado(node.modifiers)) {
        nome = node.name.text; fn = node;
      } else if (ts.isVariableStatement(node) && exportado(node.modifiers)) {
        const d = node.declarationList.declarations[0];
        if (d?.initializer && (ts.isArrowFunction(d.initializer) || ts.isFunctionExpression(d.initializer))) {
          nome = d.name.getText(sf); fn = d.initializer;
        }
      }
      if (!nome || !fn) continue;

      const corpo = fn.getText(sf);
      if (!GATES_FRACOS.test(corpo)) continue;   // sem gate de sessão → outro guard
      if (GATES_FORTES.test(corpo)) continue;    // admin/permissão já decide

      // Recebe algum id do cliente?
      const params: string[] = [];
      for (const p of fn.parameters) {
        if (ts.isIdentifier(p.name)) params.push(p.name.text);
        else if (ts.isObjectBindingPattern(p.name)) {
          for (const el of p.name.elements) params.push(el.name.getText(sf));
        }
        if (p.type) {
          const m = p.type.getText(sf).match(/\b\w*[Ii]d\b/g);
          if (m) params.push(...m);
        }
      }
      const ids = [...new Set(params.filter((p) => PARECE_ID.test(p)))];
      if (ids.length === 0) continue;

      if (!SINAIS_POSSE.some((r) => r.test(corpo))) {
        const { line } = sf.getLineAndCharacterOfPosition(fn.getStart(sf));
        achados.push({ file, line: line + 1, nome, ids });
      }
    }
  }
  return achados;
}

const achados = varrer();
const contagem: Record<string, number> = {};
for (const a of achados) contagem[a.file] = (contagem[a.file] || 0) + 1;

describe('Guard: export use server com gate de sessão mas sem gate de posse', () => {
  it('o guard enxerga o repositório (não passou vazio por engano)', () => {
    const total = trackedTsFiles().length;
    if (total < 100) {
      throw new Error(`git ls-files devolveu ${total} arquivos .ts/.tsx — guard cego. Um guard que não lê nada passa sempre.`);
    }
  });

  it('o guard reconhece um gate de posse quando existe (não flagra tudo)', () => {
    // Âncora viva: estes foram corrigidos em 16/07 e têm checagem de posse real.
    // Se aparecerem como achado, a heurística de SINAIS_POSSE quebrou e o guard
    // vai virar ruído — que é como um guard morre.
    const corrigidos = ['actions/engajamento.ts', 'actions/video-tracking.ts', 'actions/temporadas.ts'];
    const regrediu = corrigidos.filter((f) => contagem[f]);
    if (regrediu.length > 0) {
      throw new Error(
        `o guard flagrou arquivo com gate de posse conhecido: ${regrediu.join(', ')}.\n` +
        'Ou a checagem foi removida (bug de verdade), ou SINAIS_POSSE não reconhece mais o padrão.',
      );
    }
  });

  it('nenhum export NOVO com id do cliente e só gate de sessão', () => {
    const violacoes = Object.keys(contagem).filter((f) => !(f in allowlist));
    if (violacoes.length > 0) {
      throw new Error(
        `${violacoes.length} arquivo(s) com export 'use server' sem checagem de posse:\n` +
        violacoes.map((f) =>
          `  ❌ ${f}\n` +
          achados.filter((a) => a.file === f).map((a) => `       ${a.nome}(${a.ids.join(', ')})  :${a.line}`).join('\n'),
        ).join('\n') +
        "\n\nTodo export 'use server' é endpoint HTTP e o id vem do CLIENTE: sessão prova\n" +
        'que existe alguém logado, não que ele é dono do id. Cheque a posse:\n' +
        '  · jornada de um colab  → canViewColabJourney(ctx, colab)\n' +
        '  · escrita do próprio   → ctx.colaborador?.id === <id>\n' +
        '  · recorte de tenant    → ctx.empresaId === empresaId (admin passa)\n',
      );
    }
  });

  it('contagem não aumentou em arquivo já allowlisted', () => {
    const aumentou = Object.entries(allowlist)
      .filter(([file, esperado]) => (contagem[file] || 0) > esperado)
      .map(([file, esperado]) => `  ⚠️ ${file}: esperado ${esperado}, encontrado ${contagem[file]}`);
    if (aumentou.length > 0) {
      throw new Error(`exports sem gate de posse AUMENTARAM:\n${aumentou.join('\n')}\n\nA allowlist só encolhe.`);
    }
  });

  it('nenhuma entrada stale na allowlist', () => {
    const stale = Object.entries(allowlist).filter(([file]) => !existsSync(file) || !contagem[file]);
    if (stale.length > 0) {
      throw new Error(
        `${stale.length} entrada(s) stale — remova da allowlist:\n` +
        stale.map(([f]) => `  🗑️ ${f}${existsSync(f) ? ' — já tem checagem de posse (ótimo!)' : ' — arquivo não existe'}`).join('\n'),
      );
    }
  });
});
