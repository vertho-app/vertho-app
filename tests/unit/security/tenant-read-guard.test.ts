/**
 * Guard: LEITURAS (select) em tabelas tenant-owned de maior blast radius, feitas
 * com client RAW (service-role) e SEM filtro de tenant no WHERE.
 *
 * Irmão do `tenant-mutation-guard` (que cobre update/delete). A leitura ficou
 * descoberta, e é o vetor de vazamento cross-tenant mais provável: um PR novo
 * que faz `sb.from('colaboradores').select('*').eq('id', x)` sem `empresa_id`
 * devolve a linha de QUALQUER tenant.
 *
 * Por que não confiar no banco: o app roda 100% service-role, e `service_role`
 * tem `rolbypassrls = true` no Postgres. As 5 tabelas abaixo JÁ têm RLS ligada
 * com policies tenant-scoped, e mesmo assim a service_role lê cross-tenant
 * (medido: 207 linhas / 8 empresas em `colaboradores`). `FORCE ROW LEVEL
 * SECURITY` não muda isso — FORCE afeta o dono da tabela, não roles com
 * BYPASSRLS. Ou seja: o isolamento é responsabilidade do CÓDIGO, e este guard é
 * quem cobra.
 *
 * Escopo deliberado: as 4 tabelas de PII/assessment que TÊM coluna `empresa_id`.
 * Não é a lista completa de tabelas tenant-owned — é onde um vazamento é evento
 * de LGPD. Expandir depois.
 *
 * `mensagens_chat` fica de FORA de propósito: ela não tem coluna `empresa_id`
 * (verificado: `tdb.from('mensagens_chat').select()` devolve `42703 column
 * mensagens_chat.empresa_id does not exist`). O escopo dela é indireto, via
 * `sessao_id` → `sessoes_avaliacao.empresa_id`, e é assim que a policy do banco
 * a protege. Exigir `.eq('empresa_id')` ali seria uma regra impossível de
 * satisfazer — e uma regra impossível vira allowlist permanente, isto é, ruído.
 * O que protege `mensagens_chat` é o `sessao_id` vir de uma sessão já validada
 * como do tenant; isso um guard estático não consegue provar.
 *
 * Como SAIR da allowlist (em ordem de preferência):
 *   1. `tenantDb(empresaId).from(...)` — filtro injetado, impossível esquecer;
 *   2. `.eq('empresa_id', empresaId)` na mesma cadeia.
 * Adicionar entrada nova à allowlist é assumir dívida — precisa de justificativa.
 *
 * Detecção por AST (regex não modela a cadeia `.from().select().eq().eq()`):
 * acha `X.from('<tabela>')`, sobe a cadeia de métodos encadeados e exige um
 * `.eq|.is|.in|.match|.filter('empresa_id', ...)` em algum ponto — a menos que o
 * receiver seja `tdb`/`tenantDb(...)`, que já injeta o filtro.
 *
 * ── BOOTSTRAP READ (exceção reconhecida) ───────────────────────────────────
 * Existe uma leitura sem `empresa_id` que é IMPOSSÍVEL de escrever de outro
 * jeito: a que DESCOBRE o tenant. `colaboradores` é a raiz da tenancy — não dá
 * pra filtrar por aquilo que a query existe para encontrar:
 *
 *     const { data: colab } = await sb.from('colaboradores')
 *       .select('empresa_id').eq('id', colaboradorId).maybeSingle();
 *     const tdb = tenantDb(colab.empresa_id);   // ← daqui pra baixo, escopado
 *
 * Marcar isso como violação empurra código correto pra allowlist, e allowlist
 * inflada é allowlist ignorada — o guard perde a autoridade justamente onde
 * precisa dela. Então o guard reconhece o padrão, com uma exigência dura:
 * o `empresa_id` lido tem que ser USADO PARA ESCOPAR OU VALIDAR
 * (`tenantDb(...)`, `assertTenantAccess*(...)`, ou comparado com `===`/`!==`).
 *
 * O que NÃO sanciona — e a distinção é o coração deste guard: usar o
 * `empresa_id` lido para CARIMBAR um insert/update.
 *
 *     const { data: c } = await sb.from('colaboradores')
 *       .select('empresa_id').eq('id', colaboradorIdVindoDoCliente).maybeSingle();
 *     await sb.from('videos_watched').insert({ empresa_id: c?.empresa_id, ... });
 *
 * Isso ATRIBUI o registro ao tenant certo, mas não impede o cliente de escolher
 * o colaborador de OUTRO — é IDOR de escrita com aparência de código correto
 * (foi exatamente o bug de `registrarEventoTrilha` e `registrarVideoWatched`).
 * Carimbar ≠ isolar. Só escopar/validar sanciona.
 *
 * LIMITES CONHECIDOS (falso-negativos estruturais):
 *  1. O guard vê que existe um filtro por `empresa_id`, não que o VALOR é o
 *     tenant certo: `.eq('empresa_id', empresaIdVindoDoCliente)` passa.
 *  2. No bootstrap, ele vê que o valor foi usado para escopar/validar — não que
 *     a validação está correta (ex.: comparar com o tenant errado).
 * Contra os dois, só RLS real (JWT `authenticated`) ou revisão humana.
 */
