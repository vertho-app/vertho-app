import { z } from 'zod';
import type { VendasSessaoStatus } from '@/lib/status';
import { matrizAvaliacaoSchema } from './matriz-avaliacao';

export const ETAPAS = ['criador', 'cliente', 'moderador', 'intencao', 'gerente'] as const;
export type Etapa = (typeof ETAPAS)[number];
export const FASES = ['preparar', 'analisar', 'cocriar', 'engajar'] as const;
export const faseSchema = z.enum(FASES);
export const ROTULOS = {
  preparar: 'Preparar',
  analisar: 'Analisar',
  cocriar: 'Co-criar',
  engajar: 'Engajar',
};
export const NIVEIS = { 1: 'Júnior', 2: 'Pleno', 3: 'Sênior' };
export const MAX_TURNOS = 60; // Limite técnico de contexto e tamanho da sessão.
export const REGUA_VERSION = 'pace-4';
/** A pace-2 já separava notas brutas do gerente e pontuação determinística no servidor. */
export function usaGerenteBruto(versao?: string) {
  return versao === 'pace-2' || versao === 'pace-3' || versao === REGUA_VERSION;
}
export const RETENCAO_MESES = 6;
const texto = z.string();
const objecao = z.object({
  descricao: texto.trim().min(1),
  minimo_aceitavel: texto,
  ideal: texto,
});
export const cenarioSchema = z.object({
  contexto_vendedor: texto.min(1),
  contexto_gerente: texto.min(1),
  personagem: z.object({
    nome: texto.min(1),
    cargo: texto,
    empresa: texto,
    cidade: texto,
    personalidade_pace: z.enum(['Dominante', 'Influente', 'Estável', 'Conforme']),
    traco_dominante: texto,
    tom_linguagem: texto,
    historia: texto,
    personalidade_nivel: z.object({
      nivel: z.enum(['Junior', 'Pleno', 'Senior']),
      descricao: texto,
      nota_corte_objecao: z.number(),
      nota_corte_preco: z.number(),
      cenarios_validos: z.array(
        z.object({
          nome: texto,
          nota_corte_objecao: z.number(),
          nota_corte_preco: z.number(),
        }),
      ),
      regra_avaliacao: texto,
    }),
    negociacao: z.object({
      nome_vendedor: texto,
      objecoes: z.array(objecao).min(1),
      objecoes_profundas: z.array(objecao.extend({ gatilho_revelacao: texto })),
      beneficios_ocultos: z
        .array(
          z.object({
            nome: texto.trim().min(1),
            categoria: texto,
            prova_esperada: texto,
            gatilho_descoberta: texto,
            peso: z.number(),
          }),
        )
        .min(1),
      // Preço não aplicável é "" no contrato do criador; contexto e identidade continuam obrigatórios.
      preco: z.object({ minimo_aceitavel: texto, ideal: texto }),
      notas_cortes: z.object({
        negociacao_objecoes: z.number(),
        negociacao_preco: z.number(),
      }),
    }),
  }),
});
const categoria = z.enum([
  'linguagem_agressiva',
  'assedio',
  'discriminacao',
  'ameaca',
  'jailbreak',
  'fuga_de_contexto',
]);
const severidade = z.enum(['leve', 'moderada', 'grave']);
const confianca = z.enum(['alta', 'media', 'baixa']);
export const moderadorSchema = z.object({
  violacao: z.boolean(),
  categoria: categoria.nullable(),
  severidade: severidade.nullable(),
  acao_sugerida: z.enum(['registrar_e_seguir', 'avisar_vendedor', 'encerrar_sessao']).nullable(),
  confianca: confianca.nullable(),
  motivo: texto.nullable(),
});
export const clienteSchema = z.object({
  fase: faseSchema,
  fase_mudou: z.boolean(),
  fala: texto.trim().min(1).max(400),
});
export const intencaoSchema = z.object({
  intencao_encerrar: z.boolean(),
  confianca,
});
const nota = z.number().min(0).max(10).multipleOf(0.5);
const descoberta = z.object({
  nome: texto,
  turno: z.number().int().positive(),
  citacao_vendedor: texto.min(1),
});
export const relatorioLegadoSchema = z.object({
  P: nota,
  A: nota,
  C: nota,
  E: nota,
  Media: nota,
  Preparacao: texto.max(280),
  Analise: texto.max(280),
  Cocriacao: texto.max(280),
  Engajamento: texto.max(280),
  Resumo: texto.max(500),
  Recomendacoes: z.array(
    z.object({
      titulo: texto.max(60),
      descricao: texto.max(250),
      prioritaria: z.boolean(),
    }),
  ),
  Resultado: z.enum(['fechou_ideal', 'fechou_aceitavel', 'nao_fechou', 'inconclusivo']),
  Preco_final: texto,
  Compromissos_obtidos: texto,
  Beneficios_ocultos_descobertos: z.array(descoberta),
  Objecoes_profundas_descobertas: z.array(descoberta),
  Violacoes: z.array(
    z.object({
      turno: z.number().int().positive(),
      fase: faseSchema,
      categoria,
      severidade,
      motivo: texto,
      pilar_penalizado: z.enum(['P', 'A', 'C', 'E']),
      reducao_aplicada: z.number().min(0),
    }),
  ),
});
export const relatorioSchema = relatorioLegadoSchema.extend({
  Matriz: matrizAvaliacaoSchema.optional(),
});
export const SAIDAS = {
  criador: cenarioSchema,
  cliente: clienteSchema,
  moderador: moderadorSchema,
  intencao: intencaoSchema,
  gerente: relatorioSchema,
};
// A IA avalia os pilares SEM desconto. Média e penalidades pertencem ao motor, não ao modelo.
export const gerenteBrutoSchema = relatorioLegadoSchema.omit({
  Media: true,
  Violacoes: true,
});
export const gerenteMatrizSchema = gerenteBrutoSchema
  .omit({ P: true, A: true, C: true, E: true })
  .extend({ Matriz: matrizAvaliacaoSchema });
