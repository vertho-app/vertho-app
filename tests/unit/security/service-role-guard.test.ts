import { readFileSync } from 'fs';
import { execSync } from 'child_process';
import { describe, it, expect } from 'vitest';

const allowlist = JSON.parse(
  readFileSync('config/service-role-allowlist.json', 'utf-8')
).allowlist as string[];

describe('Guard: createSupabaseAdmin() allowlist', () => {
  it('todo uso de createSupabaseAdmin deve estar na allowlist', () => {
    const result = execSync(
      'grep -rln "createSupabaseAdmin" --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next" | grep -v "vitest.config" | grep -v "test" | sort',
      { encoding: 'utf-8', cwd: process.cwd() }
    ).trim().split('\n').filter(Boolean);

    // Normalize paths (Windows may use backslashes)
    const normalized = result.map(f => f.replace(/\\/g, '/'));

    const violations = normalized.filter(f => !allowlist.includes(f));

    if (violations.length > 0) {
      throw new Error(
        `createSupabaseAdmin() encontrado em ${violations.length} arquivo(s) fora da allowlist:\n` +
        violations.map(f => `  - ${f}`).join('\n') +
        '\n\nSe o uso e intencional, adicione o arquivo em config/service-role-allowlist.json'
      );
    }
  });

  it('allowlist nao deve conter arquivos que nao existem mais', () => {
    const missing: string[] = [];
    for (const f of allowlist) {
      try {
        readFileSync(f, 'utf-8');
      } catch {
        missing.push(f);
      }
    }
    if (missing.length > 0) {
      throw new Error(
        `Allowlist contem ${missing.length} arquivo(s) que nao existem:\n` +
        missing.map(f => `  - ${f}`).join('\n') +
        '\n\nRemova-os de config/service-role-allowlist.json'
      );
    }
  });
});
