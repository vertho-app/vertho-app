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

// 1. Aba Competencias — header e mapping cod→nome
const compSheet = all.find(a => a.sheet === 'Competencias');
console.log('━━━ Aba Competencias — Cod → Nome ━━━\n');
compSheet.data.slice(0, 25).forEach((row, i) => {
  if (!row || !row[0]) return;
  if (typeof row[0] === 'string' && /^C\d/.test(row[0])) {
    console.log(`  ${row[0]} → ${row[1]}`);
  }
});

// 2. Aba Respostas — header completo + linhas da Rejane
const respSheet = all.find(a => a.sheet === 'Respostas');
console.log('\n━━━ Aba Respostas — Header ━━━\n');
const header = respSheet.data[0];
header.slice(0, 15).forEach((h, i) => console.log(`  col${i}: ${h}`));

console.log('\n━━━ Linhas da Rejane na aba Respostas ━━━\n');
respSheet.data.forEach((row, i) => {
  if (!row) return;
  const nome = String(row[2] || '').toLowerCase();
  if (nome.includes('rejane')) {
    console.log(`Linha ${i+1}:`);
    console.log(`  email = ${row[1]}`);
    console.log(`  nome = ${row[2]}`);
    console.log(`  cargo = ${row[4]}`);
    console.log(`  cod_comp = ${row[5]}`);
    console.log(`  nome_comp = ${row[6]}`);
    console.log(`  representatividade = ${row[13]}`);
    console.log(`  nivel = ${row[16]}, nota = ${row[17]}`);
  }
});

// 3. Banco: o que está salvo da Rejane
console.log('\n━━━ Banco — resposta(s) atual(is) da Rejane ━━━\n');
const {data: emp} = await sb.from('empresas').select('id').eq('slug','macae').single();
const {data: resps} = await sb.from('respostas')
  .select('id, competencia_id, competencia_nome, nivel_ia4, nota_ia4, email_colaborador, nome_colaborador')
  .eq('empresa_id', emp.id)
  .or('nome_colaborador.ilike.%rejane%,email_colaborador.ilike.%rejane%');
resps?.forEach(r => {
  console.log(`  id=${r.id}`);
  console.log(`  email=${r.email_colaborador} | nome=${r.nome_colaborador}`);
  console.log(`  competencia_id=${r.competencia_id} | nome=${r.competencia_nome}`);
  console.log(`  nivel=${r.nivel_ia4}, nota=${r.nota_ia4}`);
});

// 4. Banco: mapping cod_comp → nome no Vertho da empresa Macaé
console.log('\n━━━ Banco — cod_comp do Vertho Macaé ━━━\n');
const {data: comps} = await sb.from('competencias').select('cod_comp, nome').eq('empresa_id', emp.id).order('cod_comp');
comps?.forEach(c => console.log(`  ${c.cod_comp} → ${c.nome}`));
