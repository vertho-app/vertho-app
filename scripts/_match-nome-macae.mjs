export {};
process.loadEnvFile('.env.local');
const ExcelJS = (await import('exceljs')).default;
const pg = (await import('pg')).default;
const EMP='44b632ae-b7b9-440d-bc74-92cead889d52';
const norm = s => (s||'').toString().normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z ]/g,'').replace(/\s+/g,' ').trim();
const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile('C:/Users/rdnav/Downloads/PERFIL COMPORTAMENTAL - CISv2.xlsx');
const ws = wb.worksheets[0]; const pessoas=[];
ws.eachRow((row,n)=>{ if(n===1)return; const nome=(row.getCell(1).value??'').toString().trim(); const email=(row.getCell(2).value?.text||row.getCell(2).value||'').toString().trim().toLowerCase(); if(nome)pessoas.push({nome,email}); });
const c=new pg.Client({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false}});await c.connect();
const {rows:colabs}=await c.query(`select id, lower(email) email, nome_completo, perfil_dominante, comp_ousadia, mapeamento_em, d_natural from colaboradores where empresa_id=$1`,[EMP]);
const byEmail=new Map(colabs.filter(r=>r.email).map(r=>[r.email,r]));
const byNome=new Map(); for(const r of colabs){ const k=norm(r.nome_completo); if(k) (byNome.get(k)||byNome.set(k,[]).get(k)).push(r); }
const temMap=r=>!!(r&&(r.perfil_dominante||r.comp_ousadia!=null||r.mapeamento_em||r.d_natural!=null));
let porNomeSemMap=0, porNomeComMap=0, semNenhum=0;
const casaNome=[], semMatch=[];
for(const p of pessoas){
  if(byEmail.get(p.email)) continue; // já tratado por e-mail
  const cand=byNome.get(norm(p.nome));
  if(cand && cand.length===1){ const r=cand[0]; if(temMap(r)){porNomeComMap++;} else {porNomeSemMap++; casaNome.push(p.nome+' <'+p.email+'>  (DB email: '+r.email+')');} }
  else if(cand && cand.length>1){ casaNome.push(p.nome+' (AMBÍGUO — '+cand.length+' homônimos)'); }
  else { semNenhum++; semMatch.push(p.nome+' <'+p.email+'>'); }
}
console.log('== 33 não-achados-por-email: match por NOME ==');
console.log('Casam por nome e SEM mapa (poderiam subir):', porNomeSemMap);
console.log('Casam por nome mas JÁ têm mapa (pular):', porNomeComMap);
console.log('NÃO existem no tenant (nem email nem nome):', semNenhum);
console.log('\nCandidatos por nome (email difere):'); casaNome.forEach(x=>console.log('   ~',x));
console.log('\nSem nenhum match (não estão no tenant):'); semMatch.forEach(x=>console.log('   ✗',x));
await c.end();
