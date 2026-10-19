import {describe,it,expect,vi} from 'vitest';
import {bunnyPronto,confirmarPublicacoes,registrarPublicacao} from '@/worker-hetzner/publicacao-bunny.mjs';
const p={id:'p',cell_video_id:'v',colaborador_id:'c',bunny_video_id:'b',bunny_library:'636615',video_url:'url',deck_fingerprint:'hash',altura_minima:1080};
function db(rowCount=1){return {query:vi.fn(async(sql:string,_args?:unknown[])=>sql.startsWith('SELECT *')?{rows:[p]}:sql.startsWith('INSERT')?{rows:[{id:'p'}]}:{rowCount,rows:[{id:'c'}]})}}
const fetchB=(b:unknown)=>vi.fn(async()=>({ok:true,json:async()=>b}));
describe('publicação Bunny só troca URL quando há reprodução na qualidade pedida',()=>{
  it('não confunde upload aceito/encoding com vídeo pronto',()=>{
    expect(bunnyPronto({status:2,length:0,availableResolutions:null},1080)).toBe(false);
    expect(bunnyPronto({status:4,length:120,availableResolutions:'360p,720p'},1080)).toBe(false);
    expect(bunnyPronto({status:4,length:120,availableResolutions:'720p,1080p'},1080)).toBe(true);
    expect(bunnyPronto({status:3,length:120,availableResolutions:'1080p'},1080)).toBe(true);
  });
  it('registro preserva as URLs anteriores e grava o novo upload no outbox',async()=>{
    const pool=db();await registrarPublicacao(pool,{cellVideoId:'v',colaboradorId:'c',fingerprint:'hash',bunnyId:'b',library:'636615',url:'url',altura:1080});
    const updates=pool.query.mock.calls.filter(([s])=>s.startsWith('UPDATE videos_'));
    expect(updates).toHaveLength(1);expect(updates[0][0]).not.toContain('video_url=');
  });
  it('encode pendente não altera a mídia da pessoa; gira a fila',async()=>{
    const pool=db();const r=await confirmarPublicacoes(pool,{token:'test',fetchFn:fetchB({status:2,length:0})});
    expect(r.pendentes).toBe(1);expect(pool.query.mock.calls.some(([s])=>s.startsWith('UPDATE videos_'))).toBe(false);
    expect(pool.query.mock.calls.some(([s])=>s.includes('updated_at=now(),erro=null'))).toBe(true);
  });
  it('publica com guarda de revisão no UPDATE',async()=>{
    const pool=db();const r=await confirmarPublicacoes(pool,{token:'test',fetchFn:fetchB({status:4,length:120,availableResolutions:'1080p'})});
    expect(r.publicados).toBe(1);expect(pool.query.mock.calls.find(([s])=>s.startsWith('UPDATE videos_personalizados'))?.[0]).toContain('v.render_fingerprint=$6');
  });
  it('revisão que já mudou não é sobrescrita',async()=>{
    const pool=db(0);const r=await confirmarPublicacoes(pool,{token:'test',fetchFn:fetchB({status:4,length:120,availableResolutions:'1080p'})});
    expect(r.obsoletos).toBe(1);expect(r.publicados).toBe(0);
  });
  it('🔴 N+1 (Sentry, 19/10): vários vídeos ainda em encode giram a fila numa consulta SÓ, não uma por vídeo',async()=>{
    const linhas=['a','b','c','d','e'].map(id=>({...p,id}));
    const pool={query:vi.fn(async(sql:string,_a?:unknown[])=>sql.startsWith('SELECT *')?{rows:linhas}:{rowCount:1,rows:[]})};
    const r=await confirmarPublicacoes(pool,{token:'test',fetchFn:fetchB({status:2,length:0})});
    expect(r.pendentes).toBe(5);
    // 1 SELECT + 1 UPDATE em lote (antes: 1 + 5)
    expect(pool.query).toHaveBeenCalledTimes(2);
    const [sql,args]=pool.query.mock.calls[1];
    expect(sql).toContain('id = ANY($1::uuid[])');
    expect(args).toEqual([['a','b','c','d','e']]);
  });
  it('🔴 publicados fecham o estado numa consulta só; o UPDATE da mídia (guarda de revisão) segue por vídeo',async()=>{
    const linhas=['a','b','c'].map(id=>({...p,id}));
    const pool={query:vi.fn(async(sql:string,_a?:unknown[])=>sql.startsWith('SELECT *')?{rows:linhas}:{rowCount:1,rows:[{id:'c'}]})};
    const r=await confirmarPublicacoes(pool,{token:'test',fetchFn:fetchB({status:4,length:120,availableResolutions:'1080p'})});
    expect(r.publicados).toBe(3);
    const midia=pool.query.mock.calls.filter(([s])=>s.startsWith('UPDATE videos_personalizados'));
    expect(midia).toHaveLength(3);
    const estado=pool.query.mock.calls.filter(([s])=>s.includes('unnest($1::uuid[],$2::text[])'));
    expect(estado).toHaveLength(1);
    expect(estado[0][1]).toEqual([['a','b','c'],['publicado','publicado','publicado']]);
    expect(estado[0][0]).toContain("v.estado='pendente'");
    // 1 SELECT + 3 mídia + 1 estado (antes: 1 + 3 + 3)
    expect(pool.query).toHaveBeenCalledTimes(5);
  });
  it('sem nada pendente, só o SELECT (nenhum UPDATE vazio)',async()=>{
    const pool={query:vi.fn(async()=>({rows:[],rowCount:0}))};
    await confirmarPublicacoes(pool,{token:'test',fetchFn:fetchB({status:2})});
    expect(pool.query).toHaveBeenCalledTimes(1);
  });
  it('falha de encode fica visível sem apagar a versão anterior',async()=>{
    const pool=db();const r=await confirmarPublicacoes(pool,{token:'test',fetchFn:fetchB({status:5})});
    expect(r.falhas).toBe(1);expect(pool.query.mock.calls.some(([s])=>s.startsWith('UPDATE videos_'))).toBe(false);
    expect(pool.query.mock.calls.some(([s])=>s.includes("estado='erro'"))).toBe(true);
  });
});
