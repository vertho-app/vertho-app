/**
 * A JORNADA ATUAL de uma pessoa: a trilha que vale para a participação ATIVA dela.
 *
 * O defeito que isto corrige (09/10/2026, Ibipeba): a pessoa entrou na turma da
 * Temporada 2 (participação nova, com `marco_jornada`), mas a home e a tela da
 * temporada liam "a trilha mais recente da PESSOA", que era a da Temporada 1. Quem
 * tinha concluído via 100% e as semanas antigas; quem não tinha voltava para as
 * semanas 8 e 9. O mapeamento da temporada nova só se achava pelo link do WhatsApp.
 *
 * A regra é a da janela (`lib/turmas/janela.ts`), aplicada à participação ativa:
 *  - sem participação ativa, ou janela sem corte: a trilha mais recente da pessoa,
 *    como sempre foi (Macaé e qualquer turma sem marco não mudam);
 *  - janela com corte: a trilha carimbada com ESTA participação (ou legada nascida
 *    dentro da janela). Trilha de jornada anterior não é a atual, mesmo sendo a mais
 *    recente. `null` = a jornada atual ainda não tem trilha.
 */

import { TURMA_MEMBRO } from '@/lib/status';
import { lerTudoPaginado } from '@/lib/paginacao';
import {
  JANELA_ABERTA,
  dentroDaJanela,
  janelaTemCorte,
  janelasDasParticipacoes,
  trilhaDaParticipacao,
  trilhaPertence,
  type Janela,
  type ParticipacaoLinha,
  type TrilhaDatada,
} from '@/lib/turmas/janela';

export interface JornadaAtual<T> {
  /** Participação ativa, quando há. */
  participacaoId: string | null;
  /** Janela da participação ativa; sem corte quando não há participação ou marco. */
  janela: Janela;
  /** Trilha da jornada atual, ou `null` se ela ainda não tem trilha. */
  trilha: T | null;
  /** Havia trilha de jornada ANTERIOR (fora da janela)? Para a tela dizer que a jornada mudou. */
  temJornadaAnterior: boolean;
}

/** Colunas mínimas que a regra precisa da trilha; quem chama acrescenta as suas. */
export const COLUNAS_TRILHA_JANELA = 'id, criado_em, turma_membro_id';

const maisRecente = <T extends TrilhaDatada>(trilhas: T[]): T | null =>
  (trilhas || []).reduce<T | null>((a, b) => (!a || Date.parse(b.criado_em || '') > Date.parse(a.criado_em || '') ? b : a), null);

/** A regra, pura: participações da pessoa + trilhas da pessoa → jornada atual. */
export function escolherJornadaAtual<T extends TrilhaDatada>(
  participacoes: ParticipacaoLinha[],
  trilhas: T[],
): JornadaAtual<T> {
  const ativa = (participacoes || []).find((p) => p.status === TURMA_MEMBRO.ATIVO) || null;
  if (!ativa) {
    return { participacaoId: null, janela: JANELA_ABERTA, trilha: maisRecente(trilhas), temJornadaAnterior: false };
  }
  const janela = janelasDasParticipacoes(participacoes).get(ativa.id) || JANELA_ABERTA;
  const trilha = trilhaDaParticipacao(ativa.id, janela, trilhas || []);
  const temJornadaAnterior = janelaTemCorte(janela) && (trilhas || []).some((t) => !trilhaPertence(ativa.id, janela, t));
  return { participacaoId: ativa.id, janela, trilha, temJornadaAnterior };
}

/**
 * Um artefato da pessoa (PDI, blueprint) vale para a jornada atual? Vale se nasceu
 * dentro da janela; sem corte, vale sempre (a conta de antes).
 */
export function artefatoDaJornadaAtual(geradoEm: string | null | undefined, janela: Janela): boolean {
  return dentroDaJanela(geradoEm, janela);
}

/**
 * Lê participações e trilhas da pessoa e aplica a regra. Falha de leitura LANÇA:
 * "não consegui ler" virando "sem trilha" mandaria a pessoa para o lugar errado.
 *
 * @param colunasTrilha colunas extras da trilha que o chamador precisa (as da regra
 *        entram sempre).
 */
