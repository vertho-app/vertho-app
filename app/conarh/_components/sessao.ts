// CONARH 52 — estado da sessão no cliente (telemetria da demo).
// Tudo acumula aqui e sai num ÚNICO submit ao final (ver capture.ts).
// "Novo visitante" = nova instância disto; nada persiste entre sessões.

export type NumeroPorta = 1 | 2 | 3 | 4 | 5;

export interface ReavaliacaoItem {
  descritor: string; // cod, ex. "FBK-D01"
  nota: number; // 1–4
}

export interface Telemetria {
  rotas_iniciadas: number[];
  rotas_concluidas: number[];
  nota_instintiva?: number;
  reavaliacao?: ReavaliacaoItem[];
  divergencias?: string[]; // cods dos descritores em que visitante ≠ motor
  /** Porta de onde a captura foi aberta — pré-preenche o formulário. */
  porta_origem?: NumeroPorta;
}

export function telemetriaVazia(): Telemetria {
  return { rotas_iniciadas: [], rotas_concluidas: [] };
}

export function marcarInicio(t: Telemetria, porta: NumeroPorta): Telemetria {
  if (t.rotas_iniciadas.includes(porta)) return t;
  return { ...t, rotas_iniciadas: [...t.rotas_iniciadas, porta] };
}

export function marcarConclusao(t: Telemetria, porta: NumeroPorta): Telemetria {
  if (t.rotas_concluidas.includes(porta)) return t;
  return { ...t, rotas_concluidas: [...t.rotas_concluidas, porta] };
}

export interface ResultadoPorta2 {
  nota_instintiva: number;
  reavaliacao: ReavaliacaoItem[];
  divergencias: string[];
}

export function registrarPorta2(t: Telemetria, r: ResultadoPorta2): Telemetria {
  return {
    ...t,
    nota_instintiva: r.nota_instintiva,
    reavaliacao: r.reavaliacao,
    divergencias: r.divergencias,
  };
}
