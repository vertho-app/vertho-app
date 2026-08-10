/**
 * Verifica o ÚLTIMO backup baixando o artefato — não o processo que o gerou.
 *
 * Por que existe: até 10/08/2026 não havia nem função nem script que LESSE um
 * backup de volta. Um dump que ninguém nunca abriu é uma hipótese, não um
 * backup: arquivo corrompido, gzip truncado ou manifesto mentindo têm todos a
 * mesma aparência (um .json.gz no bucket, do tamanho esperado).
 *
 * Isto não é um restore — não escreve nada. Ele responde três perguntas:
 *   1. o arquivo descomprime e faz parse?
 *   2. o manifesto bate com o que está de fato dentro do arquivo?
 *   3. as contagens conferem com o banco de HOJE (com folga, porque o banco
 *      cresce entre o backup e a verificação — só a queda é suspeita)?
 *
 * Uso: node --env-file=.env.local scripts/_verifica-backup.mjs [YYYY-MM-DD]
 */
import { gunzipSync } from 'node:zlib';
import { createClient } from '@supabase/supabase-js';

const URL_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SRK = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_BASE || !SRK) {
  console.error('Faltam envs. Rode com: node --env-file=.env.local scripts/_verifica-backup.mjs');
  process.exit(1);
}
const sb = createClient(URL_BASE, SRK, { auth: { persistSession: false } });

const { data: arquivos, error: errLista } = await sb.storage.from('backups')
  .list('', { limit: 30, sortBy: { column: 'name', order: 'desc' } });
if (errLista) { console.error('list:', errLista.message); process.exit(1); }

const alvo = process.argv[2]
  ? `${process.argv[2]}.json.gz`
  : (arquivos || []).map((f) => f.name).filter((n) => n.endsWith('.json.gz')).sort().pop();
if (!alvo) { console.error('Nenhum backup no bucket.'); process.exit(1); }

const { data: blob, error: errDl } = await sb.storage.from('backups').download(alvo);
if (errDl) { console.error(`download ${alvo}:`, errDl.message); process.exit(1); }

let dump;
try {
  dump = JSON.parse(gunzipSync(Buffer.from(await blob.arrayBuffer())).toString());
} catch (e) {
  console.error(`❌ ${alvo} NÃO abre: ${e.message}`);
  process.exit(1);
}

const tabelas = Object.keys(dump.tabelas || {});
console.log(`arquivo: ${alvo} · versão ${dump.versao} · gerado ${dump.gerado_em}`);
console.log(`tabelas no dump: ${tabelas.length}\n`);

if (!dump.manifesto) {
  console.log('⚠️  Sem manifesto (dump versão 1) — só dá para conferir contra o banco.\n');
}

console.log('tabela                        | no dump | manifesto |   banco | veredito');
console.log('------------------------------+---------+-----------+---------+---------');

let problemas = 0;
for (const t of tabelas.sort()) {
  const noDump = dump.tabelas[t].length;
  const noManifesto = dump.manifesto?.[t]?.exportado ?? null;
  const { count, error } = await sb.from(t).select('id', { count: 'exact', head: true });

  let veredito = 'ok';
  if (noManifesto !== null && noManifesto !== noDump) { veredito = '❌ manifesto ≠ conteúdo'; problemas++; }
  else if (error) veredito = `? banco: ${error.message}`;
  else if (count !== null && noDump < count * 0.9) { veredito = '❌ dump < 90% do banco'; problemas++; }
  else if (count !== null && noDump < count) veredito = '~ banco cresceu depois';

  console.log(
    `${t.padEnd(29)} | ${String(noDump).padStart(7)} | ${String(noManifesto ?? '—').padStart(9)} | ${String(count ?? '—').padStart(7)} | ${veredito}`,
  );
}

// Tabela que o backup deveria conter e não contém não aparece no laço acima —
// é justamente o defeito que fazia o dump encolher em silêncio.
console.log(`\n${problemas === 0 ? '✅ artefato íntegro' : `❌ ${problemas} problema(s)`}`);
process.exit(problemas === 0 ? 0 : 1);
