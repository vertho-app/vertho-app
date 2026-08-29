export {};
process.loadEnvFile('.env.local');
const ExcelJS = (await import('exceljs')).default;
const pg = (await import('pg')).default;
const EMP = '44b632ae-b7b9-440d-bc74-92cead889d52';
const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile('C:/Users/rdnav/Downloads/PERFIL COMPORTAMENTAL - CISv2.xlsx');
const ws = wb.worksheets[0];
const pessoas = [];
ws.eachRow((row, n) => {
  if (n === 1) return;
  const nome = (row.getCell(1).value ?? '').toString().trim();
  const email = (row.getCell(2).value?.text || row.getCell(2).value || '').toString().trim().toLowerCase();
  const perfil = (row.getCell(5).value ?? '').toString().trim();
  if (nome) pessoas.push({ nome, email, perfil });
});
const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
const { rows } = await c.query(`select id, lower(email) email, nome_completo, perfil_dominante, comp_ousadia, mapeamento_em, d_natural from colaboradores where empresa_id=$1`, [EMP]);
const byEmail = new Map(rows.filter(r=>r.email).map(r => [r.email, r]));
const temMap = (r) => !!(r && (r.perfil_dominante || r.comp_ousadia != null || r.mapeamento_em || r.d_natural != null));
let comMap=0, semMap=0; const naoAchados=[], candidatos=[];
for (const p of pessoas) {
  const r = byEmail.get(p.email);
  if (!r) { naoAchados.push(p); continue; }
  if (temMap(r)) comMap++; else { semMap++; candidatos.push({...p, id:r.id, nomeDB:r.nome_completo}); }
}
console.log('== v2 · Macaé Secretaria Municipal ==');
console.log('Planilha:', pessoas.length, '| tenant:', rows.length, '| sem e-mail na planilha:', pessoas.filter(p=>!p.email).length);
console.log('Casados por e-mail:', pessoas.length - naoAchados.length, '| não achados:', naoAchados.length);
console.log('  JÁ têm mapeamento (pular):', comMap);
console.log('  SEM mapeamento (candidatos a subir):', semMap);
console.log('\nCandidatos (sem mapa):');
candidatos.forEach(p=>console.log('   +', p.nome, '<'+p.email+'> perfil='+p.perfil));
console.log('\nNão achados no tenant ('+naoAchados.length+'):');
naoAchados.slice(0,40).forEach(p=>console.log('   -', p.nome, '<'+p.email+'>'));
await c.end();
