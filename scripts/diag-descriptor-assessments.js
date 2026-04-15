// Diagnostico: descobrir por que descriptor_assessments esta vazio
// para um colab+competencia. Rode com:
//   node scripts/diag-descriptor-assessments.js <email-do-colab>

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf-8')
    .split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).replace(/^["']|["']$/g, '')]; })
);

const url = env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const sb = createClient(url, key, { auth: { persistSession: false } });

const email = (process.argv[2] || '').toLowerCase().trim();
if (!email) { console.error('Uso: node scripts/diag-descriptor-assessments.js <email>'); process.exit(1); }

// Aceita email OU nome (via ilike)
const { data: colabs } = await sb.from('colaboradores')
  .select('id, nome_completo, email, cargo, empresa_id')
  .or(`email.ilike.${email},nome_completo.ilike.%${email}%`);
console.log(`\nEncontrados ${colabs?.length || 0} colabs — processando TODOS:`);
for (const c of colabs || []) console.log(` • ${c.nome_completo} (${c.cargo}) / empresa ${c.empresa_id}`);
const colab = colabs?.find(c => (c.nome_completo || '').toLowerCase().includes('gmail')) || colabs?.[0];
if (!colab) { console.error('Colaborador nao encontrado:', email); process.exit(1); }
console.log('\n== COLAB ==');
console.log(colab);

const { data: respostas } = await sb.from('respostas')
  .select('id, competencia_nome, competencia_id, nivel_ia4, nota_ia4, status_ia4, avaliacao_ia, colaborador_id, email_colaborador')
  .eq('empresa_id', colab.empresa_id)
  .or(`colaborador_id.eq.${colab.id},email_colaborador.eq.${email}`);

console.log(`\n== RESPOSTAS (${respostas?.length || 0}) ==`);
for (const r of respostas || []) {
  const av = typeof r.avaliacao_ia === 'string' ? JSON.parse(r.avaliacao_ia) : r.avaliacao_ia;
  const cons = av?.consolidacao || {};
  const notasDesc = cons.notas_por_descritor || {};
  const descCount = Object.keys(notasDesc).length;
  console.log(`- ${r.competencia_nome || '(sem nome)'} | nivel_ia4=${r.nivel_ia4} nota=${r.nota_ia4} | colab_id=${r.colaborador_id ? 'OK' : 'NULL'} | notas_por_descritor=${descCount}`);
  if (descCount > 0) {
    const amostra = Object.values(notasDesc).slice(0, 2)
      .map(d => `${d.nome || d.descritor || '?'}=${d.nota_decimal ?? d.nota ?? '?'}`).join(' | ');
    console.log(`   amostra: ${amostra}`);
  }
}

const { data: da } = await sb.from('descriptor_assessments')
  .select('competencia, descritor, nota, origem, atualizado_em').eq('colaborador_id', colab.id);
console.log(`\n== DESCRIPTOR_ASSESSMENTS (${da?.length || 0}) ==`);
const porComp = {};
for (const d of da || []) {
  porComp[d.competencia] = (porComp[d.competencia] || 0) + 1;
}
for (const [c, n] of Object.entries(porComp)) console.log(`- ${c}: ${n} descritores`);

const { data: cargoEmp } = await sb.from('cargos_empresa')
  .select('top5_workshop').eq('empresa_id', colab.empresa_id).eq('nome', colab.cargo).maybeSingle();
console.log(`\n== TOP5 DO CARGO "${colab.cargo}" ==`);
console.log(cargoEmp?.top5_workshop || 'NAO CONFIGURADO');

const nomesResp = new Set((respostas || []).map(r => (r.competencia_nome || '').trim().toLowerCase()));
const nomesTop5 = new Set((cargoEmp?.top5_workshop || []).map(n => n.trim().toLowerCase()));
console.log('\n== DIFF NOMES ==');
console.log('Top5 sem resposta:', [...nomesTop5].filter(n => !nomesResp.has(n)));
console.log('Respostas fora do Top5:', [...nomesResp].filter(n => !nomesTop5.has(n)));
