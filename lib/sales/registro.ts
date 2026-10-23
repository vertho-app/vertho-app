// Registro automático e proteção por movimentação (contrato do RC v6, cláusulas
// 7.1, 7.3, 7.5 e 7.6; decisões do dono de 23/10/2026).
//
//   · Cliente LIVRE = o CNPJ básico (8 primeiras posições) ou o código INEP da
//     escola não estão com outro representante nem na lista de reserva da
//     vertho.ai. Registro de cliente livre é aceito na hora; o resto vai para a
//     fila de validação do /admin/comercial.
//   · "Com outro representante" = conta dele que é cliente ativo (carteira) ou
//     que tem oportunidade aberta aguardando validação ou com proteção em vigor.
//   · A proteção vale até a última movimentação + 90 dias. Movimentação é
//     contato registrado com evidência, mudança de estágio ou proposta criada,
//     submetida ou enviada; editar dados não conta.
//
// Fica em lib/ (e não num arquivo 'use server', onde todo export vira endpoint).
import type { createSupabaseAdmin } from '@/lib/supabase';
import { dataBRT, somarDias } from '@/lib/dre/semana';
import { PROTECTION_DAYS } from './constants';
import { normalizarCnpj } from './duplicidade';

type Sb = ReturnType<typeof createSupabaseAdmin>;

/** Dias sem movimentação que disparam o aviso ao RC (7.5). */
export const AVISO_SEM_MOVIMENTO_DIAS = 60;

/** Janela em que a vertho.ai ainda revoga um registro aceito na hora (7.1). */
export const JANELA_REVOGACAO_DIAS = 10;

/** Quem decidiu um registro aceito na hora (`attribution_decided_by`). */
export const DECISOR_AUTOMATICO = 'portal (aceite automático)';

/** Canais do contato registrado (mig 298, `sales_activity_notes.canal`). */
export const CANAIS_DE_CONTATO = ['email', 'telefone', 'whatsapp', 'reuniao_online', 'visita', 'outro'] as const;
export type CanalDeContato = (typeof CANAIS_DE_CONTATO)[number];
export const CANAL_LABELS: Record<CanalDeContato, string> = {
  email: 'E-mail',
  telefone: 'Telefone',
  whatsapp: 'WhatsApp',
  reuniao_online: 'Reunião on-line',
  visita: 'Visita',
  outro: 'Outro',
};

/** CNPJ básico (8 primeiras posições) de um CNPJ no formato; null se não houver. */
export function cnpjRaiz(cnpj: string | null | undefined): string | null {
  const completo = normalizarCnpj(cnpj);
  return completo ? completo.slice(0, 8) : null;
}

/** Código INEP só com dígitos (8 no Censo Escolar); null se vier outra coisa. Entra em filtro do PostgREST. */
export function codigoInepValido(inep: string | null | undefined): string | null {
  const s = String(inep ?? '').trim();
  return /^\d{7,9}$/.test(s) ? s : null;
}

const DIA_MS = 24 * 60 * 60 * 1000;
/** Dia de calendário em Brasília: uma movimentação às 22h não vira o dia seguinte. */
const ymd = dataBRT;

/** "2026-10-23" ou um instante ISO → "23/10/2026", no dia de Brasília. */
export function dataCurtaBRT(valor: string): string {
  const dia = valor.length > 10 ? dataBRT(new Date(valor)) : valor;
  return dia.split('-').reverse().join('/');
}

/** Janela de proteção a partir de uma movimentação: até ela + 90 dias (dias de Brasília). */
export function protecaoAPartirDe(movimento: Date): { start: string; end: string } {
  const inicio = ymd(movimento);
  return { start: inicio, end: somarDias(inicio, PROTECTION_DAYS) };
}

/** Dias inteiros desde a última movimentação; null se não houver registro. */
export function diasSemMovimento(ultima: string | null | undefined, hoje: Date = new Date()): number | null {
  if (!ultima) return null;
  const t = new Date(ultima).getTime();
  return Number.isFinite(t) ? Math.floor((hoje.getTime() - t) / DIA_MS) : null;
}

type OppDoAlerta = {
  status: string;
  attribution_status: string;
  last_movement_at?: string | null;
  protection_start_date?: string | null;
  protection_end_date?: string | null;
};

/**
 * A oportunidade pede atenção do RC por falta de movimentação? Aberta, validada
 * e com 60 dias ou mais sem movimentação, inclusive a que já perdeu a proteção
 * (o cliente ficou livre e o RC precisa saber).
 */
