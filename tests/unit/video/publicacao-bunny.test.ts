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
  it('falha de encode fica visível sem apagar a versão anterior',async()=>{
    const pool=db();const r=await confirmarPublicacoes(pool,{token:'test',fetchFn:fetchB({status:5})});
    expect(r.falhas).toBe(1);expect(pool.query.mock.calls.some(([s])=>s.startsWith('UPDATE videos_'))).toBe(false);
    expect(pool.query.mock.calls.some(([s])=>s.includes("estado='erro'"))).toBe(true);
  });
});
