import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { criarSupabaseMock } from '../helpers/supabase-mock';
import { metricasDegustacao, DEMO_TELEMETRY_VERSION } from '@/lib/demo/degustacao-metricas';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'service-role-key-used-only-by-unit-test';
const SID='bbbbbbbbbbbbbbbbbbbb';
let sessao: any, email = 'carla.demo@vertho.ai';
const sb = criarSupabaseMock({ resolver: tabela => tabela === 'demo_prospect_sessions' ? sessao : null });
vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => sb.client }));
vi.mock('@/lib/tenant-resolver', () => ({ resolveTenant: async(slug: string) => ['acme-demo','gruposinal'].includes(slug) ? {id:`${slug}-id`,slug} : null }));
vi.mock('@/lib/auth/supabase-server', () => ({ createSupabaseServerClient: async() => ({ auth: { getUser: async()=>({ data:{user: email ? {email} : null},error:null }) } }) }));
vi.mock('@/lib/rate-limit', () => ({ authLimiter: {check:async()=>null} }));
import { POST as contato } from '@/app/auth/degustacao/contato/route';
import { POST as exploracao } from '@/app/auth/degustacao/exploracao/route';
import { emitirPasseDegustacao } from '@/lib/demo/degustacao-passe';
import { issueDemoPresentationTicket } from '@/lib/demo/presentation-ticket';
const expiry=()=>Math.floor(Date.now()/1000)+3600;
const reqContato=(origin='https://acme-demo.vertho.ai') => new NextRequest('https://acme-demo.vertho.ai/auth/degustacao/contato', { method:'POST',headers:{origin},body:new URLSearchParams({passe:emitirPasseDegustacao('acme-demo',SID,expiry())}) });
const reqExploracao=(alvo='pdi',host='gestor-demo.vertho.ai')=>new NextRequest(`https://${host}/auth/degustacao/exploracao`, {method:'POST',headers:{origin:`https://${host}`,'content-type':'application/json'},body:JSON.stringify({alvo,ticket:issueDemoPresentationTicket(undefined,{prospectSessionId:SID,expiresAtSeconds:expiry()},'acme-demo')})});
beforeEach(()=>{sb.reset();email='carla.demo@vertho.ai';sessao={expires_at:new Date(Date.now()+3600000).toISOString(),access_closed_at:null,prospect_name:'QA Exemplo',prospect_company:'TESTE INTERNO',created_by_email:null};});
describe('intenção e exploração da degustação',()=>{
 it('POST de contato registra primeiro clique escopado e abre somente wa.me, sem envio',async()=>{
  const r=await contato(reqContato());expect(r.status).toBe(303);expect(new URL(r.headers.get('location')!).host).toBe('wa.me');
  expect(sb.escritas[0].payload).toHaveProperty('contact_clicked_at');expect(sb.usou('demo_prospect_sessions','is','contact_clicked_at')).toBe(true);
  expect(sb.chamadas).toContainEqual(expect.objectContaining({metodo:'eq',args:['empresa_id','acme-demo-id']}));
 });
 it('contato recusa origem externa e convite fechado, sem gravar',async()=>{
  expect((await contato(reqContato('https://evil.test'))).status).toBe(403);sessao.access_closed_at=new Date().toISOString();expect((await contato(reqContato())).status).toBe(400);expect(sb.escritas).toHaveLength(0);
 });
 it('falha de medição do contato não bloqueia a conversa',async()=>{
  sb.falharEm({tabela:'demo_prospect_sessions',op:'update',mensagem:'offline'});expect((await contato(reqContato())).status).toBe(303);
 });
 it('exploração exige ticket, tenant e identidade da persona, e deduplica no banco',async()=>{
  await exploracao(reqExploracao());expect(sb.escritas).toHaveLength(2);expect(sb.escritas[0].payload.relevant_exploration_target).toBe('pdi');expect(sb.usou('demo_prospect_sessions','is','relevant_exploration_at')).toBe(true);
  sb.reset();await exploracao(reqExploracao('pdi','gestor-sinal.vertho.ai'));expect(sb.escritas).toHaveLength(0);
  email='outra@demo';await exploracao(reqExploracao());expect(sb.escritas).toHaveLength(0);
 });
 it('alvo desconhecido, ausência de login e convite encerrado não contam',async()=>{
  await exploracao(reqExploracao('qualquer-url'));email='';await exploracao(reqExploracao());email='carla.demo@vertho.ai';sessao.access_closed_at='2026-09-01';await exploracao(reqExploracao());expect(sb.escritas).toHaveLength(0);
 });
 it('taxa usa apenas B instrumentada e aberta; exclui QA, A e histórico',()=>{
  const base:any={origem:'passaporte',nome:'Ana',contexto:'Empresa',versao:'B',telemetryVersion:DEMO_TELEMETRY_VERSION,conviteAbertoEm:'data'};
  const m=metricasDegustacao([base,{...base,exploracaoRelevanteEm:'data',contatoClicadoEm:'data'},{...base,versao:'A'},{...base,telemetryVersion:null},{...base,testeInterno:true},{...base,nome:'QA Teste'},{...base,conviteAbertoEm:null}]);
  expect(m).toEqual({convites:3,abertos:2,exploraram:1,contatos:1,taxa:50});expect(metricasDegustacao([]).taxa).toBeNull();
 });
});
