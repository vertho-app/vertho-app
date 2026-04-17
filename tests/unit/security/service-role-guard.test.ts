import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join, extname } from 'path';
import { describe, it } from 'vitest';

const config = JSON.parse(
  readFileSync('config/service-role-allowlist.json', 'utf-8')
);
const allowlist: Record<string, number> = config.allowlist;

const SEARCH_PATTERN = 'createSupabaseAdmin(';
const EXTENSIONS = new Set(['.ts', '.tsx', '.js']);
const IGNORE_DIRS = new Set(['node_modules', '.next', '.git', 'test-results', 'playwright-report']);

function scanDir(dir: string, counts: Record<string, number>) {
  let entries: string[];
  try { entries = readdirSync(dir); } catch { return; }

  for (const entry of entries) {
    if (IGNORE_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    let stat;
    try { stat = statSync(full); } catch { continue; }

    if (stat.isDirectory()) {
      scanDir(full, counts);
      continue;
    }

    if (!EXTENSIONS.has(extname(entry))) continue;

    // Ignorar arquivos de teste e config vitest
    const rel = full.replace(/\\/g, '/');
    if (rel.includes('/tests/') || rel.startsWith('tests/') || rel.includes('vitest.config')) continue;

    let content: string;
    try { content = readFileSync(full, 'utf-8'); } catch { continue; }

    let idx = 0;
    let n = 0;
    while ((idx = content.indexOf(SEARCH_PATTERN, idx)) !== -1) {
      n++;
      idx += SEARCH_PATTERN.length;
    }
    if (n > 0) {
      counts[rel] = n;
    }
  }
}

const realCounts: Record<string, number> = {};
scanDir('.', realCounts);

describe('Guard: createSupabaseAdmin() allowlist com contagem', () => {
  it('nenhum arquivo fora da allowlist', () => {
    const violations = Object.keys(realCounts).filter(f => !(f in allowlist));
    if (violations.length > 0) {
      throw new Error(
        `createSupabaseAdmin() em ${violations.length} arquivo(s) NÃO allowlisted:\n` +
        violations.map(f => `  ❌ ${f} (${realCounts[f]}x)`).join('\n') +
        '\n\nAdicione em config/service-role-allowlist.json com a contagem se intencional.'
      );
    }
  });

  it('nenhuma entrada stale na allowlist', () => {
    const stale = Object.keys(allowlist).filter(f => !existsSync(f));
    if (stale.length > 0) {
      throw new Error(
        `${stale.length} entrada(s) stale na allowlist (arquivo não existe):\n` +
        stale.map(f => `  🗑️ ${f}`).join('\n')
      );
    }
  });

  it('contagem não aumentou em nenhum arquivo allowlisted', () => {
    const increased: string[] = [];
    for (const [file, expected] of Object.entries(allowlist)) {
      const actual = realCounts[file] || 0;
      if (actual > expected) {
        increased.push(`  ⚠️ ${file}: esperado ${expected}, encontrado ${actual}`);
      }
    }
    if (increased.length > 0) {
      throw new Error(
        `createSupabaseAdmin() aumentou em ${increased.length} arquivo(s):\n` +
        increased.join('\n') +
        '\n\nSe intencional, atualize a contagem em config/service-role-allowlist.json'
      );
    }
  });
});
