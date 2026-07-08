/**
 * Development Blueprint (Fase 1) — fonte ÚNICA de desenvolvimento por colaborador.
 *
 * Objeto estruturado gerado UMA vez (do foco do cargo + assessments IA4 + DISC),
 * do qual PDI e trilha são RENDERIZAÇÕES. Elimina o drift residual: o "sprint" do
 * PDI e as "missões/semanas" da trilha passam a sair do MESMO objeto coerente.
 *
 * Ver `docs/DEVELOPMENT-BLUEPRINT.md` (contrato de design) e a memória
 * `project_pdi_trilha_coerencia`. `spec_version` versiona a régua (congela
 * histórico), como no scoring.
 *
 * NÃO é `'use server'` de propósito — só tipos, importável de helpers e actions.
 */

export type NivelBlueprint = 'N1' | 'N2' | 'N3' | 'N4';
export type PrioridadeBlueprint = 'alta' | 'media' | 'baixa';
export type SemanaTipo = 'conteudo' | 'missao' | 'reflexao' | 'avaliacao';

/** Um descritor da competência que o desenvolvimento vai trabalhar. */
export interface BlueprintDescritorFoco {
  id: string;
  nome: string;
  gap_observado: string;
  comportamento_esperado: string;
  evidencia_esperada: string;
}

/**
 * Um objetivo de 30 dias — a unidade acionável do SPRINT do PDI. Cada semana da
 * trilha (`conexao_com_pdi`) referencia o `id` de um destes.
 */
export interface BlueprintObjetivo30Dias {
  id: string;
  objetivo: string;
  acao_principal: string;
  acao_apoio?: string;
  evidencia_de_execucao: string;
  criterio_de_sucesso: string;
  ritual?: string;
}

/** Conteúdo recomendado para sustentar um gap. */
export interface BlueprintConteudoRecomendado {
  tema: string;
  formato_preferencial: string;
  objetivo: string;
}

/** Missão prática sugerida (aterrissa nas semanas de missão da trilha). */
export interface BlueprintMissaoSugerida {
  semana_sugerida: number;
  titulo: string;
  descricao: string;
  evidencia_a_coletar: string;
}

/** Uma competência foco do plano, com sua leitura, objetivos e insumos. */
export interface BlueprintCompetencia {
  nome: string;
  nivel_atual: NivelBlueprint;
  prioridade: PrioridadeBlueprint;
  leitura: string;
  descritores_foco: BlueprintDescritorFoco[];
  /** == o SPRINT do PDI sai daqui == */
  objetivos_30_dias: BlueprintObjetivo30Dias[];
  conteudos_recomendados: BlueprintConteudoRecomendado[];
  missoes_sugeridas: BlueprintMissaoSugerida[];
}

/** Uma semana da trilha. Regra dura: `conexao_com_pdi` não-vazio (≥1 objetivo). */
export interface BlueprintSemana {
  semana: number;
  tipo: SemanaTipo;
  competencia_foco: string[];
  descritores_foco: string[];
  objetivo_da_semana: string;
  /** id(s) do(s) `objetivos_30_dias` que esta semana sustenta (≥1 sempre). */
  conexao_com_pdi: string[];
  evidencia_esperada: string;
  criterio_de_sucesso: string;
}

/** A trilha completa derivável do blueprint. */
export interface BlueprintTrilha {
  duracao_semanas: number;
  semanas: BlueprintSemana[];
}

export interface DevelopmentBlueprint {
  /** Versiona a régua (congela histórico), como no scoring. */
  spec_version: number;
  colaborador: {
    nome: string;
    cargo: string;
    contexto: string;
    perfil_comportamental?: string;
  };
  foco_geral: {
    tese_de_desenvolvimento: string;
    mensagem_central: string;
    risco_se_nao_desenvolver: string;
    impacto_esperado: string;
  };
  competencias: BlueprintCompetencia[];
  trilha: BlueprintTrilha;
}
