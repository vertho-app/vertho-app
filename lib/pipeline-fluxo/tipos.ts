/**
 * Tipos e constantes do FLUXO COMPLETO (IA4 → blueprint → auditoria → PDI → trilha → Gestor/RH) executado no
 * servidor por uma task do Trigger.dev. O estado vive em `ia_jobs` (`fase = 'fluxo'`): `params` descreve o pedido e
 * `progress` é a fonte da tela de acompanhamento.
 */
import type { EtapaId } from './previa';

export type { EtapaId };

/** Ordem de execução. A auditoria depende do blueprint; Gestor e RH vêm depois do PDI; a trilha depois do blueprint; o kit lê o plano da trilha, então vem depois dela; a trilha exige a biblioteca de conteúdo-base, então os conteúdos vêm antes dela. */
export const ORDEM_ETAPAS: EtapaId[] = ['ia4', 'blueprint', 'auditoria', 'pdi', 'conteudo', 'trilha', 'kit', 'gestor', 'rh'];

export const FASE_FLUXO = 'fluxo';
export const TASK_FLUXO = 'fluxo-completo';

export type EstadoEtapa = 'aguardando' | 'rodando' | 'ok' | 'parcial' | 'erro' | 'pulado';

export interface ProgressoEtapa {
  id: EtapaId;
  titulo: string;
  estado: EstadoEtapa;
  /** Itens que a etapa tomou para fazer (acumulado entre execuções). */
  total: number;
  feitos: number;
  falhas: number;
  /** `ia_jobs` filhos (lotes de IA4, blueprint e PDI), para acompanhar e cancelar. */
  jobIds: string[];
  detalhe?: string;
}

export interface ProgressoFluxo {
  etapas: ProgressoEtapa[];
  /** Texto curto do que está acontecendo agora (a tela mostra). */
  atual: string;
  /** Modelos efetivamente usados por etapa (impressos: config declarada não é config aplicada). */
  modelos?: Record<string, string>;
  /** Pessoas que entraram na fila do blueprint NESTA rodada: só elas são auditadas (não se reavalia o passado). */
  blueprintAlvo?: string[];
  /** Quantas execuções da task já houve (a task se re-agenda quando acaba o orçamento de tempo). */
  execucoes: number;
  dryRun?: boolean;
  resumo?: string;
}

export interface EscopoFluxo {
  turmaId?: string | null;
  empresaInteiraJustificativa?: string | null;
  cargos?: string[] | null;
}

export interface ParamsFluxo {
  empresaId: string;
  escopo: EscopoFluxo;
  /** Ids do escopo resolvido NO INÍCIO (`null` = empresa inteira, sem restrição de turma). */
  permitidos: string[] | null;
  /** Simulação: lê as filas e escreve o progresso, mas NÃO enfileira, gera nem audita nada. */
  dryRun?: boolean;
  /** Restringe a estas etapas (teste); ausente = todas. */
  somente?: EtapaId[];
  criadoPor?: string | null;
  /**
   * Contas internas (`@vertho.ai`) que ESTE pedido inclui, por id. O padrão é excluí-las (não entram em estatística nem em
   * fluxo). Só o script/servidor grava isto: `iniciarFluxoCompleto` não aceita o campo do cliente. Fica no `ia_jobs.params`,
   * então todo fluxo que abriu a exceção deixa o rastro de quem foi incluído.
   */
  excecaoInternos?: string[];
  /**
   * Limita o KIT às primeiras N semanas da trilha (ex.: piloto de uma pessoa: `1`). A TRILHA e a biblioteca de conteúdo-base
   * seguem completas (a trilha monta todas as semanas e exige conteúdo para cada uma); o que se poupa é o Kit (e o vídeo),
   * que são os itens caros. Ausente = o horizonte inteiro, como o botão da coorte.
   */
  kitSemanaMax?: number;
}

export const TITULOS_ETAPA: Record<EtapaId, string> = {
  ia4: 'IA4 — avaliar respostas + check',
  blueprint: 'Blueprint',
  auditoria: 'Auditoria do blueprint',
  pdi: 'PDI',
  conteudo: 'Conteúdos (biblioteca da trilha)',
  trilha: 'Trilha (temporada)',
  kit: 'Kit semanal (conteúdos por DISC)',
  gestor: 'Relatório do Gestor',
  rh: 'Relatório do RH',
};

export function progressoInicial(dryRun = false): ProgressoFluxo {
  return {
    etapas: ORDEM_ETAPAS.map((id) => ({ id, titulo: TITULOS_ETAPA[id], estado: 'aguardando', total: 0, feitos: 0, falhas: 0, jobIds: [] })),
    atual: 'na fila',
    execucoes: 0,
    dryRun,
  };
}
