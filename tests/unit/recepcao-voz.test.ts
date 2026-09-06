import { afterEach, beforeEach, expect, test, vi } from 'vitest';
const mock=vi.hoisted(()=>({auth:null as any,ctx:null as any,narrar:vi.fn(),ledger:vi.fn(),csrf:null as any,limite:null as any,geradas:0}));
vi.mock('@/lib/auth/request-context',()=>({requireUser:async()=>mock.auth}));
vi.mock('@/lib/csrf',()=>({csrfCheck:()=>mock.csrf}));
vi.mock('@/lib/rate-limit',()=>({aiLimiter:{check:async()=>mock.limite}}));
vi.mock('@/lib/gemini-tts',()=>({generateNarrationAudio:mock.narrar}));
vi.mock('@/lib/ia-ledger',()=>({gravarLinhaLedger:mock.ledger}));
vi.mock('@/lib/recepcao/access',async original=>({...await original<any>(),contextoRecepcao:async()=>mock.ctx}));
import { POST } from '@/app/api/recepcao/voz/route';
const ID='11111111-1111-4111-8111-111111111111';
let state:any;
beforeEach(()=>{
 mock.auth={email:'teste@example.test',isPlatformAdmin:true};mock.csrf=null;mock.limite=null;mock.geradas=0;mock.narrar.mockReset().mockResolvedValue({buffer:Buffer.from('audio-sintetico'),contentType:'audio/mpeg'});mock.ledger.mockReset().mockResolvedValue(true);
 state={id:ID,empresa_id:'empresa',owner_key:'admin:1',revisao:0,estado:{status:'em_andamento',cenario:{versao:'1'},historico:[{id:'m0',role:'assistant',content:'Olá, gostaria de confirmar meu horário.'}]},lock_token:null};
 const sb:any={rpc:vi.fn(async()=>({data:false,error:null})),from:table=>{const filters:any[]=[];let payload:any,op='read';const q:any={select:()=>q,eq:(k,v)=>{filters.push([k,v]);return q},maybeSingle:async()=>({data:filters.every(([k,v])=>state[k]===v)?state:null,error:null}),insert:async()=>{mock.geradas++;return{error:null}},update:p=>{payload=p;op='update';return q},then:resolve=>{if(table==='recepcao_sessoes'&&op==='update'&&filters.every(([k,v])=>state[k]===v))Object.assign(state,payload);return resolve({error:null})}};return q}};
 mock.ctx={empresaId:'empresa',ownerKey:'admin:1',sb};
});
const req=(id=ID,acao='ouvir')=>new Request(`https://local/api/recepcao/voz?acao=${acao}&sessaoId=${id}&mensagemId=m0`,{method:'POST'});
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs()});
function audioReq(){const form=new FormData();form.append('audio',new Blob([new Uint8Array(200)],{type:'audio/webm'}),'resposta.webm');return new Request(`https://local/api/recepcao/voz?acao=transcrever&sessaoId=${ID}`,{method:'POST',body:form})}
function transcricao(d:unknown){vi.stubEnv('OPENAI_API_KEY','chave-ficticia-de-teste');vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,json:async()=>d})));}
test('voz exige autenticação e CSRF antes de qualquer síntese',async()=>{mock.auth=new Response(null,{status:401});expect((await POST(req())).status).toBe(401);mock.csrf=new Response(null,{status:403});expect((await POST(req())).status).toBe(403);expect(mock.narrar).not.toHaveBeenCalled()});
test('outro proprietário não pode transformar falas do treino em áudio',async()=>{mock.ctx.ownerKey='admin:outra';expect((await POST(req())).status).toBe(404);expect(mock.narrar).not.toHaveBeenCalled()});
test('só a fala lida do servidor é narrada, com correlação de custo sem adquirir lease',async()=>{const r=await POST(req());expect(r.status).toBe(200);expect(r.headers.get('content-type')).toBe('audio/mpeg');expect(mock.narrar).toHaveBeenCalledWith(state.estado.historico[0].content,expect.objectContaining({ledger:expect.objectContaining({feature:'recepcao_voz',correlationId:expect.any(String)})}));expect(state.lock_token).toBeNull();expect(mock.geradas).toBe(1);expect(mock.ctx.sb.rpc).not.toHaveBeenCalled()});
test('falha do TTS preserva o treino',async()=>{mock.narrar.mockRejectedValue(new Error('segredo do provedor'));expect((await POST(req())).status).toBe(502);expect(state.lock_token).toBeNull();expect(state.estado.historico).toHaveLength(1)});
test('áudio não é transcrito em sessão de outra pessoa nem sem arquivo',async()=>{expect((await POST(req(ID,'transcrever'))).status).toBe(400);expect(mock.geradas).toBe(0)});

test('síntese não disputa nem libera o lock de uma mensagem',async()=>{state.lock_token='envio-em-andamento';const antes=structuredClone(state);expect((await POST(req())).status).toBe(200);expect(state).toEqual(antes);expect(mock.ctx.sb.rpc).not.toHaveBeenCalled()});

test.each([undefined,null,'abc','10',NaN,Infinity,-1,0,true])('duração inválida %s não retorna transcrição nem custo falso',async duration=>{
 transcricao({text:'Texto reconhecido',duration});const r=await POST(audioReq());expect(r.status).toBe(502);expect(await r.text()).not.toContain('Texto reconhecido');
 expect(mock.ledger).toHaveBeenCalledWith(expect.objectContaining({cost_usd:null}));expect(mock.ctx.sb.rpc).not.toHaveBeenCalled();
});
test('duração acima do teto registra custo e recusa o texto',async()=>{transcricao({text:'Texto reconhecido',duration:66});expect((await POST(audioReq())).status).toBe(400);expect(mock.ledger).toHaveBeenCalledWith(expect.objectContaining({cost_usd:66*0.006/60}))});
test('duração válida retorna rascunho sem alterar estado ou lock',async()=>{transcricao({text:'Quero confirmar meu horário.',usage:{seconds:10}});state.lock_token='outra-operacao';const antes=structuredClone(state);const r=await POST(audioReq());expect(r.status).toBe(200);expect(await r.json()).toEqual({texto:'Quero confirmar meu horário.'});expect(state).toEqual(antes);expect(mock.ctx.sb.rpc).not.toHaveBeenCalled()});
