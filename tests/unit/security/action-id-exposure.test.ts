/**
 * Guard de BUNDLE — nenhuma action com flag `internal` pode ter seu action id
 * PUBLICADO no JavaScript que o browser baixa.
 *
 * Por quê existe (o que o guard AST não vê): `use-server-internal-guard` impede
 * que uma action NOVA nasça com `internal`. Mas as 8 já existentes
 * (config/use-server-internal-allowlist.json) são endpoints latentes: hoje o
 * action id delas não está em nenhum bundle público, então ninguém as invoca de
 * fora. Essa proteção é ACIDENTAL. Uma linha —
 *   `import { enviarWhatsApp } from '@/actions/whatsapp'`  num componente 'use client'
 * — publica o id no bundle e abre o endpoint, sem tocar em nenhum arquivo que o
 * guard AST vigia. Este teste transforma "acidente" em invariante verificada.
 *
 * Mecânica (medida no build, 09-10/07/2026):
 *   - Next registra como endpoint TODO export de um módulo 'use server' que entra
 *     no grafo do cliente (mesmo os que nenhum client component chama).
 *   - Mas só publica no bundle do browser o *id* das actions que o cliente chama.
 *   - `.next/server/chunks/**` casa nome→id; `.next/static/chunks/**` é o que o
 *     browser baixa. Id publicado + endpoint registrado = chamável por qualquer um.
 *
 * Exige um `next build` prévio. Sem build → SKIP (mesmo padrão de rls-posture.test.ts,
 * que pula sem DATABASE_URL). No CI roda em job próprio, depois do build:
 *   `npm run test:action-ids`
 *
 * Como corrigir uma falha: NÃO adicione à allowlist e NÃO remova o import às
 * pressas sem entender. O id foi publicado porque um client component importou a
 * action. Ou (a) a action perde a flag `internal` (extraia núcleo sem gate pra
 * lib/, modelo lib/blueprint/core.ts) — preferido; ou (b) o client component para
 * de importá-la.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join } from 'path';
import { describe, it } from 'vitest';

const SERVER_CHUNKS = '.next/server/chunks';
const CLIENT_CHUNKS = '.next/static/chunks';

/**
 * `BUILD_ID` só existe em build de PRODUÇÃO completo — `next dev` também popula
 * `.next/`, e ler artefato de dev daria um veredito sem valor. Build parcial
 * (interrompido) também não tem BUILD_ID, então isso cobre os dois casos.
 */
const temBuild = existsSync('.next/BUILD_ID') && existsSync(SERVER_CHUNKS) && existsSync(CLIENT_CHUNKS);

function jsFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    let entries: string[];
    try { entries = readdirSync(d); } catch { return; }
    for (const e of entries) {
      const p = join(d, e);
      let st;
      try { st = statSync(p); } catch { continue; }
      if (st.isDirectory()) walk(p);
      else if (p.endsWith('.js')) out.push(p);
    }
  };
  walk(dir);
  return out;
}

/**
 * Casa nome do export → action id(s), lendo os chunks do servidor.
 *
 * Os nomes de variável são LOCAIS a cada chunk, então o casamento é por arquivo:
 *   registerServerReference(VAR, "<id>")   → var → id
 *   a.s(["nome", 0, VAR, ...])             → nome → var
 * Um nome pode render mais de um id (mesmo export em chunks distintos); guardamos
 * todos e verificamos todos.
 */
function mapearNomeParaIds(): Map<string, Set<string>> {
  const nomeParaIds = new Map<string, Set<string>>();
  for (const file of jsFiles(SERVER_CHUNKS)) {
    let src: string;
    try { src = readFileSync(file, 'utf-8'); } catch { continue; }
    if (!src.includes('registerServerReference')) continue;

    const varParaId = new Map<string, string>();
    for (const m of src.matchAll(/registerServerReference\)?\(\s*([A-Za-z_$][\w$]*)\s*,\s*"([0-9a-f]{20,})"/g)) {
      varParaId.set(m[1], m[2]);
    }
    if (!varParaId.size) continue;

    for (const m of src.matchAll(/"([A-Za-z_$][\w$]*)"\s*,\s*0\s*,\s*([A-Za-z_$][\w$]*)/g)) {
      const id = varParaId.get(m[2]);
      if (!id) continue;
      if (!nomeParaIds.has(m[1])) nomeParaIds.set(m[1], new Set());
      nomeParaIds.get(m[1])!.add(id);
    }
  }
  return nomeParaIds;
}

