import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join, extname } from 'path';
import { describe, it } from 'vitest';

/**
 * Guard: literais de STATUS hardcoded ('concluido' vs 'concluida' etc.) —
 * um typo entre eles é invisível até quebrar um filtro em produção. A fonte
 * única é `lib/status.ts` (PROGRESSO/TRILHA).
 *
 * Estoque atual CONGELADO em config/status-literal-allowlist.json (fatia 1 —
 * motor de temporadas server-side — já migrada). Código novo usa as
 * constantes; a contagem por arquivo só pode CAIR.
 */

const config = JSON.parse(readFileSync('config/status-literal-allowlist.json', 'utf-8'));
const allowlist: Record<string, number> = config.allowlist;

const LITERAIS = ['pendente', 'em_andamento', 'concluido', 'ativa', 'pausada', 'concluida', 'arquivada'];
const PADRAO = new RegExp(`['"](${LITERAIS.join('|')})['"]`, 'g');
const DIRS = ['actions', 'app', 'lib'];
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
    if (rel === 'lib/status.ts' || rel.includes('/tests/')) continue;

    let content: string;
    try { content = readFileSync(full, 'utf-8'); } catch { continue; }
    const n = (content.match(PADRAO) || []).length;
    if (n > 0) counts[rel] = n;
  }
}

const realCounts: Record<string, number> = {};
for (const d of DIRS) scanDir(d, realCounts);

describe('Guard: literais de status hardcoded (usar lib/status.ts)', () => {
  it('nenhum arquivo NOVO com literal de status', () => {
    const violations = Object.keys(realCounts).filter(f => !(f in allowlist));
    if (violations.length > 0) {
      throw new Error(
        `Literal de status em ${violations.length} arquivo(s) novo(s):\n` +
        violations.map(f => `  ❌ ${f} (${realCounts[f]}x)`).join('\n') +
        "\n\nUse PROGRESSO/TRILHA de lib/status.ts. Allowlist só pra estoque legado."
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
        `Literais de status AUMENTARAM:\n` + increased.join('\n') +
        '\n\nCódigo novo usa as constantes de lib/status.ts. Só reduza a allowlist, nunca aumente.'
      );
    }
  });
});