import { readFileSync, existsSync } from 'fs';
import { execFileSync } from 'child_process';
import ts from 'typescript';
import { describe, it } from 'vitest';

const TABELAS = ['colaboradores', 'respostas', 'relatorios', 'sessoes_avaliacao'] as const;
const FILTROS_TENANT = new Set(['eq', 'is', 'in', 'match', 'filter']);
const MUTACOES = new Set(['insert', 'update', 'delete', 'upsert']);

const config = JSON.parse(readFileSync('config/tenant-read-allowlist.json', 'utf-8'));
const allowlist: Record<string, number> = config.allowlist;

function trackedTsFiles(): string[] {
  try {
    const out = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] });
    return out.split('\0').filter((f) => /\.tsx?$/.test(f) && !f.includes('/tests/') && !f.startsWith('tests/'));
  } catch {
    return [];
  }
}

interface Achado { file: string; line: number; tabela: string }

/**
 * Componente de browser (`'use client'`) NÃO é escopo deste guard: lá o client
 * é o anon (`NEXT_PUBLIC_SUPABASE_ANON_KEY` + sessão do usuário), sujeito a RLS
 * — a service-role key nem existe no bundle. As policies tenant-scoped de
 * `sessoes_avaliacao`/`mensagens_chat` cobrem esse caminho. Marcá-los como
 * violação seria falso positivo, e allowlist com ruído é allowlist ignorada.
 */
function isUseClient(sf: ts.SourceFile): boolean {
  const first = sf.statements[0];
  if (!first || !ts.isExpressionStatement(first)) return false;
  const e = first.expression;
  return ts.isStringLiteral(e) && e.text === 'use client';
}

// ── Bootstrap read: reconhecimento ─────────────────────────────────────────
// Funções que provam que o tenant lido virou escopo ou barreira. `tenantDb`
// injeta o filtro; os `assert*` derrubam o request quando o tenant não confere.
const SANCIONADORES = /^(tenantDb|assertTenantAccess|assertTenantAccessAction|assertTenantAccessApi|requireTenantAccess)$/;
const COMPARACOES = new Set([ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken]);

/** Função/método que contém o node — o escopo onde a prova de uso precisa estar. */
function escopoDe(node: ts.Node): ts.Node {
  let cur: ts.Node = node;
  while (cur.parent) {
    if (
      ts.isFunctionDeclaration(cur) || ts.isArrowFunction(cur) ||
      ts.isFunctionExpression(cur) || ts.isMethodDeclaration(cur)
    ) return cur;
    cur = cur.parent;
  }
  return node.getSourceFile();
}

/**
 * Nome ligado ao `data` da query: `const { data: colab } = await sb.from(...)`
 * → "colab". Sem isso não há como rastrear o uso do valor lido.
 */
