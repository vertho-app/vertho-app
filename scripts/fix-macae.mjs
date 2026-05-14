import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
const env = readFileSync('.env.local', 'utf8').split('\n').filter(l => l && !l.startsWith('#'))
  .reduce((acc, l) => { const i = l.indexOf('='); if (i > 0) acc[l.slice(0, i).trim()] = l.slice(i + 1).trim(); return acc; }, {});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// 1. Atualiza nome da empresa
const NOME_NOVO = 'Secretaria Municipal de Educação de Macaé/RJ';
const { data: empUpd, error: e1 } = await sb.from('empresas')
  .update({ nome: NOME_NOVO })
  .eq('slug', 'macae').select('id, nome').single();
if (e1) console.error('Erro update empresa:', e1.message);
else console.log(`✓ Empresa renomeada: "${empUpd.nome}"`);

// 2. Identifica colabs sem DISC
const { data: semDISC } = await sb.from('colaboradores')
  .select('id, nome_completo, email, perfil_dominante, d_natural')
  .eq('empresa_id', empUpd.id)
  .is('d_natural', null);
console.log(`\n━━━ Colabs sem DISC completo (${semDISC.length}) ━━━\n`);
semDISC?.forEach((c, i) => {
  console.log(`  [${i+1}] ${c.nome_completo.padEnd(50)} | ${c.email}`);
});
