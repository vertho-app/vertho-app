import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join, extname } from 'path';
import { describe, it } from 'vitest';

/**
 * Guard: mutações (update/delete) em tabelas TENANT-OWNED feitas com client
 * RAW e SEM filtro de tenant no WHERE — a classe de bug do achado P1 da
 * auditoria do piloto (update de colaborador por id permitia cross-tenant
 * por admin). Todos os sites são platform-admin-gated (cross-tenant por
 * design), então é DEFENSE-IN-DEPTH: o guard CONGELA o estoque atual
 * (config/tenant-mutation-allowlist.json) e impede sites novos.
 *
 * Como sair da allowlist: usar tenantDb(empresaId).from(...) OU adicionar
 * .eq('empresa_id', empresaId) na mesma cadeia da mutação.
 *
 * Heurística do scan (mesma da varredura que gerou a allowlist):
 *  - tabela tenant-owned + .update(/.delete( logo após o .from(...)
 *  - trecho de 1400 chars sem .eq/.is('empresa_id'
 *  - prefixo de 40 chars sem "tdb" (wrapper) nem "escopoTenantDaLinha" (repo sancionado)
 */

const config = JSON.parse(readFileSync('config/tenant-mutation-allowlist.json', 'utf-8'));
const allowlist: Record<string, number> = config.allowlist;

const TABELAS_TENANT = ['trilhas', 'colaboradores', 'temporada_semana_progresso', 'banco_cenarios', 'competencias', 'cargos_empresa', 'micro_conteudos'];
const PADRAO = new RegExp(
  `\\.from\\('(${TABELAS_TENANT.join('|')})'\\)\\s*\\n?\\s*\\.(update|delete)\\(`,
  'g',
);
const DIRS = ['actions', 'app/admin'];
const EXTENSIONS = new Set(['.ts', '.tsx']);
const IGNORE_DIRS = new Set(['node_modules', '.next', '.git', 'test-results', 'playwright-report']);

function scanDir(dir: string, counts: Record<string, number>) {
  let entries: string[];
  try { entries = readdirSync(dir); } catch { return; }
  for (const entry of entries) {
    if (IGNORE_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    let stat;
    try { stat = statSync(full); } catch { continue; }
    if (stat.isDirectory()) { scanDir(full, counts); continue; }
    if (!EXTENSIONS.has(extname(entry))) continue;
    const rel = full.replace(/\\/g, '/');
    if (rel.includes('/tests/')) continue;

    let content: string;
    try { content = readFileSync(full, 'utf-8'); } catch { continue; }
    if (!content.includes('requireAdminSupabase')) continue;

    let n = 0;
    PADRAO.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = PADRAO.exec(content)) !== null) {
      const trecho = content.slice(m.index, m.index + 1400); // janela cobre payloads longos
      const prefixo = content.slice(Math.max(0, m.index - 40), m.index);
      // .eq = tenant; .is('empresa_id', null) = catálogo GLOBAL (tabelas mistas)
      // 'escopoTenantDaLinha(' = camada sancionada (lib/repositories/conteudos-repo) que aplica o predicado
      if (!/\.(eq|is)\('empresa_id'/.test(trecho) && !prefixo.includes('tdb') && !prefixo.includes('escopoTenantDaLinha')) n++;
    }
    if (n > 0) counts[rel] = n;
  }
}

const realCounts: Record<string, number> = {};
for (const d of DIRS) scanDir(d, realCounts);

describe('Guard: mutações raw em tabelas tenant-owned sem filtro de tenant', () => {
  it('nenhum arquivo fora da allowlist', () => {
    const violations = Object.keys(realCounts).filter(f => !(f in allowlist));
    if (violations.length > 0) {
      throw new Error(
        `Mutação raw sem tenant no WHERE em ${violations.length} arquivo(s) novo(s):\n` +
        violations.map(f => `  ❌ ${f} (${realCounts[f]}x)`).join('\n') +
        "\n\nUse tenantDb(empresaId) OU .eq('empresa_id', ...) na mutação. Allowlist só pra estoque legado."
      );
    }
  });

  it('nenhuma entrada stale na allowlist', () => {
    const stale = Object.keys(allowlist).filter(f => !existsSync(f));
    if (stale.length > 0) {
      throw new Error(`${stale.length} entrada(s) stale:\n` + stale.map(f => `  🗑️ ${f}`).join('\n'));
    }
  });

  it('contagem não aumentou em nenhum arquivo allowlisted', () => {
    const increased: string[] = [];
    for (const [file, expected] of Object.entries(allowlist)) {
      const actual = realCounts[file] || 0;
      if (actual > expected) increased.push(`  ⚠️ ${file}: esperado ${expected}, encontrado ${actual}`);
    }
    if (increased.length > 0) {
      throw new Error(
        `Mutações raw sem tenant AUMENTARAM:\n` + increased.join('\n') +
        "\n\nNovas mutações devem usar tenantDb ou .eq('empresa_id'). Só reduza a allowlist, nunca aumente."
      );
    }
  });
});
