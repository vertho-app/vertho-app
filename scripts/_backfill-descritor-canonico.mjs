// F-I6 — backfill de descriptor_assessments.descritor para a forma CANÔNICA
// (sem prefixo de código "COO03_D5 — ", sem sufixo "(COO03_D5)").
//
// Por quê: a IA4 e o grid admin gravaram o descritor COM prefixo, enquanto o
// blueprint grava o nome limpo. A UNIQUE(colaborador_id,competencia,descritor)
// não pega porque as strings diferem → 2 linhas pro mesmo descritor; no caminho
// blueprint→trilha (to-descriptors.ts) a 2ª nota SOBRESCREVE a 1ª, e no legado
// select-descriptors saem 2 semanas no mesmo descritor.
//
// O normalizador é o MESMO da escrita: stripCodigoDescritor (lib/descritores.ts)
// — port literal dos 2 regexes (não inventa um 4º normalizador; F-I7 cuida da
// convergência dos que normalizam pra MATCH, fora do escopo aqui).
//
// COLISÃO: quando "COO03_D5 — X" e "X" coexistem pro mesmo colab+comp, limpar
// os dois colidiria na UNIQUE. Critério do vencedor:
//   1. assessment_date MAIS RECENTE (nota é NOT NULL — "mais recente com nota
//      não-nula" da spec equivale a simplesmente mais recente);
//   2. empate: prefere a linha JÁ limpa (menos update);
//   3. empate: id (determinístico).
// A perdedora é APAGADA (com backup). Ordem da aplicação: deletes ANTES dos
// updates — atualizar o vencedor prefixado antes de apagar a perdedora limpa
// violaria a UNIQUE.
//
// Uso:
//   node scripts/_backfill-descritor-canonico.mjs            # DRY-RUN — mede prefixos e colisões
//   node scripts/_backfill-descritor-canonico.mjs --aplicar  # backup JSON em backups/ + delete + update
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { writeFileSync } from 'node:fs';
config({ path: '.env.local' });

const APLICAR = process.argv.includes('--aplicar');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Port literal de lib/descritores.ts::stripCodigoDescritor (mesmos 2 regexes).
function stripCodigoDescritor(s) {
  return String(s || '')
    .replace(/^[A-Z0-9][A-Z0-9_.-]*\s*[—–-]\s*/i, '')
    .replace(/\s*\(\s*[A-Z][A-Z0-9_.-]*\d[A-Z0-9_.-]*\s*\)\s*$/i, '')
    .trim();
}

// 1. Todas as linhas (paginado — supabase corta em 1000 por request)
const todas = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await sb.from('descriptor_assessments')
    .select('id, empresa_id, colaborador_id, competencia, descritor, nota, origem, assessment_date')
    .range(from, from + 999);
  if (error) { console.error('ERRO:', error.message); process.exit(1); }
  todas.push(...(data ?? []));
  if ((data ?? []).length < 1000) break;
}

const comPrefixo = todas.filter((r) => stripCodigoDescritor(r.descritor) !== r.descritor);
console.log(`linhas: ${todas.length} | com prefixo/sufixo de código: ${comPrefixo.length}`);

// 2. Agrupa por (colaborador, competencia, canônico) — espelha a UNIQUE
const grupos = new Map();
for (const r of todas) {
  const k = `${r.colaborador_id}|${r.competencia}|${stripCodigoDescritor(r.descritor)}`;
  if (!grupos.has(k)) grupos.set(k, []);
  grupos.get(k).push(r);
}

const updates = []; // linha solitária prefixada → UPDATE descritor
const colisoes = []; // grupos com 2+ linhas → 1 vencedor + deletes
for (const [, rows] of grupos) {
  const sujas = rows.filter((r) => stripCodigoDescritor(r.descritor) !== r.descritor);
  if (!sujas.length) continue;
  if (rows.length === 1) { updates.push(rows[0]); continue; }
  const ordenado = [...rows].sort((a, b) => {
    const d = new Date(b.assessment_date ?? 0) - new Date(a.assessment_date ?? 0);
    if (d) return d;
    const limpaA = stripCodigoDescritor(a.descritor) === a.descritor ? 1 : 0;
    const limpaB = stripCodigoDescritor(b.descritor) === b.descritor ? 1 : 0;
    if (limpaB !== limpaA) return limpaB - limpaA;
    return String(a.id).localeCompare(String(b.id));
  });
  const [vencedor, ...perdedores] = ordenado;
  colisoes.push({ vencedor, perdedores });
}

const totalDeletes = colisoes.reduce((n, c) => n + c.perdedores.length, 0);
console.log(`updates simples (sem colisão): ${updates.length} | grupos em colisão: ${colisoes.length} | linhas a apagar: ${totalDeletes}`);
for (const c of colisoes) {
  console.log(`\n• ${c.vencedor.competencia} / ${stripCodigoDescritor(c.vencedor.descritor)} (colab ${c.vencedor.colaborador_id?.slice(0, 8)})`);
  console.log(`  ✔ fica: ${c.vencedor.id.slice(0, 8)} "${c.vencedor.descritor}" nota=${c.vencedor.nota} ${c.vencedor.assessment_date}`);
  for (const p of c.perdedores) {
    console.log(`  ✘ sai:  ${p.id.slice(0, 8)} "${p.descritor}" nota=${p.nota} ${p.assessment_date}`);
  }
}

if (!updates.length && !colisoes.length) { console.log('\nNada a fazer.'); process.exit(0); }
if (!APLICAR) { console.log('\nDRY-RUN. Rode com --aplicar para backup + delete + update.'); process.exit(0); }

// 3. Backup (AGENTS.md: sempre antes de deletar em produção) — apagadas + originais pré-update
const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19) + 'Z';
const path = `backups/descritor-canonico-backfill-f-i6-${ts}.json`;
writeFileSync(path, JSON.stringify({
  quando: ts,
  apagadas: colisoes.flatMap((c) => c.perdedores),
  originais_pre_update: [...updates, ...colisoes.map((c) => c.vencedor)].filter((r) => stripCodigoDescritor(r.descritor) !== r.descritor),
}, null, 2));
console.log(`\nBackup: ${path}`);

// 4. Deletes PRIMEIRO (libera a chave canônica pra update do vencedor)
const perdedores = colisoes.flatMap((c) => c.perdedores);
let apagados = 0;
for (let i = 0; i < perdedores.length; i += 50) {
  const lote = perdedores.slice(i, i + 50).map((r) => r.id);
  const { error: delErr, count } = await sb.from('descriptor_assessments').delete({ count: 'exact' }).in('id', lote);
  if (delErr) { console.error('ERRO no delete:', delErr.message); process.exit(3); }
  apagados += count ?? 0;
}
console.log(`Apagados: ${apagados}/${perdedores.length}`);

// 5. Updates: linha prefixada (solitária ou vencedora) → descritor canônico
const paraAtualizar = [...updates, ...colisoes.map((c) => c.vencedor)]
  .filter((r) => stripCodigoDescritor(r.descritor) !== r.descritor);
let atualizados = 0;
for (const r of paraAtualizar) {
  const { error: upErr } = await sb.from('descriptor_assessments')
    .update({ descritor: stripCodigoDescritor(r.descritor) }).eq('id', r.id);
  if (upErr) { console.error(`ERRO no update ${r.id}:`, upErr.message); process.exit(3); }
  atualizados++;
}
console.log(`Atualizados: ${atualizados}/${paraAtualizar.length}`);
