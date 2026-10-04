import 'server-only';
import { requireUser, type AuthenticatedContext } from '@/lib/auth/request-context';
import { createSupabaseAdmin } from '@/lib/supabase';
import { can } from '@/lib/permissions';
import { acessoSimuladoresDoColaborador } from '@/lib/simuladores/acesso';
import { soAcompanhaSimuladores } from '@/lib/simuladores/papel';
import { DOMINIO_PADRAO, dominioExiste } from './dominio';

/**
 * Quem LÊ os casos e a biblioteca de competências do treino de atendimento:
 * quem edita (`simulador.casos.manage`) e quem só lê (`simulador.casos.view`, o
 * Sócio). Editar, publicar, arquivar e rascunhar com IA seguem exigindo a chave
 * de edição. Pedido do dono em 03/10/2026.
 */
export async function podeVerCasos(auth: Parameters<typeof can>[0]): Promise<boolean> {
  return (await can(auth, 'simulador.casos.manage')) || (await can(auth, 'simulador.casos.view'));
}

export class RecepcaoError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export function empresaDaSessao(auth: AuthenticatedContext, solicitada?: string | null) {
  const empresaId = auth.isPlatformAdmin ? (solicitada || auth.empresaId) : auth.empresaId;
  if (!empresaId) throw new RecepcaoError(400, 'Selecione uma empresa para começar.');
  if (!auth.isPlatformAdmin && solicitada && solicitada !== empresaId) throw new RecepcaoError(403, 'Empresa não autorizada.');
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
  if (errEmpresa) throw new RecepcaoError(503, 'Não foi possível consultar a empresa. Tente novamente.');
  if (!empresa) throw new RecepcaoError(404, 'Empresa não encontrada.');
  const { data: config, error } = await sb.from('recepcao_config').select('habilitado,dominio').eq('empresa_id', empresaId).maybeSingle();
  if (error) throw new RecepcaoError(503, 'O treinamento está temporariamente indisponível.');
  const habilitado = config?.habilitado === true;
  if (!habilitado && !auth.isPlatformAdmin) throw new RecepcaoError(403, 'O simulador de atendimento ainda não está habilitado para a sua empresa.');
  // A liberação por cargo diz quem TREINA; quem só acompanha não depende dela.
  if (!auth.isPlatformAdmin && !soAcompanha) {
    const acesso = await acessoSimuladoresDoColaborador(auth.colaborador);
    // Leitura que falhou NÃO é "não liberado para seu cargo" (R-139): 503, tentar de novo.
    if (acesso.indisponivel) throw new RecepcaoError(503, 'Não foi possível consultar o seu acesso ao simulador. Tente novamente.');
    if (!acesso.atendimento) throw new RecepcaoError(403, 'O simulador de atendimento não está liberado para seu cargo.');
  }
  let ownerKey:string;
  if (auth.isPlatformAdmin) {
    const {data:admin,error} = await sb.from('platform_admins').select('id').eq('email',auth.email.toLowerCase()).maybeSingle();
    if(error || !admin?.id) throw new RecepcaoError(403,'Não foi possível identificar seu acesso administrativo.');
    ownerKey=`admin:${admin.id}`;
  } else ownerKey=`colab:${auth.colaborador.id}`;
  // Segmento da empresa (mig 263): decide os casos que ela vê. Valor fora do registro não vira outro segmento em silêncio.
  if (config?.dominio && !dominioExiste(config.dominio)) throw new RecepcaoError(503, 'O segmento configurado para esta empresa não é reconhecido. Fale com o suporte.');
  // Sem configuração, o segmento NÃO está definido (27/09/2026): o motor segue no padrão para o
  // teste administrativo, mas a tela diz "segmento não definido" em vez de fingir que alguém
  // escolheu "Recepção de clínica" (foi assim que um admin, no contexto de uma escola, caiu
  // nos casos médicos). Habilitar a equipe exige escolher o segmento (rota de configuração).
  const segmentoDefinido = !!config?.dominio;
  const dominio: string = config?.dominio || DOMINIO_PADRAO;
  return { auth, empresaId, empresaNome: empresa.nome, habilitado, soAcompanha, sb, owner: auth.email.toLowerCase(), ownerKey, dominio, segmentoDefinido };
}

export type ContextoRecepcao = Exclude<Awaited<ReturnType<typeof contextoRecepcao>>,Response>;
