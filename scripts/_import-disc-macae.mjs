export {};
process.loadEnvFile('.env.local');
const ExcelJS = (await import('exceljs')).default;
const pg = (await import('pg')).default;
const APPLY = process.argv.includes('--apply');
const EMP = '44b632ae-b7b9-440d-bc74-92cead889d52';
const norm = s => (s||'').toString().normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z ]/g,'').replace(/\s+/g,' ').trim();
const num = (v) => { const n = Number(v?.result ?? v); return Number.isFinite(n) ? n : null; };
const R = (v) => { const n = num(v); return n == null ? null : Math.round(n); };
const R1 = (v) => { const n = num(v); return n == null ? null : Math.round(n*10)/10; };

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile('C:/Users/rdnav/Downloads/PERFIL COMPORTAMENTAL - CISv2.xlsx');
const ws = wb.worksheets[0];
const all = [];
ws.eachRow((row, n) => {
  if (n === 1) return;
  const g = (c) => row.getCell(c).value;
  const nome = (g(1) ?? '').toString().trim(); if (!nome) return;
  const email = (g(2)?.text || g(2) || '').toString().trim().toLowerCase();
  const end = g(40); const endT = end ? new Date(end.result ?? end).getTime() : Infinity;
  all.push({ nome, email, endT, ord: n, perfil: (g(5) ?? '').toString().trim(),
    d_natural: R(g(6)), i_natural: R(g(7)), s_natural: R(g(8)), c_natural: R(g(9)),
    d_adaptado: R(g(10)), i_adaptado: R(g(11)), s_adaptado: R(g(12)), c_adaptado: R(g(13)),
    lid_executivo: R1(g(14)), lid_motivador: R1(g(15)), lid_metodico: R(g(16)), lid_sistematico: R(g(17)),
    valores: { aesthetic:num(g(18)), economic:num(g(19)), political:num(g(20)), religious:num(g(21)), social:num(g(22)), theoretical:num(g(23)) },
    comp_ousadia: R(g(24)), comp_comando: R(g(25)), comp_objetividade: R(g(26)), comp_assertividade: R(g(27)),
    comp_persuasao: R(g(28)), comp_extroversao: R(g(29)), comp_entusiasmo: R(g(30)), comp_sociabilidade: R(g(31)),
    comp_empatia: R(g(32)), comp_paciencia: R(g(33)), comp_persistencia: R(g(34)), comp_planejamento: R(g(35)),
    comp_organizacao: R(g(36)), comp_detalhismo: R(g(37)), comp_prudencia: R(g(38)), comp_concentracao: R(g(39)) });
});
// DEDUP: por pessoa (email||nome), manter o MAIS ANTIGO (endDate asc; empate = ordem no arquivo)
const byKey = {};
for (const r of all) { const k = r.email || norm(r.nome); (byKey[k]=byKey[k]||[]).push(r); }
const pessoas = Object.values(byKey).map(gr => gr.sort((a,b)=> (a.endT-b.endT) || (a.ord-b.ord))[0]);

const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
const { rows: colabs } = await c.query(`select id, lower(email) email, nome_completo, perfil_dominante, comp_ousadia, mapeamento_em, d_natural from colaboradores where empresa_id=$1`, [EMP]);
const byEmail = new Map(colabs.filter(r=>r.email).map(r => [r.email, r]));
const byNome = new Map(); for (const r of colabs) { const k=norm(r.nome_completo); if(k){ (byNome.get(k)||byNome.set(k,[]).get(k)).push(r); } }
const temMap = (r) => !!(r && (r.perfil_dominante || r.comp_ousadia != null || r.mapeamento_em || r.d_natural != null));
const coreCols = ['d_natural','i_natural','s_natural','c_natural','d_adaptado','i_adaptado','s_adaptado','c_adaptado','lid_executivo','lid_motivador','lid_metodico','lid_sistematico'];
const compCols = ['comp_ousadia','comp_comando','comp_objetividade','comp_assertividade','comp_persuasao','comp_extroversao','comp_entusiasmo','comp_sociabilidade','comp_empatia','comp_paciencia','comp_persistencia','comp_planejamento','comp_organizacao','comp_detalhismo','comp_prudencia','comp_concentracao'];

let aplicados = 0;
for (const p of pessoas) {
  let cb = byEmail.get(p.email), via = 'email';
  if (!cb) { const cand = byNome.get(norm(p.nome)); if (cand && cand.length === 1) { cb = cand[0]; via = 'nome'; } }
  if (!cb) continue;                 // 26 não-achados
  if (temMap(cb)) continue;          // já tem mapa → nunca sobrescreve
  console.log(`${APPLY?'APLICA':'DRY'} [${via}] ${p.nome} · perfil=${p.perfil} · natD/I/S/C=${p.d_natural}/${p.i_natural}/${p.s_natural}/${p.c_natural}`);
  if (APPLY) {
    const set = { perfil_dominante: p.perfil, mapeamento_em: new Date().toISOString(),
      disc_resultados: JSON.stringify({ fonte:'import_planilha_cisv2', match_via: via, valores: p.valores, importado_em: new Date().toISOString() }) };
    for (const k of [...coreCols, ...compCols]) set[k] = p[k];
    const keys = Object.keys(set), vals = keys.map(k=>set[k]);
    const q = `update colaboradores set ${keys.map((k,i)=>`"${k}"=$${i+1}`).join(', ')}
      where id=$${keys.length+1} and empresa_id=$${keys.length+2}
        and perfil_dominante is null and comp_ousadia is null and mapeamento_em is null and d_natural is null`;
    const r = await c.query(q, [...vals, cb.id, EMP]);
    aplicados += r.rowCount; console.log(`   → ${r.rowCount} atualizada(s)`);
  }
}
console.log(APPLY ? `\n✓ aplicados: ${aplicados}` : `\n(dry-run — nada escrito)`);
await c.end();
