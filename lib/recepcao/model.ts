import type { RecepcaoSessaoStatus } from '@/lib/status';
import type { Cenario } from './schema';
import type { z } from 'zod';
import type { avaliacaoSchema } from './schema';
export type Insumos = z.infer<typeof avaliacaoSchema>;
export type Mensagem = { id:string; role:'user'|'assistant'; content:string };
export type Estado = {
  id:string; cenario:Cenario; status:RecepcaoSessaoStatus;
  motivoFim:string|null; respostas:number; revisao:number; historico:Mensagem[];
  recibos:Array<{requestId:string;mensagem:string;fala:string}>;
  variante?:number; cenarioRegistroId?:string;
  relatorio:(Omit<Insumos,'dimensoes'> & {versaoCenario:string;versaoRubrica:string;nota:number|null;coberturaPercentual:number;situacao:string;dimensoes:Array<Insumos['dimensoes'][number]&{peso:number;nome?:string}>})|null;
};
export type Gerar = (args:{etapa:string;perfilPaciente?:'negociavel'|'resistencia_persistente';system:string;messages:Array<{role:'user'|'assistant';content:string}>})=>Promise<string>;
export type Validacao = (erro?:unknown)=>Promise<void>;
