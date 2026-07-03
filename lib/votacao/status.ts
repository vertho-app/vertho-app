import { canAccessPerfilComportamental, canAccessMapeamentoCenarios, type EmpresaConfig } from '@/lib/access-gates';

// Wrappers booleanos (compat com os call-sites existentes). A lógica canônica +
// o diagnóstico (GateResult: code/message/remediation) vivem em lib/access-gates.
// Para novos call-sites que precisam mostrar o MOTIVO do bloqueio, use os gates
// diretamente em vez destes booleanos.

export function isPerfilComportamentalLiberado(config: EmpresaConfig | null | undefined): boolean {
  return canAccessPerfilComportamental(config).allowed;
}

export function isMapeamentoCenariosLiberado(config: EmpresaConfig | null | undefined): boolean {
  return canAccessMapeamentoCenarios(config).allowed;
}
