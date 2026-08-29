// Os exports com param `colab` têm o action id PUBLICADO no bundle do cliente?
// Mesma mecânica do tests/unit/security/action-id-exposure.test.ts (varredura COMPLETA,
// Set de ids por nome — pegar só a 1ª ocorrência mascara o id real).
import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join } from 'path';
const SERVER_CHUNKS = '.next/server/chunks', CLIENT_CHUNKS = '.next/static/chunks';
if (!existsSync('.next/BUILD_ID')) { console.log('sem build'); process.exit(1); }
function jsFiles(dir) { const out = []; const walk = (d) => { let e = []; try { e = readdirSync(d); } catch { return; } for (const x of e) { const p = join(d, x); const s = statSync(p); if (s.isDirectory()) walk(p); else if (x.endsWith('.js')) out.push(p); } }; walk(dir); return out; }

const nomeParaIds = new Map();
for (const file of jsFiles(SERVER_CHUNKS)) {
  const src = readFileSync(file, 'utf8');
  if (!src.includes('registerServerReference')) continue;
  const varParaId = new Map();
  for (const m of src.matchAll(/registerServerReference\)?\(\s*([A-Za-z_$][\w$]*)\s*,\s*"([0-9a-f]{20,})"/g)) varParaId.set(m[1], m[2]);
  for (const m of src.matchAll(/"([A-Za-z_$][\w$]*)"\s*,\s*0\s*,\s*([A-Za-z_$][\w$]*)/g)) {
    const id = varParaId.get(m[2]); if (!id) continue;
    if (!nomeParaIds.has(m[1])) nomeParaIds.set(m[1], new Set());
    nomeParaIds.get(m[1]).add(id);
  }
}
const clientSrc = jsFiles(CLIENT_CHUNKS).map(f => readFileSync(f, 'utf8')).join('\n');
const manifest = existsSync('.next/server/server-reference-manifest.json') ? readFileSync('.next/server/server-reference-manifest.json', 'utf8') : '';

console.log(`ids resolvidos: ${[...nomeParaIds.values()].reduce((a, s) => a + s.size, 0)} (canário: precisa ser >50)\n`);
for (const alvo of ['gerarConteudoFinalPersonalizado', 'prepararAudioPersonalizado', 'gerarBlueprint']) {
  const ids = nomeParaIds.get(alvo);
  if (!ids) { console.log(`${alvo}: id NÃO resolvido (não virou endpoint?)`); continue; }
  const publicados = [...ids].filter(id => clientSrc.includes(id));
  const aceitos = [...ids].filter(id => manifest.includes(id));
  console.log(`${alvo}:`);
  console.log(`   ids: ${ids.size} | servidor ACEITA: ${aceitos.length} | browser PUBLICA: ${publicados.length}`);
  console.log(`   → ${publicados.length ? '🔴 EXPLORÁVEL sem sessão (id no bundle público)' : aceitos.length ? '🟡 servidor aceita, mas id não publicado (proteção ACIDENTAL)' : '⚪ não exposto'}`);
}
