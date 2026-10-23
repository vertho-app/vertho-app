// Portal do Representante — constantes de domínio.
// Linguagem SEMPRE comercial/neutra (canal de vendas autônomo, nunca supervisão).

export const PIPELINE_STAGES = [
  'lead_identificado',
  'contato_iniciado',
  'diagnostico_reuniao_realizada',
  'proposta_enviada',
  'negociacao',
  'aguardando_aceite_vertho',
  'contrato_enviado',
  'fechado_ganho',
  'fechado_perdido',
  'sem_avanco_expirado',
] as const;
export type PipelineStage = typeof PIPELINE_STAGES[number];

export const STAGE_LABELS: Record<PipelineStage, string> = {
  lead_identificado: 'Lead identificado',
  contato_iniciado: 'Contato iniciado',
  diagnostico_reuniao_realizada: 'Diagnóstico / reunião realizada',
  proposta_enviada: 'Proposta enviada',
  negociacao: 'Negociação',
  aguardando_aceite_vertho: 'Aguardando aceite Vertho',
  contrato_enviado: 'Contrato enviado',
  fechado_ganho: 'Fechado',
  fechado_perdido: 'Perdido',
  sem_avanco_expirado: 'Sem avanço / expirado',
};

// Probabilidade default por estágio (pipeline ponderado)
export const STAGE_PROBABILITY: Record<PipelineStage, number> = {
  lead_identificado: 0.10,
  contato_iniciado: 0.20,
  diagnostico_reuniao_realizada: 0.35,
  proposta_enviada: 0.50,
  negociacao: 0.65,
  aguardando_aceite_vertho: 0.75,
  contrato_enviado: 0.85,
  fechado_ganho: 1.00,
  fechado_perdido: 0.00,
  sem_avanco_expirado: 0.00,
};

// Estágios "abertos" (pipeline vivo). fechado_* e expirado ficam fora.
export const OPEN_STAGES: PipelineStage[] = [
  'lead_identificado', 'contato_iniciado', 'diagnostico_reuniao_realizada',
  'proposta_enviada', 'negociacao', 'aguardando_aceite_vertho', 'contrato_enviado',
];

export const STAGE_COLORS: Record<PipelineStage, string> = {
  lead_identificado: '#6B7280',
  contato_iniciado: '#06B6D4',
  diagnostico_reuniao_realizada: '#3B82F6',
  proposta_enviada: '#8B5CF6',
  negociacao: '#F59E0B',
  aguardando_aceite_vertho: '#F97316',
  contrato_enviado: '#22C55E',
  fechado_ganho: '#10B981',
  fechado_perdido: '#EF4444',
  sem_avanco_expirado: '#64748B',
};

export const OPPORTUNITY_STATUS_LABELS: Record<string, string> = {
  open: 'Aberta', won: 'Ganha', lost: 'Perdida', expired: 'Expirada',
};

export const PROTECTION_STATUS_LABELS: Record<string, string> = {
  active: 'Protegida', expiring: 'Proteção vencendo', expired: 'Proteção vencida', extended: 'Proteção estendida',
};

export const PROTECTION_DAYS = 90;          // proteção padrão da oportunidade
export const PROTECTION_EXPIRING_DAYS = 15; // "vencendo" quando faltam ≤ 15 dias
export const PROTECTION_ALERT_DAYS = [15, 10, 5] as const;

export const PROPOSAL_STATUSES = [
  'draft', 'submitted_for_approval', 'approved', 'changes_requested',
  'rejected', 'sent_to_client', 'accepted', 'lost', 'superseded',
] as const;
export type ProposalStatus = typeof PROPOSAL_STATUSES[number];

export const PROPOSAL_STATUS_LABELS: Record<ProposalStatus, string> = {
  draft: 'Rascunho',
  submitted_for_approval: 'Aguardando aprovação',
  approved: 'Aprovada',
  changes_requested: 'Ajustes solicitados',
  rejected: 'Recusada',
  sent_to_client: 'Enviada ao cliente',
  accepted: 'Aceita pelo cliente',
  lost: 'Perdida',
  superseded: 'Substituída',
};

export const PROPOSAL_STATUS_COLORS: Record<ProposalStatus, string> = {
  draft: '#6B7280',
  submitted_for_approval: '#F59E0B',
  approved: '#22C55E',
  changes_requested: '#F97316',
  rejected: '#EF4444',
  sent_to_client: '#06B6D4',
  accepted: '#10B981',
  lost: '#64748B',
  superseded: '#8B5CF6',
};

