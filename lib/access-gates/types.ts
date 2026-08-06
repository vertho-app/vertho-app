/**
 * Resultado de um gate de acesso a um recurso de produto.
 *
 * Tipo PLANO de propósito: este projeto não estreita union discriminada de forma
 * confiável (strictNullChecks frouxo), então evitamos `{allowed:true}|{allowed:false,...}`.
 * Quando `allowed:false`, os campos de diagnóstico explicam o porquê e como destravar
 * — para a UI nunca mais bloquear "em silêncio" um usuário pronto.
 */
export type GateResult = {
  allowed: boolean;
  /** código estável p/ a UI/telemetria, ex.: 'CENARIOS_BLOQUEADOS' */
  code?: string;
  /** mensagem curta para o usuário final */
  message?: string;
  /** o que o admin precisa fazer para liberar (quando aplicável) */
  remediation?: string;
};

/** Subset relevante de `empresas.sys_config` (JSONB livre) para os gates. */
export type EmpresaConfig = {
  votacao_ativa?: boolean;
  perfil_comportamental_liberado?: boolean;
  mapeamento_cenarios_liberado?: boolean;
  /** Fonte externa do perfil (opq32, hogan…) — quando presente, a empresa NÃO faz o DISC nativo. */
  perfil_externo_fonte?: string | null;
  [k: string]: any;
};
