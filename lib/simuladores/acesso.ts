import 'server-only';
import { tenantDb } from '@/lib/tenant-db';
import { acessoDoCargo, ACESSO_ATUAL, CHAVE_ACESSO_SIMULADORES, SEM_ACESSO, idDoCargo, mapaDeCargos, type AcessoSimuladores } from './acesso-cargo';

/** Cargo vem do cadastro autenticado, nunca de um parâmetro enviado pelo participante. */
export async function acessoSimuladoresDoColaborador(
  colaborador: { empresa_id?: string | null; cargo?: string | null } | null | undefined,
): Promise<AcessoSimuladores> {
  if (!colaborador?.empresa_id) return { ...SEM_ACESSO };
  try {
    const tdb = tenantDb(colaborador.empresa_id);
    const { data: empresa, error } = await tdb.raw.from('empresas')
      .select('sys_config').eq('id', colaborador.empresa_id).maybeSingle();
    if (error || !empresa) return { ...SEM_ACESSO };
    if (empresa.sys_config?.[CHAVE_ACESSO_SIMULADORES] === undefined) return { ...ACESSO_ATUAL };
    if (!colaborador.cargo) return acessoDoCargo(empresa.sys_config, null);
    // Nome normalizado (caixa, acento, espaços), a mesma régua dos painéis de equipe.
    const { data: cargos, error: erroCargo } = await tdb.from('cargos_empresa').select('id,nome');
    if (erroCargo) return { ...SEM_ACESSO };
    return acessoDoCargo(empresa.sys_config, idDoCargo(mapaDeCargos(cargos || []), colaborador.cargo));
  } catch {
    return { ...SEM_ACESSO };
  }
}
