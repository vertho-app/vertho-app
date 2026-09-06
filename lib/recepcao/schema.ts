import { z } from 'zod';

const texto = z.string().trim().min(1).max(4000);
const chave = z.string().regex(/^[a-z][a-z0-9_\-]{1,63}$/);
const paciente = z.object({ postura: z.enum(['negociavel', 'resistencia_persistente']).optional(), nome: texto, abertura: texto.max(800), comportamento: texto, fatos: z.array(texto).min(1).max(12), limites: texto }).strict();
export const cenarioSchema = z.object({
  id: chave, versao: z.string().min(1).max(40), rubricaVersao: z.string().min(1).max(40),
  dominio: z.literal('recepcao_medica'), statusEditorial: z.string().max(60),
  publico: z.object({
    titulo: texto.max(160), objetivo: texto, aviso: texto, contexto: texto, agora: texto.optional(),
    clinica: texto.optional(), canal: z.enum(['mensagens', 'telefone']).default('mensagens'),
    escopoAvaliacao: texto.optional(), consultaAnterior: texto.optional(),
    alternativas: z.array(z.object({ id: texto, data: texto, hora: texto, profissional: texto, condicao: texto.optional() }).strict()).max(12).optional(),
    secoes: z.array(z.object({ titulo: texto.max(120), itens: z.array(texto).min(1).max(15) }).strict()).max(8).default([]),
    procedimentos: z.array(texto).min(1).max(20),
  }).strict(),
  paciente, variantes: z.array(paciente).max(3).default([]),
  rubrica: z.array(z.object({ id: chave, nome: texto.max(120).optional(), peso: z.number().positive().max(100), criterio: texto, adequado: texto, parcial: texto, insuficiente: texto }).strict()).min(3).max(7),
  ocorrenciasCriticas: z.array(chave).max(12), desfechos: z.array(chave).min(1).max(12),
  limiteRespostas: z.number().int().min(1).max(20),
}).strict().superRefine((c, ctx) => {
  if (c.rubrica.reduce((s,d)=>s+d.peso,0)!==100) ctx.addIssue({code:'custom',path:['rubrica'],message:'Os pesos devem somar 100.'});
  if (new Set(c.rubrica.map(d=>d.id)).size!==c.rubrica.length) ctx.addIssue({code:'custom',path:['rubrica'],message:'Competências duplicadas.'});
  for (const k of ['ocorrenciasCriticas','desfechos'] as const) if(new Set(c[k]).size!==c[k].length) ctx.addIssue({code:'custom',path:[k],message:'Identificadores duplicados.'});
});
export type Cenario = z.infer<typeof cenarioSchema>;

const ref = z.object({ mensagemId: z.string().max(40), trecho: z.string().trim().min(1).max(4000) }).strict();
export const pacienteSchema = z.object({ fala: z.string().trim().min(1).max(800) }).strict();
export const avaliacaoSchema = z.object({
  dimensoes: z.array(z.object({
    id: chave,
    classificacao: z.enum(['adequado', 'parcial', 'insuficiente', 'nao_observavel']),
    justificativa: z.string().min(1).max(1600), evidencias: z.array(ref).max(12), oportunidades: z.array(ref).max(12),
  }).strict()).min(3).max(7),
  ocorrencias: z.array(z.object({ categoria: chave,
    motivo: z.string().min(1).max(1600), evidencias: z.array(ref).min(1).max(12) }).strict()).max(12),
  desfecho: z.object({ tipo: chave,
    justificativa: z.string().min(1).max(1600), evidencias: z.array(ref).max(12) }).strict(),
  feedback: z.object({ acerto: z.string().min(1).max(1800), melhoria: z.string().min(1).max(1800), novaTentativa: z.string().min(1).max(1800) }).strict(),
}).strict();
const base = { empresaId: z.string().uuid().optional() };
export const comandoSchema = z.discriminatedUnion('acao', [
  z.object({ ...base, acao: z.literal('iniciar'), requestId: z.string().uuid(), cenarioId: z.string().uuid().optional() }).strict(),
  z.object({ ...base, acao: z.literal('responder'), sessaoId: z.string().uuid(), requestId: z.string().uuid(), revisao: z.number().int().nonnegative(), mensagem: z.string().trim().min(1).max(4000) }).strict(),
  z.object({ ...base, acao: z.literal('encerrar'), sessaoId: z.string().uuid(), revisao: z.number().int().nonnegative() }).strict(),
]);
export const configSchema = z.object({ empresaId: z.string().uuid(), habilitado: z.boolean() }).strict();

export const editarCenarioSchema = z.object({ ...base, acao:z.enum(['salvar','publicar','arquivar']), id:z.string().uuid().optional(), revisao:z.number().int().nonnegative().optional(), conteudo:cenarioSchema.optional() }).strict();
export const revisaoSchema = z.object({ ...base, sessaoId:z.string().uuid(), requestId:z.string().uuid(), parecer:z.enum(['concordo','parcialmente','discordo']), motivo:texto, dimensoes:z.array(chave).max(7).default([]) }).strict();
