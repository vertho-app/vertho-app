// Lista/atualiza envs de render do trigger.dev (prod). Uso:
//   node scripts/_render-envs.mjs            → lista
//   node scripts/_render-envs.mjs --apply    → aplica as mudanças definidas em CHANGES
import fs from 'node:fs';
const env = fs.readFileSync(new URL('file:///C:/GAS/Vertho%20App/nextjs-app/.env.local'), 'utf8');
for (const line of env.split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}
const REF = 'proj_wunoneqnozqrfzlvpqjv';
const ENVSLUG = 'prod';
const APPLY = process.argv.includes('--apply');

// Ladder CX-only + fan-out maior. Só CX (cx43 primário 16GB, cx53 fallback 32GB, pool distinto).
const CHANGES = {
  MAX_RENDER_BOXES: '15',
  // Ladder EM ORDEM (precede RENDER_SERVER_TYPE/_FALLBACK): CX foco → CPX shared → CCX dedicada.
  RENDER_SERVER_TYPES: 'cx43,cx53,cx33,cpx32,cpx22,ccx13',
  RENDER_SERVER_TYPE: 'cx43',     // compat (ignorado quando RENDER_SERVER_TYPES setado)
  RENDER_FALLBACK_TYPE: 'cx53',   // compat
  RENDER_LOCATIONS: 'nbg1,hel1,fsn1',
  RENDER_JOBS_PER_BOX: '1',       // 1 vídeo por box → fan-out espalha até MAX (Remotion satura a CPU com 1 render)
  MAX_RENDER_MS: '5400000',       // 90min: watchdog folgado p/ render longo em CX shared (default do código = 40min)
};

const { envvars } = await import('@trigger.dev/sdk/v3');

async function dump(tag) {
  const list = await envvars.list(REF, ENVSLUG);
  const rows = (list || []).filter(v => /^(RENDER_|MAX_RENDER|HCLOUD|VIDEO_RENDER|VIDEO_TTS)/.test(v.name));
  console.log(`=== envs de render (${tag}) ===`);
  for (const v of rows.sort((a, b) => a.name.localeCompare(b.name))) {
    const val = /TOKEN|KEY|SECRET/.test(v.name) ? (v.value ? v.value.slice(0, 4) + '…' : '(vazio)') : v.value;
    console.log(`  ${v.name} = ${val}`);
  }
  return new Map((list || []).map(v => [v.name, v.value]));
}

const before = await dump('ANTES');

if (APPLY) {
  console.log('\n=== aplicando mudanças ===');
  for (const [name, value] of Object.entries(CHANGES)) {
    if (before.get(name) === value) { console.log(`  = ${name} já é ${value} (skip)`); continue; }
    // envvars.update tem bug fora de task-context → del + create.
    if (before.has(name)) { try { await envvars.del(REF, ENVSLUG, name); } catch (e) { console.log(`  ⚠️ del ${name}: ${e.message}`); } }
    await envvars.create(REF, ENVSLUG, { name, value });
    console.log(`  ✓ ${name} = ${value}  (antes: ${before.get(name) ?? '(não existia)'})`);
  }
  console.log('');
  await dump('DEPOIS');
} else {
  console.log('\n(dry-run — rode com --apply p/ gravar as mudanças abaixo)');
  for (const [name, value] of Object.entries(CHANGES)) {
    console.log(`  ${name}: ${before.get(name) ?? '(não existe)'}  →  ${value}`);
  }
}