export function precisaDeMovimentacao(o: OppDoAlerta, hoje: Date = new Date()): boolean {
  if (o.status !== 'open' || o.attribution_status !== 'validada') return false;
  if (o.protection_end_date && o.protection_end_date < ymd(hoje)) return true;
  const dias = diasSemMovimento(o.last_movement_at || o.protection_start_date, hoje);
  return dias != null && dias >= AVISO_SEM_MOVIMENTO_DIAS;
}

// Os campos ausentes vêm declarados como `undefined` de propósito: com `strict:
// false`, união discriminada por booleano não estreita (ver accounts.ts).
export type ConferenciaRegistro =
  | { livre: true; jaProspectado: { em: string; estagio: string } | null; motivo?: undefined; mensagem?: undefined }
  | { livre: false; motivo: 'reserva' | 'outro_rc'; mensagem: string; jaProspectado?: undefined };

// Neutra de propósito: dizer "lista de reserva" ao RC entregaria, CNPJ por CNPJ,
// quem a vertho.ai negocia direto. O admin lê "7.3" e sabe que é a reserva.
export const MENSAGEM_RESERVA = 'Este cliente precisa da conferência da vertho.ai (cláusula 7.3). O registro vai para a validação.';
export const MENSAGEM_OUTRO_RC = 'Este cliente já está com outro representante. Ele fica livre se passar 90 dias sem movimentação (cláusula 7.6).';

type OppOcupacao = { status: string; attribution_status: string; protection_end_date: string | null; stage: string; updated_at: string; last_movement_at: string | null };

/** A oportunidade de outro RC segura o cliente? (aguardando validação ou proteção em vigor) */
export function oportunidadeSegura(o: OppOcupacao, hoje: Date = new Date()): boolean {
  if (o.status !== 'open') return false;
  if (o.attribution_status === 'aguardando') return true;
  if (o.attribution_status !== 'validada' || !o.protection_end_date) return false;
  return o.protection_end_date >= ymd(hoje);
}

/**
 * Confere se o cliente está livre para o representante. Lê a lista de reserva e
 * as contas de OUTROS representantes com o mesmo CNPJ básico ou INEP. Erro de
 * leitura lança: um registro não pode ser aceito sem a conferência ter rodado.
 */
export async function conferirRegistro(
  sb: Sb,
  { representanteId, cnpj, codigoInep }: { representanteId: string; cnpj?: string | null; codigoInep?: string | null },
  hoje: Date = new Date(),
): Promise<ConferenciaRegistro> {
  const raiz = cnpjRaiz(cnpj);
  const inep = codigoInepValido(codigoInep);
  if (!raiz && !inep) return { livre: true, jaProspectado: null };

  const filtro = [raiz ? `cnpj_raiz.eq.${raiz}` : null, inep ? `codigo_inep.eq.${inep}` : null].filter(Boolean).join(',');

  const { data: reservas, error: erroReserva } = await sb.from('sales_reservas').select('id').or(filtro).limit(1);
  if (erroReserva) throw new Error(`Não foi possível conferir a lista de reserva: ${erroReserva.message}`);
  if ((reservas || []).length) return { livre: false, motivo: 'reserva', mensagem: MENSAGEM_RESERVA };

  const { data: contas, error: erroContas } = await sb.from('sales_accounts')
    .select('id, status').or(filtro).neq('representante_id', representanteId);
  if (erroContas) throw new Error(`Não foi possível conferir se outro representante tem este cliente: ${erroContas.message}`);
  const outras = (contas || []) as { id: string; status: string }[];
  if (!outras.length) return { livre: true, jaProspectado: null };

  if (outras.some((c) => c.status === 'active_client')) return { livre: false, motivo: 'outro_rc', mensagem: MENSAGEM_OUTRO_RC };

  const { data: opps, error: erroOpps } = await sb.from('sales_opportunities')
    .select('status, attribution_status, protection_end_date, stage, updated_at, last_movement_at')
    .in('account_id', outras.map((c) => c.id));
  if (erroOpps) throw new Error(`Não foi possível conferir as oportunidades deste cliente: ${erroOpps.message}`);
  const lista = (opps || []) as OppOcupacao[];
  if (lista.some((o) => oportunidadeSegura(o, hoje))) return { livre: false, motivo: 'outro_rc', mensagem: MENSAGEM_OUTRO_RC };

  // Livre, mas já foi trabalhado: o RC vê a data e o estágio, nunca as notas nem o nome (7.6).
  const ultima = lista.map((o) => ({ em: o.last_movement_at || o.updated_at, estagio: o.stage }))
    .sort((a, b) => b.em.localeCompare(a.em))[0];
  return { livre: true, jaProspectado: ultima ? { em: ultima.em, estagio: ultima.estagio } : null };
}

