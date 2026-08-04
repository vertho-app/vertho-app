// CONARH 52 — captura de lead: wrapper ÚNICO sobre a server action + fila
// offline em localStorage. Nenhum componente chama a action diretamente.
//
// `capturarLeadComercial` (actions/lead-comercial.ts) JÁ aceita o contrato
// CONARH nativamente (porta, competencia, horizonte, slot, sessao, classe
// calculada no servidor). Os aliases `instituicao`/`whatsapp` continuam sendo
// enviados porque a action é compartilhada com o Radar Bett, que os usa como
// nomes canônicos; o mesmo vale para o retorno em dois formatos. Este wrapper:
//   1) monta o payload único das duas campanhas;
//   2) normaliza os dois formatos de retorno para `ResultadoCaptura`;
//   3) concentra o `as any` AQUI — nenhum outro arquivo faz cast.

import { capturarLeadComercial } from '@/actions/lead-comercial';
import type { CenarioPorta2, NumeroPorta } from './sessao';

export type Horizonte = 'rodando' | 'ate_3m' | '3_a_6m' | 'sem_data';

export const HORIZONTES: Array<{ valor: Horizonte; rotulo: string }> = [
  { valor: 'rodando', rotulo: 'Já estamos rodando algo' },
  { valor: 'ate_3m', rotulo: 'Quero começar em até 3 meses' },
  { valor: '3_a_6m', rotulo: 'Daqui a 3 a 6 meses' },
  { valor: 'sem_data', rotulo: 'Ainda sem data definida' },
];

export interface LeadConarhPayload {
  campanha: 'conarh';
  nome: string;
  organizacao: string;
  cargo: string;
  email?: string;
  telefone: string; // WhatsApp — obrigatório
  porta: NumeroPorta;
  competencia: string; // com as palavras do visitante
  horizonte: Horizonte;
  // Único toggle de qualificação do formulário desde 04/08/2026.
  aceitou_proximo_passo: boolean;
  // Os três abaixo saíram da tela (o tablet ficou com um toggle só), mas
  // continuam no contrato: a action os aceita e a fila offline pode ter itens
  // antigos que os carregam.
  decide_ou_recomenda?: boolean;
  /** Curioso, fornecedor ou fora do ICP — força classe C no servidor. */
  fora_do_perfil?: boolean;
  slot?: string; // ISO, se a reunião já vier marcada por outro canal
  sessao: {
    cenario?: CenarioPorta2;
    rotas_iniciadas: number[];
    rotas_concluidas: number[];
    porta_origem?: NumeroPorta;
  };
}

export type ResultadoCaptura =
  | { ok: true; id?: string; classe?: string }
  | { ok: false; erro: string };

export async function enviarLeadConarh(
  payload: LeadConarhPayload,
): Promise<ResultadoCaptura> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r: any = await (capturarLeadComercial as any)({
      ...payload,
      // Aliases temporários — ver TODO no cabeçalho.
      instituicao: payload.organizacao,
      whatsapp: payload.telefone,
      consentimento_lgpd: true, // checkbox explícito é obrigatório no form
    });
    // Contrato novo: { ok: true, id, classe } | { ok: false, erro }
    if (r && typeof r === 'object') {
      if (r.ok === true) return { ok: true, id: r.id, classe: r.classe };
      if (r.ok === false) return { ok: false, erro: r.erro || 'Falha ao registrar.' };
      // Formato legado: { success, error }
      if (r.success === true) return { ok: true };
      if (r.success === false) return { ok: false, erro: r.error || 'Falha ao registrar.' };
    }
    return { ok: true };
  } catch {
    return { ok: false, erro: 'Sem conexão no momento.' };
  }
}

// ── Fila offline ─────────────────────────────────────────────────────
// Rede caiu na hora do submit → o lead NÃO se perde: entra aqui, o expo-
// nitor vê "salvo no aparelho, enviamos em instantes" e o flush roda
// quando a conexão voltar (evento `online` + intervalo, ver conarh-app).

const CHAVE_FILA = 'conarh:fila-envio-v1';

export function enfileirar(payload: LeadConarhPayload): void {
  try {
    const fila = lerFila();
    fila.push({ payload, tentativas: 0, salvo_em: new Date().toISOString() });
    localStorage.setItem(CHAVE_FILA, JSON.stringify(fila));
  } catch {
    // localStorage indisponível/cheio — nada a fazer sem persistência.
  }
}

interface ItemFila {
  payload: LeadConarhPayload;
  tentativas: number;
  salvo_em: string;
}

function lerFila(): ItemFila[] {
  try {
    const bruto = localStorage.getItem(CHAVE_FILA);
    if (!bruto) return [];
    const lista = JSON.parse(bruto);
    return Array.isArray(lista) ? lista : [];
  } catch {
    return [];
  }
}

export function totalPendentes(): number {
  if (typeof window === 'undefined') return 0;
  return lerFila().length;
}

/** Tenta enviar tudo que está na fila. Retorna quantos ainda restam. */
export async function flushFila(): Promise<number> {
  if (typeof window === 'undefined' || !navigator.onLine) return totalPendentes();
  const fila = lerFila();
  if (fila.length === 0) return 0;
  const restantes: ItemFila[] = [];
  for (const item of fila) {
    const r = await enviarLeadConarh(item.payload);
    if (!r.ok) restantes.push({ ...item, tentativas: item.tentativas + 1 });
  }
  try {
    if (restantes.length > 0) localStorage.setItem(CHAVE_FILA, JSON.stringify(restantes));
    else localStorage.removeItem(CHAVE_FILA);
  } catch {
    // idem enfileirar
  }
  return restantes.length;
}
