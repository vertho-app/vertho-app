import type { EmpresaConfig, GateResult } from './types';
import { canAccessPerfilComportamental } from './perfil-comportamental';

/**
 * Gate do mapeamento de cenários — fail-CLOSED: exige liberação explícita
 * (`mapeamento_cenarios_liberado === true`) e DEPOIS do perfil liberado.
 *
 * Ausência da flag = bloqueado é INTENCIONAL (testado). O bug que esta camada
 * resolve não é a lógica, e sim o DIAGNÓSTICO: antes o usuário com perfil pronto
 * ficava bloqueado sem saber que faltava o admin ativar a flag. Agora o
 * GateResult carrega code/message/remediation para a UI mostrar o caminho.
 */
export function canAccessMapeamentoCenarios(config: EmpresaConfig | null | undefined): GateResult {
  const c = config || {};
  const perfil = canAccessPerfilComportamental(c);
  if (!perfil.allowed) return perfil; // propaga o motivo do perfil (pré-requisito)
  if (c.mapeamento_cenarios_liberado !== true) {
    return {
      allowed: false,
      code: 'CENARIOS_BLOQUEADOS',
      message: 'Mapeamento de cenários ainda não liberado.',
      remediation: 'Ative "mapeamento_cenarios_liberado" no painel da empresa (após liberar o perfil).',
    };
  }
  return { allowed: true };
}
