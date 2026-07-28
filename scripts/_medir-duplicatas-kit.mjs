// FMEA-PIPELINE 1.5 (residual) — MEDIÇÃO read-only de duplicatas LADO DO KIT.
//
// Cada re-run de geração empilha cópias do MESMO formato sob o mesmo kit_id (a
// idempotência é pulada quando vem de kit; a UNIQUE da mig 190 cobre só
// `kit_id IS NULL`). Antes da correção em entrega-semana.ts, o overlay servia uma
// cópia ARBITRÁRIA (sem ORDER BY). Este script só MEDE — não deduplica.
//
// Uso: node scripts/_medir-duplicatas-kit.mjs
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config({ path: '.env.local' });

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// 1. Todos os conteúdos DE kit (kit_id NOT NULL)
const { data: todos, error } = await sb.from('micro_conteudos')
  .select('id, kit_id, formato, titulo, created_at, ativo')
  .not('kit_id', 'is', null);
if (error) { console.error('ERRO:', error.message); process.exit(1); }

const key = (c) => `${c.kit_id}|${c.formato}`;
const grupos = new Map();
for (const c of todos) {
  const k = key(c);
  if (!grupos.has(k)) grupos.set(k, []);
  grupos.get(k).push(c);
}
const dups = [...grupos.entries()].filter(([, v]) => v.length > 1);
const linhasExcedentes = dups.reduce((n, [, v]) => n + v.length - 1, 0);
console.log(`Conteúdos de kit: ${todos.length} | grupos (kit_id+formato): ${grupos.size} | DUPLICADOS: ${dups.length} | linhas excedentes: ${linhasExcedentes}`);
if (!dups.length) { console.log('Nenhuma duplicata kit-side.'); process.exit(0); }

// 2. Contexto dos kits afetados (brief → competência/descritor, disc, status)
const kitIds = [...new Set(dups.map(([k]) => k.split('|')[0]))];
const { data: kits } = await sb.from('kits').select('id, brief_id, disc, status').in('id', kitIds);
const briefIds = [...new Set((kits ?? []).map((k) => k.brief_id).filter(Boolean))];
const { data: briefs } = briefIds.length
  ? await sb.from('kit_briefs').select('id, competencia, descritor, empresa_id').in('id', briefIds)
  : { data: [] };
const kitPorId = new Map((kits ?? []).map((k) => [k.id, k]));
const briefPorId = new Map((briefs ?? []).map((b) => [b.id, b]));

// 3. Exemplos (até 3), com a cópia que o overlay agora escolhe (mais recente)
for (const [k, rows] of dups.slice(0, 3)) {
  const [kitId, formato] = k.split('|');
  const kit = kitPorId.get(kitId);
  const brief = kit ? briefPorId.get(kit.brief_id) : null;
  const ordenado = [...rows].sort((a, b) => new Date(b.created_at) - new Date(a.created_at) || (b.id < a.id ? -1 : 1));
  console.log(`\n• kit ${kitId.slice(0, 8)} [${formato}] ${rows.length}× — ${brief?.competencia ?? '?'} / ${brief?.descritor ?? '?'} (disc=${kit?.disc ?? '?'}, status=${kit?.status ?? '?'}, empresa=${brief?.empresa_id ? brief.empresa_id.slice(0, 8) : 'GLOBAL'})`);
  for (const [i, c] of ordenado.entries()) {
    console.log(`  ${i === 0 ? '✔ vence (mais recente)' : '✘ cópia'}: ${c.id.slice(0, 8)} ativo=${c.ativo} ${c.created_at} "${(c.titulo ?? '').slice(0, 50)}"`);
  }
}
console.log(`\nREAD-ONLY: nada foi alterado. Deduplicar (se decidido) é outra tarefa — com backup em backups/ antes.`);
