// Score de qualidade da oportunidade (0-100) — mede COMPLETUDE do registro,
// não desempenho do RC. Base do "pipeline qualificado".

export type QualityScoreInput = {
  account_id?: string | null;
  primary_contact_id?: string | null;
  primary_contact_role?: string | null; // role do contato principal (join)
  origin?: string | null;
  identified_need?: string | null;
  product_interest?: string | null;
  stage?: string | null;
  next_action?: string | null;
  interaction_evidence?: string | null;
};

const filled = (v: unknown) => typeof v === 'string' ? v.trim().length > 0 : v != null;

export type QualityComponent = { key: string; label: string; points: number; earned: boolean };

/** Componentes com pontuação — expostos para a UI mostrar o que falta. */
export function qualityScoreComponents(input: QualityScoreInput): QualityComponent[] {
  return [
    { key: 'account', label: 'Conta identificada', points: 10, earned: filled(input.account_id) },
    { key: 'contact', label: 'Contato principal', points: 10, earned: filled(input.primary_contact_id) },
    { key: 'contact_role', label: 'Cargo do contato', points: 10, earned: filled(input.primary_contact_role) },
    { key: 'origin', label: 'Origem', points: 10, earned: filled(input.origin) },
    { key: 'need', label: 'Necessidade identificada', points: 15, earned: filled(input.identified_need) },
    { key: 'product', label: 'Produto de interesse', points: 10, earned: filled(input.product_interest) },
    { key: 'stage', label: 'Estágio definido', points: 10, earned: filled(input.stage) },
    { key: 'next_action', label: 'Próxima ação', points: 15, earned: filled(input.next_action) },
    { key: 'evidence', label: 'Evidência de interação', points: 10, earned: filled(input.interaction_evidence) },
  ];
}

export function calculateQualityScore(input: QualityScoreInput): number {
  return qualityScoreComponents(input).reduce((sum, c) => sum + (c.earned ? c.points : 0), 0);
}