function nomeDoData(node: ts.Node): string | null {
  let cur: ts.Node = node;
  while (
    cur.parent &&
    (ts.isPropertyAccessExpression(cur.parent) || ts.isCallExpression(cur.parent) || ts.isAwaitExpression(cur.parent))
  ) cur = cur.parent;

  const decl = cur.parent;
  if (!decl || !ts.isVariableDeclaration(decl)) return null;
  if (!ts.isObjectBindingPattern(decl.name)) return null;

  for (const el of decl.name.elements) {
    const prop = el.propertyName ? el.propertyName.getText() : el.name.getText();
    if (prop === 'data' && ts.isIdentifier(el.name)) return el.name.text;
  }
  return null;
}

/** Desce por `!`/`()` até o pai que realmente diz o que foi feito com o valor. */
function paiEfetivo(node: ts.Node): ts.Node | undefined {
  let p = node.parent;
  while (p && (ts.isNonNullExpression(p) || ts.isParenthesizedExpression(p))) p = p.parent;
  return p;
}

/**
 * Prova, dentro do escopo, que `<varName>.empresa_id` virou escopo ou barreira.
 * Segue UM nível de alias (`const empresaId = colab.empresa_id`), que cobre o
 * estilo real do repo sem virar análise de fluxo de dados.
 */
function usaTenantParaEscoparOuValidar(escopo: ts.Node, varName: string, sf: ts.SourceFile): boolean {
  const portadores = new Set<string>();
  let sancionado = false;

  const ehLeituraDoTenant = (n: ts.Node): boolean => {
    if (!ts.isPropertyAccessExpression(n) || n.name.text !== 'empresa_id') return false;
    const base = n.expression.getText(sf).replace(/[!?]/g, '').trim();
    return base === varName || portadores.has(base);
  };

  // 1ª passada: aliases (`const empresaId = colab.empresa_id`).
  const coletarAliases = (n: ts.Node): void => {
    if (ts.isVariableDeclaration(n) && n.initializer && ts.isIdentifier(n.name) && ehLeituraDoTenant(n.initializer)) {
      portadores.add(n.name.text);
    }
    ts.forEachChild(n, coletarAliases);
  };
  coletarAliases(escopo);

  // 2ª passada: o valor (ou um alias dele) foi escopado/validado?
  const visit = (n: ts.Node): void => {
    if (sancionado) return;

    const ehPortador = ehLeituraDoTenant(n) || (ts.isIdentifier(n) && portadores.has(n.text));
    if (ehPortador) {
      const p = paiEfetivo(n);
      if (p && ts.isCallExpression(p) && p.arguments.some((a) => a === n || a.getText(sf).includes(n.getText(sf)))) {
        const callee = p.expression.getText(sf).split('.').pop() || '';
        if (SANCIONADORES.test(callee)) sancionado = true;
      }
      if (p && ts.isBinaryExpression(p) && COMPARACOES.has(p.operatorToken.kind)) sancionado = true;
    }
    ts.forEachChild(n, visit);
  };
  visit(escopo);

  return sancionado;
}

