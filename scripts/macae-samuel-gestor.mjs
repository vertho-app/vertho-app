/**
 * Macaé:
 *   1. Define Samuel Protetti (samuel@vertho.ai) como gestor de todos
 *      os outros colabs da empresa (preenchendo gestor_email/nome/whatsapp).
 *   2. Remove o prefixo `+` dos campos `telefone` dos colabs.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const APPLY = process.argv.includes('--apply');
const env = readFileSync('.env.local', 'utf8').split('\n').filter(l => l && !l.startsWith('#'))
  .reduce((acc, l) => { const i = l.indexOf('='); if (i > 0) acc[l.slice(0, i).trim()] = l.slice(i + 1).trim(); return acc; }, {});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { data: emp } = await sb.from('empresas').select('id').eq('slug', 'macae').single();
const { data: sam } = await sb.from('colaboradores')
  .select('id, nome_completo, email, telefone')
  .eq('empresa_id', emp.id).eq('email', 'samuel@vertho.ai').single();

console.log('Samuel:', sam);

// Telefones com +
const { data: comMais } = await sb.from('colaboradores')
  .select('id, email, telefone').eq('empresa_id', emp.id).ilike('telefone', '+%');
console.log(`\nTelefones com prefixo +: ${comMais.length}`);

if (!APPLY) {
  console.log('\nDRY-RUN. Pra aplicar: --apply');
  console.log('Vai atualizar:');
  console.log(`  - gestor_* de TODOS os colabs (exceto Samuel) → ${sam.nome_completo} / ${sam.email} / ${sam.telefone}`);
  console.log(`  - telefone de ${comMais.length} colabs (remove +)`);
  process.exit(0);
}

// 1. Set gestor em todos exceto Samuel
const { error: e1, count: c1 } = await sb.from('colaboradores')
  .update({
    gestor_nome: sam.nome_completo,
    gestor_email: sam.email,
    gestor_whatsapp: sam.telefone,
  }, { count: 'exact' })
  .eq('empresa_id', emp.id)
  .neq('id', sam.id);
if (e1) { console.error('Erro update gestor:', e1.message); process.exit(1); }
console.log(`✓ Gestor setado em ${c1} colabs`);

// 2. Remove + dos telefones — um por um (Supabase não tem raw regex em update via JS client)
let ok = 0, err = 0;
for (const c of comMais) {
  const novo = c.telefone.replace(/^\+/, '');
  const { error } = await sb.from('colaboradores')
    .update({ telefone: novo })
    .eq('id', c.id);
  if (error) { err++; console.error(` ${c.email}: ${error.message}`); }
  else ok++;
}
console.log(`✓ Telefones limpos: ${ok}, erros: ${err}`);
