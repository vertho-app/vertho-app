import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { execFileSync } from 'child_process';
import { join, extname } from 'path';
import { describe, it, expect } from 'vitest';
import { semComentarios } from '../../helpers/fonte';

/**
 * A contagem é de CHAMADA, não de menção.
 *
 * Até 24/08 este guard casava `createSupabaseAdmin(` no texto cru, então um
 * docstring que explicasse o helper somava à dívida. Apareceu na Sprint 2 da
 * auditoria 22/08: centralizar o service-role de `lib/admin-supabase.ts` numa
 * função só levou o arquivo de 3 chamadas reais para 1 — e a contagem do guard
 * SUBIU para 5, porque os 4 comentários que explicavam a centralização contavam
 * como uso. O incentivo estava invertido: documentar o gate aumentava a dívida
 * medida, e a saída fácil seria inflar a allowlist.
 *
 * É o mesmo motivo pelo qual `semComentarios` existe (mutação de 10/08 no
 * ownership-guard) — este guard é que ainda não a usava.
 */
function contarChamadas(conteudo: string): number {
  const limpo = semComentarios(conteudo);
  let idx = 0;
  let n = 0;
  while ((idx = limpo.indexOf(SEARCH_PATTERN, idx)) !== -1) {
    n++;
    idx += SEARCH_PATTERN.length;
  }
  return n;
}

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

    const n = contarChamadas(content);
    if (n > 0) {
      counts[rel] = n;
    }
  }
}

/**
 * Só arquivos VERSIONADOS entram no guard — é o que vai pro deploy.
 *
 * Escanear o working tree fazia scripts de rascunho locais (`_corrigir.ts`,
 * `scripts/_*.ts`, nunca commitados) quebrarem o guard só na máquina do dev.
 * Vermelho crônico local = sinal ignorado, e foi assim que 5 violações REAIS
 * chegaram no master sem ninguém ver. No CI o resultado é idêntico (lá tudo é
 * versionado); o que muda é o guard voltar a significar alguma coisa localmente.
 *
 * Fallback pro scan de diretório se `git` não estiver disponível.
 */
function trackedFiles(): string[] | null {
  try {
    const out = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] });
    const files = out.split('\0').filter(Boolean);
    return files.length ? files : null;
  } catch {
    return null;
  }
}

function countTracked(files: string[], counts: Record<string, number>) {
  for (const rel of files) {
    if (!EXTENSIONS.has(extname(rel))) continue;
    if (rel.includes('/tests/') || rel.startsWith('tests/') || rel.includes('vitest.config')) continue;
    let content: string;
    try { content = readFileSync(rel, 'utf-8'); } catch { continue; }

    const n = contarChamadas(content);
    if (n > 0) counts[rel] = n;
  }
}

const realCounts: Record<string, number> = {};
const tracked = trackedFiles();
if (tracked) countTracked(tracked, realCounts);
else scanDir('.', realCounts);

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

  /**
   * E8 da auditoria 22/08: "duas allowlists não encolhem". Sem este teste, a
   * lista só cresce — quem REMOVE um uso de service-role deixa a folga para
   * trás, e a folga é permissão pré-aprovada para o próximo uso entrar sem
   * ninguém decidir nada. `Medido 24/08:` 12 unidades de folga e 5 entradas
   * cujo arquivo já não usava service-role nenhum.
   */
  it('sem folga: a contagem da allowlist é o REAL, não um teto herdado', () => {
    const folga = Object.entries(allowlist)
      .map(([f, exp]) => [f, exp, realCounts[f] || 0] as const)
      .filter(([, exp, atual]) => atual < exp);

    if (folga.length > 0) {
      throw new Error(
        `${folga.length} entrada(s) com folga (a lista deve encolher junto):\n` +
        folga.map(([f, exp, atual]) =>
          atual === 0
            ? `  🗑️ ${f}: não usa mais service-role — remova a entrada`
            : `  ⬇️ ${f}: allowlist ${exp}, real ${atual} — baixe para ${atual}`,
        ).join('\n') +
        '\n\nFolga é permissão pré-aprovada: o próximo uso entra sem passar por decisão nenhuma.',
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

/**
 * O guard tem de poder FALHAR pelo motivo certo — e contar a coisa certa.
 *
 * Sem estes dois casos, "contagem 1" em `lib/admin-supabase.ts` seria indistinguível
 * de "o contador parou de ver o arquivo".
 */
describe('o contador conta CHAMADA, não menção', () => {
  it('comentário que cita o helper não soma', () => {
    const fonte = `
      /** Este módulo centraliza createSupabaseAdmin() num lugar só. */
      // nunca chame createSupabaseAdmin() fora daqui
      function cliente() { return createSupabaseAdmin(); }
    `;
    expect(contarChamadas(fonte)).toBe(1);
  });

  it('chamada de verdade soma (o contador não ficou cego)', () => {
    expect(contarChamadas('const a = createSupabaseAdmin(); const b = createSupabaseAdmin();')).toBe(2);
  });
});
