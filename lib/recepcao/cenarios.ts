import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import { type ContextoRecepcao, RecepcaoError } from './access';
import { cenarioSchema, type Cenario, type editarCenarioSchema } from './schema';
import { fichaPublica } from './core';
import { can } from '@/lib/permissions';
import type { z } from 'zod';

export async function catalogo(c:ContextoRecepcao,editor=false) {
 let q=c.sb.from('recepcao_cenarios').select('*').or(`empresa_id.eq.${c.empresaId},empresa_id.is.null`);
 if(!editor) q=q.eq('estado','publicado');
 const {data,error}=await q.order('created_at',{ascending:false}).order('id').limit(200);
 if(error) throw new RecepcaoError(503,'Não foi possível carregar os cenários.');
 return (data||[]).map(r=> editor ? r : {id:r.id,versao:r.versao,ficha:fichaPublica(cenarioSchema.parse(r.conteudo))});
}
export async function cenarioPublicado(c:ContextoRecepcao,id?:string):Promise<{id:string;conteudo:Cenario}> {
 let q=c.sb.from('recepcao_cenarios').select('id,conteudo').or(`empresa_id.eq.${c.empresaId},empresa_id.is.null`).eq('estado','publicado');
 if(id) q=q.eq('id',id);
 const {data,error}=await q.order('created_at',{ascending:false}).order('id').limit(1).maybeSingle();
 if(error) throw new RecepcaoError(503,'Não foi possível consultar o cenário.');
 if(!data) throw new RecepcaoError(404,'Este cenário não está disponível para iniciar. Selecione outro caso.');
 return {id:data.id,conteudo:cenarioSchema.parse(data.conteudo)};
}
export async function editarCenario(c:ContextoRecepcao,cmd:z.infer<typeof editarCenarioSchema>) {
 if(!(await can(c.auth,'content.manage'))) throw new RecepcaoError(403,'Seu perfil não permite editar cenários.');
 if(!cmd.id) {
  if(cmd.acao!=='salvar' || !cmd.conteudo) throw new RecepcaoError(400,'Crie um rascunho antes de publicar.');
  const id=randomUUID(),conteudo=cenarioSchema.parse(cmd.conteudo);
  conteudo.versao=`v-${id.slice(0,8)}`;
  conteudo.rubricaVersao=createHash('sha256').update(JSON.stringify(conteudo.rubrica)).digest('hex').slice(0,16);
  const {data,error}=await c.sb.from('recepcao_cenarios').insert({id,empresa_id:c.empresaId,codigo:conteudo.id,versao:conteudo.versao,conteudo,created_by:c.ownerKey}).select('*').single();
  if(error) throw new RecepcaoError(503,'Não foi possível criar o rascunho.');
  return data;
 }
 const {data:atual,error:readError}=await c.sb.from('recepcao_cenarios').select('*').eq('empresa_id',c.empresaId).eq('id',cmd.id).maybeSingle();
 if(readError) throw new RecepcaoError(503,'Não foi possível consultar o rascunho.');
 if(!atual) throw new RecepcaoError(404,'Cenário não encontrado. Para adaptar um caso do catálogo, crie uma cópia.');
 if(cmd.revisao!==atual.revisao) throw new RecepcaoError(409,'O cenário mudou. Recarregue antes de editar.');
 if(atual.estado!=='rascunho' && cmd.acao!=='arquivar') throw new RecepcaoError(409,'Crie uma nova versão para alterar um cenário publicado.');
 if(atual.estado==='arquivado') throw new RecepcaoError(409,'Esta versão já foi arquivada.');
 const conteudo=cenarioSchema.parse(cmd.conteudo || atual.conteudo);
 if(cmd.acao==='arquivar' && cmd.conteudo) throw new RecepcaoError(400,'Arquivar não altera o conteúdo.');
 conteudo.versao=atual.versao;
 conteudo.rubricaVersao=createHash('sha256').update(JSON.stringify(conteudo.rubrica)).digest('hex').slice(0,16);
 const payload=cmd.acao==='arquivar' ? {} : {conteudo,codigo:conteudo.id};
 const {data,error}=await c.sb.from('recepcao_cenarios').update({...payload,estado:cmd.acao==='publicar'?'publicado':cmd.acao==='arquivar'?'arquivado':'rascunho',revisao:atual.revisao+1,updated_at:new Date().toISOString()})
 .eq('empresa_id',c.empresaId).eq('id',cmd.id).eq('revisao',cmd.revisao).select('*').maybeSingle();
 if(error) throw new RecepcaoError(503,'Não foi possível salvar o cenário.');
 if(!data) throw new RecepcaoError(409,'O cenário mudou durante a gravação. Recarregue.');
 return data;
}
