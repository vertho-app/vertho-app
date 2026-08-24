import { readFileSync, existsSync } from 'fs';
import { execFileSync } from 'child_process';
import { extname } from 'path';
import { describe, it, expect } from 'vitest';

/**
 * Guard: literais de STATUS hardcoded ('concluido' vs 'concluida' etc.) —
 * um typo entre eles é invisível até quebrar um filtro em produção. A fonte
 * única é `lib/status.ts` (PROGRESSO/TRILHA).
 *
 * Estoque atual CONGELADO em config/status-literal-allowlist.json (fatia 1 —
 * motor de temporadas server-side — já migrada). Código novo usa as
 * constantes; a contagem por arquivo só pode CAIR.
 *
 * E8 (auditoria 22/08), duas correções em 24/08:
 *
 *  · o *stale* só perguntava se o ARQUIVO existia, nunca se a contagem ainda
 *    era aquela. `Medido:` 37 entradas com teto 141 contra 131 reais — 10
 *    unidades de folga, das quais 5 eram entradas de arquivos que já não tinham
 *    literal nenhum. Folga é permissão pré-aprovada: dava para reintroduzir 10
 *    literais sem o CI piscar;
 *  · o escopo ignorava `components/` e `trigger/`. `components/dashboard`
 *    comparava `.eq('status', 'concluido')` na UI do gestor e do RH — é
 *    exatamente onde um typo entre 'concluido' e 'concluida' vira lista vazia
 *    sem erro. Migrados para `PROGRESSO`.
 *
 * `scripts/` fica fora de propósito: são utilitários locais de diagnóstico, não
 * entram no runtime do produto. Se um dia virarem parte do fluxo, entram aqui.
 */

const config = JSON.parse(readFileSync('config/status-literal-allowlist.json', 'utf-8'));
const allowlist: Record<string, number> = config.allowlist;

const LITERAIS = ['pendente', 'em_andamento', 'concluido', 'ativa', 'pausada', 'concluida', 'arquivada'];
const PADRAO = new RegExp(`['"](${LITERAIS.join('|')})['"]`, 'g');
const DIRS = ['actions/', 'app/', 'lib/', 'components/', 'trigger/'];
const EXTENSIONS = new Set(['.ts', '.tsx']);
const IGNORE_DIRS = new Set(['node_modules', '.next', '.git', 'test-results', 'playwright-report']);

/** Arquivos VERSIONADOS dos diretórios de produção. */
function arquivos(): string[] {
  try {
    const out = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] });
    return out.split(String.fromCharCode(0)).filter(
      (f) => EXTENSIONS.has(extname(f || '')) && DIRS.some((d) => f.startsWith(d))
        && !f.includes('/tests/') && f !== 'lib/status.ts',
    );
  } catch {
    return [];
  }
}

function scanTracked(counts: Record<string, number>) {
  for (const rel of arquivos()) {
    let content: string;
    try { content = readFileSync(rel, 'utf-8'); } catch { continue; }
    const n = (content.match(PADRAO) || []).length;
    if (n > 0) counts[rel] = n;
  }
}

const realCounts: Record<string, number> = {};
scanTracked(realCounts);

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

  it('o guard enxerga o repositório (sentinela de denominador)', () => {
    expect(arquivos().length).toBeGreaterThan(200);
  });

  it('nenhuma entrada stale na allowlist (arquivo sumiu OU contagem caiu)', () => {
    const stale: string[] = [];
    for (const [file, esperado] of Object.entries(allowlist)) {
      if (!existsSync(file)) { stale.push(`  🗑️ ${file}: arquivo não existe mais`); continue; }
      const atual = realCounts[file] || 0;
      // E8: cota que sobrou também é stale — 10 unidades de folga eram 10
      // literais que podiam voltar sem o CI piscar.
      if (atual === 0) stale.push(`  🗑️ ${file}: não tem mais literal — remova a entrada`);
      else if (atual < esperado) stale.push(`  ⬇️ ${file}: allowlist ${esperado}, real ${atual} — baixe para ${atual}`);
    }
    if (stale.length > 0) {
      throw new Error(`${stale.length} entrada(s) stale:\n${stale.join('\n')}\n\nEla só encolhe.`);
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
