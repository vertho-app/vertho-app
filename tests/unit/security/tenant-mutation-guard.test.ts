import { readFileSync, existsSync } from 'fs';
import { execFileSync } from 'child_process';
import { extname } from 'path';
import { describe, it, expect } from 'vitest';
import { semComentarios } from '../../helpers/fonte';

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
 *
 * 🔴 D2 (auditoria 22/08) — O DENOMINADOR ESTAVA RESTRITO DUAS VEZES.
 *
 * Até 24/08 o scan olhava só `['actions', 'app/admin']` E, dentro deles, apenas
 * arquivos que por acaso mencionavam `requireAdminSupabase`. Ficavam de fora os
 * 55 route handlers, todo o `lib/`, o `app/dashboard/` e o `trigger/` — e a
 * allowlist vazia era descrita como "dívida ZERADA".
 *
 * `Medido em 24/08:` aplicando o PRÓPRIO predicado deste guard ao repositório
 * inteiro, **27 sites em 17 arquivos**, incluindo `app/api/temporada/evaluation`
 * e `reflection`. Zero declarado onde o número real é 27 é pior que allowlist
 * grande: a lista vazia afirmava que a classe estava fechada.
 *
 * Dos 27, 21 receberam o predicado — o tenant estava no escopo em todos — e 6
 * ficaram na allowlist COM MOTIVO, por serem jobs de plataforma (cross-tenant
 * por desenho).
 *
 * ⚠️ O que ele NÃO mede, para ninguém ler cobertura demais: a régua que sanciona
 * `tdb`/`escopoTenantDaLinha` olha o RECEIVER, não o payload nem o chamador. A
 * classe do A1/A2/A3/A5 — query bem escopada, chamador não autorizado — é do
 * `gate-permissao-guard`; o contrato do próprio `tenantDb` é do
 * `tenant-db-contrato`.
 */

const config = JSON.parse(readFileSync('config/tenant-mutation-allowlist.json', 'utf-8'));
const allowlist: Record<string, number> = config.allowlist;

const TABELAS_TENANT = ['trilhas', 'colaboradores', 'temporada_semana_progresso', 'banco_cenarios', 'competencias', 'cargos_empresa', 'micro_conteudos'];
const PADRAO = new RegExp(
  `\\.from\\('(${TABELAS_TENANT.join('|')})'\\)\\s*\\n?\\s*\\.(update|delete)\\(`,
  'g',
);
const DIRS = ['actions/', 'app/', 'lib/', 'trigger/'];
const EXTENSIONS = new Set(['.ts', '.tsx']);
const IGNORE_DIRS = new Set(['node_modules', '.next', '.git', 'test-results', 'playwright-report']);

/** Arquivos VERSIONADOS dos diretórios de produção. */
function arquivos(): string[] {
  try {
    const out = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] });
    return out.split('\0').filter(
      (f) => EXTENSIONS.has(extname(f || '')) && DIRS.some((d) => f.startsWith(d)) && !f.includes('/tests/'),
    );
  } catch {
    return [];
  }
}

function scanTracked(counts: Record<string, number>) {
  for (const rel of arquivos()) {
    let content: string;
    // Sem `semComentarios`, um DOCSTRING que mostra a forma errada para
    // explicá-la conta como violação — `lib/season-engine/progresso-semana.ts`
    // documenta exatamente o padrão que ele existe para substituir. É a mesma
    // lição que o `ownership-guard` aprendeu por mutação em 10/08.
    try { content = semComentarios(readFileSync(rel, 'utf-8')); } catch { continue; }
    // NAO voltar a filtrar por includes('requireAdminSupabase'): era a segunda
    // restricao do denominador, e mutacao raw nao precisa daquele gate para
    // existir — quase todos os 27 sites de 24/08 estavam fora dele.

    let n = 0;
    PADRAO.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = PADRAO.exec(content)) !== null) {
      // Delimita pelo FIM DO STATEMENT, não por janela fixa de N chars.
      //
      // A janela de 1400 errava nos dois sentidos, como o inventário do A5
      // ensinou em 23/08: um `update({...})` com payload grande (o mapeamento
      // DISC grava ~40 colunas) empurra o `.eq('empresa_id')` para fora da
      // janela e vira falso POSITIVO; e uma janela longa demais alcança o
      // `.eq('empresa_id')` da query SEGUINTE, virando falso negativo.
      const fim = content.indexOf(';', m.index);
      const trecho = content.slice(m.index, fim > 0 ? Math.min(fim, m.index + 6000) : m.index + 1400);
      const prefixo = content.slice(Math.max(0, m.index - 40), m.index);
      // .eq = tenant; .is('empresa_id', null) = catalogo GLOBAL (tabelas mistas)
      // 'escopoTenantDaLinha(' = camada sancionada (lib/repositories/conteudos-repo)
      if (!/\.(eq|is)\('empresa_id'/.test(trecho) && !prefixo.includes('tdb') && !prefixo.includes('escopoTenantDaLinha')) n++;
    }
    if (n > 0) counts[rel] = n;
  }
}

const realCounts: Record<string, number> = {};
scanTracked(realCounts);

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

  it('toda entrada da allowlist tem MOTIVO escrito', () => {
    // Allowlist sem motivo é dívida anônima: daqui a três meses ninguém sabe se
    // a entrada ainda vale, e a leitura mais barata vira "deve estar certo".
    const motivos: Record<string, string> = config.motivos || {};
    const sem = Object.keys(allowlist).filter((f) => !motivos[f] || motivos[f].length < 40);
    if (sem.length > 0) {
      throw new Error(
        'entrada(s) sem motivo em config/tenant-mutation-allowlist.json:\n' +
        sem.map((f) => `  ❓ ${f}`).join('\n'),
      );
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
