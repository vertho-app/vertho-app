/**
 * Quem TREINA e quem só ACOMPANHA os simuladores de atendimento e de vendas.
 *
 * 🔑 DECISÃO DO DONO (17/09/2026). Gestor e RH não treinam atendimento nem
 * vendas: para eles esses simuladores são acompanhamento da equipe ("Equipe e
 * revisões" no de atendimento, "Gestão" no de vendas). O gestor pratica o
 * simulador de LIDERANÇA; o RH não pratica nenhum.
 *
 * A régua mora aqui, sem I/O, porque quatro lugares precisam dela e já
 * divergiram antes em regra de acesso: o menu (`dashboard-shell`), o `/api/me`,
 * o gate das páginas (`lib/simuladores/pagina.ts`) e o contexto das APIs de cada
 * simulador. Quem administra a plataforma segue treinando: é o preview de quem
 * configura o piloto.
 */
export const PAPEIS_QUE_SO_ACOMPANHAM = ['gestor', 'rh'] as const;

export function soAcompanhaSimuladores(
  pessoa: { role?: string | null; isPlatformAdmin?: boolean | null } | null | undefined,
): boolean {
  if (!pessoa || pessoa.isPlatformAdmin === true) return false;
  return (PAPEIS_QUE_SO_ACOMPANHAM as readonly string[]).includes(String(pessoa.role ?? ''));
}
