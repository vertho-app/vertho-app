/**
 * Janela de uma PARTICIPAÇÃO: o que conta como "desta turma" quando a mesma
 * pessoa passa por mais de uma jornada.
 *
 * O defeito que isto corrige (07/10/2026, Ibipeba): a turma nova ("Temporada 2")
 * nasceu com 41/53 respondidos, 40/53 avaliados e 39/53 jornadas, que eram a
 * vida inteira de cada pessoa. O painel perguntava "esta PESSOA tem alguma
 * resposta/IA4/trilha na empresa?", e a turma antiga, com os membros marcados
 * como `removido`, perdia os números. Respostas, blueprint e PDI não guardam
 * turma nem temporada; o que separa uma jornada da outra é QUANDO ela abriu.
 *
 * A regra, em duas linhas:
 *  - uma participação com `marco_jornada` ABRE uma jornada nova;
 *  - a janela dela vai do marco até o marco da PRÓXIMA participação da mesma
 *    pessoa que também tenha marco (ou até sempre, se não houver).
 * Participação SEM marco continua a jornada em curso (herda o início da anterior):
 * é o desmembramento de uma turma em duas, em que as respostas dadas antes do
 * corte são da mesma jornada. Por isso NULL em tudo preserva a conta de hoje.
 *
 * `removido` não entra na sequência: quem saiu por engano não corta o histórico
 * de ninguém.
 */

import { TURMA_MEMBRO } from '@/lib/status';

export interface ParticipacaoLinha {
  id: string;
  turma_id: string;
  colaborador_id: string;
  status: string;
  created_at?: string | null;
  marco_jornada?: string | null;
}

/** Intervalo `[de, ate)` em ms desde a época. `null` = sem limite daquele lado. */
export interface Janela {
  de: number | null;
  ate: number | null;
}

/** Sem limite nenhum: a participação não abriu nem fechou jornada (conta como antes). */
export const JANELA_ABERTA: Janela = { de: null, ate: null };

const ms = (v: string | null | undefined): number | null => {
  if (!v) return null;
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : null;
};

/** A participação só conta para a turma se está ativa ou terminou (não se foi removida). */
export function participacaoConta(status: string): boolean {
  return status === TURMA_MEMBRO.ATIVO || status === TURMA_MEMBRO.CONCLUIDO;
}

/**
 * Janela de CADA participação (por id), olhando a sequência de participações da
 * mesma pessoa em ordem de criação.
 */
export function janelasDasParticipacoes(todas: ParticipacaoLinha[]): Map<string, Janela> {
  const porPessoa = new Map<string, ParticipacaoLinha[]>();
  for (const p of todas || []) {
    if (!participacaoConta(p.status)) continue;
    const lista = porPessoa.get(p.colaborador_id) || [];
    lista.push(p);
    porPessoa.set(p.colaborador_id, lista);
  }

  const janelas = new Map<string, Janela>();
  for (const lista of porPessoa.values()) {
    lista.sort((a, b) => (ms(a.created_at) ?? 0) - (ms(b.created_at) ?? 0) || a.id.localeCompare(b.id));

    let inicioDaJornada: number | null = null;
    lista.forEach((p, i) => {
      const marco = ms(p.marco_jornada);
      if (marco !== null) inicioDaJornada = marco;

      let fim: number | null = null;
      for (let j = i + 1; j < lista.length; j++) {
        const proximo = ms(lista[j].marco_jornada);
        if (proximo !== null) { fim = proximo; break; }
      }
      janelas.set(p.id, { de: inicioDaJornada, ate: fim });
    });
  }
  return janelas;
}

/** A janela corta alguma coisa? Sem corte, vale a conta antiga (por pessoa). */
export function janelaTemCorte(j: Janela): boolean {
  return j.de !== null || j.ate !== null;
}

/** `instante` cai em `[de, ate)`? Instante ausente ou ilegível NÃO entra numa janela com corte. */
export function dentroDaJanela(instante: string | null | undefined, j: Janela): boolean {
  if (!janelaTemCorte(j)) return true;
  const t = ms(instante);
  if (t === null) return false;
  if (j.de !== null && t < j.de) return false;
  if (j.ate !== null && t >= j.ate) return false;
  return true;
}

export interface RespostaDatada {
  colaborador_id?: string | null;
  nivel_ia4?: number | null;
  timestamp_resposta?: string | null;
  created_at?: string | null;
}

/** Quando a pessoa respondeu: o carimbo de resposta, ou o de criação da linha. */
export function instanteDaResposta(r: RespostaDatada): string | null {
  return r.timestamp_resposta || r.created_at || null;
}

/**
 * A pessoa respondeu / foi avaliada DENTRO da janela? A avaliação conta só se for
 * de uma resposta da própria janela: nota de uma resposta antiga não faz a
 * jornada nova parecer avaliada.
 */
export function respondeuNaJanela(
  respostasDaPessoa: RespostaDatada[],
  j: Janela,
): { respondeu: boolean; avaliado: boolean } {
  let respondeu = false;
  let avaliado = false;
  for (const r of respostasDaPessoa || []) {
    if (!dentroDaJanela(instanteDaResposta(r), j)) continue;
    respondeu = true;
    if (r.nivel_ia4 !== null && r.nivel_ia4 !== undefined) avaliado = true;
  }
  return { respondeu, avaliado };
}

export interface TrilhaDatada {
  id?: string;
  colaborador_id?: string | null;
  turma_membro_id?: string | null;
  data_inicio?: string | null;
  criado_em?: string | null;
}

/**
 * A trilha da participação, ou `null`.
 *
 *  - Janela SEM corte: vale a conta de sempre (qualquer trilha da pessoa), para
 *    nenhuma turma sem marco mudar de número.
 *  - Janela COM corte: a trilha carimbada com ESTA participação; trilha legada
 *    (sem carimbo) só se nasceu dentro da janela. Trilha carimbada com outra
 *    participação é de outra jornada, mesmo que o colaborador seja o mesmo.
 * Havendo mais de uma, a mais recente.
 */
export function trilhaDaParticipacao<T extends TrilhaDatada>(
  participacaoId: string,
  j: Janela,
  trilhasDaPessoa: T[],
): T | null {
  const candidatas = (trilhasDaPessoa || []).filter((t) => {
    if (!janelaTemCorte(j)) return true;
    if (t.turma_membro_id) return t.turma_membro_id === participacaoId;
    return dentroDaJanela(t.criado_em, j);
  });
  if (!candidatas.length) return null;
  return candidatas.reduce((a, b) => ((ms(b.criado_em) ?? 0) > (ms(a.criado_em) ?? 0) ? b : a));
}

/** Instante gravado em `marco_jornada` e em `created_at` ao abrir uma jornada nova. */
export function marcoAgora(agora: Date = new Date()): string {
  return agora.toISOString();
}
