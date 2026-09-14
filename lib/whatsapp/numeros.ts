/**
 * Catálogo de NÚMEROS remetentes da WABA — um lugar só para "qual número é qual".
 *
 * POR QUE EXISTE (mig 252, 14/09/2026)
 * ────────────────────────────────────
 * A WABA `Vertho.ai` tem 1 número (+55 11 5236-0168, ID 1256487020887128) e o
 * limite da conta verificada é 250 — ligar um 2º é operação normal. Mas o código
 * só conhecia "o número", no singular: `PHONE_NUMBER_ID` global em `cloud-api.ts`
 * e `registro-saida.ts`. Responder saía sempre pelo número 1, mesmo quando a
 * pessoa escreveu para o 2 — e responder por outro número quebra o fio
 * (docs/INBOX-WHATSAPP.md §3.2).
 *
 * COMO FUNCIONA
 * ─────────────
 * - O número INICIAL continua vindo de `PHONE_NUMBER_ID` (nada muda para quem
 *   já está no ar: NULL no histórico = este número).
 * - Números extras vêm de `WHATSAPP_NUMEROS_EXTRA`, JSON opcional:
 *   `[{"id":"<phone_number_id>","rotulo":"+55 11 9XXXX-XXXX","nome":"Atendimento"}]`.
 *   Sem a variável, o catálogo tem só o inicial — zero configuração para 1 número.
 * - `resolverNumeroParaEnvio(id?)` é a ÚNICA decisão de "por qual número sai":
 *   id conhecido → ele; id ausente/nulo → inicial; id desconhecido → inicial
 *   (fail-safe: melhor sair pelo número certo-do-que-sempre do que não sair —
 *   e o `resolvidoComoInicial` conta a divergência em vez de escondê-la).
 *
 * Pura e sem I/O de propósito: quem decide "por onde" não precisa de banco —
 * o número de origem já vem gravado nas mensagens (to_phone_id/from_phone_id).
 */

export interface NumeroRemetente {
  /** `phone_number_id` da Meta — é o que vai na URL (`/{id}/messages`). */
  id: string;
  /** Rótulo humano para a tela ("+55 11 5236-0168"). */
  rotulo: string;
  /** Nome curto opcional ("Atendimento", "Cobrança"). */
  nome?: string | null;
  /** `true` no número que já estava no ar antes da mig 252. */
  inicial: boolean;
}

/** O número que já estava no ar — fallback de tudo. */
export function numeroInicial(): NumeroRemetente {
  return { id: process.env.PHONE_NUMBER_ID || '', rotulo: '', nome: null, inicial: true };
}

function lerExtras(): NumeroRemetente[] {
  const cru = process.env.WHATSAPP_NUMEROS_EXTRA || '';
  if (!cru.trim()) return [];
  try {
    const lista = JSON.parse(cru);
    if (!Array.isArray(lista)) return [];
    return lista
      .filter((n: any) => n && typeof n.id === 'string' && n.id.trim())
      .map((n: any) => ({
        id: String(n.id).trim(),
        rotulo: typeof n.rotulo === 'string' ? n.rotulo : '',
        nome: typeof n.nome === 'string' ? n.nome : null,
        inicial: false,
      }));
  } catch {
    // Variável malformada não pode derrubar envio: o catálogo cai para o inicial.
    console.error('[whatsapp-numeros] WHATSAPP_NUMEROS_EXTRA inválido — usando só o inicial');
    return [];
  }
}

/** Todos os números conhecidos, inicial primeiro. */
export function listarNumeros(): NumeroRemetente[] {
  return [numeroInicial(), ...lerExtras()];
}

/** Os ids conhecidos — para validar `ultimo_numero_id` da view sem adivinhar. */
export function idsConhecidos(): Set<string> {
  return new Set(listarNumeros().map((n) => n.id).filter(Boolean));
}

export interface NumeroResolvido {
  /** Id que vai na URL da Graph API. */
  id: string;
  /** `true` quando o pedido caiu no inicial por ausência/divergência. */
  caiuNoInicial: boolean;
}

/**
 * Por qual número este envio sai.
 *
 * `pedido` é o número de ORIGEM da conversa (`ultimo_numero_id` da view, ou o
 * `to_phone_id` da última recebida): responder pelo mesmo número mantém o fio.
 * Ausente (histórico sem número, cadência sem contexto) ou desconhecido
 * (número removido da WABA) → inicial, com `caiuNoInicial: true` para o
 * chamador contar — nunca exceção, porque exceção aqui é mensagem que não sai.
 */
export function resolverNumeroParaEnvio(pedido?: string | null): NumeroResolvido {
  const inicial = numeroInicial().id;
  const p = (pedido || '').trim();
  if (!p) return { id: inicial, caiuNoInicial: true };
  if (p === inicial) return { id: p, caiuNoInicial: false };
  if (lerExtras().some((n) => n.id === p)) return { id: p, caiuNoInicial: false };
  return { id: inicial, caiuNoInicial: true };
}

/** Rótulo para a tela: "+55 11 … (Atendimento)" ou o id cru quando desconhecido. */
export function rotuloDoNumero(id: string | null | undefined, catalogo?: NumeroRemetente[]): string {
  if (!id) return 'número inicial';
  const cat = catalogo ?? listarNumeros();
  const n = cat.find((x) => x.id === id);
  if (!n) return `número ${id.slice(0, 6)}…`;
  const base = n.rotulo || 'número inicial';
  return n.nome ? `${base} (${n.nome})` : base;
}
