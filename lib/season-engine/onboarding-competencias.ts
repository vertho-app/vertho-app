import { chaveMapeamento } from '@/lib/mapeamento-competencias';

/**
 * As N competências de um Onboarding para um CARGO, sem olhar a pessoa: o override
 * da config efetiva e, para completar, o Top 5 do cargo. É a parte de
 * `resolverCompetenciasDoOnboarding` que não depende de avaliação nenhuma, extraída
 * para quem precisa das competências ANTES de existir pessoa mapeada (o gerador do
 * Cenário B integrador, 04/10/2026): duas listas "das 5 competências do Onboarding"
 * divergiriam, e o B integrador seria gerado para um conjunto que a trilha não usa.
 * Mesmas recusas e mesmos códigos de erro da geração.
 */
export async function competenciasDoOnboardingDoCargo(
  tdb: any,
  cargo: string | null | undefined,
  cfg: Record<string, any> | null | undefined,
  n: number,
): Promise<{ competencias: string[] } | { error: string; codigo: string }> {
  const unicas = (lista: unknown[]): string[] => {
    const vistas = new Set<string>();
    const out: string[] = [];
    for (const c of lista) {
      const chave = chaveMapeamento(c);
      if (!chave || vistas.has(chave)) continue;
      vistas.add(chave);
      out.push(String(c).trim());
    }
    return out;
  };

  const { data: cargoRow, error: errCargo } = await tdb.from('cargos_empresa')
    .select('top5_workshop').eq('nome', cargo || '').maybeSingle();
  if (errCargo) return { error: `Falha ao ler o Top 5 do cargo: ${errCargo.message}`, codigo: 'onboarding_top5_leitura' };

  const doOverride = unicas(Array.isArray(cfg?.competencias_onboarding) ? cfg!.competencias_onboarding : []);
  const doTop5 = unicas(Array.isArray(cargoRow?.top5_workshop) ? cargoRow.top5_workshop : []);
  const competencias = unicas([...doOverride, ...doTop5]).slice(0, n);

  if (competencias.length === 0) {
    return {
      error: `Modo Onboarding precisa de ${n} competências. Defina o Top 5 do cargo "${cargo || 'sem cargo'}" ou configure sys_config.competencias_onboarding.`,
      codigo: 'onboarding_sem_competencias',
    };
  }
  if (competencias.length < n) {
    return {
      error: `O Onboarding cobre ${n} competências em sequência e o cargo "${cargo || 'sem cargo'}" tem ${competencias.length} (${competencias.join(', ')}). Complete o Top 5 do cargo ou defina sys_config.competencias_onboarding. Nada foi gerado.`,
      codigo: 'onboarding_competencias_insuficientes',
    };
  }
  return { competencias };
}
