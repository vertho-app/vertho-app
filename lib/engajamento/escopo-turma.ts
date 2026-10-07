/**
 * Escopo de TURMA para o engajamento da jornada (admin, RH e evolução semanal).
 *
 * O roll-up já isolava a trilha MAIS RECENTE de cada pessoa. O que faltava era
 * dizer qual jornada uma turma está olhando: a pessoa que passou da "Turma 1" para
 * a "Temporada 2" tem duas trilhas, e cada turma enxerga a sua (a carimbada com a
 * participação, `trilhas.turma_membro_id`; `lib/turmas/janela.ts`).
 *
 * Duas regras que vêm do modelo de dados, não de gosto:
 *  - `fase4_envios` é UMA linha por pessoa e a cadência da jornada nova a
 *    REESCREVE. Se a trilha da turma é a mais recente da pessoa, a linha é dela;
 *    se não é (a pessoa já seguiu para a jornada seguinte), a linha pertence à
 *    outra jornada e o relógio e os carimbos de envio dela NÃO valem para esta
 *    turma: a linha entra com o relógio neutralizado ("sem registro de envio"),
 *    nunca com o ✓ da jornada de outra turma.
 *  - quem não tem trilha nesta participação não tem jornada para medir aqui e fica
 *    de fora (a Temporada 2, antes de a primeira trilha existir, tem 0 inscritos).
 */

import { ENVIO } from '@/lib/status';
import { semanaDaTrilha } from '@/lib/turmas/portfolio';
import { dentroDaJanela, trilhaDaParticipacao, type Janela } from '@/lib/turmas/janela';
import type { EscopoDeLeitura } from '@/lib/turmas/escopo-leitura';

export interface EnvioDoEscopo {
  colaborador_id: string;
  semana_atual?: number | string | null;
  status?: string | null;
  data_inicio?: string | null;
  ultima_evidencia_em?: string | null;
  ultima_pilula1_em?: string | null;
  ultima_pilula2_em?: string | null;
  [k: string]: any;
}

export interface TrilhaDoEscopo {
  id: string;
  colaborador_id: string;
  numero_temporada?: number | null;
  data_inicio?: string | null;
  turma_membro_id?: string | null;
  criado_em?: string | null;
  [k: string]: any;
}

export interface ResultadoEscopo<E, T> {
  /** Só quem tem jornada nesta turma; a linha de quem seguiu adiante vem com o relógio neutralizado. */
  envios: E[];
  /** A trilha de cada pessoa NESTA turma. */
  trilhaPorColab: Map<string, T>;
  /** Pessoas da turma que já seguiram para a jornada seguinte (a cadência delas é de outra turma). */
  comJornadaSeguinte: number;
}

/** A linha de envio quando a jornada da turma NÃO é a atual da pessoa: o relógio e os carimbos são de outra. */
function neutralizarRelogio<E extends EnvioDoEscopo>(envio: E, trilha: TrilhaDoEscopo, hoje: Date): E {
  return {
    ...envio,
    status: ENVIO.CONCLUIDO,
    semana_atual: semanaDaTrilha(trilha.data_inicio ?? null, hoje) ?? 1,
    data_inicio: trilha.data_inicio ?? envio.data_inicio ?? null,
    ultima_evidencia_em: null,
    ultima_pilula1_em: null,
    ultima_pilula2_em: null,
  };
}

export function aplicarEscopoDeTurma<E extends EnvioDoEscopo, T extends TrilhaDoEscopo>(args: {
  envios: E[];
  trilhas: T[];
  escopo: EscopoDeLeitura;
  hoje?: Date;
}): ResultadoEscopo<E, T> {
  const hoje = args.hoje ?? new Date();

  const trilhasPorPessoa = new Map<string, T[]>();
  for (const t of args.trilhas || []) {
    const lista = trilhasPorPessoa.get(t.colaborador_id) || [];
    lista.push(t);
    trilhasPorPessoa.set(t.colaborador_id, lista);
  }

  const envios: E[] = [];
  const trilhaPorColab = new Map<string, T>();
  let comJornadaSeguinte = 0;
  for (const envio of args.envios || []) {
    const participacao = args.escopo.participacaoPorColab.get(envio.colaborador_id);
    if (!participacao) continue;
    const daPessoa = trilhasPorPessoa.get(envio.colaborador_id) || [];
    const alvo = trilhaDaParticipacao(participacao.id, participacao.janela, daPessoa);
    if (!alvo) continue;

    const maisRecente = daPessoa.reduce((a, b) => ((Number(b.numero_temporada) || 1) > (Number(a.numero_temporada) || 1) ? b : a));
    trilhaPorColab.set(envio.colaborador_id, alvo);
    if (alvo.id === maisRecente.id) {
      envios.push(envio);
    } else {
      comJornadaSeguinte++;
      envios.push(neutralizarRelogio(envio, alvo, hoje));
    }
  }
  return { envios, trilhaPorColab, comJornadaSeguinte };
}

/**
 * Mantém só as linhas (evento, progresso, tutor, vídeo) da trilha-alvo da pessoa.
 * Linha sem `trilha_id` (legado, anterior à coluna) entra se o instante dela cai na
 * janela da participação.
 */
export function manterDaTrilhaAlvo<R extends { colaborador_id?: string | null; trilha_id?: string | null }>(
  linhas: R[],
  trilhaPorColab: Map<string, { id: string }>,
  janelaPorColab: Map<string, Janela>,
  instante: (linha: R) => string | null | undefined,
): R[] {
  return (linhas || []).filter((linha) => {
    const colab = linha.colaborador_id;
    if (!colab) return false;
    const alvo = trilhaPorColab.get(colab);
    if (!alvo) return false;
    if (linha.trilha_id) return linha.trilha_id === alvo.id;
    const janela = janelaPorColab.get(colab);
    return !!janela && dentroDaJanela(instante(linha), janela);
  });
}
