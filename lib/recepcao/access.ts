import 'server-only';
import { requireUser, type AuthenticatedContext } from '@/lib/auth/request-context';
import { createSupabaseAdmin } from '@/lib/supabase';
import { can } from '@/lib/permissions';
import { acessoSimuladoresDoColaborador } from '@/lib/simuladores/acesso';
import { soAcompanhaSimuladores } from '@/lib/simuladores/papel';
import { DOMINIO_PADRAO, dominioExiste } from './dominio';

export class RecepcaoError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export function empresaDaSessao(auth: AuthenticatedContext, solicitada?: string | null) {
  const empresaId = auth.isPlatformAdmin ? (solicitada || auth.empresaId) : auth.empresaId;
  if (!empresaId) throw new RecepcaoError(400, 'Selecione uma clínica para começar.');
  if (!auth.isPlatformAdmin && solicitada && solicitada !== empresaId) throw new RecepcaoError(403, 'Clínica não autorizada.');
  // `colaboradores` não tem coluna `ativo`: a checagem antiga `ativo === false` nunca disparava (medido 09/09).
  if (!auth.isPlatformAdmin && (!auth.colaborador || auth.colaborador.empresa_id !== empresaId)) {
    throw new RecepcaoError(403, 'Seu cadastro não tem acesso a este treino.');
  }
  return empresaId;
}

export async function contextoRecepcao(req: Request, solicitada?: string | null, escrita = false, autenticado?: AuthenticatedContext) {
  const auth = autenticado ?? await requireUser(req);
  if (auth instanceof Response) return auth;
  const empresaId = empresaDaSessao(auth, solicitada);
  // Gestor e RH acompanham a equipe e não treinam (decisão do dono, 17/09/2026).
  // A leitura continua aberta para eles: é por ela que chegam à aba da equipe.
  const soAcompanha = soAcompanhaSimuladores(auth);
  if (escrita && soAcompanha) throw new RecepcaoError(403, 'No simulador de atendimento, gestão e RH acompanham a equipe; quem treina é quem atende.');
  if (escrita && !(await can(auth, 'assessments.answer'))) throw new RecepcaoError(403, 'Seu perfil não permite realizar treinos.');
  const sb = createSupabaseAdmin();
  const { data: empresa, error: errEmpresa } = await sb.from('empresas').select('id,nome').eq('id', empresaId).maybeSingle();
  if (errEmpresa) throw new RecepcaoError(503, 'Não foi possível consultar a clínica. Tente novamente.');
  if (!empresa) throw new RecepcaoError(404, 'Clínica não encontrada.');
  const { data: config, error } = await sb.from('recepcao_config').select('habilitado,dominio').eq('empresa_id', empresaId).maybeSingle();
  if (error) throw new RecepcaoError(503, 'O treinamento está temporariamente indisponível.');
  const habilitado = config?.habilitado === true;
  if (!habilitado && !auth.isPlatformAdmin) throw new RecepcaoError(403, 'O simulador de atendimento ainda não está habilitado para sua clínica.');
  // A liberação por cargo diz quem TREINA; quem só acompanha não depende dela.
  if (!auth.isPlatformAdmin && !soAcompanha && !(await acessoSimuladoresDoColaborador(auth.colaborador)).atendimento)
    throw new RecepcaoError(403, 'O simulador de atendimento não está liberado para seu cargo.');
  let ownerKey:string;
  if (auth.isPlatformAdmin) {
    const {data:admin,error} = await sb.from('platform_admins').select('id').eq('email',auth.email.toLowerCase()).maybeSingle();
    if(error || !admin?.id) throw new RecepcaoError(403,'Não foi possível identificar seu acesso administrativo.');
    ownerKey=`admin:${admin.id}`;
  } else ownerKey=`colab:${auth.colaborador.id}`;
  // Segmento da empresa (mig 263): decide os casos que ela vê. Valor fora do registro não vira outro segmento em silêncio.
  if (config?.dominio && !dominioExiste(config.dominio)) throw new RecepcaoError(503, 'O segmento configurado para esta empresa não é reconhecido. Fale com o suporte.');
  const dominio: string = config?.dominio || DOMINIO_PADRAO;
  return { auth, empresaId, empresaNome: empresa.nome, habilitado, soAcompanha, sb, owner: auth.email.toLowerCase(), ownerKey, dominio };
}

export type ContextoRecepcao = Exclude<Awaited<ReturnType<typeof contextoRecepcao>>,Response>;
