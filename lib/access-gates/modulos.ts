/**
 * Gate de MÓDULO CONTRATADO — o pedágio que faltava.
 *
 * Módulos opcionais (Pulso, hoje) são vendidos à parte. Até aqui não havia onde
 * registrar isso: `pulse_stage` foi citado na mig 096 como "fica em
 * `sys_config`, não precisa de DDL" e **nunca foi implementado** (zero
 * ocorrências no código). Qualquer admin criava ciclo para qualquer empresa, e o
 * colaborador via a etapa pela simples existência de um assignment.
 *
 * 🔴 O CUSTO JÁ FOI COBRADO. Um ciclo rascunho de Macaé (14/05, nunca executado)
 * tinha 40 assignments com `due_date = NULL`; o filtro de pendentes deixa NULL
 * passar (`lib/home/loaders.ts`) e a home renderiza sem outra condição — **40
 * diretores receberam um card "Pulso T0" durante 3 meses**, de um módulo que
 * ninguém contratou. Rascunho sem gate chega ao usuário como entrega real.
 *
 * ── Disponível ≠ instanciado ────────────────────────────────────────────────
 * Este gate responde só à primeira pergunta:
 *   • **disponível** — a empresa contratou (`sys_config.modulos.<nome>`);
 *   • **instanciado** — esta safra usa (etapa da turma, docs/TURMAS.md §2).
 * A Secretaria pode contratar Pulso e aplicá-lo só na turma de diretores. Uma
 * flag só para as duas coisas impediria vender o módulo para a turma nova sem
 * religar a antiga.
 */

import type { GateResult, EmpresaConfig } from './types';

/** Módulos opcionais conhecidos. Enum fechado: módulo novo entra aqui. */
export const MODULOS = {
  PULSO: 'pulso',
} as const;
export type Modulo = (typeof MODULOS)[keyof typeof MODULOS];

const ROTULO: Record<string, string> = {
  [MODULOS.PULSO]: 'Pulso de Desenvolvimento',
};

/**
 * A empresa contratou o módulo?
 *
 * Fail-closed: ausência de `modulos` significa NÃO contratado. O contrário
 * (default liberado) reproduziria exatamente o estado que produziu o card
 * fantasma — e um módulo que "vaza ligado" não dá erro em lugar nenhum, só
 * aparece na tela de quem não comprou.
 */
export function canUseModulo(config: EmpresaConfig | null | undefined, modulo: Modulo): GateResult {
  const contratado = (config as any)?.modulos?.[modulo] === true;
  if (!contratado) {
    const nome = ROTULO[modulo] || modulo;
    return {
      allowed: false,
      code: 'MODULO_NAO_CONTRATADO',
      message: `O módulo ${nome} não está contratado para esta empresa.`,
      remediation: `Ative \`sys_config.modulos.${modulo}\` no painel da empresa (Configurações → Módulos) antes de criar ciclos ou disparar convites.`,
    };
  }
  return { allowed: true };
}

/** Conveniência booleana para UI (esconder aba/menu). */
export function moduloContratado(config: EmpresaConfig | null | undefined, modulo: Modulo): boolean {
  return canUseModulo(config, modulo).allowed;
}