function varrer(): Achado[] {
  const achados: Achado[] = [];
  for (const file of trackedTsFiles()) {
    let src: string;
    try { src = readFileSync(file, 'utf-8'); } catch { continue; }
    if (!TABELAS.some((t) => src.includes(`'${t}'`))) continue; // filtro barato

    const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    if (isUseClient(sf)) continue;

    const visit = (node: ts.Node): void => {
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === 'from' &&
        node.arguments.length === 1 &&
        ts.isStringLiteral(node.arguments[0]) &&
        (TABELAS as readonly string[]).includes(node.arguments[0].text)
      ) {
        const tabela = node.arguments[0].text;
        const receiver = node.expression.expression.getText(sf);

        // Sobe a cadeia encadeada: .from(x).select(...).eq(...).eq(...)
        const metodos: Array<{ nome: string; arg0: string | null }> = [];
        let cur: ts.Node = node;
        while (
          cur.parent && ts.isPropertyAccessExpression(cur.parent) &&
          cur.parent.parent && ts.isCallExpression(cur.parent.parent)
        ) {
          const call = cur.parent.parent;
          const a0 = call.arguments[0];
          metodos.push({
            nome: cur.parent.name.text,
            arg0: a0 && ts.isStringLiteral(a0) ? a0.text : null,
          });
          cur = call;
        }
        const nomes = metodos.map((m) => m.nome);
        const ehLeitura = nomes.includes('select') && !nomes.some((n) => MUTACOES.has(n));

        if (ehLeitura) {
          const temFiltroTenant = metodos.some((m) => FILTROS_TENANT.has(m.nome) && m.arg0 === 'empresa_id');
          const sancionado = /\btdb\b|tenantDb/.test(receiver);

          // Bootstrap read: por PK, lendo empresa_id, e provando que o tenant
          // lido virou escopo/barreira (não só carimbo num payload).
          const porPk = metodos.some((m) => m.nome === 'eq' && m.arg0 === 'id');
          const selectCols = metodos.find((m) => m.nome === 'select')?.arg0 || '';
          const leTenant = /\bempresa_id\b/.test(selectCols);
          const varData = nomeDoData(node);
          const ehBootstrap = Boolean(
            porPk && leTenant && varData &&
            usaTenantParaEscoparOuValidar(escopoDe(node), varData, sf),
          );

          if (!temFiltroTenant && !sancionado && !ehBootstrap) {
            const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
            achados.push({ file, line: line + 1, tabela });
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  return achados;
}

const achados = varrer();
const contagem: Record<string, number> = {};
for (const a of achados) contagem[a.file] = (contagem[a.file] || 0) + 1;

describe('Guard: leitura raw de tabela tenant-owned sem filtro de empresa_id', () => {
  it('o guard enxerga o repositório (não passou vazio por engano)', () => {
    const total = trackedTsFiles().length;
    if (total < 100) {
      throw new Error(`git ls-files devolveu ${total} arquivos .ts/.tsx — guard cego. Um guard que não lê nada passa sempre.`);
    }
  });

  it('nenhum arquivo NOVO com leitura raw sem filtro de tenant', () => {
    const violacoes = Object.keys(contagem).filter((f) => !(f in allowlist));
    if (violacoes.length > 0) {
      throw new Error(
        `${violacoes.length} arquivo(s) com leitura raw sem \`empresa_id\`, fora da allowlist:\n` +
        violacoes.map((f) => `  ❌ ${f} (${contagem[f]}x)  → ${achados.filter((a) => a.file === f).map((a) => `${a.tabela}:${a.line}`).join(', ')}`).join('\n') +
        '\n\nO app roda service-role: o banco NÃO vai te salvar (service_role tem BYPASSRLS).\n' +
        'Use tenantDb(empresaId).from(...) ou .eq(\'empresa_id\', empresaId) na mesma cadeia.',
      );
    }
  });

  it('contagem não aumentou em arquivo já allowlisted', () => {
    const aumentou = Object.entries(allowlist)
      .filter(([file, esperado]) => (contagem[file] || 0) > esperado)
      .map(([file, esperado]) => `  ⚠️ ${file}: esperado ${esperado}, encontrado ${contagem[file]}`);
    if (aumentou.length > 0) {
      throw new Error(
        `leituras raw sem filtro AUMENTARAM em ${aumentou.length} arquivo(s):\n` + aumentou.join('\n') +
        '\n\nA allowlist só encolhe. Se a leitura nova é legítima, use tenantDb ou .eq(\'empresa_id\').',
      );
    }
  });

  it('nenhuma entrada stale na allowlist (arquivo sumiu ou já foi corrigido)', () => {
    const stale = Object.entries(allowlist).filter(([file]) => !existsSync(file) || !contagem[file]);
    if (stale.length > 0) {
      throw new Error(
        `${stale.length} entrada(s) stale — remova da allowlist:\n` +
        stale.map(([f]) => `  🗑️ ${f}${existsSync(f) ? ' — já não tem leitura raw sem filtro (ótimo!)' : ' — arquivo não existe'}`).join('\n'),
      );
    }
  });
});
