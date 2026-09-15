// Modelo de dados do DOCUMENTO da proposta (cliente-facing).
//
// Fonte única consumida pela página pública /proposta/[token] E pelo PDF, para
// que os dois fiquem idênticos. Exclui de propósito TUDO que é interno: comissão
// estimada, margem, score, notas de aprovação. O cliente só vê o que é dele.
//
// O conteúdo institucional (pilares, entregas, o que cada lado recebe, etapas)
// mora aqui como constante e não no banco: é a mesma história em toda proposta,
// e texto que sai para fora de graça precisa de um lugar onde seja revisado uma
// vez — não copiado à mão por quem monta cada proposta.
//
// 🔴 NÃO PROMETER BLOCO DESLIGADO. `lib/blocos-offline.ts` mantém Pulso, Seleção,
// Radar Empresas, RadarBett e CONARH fora do ar desde 31/08/2026. Este arquivo
// descreve o que o cliente vai receber: cite só o que está no ar. (Até 14/09 o
// item de "não incluso" explicava o Pulso para dizer que não era eNPS — falava
// de um bloco desligado para negar outra coisa.)
import { PRODUCT_PACKAGE_LABELS, CUSTOMER_TYPE_LABELS } from './constants';
import type { SalesProposal } from './types';
import { extrairProgramaDoOrcamento, type OrcamentoVinculado, type ProposalPrograma } from './proposal-programa';

export const PROPOSAL_VALIDITY_DAYS = 30;

/** Canais públicos da Vertho (os mesmos da sala de imprensa, vertho.ai). */
export const CONTATO_INSTITUCIONAL = {
  nome: 'Equipe Vertho',
  email: 'contato@vertho.ai',
  whatsapp: '5511911807809',
} as const;

export type ProposalContato = {
  nome: string;
  email: string | null;
  /** E.164 sem "+" — é o que monta o link wa.me. */
  whatsapp: string | null;
  /** De onde veio o contato: útil para o admin saber o que corrigir na origem. */
  origem: 'proposta' | 'representante' | 'institucional';
};

export type ProposalAceite = {
  nome: string;
  cargo: string | null;
  em: string; // ISO
};

export type ProposalEtapa = {
  fase: string;
  descricao: string;
  /** Quanto dura, quando se sabe ("~1 semana"). */
  duracao?: string;
  /** O que o cliente TEM na mão ao fim da etapa. */
  entrega?: string;
};

export type ProposalDocumentVM = {
  numero: string;
  emitidaEm: string;   // ISO
  validaAte: string;   // ISO (emitida + PROPOSAL_VALIDITY_DAYS)
  expirada: boolean;
  /**
   * `nome` é null quando ninguém preencheu o destinatário. O documento OMITE o
   * bloco nesse caso — decisão do dono em 14/09/2026. O fallback antigo escrevia
   * "Cliente" no lugar mais visível da capa, e usar o nome do cenário do
   * orçamento seria pior: aquele campo é interno ("agressivo v3", "teste").
   */
  cliente: { nome: string | null; tipo: string | null };
  contexto: string | null;        // dor/contexto (necessidade da oportunidade)
  produto: string | null;
  escopoItens: string[];
  /** Números do programa vindos do orçamento; null no fluxo do RC. */
  programa: ProposalPrograma | null;
  investimento: {
    /** Valor de cada parcela (projeto) ou a mensalidade (contrato). */
    mensal: number | null;
    /** Parcelas do projeto OU meses de vigência — ver `vendidoPorProjeto`. */
    meses: number | null;
    total: number | null;
    condicoesPagamento: string | null;
    descontoPercent: number | null;
    /** Investimento por participante no programa inteiro. */
    porPessoa: number | null;
    /**
     * true = venda por PROJETO (deal desk): `contract_duration_months` são as
     * parcelas e `monthly_value` é a parcela. Dizer "valor mensal · vigência de
     * 10 meses" num projeto de 8 meses parcelado em 10 confunde as duas coisas.
     * false = contrato do RC, onde os campos são mesmo mensalidade e vigência.
     */
    vendidoPorProjeto: boolean;
  };
  pilares: { titulo: string; texto: string }[];
  entregas: { titulo: string; texto: string }[];
  paraPessoa: string[];
  paraInstituicao: string[];
  naoIncluso: string[];           // limites do escopo (padrão)
  premissas: string[];            // padrão
  cronograma: ProposalEtapa[];    // padrão
  proximosPassos: string[];       // padrão
  notasComerciais: string | null;
  contato: ProposalContato;
  aceite: ProposalAceite | null;
  /** Aceite pela página ainda é possível (aprovada/enviada e dentro da validade). */
  podeAceitar: boolean;
  status: string;
};

