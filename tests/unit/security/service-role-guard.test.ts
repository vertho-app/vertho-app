import { readFileSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import { describe, it, expect } from 'vitest';

const config = JSON.parse(
  readFileSync('config/service-role-allowlist.json', 'utf-8')
);
const allowlist: Record<string, number> = config.allowlist;

describe('Guard: createSupabaseAdmin() allowlist com contagem', () => {
  // Gera mapa real: arquivo -> contagem
  const result = execSync(
    'grep -rn "createSupabaseAdmin()" --include="*.ts" --include="*.tsx" --include="*.js" | grep -v node_modules | grep -v ".next" | grep -v "test" | grep -v "vitest"',
    { encoding: 'utf-8', cwd: process.cwd() }
  ).trim().split('\n').filter(Boolean);

  const realCounts: Record<string, number> = {};
  for (const line of result) {
    // Normalize Windows backslashes
    const file = line.split(':')[0].replace(/\\/g, '/');
    realCounts[file] = (realCounts[file] || 0) + 1;
  }

  it('nenhum arquivo fora da allowlist', () => {
    const violations = Object.keys(realCounts).filter(f => !(f in allowlist));
    if (violations.length > 0) {
      throw new Error(
        `createSupabaseAdmin() em ${violations.length} arquivo(s) NAO allowlisted:\n` +
        violations.map(f => `  - ${f} (${realCounts[f]}x)`).join('\n') +
        '\n\nAdicione em config/service-role-allowlist.json com a contagem se intencional.'
      );
    }
  });

  it('nenhuma entrada stale na allowlist', () => {
    const stale = Object.keys(allowlist).filter(f => !existsSync(f));
    if (stale.length > 0) {
      throw new Error(
        `${stale.length} entrada(s) stale na allowlist (arquivo nao existe):\n` +
        stale.map(f => `  - ${f}`).join('\n')
      );
    }
  });

  it('contagem nao aumentou em nenhum arquivo allowlisted', () => {
    const increased: string[] = [];
    for (const [file, expected] of Object.entries(allowlist)) {
      const actual = realCounts[file] || 0;
      if (actual > expected) {
        increased.push(`  - ${file}: esperado ${expected}, encontrado ${actual}`);
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