// Pacotes oferecidos no dropdown. 'piloto' (decisão do dono, 08/10/2026),
// 'completo' e 'pulso' saíram da oferta mas seguem no LABELS para renderizar
// dados legados/históricos sem quebrar. As CHAVES gravadas não mudam: só o
// rótulo, que o RC e o cliente leem ("Jornada de Onboarding" e "Jornada
// Personalizada" são os nomes dos formatos em todo material da Vertho).
export const PRODUCT_PACKAGES = ['onboarding', 'mentor_ia', 'custom'] as const;
export const PRODUCT_PACKAGE_LABELS: Record<string, string> = {
  onboarding: 'Jornada de Onboarding', mentor_ia: 'Mentor IA', piloto: 'Piloto', custom: 'Jornada Personalizada',
  completo: 'Completo', pulso: 'Pulso',
};

export const CUSTOMER_TYPES = ['escola', 'empresa', 'rede_ensino', 'comercio', 'outro'] as const;
export const CUSTOMER_TYPE_LABELS: Record<string, string> = {
  escola: 'Escola', empresa: 'Empresa', rede_ensino: 'Rede de ensino', comercio: 'Comércio', outro: 'Outro',
};

export const OPPORTUNITY_ORIGINS = ['indicacao', 'prospeccao', 'evento', 'inbound', 'rede_relacionamento', 'outro'] as const;
export const ORIGIN_LABELS: Record<string, string> = {
  indicacao: 'Indicação', prospeccao: 'Prospecção ativa', evento: 'Evento',
  inbound: 'Inbound', rede_relacionamento: 'Rede de relacionamento', outro: 'Outro',
  // Só nasce pela carteira (`criarOportunidadeExpansao`), fora do dropdown.
  expansao: 'Expansão de cliente da carteira',
};

export const ACCOUNT_STATUS_LABELS: Record<string, string> = {
  prospect: 'Prospect', active_client: 'Cliente ativo', inactive: 'Inativa', lost: 'Perdida',
};

export const CHURN_RISK_LABELS: Record<string, string> = { baixo: 'Baixo', medio: 'Médio', alto: 'Alto' };
export const CHURN_RISK_COLORS: Record<string, string> = { baixo: '#22C55E', medio: '#F59E0B', alto: '#EF4444' };

// Categorias do histórico de acompanhamento da conta (pós-venda)
export const ACTIVITY_KIND_LABELS: Record<string, string> = {
  nota: 'Nota', followup: 'Acompanhamento', renovacao: 'Renovação', risco: 'Risco', expansao: 'Expansão',
};
export const ACTIVITY_KIND_COLORS: Record<string, string> = {
  nota: '#6B7280', followup: '#06B6D4', renovacao: '#22C55E', risco: '#EF4444', expansao: '#8B5CF6',
};

export const RENEWAL_SOON_DAYS = 90; // "renovação próxima" quando faltam ≤ 90 dias

// Vigência que o RC pode propor: qualquer número inteiro de meses de 6 a 24
// (decisão do dono, 08/10/2026; antes eram só 12, 24 ou 36). Vale para o
// formulário e a validação do portal do RC; o deal desk grava parcelas por
// outro caminho (`proposals-admin.ts`) e não passa por aqui.
export const CONTRACT_DURATION_MIN = 6;
export const CONTRACT_DURATION_MAX = 24;
export const CONTRACT_DURATIONS: readonly number[] = Array.from(
  { length: CONTRACT_DURATION_MAX - CONTRACT_DURATION_MIN + 1 },
  (_, i) => CONTRACT_DURATION_MIN + i,
);

// ── Comissão (contrato de representação comercial v5, 22/10/2026) ───────────
// Dois modelos de remuneração por RC, gravados em
// `sales_representatives.compensation_model` (mig 295). Cláusula 10ª e Anexo II:
//   • sem_ajuda: Comissão de Aquisição de 8% sobre o Valor Total do Contrato,
//     limitada às parcelas dos primeiros 12 meses e paga inteira após o 1º
//     pagamento do cliente (10.3a), mais 10% sobre cada parcela paga a partir da
//     SEGUNDA (10.3b). (Até 21/10 o portal cobrava 8% sobre o contrato inteiro e
//     10% de todas as parcelas.)
//   • com_ajuda: ajuda de custo fixa mensal (valor por região, fora do portal) e
//     10% sobre cada parcela paga, desde a primeira; sem aquisição (10.4).
//   • Cliente da carteira (10.6): toda proposta posterior de cliente que já
//     contratou pelo RC, seja renovação, nova Jornada ou ampliação, paga 50% dos
//     percentuais do modelo, com a mesma mecânica. Não existe mais taxa própria
//     de renovação ou de expansão.
//   • indicacao (consultor de indicação, decisão do dono de 23/10/2026; mig 298):
//     10% de cada pagamento recebido de cada cliente indicado, sem aquisição e
//     sem ajuda de custo. A vertho.ai lança um evento `indicacao` a cada
//     recebimento (`registrarComissaoIndicacao`); se o consultor fizer proposta
//     pelo portal, a régua é a mesma: 10% desde a 1ª parcela.
// O modelo que vale é o da APROVAÇÃO da proposta (10.5), gravado nela (mig 296).
export const COMPENSATION_MODELS = ['sem_ajuda', 'com_ajuda', 'indicacao'] as const;
export type CompensationModel = typeof COMPENSATION_MODELS[number];
export const COMPENSATION_MODEL_LABELS: Record<CompensationModel, string> = {
  sem_ajuda: 'Sem ajuda de custo',
  com_ajuda: 'Com ajuda de custo',
  indicacao: 'Indicação (consultor, 10%)',
};