function blobDoCliente(): string {
  return jsFiles(CLIENT_CHUNKS).map((f) => {
    try { return readFileSync(f, 'utf-8'); } catch { return ''; }
  }).join('\n');
}

interface Entrada { file: string; fn: string; }

const allowlist: Entrada[] = temBuild
  ? (JSON.parse(readFileSync('config/use-server-internal-allowlist.json', 'utf-8')).allowlist as string[])
      .map((k) => {
        const [file, fn] = k.split('::');
        return { file, fn };
      })
  : [];

describe.skipIf(!temBuild)('Guard: action id de action com `internal` não vaza pro bundle', () => {
  const nomeParaIds = temBuild ? mapearNomeParaIds() : new Map<string, Set<string>>();
  const cliente = temBuild ? blobDoCliente() : '';

  /**
   * CANÁRIO. Um id "não resolvido" é o estado SEGURO (o módulo não virou endpoint),
   * então um parser quebrado — regex que não casa nada com o output do bundler —
   * faria este guard passar sempre, em silêncio. Provamos primeiro que o parser E o
   * grep funcionam: existem muitos ids, e muitos deles ESTÃO publicados no cliente
   * (o normal — a maioria das actions é chamada pelo browser).
   */
  it('canário: o parser enxerga ids e o grep os encontra no bundle do cliente', () => {
    const todosIds = [...new Set([...nomeParaIds.values()].flatMap((s) => [...s]))];
    if (todosIds.length < 50) {
      throw new Error(
        `só ${todosIds.length} action ids resolvidos nos chunks do servidor — parser quebrado ` +
        '(o bundler mudou o formato de registerServerReference?). Um guard que não lê nada passa sempre.',
      );
    }
    const publicados = todosIds.filter((id) => cliente.includes(id));
    if (publicados.length < 20) {
      throw new Error(
        `${todosIds.length} ids resolvidos, mas só ${publicados.length} encontrados no bundle do cliente — ` +
        'o grep no bundle não está funcionando. Guard cego.',
      );
    }
  });

  it('nenhuma action da allowlist `internal` tem o id publicado no bundle do cliente', () => {
    const vazamentos: string[] = [];
    for (const { file, fn } of allowlist) {
      const ids = nomeParaIds.get(fn);
      if (!ids) continue; // não registrada como endpoint = seguro
      for (const id of ids) {
        if (cliente.includes(id)) vazamentos.push(`  ❌ ${file}::${fn} — id ${id} PUBLICADO no bundle`);
      }
    }
    if (vazamentos.length > 0) {
      throw new Error(
        `${vazamentos.length} action(s) com flag \`internal\` estão com o id no JS público:\n` +
        vazamentos.join('\n') +
        '\n\nQualquer um pode POSTar esse id e pular o gate de autorização.\n' +
        'Um client component passou a importar essa action. Conserte a ACTION (tire a flag:\n' +
        'núcleo sem gate em lib/, modelo lib/blueprint/core.ts) ou pare de importá-la no cliente.\n' +
        'NÃO relaxe este guard.',
      );
    }
  });

  /** Regressão nominal: as 3 fechadas em 09/07 não podem voltar a existir. */
  it('as actions de bypass removidas continuam inexistentes', () => {
    const removidas = ['gerarTemporadaInternal'];
    const ressuscitadas = removidas.filter((n) => nomeParaIds.has(n));
    if (ressuscitadas.length > 0) {
      throw new Error(
        `action(s) de bypass reintroduzida(s): ${ressuscitadas.join(', ')}.\n` +
        'Rodavam service-role sem gate. Ver CLAUDE.md, "Server Actions são endpoints HTTP".',
      );
    }
  });
});
