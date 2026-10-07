/**
 * ESCOPO DE LEITURA de uma turma: quem entra numa TELA que mostra uma turma, e
 * em qual janela da vida de cada pessoa.
 *
 * Não é `resolverEscopoDeLote` (`./escopo.ts`). Aquele é OPERACIONAL e só enxerga
 * participação `ativo`, o que está certo para quem vai receber um lote, e errado
 * para quem quer VER uma turma: a turma que passou todo mundo adiante fica com 0
 * pessoas e some do painel (medido em Ibipeba, 07/10/2026). Aqui entram também as
 * participações encerradas (`concluido`), cada uma com a sua janela
 * (`./janela.ts`), para a turma antiga mostrar o que aconteceu enquanto as
 * pessoas estiveram nela e a nova começar do zero.
 *
 * Falha de leitura LANÇA (revisão de 27/09/2026): tela de acompanhamento que
 * trata erro de banco como "turma sem ninguém" mostra o time inteiro sumido.
 */

import { TURMA_ENCERRADAS, TURMA_MEMBRO } from '@/lib/status';
import { lerTudoPaginado } from '@/lib/paginacao';
import {
  JANELA_ABERTA, janelasDasParticipacoes, participacaoConta,
  type Janela, type ParticipacaoLinha,
} from '@/lib/turmas/janela';

/** Uma opção do seletor de turma nas telas de acompanhamento. */
export interface TurmaFiltro {
  id: string;
  nome: string;
  status: string;
  /** Pessoas com participação ativa. */
  ativos: number;
  /** Pessoas que passaram por ela e seguiram para outra turma. */
  encerrados: number;
  /** A turma foi concluída ou arquivada (para o rótulo do seletor). */
  encerrada: boolean;
}

/**
 * Turmas que têm alguém (ativo ou encerrado), na ordem de criação. Turma sem
 * nenhum participante não tem o que mostrar e fica fora do seletor.
 */
export async function listarTurmasParaFiltro(sb: any, empresaId: string): Promise<TurmaFiltro[]> {
  if (!empresaId) return [];
  const { data: turmas, error: erroTurmas } = await sb.from('turmas')
    .select('id, nome, status')
    .eq('empresa_id', empresaId)
    .order('created_at');
  if (erroTurmas) throw new Error(`não foi possível ler as turmas: ${erroTurmas.message}`);

  const membros = await lerTudoPaginado((de: number, ate: number) => sb.from('turma_membros')
    .select('id, turma_id, colaborador_id, status')
    .eq('empresa_id', empresaId)
    .in('status', [TURMA_MEMBRO.ATIVO, TURMA_MEMBRO.CONCLUIDO])
    .order('id')
    .range(de, ate));
  if (membros.error) throw new Error(`não foi possível ler os membros das turmas: ${membros.error}`);

  // Uma pessoa conta uma vez por turma: ativa se tem alguma participação ativa nela.
  const porTurma = new Map<string, Map<string, boolean>>();
  for (const m of membros.data as any[]) {
    if (!participacaoConta(m.status)) continue;   // o banco já filtra; aqui a régua não depende disso
    const pessoas = porTurma.get(m.turma_id) || new Map<string, boolean>();
    pessoas.set(m.colaborador_id, (pessoas.get(m.colaborador_id) ?? false) || m.status === TURMA_MEMBRO.ATIVO);
    porTurma.set(m.turma_id, pessoas);
  }

  const encerradasStatus: string[] = TURMA_ENCERRADAS;
  return ((turmas || []) as any[])
    .map((t): TurmaFiltro => {
      const pessoas = [...(porTurma.get(t.id)?.values() || [])];
      const ativos = pessoas.filter(Boolean).length;
      return {
        id: t.id, nome: t.nome, status: t.status,
        ativos, encerrados: pessoas.length - ativos,
        encerrada: encerradasStatus.includes(t.status),
      };
    })
    .filter((t) => t.ativos + t.encerrados > 0);
}

