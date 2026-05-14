/**
 * Importa os 13 PDIs faltantes (pasta `PDIs Gerados Template`)
 * usando o mapping em outputs/matches-pdis.json.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const APPLY = process.argv.includes('--apply');
const env = readFileSync('.env.local', 'utf8').split('\n').filter(l => l && !l.startsWith('#'))
  .reduce((acc, l) => { const i = l.indexOf('='); if (i > 0) acc[l.slice(0, i).trim()] = l.slice(i + 1).trim(); return acc; }, {});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const matches = JSON.parse(readFileSync('outputs/matches-pdis.json', 'utf8'));
console.log(`${matches.length} PDIs faltantes pra importar\n`);

const { data: emp } = await sb.from('empresas').select('id').eq('slug', 'macae').single();

if (!APPLY) {
  matches.forEach((m, i) => console.log(`  [${i+1}] ${m.email} → ${m.titulo}`));
  console.log('\nDRY-RUN. Pra aplicar: --apply');
  process.exit(0);
}

let ok = 0, errDownload = 0, errUpload = 0, errInsert = 0;
const t0 = Date.now();

for (let i = 0; i < matches.length; i++) {
  const p = matches[i];
  const downloadUrl = `https://drive.google.com/uc?export=download&id=${p.fileId}`;
  let pdfBuffer;

  try {
    const res = await fetch(downloadUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    pdfBuffer = Buffer.from(await res.arrayBuffer());
    if (pdfBuffer.slice(0, 4).toString() !== '%PDF') {
      throw new Error(`não é PDF — ${pdfBuffer.slice(0, 200).toString().slice(0, 80)}`);
    }
  } catch (e) {
    errDownload++; console.error(`[${i+1}] ${p.email} download: ${e.message}`);
    continue;
  }

  const ts = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
  const storagePath = `macae/${p.colabId}/pdi-${ts}.pdf`;
  const { error: upErr } = await sb.storage.from('relatorios-pdf').upload(storagePath, pdfBuffer, {
    contentType: 'application/pdf', upsert: true,
  });
  if (upErr) {
    errUpload++; console.error(`[${i+1}] ${p.email} upload: ${upErr.message}`);
    continue;
  }

  const { error: insErr } = await sb.from('relatorios').insert({
    empresa_id: emp.id, colaborador_id: p.colabId, tipo: 'individual',
    pdf_path: storagePath, gerado_em: new Date().toISOString(),
    conteudo: {
      origem: 'gas-legado-macae-pasta-nova', nome: p.nome,
      titulo_arquivo: p.titulo, fileId_drive: p.fileId,
    },
  });
  if (insErr) {
    errInsert++; console.error(`[${i+1}] ${p.email} insert: ${insErr.message}`);
    continue;
  }

  ok++;
  console.log(`  ✓ [${i+1}] ${p.email} (${pdfBuffer.length} bytes)`);
}

const dt = ((Date.now() - t0) / 1000).toFixed(0);
console.log(`\n✓ Importados: ${ok}/${matches.length} em ${dt}s`);
if (errDownload) console.log(`  Erros download: ${errDownload}`);
if (errUpload) console.log(`  Erros upload: ${errUpload}`);
if (errInsert) console.log(`  Erros insert: ${errInsert}`);
