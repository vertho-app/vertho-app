/**
 * Health-check do pipeline — tipos e vocabulário.
 *
 * Princípio: um check só vale se PUDER FALHAR. Check que sempre passa (porque mede
 * a coisa errada, ou porque o denominador some quando os dados faltam) é pior que
 * nenhum: cria a sensação de cobertura. Por isso as regras aqui são funções puras,
 * testadas por MUTAÇÃO — quebra-se a invariante no código de produção e confirma-se
 * que o teste correspondente falha.
 */

export type Severidade = 'ok' | 'aviso' | 'critico';

export interface Achado {
  /** Identificador estável do check (kebab-case). Serve p/ série histórica. */
  id: string;
  severidade: Exclude<Severidade, 'ok'>;
  titulo: string;
  /** Quantas ocorrências. 0 nunca vira achado. */
  contagem: number;
  /** Frase curta que explica o EFEITO para a pessoa, não o sintoma técnico. */
  detalhe: string;
  /** Até 8 exemplos concretos (nome, id, tema) — o que torna o alerta acionável. */
  amostra?: string[];
  /** O que fazer. Comando, tela ou decisão. */
  acao?: string;
}

export interface ResultadoCheck {
  modo: 'preflight' | 'postflight' | 'estrutural' | 'horizonte';
  empresaId: string | null;
  empresaSlug?: string | null;
  dataAlvo: string | null;
  severidade: Severidade;
  achados: Achado[];
  duracaoMs: number;
  /** Preenchido se o próprio check explodiu. Silêncio por exceção é o pior caso. */
  erro?: string;
}

/** A severidade do run é a do pior achado. Sem achados = ok. */
export function severidadeGlobal(achados: Achado[]): Severidade {
  if (achados.some((a) => a.severidade === 'critico')) return 'critico';
  if (achados.length) return 'aviso';
  return 'ok';
}

/** Monta um achado, ou `null` quando não há ocorrência (0 nunca vira ruído). */
export function achado(
  id: string,
  severidade: Exclude<Severidade, 'ok'>,
  titulo: string,
  contagem: number,
  detalhe: string,
  extras: { amostra?: string[]; acao?: string } = {},
): Achado | null {
  if (!contagem) return null;
  return {
    id, severidade, titulo, contagem, detalhe,
    amostra: extras.amostra?.slice(0, 8),
    acao: extras.acao,
  };
}
