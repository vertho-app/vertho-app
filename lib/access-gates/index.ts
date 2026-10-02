/**
 * Gates de acesso a recursos de produto — fonte canônica da lógica de liberação
 * (perfil comportamental, mapeamento de cenários, …). Cada gate retorna um
 * GateResult com diagnóstico (code/message/remediation) para a UI nunca bloquear
 * em silêncio. Os helpers booleanos em lib/votacao/status.ts delegam para cá.
 */
export type { GateResult, EmpresaConfig } from './types';
export { canAccessPerfilComportamental } from './perfil-comportamental';
export { canAccessMapeamentoCenarios } from './mapeamento-cenarios';
export { canAccessDiagnosticoNaOrdem, gateDiagnosticoDaPessoa } from './diagnostico-ordem';
export {
  usaMapeamentoComportamentalNativo,
  precisaPreferenciasAprendizagem,
  colunasDePreferencias,
  prefsDeOrdem,
  ordemDePrefs,
  N_FORMATOS,
  FORMATOS_PREFERENCIA,
  type FormatoPreferenciaId,
} from './preferencias-aprendizagem';
export { canUseModulo, moduloContratado, MODULOS, type Modulo } from './modulos';
