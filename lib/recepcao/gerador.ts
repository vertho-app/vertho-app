import 'server-only';
import { callAIChat } from '@/actions/ai-client';
import { getModelForTask } from '@/lib/ai-tasks';
import { parseJsonIA } from '@/lib/ai-json';
import { pacienteSchema, avaliacaoSchema } from './schema';
import { createHash, randomUUID } from 'node:crypto';
import { ErroReferenciaAvaliacao } from './core';
import type { ContextoRecepcao } from './access';
import type { Gerar } from './model';
import { z } from 'zod';

export function codigoFalha(e:unknown) {
 if(e instanceof ErroReferenciaAvaliacao) return {codigo:e.codigo,campo:e.campo};
 if(e instanceof z.ZodError) return {codigo:'schema_invalido',campo:e.issues[0]?.path.map(p=>typeof p==='number'?p:String(p).replace(/[^a-zA-Z_]/g,'')).join('.')};
 if(e instanceof SyntaxError) return {codigo:'json_invalido',campo:null};
 if(e instanceof Error && e.message==='Exposição de instruções na fala') return {codigo:'instrucoes_expostas',campo:null};
 return {codigo:'geracao_ou_regra',campo:null};
}
export function geradorRecepcao(empresaId: string|null, colaboradorId: string | null, admin = false,
 persistencia?:{sb:ContextoRecepcao['sb'];sessaoId:string;cenarioVersao:string}) {
 const chamadas:Array<{id:string;etapa:string;model:string;promptHash:string;promptVersion:string}>=[];
 let atual:{id:string;inicio:number;finalizada:boolean}|null=null;
 async function validar(erro?:unknown) {
  if(!atual || atual.finalizada) return;
  const falha=erro ? codigoFalha(erro) : null;
  if(persistencia) {
   const {error}=await persistencia.sb.from('recepcao_tentativas').update({estado:falha?'rejeitada':'aceita',erro_codigo:falha?.codigo||null,erro_campo:falha?.campo||null,finished_at:new Date().toISOString(),duracao_ms:Date.now()-atual.inicio})
    .eq('empresa_id',empresaId).eq('sessao_id',persistencia.sessaoId).eq('id',atual.id);
   if(error) console.error('[recepcao] não foi possível finalizar telemetria',{tentativa:atual.id});
  }
  atual.finalizada=true;
 }
 const gerarTentativa:Gerar=async ({etapa,system,messages})=>{
  const taskKey=etapa==='paciente'?'recepcao_paciente':'recepcao_avaliacao';
  const model=await getModelForTask(empresaId,taskKey);
  const chamada={id:randomUUID(),etapa,model,promptHash:createHash('sha256').update(system).digest('hex'),promptVersion:'recepcao-2.2-limite-contestado'};
  atual={id:chamada.id,inicio:Date.now(),finalizada:false};
  if(persistencia) {
   const {error}=await persistencia.sb.from('recepcao_tentativas').insert({id:chamada.id,empresa_id:empresaId,sessao_id:persistencia.sessaoId,etapa,modelo_solicitado:model,prompt_hash:chamada.promptHash,prompt_versao:chamada.promptVersion,cenario_versao:persistencia.cenarioVersao});
   if(error) { atual.finalizada=true; throw new Error('Não foi possível registrar a tentativa de IA.'); }
  }
  chamadas.push(chamada);
  try {
   const raw=await callAIChat(system,messages,{model},etapa==='paciente'?4000:8000,{
    taskKey,empresaId,colaboradorId,source:admin?'piloto':'wrapper',locale:'pt-BR',correlationId:persistencia?chamada.id:undefined,
    temperature:etapa==='paciente'?0.6:0,timeoutMs:45000,maxRetries:0,
   });
   return JSON.stringify((etapa==='paciente'?pacienteSchema:avaliacaoSchema).parse(parseJsonIA(raw)));
 } catch(e) { await validar(e);throw e; }
 };
 const gerar:Gerar=async args=>{
  try {return await gerarTentativa(args);}
  catch(e) {
   // Uma única regeneração de formato, com custo e rejeição em registros próprios.
   // O avaliador já tem seu retry no core; falhas de rede não são repetidas aqui.
   if(args.etapa!=='paciente' || !(e instanceof SyntaxError || e instanceof z.ZodError)) throw e;
   return gerarTentativa({...args,system:args.system+'\nA saída anterior tinha formato inválido. Gere novamente a fala em um objeto JSON com a única chave fala, string de 1 a 800 caracteres. Escape aspas e quebras de linha. Preserve o personagem e responda à mesma conversa.'});
  }
 };
 return {chamadas,gerar,validar};
}
