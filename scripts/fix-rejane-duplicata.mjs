import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
const env = readFileSync('.env.local', 'utf8').split('\n').filter(l => l && !l.startsWith('#'))
  .reduce((acc, l) => { const i = l.indexOf('='); if (i > 0) acc[l.slice(0, i).trim()] = l.slice(i + 1).trim(); return acc; }, {});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const STUB_ID = '35c84738-20f5-428f-b116-2972235dd206'; // rejanealves...rj.gov.br (stub, sem DISC)
const REAL_ID = '3ab5217e-3cd6-4646-a863-297b428ae292'; // rejanealves...gov.br (com DISC)

// 1. Conta respostas no stub
const { data: stubResp, count: stubCount } = await sb.from('respostas')
  .select('id, competencia_id, competencia_nome', { count: 'exact' })
  .eq('colaborador_id', STUB_ID);
console.log(`Stub Rejane (.rj.gov.br): ${stubCount} respostas`);

// 2. Conta respostas no real
const { count: realCount } = await sb.from('respostas')
  .select('*', { count: 'exact', head: true })
  .eq('colaborador_id', REAL_ID);
console.log(`Real Rejane (.gov.br): ${realCount} respostas`);

// 3. Move respostas do stub pro real
if (stubCount > 0) {
  const { error } = await sb.from('respostas')
    .update({ colaborador_id: REAL_ID })
    .eq('colaborador_id', STUB_ID);
  if (error) { console.error('Erro mover respostas:', error.message); process.exit(1); }
  console.log(`✓ Movidas ${stubCount} respostas pro real`);
}

// 4. Deleta stub
const { error: delErr } = await sb.from('colaboradores').delete().eq('id', STUB_ID);
if (delErr) { console.error('Erro deletar stub:', delErr.message); process.exit(1); }
console.log(`✓ Stub deletado`);

// 5. Validação final
const { count: finalTotal } = await sb.from('colaboradores').select('*', { count: 'exact', head: true })
  .eq('empresa_id', (await sb.from('empresas').select('id').eq('slug', 'macae').single()).data.id);
const { count: finalComDISC } = await sb.from('colaboradores').select('*', { count: 'exact', head: true })
  .eq('empresa_id', (await sb.from('empresas').select('id').eq('slug', 'macae').single()).data.id)
  .not('d_natural', 'is', null);
console.log(`\n📊 Final Macaé: ${finalTotal} colabs, ${finalComDISC} com DISC`);
