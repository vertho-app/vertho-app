/** Permissões de treino por cargo. A habilitação do módulo na empresa continua obrigatória. */
export const SIMULADORES = ['vendas', 'atendimento', 'lideranca'] as const;
export type Simulador = (typeof SIMULADORES)[number];
export type AcessoSimuladores = Record<Simulador, boolean>;
export const CHAVE_ACESSO_SIMULADORES = 'simuladores_por_cargo';
export const ACESSO_ATUAL: AcessoSimuladores = { vendas: true, atendimento: true, lideranca: true };
export const SEM_ACESSO: AcessoSimuladores = { vendas: false, atendimento: false, lideranca: false };

/** Ausência de regra preserva a liberação existente; regra inválida nunca concede acesso. */
export function acessoDoCargo(sysConfig: Record<string, unknown> | null | undefined, cargoId?: string | null): AcessoSimuladores {
  const regras = sysConfig?.[CHAVE_ACESSO_SIMULADORES];
  if (regras === undefined) return { ...ACESSO_ATUAL };
  if (!regras || typeof regras !== 'object' || Array.isArray(regras)) return { ...SEM_ACESSO };
  if (!cargoId || !Object.hasOwn(regras, cargoId)) return { ...ACESSO_ATUAL };
  const regra = (regras as Record<string, unknown>)[cargoId];
  if (!regra || typeof regra !== 'object' || Array.isArray(regra)) return { ...SEM_ACESSO };
  const valor = regra as Record<string, unknown>;
  return { vendas: valor.vendas === true, atendimento: valor.atendimento === true, lideranca: valor.lideranca === true };
}
