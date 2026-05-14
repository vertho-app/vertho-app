/**
 * Continuação da migração Macaé:
 *   - insere 18 competências (sem ON CONFLICT — usa SELECT-then-INSERT manual)
 *   - vincula top10_cargos
 *   - linka relatórios DISC nos colabs (comportamental_pdf_path)
 *   - insere 67 respostas IA4
 *
 * Idempotente: se já existe, atualiza. Pode rodar várias vezes.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
const env = readFileSync('.env.local', 'utf8').split('\n').filter(l => l && !l.startsWith('#'))
  .reduce((acc, l) => { const i = l.indexOf('='); if (i > 0) acc[l.slice(0, i).trim()] = l.slice(i + 1).trim(); return acc; }, {});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const dump = JSON.parse(readFileSync('outputs/migrar-macae-dump.json', 'utf8'));

// 1. Empresa
const { data: emp } = await sb.from('empresas').select('id').eq('slug', 'macae').single();
const empresaId = emp.id;
console.log(`Empresa: ${empresaId}\n`);

// 2. Competências (insert manual: SELECT existente, depois INSERT ou UPDATE)
const competenciaIdByCod = {};
let countComp = 0;
for (const c of dump.competencias) {
  const { data: exist } = await sb.from('competencias')
    .select('id').eq('empresa_id', empresaId).eq('cod_comp', c.cod_comp).maybeSingle();
  if (exist) {
    competenciaIdByCod[c.cod_comp] = exist.id;
    const { error } = await sb.from('competencias').update({
      nome: c.nome, pilar: c.pilar, cargo: c.cargo, descricao: c.descricao,
      descritor_completo: c.descritor_completo,
      n1_gap: c.n1_gap, n2_desenvolvimento: c.n2_desenvolvimento,
      n3_meta: c.n3_meta, n4_referencia: c.n4_referencia,
    }).eq('id', exist.id);
    if (!error) countComp++;
  } else {
    const { data, error } = await sb.from('competencias').insert({
      empresa_id: empresaId, cod_comp: c.cod_comp, nome: c.nome,
      pilar: c.pilar, cargo: c.cargo, descricao: c.descricao,
      descritor_completo: c.descritor_completo,
      n1_gap: c.n1_gap, n2_desenvolvimento: c.n2_desenvolvimento,
      n3_meta: c.n3_meta, n4_referencia: c.n4_referencia,
    }).select('id').single();
    if (error) { console.error(`  Comp ${c.cod_comp}: ${error.message}`); continue; }
    competenciaIdByCod[c.cod_comp] = data.id;
    countComp++;
  }
}
console.log(`✓ Competências: ${countComp}/${dump.competencias.length}`);

// 3. Top10_cargos
if (dump.cargoIA1) {
  await sb.from('top10_cargos').delete().eq('empresa_id', empresaId).eq('cargo', dump.cargoIA1.nome_cargo);
  let countTop = 0;
  for (const t of dump.cargoIA1.top10_raw) {
    const m = (t.raw || '').match(/^C\d{3}/);
    if (!m) continue;
    const compId = competenciaIdByCod[m[0]];
    if (!compId) continue;
    const { error } = await sb.from('top10_cargos').insert({
      empresa_id: empresaId, cargo: dump.cargoIA1.nome_cargo,
      competencia_id: compId, posicao: t.posicao,
    });
    if (!error) countTop++;
  }
  console.log(`✓ Top10: ${countTop}/${dump.cargoIA1.top10_raw.length}`);
}

// 4. Lookup colab IDs (re-busca do banco)
const { data: colabs } = await sb.from('colaboradores')
  .select('id, email').eq('empresa_id', empresaId);
const colabIdByEmail = Object.fromEntries((colabs || []).map(c => [c.email, c.id]));
console.log(`✓ Colabs lookup: ${Object.keys(colabIdByEmail).length}`);

// 5. Relatórios DISC → comportamental_pdf_path
let countRel = 0, semColabRel = 0;
for (const r of dump.relatorios) {
  const colabId = colabIdByEmail[r.email];
  if (!colabId) { semColabRel++; continue; }
  const { error } = await sb.from('colaboradores').update({
    comportamental_pdf_path: r.drive_url,
  }).eq('id', colabId);
  if (!error) countRel++;
}
console.log(`✓ Relatórios linkados: ${countRel}/${dump.relatorios.length} (${semColabRel} sem colab)`);

// 6. Respostas IA4 (idempotente: deleta as antigas dessa empresa primeiro)
await sb.from('respostas').delete().eq('empresa_id', empresaId);
let countResp = 0, semColab = 0, semComp = 0, erros = 0;
for (const r of dump.respostas) {
  const colabId = colabIdByEmail[r.email];
  if (!colabId) { semColab++; continue; }
  const compId = competenciaIdByCod[r.cod_comp];
  if (!compId) { semComp++; continue; }

  let payloadParsed = null;
  try { payloadParsed = r.payload_ia4_raw ? JSON.parse(r.payload_ia4_raw) : null; } catch { payloadParsed = null; }

  const { error } = await sb.from('respostas').insert({
    empresa_id: empresaId, colaborador_id: colabId, competencia_id: compId,
    competencia_nome: r.nome_comp, email_colaborador: r.email, nome_colaborador: r.nome_colab,
    cargo: r.cargo, whatsapp: r.whatsapp,
    r1: r.r1, r2: r.r2, r3: r.r3, r4: r.r4,
    representatividade: r.representatividade, canal: r.canal,
    nivel_ia4: r.nivel_ia4, nota_ia4: r.nota_ia4, status_ia4: r.status_ia4,
    pontos_fortes: r.pontos_fortes, pontos_atencao: r.pontos_atencao,
    feedback_ia4: r.feedback_ia4, links_academia: r.links_academia,
    payload_ia4: payloadParsed,
    avaliacao_ia: {
      origem: 'gas-legado-macae',
      check: { nota: r.check_nota, status: r.check_status, revisao: r.check_revisao },
    },
    preferencia_pdi: r.preferencia_pdi,
  });
  if (!error) countResp++;
  else { erros++; if (erros <= 3) console.error(`  Resp ${r.email}/${r.cod_comp}: ${error.message}`); }
}
console.log(`✓ Respostas IA4: ${countResp}/${dump.respostas.length} (${semColab} sem colab, ${semComp} sem comp, ${erros} erros)`);

console.log('\n✅ Concluído.');
