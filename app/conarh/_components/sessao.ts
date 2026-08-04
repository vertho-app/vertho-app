// CONARH 52 — estado da sessão no cliente (telemetria da demo).
// Tudo acumula aqui e sai num ÚNICO submit ao final (ver capture.ts).
// "Novo visitante" = nova instância disto; nada persiste entre sessões.

export type NumeroPorta = 1 | 2 | 3 | 4 | 5;

/**
 * O que a porta 2 mede desde 04/08/2026.
 *
 * A porta trocou o registro escrito pelo CENÁRIO com 4 respostas, então o que
 * dava para medir mudou de natureza: não há mais nota de olho nem reavaliação
 * descritor a descritor. O que sobra é mais forte como número de feira — o
 * NÍVEL que o visitante aceitaria de alguém do time dele. Se ele aceita um N2
 * onde a régua põe a meta em N3, essa é a distância entre o padrão que ele
 * cobra e o que ele diz querer.
 *
 * Os campos antigos (`nota_instintiva`, `reavaliacao`, `divergencias`) foram
 * REMOVIDOS em vez de reaproveitados: manter o nome velho medindo coisa nova
 * é como o painel passa a mentir sem ninguém perceber.
 */
export interface CenarioPorta2 {
  regua: string; // id da régua percorrida (caso | venda-consultiva | ...)
  competencia: string;
  cenario: string; // id do cenário
  descritor: string; // cod do descritor que a situação testa
  nivel_aceito: number; // 1–4 — nível da resposta que ele aceitaria
  nivel_meta: number; // 3 — a meta da régua
}

export interface Telemetria {
  rotas_iniciadas: number[];
  rotas_concluidas: number[];
  cenario?: CenarioPorta2;
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

export type ResultadoPorta2 = CenarioPorta2;

export function registrarPorta2(t: Telemetria, r: ResultadoPorta2): Telemetria {
  return { ...t, cenario: r };
}
