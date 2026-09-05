import { z } from 'zod';

const ref = z.object({ mensagemId: z.string().max(40), trecho: z.string().trim().min(1).max(4000) }).strict();
export const pacienteSchema = z.object({ fala: z.string().trim().min(1).max(800) }).strict();
export const avaliacaoSchema = z.object({
  dimensoes: z.array(z.object({
    id: z.enum(['acolhimento', 'compreensao', 'clareza', 'resolucao', 'procedimentos']),
    classificacao: z.enum(['adequado', 'parcial', 'insuficiente', 'nao_observavel']),
    justificativa: z.string().min(1).max(1600), evidencias: z.array(ref).max(12), oportunidades: z.array(ref).max(12),
  }).strict()).length(5),
  ocorrencias: z.array(z.object({ categoria: z.enum(['orientacao_clinica_indevida', 'divulgacao_dado_terceiro', 'desrespeito_grave']),
    motivo: z.string().min(1).max(1600), evidencias: z.array(ref).min(1).max(12) }).strict()).max(12),
  desfecho: z.object({ tipo: z.enum(['remarcado', 'encaminhado', 'nao_resolvido', 'inconclusivo']),
    justificativa: z.string().min(1).max(1600), evidencias: z.array(ref).max(12) }).strict(),
  feedback: z.object({ acerto: z.string().min(1).max(1800), melhoria: z.string().min(1).max(1800), novaTentativa: z.string().min(1).max(1800) }).strict(),
}).strict();
const base = { empresaId: z.string().uuid().optional() };
export const comandoSchema = z.discriminatedUnion('acao', [
  z.object({ ...base, acao: z.literal('iniciar'), requestId: z.string().uuid() }).strict(),
  z.object({ ...base, acao: z.literal('responder'), sessaoId: z.string().uuid(), requestId: z.string().uuid(), revisao: z.number().int().nonnegative(), mensagem: z.string().trim().min(1).max(4000) }).strict(),
  z.object({ ...base, acao: z.literal('encerrar'), sessaoId: z.string().uuid(), revisao: z.number().int().nonnegative() }).strict(),
]);
export const configSchema = z.object({ empresaId: z.string().uuid(), habilitado: z.boolean() }).strict();
