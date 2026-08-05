// CONARH 52 — estado da sessão no cliente (telemetria da demo).
// Tudo acumula aqui e sai num ÚNICO submit ao final (ver capture.ts).
// "Novo visitante" = nova instância disto; nada persiste entre sessões.

export type NumeroPorta = 1 | 2 | 3 | 4 | 5;

/**
 * O que a porta 2 mede desde 05/08/2026.
 *
 * A porta trocou de mecanismo DUAS vezes, e a métrica trocou junto nas duas —
 * de propósito, porque nome velho medindo coisa nova é como um painel passa a
 * mentir sem ninguém perceber:
 *
 *   registro escrito  → `nota_instintiva`/`reavaliacao`/`divergencias` (extintos)
 *   4 respostas       → `nivel_aceito` × `nivel_meta` (extintos em 05/08)
 *   conversa avaliada → `nivel_atribuido` × `nivel_regua`  ← hoje
 *
 * O visitante não escolhe mais qual resposta aceitaria: ele lê a conversa que
 * a plataforma teve com a pessoa avaliada e faz o MESMO trabalho da régua —
 * classifica num nível. O número do evento passa a ser a distância entre a
 * leitura dele e a leitura da régua sobre a MESMA conversa (quantos leram
 * acima, quantos leram igual), que é mais forte do que a média anterior: as
 * duas leituras olham exatamente o mesmo material.
 *
 * Leads gravados antes de 05/08/2026 têm `nivel_aceito` e ficam FORA da conta
 * — as duas medidas não são comparáveis, e converter uma na outra em silêncio
 * inventaria um dado que ninguém coletou.
 */
export interface CenarioPorta2 {
  regua: string; // id da régua percorrida (caso | relacionamento-clientes | resolucao-de-problemas)
  competencia: string;
  cenario: string; // id do cenário
  descritor: string; // cod do descritor que a conversa testa
  nivel_atribuido: number; // 1–4 — o nível que o VISITANTE deu à conversa
  nivel_regua: number; // 1–4 — o nível que a régua lê na mesma conversa
  nota_regua: number; // a nota da régua (ex.: 1,5), derivada dos turnos
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
