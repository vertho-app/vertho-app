import 'server-only';

import {
  copiaDaDegustacaoGuiada,
  passoPessoalDaDegustacao,
  type AcmeProspectPresentationRoleKey,
  type EstadoPessoalDegustacao,
  type PassoPessoalDegustacao,
} from '@/lib/demo/acme-prospect-config';
import { abrirAcessoDaDegustacao } from '@/lib/demo/degustacao-acesso';
import { demoPresentationAuthUrl, isDemoPresentationTenant } from '@/lib/demo/presentation';
import { issueDemoPresentationTicket } from '@/lib/demo/presentation-ticket';

export type CartaoDeVisao = {
  roleKey: AcmeProspectPresentationRoleKey;
  titulo: string;
  descricao: string;
  url: string;
  vistoEm: string | null;
};

/**
 * O que a página de boas-vindas mostra. Só estados e datas: quem tem o link não
 * vê perfil, nota nem devolutiva por aqui. O resultado fica atrás da sessão, que
 * nasce no clique.
 */
export type PaginaDaDegustacao =
  | { status: 'expirado' | 'invalido' | 'indisponivel' }
  | {
      status: 'ok';
      primeiroNome: string;
      cargo: string;
      expiraEm: string;
      contexto: string;
      visoes: CartaoDeVisao[];
      pessoal: EstadoPessoalDegustacao & { passo: PassoPessoalDegustacao };
    };

const COLUNA_DA_VISAO: Record<AcmeProspectPresentationRoleKey, string> = {
  usuario: 'colaborador_accessed_at',
  gestor: 'gestor_accessed_at',
  rh: 'rh_accessed_at',
};

/**
 * Carrega a página a partir do passe e do hostname.
 *
 * 🔴 NÃO ESCREVE E NÃO AUTENTICA. É exatamente este GET que o robô de preview do
 * WhatsApp faz, e na versão A foi o GET que criava sessão e carimbava "acesso".
 * `tests/unit/degustacao-versao-b.test.ts` prova que nada é gravado e que o Auth
 * não é chamado.
 */
export async function carregarPaginaDaDegustacao(
  passe: string | null | undefined,
  hostname: string,
  agora: Date = new Date(),
): Promise<PaginaDaDegustacao> {
  const acesso = await abrirAcessoDaDegustacao(passe, hostname, [
    'colaborador_id',
    'prospect_name',
    'cargo',
    'colaborador_accessed_at',
    'gestor_accessed_at',
    'rh_accessed_at',
    'disc_completed_at',
  ]);
  if (acesso.status === 'indisponivel') {
    console.error('[degustacao] carregar página:', acesso.motivo);
    return { status: 'indisponivel' };
  }
  if (acesso.status !== 'ok') return { status: acesso.status };
  if (!isDemoPresentationTenant(acesso.slug)) return { status: 'invalido' };

  const tdb = acesso.tdb;
  const sessao = acesso.sessao;
  let discFeito = Boolean(sessao.disc_completed_at);
  let respondeuSituacao = false;
  let devolutivaPronta = false;

  if (sessao.colaborador_id) {
    const { data: colaborador, error: erroColaborador } = await tdb.from('colaboradores')
      .select('id,mapeamento_em')
      .eq('id', sessao.colaborador_id)
      .maybeSingle();
    if (erroColaborador) {
      console.error('[degustacao] carregar convidado:', erroColaborador.message);
      return { status: 'indisponivel' };
    }
    discFeito = discFeito || Boolean((colaborador as any)?.mapeamento_em);

    const { data: respostas, error: erroRespostas } = await tdb.from('respostas')
      .select('id,nivel_ia4,nota_ia4')
      .eq('colaborador_id', sessao.colaborador_id);
    if (erroRespostas) {
      console.error('[degustacao] carregar respostas do convidado:', erroRespostas.message);
      return { status: 'indisponivel' };
    }
    const linhas = (respostas || []) as Array<{ nivel_ia4: number | null; nota_ia4: number | null }>;
    respondeuSituacao = linhas.length > 0;
    // A avaliação grava `avaliacao_ia`, `nivel_ia4` e `nota_ia4` juntos
    // (`lib/ia4-avaliacao.ts`); os dois números bastam e não trazem o jsonb.
    devolutivaPronta = linhas.some((linha) => linha.nivel_ia4 != null || linha.nota_ia4 != null);
  }

  const nowSeconds = Math.floor(agora.getTime() / 1000);
  // Emitido na hora, com o prazo do passaporte e a sessão para o acompanhamento.
  // O ticket da sala tem contexto de assinatura PRÓPRIO: quem o tem não forja o
  // passe do convidado (e esta página nunca converte um no outro).
  const ticket = issueDemoPresentationTicket(nowSeconds, {
    prospectSessionId: acesso.sessionId,
    expiresAtSeconds: Math.floor(Date.parse(sessao.expires_at) / 1000),
  }, acesso.slug);

  const copia = copiaDaDegustacaoGuiada(acesso.slug);
  const visoes: CartaoDeVisao[] = copia.visoes.map((visao) => ({
    roleKey: visao.roleKey,
    titulo: visao.titulo,
    descricao: visao.descricao,
    url: demoPresentationAuthUrl(visao.roleKey, ticket, undefined, acesso.slug),
    vistoEm: (sessao[COLUNA_DA_VISAO[visao.roleKey]] as string | null) || null,
  }));

  const estado: EstadoPessoalDegustacao = {
    discFeito,
    respondeuSituacao,
    devolutivaPronta,
  };

  const nome = String(sessao.prospect_name || '').trim();
  return {
    status: 'ok',
    primeiroNome: nome.split(/\s+/)[0] || nome,
    cargo: String(sessao.cargo || ''),
    expiraEm: String(sessao.expires_at),
    contexto: copia.contexto,
    visoes,
    pessoal: { ...estado, passo: passoPessoalDaDegustacao(estado) },
  };
}
