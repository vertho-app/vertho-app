/** Backfill idempotente da KB, com backup e comparação da fonte antes de gravar.
 * npm run backfill:embeddings -- --dry [--empresa UUID] [--limit N]
 * --dry apenas lista pendências; não chama a API nem escreve no banco.
 */
import { createClient } from '@supabase/supabase-js';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { embedText, kbEmbeddingUpdate } from '@/lib/embeddings';

async function main() {
  process.loadEnvFile('.env.local');
  const args = process.argv.slice(2);
  const flag = (name: string) => { const i = args.indexOf(name); return i < 0 ? null : args[i + 1]; };
  const dry = args.includes('--dry');
  const empresa = flag('--empresa');
  const limit = Number(flag('--limit') || 0);
  if (!Number.isInteger(limit) || limit < 0) throw new Error('--limit deve ser inteiro >= 0');
  const provider = (process.env.EMBEDDING_PROVIDER || 'none').toLowerCase();
  if (!['voyage', 'openai'].includes(provider)) throw new Error('EMBEDDING_PROVIDER deve ser voyage ou openai');
  const v4 = provider === 'voyage' && (process.env.VOYAGE_EMBEDDING_MODEL || 'voyage-4-large') === 'voyage-4-large';
  const field = v4 ? 'embedding_v4' : 'embedding';
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
  const rows: any[] = [];
  for (let offset = 0; ; offset += 1000) {
    let q = sb.from('knowledge_base')
      .select('id, empresa_id, titulo, conteudo, embedding, embedding_model, embedding_at, embedding_v4, embedding_v4_model, embedding_v4_at')
      .is(field, null).eq('ativo', true).order('id').range(offset, offset + 999);
    if (empresa) q = q.eq('empresa_id', empresa);
    const { data, error } = await q;
    if (error) throw error;
    rows.push(...(data || []));
    if ((data || []).length < 1000 || (limit > 0 && rows.length >= limit)) break;
  }
  const pending = limit > 0 ? rows.slice(0, limit) : rows;
  console.log(`${dry ? 'DRY' : 'REAL'}: ${pending.length} pendências em ${field}`);
  if (dry || !pending.length) return;

  const dir = resolve('backups');
  await mkdir(dir, { recursive: true });
  const backup = resolve(dir, `kb-embeddings-${Date.now()}.json`);
  await writeFile(backup, JSON.stringify(pending), { flag: 'wx' });
  console.log(`Backup: ${backup}`);

  let ok = 0;
  for (const row of pending) {
    const emb = await embedText(`${row.titulo}\n${row.conteudo}`);
    if (!emb) throw new Error(`Embedding indisponível para ${row.id}; interrompido sem gravar este item`);
    const { data, error } = await sb.from('knowledge_base').update(kbEmbeddingUpdate(emb))
      .eq('empresa_id', row.empresa_id).eq('id', row.id)
      .eq('titulo', row.titulo).eq('conteudo', row.conteudo).is(field, null).select('id');
    if (error) throw error;
    if (!data?.length) throw new Error(`Fonte mudou ou vetor já preenchido: ${row.id}; execute novamente`);
    ok++;
    if (ok % 20 === 0 || ok === pending.length) console.log(`Gravados ${ok}/${pending.length}`);
  }
}

main().catch(err => { console.error(err?.message || err); process.exitCode = 1; });
