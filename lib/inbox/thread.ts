/**
 * Montagem da THREAD de conversa — os dois lados.
 *
 * POR QUE OS DOIS LADOS, e não só o que chega
 * ───────────────────────────────────────────
 * Uma tela que mostra apenas `whatsapp_mensagens_recebidas` entrega meia
 * conversa: o atendente lê *"Sim"* sem saber a que a pessoa respondeu. Conversa
 * pela metade não parece incompleta — parece defeito.
 *
 * A dificuldade é que o lado enviado mora em DOIS lugares, por razões diferentes:
 *   - `whatsapp_mensagens_enviadas` (mig 215) tem o TEXTO — mas só do que sai
 *     pela Cloud API a partir de agora;
 *   - `notification_deliveries` (mig 198) tem a TELEMETRIA de tudo que já foi
 *     enviado historicamente, incluindo a cadência antiga — mas sem texto.
 *
 * A thread une os três. O que veio da cadência antiga aparece como *"pílula da
 * semana 5 — entregue 10:32"*: sem o corpo, mas com o suficiente para o "sim a
 * quê" fazer sentido.
 *
 * ⚠️ Envio legado por Z-API não tem `provider_message_id`, então não tem status
 * real. Aparece como enviado, sem confirmação de entrega — e é honesto que
 * apareça assim, porque é tudo que se sabe.
 */

export type AutorItem = 'pessoa' | 'sistema' | 'equipe';

export interface ItemThread {
  id: string;
  autor: AutorItem;
  /** ISO. É por ele que a thread é ordenada. */
  em: string;
  /** Texto, quando existe. `null` em mídia e em envio legado sem corpo. */
  texto: string | null;
  /** text | audio | image | document | template | … */
  tipo: string;
  /** Id da mídia na Meta, quando houver — usado pelo proxy autenticado. */
  midiaId?: string | null;
  /** Rótulo do que foi enviado quando não há texto (ex.: "pilula"). */
  rotulo?: string | null;
  /** Estado do provedor: sent | delivered | read | failed. */
  status?: string | null;
  entregueEm?: string | null;
  lidaEm?: string | null;
  /** Quem enviou, quando foi uma pessoa da equipe. */
  autorEmail?: string | null;
  erro?: string | null;
}

/** Linha crua de `whatsapp_mensagens_recebidas`. */
export interface LinhaRecebida {
  id: string;
  texto: string | null;
  tipo: string;
  recebida_em: string;
  raw?: any;
}

/** Linha crua de `whatsapp_mensagens_enviadas` (mig 215). */
export interface LinhaEnviada {
  id: string;
  texto: string | null;
  tipo: string;
  template_nome: string | null;
  autor_email: string | null;
  origem: string;
  erro: string | null;
  enviada_em: string;
  wa_message_id: string | null;
}

/** Linha crua de `notification_deliveries` (telemetria, sem texto). */
export interface LinhaEntrega {
  id: string;
  kind: string | null;
  sent_at: string;
  provider_status: string | null;
  delivered_at: string | null;
  opened_at: string | null;
  error: string | null;
  provider_message_id: string | null;
}

/**
 * Extrai o id da mídia do payload cru.
 *
 * O webhook guarda `raw` justamente para isto: sem baixar a mídia, "recebeu um
 * áudio" é tudo que a tela pode dizer — e no Brasil o áudio é o formato mais
 * provável de resposta de um colaborador.
 */
export function midiaIdDoRaw(raw: any): string | null {
  if (!raw || typeof raw !== 'object') return null;
  for (const k of ['audio', 'image', 'document', 'video', 'sticker', 'voice']) {
    const id = raw?.[k]?.id;
    if (id) return String(id);
  }
  return null;
}

/**
 * Une os três lados numa linha do tempo única, do mais antigo ao mais recente.
 *
 * A deduplicação importa: um envio da inbox aparece nas DUAS tabelas — texto em
 * `enviadas`, status em `notification_deliveries`. Sem casar por
 * `wa_message_id`, a mesma mensagem apareceria duas vezes na tela, uma com
 * corpo e outra sem, como se fossem envios diferentes.
 */
export function montarThread(args: {
  recebidas: LinhaRecebida[];
  enviadas: LinhaEnviada[];
  entregas: LinhaEntrega[];
}): ItemThread[] {
  const { recebidas, enviadas, entregas } = args;

  // Status por wamid — para enriquecer o que já tem texto.
  const statusPorWamid = new Map<string, LinhaEntrega>();
  for (const e of entregas) {
    if (e.provider_message_id) statusPorWamid.set(e.provider_message_id, e);
  }

  const itens: ItemThread[] = [];

  for (const r of recebidas) {
    itens.push({
      id: `rec:${r.id}`,
      autor: 'pessoa',
      em: r.recebida_em,
      texto: r.texto,
      tipo: r.tipo,
      midiaId: midiaIdDoRaw(r.raw),
    });
  }

  const wamidsComTexto = new Set<string>();
  for (const s of enviadas) {
    if (s.wa_message_id) wamidsComTexto.add(s.wa_message_id);
    const st = s.wa_message_id ? statusPorWamid.get(s.wa_message_id) : undefined;
    itens.push({
      id: `env:${s.id}`,
      // `autor_email` é o que separa resposta humana de disparo automático.
      autor: s.autor_email ? 'equipe' : 'sistema',
      em: s.enviada_em,
      texto: s.texto,
      tipo: s.tipo,
      rotulo: s.template_nome,
      autorEmail: s.autor_email,
      status: st?.provider_status ?? null,
      entregueEm: st?.delivered_at ?? null,
      lidaEm: st?.opened_at ?? null,
      erro: s.erro ?? st?.error ?? null,
    });
  }

  // Entregas SEM texto correspondente: a cadência histórica. Entram como rótulo
  // — é menos que a mensagem, e muito mais que um buraco na conversa.
  for (const e of entregas) {
    if (e.provider_message_id && wamidsComTexto.has(e.provider_message_id)) continue;
    itens.push({
      id: `ent:${e.id}`,
      autor: 'sistema',
      em: e.sent_at,
      texto: null,
      tipo: 'template',
      rotulo: e.kind,
      status: e.provider_status,
      entregueEm: e.delivered_at,
      lidaEm: e.opened_at,
      erro: e.error,
    });
  }

  return itens.sort((a, b) => new Date(a.em).getTime() - new Date(b.em).getTime());
}
