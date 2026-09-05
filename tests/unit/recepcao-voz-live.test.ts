// Opt-in com custo: dados sintéticos, provedores reais, sem criar sessão de usuário.
import { test,expect,vi } from 'vitest';
const mock=vi.hoisted(()=>({ctx:null as any}));
vi.mock('@/lib/auth/request-context',()=>({requireUser:async()=>({email:'recepcao-smoke@example.test',isPlatformAdmin:true})}));
vi.mock('@/lib/csrf',()=>({csrfCheck:()=>null}));
vi.mock('@/lib/rate-limit',()=>({aiLimiter:{check:async()=>null}}));
vi.mock('@/lib/recepcao/access',async original=>({...await original<any>(),contextoRecepcao:async()=>mock.ctx}));
import {POST} from '@/app/api/recepcao/voz/route';
import {createSupabaseAdmin} from '@/lib/supabase';
test.runIf(process.env.RECEPCAO_VOZ_LIVE==='1')('voz sintetizada e transcrita pelos provedores reais',async()=>{
 const real=createSupabaseAdmin();
 const preflight=await real.from('ia_usage_log').select('correlation_id').limit(0);
 expect(preflight.error,'Aplique a migration 241 antes deste teste pago.').toBeNull();
 const id='11111111-1111-4111-8111-111111111111';
 const row={id,empresa_id:null,owner_key:'smoke',colaborador_id:null,revisao:0,estado:{status:'em_andamento',cenario:{versao:'smoke'},historico:[{id:'m0',role:'assistant',content:'Olá, gostaria de confirmar o horário da minha consulta. Eu prefiro manter a mesma médica, se houver um horário disponível depois das cinco da tarde.'}]}};
 const tentativas:string[]=[];
 const sb:any={rpc:async()=>({data:true,error:null}),from:()=>{const q:any={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:row,error:null}),insert:async p=>{tentativas.push(p.id);return{error:null}},update:()=>q,then:resolve=>resolve({error:null})};return q}};
 mock.ctx={empresaId:null,ownerKey:'smoke',sb};
 const voz=await POST(new Request(`https://local/api/recepcao/voz?acao=ouvir&sessaoId=${id}&mensagemId=m0`,{method:'POST'}));
 expect(voz.status).toBe(200);const bytes=await voz.arrayBuffer();expect(bytes.byteLength).toBeGreaterThan(1000);
 const form=new FormData();form.append('audio',new Blob([bytes],{type:'audio/mpeg'}),'resposta.mp3');
 const resposta=await POST(new Request(`https://local/api/recepcao/voz?acao=transcrever&sessaoId=${id}`,{method:'POST',body:form}));
 expect(resposta.status).toBe(200);const data=await resposta.json();expect(data.texto.toLowerCase()).toContain('consulta');expect(data.texto.toLowerCase()).toContain('tarde');
 const ledger=await real.from('ia_usage_log').select('feature,cost_usd,correlation_id').in('correlation_id',tentativas);
 expect(ledger.error).toBeNull();expect(ledger.data?.length).toBeGreaterThanOrEqual(2);
 expect(ledger.data?.every(l=>l.cost_usd!==null)).toBe(true);
},300000);