export async function carregarJornadaAtual(
  sb: any,
  empresaId: string,
  colaboradorId: string,
  colunasTrilha = '',
): Promise<JornadaAtual<any>> {
  const colunas = [COLUNAS_TRILHA_JANELA, colunasTrilha].filter(Boolean).join(', ');
  const [participacoesRes, trilhasRes] = await Promise.all([
    sb.from('turma_membros')
      .select('id, turma_id, colaborador_id, status, created_at, marco_jornada')
      .eq('empresa_id', empresaId)
      .eq('colaborador_id', colaboradorId),
    sb.from('trilhas')
      .select(colunas)
      .eq('empresa_id', empresaId)
      .eq('colaborador_id', colaboradorId)
      .order('criado_em', { ascending: false }),
  ]);
  if (participacoesRes.error) throw new Error(`não foi possível ler as participações: ${participacoesRes.error.message}`);
  if (trilhasRes.error) throw new Error(`não foi possível ler as trilhas: ${trilhasRes.error.message}`);
  return escolherJornadaAtual(participacoesRes.data || [], trilhasRes.data || []);
}

// ── A mesma regra em LOTE, para as filas (etapa 2, 17/10/2026) ──────────────────────────────────────────────────
//
// O Fluxo completo e os botões de lote decidiam "já tem blueprint / PDI / trilha" por PESSOA. Na Temporada 2 de
// Ibipeba, 25 das 34 pessoas que responderam tinham os três da Temporada 1 e seriam PULADAS. Com a jornada atual de
// cada pessoa, o artefato só conta se nasceu na janela dela; quem não tem participação ativa (ou tem sem marco)
// continua com a conta de sempre.

/** Participação ativa e janela da jornada atual de UMA pessoa. */
export interface JornadaDaPessoa {
  participacaoId: string;
  janela: Janela;
}

/** A regra, pura: participações de VÁRIAS pessoas → jornada atual de quem tem participação ativa. */
export function jornadasAtuaisPorPessoa(participacoes: ParticipacaoLinha[]): Map<string, JornadaDaPessoa> {
  const janelas = janelasDasParticipacoes(participacoes || []);
  const out = new Map<string, JornadaDaPessoa>();
  for (const p of participacoes || []) {
    if (p.status !== TURMA_MEMBRO.ATIVO) continue;
    out.set(p.colaborador_id, { participacaoId: p.id, janela: janelas.get(p.id) || JANELA_ABERTA });
  }
  return out;
}

/**
 * Lê as participações da empresa (paginado) e devolve a jornada atual por pessoa. `tdb` já filtra a empresa.
 * Falha de leitura LANÇA: "não li as turmas" virando "ninguém tem jornada nova" faria a fila pular a Temporada 2.
 */
export async function carregarJornadasAtuais(tdb: any): Promise<Map<string, JornadaDaPessoa>> {
  const q = await lerTudoPaginado((de, ate) => tdb.from('turma_membros')
    .select('id, turma_id, colaborador_id, status, created_at, marco_jornada').order('id').range(de, ate));
  if (q.error) throw new Error(`não foi possível ler as participações: ${q.error}`);
  return jornadasAtuaisPorPessoa(q.data as ParticipacaoLinha[]);
}

/** O artefato (blueprint, PDI, resposta) desta pessoa vale para a jornada atual dela? Sem jornada com corte, vale. */
export function artefatoValeNaJornada(
  jornadas: Map<string, JornadaDaPessoa>,
  colaboradorId: string | null | undefined,
  geradoEm: string | null | undefined,
): boolean {
  const j = colaboradorId ? jornadas.get(colaboradorId) : undefined;
  return !j || dentroDaJanela(geradoEm, j.janela);
}

/** A trilha desta pessoa é da jornada atual dela? A régua de `trilhaPertence`; sem jornada com corte, vale. */
export function trilhaValeNaJornada(
  jornadas: Map<string, JornadaDaPessoa>,
  trilha: TrilhaDatada & { colaborador_id?: string | null },
): boolean {
  const j = trilha.colaborador_id ? jornadas.get(trilha.colaborador_id) : undefined;
  return !j || trilhaPertence(j.participacaoId, j.janela, trilha);
}

/**
 * A janela da jornada atual de UMA pessoa, para quem lê um artefato dela (o PDI lendo o blueprint, a trilha lendo o
 * blueprint). Falha de leitura LANÇA, pelo mesmo motivo de `carregarJornadaAtual`.
 */
export async function carregarJanelaAtual(sb: any, empresaId: string, colaboradorId: string): Promise<Janela> {
  const { data, error } = await sb.from('turma_membros')
    .select('id, turma_id, colaborador_id, status, created_at, marco_jornada')
    .eq('empresa_id', empresaId)
    .eq('colaborador_id', colaboradorId);
  if (error) throw new Error(`não foi possível ler as participações: ${error.message}`);
  return jornadasAtuaisPorPessoa(data || []).get(colaboradorId)?.janela || JANELA_ABERTA;
}
