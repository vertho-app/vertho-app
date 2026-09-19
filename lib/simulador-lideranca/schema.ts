import { z } from 'zod';
import type { LinhaMatriz } from '@/lib/simuladores/lideranca/matriz-global';

/**
 * v2 (18/09/2026): cada encontro avalia foco + 2 secundárias (18 descritores),
 * com a regra de cobertura comum, citação tolerante e fonte por descritor. A
 * jornada v1 continua aceita: ao abrir, ganha os prompts da v2 (nenhum encontro
 * dela foi concluído em produção; os que existirem seguem lidos como gerados).
 */
export const VERSAO = 'lideranca-jornada-2';
export const VERSAO_ANTERIOR = 'lideranca-jornada-1';
export const MAX_TURNOS = 16;
export const MIN_TURNOS = 3;
const texto = (max: number) => z.string().trim().min(1).max(max);
const evidencia = z
  .object({
    fonte: z.enum(['planejamento', 'fala', 'reflexao']),
    turno: z.number().int().min(0),
    trecho: texto(800),
  })
  .strict();
export const avaliacaoSchema = z
  .object({
    sintese: texto(1800),
    proximaPratica: texto(1200),
    descritores: z
      .array(
        z
          .object({
            codigo: texto(20),
            nivel: z.number().int().min(1).max(4).nullable(),
            justificativa: texto(900),
            evidencias: z.array(evidencia).max(2),
          })
          .strict(),
      )
      .min(1)
      .max(30),
  })
  .strict();
export const aberturaSchema = z
  .object({ contexto: texto(2000), fala: texto(1600) })
  .strict();
export const falaSchema = z.object({ fala: texto(1800) }).strict();
export const consequenciaSchema = z
  .object({
    narrativa: texto(2200),
    acordos: z
      .array(
        z
          .object({
            descricao: texto(600),
            turno: z.number().int().min(1),
            trecho: texto(800),
          })
          .strict(),
      )
      .max(5),
    pendencias: z.array(texto(600)).max(5),
  })
  .strict();
export type Avaliacao = z.infer<typeof avaliacaoSchema>;
/** A avaliação como fica no encontro: descritores com citação inválida rebaixados e a regra aplicada. */
export type AvaliacaoGravada = Avaliacao & {
  descartados?: string[];
  regraCobertura?: string;
};
export type Consequencia = z.infer<typeof consequenciaSchema>;
export type Mensagem = {
  turno: number;
  autor: 'lider' | 'personagem';
  texto: string;
};
export type Episodio = {
  id: string;
  indice: number;
  repeticao: boolean;
  iniciadoEm: string;
  encerradoEm: string | null;
  contexto: string;
  plano: string | null;
  mensagens: Mensagem[];
  reflexao: string | null;
  antecedentes: Consequencia[];
  consequencia: Consequencia | null;
  avaliacao: AvaliacaoGravada | null;
};
export type Etapa = 'abertura' | 'personagem' | 'consequencia' | 'avaliador';
export type Estado = {
  versao: typeof VERSAO | typeof VERSAO_ANTERIOR;
  matriz: LinhaMatriz[];
  modelos: Record<Etapa, string>;
  prompts: Record<Etapa, string>;
  ativo: Episodio | null;
  concluidos: Episodio[];
  recibos: Array<{ id: string; hash: string }>;
};
const base = {
  requestId: z.uuid(),
  empresaId: z.uuid().optional(),
  revisao: z.number().int().min(0),
};
export const comandoSchema = z.discriminatedUnion('acao', [
  z.object({ ...base, acao: z.literal('iniciar') }).strict(),
  z.object({ ...base, acao: z.literal('avancar') }).strict(),
  z
    .object({
      ...base,
      acao: z.literal('repetir'),
      episodio: z.number().int().min(0).max(4),
    })
    .strict(),
  // Desistir só existe para REPETIÇÃO: a jornada original não tem volta, por desenho.
  z.object({ ...base, acao: z.literal('abandonar') }).strict(),
  z
    .object({
      ...base,
      acao: z.literal('planejar'),
      texto: texto(6000).min(20),
    })
    .strict(),
  z
    .object({ ...base, acao: z.literal('responder'), texto: texto(3000) })
    .strict(),
  z
    .object({
      ...base,
      acao: z.literal('encerrar'),
      texto: texto(4000).min(20),
    })
    .strict(),
]);
export type Comando = z.infer<typeof comandoSchema>;
export type Saidas = {
  abertura: z.infer<typeof aberturaSchema>;
  personagem: z.infer<typeof falaSchema>;
  consequencia: Consequencia;
  avaliador: Avaliacao;
};
export const SAIDAS = {
  abertura: aberturaSchema,
  personagem: falaSchema,
  consequencia: consequenciaSchema,
  avaliador: avaliacaoSchema,
};
export type Gerar = <E extends Etapa>(
  etapa: E,
  dados: unknown,
  validar?: (valor: Saidas[E]) => void,
) => Promise<Saidas[E]>;

export class LiderancaError extends Error {
  constructor(
    public status: number,
    mensagem: string,
  ) {
    super(mensagem);
  }
}
