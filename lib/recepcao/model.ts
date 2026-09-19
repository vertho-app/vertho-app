import type { RecepcaoSessaoStatus } from '@/lib/status';
import type { Cenario } from './schema';
import type { z } from 'zod';
import type { avaliacaoSchema } from './schema';
export type Insumos = z.infer<typeof avaliacaoSchema>;
export type Mensagem = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
};
export type Estado = {
  id: string;
  cenario: Cenario;
  status: RecepcaoSessaoStatus;
  motivoFim: string | null;
  respostas: number;
  revisao: number;
  historico: Mensagem[];
  recibos: Array<{ requestId: string; mensagem: string; fala: string }>;
  variante?: number;
  cenarioRegistroId?: string;
  relatorio:
    | (Omit<Insumos, 'dimensoes'> & {
        versaoCenario: string;
        versaoRubrica: string;
        nota: number | null;
        coberturaPercentual: number;
        situacao: string;
        dimensoes: Array<
          Insumos['dimensoes'][number] & { peso: number; nome?: string }
        >;
        escalaNota?: '1-4';
        escalaOriginal?: '0-100';
        matrizVersao?: string;
        /** Versão da regra de cobertura (18/09/2026); ausente = relatório anterior a ela. */
        regraCobertura?: string;
        /** Descritores rebaixados porque a citação não conferiu com a conversa. */
        descartados?: string[];
        competencias?: Array<{
          codigo: string;
          nome: string;
          nota: number | null;
          nivel: number | null;
          observados: number;
          total: number;
          suficiente?: boolean;
          descritores: string[];
        }>;
      })
    | null;
};
export type Gerar = (args: {
  etapa: string;
  perfilPaciente?: 'negociavel' | 'resistencia_persistente';
  escala?: 'n4' | 'legado';
  /** Teto desta chamada; o avaliador reparte um orçamento único entre as tentativas. */
  timeoutMs?: number;
  /** Segmento do caso, para a telemetria separar os prompts por domínio. */
  dominio?: string;
  system: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
}) => Promise<string>;
export type Validacao = (erro?: unknown) => Promise<void>;
