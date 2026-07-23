/**
 * Migração GAS → Vertho — Prefeitura de Macaé / SEDUC
 *
 * Schema-aware (validado contra Supabase em 2026-05-14):
 *   - colaboradores tem campos diretos: d_natural, comp_*, lid_*, val_*, tp_*
 *   - respostas tem avaliacao_ia jsonb + r1/r2/r3/r4 + nivel_ia4 + nota_ia4
 *   - cargos_empresa tem ia1_resultado jsonb + top5_workshop
 *
 * Uso:
 *   node scripts/migrar-macae.mjs            # dry-run
 *   node scripts/migrar-macae.mjs --apply    # escreve no Supabase
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'fs';

const SOURCE = 'C:/Users/rdnav/.claude/projects/C--GAS-Vertho-App/085a7ccd-427e-4c76-ab31-f7b955f9dca8/tool-results/mcp-claude_ai_Google_Drive-read_file_content-1778775713096.txt';
const APPLY = process.argv.includes('--apply');

const env = readFileSync('.env.local', 'utf8').split('\n').filter(l => l && !l.startsWith('#'))
  .reduce((acc, l) => { const i = l.indexOf('='); if (i > 0) acc[l.slice(0, i).trim()] = l.slice(i + 1).trim(); return acc; }, {});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const j = JSON.parse(readFileSync(SOURCE, 'utf8'));
const lines = j.fileContent.split('\n');
const seps = [];
lines.forEach((l, i) => { if (/^\|\s*:-/.test(l.trim())) seps.push(i); });

function tab(n) {
  const i = n - 1;
  const sepIdx = seps[i];
  const dataStart = sepIdx + 1;
  const dataEnd = (i + 1 < seps.length) ? seps[i + 1] - 2 : lines.length;
  const data = lines.slice(dataStart, dataEnd).filter(l => l.trim() && l.trim().startsWith('|'));
  return { header: lines[sepIdx - 1] || '', data };
}
function parseRow(rowStr) {
  return rowStr.split('|').map(s => s.trim()).slice(1, -1)
    .map(s => s.replace(/&#10;/g, '\n').replace(/\\([_])/g, '$1'));
}
const normalizePhone = (raw) => {
  if (!raw) return null;
  const d = String(raw).replace(/\D/g, '');
  if (!d) return null;
  if (d.startsWith('55') && d.length >= 12) return `+${d}`;
  if (d.length === 10 || d.length === 11) return `+55${d}`;
  return `+${d}`;
};
const normalizeEmail = (r) => r ? String(r).toLowerCase().trim() : null;
const num = (v) => { if (v == null || v === '') return null; const n = Number(String(v).replace(',', '.')); return Number.isFinite(n) ? n : null; };
const safe = (s) => s ? String(s).trim() : null;

// ───────────────────────────────────────────────────────────────────────────
// Parsers
// ───────────────────────────────────────────────────────────────────────────

function parseCompetencias() {
  const t = tab(1);
  return t.data.map(parseRow).map(c => ({
    cod_comp: c[0],
    nome: c[1],
    pilar: c[2] || null,                      // categoria → pilar
    cargo: c[3] || null,
    descricao: c[4] || null,
    descritor_completo: c[5] || null,         // descritores comportamentais
    n1_gap: c[6] || null,
    n2_desenvolvimento: c[7] || null,
    n3_meta: c[8] || null,
    n4_referencia: c[9] || null,
  })).filter(c => c.cod_comp && c.nome);
}

function parseCargoIA1() {
  const t = tab(21);
  if (!t.data.length) return null;
  const c = parseRow(t.data[0]);
  // Top 10 → pares (cod_comp, nome) nas cols 10..19. Mas o padrão é: col10=C003, col11=LIDERANÇA, col12=justif, col13=C012, col14=GESTÃO PED, col15=justif...
  // Olha de novo o sample: col10=C003, col11=LIDERANÇA, col12=Essencial..., col13=C012, col14=GESTÃO PEDAG, col15=Diretamente..., col16=Cxxx, col17=NOME, col18=just, ...
  // Cada comp ocupa 3 colunas: cod + nome + justificativa? Vou interpretar como 10 comps em 10 colunas mas cada uma é um cod.
  // Na verdade Top 10 está nas col10..col19 (10 cells). Vou ler cada uma como cod_comp puro.
  const top10 = [];
  for (let i = 0; i < 10; i++) {
    const v = (c[10 + i] || '').trim();
    if (v) top10.push({ posicao: i + 1, raw: v });
  }
  return {
    cod_cargo: c[0],
    nome_cargo: c[2],
    area_depto: c[3],
    descricao: c[4],
    principais_entregas: c[5],
    valores: c[6],
    contexto_cultural: c[7],
    top10_raw: top10,
    top5_string: c[20] || null,
  };
}

function parseColaboradores() {
  // Tab 17 com merged-cells: pula 2 primeiras linhas (categoria + sub-header)
  const t = tab(17);
  const dataRows = t.data.slice(2);
  return dataRows.map(parseRow).map(c => ({
    id_legado: c[0] || null,
    nome_completo: safe(c[1]),
    empresa_cliente: safe(c[2]),
    cargo: safe(c[3]) || 'Diretor(a) Escolar',
    area_depto: safe(c[4]),
    telefone: normalizePhone(c[5]),
    email: normalizeEmail(c[6]),
    consultor_nome: safe(c[7]),
    consultor_email: normalizeEmail(c[8]),
    status_programa: safe(c[9]),
    data_inicio: safe(c[10]),
    data_rediag: safe(c[11]),
    perfil_dominante: safe(c[12]),
    // DISC natural (cols 13-16)
    d_natural: num(c[13]), i_natural: num(c[14]), s_natural: num(c[15]), c_natural: num(c[16]),
    // Traços CIS (cols 21-36+, mapping abaixo)
    lid_executivo: num(c[21]),
    lid_motivador: num(c[22]),
    lid_metodico: num(c[23]),
    lid_sistematico: num(c[24]),
    val_estetico: num(c[25]),
    val_economico: num(c[26]),
    val_politico: num(c[27]),
    val_religioso: num(c[28]),
    val_social: num(c[29]),
    val_teorico: num(c[30]),
    comp_ousadia: num(c[31]),
    comp_comando: num(c[32]),
    comp_objetividade: num(c[33]),
    comp_assertividade: num(c[34]),
    comp_persuasao: num(c[35]),
    comp_extroversao: num(c[36]),
    comp_entusiasmo: num(c[37]),
    comp_sociabilidade: num(c[38]),
    comp_empatia: num(c[39]),
    comp_paciencia: num(c[40]),
    comp_persistencia: num(c[41]),
    comp_planejamento: num(c[42]),
    comp_organizacao: num(c[43]),
    comp_detalhismo: num(c[44]),
    comp_prudencia: num(c[45]),
    comp_concentracao: num(c[46]),
  })).filter(c => c.email && c.nome_completo);
}

function parseRespostasIA4() {
  const t = tab(24);
  return t.data.map(parseRow).map(c => ({
    timestamp: c[0],
    email: normalizeEmail(c[1]),
    nome_colab: c[2],
    empresa: c[3],
    cargo: c[4],
    cod_comp: c[5],
    nome_comp: c[6],
    preferencia_pdi: c[7],
    whatsapp: normalizePhone(c[8]),
    r1: c[9], r2: c[10], r3: c[11], r4: c[12],
    representatividade: num(c[13]),
    canal: c[14],
    status_ia4: c[15],
    nivel_ia4: c[16],
    nota_ia4: num(c[17]),
    pontos_fortes: c[18],
    pontos_atencao: c[19],
    feedback_ia4: c[20],
    links_academia: c[21],
    payload_ia4_raw: c[22],
    check_nota: num(c[23]),
    check_status: c[24],
    check_revisao: c[25],
    data_avaliacao: c[26],
  })).filter(r => r.email);
}

function parseRelatoriosDISC() {
  const t = tab(18);
  return t.data.map(parseRow).map(c => ({
    email: normalizeEmail(c[0]),
    nome: c[1],
    cargo: c[2],
    data_geracao: c[3],
    status: c[4],
    drive_url: c[5],
    qtd_competencias: num(c[6]),
  })).filter(r => r.email && r.drive_url);
}

// ───────────────────────────────────────────────────────────────────────────
// Main
// ───────────────────────────────────────────────────────────────────────────

console.log(`\n┌─ Migração GAS → Vertho · Macaé ${APPLY ? '· APLICANDO' : '· DRY-RUN'}`);
console.log(`└─ ${new Date().toISOString()}\n`);

const competencias = parseCompetencias();
const cargoIA1 = parseCargoIA1();
const colaboradores = parseColaboradores();
const respostas = parseRespostasIA4();
const relatorios = parseRelatoriosDISC();

// Identifica órfãos (email em respostas mas NÃO em colabs)
const emailsColab = new Set(colaboradores.map(c => c.email));
const orfaosByEmail = {};
respostas.forEach(r => {
  if (!emailsColab.has(r.email)) {
    if (!orfaosByEmail[r.email]) {
      orfaosByEmail[r.email] = {
        email: r.email,
        nome_completo: r.nome_colab,
        cargo: r.cargo || 'Diretor(a) Escolar',
        telefone: r.whatsapp,
        origem: 'orfao_resposta',
      };
    }
  }
});
const orfaos = Object.values(orfaosByEmail);

console.log('📊 Parsed:');
console.log(`  · ${competencias.length} competências (Tab 1)`);
console.log(`  · ${cargoIA1 ? 1 : 0} cargo IA1 (Tab 21)`);
console.log(`  · ${colaboradores.length} colaboradores CIS (Tab 17)`);
console.log(`  · ${orfaos.length} colab stubs (sem CIS, só responderam IA4)`);
console.log(`  · ${respostas.length} respostas IA4 (Tab 24)`);
console.log(`  · ${relatorios.length} relatórios DISC (Tab 18)`);
console.log(`  · ${colaboradores.length + orfaos.length} colabs no total → vão pro Vertho\n`);

const dump = { competencias, cargoIA1, colaboradores, orfaos, respostas, relatorios };
writeFileSync('outputs/migrar-macae-dump.json', JSON.stringify(dump, null, 2));
console.log('💾 Dump em outputs/migrar-macae-dump.json\n');

if (!APPLY) {
  console.log('Sample colab 1:');
  console.log(JSON.stringify(colaboradores[0], null, 2));
  console.log('\nDRY-RUN. Pra aplicar: --apply');
  process.exit(0);
}

// ───────────────────────────────────────────────────────────────────────────
// APPLY
// ───────────────────────────────────────────────────────────────────────────

console.log('🚀 Aplicando...\n');

const SLUG = 'macae';
const NOME_EMPRESA = 'Educação Municipal de Macaé';

// 1. Empresa
const { data: existEmp } = await sb.from('empresas').select('id').eq('slug', SLUG).maybeSingle();
let empresaId;
if (existEmp) {
  empresaId = existEmp.id;
  console.log(`✓ Empresa existe: ${empresaId}`);
} else {
  const { data, error } = await sb.from('empresas').insert({
    nome: NOME_EMPRESA, slug: SLUG, segmento: 'educacao',
    sys_config: { origem: 'gas-legado-macae', migrado_em: new Date().toISOString() },
  }).select('id').single();
  if (error) { console.error('Erro empresa:', error); process.exit(1); }
  empresaId = data.id;
  console.log(`✓ Empresa criada: ${empresaId}`);
}

// 2. Cargo
const ia1Json = cargoIA1 ? {
  cod_cargo: cargoIA1.cod_cargo, valores: cargoIA1.valores,
  top10_raw: cargoIA1.top10_raw, origem: 'gas-legado-macae',
} : null;
if (cargoIA1) {
  const { error } = await sb.from('cargos_empresa').upsert({
    empresa_id: empresaId, nome: cargoIA1.nome_cargo, area_depto: cargoIA1.area_depto,
    descricao: cargoIA1.descricao, principais_entregas: cargoIA1.principais_entregas,
    contexto_cultural: cargoIA1.contexto_cultural,
    top5_workshop: cargoIA1.top5_string,
    ia1_resultado: ia1Json,
    eh_lideranca: true,
  }, { onConflict: 'empresa_id,nome' });
  if (error) console.error('Erro cargo:', error.message);
  else console.log(`✓ Cargo: ${cargoIA1.nome_cargo}`);
}

// 3. Competências (1 por linha, upsert)
let countComp = 0;
const competenciaIdByCod = {};
for (const c of competencias) {
  const { data, error } = await sb.from('competencias').upsert({
    empresa_id: empresaId, cod_comp: c.cod_comp, nome: c.nome,
    pilar: c.pilar, cargo: c.cargo, descricao: c.descricao,
    descritor_completo: c.descritor_completo,
    n1_gap: c.n1_gap, n2_desenvolvimento: c.n2_desenvolvimento,
    n3_meta: c.n3_meta, n4_referencia: c.n4_referencia,
  }, { onConflict: 'empresa_id,cod_comp' }).select('id, cod_comp').single();
  if (error) { console.error(`  Comp ${c.cod_comp}: ${error.message}`); continue; }
  competenciaIdByCod[c.cod_comp] = data.id;
  countComp++;
}
console.log(`✓ Competências: ${countComp}/${competencias.length}`);

// 4. Top10_cargos (vincula UUIDs)
if (cargoIA1) {
  // limpa top10 existente
  await sb.from('top10_cargos').delete().eq('empresa_id', empresaId).eq('cargo', cargoIA1.nome_cargo);
  let countTop = 0;
  for (const t of cargoIA1.top10_raw) {
    // O `raw` pode ser "C003" ou "C003 LIDERANÇA" — pega só o cod
    const codMatch = (t.raw || '').match(/^C\d{3}/);
    if (!codMatch) continue;
    const compId = competenciaIdByCod[codMatch[0]];
    if (!compId) continue;
    const { error } = await sb.from('top10_cargos').insert({
      empresa_id: empresaId, cargo: cargoIA1.nome_cargo,
      competencia_id: compId, posicao: t.posicao,
    });
    if (!error) countTop++;
  }
  console.log(`✓ Top10: ${countTop}/${cargoIA1.top10_raw.length}`);
}

// 5. Colaboradores CIS (Tab 17)
let countColab = 0;
const colabIdByEmail = {};
for (const c of colaboradores) {
  const payload = {
    empresa_id: empresaId, nome_completo: c.nome_completo, email: c.email,
    cargo: c.cargo, area_depto: c.area_depto, telefone: c.telefone,
    perfil_dominante: c.perfil_dominante, role: 'colaborador',
    d_natural: c.d_natural, i_natural: c.i_natural, s_natural: c.s_natural, c_natural: c.c_natural,
    lid_executivo: c.lid_executivo, lid_motivador: c.lid_motivador,
    lid_metodico: c.lid_metodico, lid_sistematico: c.lid_sistematico,
    val_estetico: c.val_estetico, val_economico: c.val_economico,
    val_politico: c.val_politico, val_religioso: c.val_religioso,
    val_social: c.val_social, val_teorico: c.val_teorico,
    comp_ousadia: c.comp_ousadia, comp_comando: c.comp_comando,
    comp_objetividade: c.comp_objetividade, comp_assertividade: c.comp_assertividade,
    comp_persuasao: c.comp_persuasao, comp_extroversao: c.comp_extroversao,
    comp_entusiasmo: c.comp_entusiasmo, comp_sociabilidade: c.comp_sociabilidade,
    comp_empatia: c.comp_empatia, comp_paciencia: c.comp_paciencia,
    comp_persistencia: c.comp_persistencia, comp_planejamento: c.comp_planejamento,
    comp_organizacao: c.comp_organizacao, comp_detalhismo: c.comp_detalhismo,
    comp_prudencia: c.comp_prudencia, comp_concentracao: c.comp_concentracao,
    mapeamento_em: c.data_inicio || null,
  };
  const { data, error } = await sb.from('colaboradores').upsert(payload, { onConflict: 'empresa_id,email' })
    .select('id, email').single();
  if (error) { console.error(`  Colab ${c.email}: ${error.message}`); continue; }
  colabIdByEmail[c.email] = data.id;
  countColab++;
}
console.log(`✓ Colabs CIS: ${countColab}/${colaboradores.length}`);

// 6. Colabs órfãos (stubs — só responderam IA4)
let countOrfao = 0;
for (const o of orfaos) {
  const { data, error } = await sb.from('colaboradores').upsert({
    empresa_id: empresaId, nome_completo: o.nome_completo, email: o.email,
    cargo: o.cargo, telefone: o.telefone, role: 'colaborador',
  }, { onConflict: 'empresa_id,email' }).select('id, email').single();
  if (error) { console.error(`  Órfão ${o.email}: ${error.message}`); continue; }
  colabIdByEmail[o.email] = data.id;
  countOrfao++;
}
console.log(`✓ Colabs stub (sem CIS): ${countOrfao}/${orfaos.length}`);

// 7. Relatórios DISC → comportamental_pdf_path
let countRel = 0;
for (const r of relatorios) {
  const colabId = colabIdByEmail[r.email];
  if (!colabId) continue;
  const { error } = await sb.from('colaboradores').update({
    comportamental_pdf_path: r.drive_url,
    report_generated_at: r.data_geracao || null,
  }).eq('id', colabId);
  if (!error) countRel++;
}
console.log(`✓ Relatórios linkados: ${countRel}/${relatorios.length}`);

// 8. Respostas IA4
let countResp = 0, semColab = 0, semComp = 0, erros = 0;
for (const r of respostas) {
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
    timestamp_resposta: r.timestamp || null,
    avaliado_em: r.data_avaliacao || null,
    preferencia_pdi: r.preferencia_pdi,
  });
  if (!error) countResp++;
  else { erros++; if (erros <= 3) console.error(`  Resp ${r.email}/${r.cod_comp}: ${error.message}`); }
}
console.log(`✓ Respostas IA4: ${countResp}/${respostas.length} (${semColab} sem colab, ${semComp} sem comp, ${erros} erros)`);

console.log(`\n✅ Migração concluída.`);
console.log(`Empresa: macae.vertho.ai (depois de vincular subdomínio)`);
console.log(`Admin via platform_admins: rodrigo@vertho.ai (já tem acesso)`);
