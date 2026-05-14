import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
const env = readFileSync('.env.local', 'utf8').split('\n').filter(l => l && !l.startsWith('#'))
  .reduce((acc, l) => { const i = l.indexOf('='); if (i > 0) acc[l.slice(0, i).trim()] = l.slice(i + 1).trim(); return acc; }, {});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// Re-extrai do markdown: pega TODOS os Cxxx da linha do Tab 21
const SOURCE = 'C:/Users/rdnav/.claude/projects/C--GAS-Vertho-App/085a7ccd-427e-4c76-ab31-f7b955f9dca8/tool-results/mcp-claude_ai_Google_Drive-read_file_content-1778775713096.txt';
const j = JSON.parse(readFileSync(SOURCE, 'utf8'));
const lines = j.fileContent.split('\n');
const seps = [];
lines.forEach((l, i) => { if (/^\|\s*:-/.test(l.trim())) seps.push(i); });

// Tab 21 = idx 20 → dados começam em seps[20]+1
const sep = seps[20];
const dataLine = lines[sep + 1];
console.log('Linha completa Tab 21 (~200 chars):', dataLine.slice(0, 300));

// Extrai todos os Cxxx em ordem
const matches = [...dataLine.matchAll(/\bC0?\d{2,3}\b/g)];
const codsUnicos = [];
for (const m of matches) {
  const cod = m[0];
  if (!codsUnicos.includes(cod) && cod !== 'CAR003') codsUnicos.push(cod);
}
console.log(`\nCods encontrados (em ordem): ${codsUnicos.join(', ')}`);
console.log(`Total: ${codsUnicos.length}`);

// Pega top 10 da ordem
const top10 = codsUnicos.slice(0, 10);
console.log(`\nTop 10 final: ${top10.join(', ')}`);

// Top 5 (col 21 → string com IDs)
const fields = dataLine.split('|').map(s => s.trim()).slice(1, -1);
// procura uma célula que tenha um padrão tipo "C003, C012, ..."
const top5Cell = fields.find(f => /C\d{3}\s*,\s*C\d{3}/.test(f || ''));
console.log(`\nTop 5 string (col com CSV): ${top5Cell || 'NÃO ACHADA'}`);

// Aplica no banco
const { data: emp } = await sb.from('empresas').select('id').eq('slug', 'macae').single();
const empresaId = emp.id;

// Mapping cod → competencia_id
const { data: comps } = await sb.from('competencias')
  .select('id, cod_comp').eq('empresa_id', empresaId);
const compIdByCod = Object.fromEntries((comps || []).map(c => [c.cod_comp, c.id]));

// Limpa top10 existente do cargo
await sb.from('top10_cargos').delete().eq('empresa_id', empresaId).eq('cargo', 'Diretor(a) Escolar');

let countTop = 0;
for (let i = 0; i < top10.length; i++) {
  const cod = top10[i];
  const compId = compIdByCod[cod];
  if (!compId) { console.log(`  [${i+1}] ${cod}: competência NÃO encontrada`); continue; }
  const { error } = await sb.from('top10_cargos').insert({
    empresa_id: empresaId, cargo: 'Diretor(a) Escolar',
    competencia_id: compId, posicao: i + 1,
  });
  if (!error) { countTop++; console.log(`  [${i+1}] ${cod} ✓`); }
  else console.log(`  [${i+1}] ${cod} erro: ${error.message}`);
}
console.log(`\n✓ Top10: ${countTop}/${top10.length}`);

// Atualiza top5_workshop no cargo
if (top5Cell) {
  const top5Cods = top5Cell.match(/C\d{3}/g) || [];
  await sb.from('cargos_empresa')
    .update({ top5_workshop: top5Cods.join(',') })
    .eq('empresa_id', empresaId).eq('nome', 'Diretor(a) Escolar');
  console.log(`✓ Top5_workshop: ${top5Cods.join(',')}`);
}
