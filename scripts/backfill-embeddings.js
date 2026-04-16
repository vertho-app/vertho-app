// Backfill de embeddings em knowledge_base.
//
// Itera todos rows ativos com embedding IS NULL e gera embedding via provider
// (OpenAI ou Voyage), gravando vector + embedding_model + embedding_at.
//
// Após terminar, sugere rodar REINDEX + ANALYZE no índice IVFFLAT.
//
// Uso:
//   node scripts/backfill-embeddings.js [--dry] [--empresa <uuid>] [--limit N] [--batch N]
//
// Env necessárias (.env.local):
//   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//   EMBEDDING_PROVIDER=openai|voyage
//   OPENAI_API_KEY ou VOYAGE_API_KEY

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf-8')
    .split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).replace(/^["']|["']$/g, '')]; })
);

const args = process.argv.slice(2);
const DRY = args.includes('--dry');
const flag = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const empresaFiltro = flag('--empresa');
const limit = parseInt(flag('--limit') || '0', 10);
const batchSize = parseInt(flag('--batch') || '20', 10);

const provider = (env.EMBEDDING_PROVIDER || 'none').toLowerCase();
if (provider !== 'openai' && provider !== 'voyage') {
  console.error(`EMBEDDING_PROVIDER deve ser "openai" ou "voyage" (atual: "${provider}")`);
  process.exit(1);
}

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

console.log(DRY ? '== DRY RUN ==' : '== EXECUÇÃO REAL ==');
console.log(`provider: ${provider}, batch: ${batchSize}${limit ? `, limit: ${limit}` : ''}${empresaFiltro ? `, empresa: ${empresaFiltro}` : ''}`);

let q = sb.from('knowledge_base')
  .select('id, empresa_id, titulo, conteudo')
  .is('embedding', null)
  .eq('ativo', true)
  .order('criado_em', { ascending: true });

if (empresaFiltro) q = q.eq('empresa_id', empresaFiltro);
if (limit > 0) q = q.limit(limit);

const { data: rows, error } = await q;
if (error) {
  console.error('Falha ao listar:', error);
  process.exit(1);
}

console.log(`rows pendentes: ${rows?.length || 0}`);
if (!rows?.length) process.exit(0);

let ok = 0, falha = 0;
const t0 = Date.now();

for (let i = 0; i < rows.length; i += batchSize) {
  const lote = rows.slice(i, i + batchSize);
  await Promise.all(lote.map(async (row) => {
    const texto = `${row.titulo}\n${row.conteudo}`.slice(0, 8000);
    try {
      const emb = provider === 'openai' ? await embedOpenAI(texto) : await embedVoyage(texto);
      if (DRY) { ok++; return; }
      const { error: upErr } = await sb.from('knowledge_base')
        .update({
          embedding: emb.vector,
          embedding_model: emb.model,
          embedding_at: new Date().toISOString(),
        })
        .eq('id', row.id);
      if (upErr) { console.error(`  [${row.id}] update:`, upErr.message); falha++; return; }
      ok++;
    } catch (err) {
      console.error(`  [${row.id}] ${row.titulo}:`, err.message);
      falha++;
    }
  }));
  const pct = Math.round(((i + lote.length) / rows.length) * 100);
  console.log(`  progresso: ${i + lote.length}/${rows.length} (${pct}%) — ok:${ok} falha:${falha}`);
}

const dt = ((Date.now() - t0) / 1000).toFixed(1);
console.log(`\nconcluído em ${dt}s — ok:${ok} falha:${falha}`);

if (!DRY && ok > 0) {
  console.log('\nPróximo passo (executar manualmente no Supabase SQL editor):');
  console.log('  REINDEX INDEX idx_kb_embedding;');
  console.log('  ANALYZE knowledge_base;');
  console.log('  -- Se passar de ~10k rows, recriar índice com lists ≈ sqrt(N).');
}

async function embedOpenAI(text) {
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.OPENAI_API_KEY}` },
    body: JSON.stringify({ model: 'text-embedding-3-small', input: text, dimensions: 1024 }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const vector = data?.data?.[0]?.embedding;
  if (!Array.isArray(vector)) throw new Error('OpenAI: embedding ausente');
  return { vector, model: 'openai/text-embedding-3-small' };
}

async function embedVoyage(text) {
  const res = await fetch('https://api.voyageai.com/v1/embeddings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.VOYAGE_API_KEY}` },
    body: JSON.stringify({
      model: 'voyage-3-large',
      input: [text],
      input_type: 'document',
    }),
  });
  if (!res.ok) throw new Error(`Voyage ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const vector = data?.data?.[0]?.embedding;
  if (!Array.isArray(vector)) throw new Error('Voyage: embedding ausente');
  return { vector, model: 'voyage/voyage-3-large' };
}
