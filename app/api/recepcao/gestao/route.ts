import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/auth/request-context';
import { csrfCheck } from '@/lib/csrf';
import { can } from '@/lib/permissions';
import { contextoRecepcao, RecepcaoError } from '@/lib/recepcao/access';
import { catalogo, editarCenario } from '@/lib/recepcao/cenarios';
import { detalheEquipe, painelEquipe, revisar } from '@/lib/recepcao/equipe';
import { editarCenarioSchema, revisaoSchema } from '@/lib/recepcao/schema';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const json=(d:unknown,status=200)=>NextResponse.json(d,{status,headers:{'Cache-Control':'no-store'}});
function falha(e:unknown) {
 if(e instanceof RecepcaoError) return json({error:e.message},e.status);
 if(e instanceof z.ZodError) return json({error:'Revise os campos do formulário.',campos:e.issues.map(i=>({campo:i.path.join('.'),erro:i.message}))},400);
 if(e instanceof SyntaxError) return json({error:'Formato inválido.'},400);
 console.error('[recepcao] falha de gestão',e instanceof Error?e.name:'erro');
 return json({error:'Não foi possível concluir esta operação.'},500);
}
export async function GET(req:Request) {
 try {
  const auth=await requireUser(req);if(auth instanceof Response) return auth;
  const q=new URL(req.url).searchParams;
  const empresa=q.get('empresaId');if(empresa) z.string().uuid().parse(empresa);
  const c=await contextoRecepcao(req,empresa,false,auth);if(c instanceof Response) return c;
  if(q.get('visao')==='cenarios') {
   if(!(await can(auth,'content.manage'))) throw new RecepcaoError(403,'Sem permissão para editar cenários.');
   return json({cenarios:await catalogo(c,true)});
  }
  const id=q.get('sessaoId');if(id) return json(await detalheEquipe(c,z.string().uuid().parse(id)));
  const dias=z.coerce.number().int().min(1).max(90).parse(q.get('dias')||30);
  return json(await painelEquipe(c,dias,q.get('testes')==='1'));
 } catch(e) {return falha(e);}
}
export async function POST(req:Request) {
 try {
  const csrf=csrfCheck(req);if(csrf) return csrf;
  const auth=await requireUser(req);if(auth instanceof Response) return auth;
  const raw=await req.text();if(raw.length>100000) return json({error:'Formulário muito longo.'},413);
  const parsed=JSON.parse(raw);
  const review=parsed.acao==='revisar';
  const cmd=review?revisaoSchema.parse(Object.fromEntries(Object.entries(parsed).filter(([k])=>k!=='acao'))):editarCenarioSchema.parse(parsed);
  const c=await contextoRecepcao(req,cmd.empresaId,false,auth);if(c instanceof Response) return c;
  return json(review?await revisar(c,cmd as z.infer<typeof revisaoSchema>):{cenario:await editarCenario(c,cmd as z.infer<typeof editarCenarioSchema>)});
 } catch(e) {return falha(e);}
}
