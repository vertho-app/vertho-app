import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import { type ContextoRecepcao, RecepcaoError } from './access';
import { cenarioSchema, type Cenario, type editarCenarioSchema } from './schema';
import { fichaPublica, ordenarPorNivel } from './core';
import { can } from '@/lib/permissions';
import type { z } from 'zod';

export async function catalogo(c:ContextoRecepcao,editor=false) {
 let q=c.sb.from('recepcao_cenarios').select('*').or(`empresa_id.eq.${c.empresaId},empresa_id.is.null`);
 if(!editor) q=q.eq('estado','publicado');
 const {data,error}=await q.order('created_at',{ascending:false}).order('id').limit(200);
 if(error) throw new RecepcaoError(503,'Não foi possível carregar os cenários.');
 if(editor) return data||[];
 // Para quem treina: degraus em ordem (introdução → sob pressão → limite contestado), título dentro do degrau.
 return ordenarPorNivel((data||[]).map(r=>({id:r.id,versao:r.versao,ficha:fichaPublica(cenarioSchema.parse(r.conteudo))})));
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
 // Catálogo Vertho (empresa_id nulo, todas as clínicas): só a plataforma escreve. A clínica sempre grava cópia própria.
 if(cmd.catalogo && !c.auth.isPlatformAdmin) throw new RecepcaoError(403,'Só a plataforma edita o Catálogo Vertho.');
 const hashRubrica=(r:Cenario['rubrica'])=>createHash('sha256').update(JSON.stringify(r)).digest('hex').slice(0,16);
 if(!cmd.id) {
  if(cmd.acao!=='salvar' || !cmd.conteudo) throw new RecepcaoError(400,'Crie um rascunho antes de publicar.');
  const id=randomUUID(),conteudo=cenarioSchema.parse(cmd.conteudo);
  // Cópia da clínica ganha versão automática; no catálogo a versão vem do editor (ex.: 3.3) e é única por caso.
  if(!cmd.catalogo) conteudo.versao=`v-${id.slice(0,8)}`;
  conteudo.rubricaVersao=hashRubrica(conteudo.rubrica);
  const {data,error}=await c.sb.from('recepcao_cenarios').insert({id,empresa_id:cmd.catalogo?null:c.empresaId,codigo:conteudo.id,versao:conteudo.versao,conteudo,created_by:c.ownerKey}).select('*').single();
  if(error?.code==='23505') throw new RecepcaoError(409,'Já existe essa versão deste caso. Informe outra versão.');
  if(error) throw new RecepcaoError(503,'Não foi possível criar o rascunho.');
  return data;
 }
 let busca=c.sb.from('recepcao_cenarios').select('*').eq('id',cmd.id);
 busca=c.auth.isPlatformAdmin ? busca.or(`empresa_id.eq.${c.empresaId},empresa_id.is.null`) : busca.eq('empresa_id',c.empresaId);
 const {data:atual,error:readError}=await busca.maybeSingle();
 if(readError) throw new RecepcaoError(503,'Não foi possível consultar o rascunho.');
 if(!atual) throw new RecepcaoError(404,'Cenário não encontrado. Para adaptar um caso do catálogo, crie uma cópia.');
 if(cmd.revisao!==atual.revisao) throw new RecepcaoError(409,'O cenário mudou. Recarregue antes de editar.');
 if(atual.estado!=='rascunho' && cmd.acao!=='arquivar') throw new RecepcaoError(409,'Crie uma nova versão para alterar um cenário publicado.');
 if(atual.estado==='arquivado') throw new RecepcaoError(409,'Esta versão já foi arquivada.');
 const global=atual.empresa_id===null;
 const conteudo=cenarioSchema.parse(cmd.conteudo || atual.conteudo);
 if(cmd.acao==='arquivar' && cmd.conteudo) throw new RecepcaoError(400,'Arquivar não altera o conteúdo.');
 // Rascunho do catálogo pode renumerar a versão; cópia da clínica mantém a automática.
 conteudo.versao=global && cmd.conteudo ? conteudo.versao : atual.versao;
 conteudo.rubricaVersao=hashRubrica(conteudo.rubrica);
 const payload=cmd.acao==='arquivar' ? {} : {conteudo,codigo:conteudo.id,versao:conteudo.versao};
 let escrita=c.sb.from('recepcao_cenarios').update({...payload,estado:cmd.acao==='publicar'?'publicado':cmd.acao==='arquivar'?'arquivado':'rascunho',revisao:atual.revisao+1,updated_at:new Date().toISOString()})
  .eq('id',cmd.id).eq('revisao',cmd.revisao);
 escrita=global ? escrita.is('empresa_id',null) : escrita.eq('empresa_id',c.empresaId);
 const {data,error}=await escrita.select('*').maybeSingle();
 if(error?.code==='23505') throw new RecepcaoError(409,'Já existe essa versão deste caso. Informe outra versão.');
 if(error) throw new RecepcaoError(503,'Não foi possível salvar o cenário.');
 if(!data) throw new RecepcaoError(409,'O cenário mudou durante a gravação. Recarregue.');
 // No catálogo, publicar substitui: a versão publicada anterior do mesmo caso é arquivada (snapshots de sessões seguem intactos).
 if(global && cmd.acao==='publicar') {
  const {error:arquivar}=await c.sb.from('recepcao_cenarios').update({estado:'arquivado',updated_at:new Date().toISOString()})
   .is('empresa_id',null).eq('codigo',conteudo.id).eq('estado','publicado').neq('id',cmd.id);
  if(arquivar) throw new RecepcaoError(503,'A versão foi publicada, mas a anterior do catálogo não pôde ser arquivada. Arquive-a na biblioteca.');
 }
 return data;
}
