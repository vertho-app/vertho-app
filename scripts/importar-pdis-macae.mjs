/**
 * Importa PDIs da aba "PDI_Descritores" do Sheets:
 *   - Baixa cada PDF do Drive (URLs públicas)
 *   - Sobe pro bucket Supabase `relatorios-pdf` em path
 *     `macae/{colab_id}/pdi-{ts}.pdf`
 *   - Insere registro em `relatorios` com tipo='individual' apontando pro storage
 *
 * Idempotente: deleta PDIs antigos da empresa antes de re-importar.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'fs';
import readXlsxFile from 'read-excel-file/node';

const APPLY = process.argv.includes('--apply');
const env = readFileSync('.env.local', 'utf8').split('\n').filter(l => l && !l.startsWith('#'))
  .reduce((acc, l) => { const i = l.indexOf('='); if (i > 0) acc[l.slice(0, i).trim()] = l.slice(i + 1).trim(); return acc; }, {});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const SOURCE = 'C:/Users/rdnav/.claude/projects/C--GAS-Vertho-App/085a7ccd-427e-4c76-ab31-f7b955f9dca8/tool-results/mcp-claude_ai_Google_Drive-download_file_content-1778777782959.txt';
const j = JSON.parse(readFileSync(SOURCE, 'utf8'));
writeFileSync('/tmp/macae.xlsx', Buffer.from(j.content, 'base64'));
const all = await readXlsxFile('/tmp/macae.xlsx');
const pdiSheet = all.find(a => a.sheet === 'PDI_Descritores');

function extractFileId(url) {
  if (!url) return null;
  const m = String(url).match(/\/d\/([a-zA-Z0-9_-]{20,})/);
  return m ? m[1] : null;
}

const pdis = pdiSheet.data.slice(1).map(row => ({
  email: String(row[0] || '').toLowerCase().trim(),
  nome: row[1], cargo: row[2],
  data_geracao: row[3], status: row[4],
  drive_url: row[5], qtd_competencias: row[6],
  fileId: extractFileId(row[5]),
})).filter(p => p.email && p.fileId);

console.log(`Total PDIs com fileId válido: ${pdis.length}\n`);

const { data: emp } = await sb.from('empresas').select('id').eq('slug', 'macae').single();
const { data: colabs } = await sb.from('colaboradores').select('id, email').eq('empresa_id', emp.id);
const colabIdByEmail = Object.fromEntries(colabs.map(c => [c.email, c.id]));

const matched = pdis.map(p => ({ ...p, colabId: colabIdByEmail[p.email] })).filter(p => p.colabId);
console.log(`Match com colabs: ${matched.length}/${pdis.length}`);
const semMatch = pdis.filter(p => !colabIdByEmail[p.email]);
if (semMatch.length) {
  console.log('Sem colab:');
  semMatch.forEach(p => console.log(`  - ${p.email}`));
}

if (!APPLY) {
  console.log('\nDRY-RUN. Pra aplicar (vai baixar+subir 52 PDFs ~3-5min): --apply');
  process.exit(0);
}

// Deleta PDIs antigos
const { error: delErr } = await sb.from('relatorios')
  .delete().eq('empresa_id', emp.id).eq('tipo', 'individual');
if (delErr) console.error('Erro deletando antigos:', delErr.message);
else console.log('✓ PDIs antigos limpos\n');

let ok = 0, errDownload = 0, errUpload = 0, errInsert = 0;
const t0 = Date.now();

for (let i = 0; i < matched.length; i++) {
  const p = matched[i];
  const downloadUrl = `https://drive.google.com/uc?export=download&id=${p.fileId}`;
  let pdfBuffer;

  // 1. Download
  try {
    const res = await fetch(downloadUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    pdfBuffer = Buffer.from(await res.arrayBuffer());
    // Sanity check: PDF começa com %PDF
    if (!pdfBuffer.slice(0, 4).toString().includes('PDF')) {
      throw new Error(`não é PDF — ${pdfBuffer.slice(0, 200).toString().slice(0, 80)}`);
    }
  } catch (e) {
    errDownload++; console.error(`[${i+1}] ${p.email} download falhou: ${e.message}`);
    continue;
  }

  // 2. Upload pro bucket relatorios-pdf
  const dataStr = p.data_geracao instanceof Date ? p.data_geracao.toISOString()
    : typeof p.data_geracao === 'string' ? p.data_geracao
    : new Date().toISOString();
  const ts = dataStr.replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
  const storagePath = `macae/${p.colabId}/pdi-${ts}.pdf`;
  const { error: upErr } = await sb.storage.from('relatorios-pdf').upload(storagePath, pdfBuffer, {
    contentType: 'application/pdf',
    upsert: true,
  });
  if (upErr) {
    errUpload++; console.error(`[${i+1}] ${p.email} upload falhou: ${upErr.message}`);
    continue;
  }

  // 3. Insert no relatorios
  const { error: insErr } = await sb.from('relatorios').insert({
    empresa_id: emp.id, colaborador_id: p.colabId, tipo: 'individual',
    pdf_path: storagePath,
    gerado_em: p.data_geracao instanceof Date ? p.data_geracao.toISOString() : p.data_geracao || null,
    conteudo: {
      origem: 'gas-legado-macae', nome: p.nome, cargo: p.cargo,
      status: p.status, qtd_competencias: p.qtd_competencias,
      drive_url_legado: p.drive_url,
    },
  });
  if (insErr) {
    errInsert++; console.error(`[${i+1}] ${p.email} insert falhou: ${insErr.message}`);
    continue;
  }

  ok++;
  if (ok % 10 === 0) console.log(`[${ok}/${matched.length}] processados...`);
}

const dt = ((Date.now() - t0) / 1000).toFixed(0);
console.log(`\n✓ Importados: ${ok}/${matched.length} em ${dt}s`);
if (errDownload) console.log(`  Erros download: ${errDownload}`);
if (errUpload) console.log(`  Erros upload: ${errUpload}`);
if (errInsert) console.log(`  Erros insert: ${errInsert}`);
