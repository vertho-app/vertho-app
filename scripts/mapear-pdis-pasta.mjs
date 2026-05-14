/**
 * Mapeia os 13 colabs faltantes pelos PDFs da pasta `PDIs Gerados Template`
 * via similarity de nome. Saída: lista de { colabEmail, nomeColab, fileId, tituloPDF }.
 */
import { readFileSync, writeFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

const env = readFileSync('.env.local', 'utf8').split('\n').filter(l => l && !l.startsWith('#'))
  .reduce((acc, l) => { const i = l.indexOf('='); if (i > 0) acc[l.slice(0, i).trim()] = l.slice(i + 1).trim(); return acc; }, {});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// Lê os 60 PDFs da pasta
const FOLDER = 'C:/Users/rdnav/.claude/projects/C--GAS-Vertho-App/085a7ccd-427e-4c76-ab31-f7b955f9dca8/tool-results/mcp-claude_ai_Google_Drive-search_files-1778782616727.txt';
const folder = JSON.parse(readFileSync(FOLDER, 'utf8'));
const pdfsNaPasta = (folder.files || []).map(f => ({
  fileId: f.id,
  titulo: f.title,
  // extrai nome: "PDI_Descritor - {NOME}.pdf"
  nome: (f.title || '').replace(/^PDI_Descritor\s*-\s*/i, '').replace(/\.pdf$/i, '').trim(),
}));
console.log(`${pdfsNaPasta.length} PDFs na pasta`);

const FALTANTES_EMAIL = [
  'fabianalopes.magalhaes@gmail.com', 'vitorinoeduc@gmail.com', 'elis10101974@gmail.com',
  'patriciacoutinho.39387@gestao.macae.rj.gov.br', 'bio.eccard@hotmail.com',
  'crispetruccidias@gmail.com', 'alessandrabesada10@hotmail.com', 'joanamuzi1@gmail.com',
  'emeiangelamariafelix@gmail.com', 'aline.rigueira@hotmail.com', 'cleidimarf14@gmail.com',
  'almirf.lapa@gmail.com', 'pizzoelisangela@gmail.com',
];

// Lookup colab no banco
const { data: emp } = await sb.from('empresas').select('id').eq('slug', 'macae').single();
const { data: colabs } = await sb.from('colaboradores').select('id, email, nome_completo')
  .eq('empresa_id', emp.id).in('email', FALTANTES_EMAIL);

const normalize = (s) => String(s || '').toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();

// Pra cada colab faltante, procura match pelo nome no array de PDFs
console.log('\n━━━ Matching ━━━\n');
const matches = [];
for (const c of colabs) {
  const nomeNorm = normalize(c.nome_completo);
  const nomePartes = nomeNorm.split(' ').filter(p => p.length > 3);
  // Score: quantos pedaços do nome do colab estão no nome do PDF
  const cands = pdfsNaPasta.map(p => {
    const pNorm = normalize(p.nome);
    let score = 0;
    for (const parte of nomePartes) if (pNorm.includes(parte)) score++;
    return { pdf: p, score };
  }).filter(c => c.score >= Math.min(2, nomePartes.length))
    .sort((a, b) => b.score - a.score);

  if (cands.length === 0) {
    console.log(`  ❌ ${c.nome_completo} — nenhum match`);
  } else {
    const best = cands[0];
    matches.push({ colabId: c.id, email: c.email, nome: c.nome_completo, fileId: best.pdf.fileId, titulo: best.pdf.titulo, score: best.score });
    console.log(`  ✓ ${c.nome_completo}`);
    console.log(`     → ${best.pdf.titulo} (score ${best.score}, id=${best.pdf.fileId})`);
    if (cands.length > 1) {
      cands.slice(1, 3).forEach(c => console.log(`         alt: ${c.pdf.titulo} (score ${c.score})`));
    }
  }
}

writeFileSync('outputs/matches-pdis.json', JSON.stringify(matches, null, 2));
console.log(`\n💾 ${matches.length} matches salvos em outputs/matches-pdis.json`);
