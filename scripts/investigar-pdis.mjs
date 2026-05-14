import { readFileSync, writeFileSync } from 'fs';
import readXlsxFile from 'read-excel-file/node';
import { createClient } from '@supabase/supabase-js';

const env = readFileSync('.env.local', 'utf8').split('\n').filter(l => l && !l.startsWith('#'))
  .reduce((acc, l) => { const i = l.indexOf('='); if (i > 0) acc[l.slice(0, i).trim()] = l.slice(i + 1).trim(); return acc; }, {});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const SOURCE = 'C:/Users/rdnav/.claude/projects/C--GAS-Vertho-App/085a7ccd-427e-4c76-ab31-f7b955f9dca8/tool-results/mcp-claude_ai_Google_Drive-download_file_content-1778777782959.txt';
const j = JSON.parse(readFileSync(SOURCE, 'utf8'));
writeFileSync('/tmp/macae.xlsx', Buffer.from(j.content, 'base64'));
const all = await readXlsxFile('/tmp/macae.xlsx');

// 1. Aba "PDIs" — header + linhas
const pdisSheet = all.find(a => a.sheet === 'PDIs');
console.log('━━━ Aba "PDIs" ━━━');
console.log(`Total linhas: ${pdisSheet.data.length}`);
pdisSheet.data.slice(0, 5).forEach((row, i) => {
  console.log(`  [${i+1}]`, row);
});

// 2. Aba "PDI_Descritores"
const pdiDescSheet = all.find(a => a.sheet === 'PDI_Descritores');
console.log(`\n━━━ Aba "PDI_Descritores" — ${pdiDescSheet.data.length} linhas ━━━`);
console.log('Header:', pdiDescSheet.data[0]);
console.log('\nPrimeiras 3 linhas de dados:');
pdiDescSheet.data.slice(1, 4).forEach((row, i) => {
  console.log(`  [${i+1}]`, JSON.stringify(row).slice(0, 250));
});

// 3. Aba "Trilhas"
const trilhasSheet = all.find(a => a.sheet === 'Trilhas');
console.log(`\n━━━ Aba "Trilhas" — ${trilhasSheet.data.length} linhas ━━━`);
console.log('Header:', trilhasSheet.data[0]);
console.log('\nLinhas 2-5:');
trilhasSheet.data.slice(1, 5).forEach((row, i) => {
  console.log(`  [${i+1}]`, JSON.stringify(row).slice(0, 300));
});

// 4. Tabelas do Vertho relacionadas a PDIs
console.log('\n━━━ Banco — tabelas relacionadas ━━━');
for (const t of ['pdis', 'relatorios', 'trilhas']) {
  const { data, error } = await sb.from(t).select('*').limit(1);
  if (error) console.log(`  ${t}: ${error.message}`);
  else if (data?.[0]) console.log(`  ${t}: colunas = ${Object.keys(data[0]).slice(0, 20).join(', ')}...`);
  else console.log(`  ${t}: existe mas vazia`);
}

// 5. relatorios da empresa Macaé (incluindo PDIs?)
const {data: emp} = await sb.from('empresas').select('id').eq('slug','macae').single();
console.log('\n━━━ Banco — relatórios da Macaé ━━━');
const {data: rels, error: e1} = await sb.from('relatorios').select('id, tipo, colaborador_id, url_pdf, criado_em').eq('empresa_id', emp.id).limit(5);
if (e1) console.log('  erro:', e1.message);
else console.log(`  ${rels?.length || 0} relatórios`);

console.log('\n━━━ comportamental_pdf_path dos colabs ━━━');
const {count: comPdf} = await sb.from('colaboradores').select('*',{count:'exact',head:true})
  .eq('empresa_id', emp.id).not('comportamental_pdf_path','is',null);
console.log(`  ${comPdf} colabs com comportamental_pdf_path`);
