import 'server-only';
import {
  getAuthenticatedUser,
  type AuthenticatedUser,
} from '@/lib/auth/request-context';
import { tenantDb } from '@/lib/tenant-db';
import { SimuladorError } from './core';
import type { ContextoTreino } from './access';
import { CONFIG_COLUNAS, type Config } from './schema';
import { VERTHO_TREINO_EMPRESA_ID, BRIEFING_VERTHO } from './vertho';

/** Gate de sessão do canal; elegibilidade e isolamento são exigidos em contextoVertho. */
export async function requireRepresentativeOrInternalTrainingUser(
  req: Request,
): Promise<AuthenticatedUser> {
  const user = await getAuthenticatedUser(req);
  if (!user) throw new SimuladorError(401, 'Não autenticado.');
  return user;
}

/** Identidade vem de auth.getUser; vínculo e status são revalidados no banco. */
export async function assertAcessoVertho(user: AuthenticatedUser) {
  const tdb = tenantDb(VERTHO_TREINO_EMPRESA_ID);
  const { data, error } = await tdb.rpc('sim_vendas_vertho_acesso', {
    p_user: user.id,
  });
  if (error)
    throw new SimuladorError(
      503,
      'Não foi possível verificar seu acesso ao treinamento.',
    );
  if (!data?.ativo)
    throw new SimuladorError(
      403,
      'Seu acesso ao treinamento comercial não está ativo. Solicite a liberação ao responsável comercial.',
    );
  return { nome: data.nome as string };
}

export async function contextoVertho(
  user: AuthenticatedUser,
): Promise<ContextoTreino> {
  const tdb = tenantDb(VERTHO_TREINO_EMPRESA_ID);
  // Vincula RC ativo uma única vez, sem reativar um participante suspenso.
  const vinculo = await tdb.rpc('sim_vendas_vertho_vincular_representante', {
    p_user: user.id,
  });
  if (vinculo.error)
    throw new SimuladorError(
      503,
      'Não foi possível identificar seu cadastro comercial.',
    );
  const participante = await assertAcessoVertho(user);
  const { data, error } = await tdb
    .from('sim_vendas_config')
    .select(CONFIG_COLUNAS)
    .maybeSingle();
  if (error || !data)
    throw new SimuladorError(503, 'O treinamento comercial está indisponível.');
  return {
    auth: null,
    empresaId: VERTHO_TREINO_EMPRESA_ID,
    empresaNome: 'Vertho · Treinamento comercial',
    config: { ...data, briefing: BRIEFING_VERTHO } as Config,
    soAcompanha: false,
    ownerKey: `vendedor:${user.id}`,
    tdb,
    colaboradorId: null,
    nomeVendedor: participante.nome,
    vertho: user,
  };
}
