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
  fechado_ganho: 'Fechado ganho',
  fechado_perdido: 'Fechado perdido',
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

// Pacotes oferecidos no dropdown. 'completo'/'pulso' saíram da oferta mas
// seguem no LABELS para renderizar dados legados/históricos sem quebrar.
export const PRODUCT_PACKAGES = ['onboarding', 'mentor_ia', 'piloto', 'custom'] as const;
export const PRODUCT_PACKAGE_LABELS: Record<string, string> = {
  onboarding: 'Onboarding', mentor_ia: 'Mentor IA', piloto: 'Piloto', custom: 'Custom',
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

export const CONTRACT_DURATIONS = [12, 24, 36] as const;

// ── Comissão (política vigente do canal) ────────────────────────────────────
export const COMMISSION_RATES = {
  acquisition: 0.09,   // 9% do valor inicial do contrato
  recurring: 0.12,     // 12% da receita recebida durante a vigência inicial
  renewal: 0.06,       // 6% após a vigência inicial
  expansion: 0.09,     // 9% sobre valor incremental (+12% recorrente incremental)
} as const;

export const COMMISSION_TYPE_LABELS: Record<string, string> = {
  aquisicao: 'Aquisição', recorrente: 'Recorrente', renovacao: 'Renovação',
  expansao: 'Expansão', chargeback: 'Estorno',
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
