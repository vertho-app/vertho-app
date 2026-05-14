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
const colabSheet = all.find(a => a.sheet === 'Colaboradores');

const ALVOS = ['amarildadumasppinto@gmail.com', 'rodrigoroli10@gmail.com', 'rejanealves.23169@gestao.macae.gov.br', 'rejanealves.23169@gestao.macae.rj.gov.br'];

console.log('━━━ Linhas brutas dos 3 sem DISC no xlsx ━━━\n');
colabSheet.data.forEach((row, i) => {
  if (!row || !row[6]) return;
  const email = String(row[6]).toLowerCase().trim();
  if (ALVOS.some(a => email === a || email.includes(a.split('@')[0]))) {
    console.log(`Linha ${i+1}: ${row[1]} (${email})`);
    console.log(`  d_natural=${row[13]} | i_natural=${row[14]} | s_natural=${row[15]} | c_natural=${row[16]}`);
    console.log(`  Perfil dominante=${row[12]}`);
    console.log(`  Total cells preenchidas: ${row.filter(c => c !== null && c !== '').length}/${row.length}`);
    console.log();
  }
});

// Lista todos os emails únicos atualmente no banco
console.log('━━━ Banco: emails contendo "macae.gov" ou "rejane" ━━━');
const { data } = await sb.from('colaboradores').select('id, nome_completo, email, perfil_dominante')
  .eq('empresa_id', (await sb.from('empresas').select('id').eq('slug', 'macae').single()).data.id);

(data || []).filter(c => /rejane|paola|amarild|roli/i.test(c.nome_completo) || /almirf|rejane|amarild|roli/i.test(c.email))
  .forEach(c => console.log(`  ${c.id} | ${c.nome_completo} | ${c.email} | perfil=${c.perfil_dominante}`));