export type DecisaoDoRegistro = {
  aceito: boolean;
  /** Campos de atribuição e proteção para o insert da oportunidade. */
  campos: {
    attribution_status: 'validada' | 'aguardando';
    attribution_decided_at: string | null;
    attribution_decided_by: string | null;
    /** Na fila, o motivo (o RC e o admin leem; sem nome de outro representante). */
    attribution_note: string | null;
    protection_start_date: string | null;
    protection_end_date: string | null;
    protection_status: 'active';
    last_movement_at: string | null;
  };
  /** O que o RC lê ao registrar. */
  mensagem: string;
  jaProspectado: { em: string; estagio: string } | null;
};

const MENSAGEM_SEM_CONFERENCIA = 'A conferência automática não rodou agora. O registro vai para a validação da vertho.ai.';
const MENSAGEM_SEM_IDENTIFICADOR = 'Sem CNPJ nem INEP, o portal não tem como conferir o cliente. O registro vai para a validação da vertho.ai.';

/**
 * Decide o registro na hora (7.1): cliente livre é aceito e a proteção começa
 * agora; reserva, outro representante ou conferência que falhou vão para a fila.
 */
export async function decidirRegistro(
  sb: Sb,
  quem: { representanteId: string; cnpj?: string | null; codigoInep?: string | null },
  agora: Date = new Date(),
): Promise<DecisaoDoRegistro> {
  // Sem identificador a conferência daria "livre" por não ter o que comparar:
  // nesse caso quem decide é a vertho.ai, nunca o aceite automático.
  const temIdentificador = !!cnpjRaiz(quem.cnpj) || !!codigoInepValido(quem.codigoInep);
  let conferencia: ConferenciaRegistro | null = null;
  if (temIdentificador) {
    try {
      conferencia = await conferirRegistro(sb, quem, agora);
    } catch (e: any) {
      console.error('[sales] conferência do registro falhou:', e?.message);
    }
  }
  if (conferencia?.livre) {
    const janela = protecaoAPartirDe(agora);
    return {
      aceito: true,
      campos: {
        attribution_status: 'validada',
        attribution_decided_at: agora.toISOString(),
        attribution_decided_by: DECISOR_AUTOMATICO,
        attribution_note: null,
        protection_start_date: janela.start,
        protection_end_date: janela.end,
        protection_status: 'active',
        last_movement_at: agora.toISOString(),
      },
      mensagem: `Registro aceito: o cliente estava livre. Proteção comercial até ${dataCurtaBRT(janela.end)}, renovada a cada movimentação.`,
      jaProspectado: conferencia.jaProspectado,
    };
  }
  const motivo = !temIdentificador ? MENSAGEM_SEM_IDENTIFICADOR
    : conferencia && !conferencia.livre ? conferencia.mensagem
    : MENSAGEM_SEM_CONFERENCIA;
  return {
    aceito: false,
    campos: {
      attribution_status: 'aguardando',
      attribution_decided_at: null,
      attribution_decided_by: null,
      attribution_note: motivo,
      protection_start_date: null,
      protection_end_date: null,
      protection_status: 'active',
      last_movement_at: null,
    },
    mensagem: motivo,
    jaProspectado: null,
  };
}

/**
 * Confere de novo um registro aceito na hora, depois do insert. Dois RCs que
 * registram o mesmo cliente no mesmo instante passam os dois pela primeira
 * conferência; aqui cada um enxerga o do outro, e os dois vão para a fila (a
 * vertho.ai decide pelo primeiro registro válido, 7.4). Devolve a mensagem para
 * o RC quando o registro voltou para a fila; null quando segue aceito. Falha de
 * leitura mantém o aceite: a primeira conferência rodou.
 */
export async function reconferirRegistroAceito(
  sb: Sb,
  opportunityId: string,
  quem: { representanteId: string; cnpj?: string | null; codigoInep?: string | null },
  agora: Date = new Date(),
): Promise<string | null> {
  let conferencia: ConferenciaRegistro;
  try {
    conferencia = await conferirRegistro(sb, quem, agora);
  } catch (e: any) {
    console.error('[sales] reconferência do registro falhou:', e?.message);
    return null;
  }
  if (conferencia.livre) return null;
  const mensagem = `${conferencia.mensagem} Outro registro do mesmo cliente chegou junto com o seu; a vertho.ai decide.`;
  const { error } = await sb.from('sales_opportunities').update({
    attribution_status: 'aguardando',
    attribution_decided_at: null,
    attribution_decided_by: null,
    attribution_note: mensagem,
    protection_start_date: null,
    protection_end_date: null,
    last_movement_at: null,
    updated_at: agora.toISOString(),
  }).eq('id', opportunityId).eq('attribution_status', 'validada').eq('attribution_decided_by', DECISOR_AUTOMATICO);
  if (error) {
    console.error('[sales] registro em conflito não voltou para a fila:', error.message);
    return null;
  }
  return mensagem;
}

