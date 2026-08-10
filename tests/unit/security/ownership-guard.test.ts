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

/**
 * Gate que prova SESSÃO, não posse.
 *
 * ⚠️ Até 10/08/2026 esta lista tinha só `requireUserAction|requireRoleAction`, e
 * a linha do `continue` abaixo tirava da varredura tudo que não os usasse. O
 * dashboard inteiro fala outro idioma — `getAuthenticatedEmailFromAction()` +
 * `getUserContext(email)` — então dezenas de exports que recebem id/e-mail do
 * cliente nunca chegaram a ser olhados, e a allowlist VAZIA fazia o guard
 * parecer 100% limpo. `salvarCheckpointGestor` (F6, escrita e DELETE
 * cross-tenant) passou por aqui sem ser vista.
 */
const GATES_FRACOS = /requireUserAction|requireRoleAction|getAuthenticatedEmailFromAction|getUserContext/;
/**
 * Gate que já decide quem entra (admin/permissão/papel comercial).
 * Os `require*Representative*`/`requireCommercialAdmin*` entraram em 10/08: o
 * Portal do Representante inteiro usa esse idioma, e sem eles 32 exports
 * ficavam fora da conta — sem gate reconhecido, mas gatados de verdade.
 */
const GATES_FORTES = /requireAdminAction|requireAdminSupabase|protectedAction|requirePermissionAction|requireEmpresaSupabase|requireAdminOrCron|requireRepresentative\w*Action|requireCommercialAdminAction|\bisPlatformAdmin\s*\(/;
// ⚠️ `\bisPlatformAdmin\s*\(` casa a CHAMADA (`await isPlatformAdmin(email)`, um
// gate), não a propriedade `ctx.isPlatformAdmin`, que costuma ser só o bypass do
// admin dentro de uma regra maior. Trocar um pelo outro afrouxaria o guard em
// silêncio: dezenas de exports mencionam `ctx.isPlatformAdmin` sem serem
// restritos a admin.

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
  // Acrescentados em 10/08 com os idiomas que o repo REALMENTE usa — sem eles o
  // guard acusava `getPerfilExternoPdfUrl`, que tem um dos gates de posse mais
  // completos da base (tenant + gestor_email + tutorados). Guard que acusa quem
  // fez certo vira ruído, e ruído é como um guard morre.
  /\bctx\.colaborador\??\.empresa_id\b/,   // tenant vindo da SESSÃO, não do input
  /\bmesmoEmail\s*\(/,                      // igualdade de e-mail da sessão × alvo
  /canTutorAccess/, /tutorados_ids/,
  /assertRepresentativeOwnership/, /\bownAccount\s*\(/, /\bguardEvent\s*\(/,
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

/**
 * Corpo do export MAIS o das funções locais que ele chama (1 nível).
 *
 * O idioma dominante deste repo é `export async function f(x) { try { return
 * await _f(x) } catch {} }` com o gate dentro de `_f`. Lendo só o corpo do
 * export, o guard não via gate NENHUM — e como o filtro exige um gate fraco para
 * seguir adiante, esses exports saíam da varredura em silêncio. Medido em 10/08:
 * 24 exports com id do cliente e nenhuma chamada com cara de gate no corpo
 * próprio, entre eles `salvarRespostaDiagnostico`, cujo gate está no `_`.
 *
 * Um nível basta para o padrão real e mantém isto legível; se um dia alguém
 * empilhar dois wrappers, o guard volta a não ver — e é melhor saber disso por
 * escrito do que descobrir depois.
 */
/**
 * Tira comentários antes de procurar gate/posse.
 *
 * ⚠️ Encontrado por MUTAÇÃO em 10/08/2026, e é o furo mais sério que este guard
 * tinha: os sinais eram testados no TEXTO da função, comentários inclusive.
 * Removi de propósito o gate de posse de `salvarCheckpointGestor` para ver o
 * guard acusar — e ele ficou verde, porque um comentário meu logo acima citava
 * `canViewColabJourney`. Ou seja: **mencionar o nome de um gate num comentário
 * silenciava o guard**, por acidente ou de propósito. Um guard que se cala com
 * uma frase em português não guarda nada.
 */
function semComentarios(texto: string): string {
  return texto
    .replace(/\/\*[\s\S]*?\*\//g, ' ')   // /* … */ e /** … */
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 '); // // … (o `[^:]` poupa "https://")
}

function corpoComDelegacao(fn: ts.FunctionLikeDeclaration, sf: ts.SourceFile, locais: Map<string, string>): string {
  const proprio = semComentarios(fn.getText(sf));
  const chamadas = new Set<string>();
  const visit = (n: ts.Node): void => {
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression)) chamadas.add(n.expression.text);
    ts.forEachChild(n, visit);
  };
  visit(fn);
  let extra = '';
  for (const nome of chamadas) {
    const corpo = locais.get(nome);
    if (corpo) {
      const limpo = semComentarios(corpo);
      if (limpo !== proprio) extra += `\n${limpo}`;
    }
  }
  return proprio + extra;
}

/** Todas as funções declaradas no arquivo, por nome (para seguir a delegação). */
function funcoesLocais(sf: ts.SourceFile): Map<string, string> {
  const mapa = new Map<string, string>();
  for (const node of sf.statements) {
    if (ts.isFunctionDeclaration(node) && node.name) mapa.set(node.name.text, node.getText(sf));
    else if (ts.isVariableStatement(node)) {
      for (const d of node.declarationList.declarations) {
        if (d.initializer && (ts.isArrowFunction(d.initializer) || ts.isFunctionExpression(d.initializer) || ts.isCallExpression(d.initializer))) {
          mapa.set(d.name.getText(sf), d.getText(sf));
        }
      }
    }
  }
  return mapa;
}

function varrer(): Achado[] {
  const achados: Achado[] = [];

  for (const file of trackedTsFiles()) {
    let src: string;
    try { src = readFileSync(file, 'utf-8'); } catch { continue; }
    if (!src.includes("'use server'")) continue; // filtro barato

    const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    if (!isUseServer(sf)) continue;
    const locais = funcoesLocais(sf);

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

      const corpo = corpoComDelegacao(fn, sf, locais);
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
