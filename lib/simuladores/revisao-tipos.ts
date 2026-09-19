/** Contrato da revisão humana que a tela conhece (sem dependência de servidor). */
export const PARECERES = ['concordo', 'parcialmente', 'discordo'] as const;
export type Parecer = (typeof PARECERES)[number];

export type RevisaoPublica = {
  id: string;
  parecer: Parecer;
  motivo: string;
  dimensoes: string[];
  revisor_nome: string;
  created_at: string;
  contexto?: {
    referencia: string;
    encontros: Array<{
      id: string;
      indice: number;
      repeticao?: boolean;
      encerradoEm?: string | null;
    }>;
  } | null;
};
