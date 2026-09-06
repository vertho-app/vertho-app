// Operação editorial opt-in. Dry-run por padrão; aplicação exige a segunda flag.
import {test,expect} from 'vitest';
import pg from 'pg';
import {createHash} from 'node:crypto';
import {mkdirSync,writeFileSync} from 'node:fs';
import {sslSupabase} from '../../scripts/_pg-ssl.mjs';
import {catalogoDesafiador} from '@/lib/recepcao/catalogo-desafiador';

test.runIf(process.env.RECEPCAO_DESAFIOS_DB==='1')('publica versões difíceis e arquiva somente sementes introdutórias',async()=>{
 const db=new pg.Client({connectionString:process.env.DATABASE_URL,ssl:sslSupabase()});await db.connect();let committed=false;
 try {
  await db.query('BEGIN');
  await db.query("select pg_advisory_xact_lock(hashtext('recepcao:catalogo-desafiador:2.0'))");
  const codigos=catalogoDesafiador.map(c=>c.id);
  const antigos=await db.query("select * from recepcao_cenarios where empresa_id is null and codigo=any($1::text[]) and versao='1.0' and created_by='seed:recepcao-2.0' for update",[codigos]);
  if(process.env.RECEPCAO_DESAFIOS_APPLY==='1') {
   mkdirSync('backups',{recursive:true});
   writeFileSync(`backups/recepcao-catalogo-antes-desafios-${Date.now()}.json`,JSON.stringify(antigos.rows,null,2));
  }
  for(const c of catalogoDesafiador) {
   const h=createHash('sha256').update(`recepcao:${c.id}:${c.versao}`).digest('hex');const id=`${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-8${h.slice(17,20)}-${h.slice(20,32)}`;
   await db.query("insert into recepcao_cenarios(id,empresa_id,codigo,versao,conteudo,estado,created_by) values($1,null,$2,$3,$4,'publicado','seed:recepcao-desafios-2.0') on conflict do nothing",[id,c.id,c.versao,JSON.stringify(c)]);
   const salvo=(await db.query('select conteudo,estado from recepcao_cenarios where id=$1',[id])).rows[0];
   expect(salvo?.conteudo,'Não sobrescrever uma versão divergente já publicada.').toEqual(c);expect(salvo?.estado).toBe('publicado');
  }
  await db.query("update recepcao_cenarios set estado='arquivado',revisao=revisao+1,updated_at=now() where empresa_id is null and codigo=any($1::text[]) and versao='1.0' and created_by='seed:recepcao-2.0' and estado='publicado'",[codigos]);
  const {rows}=await db.query("select count(*)::int n from recepcao_cenarios where empresa_id is null and codigo=any($1::text[]) and versao='2.0' and estado='publicado'",[codigos]);expect(rows[0].n).toBe(5);
  if(process.env.RECEPCAO_DESAFIOS_APPLY==='1'){await db.query('COMMIT');committed=true;}
 }finally{if(!committed)await db.query('ROLLBACK');await db.end();}
},60000);