// ── Conteúdo institucional (mesma história em toda proposta) ────────────────

const PILARES_PADRAO = [
  {
    titulo: 'Diagnóstico por pessoa',
    texto: 'Mapeamento comportamental (DISC) e avaliação por cenários do dia a dia do cargo. '
      + 'Cada avaliação crítica passa por uma segunda IA que confere a primeira — a decisão nunca sai de um único julgamento.',
  },
  {
    titulo: 'Trilha personalizada',
    texto: 'Conteúdo semanal gerado para o cargo, o nível e o perfil de cada participante, no formato '
      + 'em que ela aprende melhor: vídeo, podcast, texto ou case. Duas pessoas na mesma função podem fazer jornadas diferentes.',
  },
  {
    titulo: 'Evidência de evolução',
    texto: 'Ao fim do ciclo a pessoa é reavaliada e o relatório mostra o delta por competência — '
      + 'de onde saiu, onde chegou, com a evidência que sustenta a nota. Desenvolvimento que se mede, não que se presume.',
  },
];

const ENTREGAS_PADRAO = [
  {
    titulo: 'Ambiente dedicado',
    texto: 'Subdomínio próprio da instituição, com a identidade visual de vocês e acesso por WhatsApp ou e-mail.',
  },
  {
    titulo: 'Matrizes de competência por cargo',
    texto: 'Competências e descritores definidos para cada cargo mapeado — a régua que diz o que se espera de quem ocupa a função.',
  },
  {
    titulo: 'Diagnóstico individual',
    texto: 'Perfil comportamental e nível por competência de cada participante, a partir de cenários reais do cotidiano.',
  },
  {
    titulo: 'Trilha semanal personalizada',
    texto: 'Conteúdo, desafio prático e reflexão a cada semana, no ritmo de cada pessoa.',
  },
  {
    titulo: 'Mentor IA',
    texto: 'Acompanhamento que tira dúvidas, provoca reflexão e sustenta a aplicação no trabalho, durante toda a jornada.',
  },
  {
    titulo: 'Avaliação de fechamento',
    texto: 'Novo cenário e arguição oral com a IA ao fim do ciclo, para medir o que mudou na prática.',
  },
  {
    titulo: 'Relatórios',
    texto: 'Relatório de evolução por participante, consolidado de RH, dossiê do gestor e plenária institucional de fechamento.',
  },
  {
    titulo: 'Suporte dedicado',
    texto: 'Canal direto com a equipe Vertho do setup ao fechamento de cada ciclo.',
  },
];

const PARA_PESSOA_PADRAO = [
  'Um perfil comportamental com narrativa — não um rótulo de quatro letras.',
  'Trilha no formato que ela aprende melhor, contextualizada pelo cargo.',
  'Desafios aplicados ao trabalho real, não exercícios genéricos.',
  'Mentor IA disponível para tirar dúvidas ao longo da semana.',
  'Relatório pessoal de evolução ao fim de cada ciclo.',
];

const PARA_INSTITUICAO_PADRAO = [
  'Mapa de competências por cargo, com o nível real de cada pessoa.',
  'Painel de engajamento: quem avançou, quem parou, em que semana.',
  'Relatório consolidado de RH com a leitura do conjunto.',
  'Dossiê por gestor, para conversas de desenvolvimento com evidência.',
  'Plenária institucional de fechamento com os resultados do ciclo.',
];