export type CommissionRates = {
  /** Sobre o Valor Total do Contrato, limitado a `ACQUISITION_CAP_MONTHS` (0 = não há). */
  acquisition: number;
  /** Sobre cada parcela paga pelo cliente. */
  recurring: number;
  /** Primeira parcela que paga comissão: no modelo sem ajuda é a 2ª, porque a 1ª dispara a aquisição. */
  firstCommissionedInstallment: 1 | 2;
};

export const COMMISSION_RATES_BY_MODEL: Record<CompensationModel, CommissionRates> = {
  sem_ajuda: { acquisition: 0.08, recurring: 0.10, firstCommissionedInstallment: 2 },
  com_ajuda: { acquisition: 0, recurring: 0.10, firstCommissionedInstallment: 1 },
  indicacao: { acquisition: 0, recurring: 0.10, firstCommissionedInstallment: 1 },
};

/** A aquisição incide só sobre as parcelas dos primeiros 12 meses (cláusula 10.3a). */
export const ACQUISITION_CAP_MONTHS = 12;

/** Cliente da carteira paga esta fração dos percentuais do modelo (cláusula 10.6). */
export const CARTEIRA_FACTOR = 0.5;

/** Taxas do modelo pedido. Valor ausente ou desconhecido cai no padrão do canal (sem ajuda). */
export function commissionRatesFor(model: string | null | undefined): CommissionRates {
  if (model === 'com_ajuda') return COMMISSION_RATES_BY_MODEL.com_ajuda;
  if (model === 'indicacao') return COMMISSION_RATES_BY_MODEL.indicacao;
  return COMMISSION_RATES_BY_MODEL.sem_ajuda;
}

/** Taxas do modelo padrão (sem ajuda de custo). Para um RC, use `commissionRatesFor(rep.compensation_model)`. */
export const COMMISSION_RATES = COMMISSION_RATES_BY_MODEL.sem_ajuda;

// `renovacao` e `expansao` só existem em eventos antigos: desde o contrato v5 a
// proposta de cliente da carteira gera aquisição e parcelas a 50%.
export const COMMISSION_TYPE_LABELS: Record<string, string> = {
  aquisicao: 'Aquisição', recorrente: 'Sobre parcelas', renovacao: 'Renovação',
  expansao: 'Expansão', chargeback: 'Estorno', indicacao: 'Indicação',
};

// Validação do registro da oportunidade pela vertho.ai (contrato, 7.1 e 7.5; mig 296).
export const ATTRIBUTION_STATUSES = ['aguardando', 'validada', 'recusada'] as const;
export type AttributionStatus = typeof ATTRIBUTION_STATUSES[number];
export const ATTRIBUTION_STATUS_LABELS: Record<AttributionStatus, string> = {
  aguardando: 'Aguardando validação', validada: 'Registro validado', recusada: 'Registro recusado',
};

export const COMMISSION_STATUS_LABELS: Record<string, string> = {
  potencial: 'Potencial', forecast: 'Prevista', accrued: 'A receber', paid: 'Paga', cancelled: 'Cancelada',
};

export const COMMISSION_STATUS_COLORS: Record<string, string> = {
  potencial: '#6B7280', forecast: '#F59E0B', accrued: '#06B6D4', paid: '#10B981', cancelled: '#64748B',
};

export const MATERIAL_CATEGORIES = ['material', 'playbook', 'diagnostico', 'objecoes', 'politica', 'case'] as const;
export const MATERIAL_CATEGORY_LABELS: Record<string, string> = {
  material: 'Biblioteca de materiais', playbook: 'Playbook por segmento',
  diagnostico: 'Perguntas de diagnóstico', objecoes: 'Objeções e respostas',
  politica: 'Políticas comerciais vigentes', case: 'Cases',
};

// KPIs
export const QUALIFIED_MIN_SCORE = 70;   // pipeline qualificado: score ≥ 70 e fora de lead
export const STALLED_DAYS = 15;          // oportunidade sem movimentação há 15+ dias
