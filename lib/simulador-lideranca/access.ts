import 'server-only';
import { can } from '@/lib/permissions';
import { tenantDb } from '@/lib/tenant-db';
import type { AuthenticatedContext } from '@/lib/auth/request-context';
import { acessoSimuladoresDoColaborador } from '@/lib/simuladores/acesso';
import { resolverTrilhoLideranca } from '@/lib/prontidao-lideranca/trilho';
import { LiderancaError } from './schema';

export async function contexto(
  auth: AuthenticatedContext,
  solicitada?: string | null,
) {
  const empresaId = auth.isPlatformAdmin
    ? solicitada || auth.empresaId
    : auth.empresaId;
  if (!empresaId)
    throw new LiderancaError(
      400,
      'Selecione uma empresa para experimentar o simulador.',
    );
  if (
    !auth.isPlatformAdmin &&
    ((solicitada && solicitada !== empresaId) ||
      auth.colaborador?.empresa_id !== empresaId)
  )
    throw new LiderancaError(
      403,
      'Seu cadastro não tem acesso a esta empresa.',
    );
  if (!(await can(auth, 'assessments.answer')))
    throw new LiderancaError(403, 'Seu perfil não permite realizar treinos.');
  const tdb = tenantDb(empresaId);
  const { data: empresa, error } = await tdb.raw
    .from('empresas')
    .select('id,nome,sys_config')
    .eq('id', empresaId)
    .maybeSingle();
  if (error)
    throw new LiderancaError(
      503,
      'Não foi possível consultar o acesso ao simulador.',
    );
  if (!empresa) throw new LiderancaError(404, 'Empresa não encontrada.');
  let variante: 'lider' | 'futuro' = 'lider';
  let ownerKey: string;
  if (auth.isPlatformAdmin) {
    const admin = await tdb.raw
      .from('platform_admins')
      .select('id')
      .eq('email', auth.email.toLowerCase())
      .maybeSingle();
    if (admin.error || !admin.data)
      throw new LiderancaError(
        403,
        'Não foi possível identificar o administrador.',
      );
    ownerKey = `admin:${admin.data.id}`;
  } else {
    if (!(await acessoSimuladoresDoColaborador(auth.colaborador)).lideranca)
      throw new LiderancaError(
        403,
        'O simulador de liderança não está liberado para seu cargo.',
      );
    const trilho = await resolverTrilhoLideranca(
      tdb.raw,
      { ...auth.colaborador, email: auth.email },
      empresa.sys_config,
    );
    if (trilho.ok === false) throw new LiderancaError(403, trilho.message);
    variante = trilho.variante;
    ownerKey = `colab:${auth.colaborador.id}`;
  }
  return {
    auth,
    empresaId,
    empresaNome: empresa.nome as string,
    tdb,
    ownerKey,
    variante,
    colaboradorId: auth.isPlatformAdmin ? null : auth.colaborador.id,
  };
}
export type Contexto = Awaited<ReturnType<typeof contexto>>;
