// Opt-in: produção. Sem flag, nunca abre conexão. Dry-run sempre reverte a transação.
import { test, expect } from 'vitest';
import pg from 'pg';
import { randomUUID, createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { sslSupabase } from '../../scripts/_pg-ssl.mjs';
import { catalogoInicial } from '@/lib/recepcao/catalogo';
import { abrirSessao } from '@/lib/recepcao/core';

test.runIf(process.env.RECEPCAO_DB_CHECK==='1')('migration, catálogo versionado, autoria estável e ACL no banco real',async()=>{
 const db=new pg.Client({connectionString:process.env.DATABASE_URL,ssl:sslSupabase()});await db.connect();
 let committed=false;
 try {
  await db.query('BEGIN');
  await db.query(readFileSync('migrations/241-recepcao-evolucao.sql','utf8').replace(/^BEGIN;\s*/m,'').replace(/^COMMIT;\s*/m,''));
  for(const c of catalogoInicial) {
   const h=createHash('sha256').update(`recepcao:${c.id}:${c.versao}`).digest('hex');const id=`${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-8${h.slice(17,20)}-${h.slice(20,32)}`;
   await db.query(`insert into recepcao_cenarios(id,empresa_id,codigo,versao,conteudo,estado,created_by) values($1,null,$2,$3,$4,'publicado','seed:recepcao-2.0') on conflict do nothing`,[id,c.id,c.versao,JSON.stringify(c)]);
  }
  if(process.env.RECEPCAO_APPLY==='1') {
   const {rows}=await db.query("select count(*)::int n from recepcao_cenarios where empresa_id is null and estado='publicado'");expect(rows[0].n).toBeGreaterThanOrEqual(5);
   await db.query('COMMIT');committed=true;console.log('Migration 241 e cinco cenários publicados.');return;
  }
  const empresa=(await db.query('select id from empresas order by id limit 1')).rows[0].id;
  const id=randomUUID(),token=randomUUID(),owner=`teste:${randomUUID()}`,s=abrirSessao(catalogoInicial[0]);s.id=id;
  await db.query('insert into recepcao_sessoes(id,empresa_id,owner_email,owner_key,estado) values($1,$2,$3,$4,$5)',[id,empresa,'original@example.test',owner,s]);
  await db.query('update recepcao_sessoes set owner_email=$2 where id=$1',[id,'novo@example.test']);
  const claim=async(e,o,t)=> (await db.query('select recepcao_claim_v2($1,$2,$3,0,$4) ok',[id,e,o,t])).rows[0].ok;
  expect(await claim(randomUUID(),owner,token)).toBe(false);expect(await claim(empresa,'original@example.test',token)).toBe(false);expect(await claim(empresa,'outro',token)).toBe(false);
  expect(await claim(empresa,owner,token)).toBe(true);expect(await claim(empresa,owner,randomUUID())).toBe(false);
  const next={...s,revisao:1};const commit=async(t)=> (await db.query('select recepcao_commit_v2($1,$2,$3,0,$4,$5,$6) ok',[id,empresa,owner,t,next,'[]'])).rows[0].ok;
  expect(await commit(randomUUID())).toBe(false);expect(await commit(token)).toBe(true);expect(await commit(token)).toBe(false);
  await db.query('SAVEPOINT imutavel');
  await expect(db.query("update recepcao_cenarios set conteudo=conteudo||'{\"versao\":\"mudou\"}'::jsonb where empresa_id is null and codigo='remarcacao-02'")).rejects.toThrow('imutável');
  await db.query('ROLLBACK TO SAVEPOINT imutavel');
  const acl=(await db.query(`select has_table_privilege('authenticated','recepcao_cenarios','SELECT') leitura,has_table_privilege('anon','recepcao_tentativas','INSERT') escrita,has_table_privilege('service_role','recepcao_revisoes','UPDATE') alterar_revisao,has_function_privilege('authenticated','recepcao_claim_v2(uuid,uuid,text,integer,uuid)','EXECUTE') rpc`)).rows[0];
  expect(acl).toEqual({leitura:false,escrita:false,alterar_revisao:false,rpc:false});
 }finally{if(!committed)await db.query('ROLLBACK');await db.end();}
},60000);
