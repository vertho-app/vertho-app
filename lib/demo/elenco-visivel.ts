import { isDemoPersonaEmail } from '@/lib/internal-emails';

/**
 * Quem pode aparecer numa LISTA DE PESSOAS dentro de um tenant de demonstração.
 *
 * 🔴 POR QUE ISTO EXISTE. A sala de apresentação entrega as visões de gestor e
 * de RH a qualquer prospect que recebe o roteiro da degustação, e nesses mesmos
 * tenants moram os CONVIDADOS: gente real, com o nome que o vendedor digitou. O
 * RH enxerga a empresa inteira, então cada visitante lia na tela Equipe o nome e
 * o cargo de quem tinha degustado antes dele. `Medido 16/09/2026:` 9 convidados
 * no `acme-demo` e 3 no `gruposinal` entravam nessa lista. O `gestor_email` nulo
 * da criação (15/09) fechou só a visão de GESTOR; a de RH continuava aberta.
 *
 * 🔑 A régua é de PERTENCIMENTO, não de exclusão: aparece quem é do elenco
 * (`*.demo@vertho.ai`), e mais ninguém. Uma lista de exceções ("menos os
 * convidados, menos a conta de teste…") só cresce depois do incidente; ator novo
 * no tenant de demonstração (convidado de outro ambiente, conta de verificação,
 * cadastro manual) fica fora por padrão. É a mesma lição de `acme-elenco.ts`.
 *
 * Tenant de cliente passa inteiro: lá não existe elenco, e todo mundo é gente
 * que o RH acompanha de verdade.
 *
 * As visões AGREGADAS (ranking de adequação, prontidão, DNA) não precisam disto:
 * elas já excluem conta interna, e o e-mail técnico do passaporte é interno de
 * propósito (`lib/demo/convidado-demo.ts`). O risco mora nas listas que mostram
 * pessoa por pessoa.
 */
export function recortarElencoDemo<T extends { email?: string | null }>(
  pessoas: readonly T[],
  tenantDemo: boolean,
): T[] {
  if (!tenantDemo) return [...pessoas];
  return pessoas.filter((pessoa) => isDemoPersonaEmail(pessoa.email));
}
