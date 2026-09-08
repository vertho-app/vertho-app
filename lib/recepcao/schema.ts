import { z } from 'zod';

const texto = z.string().trim().min(1).max(4000);
const chave = z.string().regex(/^[a-z][a-z0-9_\-]{1,63}$/);
// Comportamento esperado por nível. Rótulos seguem o vocabulário N1–N4 do produto (messages/pt-BR).
export const NIVEIS_COMPORTAMENTO = ['n1', 'n2', 'n3', 'n4'] as const;
export type NivelComportamento = typeof NIVEIS_COMPORTAMENTO[number];
export const rotuloClassificacao: Record<string, string> = {
  n1: 'N1 · Gap', n2: 'N2 · Em desenvolvimento', n3: 'N3 · Meta', n4: 'N4 · Referência',
  adequado: 'Adequado', parcial: 'Parcial', insuficiente: 'Precisa melhorar', nao_observavel: 'Sem oportunidade de observar',
};
export const niveisSchema = z.object({ n1: texto.max(1600), n2: texto.max(1600), n3: texto.max(1600), n4: texto.max(1600) }).strict();
const paciente = z.object({ postura: z.enum(['negociavel', 'resistencia_persistente']).optional(), nome: texto, abertura: texto.max(800), comportamento: texto, fatos: z.array(texto).min(1).max(12), limites: texto }).strict();
// Escada de dificuldade, em ordem. Opcional na ficha para não invalidar snapshots e cópias antigas;
// caso sem nível vai para o fim do seletor e não conta na sugestão.
export const NIVEIS = ['introducao', 'pressao', 'limite'] as const;
export type Nivel = typeof NIVEIS[number];
export const rotuloNivel: Record<Nivel, string> = { introducao: 'Introdução', pressao: 'Sob pressão', limite: 'Limite contestado' };

export const cenarioSchema = z.object({
  id: chave, versao: z.string().min(1).max(40), rubricaVersao: z.string().min(1).max(40),
  dominio: z.literal('recepcao_medica'), statusEditorial: z.string().max(60),
  publico: z.object({
    titulo: texto.max(160), objetivo: texto, aviso: texto, contexto: texto, agora: texto.optional(),
    clinica: texto.optional(), canal: z.enum(['mensagens', 'telefone']).default('mensagens'),
    nivel: z.enum(NIVEIS).optional(),
    escopoAvaliacao: texto.optional(), consultaAnterior: texto.optional(),
    alternativas: z.array(z.object({ id: texto, data: texto, hora: texto, profissional: texto, condicao: texto.optional() }).strict()).max(12).optional(),
    secoes: z.array(z.object({ titulo: texto.max(120), itens: z.array(texto).min(1).max(15) }).strict()).max(8).default([]),
    procedimentos: z.array(texto).min(1).max(20),
  }).strict(),
  paciente, variantes: z.array(paciente).max(3).default([]),
  // Escala nova: comportamento esperado em quatro níveis (copiado da biblioteca ao salvar).
  // Forma legada (adequado/parcial/insuficiente) continua aceita: linhas arquivadas e snapshots antigos.
  rubrica: z.array(z.object({ id: chave, nome: texto.max(120).optional(), peso: z.number().positive().max(100), criterio: texto,
    niveis: niveisSchema.optional(), adequado: texto.optional(), parcial: texto.optional(), insuficiente: texto.optional() }).strict()).min(3).max(7),
  ocorrenciasCriticas: z.array(chave).max(12), desfechos: z.array(chave).min(1).max(12),
  limiteRespostas: z.number().int().min(1).max(20),
}).strict().superRefine((c, ctx) => {
  if (c.rubrica.reduce((s,d)=>s+d.peso,0)!==100) ctx.addIssue({code:'custom',path:['rubrica'],message:'Os pesos devem somar 100.'});
  if (new Set(c.rubrica.map(d=>d.id)).size!==c.rubrica.length) ctx.addIssue({code:'custom',path:['rubrica'],message:'Competências duplicadas.'});
  for (const [i,d] of c.rubrica.entries()) {
    const legado = !!(d.adequado && d.parcial && d.insuficiente);
    if (!!d.niveis === legado) ctx.addIssue({code:'custom',path:['rubrica',i],message:'Cada competência tem os quatro níveis (n1 a n4) ou os três textos legados, não ambos nem nenhum.'});
  }
  if (new Set(c.rubrica.map(d=>!!d.niveis)).size>1) ctx.addIssue({code:'custom',path:['rubrica'],message:'A rubrica inteira usa uma só escala.'});
  for (const k of ['ocorrenciasCriticas','desfechos'] as const) if(new Set(c[k]).size!==c[k].length) ctx.addIssue({code:'custom',path:[k],message:'Identificadores duplicados.'});
});
export type Cenario = z.infer<typeof cenarioSchema>;

const ref = z.object({ mensagemId: z.string().max(40), trecho: z.string().trim().min(1).max(4000) }).strict();
export const pacienteSchema = z.object({ fala: z.string().trim().min(1).max(800) }).strict();
export const avaliacaoSchema = z.object({
  dimensoes: z.array(z.object({
    id: chave,
    classificacao: z.enum(['n1', 'n2', 'n3', 'n4', 'adequado', 'parcial', 'insuficiente', 'nao_observavel']),
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
// Biblioteca de competências (Catálogo Vertho). O código não muda depois de criado; excluir = desativar.
export const competenciaSchema = z.object({ codigo: chave, nome: texto.max(120), descricao: z.string().trim().max(1600).default(''), niveis: niveisSchema }).strict();
export const competenciaComandoSchema = z.object({ ...base, acao: z.literal('competencia'), op: z.enum(['salvar','excluir','restaurar']), id: z.string().uuid().optional(), revisao: z.number().int().nonnegative().optional(), conteudo: competenciaSchema.optional() }).strict();
export const revisaoSchema = z.object({ ...base, sessaoId:z.string().uuid(), requestId:z.string().uuid(), parecer:z.enum(['concordo','parcialmente','discordo']), motivo:texto, dimensoes:z.array(chave).max(7).default([]) }).strict();
