import 'server-only';
import { requireUser, type AuthenticatedContext } from '@/lib/auth/request-context';
import { createSupabaseAdmin } from '@/lib/supabase';
import { can } from '@/lib/permissions';

export class RecepcaoError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export function empresaDaSessao(auth: AuthenticatedContext, solicitada?: string | null) {
  const empresaId = auth.isPlatformAdmin ? (solicitada || auth.empresaId) : auth.empresaId;
  if (!empresaId) throw new RecepcaoError(400, 'Selecione uma clínica para começar.');
  if (!auth.isPlatformAdmin && solicitada && solicitada !== empresaId) throw new RecepcaoError(403, 'Clínica não autorizada.');
  if (!auth.isPlatformAdmin && (!auth.colaborador || auth.colaborador.empresa_id !== empresaId || auth.colaborador.ativo === false)) {
    throw new RecepcaoError(403, 'Seu cadastro não tem acesso a este treino.');
  }
  return empresaId;
}

export async function contextoRecepcao(req: Request, solicitada?: string | null, escrita = false, autenticado?: AuthenticatedContext) {
  const auth = autenticado ?? await requireUser(req);
  if (auth instanceof Response) return auth;
  const empresaId = empresaDaSessao(auth, solicitada);
  if (escrita && !(await can(auth, 'assessments.answer'))) throw new RecepcaoError(403, 'Seu perfil não permite realizar treinos.');
  const sb = createSupabaseAdmin();
  const { data: empresa, error: errEmpresa } = await sb.from('empresas').select('id,nome').eq('id', empresaId).maybeSingle();
  if (errEmpresa) throw new RecepcaoError(503, 'Não foi possível consultar a clínica. Tente novamente.');
  if (!empresa) throw new RecepcaoError(404, 'Clínica não encontrada.');
  const { data: config, error } = await sb.from('recepcao_config').select('habilitado').eq('empresa_id', empresaId).maybeSingle();
  if (error) throw new RecepcaoError(503, 'O treinamento está temporariamente indisponível.');
  const habilitado = config?.habilitado === true;
  if (!habilitado && !auth.isPlatformAdmin) throw new RecepcaoError(403, 'O treino de atendimento ainda não está habilitado para sua clínica.');
  return { auth, empresaId, empresaNome: empresa.nome, habilitado, sb, owner: auth.email.toLowerCase() };
}
