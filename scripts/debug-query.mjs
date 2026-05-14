import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
const env = readFileSync('.env.local', 'utf8').split('\n').filter(l => l && !l.startsWith('#'))
  .reduce((acc, l) => { const i = l.indexOf('='); if (i > 0) acc[l.slice(0, i).trim()] = l.slice(i + 1).trim(); return acc; }, {});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

console.log('\n━━━ Validação final · Macaé ━━━\n');

const { data: emp } = await sb.from('empresas').select('id, nome, slug').eq('slug', 'macae').single();
console.log(`Empresa: ${emp.nome} (slug=${emp.slug}, id=${emp.id})`);

const { count: nColabs } = await sb.from('colaboradores').select('*', { count: 'exact', head: true }).eq('empresa_id', emp.id);
const { count: nComCIS } = await sb.from('colaboradores').select('*', { count: 'exact', head: true }).eq('empresa_id', emp.id).not('d_natural', 'is', null);
const { count: nComPDF } = await sb.from('colaboradores').select('*', { count: 'exact', head: true }).eq('empresa_id', emp.id).not('comportamental_pdf_path', 'is', null);
console.log(`Colaboradores: ${nColabs} (${nComCIS} com DISC, ${nComPDF} com relatório PDF)`);

const { count: nComps } = await sb.from('competencias').select('*', { count: 'exact', head: true }).eq('empresa_id', emp.id);
const { count: nTop10 } = await sb.from('top10_cargos').select('*', { count: 'exact', head: true }).eq('empresa_id', emp.id);
console.log(`Competências: ${nComps}`);
console.log(`Top 10 cargo: ${nTop10}`);

const { count: nResp } = await sb.from('respostas').select('*', { count: 'exact', head: true }).eq('empresa_id', emp.id);
const { count: nRespAval } = await sb.from('respostas').select('*', { count: 'exact', head: true }).eq('empresa_id', emp.id).not('nota_ia4', 'is', null);
console.log(`Respostas IA4: ${nResp} (${nRespAval} com nota IA4)`);

console.log('\n━━━ Amostra · Top 5 colabs por perfil dominante ━━━\n');
const { data: amostra } = await sb.from('colaboradores')
  .select('nome_completo, perfil_dominante, d_natural, i_natural, s_natural, c_natural')
  .eq('empresa_id', emp.id).not('d_natural', 'is', null)
  .order('nome_completo').limit(5);
console.table(amostra);

console.log('\n━━━ Distribuição DISC ━━━\n');
const { data: disc } = await sb.from('colaboradores')
  .select('perfil_dominante').eq('empresa_id', emp.id).not('perfil_dominante', 'is', null);
const distr = (disc || []).reduce((acc, c) => { acc[c.perfil_dominante] = (acc[c.perfil_dominante] || 0) + 1; return acc; }, {});
console.log(distr);
