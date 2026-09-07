import { PIPELINE_STAGES, type PipelineStage } from '@/lib/sales/constants';

/**
 * O que a conversa propõe ao CRM, e o rascunho do follow-up.
 *
 * O ciclo do Copiloto terminava em "resultado salvo": a memória ficava rica e a
 * oportunidade seguia com o estágio e a próxima ação de antes da reunião. Quem
 * vive de funil precisava sair da ferramenta para registrar o que acabou de
 * combinar, e o combinado morria no arquivo.
 *
 * Nada aqui é aplicado sozinho. A proposta vai para a tela com a evidência ao
 * lado, e quem move a oportunidade é o vendedor — o mesmo motivo pelo qual o
 * dossiê separa fato de hipótese: a máquina sugere, a pessoa decide.
 */
export type CrmSuggestion = {
  /** Estágio proposto, ou null quando a conversa não sustenta mudança. */
  stage: PipelineStage | null;
  stageReason: string;
  nextAction: string;
  /** ISO curto (YYYY-MM-DD). Null quando ninguém combinou data. */
  nextActionDate: string | null;
};

export type FollowUpDraft = {
  whatsapp: string;
  email: { subject: string; body: string };
};

export type ConversationClosing = {
  crm: CrmSuggestion;
  followUp: FollowUpDraft;
};

const STAGES = new Set<string>(PIPELINE_STAGES);

/**
 * Estágios que a conversa NÃO pode propor sozinha.
 *
 * Ganho, perdido e expirado mudam pipeline ponderado e relatório de comissão; o
 * aceite da Vertho e o envio de contrato dependem de ato administrativo que não
 * acontece numa reunião. Uma frase animada do cliente não pode carimbar receita.
 */
const ESTAGIOS_QUE_A_CONVERSA_NAO_DECIDE = new Set<string>([
  'fechado_ganho', 'fechado_perdido', 'sem_avanco_expirado',
  'aguardando_aceite_vertho', 'contrato_enviado',
]);

/** Só faz sentido propor estágio que ANDA no funil. Voltar é decisão manual. */
function ordem(stage: string): number {
  return PIPELINE_STAGES.indexOf(stage as PipelineStage);
}

function texto(valor: unknown, max: number): string {
  return typeof valor === 'string' ? valor.trim().slice(0, max) : '';
}

/**
 * Aceita a data só quando ela é futura e plausível.
 *
 * O modelo escreve "sexta" e resolve para uma data; se ele errar o ano ou
 * devolver ontem, o alerta de próxima ação vencida dispara no mesmo instante em
 * que a ação foi criada — e o vendedor perde a confiança no alerta inteiro.
 */
export function normalizarDataDeAcao(valor: unknown, hoje = new Date()): string | null {
  const bruto = texto(valor, 40);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(bruto)) return null;
  const data = new Date(`${bruto}T12:00:00Z`);
  if (Number.isNaN(data.getTime())) return null;
  const inicioDeHoje = new Date(hoje);
  inicioDeHoje.setHours(0, 0, 0, 0);
  const limite = new Date(inicioDeHoje);
  limite.setDate(limite.getDate() + 180);
  if (data < inicioDeHoje || data > limite) return null;
  return bruto;
}

export function normalizarSugestaoCrm(
  bruto: unknown,
  estagioAtual: string | null,
  hoje = new Date(),
): CrmSuggestion {
  const raw: any = bruto && typeof bruto === 'object' ? bruto : {};
  const proposto = texto(raw.estagio, 60);
  const atual = estagioAtual || '';

  const estagioValido = STAGES.has(proposto)
    && !ESTAGIOS_QUE_A_CONVERSA_NAO_DECIDE.has(proposto)
    && proposto !== atual
    && (!STAGES.has(atual) || ordem(proposto) > ordem(atual));

  return {
    stage: estagioValido ? (proposto as PipelineStage) : null,
    stageReason: estagioValido ? texto(raw.estagio_motivo, 300) : '',
    nextAction: texto(raw.proxima_acao, 300),
    nextActionDate: normalizarDataDeAcao(raw.proxima_acao_data, hoje),
  };
}

export function normalizarFollowUp(bruto: unknown): FollowUpDraft {
  const raw: any = bruto && typeof bruto === 'object' ? bruto : {};
  const email: any = raw.email && typeof raw.email === 'object' ? raw.email : {};
  return {
    whatsapp: texto(raw.whatsapp, 900),
    email: {
      subject: texto(email.assunto, 160),
      body: texto(email.corpo, 2400),
    },
  };
}

export function normalizarFechamento(
  bruto: unknown,
  estagioAtual: string | null,
  hoje = new Date(),
): ConversationClosing {
  const raw: any = bruto && typeof bruto === 'object' ? bruto : {};
  return {
    crm: normalizarSugestaoCrm(raw.crm, estagioAtual, hoje),
    followUp: normalizarFollowUp(raw.follow_up),
  };
}

/** Há algo para o vendedor decidir, ou o resultado só virou memória? */
export function temSugestao(fechamento: ConversationClosing): boolean {
  return Boolean(fechamento.crm.stage || fechamento.crm.nextAction || fechamento.followUp.whatsapp);
}
