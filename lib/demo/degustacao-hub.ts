import 'server-only';

import {
  copiaDaDegustacaoGuiada,
  passoPessoalDaDegustacao,
  type AcmeProspectPresentationRoleKey,
  type EstadoPessoalDegustacao,
  type PassoPessoalDegustacao,
} from '@/lib/demo/acme-prospect-config';
import { abrirAcessoDaDegustacao, abrirAcessoPorCodigoCurto } from '@/lib/demo/degustacao-acesso';
import { linkDeContatoDaDegustacao } from '@/lib/demo/degustacao-contato';
import {
  DEMO_PRESENTATION_RETURN_PARAM,
  demoPresentationAuthUrl,
  isDemoPresentationTenant,
} from '@/lib/demo/presentation';
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
      /** Próximo passo: conversa com quem convidou, com o texto pronto. */
      contato: { titulo: string; botao: string; url: string };
      /** Vai nos formulários e no registro de abertura. */
      passe: string;
    };

/** Como a pessoa chegou: pelo passe (link longo) ou pelo código do link curto. */
export type IdentificacaoDaPagina =
  | { passe: string | null | undefined }
  | { codigo: string | null | undefined };

const COLUNA_DA_VISAO: Record<AcmeProspectPresentationRoleKey, string> = {
  usuario: 'colaborador_accessed_at',
  gestor: 'gestor_accessed_at',
  rh: 'rh_accessed_at',
};

/**
 * Carrega a página a partir do passe (ou do código curto) e do hostname.
 *
 * 🔴 NÃO ESCREVE E NÃO AUTENTICA. É exatamente este GET que o robô de preview do
 * WhatsApp faz, e na versão A foi o GET que criava sessão e carimbava "acesso".
 * `tests/unit/degustacao-versao-b.test.ts` prova que nada é gravado e que o Auth
 * não é chamado.
 */
export async function carregarPaginaDaDegustacao(
  identificacao: IdentificacaoDaPagina,
  hostname: string,
  agora: Date = new Date(),
): Promise<PaginaDaDegustacao> {
  const colunas = [
    'colaborador_id',
    'prospect_name',
    'prospect_company',
    'created_by_email',
    'cargo',
    'colaborador_accessed_at',
    'gestor_accessed_at',
    'rh_accessed_at',
    'disc_completed_at',
  ];
  const acesso = 'codigo' in identificacao
    ? await abrirAcessoPorCodigoCurto(identificacao.codigo, hostname, colunas)
    : await abrirAcessoDaDegustacao(identificacao.passe, hostname, colunas);
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
  let cargoDoConvidado = String(sessao.cargo || '');

  if (sessao.colaborador_id) {
    const { data: colaborador, error: erroColaborador } = await tdb.from('colaboradores')
      .select('id,mapeamento_em,cargo')
      .eq('id', sessao.colaborador_id)
      .maybeSingle();
    if (erroColaborador) {
      console.error('[degustacao] carregar convidado:', erroColaborador.message);
      return { status: 'indisponivel' };
    }
    discFeito = discFeito || Boolean((colaborador as any)?.mapeamento_em);
    // A avaliação procura o Top 5 pelo cargo do COLABORADOR; a página pergunta
    // pela mesma chave, para as duas nunca discordarem.
    cargoDoConvidado = String((colaborador as any)?.cargo || cargoDoConvidado);

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

  // Cargo que só lidera tem o Top 5 vazio, e a avaliação dele responde "Nenhuma
  // competência configurada". A página não oferece esse beco: para quem só
  // lidera, o caminho pessoal termina no perfil.
  const { data: cargo, error: erroCargo } = await tdb.from('cargos_empresa')
    .select('top5_workshop')
    .eq('nome', cargoDoConvidado)
    .maybeSingle();
  if (erroCargo) {
    console.error('[degustacao] carregar cargo do convidado:', erroCargo.message);
    return { status: 'indisponivel' };
  }
  const top5 = (cargo as any)?.top5_workshop;
  const situacaoDisponivel = Array.isArray(top5) && top5.length > 0;

  const nowSeconds = Math.floor(agora.getTime() / 1000);
  // Emitido na hora, com o prazo do passaporte e a sessão para o acompanhamento.
  // O ticket da sala tem contexto de assinatura PRÓPRIO: quem o tem não forja o
  // passe do convidado (e esta página nunca converte um no outro).
  const ticket = issueDemoPresentationTicket(nowSeconds, {
    prospectSessionId: acesso.sessionId,
    expiresAtSeconds: Math.floor(Date.parse(sessao.expires_at) / 1000),
  }, acesso.slug);

  const copia = copiaDaDegustacaoGuiada(acesso.slug);
  const visoes: CartaoDeVisao[] = copia.visoes.map((visao) => {
    // O código do link curto viaja junto para a sala mostrar "Voltar ao início".
    // A rota da sala só o repassa se ele for desta MESMA sessão do ticket.
    const url = new URL(demoPresentationAuthUrl(visao.roleKey, ticket, undefined, acesso.slug));
    url.searchParams.set(DEMO_PRESENTATION_RETURN_PARAM, acesso.codigo);
    return {
      roleKey: visao.roleKey,
      titulo: visao.titulo,
      descricao: visao.descricao,
      url: url.toString(),
      vistoEm: (sessao[COLUNA_DA_VISAO[visao.roleKey]] as string | null) || null,
    };
  });

  const estado: EstadoPessoalDegustacao = {
    discFeito,
    respondeuSituacao,
    devolutivaPronta,
    situacaoDisponivel,
  };

  const nome = String(sessao.prospect_name || '').trim();
  const dadosDoContato = {
    nome,
    empresa: String(sessao.prospect_company || ''),
    minhaCasa: copia.contato.minhaCasa,
    criadoPor: (sessao.created_by_email as string | null) || null,
  };
  return {
    status: 'ok',
    primeiroNome: nome.split(/\s+/)[0] || nome,
    cargo: String(sessao.cargo || ''),
    expiraEm: String(sessao.expires_at),
    contexto: copia.contexto,
    visoes,
    pessoal: { ...estado, passo: passoPessoalDaDegustacao(estado) },
    contato: {
      titulo: copia.contato.titulo,
      botao: `Quero ver ${copia.contato.minhaCasa}`,
      url: linkDeContatoDaDegustacao(dadosDoContato),
    },
    passe: acesso.passe,
  };
}