// Seções institucionais padrão do documento (iguais ao modelo de proposta do kit).
const NAO_INCLUSO_PADRAO = [
  'Customizações técnicas ou integrações não previstas neste escopo.',
  'Diagnóstico clínico, psicológico ou avaliação de saúde mental.',
  'Pesquisa de clima organizacional ou eNPS.',
  'Avaliação de desempenho formal (nine-box, nota de avaliador, OKRs).',
  'Garantia de ROI financeiro específico (a Vertho mede evolução de competências).',
  'Consultoria presencial, salvo se contratada à parte.',
  'Recrutamento e seleção (ATS).',
];
const PREMISSAS_PADRAO = [
  'O cliente enviará a planilha de setup (cargos + colaboradores) e documentos institucionais até a data combinada.',
  'O ponto focal do cliente estará disponível para validações durante o setup.',
  'Os participantes terão acesso a smartphone ou computador com internet.',
  'O envio de links de acesso será por WhatsApp e/ou e-mail, conforme preferência do cliente.',
];
const CRONOGRAMA_PADRAO: ProposalEtapa[] = [
  {
    fase: 'Setup',
    duracao: '~1 semana',
    descricao: 'Configuração do ambiente dedicado: cargos, colaboradores e identidade visual da instituição.',
    entrega: 'Ambiente no ar em até 2 dias úteis após o material completo.',
  },
  {
    fase: 'Diagnóstico',
    duracao: '1 a 2 semanas',
    descricao: 'Mapeamento comportamental (DISC) e mapeamento de competências por participante, a partir de cenários do cargo.',
    entrega: 'Perfil e nível por competência de cada pessoa.',
  },
  {
    fase: 'Trilha',
    descricao: 'Desenvolvimento personalizado por cargo e perfil, com conteúdo semanal, desafio prático e Mentor IA.',
    entrega: 'Acompanhamento semanal de engajamento para o RH.',
  },
  {
    fase: 'Fechamento',
    descricao: 'Novo cenário situacional e arguição oral com a IA, com reavaliação das competências trabalhadas.',
    entrega: 'Nota final por descritor, conferida por uma segunda IA.',
  },
  {
    fase: 'Resultados',
    descricao: 'Leitura do ciclo com o RH e com os gestores, e definição do foco do ciclo seguinte.',
    entrega: 'Relatório de evolução, consolidado de RH, dossiê do gestor e plenária institucional.',
  },
];
const PROXIMOS_PASSOS_PADRAO = [
  'Aprovação desta proposta.',
  'Envio da planilha de setup preenchida + logo + documentos institucionais.',
  'A Vertho configura o ambiente em até 2 dias úteis após o recebimento completo.',
  'Disparo do diagnóstico na data combinada.',
];

/** Status em que o cliente ainda pode registrar o aceite pela página pública. */
const ACEITAVEIS = ['approved', 'sent_to_client'];

/**
 * O aceite pela página só vale para proposta SEM RC (deal desk).
 *
 * Aceitar uma proposta do RC não é só carimbar `accepted`: `markProposalAccepted`
 * fecha a oportunidade como ganha, ativa a conta na carteira (carimbando início e
 * renovação) e materializa os eventos de comissão. Um carimbo vindo do link
 * público pularia os três — a oportunidade ficaria aberta, a conta fora da
 * carteira e o RC sem comissão de um negócio fechado, sem nada acusando.
 *
 * Então a página oferece o aceite onde ele é completo, e manda falar com o
 * contato onde não é. Reabrir isto exige extrair o núcleo de `markProposalAccepted`
 * para `lib/` e chamá-lo daqui — não basta afrouxar a condição.
 */
export function aceitePublicoPermitido(proposal: Pick<SalesProposal, 'status' | 'representante_id'>): boolean {
  return ACEITAVEIS.includes(proposal.status) && proposal.representante_id == null;
}

function textoOuNull(v: unknown): string | null {
  const s = typeof v === 'string' ? v.trim() : '';
  return s || null;
}

/**
 * Contato que assina o documento.
 *
 * Precedência: campos da PRÓPRIA proposta (mig 255, obrigatórios na conversão do
 * deal desk) → representante dono → canais públicos da Vertho. O último degrau
 * existe para que uma proposta antiga, criada antes da mig 255 e sem RC, ainda
 * diga com quem falar — nunca para substituir o contato de quem está vendendo.
 */
