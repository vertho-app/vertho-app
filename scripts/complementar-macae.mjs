/**
 * Complementa a migração inicial do GAS Macaé. O markdown do MCP truncou a
 * aba Colaboradores em 45 colabs (linhas 5-49 do xlsx); o xlsx completo tem
 * 59. Os 12 que entraram como "stub" via Respostas IA4 na verdade têm CIS
 * completo no Sheets — vou completar agora.
 *
 * Estratégia:
 *   1. Lê aba "Colaboradores" do xlsx (59 colabs reais)
 *   2. Pra cada um, faz upsert no Vertho:
 *      - Existe (email match) → UPDATE com CIS completo
 *      - Não existe → INSERT
 *   3. Deduplica por email lowercase (Mariane Corrêa aparece 2x no Sheets)
 *
 * Uso:
 *   node scripts/complementar-macae.mjs            # dry-run
 *   node scripts/complementar-macae.mjs --apply
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'fs';
import readXlsxFile from 'read-excel-file/node';

const APPLY = process.argv.includes('--apply');
const SOURCE = 'C:/Users/rdnav/.claude/projects/C--GAS-Vertho-App/085a7ccd-427e-4c76-ab31-f7b955f9dca8/tool-results/mcp-claude_ai_Google_Drive-download_file_content-1778777782959.txt';

const env = readFileSync('.env.local', 'utf8').split('\n').filter(l => l && !l.startsWith('#'))
  .reduce((acc, l) => { const i = l.indexOf('='); if (i > 0) acc[l.slice(0, i).trim()] = l.slice(i + 1).trim(); return acc; }, {});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// Decodifica xlsx
const j = JSON.parse(readFileSync(SOURCE, 'utf8'));
const buf = Buffer.from(j.content, 'base64');
const TMP = '/tmp/macae.xlsx';
writeFileSync(TMP, buf);
const all = await readXlsxFile(TMP);
const colabSheet = all.find(a => a.sheet === 'Colaboradores');
if (!colabSheet) { console.error('Aba Colaboradores não encontrada'); process.exit(1); }

// Helpers
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

// Aba Colaboradores: linha 1-4 são headers, dados começam na linha 5 (idx 4)
const rows = colabSheet.data;
const dataRows = rows.slice(4); // ignora 4 primeiras (headers de categoria + sub-headers)

console.log(`\nXLSX aba Colaboradores: ${rows.length} linhas totais, ${dataRows.length} potencialmente colabs\n`);

// Inspeciona header pra mapear colunas. Linha 4 (idx 3) tem o header nomeado.
const header = rows[3] || [];
console.log('Header (linha 4):');
header.slice(0, 50).forEach((h, i) => { if (h) console.log(`  col${i}: ${String(h).slice(0, 50).replace(/\n/g, ' ')}`); });

// Mapeia colabs
const colabs = dataRows.map(row => {
  if (!row || !row[1] || !row[6]) return null; // sem nome ou sem email
  const email = normalizeEmail(row[6]);
  if (!email || !/@/.test(email)) return null;
  return {
    id_legado: safe(row[0]),
    nome_completo: safe(row[1]),
    empresa_cliente: safe(row[2]),
    cargo: safe(row[3]) || 'Diretor(a) Escolar',
    area_depto: safe(row[4]),
    telefone: normalizePhone(row[5]),
    email,
    gestor_nome: safe(row[7]),     // "Samuel" = consultor Vertho (não gestor real)
    gestor_email: normalizeEmail(row[8]),
    status_programa: safe(row[9]),
    data_inicio: safe(row[10]),
    data_rediag: safe(row[11]),
    perfil_dominante: safe(row[12]),
    // DISC natural (cols 13-16)
    d_natural: num(row[13]), i_natural: num(row[14]), s_natural: num(row[15]), c_natural: num(row[16]),
    // Traços CIS (cols 21+)
    lid_executivo: num(row[21]), lid_motivador: num(row[22]),
    lid_metodico: num(row[23]), lid_sistematico: num(row[24]),
    val_estetico: num(row[25]), val_economico: num(row[26]),
    val_politico: num(row[27]), val_religioso: num(row[28]),
    val_social: num(row[29]), val_teorico: num(row[30]),
    comp_ousadia: num(row[31]), comp_comando: num(row[32]),
    comp_objetividade: num(row[33]), comp_assertividade: num(row[34]),
    comp_persuasao: num(row[35]), comp_extroversao: num(row[36]),
    comp_entusiasmo: num(row[37]), comp_sociabilidade: num(row[38]),
    comp_empatia: num(row[39]), comp_paciencia: num(row[40]),
    comp_persistencia: num(row[41]), comp_planejamento: num(row[42]),
    comp_organizacao: num(row[43]), comp_detalhismo: num(row[44]),
    comp_prudencia: num(row[45]), comp_concentracao: num(row[46]),
  };
}).filter(Boolean);

// Dedup por email (mantém o mais completo — mais campos preenchidos)
const byEmail = {};
for (const c of colabs) {
  const prev = byEmail[c.email];
  const score = (x) => Object.values(x).filter(v => v != null && v !== '').length;
  if (!prev || score(c) > score(prev)) byEmail[c.email] = c;
}
const colabsDedup = Object.values(byEmail);

console.log(`\n${colabs.length} colabs com email | ${colabsDedup.length} após dedup`);
const dups = colabs.length - colabsDedup.length;
if (dups > 0) {
  console.log(`Removidas ${dups} duplicatas (mesmo email)`);
}

console.log(`\nLista (após dedup, ordem do Sheets):`);
colabsDedup.forEach((c, i) => {
  console.log(`  [${String(i+1).padStart(2)}] ${c.nome_completo.padEnd(50)} | ${c.email}`);
});

writeFileSync('outputs/complementar-macae-dump.json', JSON.stringify(colabsDedup, null, 2));
console.log('\n💾 Dump em outputs/complementar-macae-dump.json');

if (!APPLY) {
  console.log('\nDRY-RUN. Pra aplicar: --apply');
  process.exit(0);
}

// ─── Apply ────────────────────────────────────────────────────────────────
console.log('\n🚀 Aplicando...\n');

const { data: emp } = await sb.from('empresas').select('id').eq('slug', 'macae').single();
const empresaId = emp.id;
console.log(`Empresa: ${empresaId}`);

let countUp = 0, countIn = 0, erros = 0;
for (const c of colabsDedup) {
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
  };

  // Tenta upsert por (empresa_id, email)
  const { data: exist } = await sb.from('colaboradores')
    .select('id').eq('empresa_id', empresaId).eq('email', c.email).maybeSingle();
  if (exist) {
    const { error } = await sb.from('colaboradores').update(payload).eq('id', exist.id);
    if (error) { erros++; console.error(`  ${c.email}: ${error.message}`); }
    else countUp++;
  } else {
    const { error } = await sb.from('colaboradores').insert(payload);
    if (error) { erros++; console.error(`  ${c.email}: ${error.message}`); }
    else countIn++;
  }
}
console.log(`\n✓ Updates: ${countUp} | Inserts: ${countIn} | Erros: ${erros}`);
console.log(`Total colabs no Vertho agora: ${countUp + countIn} (esperado ${colabsDedup.length})`);

// Validação final
const { count } = await sb.from('colaboradores').select('*', { count: 'exact', head: true }).eq('empresa_id', empresaId);
const { count: comCIS } = await sb.from('colaboradores').select('*', { count: 'exact', head: true })
  .eq('empresa_id', empresaId).not('d_natural', 'is', null);
console.log(`\n📊 Final: ${count} colabs, ${comCIS} com DISC completo`);
