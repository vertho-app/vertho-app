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
 * Escopo deliberado: as 5 tabelas de PII/assessment. Não é a lista completa de
 * tabelas tenant-owned — é onde um vazamento é evento de LGPD. Expandir depois.
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
 * LIMITE CONHECIDO (falso-negativo estrutural): o guard vê que existe um filtro
 * por `empresa_id`, não que o VALOR é o tenant certo.
 * `.eq('empresa_id', empresaIdVindoDoCliente)` passa. Contra isso só RLS real
 * (JWT `authenticated`, não service-role) ou revisão humana.
 */
import { readFileSync, existsSync } from 'fs';
import { execFileSync } from 'child_process';
import ts from 'typescript';
import { describe, it } from 'vitest';

const TABELAS = ['colaboradores', 'respostas', 'relatorios', 'mensagens_chat', 'sessoes_avaliacao'] as const;
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

function varrer(): Achado[] {
  const achados: Achado[] = [];
  for (const file of trackedTsFiles()) {
    let src: string;
    try { src = readFileSync(file, 'utf-8'); } catch { continue; }
    if (!TABELAS.some((t) => src.includes(`'${t}'`))) continue; // filtro barato

    const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

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
          if (!temFiltroTenant && !sancionado) {
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