function resolverContato(
  proposal: SalesProposal,
  rep: { name: string | null; email: string | null; phone: string | null } | null,
): ProposalContato {
  const nome = textoOuNull((proposal as any).contact_name);
  const email = textoOuNull((proposal as any).contact_email);
  const whatsapp = textoOuNull((proposal as any).contact_phone);
  if (nome || email || whatsapp) {
    return { nome: nome || CONTATO_INSTITUCIONAL.nome, email, whatsapp, origem: 'proposta' };
  }

  const repNome = textoOuNull(rep?.name);
  const repEmail = textoOuNull(rep?.email);
  const repFone = textoOuNull(rep?.phone);
  if (repNome || repEmail || repFone) {
    return { nome: repNome || 'Representante Vertho', email: repEmail, whatsapp: repFone, origem: 'representante' };
  }

  return { ...CONTATO_INSTITUCIONAL, origem: 'institucional' };
}

/** Constrói o VM cliente-facing a partir da proposta + conta + representante. */
export function buildProposalDocument(
  proposal: SalesProposal,
  account: { legal_name: string | null; trade_name: string | null } | null,
  rep: { name: string | null; email: string | null; phone: string | null } | null,
  extra?: { contexto?: string | null; orcamento?: OrcamentoVinculado },
): ProposalDocumentVM {
  const emitida = proposal.approved_at || proposal.created_at;
  const emitidaDate = new Date(emitida);
  const valida = new Date(emitidaDate);
  valida.setDate(valida.getDate() + PROPOSAL_VALIDITY_DAYS);
  const expirada = valida.getTime() < Date.now();

  const escopoItens = (proposal.included_scope || '')
    .split(/\r?\n/)
    .map((l) => l.trim().replace(/^[-•*]\s*/, ''))
    .filter(Boolean);

  const programa = extrairProgramaDoOrcamento(extra?.orcamento);
  // Participantes: o orçamento manda, mas a proposta do RC também tem o número.
  const pessoas = programa?.pessoas ?? (proposal.number_of_users || null);
  const total = proposal.total_contract_value;
  const porPessoa = total != null && pessoas != null && pessoas > 0
    ? Math.round(Number(total) / pessoas)
    : null;

  const aceiteEm = textoOuNull((proposal as any).accepted_at);
  const aceiteNome = textoOuNull((proposal as any).accepted_by_name);

  return {
    numero: proposal.proposal_number,
    emitidaEm: emitida,
    validaAte: valida.toISOString(),
    expirada,
    cliente: {
      // Conta do CRM tem precedência; sem ela, o nome em texto livre que veio do
      // orçamento do deal desk (mig 254). Sem nenhum dos dois o bloco some.
      nome: textoOuNull(account?.trade_name) || textoOuNull(account?.legal_name) || textoOuNull(proposal.cliente_nome),
      tipo: proposal.customer_type ? (CUSTOMER_TYPE_LABELS[proposal.customer_type] || proposal.customer_type) : null,
    },
    contexto: extra?.contexto?.trim() || null,
    produto: proposal.product_package
      ? (PRODUCT_PACKAGE_LABELS[proposal.product_package] || proposal.product_package)
      : null,
    escopoItens,
    programa,
    investimento: {
      mensal: proposal.monthly_value,
      meses: proposal.contract_duration_months,
      total,
      condicoesPagamento: proposal.payment_terms,
      descontoPercent: proposal.discount_requested,
      porPessoa,
      // A venda por projeto é exatamente o caminho que tem orçamento vinculado.
      vendidoPorProjeto: programa != null,
    },
    pilares: PILARES_PADRAO,
    entregas: ENTREGAS_PADRAO,
    paraPessoa: PARA_PESSOA_PADRAO,
    paraInstituicao: PARA_INSTITUICAO_PADRAO,
    naoIncluso: NAO_INCLUSO_PADRAO,
    premissas: PREMISSAS_PADRAO,
    cronograma: CRONOGRAMA_PADRAO,
    proximosPassos: PROXIMOS_PASSOS_PADRAO,
    notasComerciais: proposal.commercial_notes,
    contato: resolverContato(proposal, rep),
    aceite: aceiteEm && aceiteNome
      ? { nome: aceiteNome, cargo: textoOuNull((proposal as any).accepted_by_role), em: aceiteEm }
      : null,
    podeAceitar: aceitePublicoPermitido(proposal) && !expirada,
    status: proposal.status,
  };
}
