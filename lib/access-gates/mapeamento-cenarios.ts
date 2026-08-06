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
 *
 * ⚠️ EXCEÇÃO — empresa com FONTE EXTERNA de perfil (`perfil_externo_fonte`:
 * OPQ32, Hogan…): ela não faz o DISC nativo, então "perfil bloqueado" é o
 * estado CORRETO e permanente dela — não uma etapa pendente. Fazer o perfil ser
 * pré-requisito nesse caso torna os cenários INALCANÇÁVEIS (o admin só consegue
 * liberar os dois ou bloquear os dois). A votação aberta continua bloqueando.
 */
export function canAccessMapeamentoCenarios(config: EmpresaConfig | null | undefined): GateResult {
  const c = config || {};
  const usaPerfilExterno = !!c.perfil_externo_fonte;
  if (usaPerfilExterno) {
    if (c.votacao_ativa === true && c.mapeamento_cenarios_liberado !== true) {
      return {
        allowed: false,
        code: 'VOTACAO_ATIVA',
        message: 'Disponível após o fechamento da votação.',
        remediation: 'Encerre a votação ou libere o mapeamento de cenários explicitamente.',
      };
    }
  } else {
    const perfil = canAccessPerfilComportamental(c);
    if (!perfil.allowed) return perfil; // propaga o motivo do perfil (pré-requisito)
  }
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