export interface ParticipacaoDoEscopo {
  /** Id da participação NESTA turma (o carimbo `trilhas.turma_membro_id` aponta para ele). */
  id: string;
  /** O que, na vida da pessoa, pertence a esta participação. */
  janela: Janela;
  /** Ainda ativa, ou terminada (a pessoa passou para outra turma). */
  ativa: boolean;
}

export interface EscopoDeLeitura {
  turmaId: string;
  turmaNome: string;
  turmaStatus: string;
  /** Ativos e encerrados, sem repetir pessoa. */
  colaboradorIds: string[];
  participacaoPorColab: Map<string, ParticipacaoDoEscopo>;
}

/**
 * Resolve a turma em pessoas + janelas. `turmaId` vem do cliente: a turma tem que
 * ser DESTE tenant (o app roda com service_role e o banco não barra).
 */
export async function resolverEscopoDeLeitura(sb: any, empresaId: string, turmaId: string): Promise<EscopoDeLeitura> {
  if (!empresaId) throw new Error('resolverEscopoDeLeitura: empresaId obrigatório');
  const { data: turma, error: erroTurma } = await sb.from('turmas')
    .select('id, nome, status')
    .eq('id', turmaId)
    .eq('empresa_id', empresaId)
    .maybeSingle();
  if (erroTurma) throw new Error(`não foi possível ler a turma: ${erroTurma.message}`);
  if (!turma) throw new Error('Turma não encontrada nesta empresa');

  const { data: doEscopo, error: erroMembros } = await sb.from('turma_membros')
    .select('id, turma_id, colaborador_id, status, created_at, marco_jornada')
    .eq('empresa_id', empresaId)
    .eq('turma_id', turmaId)
    .in('status', [TURMA_MEMBRO.ATIVO, TURMA_MEMBRO.CONCLUIDO]);
  if (erroMembros) throw new Error(`não foi possível ler os membros da turma: ${erroMembros.message}`);

  const membros = ((doEscopo || []) as ParticipacaoLinha[]).filter((m) => participacaoConta(m.status));
  const colaboradorIds = [...new Set(membros.map((m) => m.colaborador_id))];
  if (!colaboradorIds.length) {
    return { turmaId: turma.id, turmaNome: turma.nome, turmaStatus: turma.status, colaboradorIds, participacaoPorColab: new Map() };
  }

  // O fim da janela é o marco da PRÓXIMA participação da mesma pessoa, em qualquer turma.
  const { data: todas, error: erroTodas } = await sb.from('turma_membros')
    .select('id, turma_id, colaborador_id, status, created_at, marco_jornada')
    .eq('empresa_id', empresaId)
    .in('colaborador_id', colaboradorIds)
    .in('status', [TURMA_MEMBRO.ATIVO, TURMA_MEMBRO.CONCLUIDO]);
  if (erroTodas) throw new Error(`não foi possível ler as participações das pessoas: ${erroTodas.message}`);
  const janelas = janelasDasParticipacoes((todas || []) as ParticipacaoLinha[]);

  // Se a pessoa teve duas participações nesta turma (saiu e voltou), vale a mais recente.
  const participacaoPorColab = new Map<string, ParticipacaoDoEscopo>();
  const maisRecente = new Map<string, number>();
  for (const m of membros) {
    const criada = Date.parse(m.created_at || '') || 0;
    if ((maisRecente.get(m.colaborador_id) ?? -1) > criada) continue;
    maisRecente.set(m.colaborador_id, criada);
    participacaoPorColab.set(m.colaborador_id, {
      id: m.id,
      janela: janelas.get(m.id) ?? JANELA_ABERTA,
      ativa: m.status === TURMA_MEMBRO.ATIVO,
    });
  }

  return { turmaId: turma.id, turmaNome: turma.nome, turmaStatus: turma.status, colaboradorIds, participacaoPorColab };
}
