import type { EmpresaConfig, GateResult } from './types';

/**
 * Gate do perfil comportamental — fail-OPEN: liberado por padrão, exceto se o
 * admin bloqueou explicitamente (`=== false`) ou se a votação está aberta sem
 * liberação explícita. Espelha EXATAMENTE a lógica booleana de
 * lib/votacao/status.ts (contrato coberto por tests/unit/product-regressions.test.ts).
 */
export function canAccessPerfilComportamental(config: EmpresaConfig | null | undefined): GateResult {
  const c = config || {};
  if (c.perfil_comportamental_liberado === false) {
    return {
      allowed: false,
      code: 'PERFIL_BLOQUEADO',
      message: 'Perfil comportamental ainda não liberado.',
      remediation: 'Libere o perfil comportamental no painel da empresa.',
    };
  }
  if (c.votacao_ativa === true && c.perfil_comportamental_liberado !== true) {
    return {
      allowed: false,
      code: 'VOTACAO_ATIVA',
      message: 'Disponível após o fechamento da votação.',
      remediation: 'Encerre a votação ou libere o perfil comportamental explicitamente.',
    };
  }
  return { allowed: true };
}
