/**
 * Corrige a vinculação `respostas.competencia_id` re-mapeando pelo
 * `competencia_nome` em vez do cod_comp. A aba Respostas do Sheets tinha
 * vários cod_comp inconsistentes com a aba Competências.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'fs';
import readXlsxFile from 'read-excel-file/node';

const APPLY = process.argv.includes('--apply');
const env = readFileSync('.env.local', 'utf8').split('\n').filter(l => l && !l.startsWith('#'))
  .reduce((acc, l) => { const i = l.indexOf('='); if (i > 0) acc[l.slice(0, i).trim()] = l.slice(i + 1).trim(); return acc; }, {});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// Re-lê a aba Respostas do xlsx
const SOURCE = 'C:/Users/rdnav/.claude/projects/C--GAS-Vertho-App/085a7ccd-427e-4c76-ab31-f7b955f9dca8/tool-results/mcp-claude_ai_Google_Drive-download_file_content-1778777782959.txt';
const j = JSON.parse(readFileSync(SOURCE, 'utf8'));
writeFileSync('/tmp/macae.xlsx', Buffer.from(j.content, 'base64'));
const all = await readXlsxFile('/tmp/macae.xlsx');
const respSheet = all.find(a => a.sheet === 'Respostas');

// Mapping (email, nome_comp) → linha do Sheets pra usar como fonte da verdade
const sheetsResps = [];
respSheet.data.slice(1).forEach(row => {
  if (!row || !row[1] || !row[6]) return;
  sheetsResps.push({
    email: String(row[1]).toLowerCase().trim(),
    cod_comp: row[5],
    nome_comp: String(row[6] || '').trim(),
  });
});
console.log(`Sheets: ${sheetsResps.length} respostas`);

const { data: emp } = await sb.from('empresas').select('id').eq('slug', 'macae').single();

// Lista competências do banco — match por nome
const { data: comps } = await sb.from('competencias').select('id, cod_comp, nome').eq('empresa_id', emp.id);
const compByNome = {};
comps.forEach(c => { compByNome[c.nome.toUpperCase().trim()] = c; });

// Pra cada resposta no banco, verifica se o competencia_id bate com o nome do Sheets
const { data: dbResps } = await sb.from('respostas')
  .select('id, email_colaborador, competencia_id, competencia_nome')
  .eq('empresa_id', emp.id);

console.log(`\nBanco: ${dbResps.length} respostas`);
console.log('\n━━━ Divergências (banco vs Sheets nome_comp) ━━━\n');
let divergentes = 0, ok = 0;
const updates = [];
for (const r of dbResps) {
  // Acha a resposta correspondente no Sheets (por email + nome_comp do banco)
  const sheetMatch = sheetsResps.find(s =>
    s.email === r.email_colaborador && s.nome_comp.toUpperCase() === r.competencia_nome.toUpperCase()
  );
  if (!sheetMatch) {
    console.log(`  [?] ${r.email_colaborador} / "${r.competencia_nome}" sem match no Sheets`);
    continue;
  }
  // Acha a competência no banco que TEM o nome correto
  const correta = compByNome[sheetMatch.nome_comp.toUpperCase()];
  if (!correta) {
    console.log(`  [!!] Sheets nome "${sheetMatch.nome_comp}" não existe na tabela competencias`);
    continue;
  }
  if (correta.id !== r.competencia_id) {
    divergentes++;
    updates.push({ id: r.id, novo_comp_id: correta.id, cod_correto: correta.cod_comp, nome_correto: correta.nome });
    if (divergentes <= 8) {
      console.log(`  [DIVERG] ${r.email_colaborador}`);
      console.log(`    Banco aponta pra "${r.competencia_nome}" mas Sheets quis "${sheetMatch.nome_comp}"`);
      console.log(`    Cod sheets=${sheetMatch.cod_comp} | Cod correto=${correta.cod_comp}`);
    }
  } else {
    ok++;
  }
}
console.log(`\nResumo: ${divergentes} divergentes, ${ok} corretas`);

if (!APPLY) {
  console.log('\nDRY-RUN. Pra aplicar: --apply');
  process.exit(0);
}

console.log('\n🚀 Aplicando correções...');
let upd = 0, err = 0;
for (const u of updates) {
  const { error } = await sb.from('respostas')
    .update({ competencia_id: u.novo_comp_id })
    .eq('id', u.id);
  if (error) { err++; console.error(`  ${u.id}: ${error.message}`); }
  else upd++;
}
console.log(`✓ Atualizadas: ${upd}, erros: ${err}`);