/**
 * O registro aceito na hora ainda pode ser revogado pela vertho.ai? Até 10 dias
 * depois do aceite (7.1), e só o automático: a validação do admin é decisão e
 * não se desfaz por aqui.
 */
export function revogavel(
  o: { attribution_status: string; attribution_decided_by?: string | null; attribution_decided_at?: string | null; status?: string },
  agora: Date = new Date(),
): boolean {
  if (o.attribution_status !== 'validada' || o.attribution_decided_by !== DECISOR_AUTOMATICO || !o.attribution_decided_at) return false;
  if (o.status && o.status !== 'open') return false;
  return agora.getTime() - new Date(o.attribution_decided_at).getTime() <= JANELA_REVOGACAO_DIAS * DIA_MS;
}

export type ResultadoMovimentacao =
  | { renovada: true; protecaoAte: string; motivo?: undefined }
  | { renovada: false; motivo: 'nao_se_aplica' | 'cliente_com_outro' | 'falha'; protecaoAte?: undefined };

/**
 * Registra uma movimentação da oportunidade: a proteção passa a valer até hoje
 * + 90 dias (sem encurtar uma janela maior que a vertho.ai tenha dado) e o
 * aviso de 60 dias volta a valer para o próximo ciclo. Só para oportunidade
 * aberta e validada: registro aguardando ainda não tem proteção.
 *
 * Proteção que JÁ VENCEU: o cliente ficou livre (7.6). A movimentação só a
 * renova se ninguém o pegou nesse meio-tempo; o contrário seria tirar o
 * cliente de quem o registrou depois.
 *
 * Falha vai para o log: a ação principal (o contato, a proposta) já foi gravada.
 */
export async function registrarMovimentacao(sb: Sb, opportunityId: string | null | undefined, agora: Date = new Date()): Promise<ResultadoMovimentacao> {
  if (!opportunityId) return { renovada: false, motivo: 'nao_se_aplica' };
  const { data: opp, error: erroLeitura } = await sb.from('sales_opportunities')
    .select('id, representante_id, status, attribution_status, protection_end_date, account:sales_accounts (cnpj, codigo_inep)')
    .eq('id', opportunityId).maybeSingle();
  if (erroLeitura) {
    console.error('[sales] movimentação não registrada (leitura):', erroLeitura.message);
    return { renovada: false, motivo: 'falha' };
  }
  if (!opp || opp.status !== 'open' || opp.attribution_status !== 'validada') return { renovada: false, motivo: 'nao_se_aplica' };

  const janela = protecaoAPartirDe(agora);
  const fimAtual: string | null = opp.protection_end_date;
  if (fimAtual && fimAtual < ymd(agora)) {
    const conta: any = Array.isArray(opp.account) ? opp.account[0] : opp.account;
    let livre = false;
    try {
      const c = await conferirRegistro(sb, { representanteId: opp.representante_id, cnpj: conta?.cnpj, codigoInep: conta?.codigo_inep }, agora);
      livre = c.livre;
    } catch (e: any) {
      console.error('[sales] movimentação sobre proteção vencida sem conferência:', e?.message);
      return { renovada: false, motivo: 'falha' };
    }
    if (!livre) {
      const { error } = await sb.from('sales_opportunities')
        .update({ last_movement_at: agora.toISOString(), updated_at: agora.toISOString() }).eq('id', opportunityId);
      if (error) console.error('[sales] movimentação não registrada:', error.message);
      return { renovada: false, motivo: 'cliente_com_outro' };
    }
  }

  const fim = fimAtual && fimAtual > janela.end ? fimAtual : janela.end;
  const { error } = await sb.from('sales_opportunities').update({
    last_movement_at: agora.toISOString(),
    protection_end_date: fim,
    protection_status: 'active',
    aviso_60_em: null,
    updated_at: agora.toISOString(),
  }).eq('id', opportunityId).eq('status', 'open').eq('attribution_status', 'validada');
  if (error) {
    console.error('[sales] movimentação não registrada:', error.message);
    return { renovada: false, motivo: 'falha' };
  }
  return { renovada: true, protecaoAte: fim };
}
