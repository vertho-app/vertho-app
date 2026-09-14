import 'server-only';
import { requireUser, type AuthenticatedContext } from '@/lib/auth/request-context';
import { can } from '@/lib/permissions';
import { tenantDb } from '@/lib/tenant-db';
import { SimuladorError } from './core';
import { CONFIG_COLUNAS, type Config } from './schema';

export function empresaAutorizada(auth: AuthenticatedContext, solicitada?: string | null) {
  const empresaId = auth.isPlatformAdmin ? solicitada || auth.empresaId : auth.empresaId;
  if (!empresaId) throw new SimuladorError(400, 'Selecione uma empresa para abrir o simulador.');
  if (
    !auth.isPlatformAdmin &&
    ((solicitada && solicitada !== empresaId) ||
      !auth.colaborador ||
      auth.colaborador.empresa_id !== empresaId)
  ) {
    throw new SimuladorError(403, 'Seu cadastro não tem acesso a esta empresa.');
  }
  return empresaId;
}
export async function contexto(
  req: Request,
  empresa?: string | null,
  escrita = false,
  autenticado?: AuthenticatedContext,
) {
  const auth = autenticado ?? (await requireUser(req));
  if (auth instanceof Response) return auth;
  const empresaId = empresaAutorizada(auth, empresa);
  if (escrita && !(await can(auth, 'assessments.answer')))
    throw new SimuladorError(403, 'Seu perfil não permite realizar treinos.');
  const tdb = tenantDb(empresaId);
  const [empresaResult, configResult] = await Promise.all([
    tdb.raw.from('empresas').select('id,nome').eq('id', empresaId).maybeSingle(),
    tdb.from('sim_vendas_config').select(CONFIG_COLUNAS).maybeSingle(),
  ]);
  if (empresaResult.error || configResult.error)
    throw new SimuladorError(503, 'Não foi possível consultar o simulador. Tente novamente.');
  if (!empresaResult.data) throw new SimuladorError(404, 'Empresa não encontrada.');
  const config = configResult.data as Config | null;
  if (!auth.isPlatformAdmin && !config?.habilitado)
    throw new SimuladorError(403, 'O simulador de vendas ainda não está habilitado para sua empresa.');
  let ownerKey: string;
  if (auth.isPlatformAdmin) {
    const { data, error } = await tdb.raw
      .from('platform_admins')
      .select('id')
      .eq('email', auth.email.toLowerCase())
      .maybeSingle();
    if (error || !data) throw new SimuladorError(403, 'Não foi possível identificar o administrador.');
    ownerKey = `admin:${data.id}`;
  } else ownerKey = `colab:${auth.colaborador.id}`;
  return {
    auth,
    empresaId,
    empresaNome: empresaResult.data.nome,
    config,
    ownerKey,
    tdb,
    colaboradorId: auth.isPlatformAdmin ? null : auth.colaborador.id,
    nomeVendedor: auth.colaborador?.empresa_id === empresaId ? auth.colaborador.nome_completo : 'Vendedor',
  };
}
export type Contexto = Exclude<Awaited<ReturnType<typeof contexto>>, Response>;

export async function vendasHabilitado(empresaId?: string | null): Promise<boolean> {
  if (!empresaId) return false;
  try {
    const { data, error } = await tenantDb(empresaId)
      .from('sim_vendas_config')
      .select('habilitado')
      .maybeSingle();
    return !error && data?.habilitado === true;
  } catch {
    return false;
  }
}