export type Saidas = { [K in Etapa]: z.infer<(typeof SAIDAS)[K]> };
const pontuacaoFeedback = z.number().int().min(1).max(5);
export const feedbackSchema = z.object({
  realismo: pontuacaoFeedback,
  desafio: pontuacaoFeedback,
  interacao: pontuacaoFeedback,
  utilidade: pontuacaoFeedback,
  aprendizado: pontuacaoFeedback,
  comentario: texto.trim().max(2000),
});
const base = {
  requestId: z.string().uuid(),
  empresaId: z.string().uuid().optional(),
};
const sessao = {
  ...base,
  sessaoId: z.string().uuid(),
  revisao: z.number().int().nonnegative(),
};
export const comandoSchema = z.discriminatedUnion('acao', [
  z
    .object({
      ...base,
      acao: z.literal('iniciar'),
      nivel: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    })
    .strict(),
  z
    .object({
      ...sessao,
      acao: z.literal('responder'),
      mensagem: texto.trim().min(1).max(4000),
    })
    .strict(),
  z
    .object({
      ...sessao,
      acao: z.literal('planejar'),
      planejamento: texto.trim().min(1).max(6000),
    })
    .strict(),
  z.object({ ...sessao, acao: z.literal('encerrar') }).strict(),
  z.object({ ...sessao, acao: z.literal('abandonar') }).strict(),
  z
    .object({
      ...sessao,
      acao: z.literal('feedback'),
      feedback: feedbackSchema,
    })
    .strict(),
]);
export type Comando = z.infer<typeof comandoSchema>;
export const configSchema = z
  .object({
    empresaId: z.string().uuid(),
    habilitado: z.boolean(),
    briefing: texto.trim().min(40).max(24000),
    revisao: z.number().int().nonnegative(),
    periodoInicio: z.string().datetime().nullable(),
    periodoFim: z.string().datetime().nullable(),
  })
  .strict()
  .superRefine((c, ctx) => {
    const temPeriodo =
      !!c.periodoInicio && !!c.periodoFim && Date.parse(c.periodoFim) > Date.parse(c.periodoInicio);
    if ((c.periodoInicio !== null || c.periodoFim !== null) && !temPeriodo)
      ctx.addIssue({
        code: 'custom',
        message: 'Informe o período completo, com fim posterior ao início.',
        path: ['periodoFim'],
      });
    if (c.habilitado && !temPeriodo)
      ctx.addIssue({
        code: 'custom',
        message: 'Para liberar participantes, defina o prazo de acesso.',
        path: ['habilitado'],
      });
  });
export type Config = {
  habilitado: boolean;
  briefing: string;
  revisao: number;
  periodo_inicio: string | null;
  periodo_fim: string | null;
};
export const CONFIG_COLUNAS = 'habilitado,briefing,revisao,periodo_inicio,periodo_fim';
export type PromptSnapshot = Record<
  Etapa,
  { texto?: string; id?: string; hash: string; versao: string; modelo: string }
>;
export type Mensagem = {
  id: string;
  turno: number;
  autor: 'vendedor' | 'cliente';
  texto: string;
  fase: z.infer<typeof faseSchema>;
};
export type Moderacao = Saidas['moderador'] & {
  turno: number;
  fase: z.infer<typeof faseSchema>;
};
export type Estado = {
  id: string;
  revisao: number;
  status: VendasSessaoStatus;
  nivel: 1 | 2 | 3;
  nomeVendedor: string;
  briefing: string;
  prompts: PromptSnapshot;
  cenario: Saidas['criador'] | null;
  fase: z.infer<typeof faseSchema>;
  mensagens: Mensagem[];
  moderacoes: Moderacao[];
  intencao: Saidas['intencao'] | null;
  relatorio: Saidas['gerente'] | null;
  feedback: z.infer<typeof feedbackSchema> | null;
  criadoEm: string;
  encerradoEm: string | null;
  recibos: Array<{ requestId: string; assinatura: string }>;
  versaoRegua?: string;
  planejamento?: string;
  notasBrutas?: Pick<Saidas['gerente'], 'P' | 'A' | 'C' | 'E'>;
  diversidade?: { seed: string; anteriores: string[] };
  dadosMascarados?: boolean;
};
