import { ROSTER_COMERCIAL } from '@/lib/demo/rosters/comercial';
import { ROSTER_ESCOLAR } from '@/lib/demo/rosters/escolar';
import type { DemoRoster } from '@/lib/demo/rosters/types';

/**
 * Os elencos disponíveis. Um ambiente demo escolhe o seu pela chave, em
 * `DEMO_TENANT_PROFILES`; o motor do reset não conhece segmento nenhum.
 */
export const DEMO_ROSTERS = {
  comercial: ROSTER_COMERCIAL,
  escolar: ROSTER_ESCOLAR,
} as const;

export type DemoRosterKey = keyof typeof DEMO_ROSTERS;

export function rosterDemo(key: DemoRosterKey): DemoRoster {
  const roster = DEMO_ROSTERS[key];
  // Chave inválida aqui significaria semear o tenant com elenco vazio, e um
  // reset "bem-sucedido" que deixa a demo sem ninguém é pior que um erro.
  if (!roster) throw new Error(`Roster de demonstração desconhecido: ${key}`);
  return roster;
}

export { ROSTER_COMERCIAL, ROSTER_ESCOLAR };
export type { DemoRoster };
