// Retropopula:
//   1. respostas.competencia_nome (a partir de competencias.nome via competencia_id)
//   2. descriptor_assessments (a partir de avaliacao_ia.consolidacao.notas_por_descritor)
// Rode: node scripts/retropop-assessments.js [--dry]

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf-8')
    .split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).replace(/^["']|["']$/g, '')]; })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const DRY = process.argv.includes('--dry');
console.log(DRY ? '== DRY RUN ==' : '== EXECUCAO REAL ==');

// 1. competencias: id -> nome
const { data: competencias } = await sb.from('competencias').select('id, nome');
const compNomeById = Object.fromEntries((competencias || []).map(c => [c.id, c.nome]));
console.log(`competencias carregadas: ${competencias?.length || 0}`);

// 2. respostas com avaliacao_ia
const { data: respostas } = await sb.from('respostas')
  .select('id, empresa_id, colaborador_id, email_colaborador, competencia_id, competencia_nome, avaliacao_ia, nivel_ia4, nota_ia4')
  .not('avaliacao_ia', 'is', null);
console.log(`respostas com avaliacao_ia: ${respostas?.length || 0}`);

let fixNome = 0;
let upsertDesc = 0;
const daRows = [];

for (const r of respostas || []) {
  // (1) preenche competencia_nome se vazio
  if (!r.competencia_nome && r.competencia_id && compNomeById[r.competencia_id]) {
    const novoNome = compNomeById[r.competencia_id];
    if (!DRY) {
      await sb.from('respostas').update({ competencia_nome: novoNome }).eq('id', r.id);
    }
    fixNome++;
    r.competencia_nome = novoNome;
  }

  // (2) coleta linhas pra descriptor_assessments
  const av = typeof r.avaliacao_ia === 'string' ? JSON.parse(r.avaliacao_ia) : r.avaliacao_ia;
  const notasDesc = av?.consolidacao?.notas_por_descritor || {};
  if (!r.competencia_nome || !r.colaborador_id) continue;

  for (const d of Object.values(notasDesc)) {
    const nome = d?.nome || d?.descritor;
    const nota = d?.nota_decimal ?? d?.nota;
    if (!nome || typeof nota !== 'number') continue;
    daRows.push({
      colaborador_id: r.colaborador_id,
      empresa_id: r.empresa_id,
      competencia: r.competencia_nome,
      descritor: nome,
      nota,
      origem: 'ia4',
    });
  }
}

console.log(`\ncompetencia_nome preenchido em: ${fixNome} respostas`);
console.log(`descriptor_assessments a upsertar: ${daRows.length}`);

if (!DRY && daRows.length > 0) {
  // batches de 500
  for (let i = 0; i < daRows.length; i += 500) {
    const chunk = daRows.slice(i, i + 500);
    const { error } = await sb.from('descriptor_assessments')
      .upsert(chunk, { onConflict: 'colaborador_id,competencia,descritor' });
    if (error) { console.error('Erro upsert:', error.message); break; }
    upsertDesc += chunk.length;
  }
  console.log(`upserts feitos: ${upsertDesc}`);
}
