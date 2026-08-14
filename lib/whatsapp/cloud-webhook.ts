/**
 * Núcleo do webhook da WhatsApp Cloud API — recebimento e status de entrega.
 *
 * Fica em `lib/` e não dentro do route handler pelo motivo de sempre nesta base:
 * o que só existe dentro de uma rota é testado por HTTP ou não é testado. Aqui a
 * rota faz autenticação e I/O; a interpretação do payload é função pura.
 *
 * O QUE A META MANDA
 * ──────────────────
 * Um POST por evento (às vezes vários no mesmo corpo), sempre no formato
 * `entry[].changes[].value`, com DUAS naturezas bem diferentes dentro do mesmo
 * endpoint:
 *   - `value.messages[]`  → alguém ESCREVEU para o número
 *   - `value.statuses[]`  → o que aconteceu com algo que NÓS enviamos
 *
 * ⚠️ IDEMPOTÊNCIA NÃO É OPCIONAL. A Meta reentrega o mesmo evento até receber
 * 200 — e reentrega também quando o 200 demora demais. Sem chave única por
 * `wamid`, um retry vira mensagem duplicada na tela de quem atende e status
 * gravado duas vezes. A unicidade está no banco (mig 212), não só aqui.
 *
 * ⚠️ RESPONDA 200 MESMO EM EVENTO QUE NÃO ENTENDEMOS. Um 500 faz a Meta
 * reentregar em laço e, se persistir, DESATIVAR a inscrição do webhook — o canal
 * inteiro fica mudo por causa de um campo novo num evento que nem nos interessa.
 * Evento desconhecido é ignorado e contado, nunca derruba a resposta.
 */

export type EventoNatureza = 'mensagem' | 'status' | 'desconhecido';

export interface MensagemRecebida {
  waMessageId: string;
  fromPhone: string;
  toPhoneId: string | null;
  tipo: string;
  texto: string | null;
  recebidaEm: string;
  raw: unknown;
}

export interface StatusEntrega {
  waMessageId: string;
  /** sent | delivered | read | failed — cru, sem tradução. */
  status: string;
  timestamp: string;
  /** Preenchido só quando `status === 'failed'`. */
  erro: string | null;
  raw: unknown;
}

export interface PayloadInterpretado {
  mensagens: MensagemRecebida[];
  statuses: StatusEntrega[];
  /** Eventos que não sabemos ler — contados para não sumirem em silêncio. */
  ignorados: number;
}

/** Epoch em segundos (string) → ISO. A Meta manda segundos, não milissegundos. */
function epochParaIso(valor: unknown, agora: () => number = Date.now): string {
  const n = Number(valor);
  // Sem timestamp utilizável, usar "agora" é melhor que gravar 1970 — mas a
  // diferença é pequena porque o webhook chega em segundos.
  if (!Number.isFinite(n) || n <= 0) return new Date(agora()).toISOString();
  return new Date(n * 1000).toISOString();
}

/**
 * Texto da mensagem, quando existe.
 *
 * Só `text` e as respostas de botão/lista trazem algo legível. Áudio, imagem e
 * documento devolvem `null` de propósito: o conteúdo deles é uma MÍDIA que
 * precisa ser baixada com o token, e fingir que "sem texto" é "mensagem vazia"
 * esconderia que alguém mandou um áudio.
 */
function extrairTexto(m: any): string | null {
  if (m?.text?.body) return String(m.text.body);
  if (m?.button?.text) return String(m.button.text);
  if (m?.interactive?.button_reply?.title) return String(m.interactive.button_reply.title);
  if (m?.interactive?.list_reply?.title) return String(m.interactive.list_reply.title);
  return null;
}

/**
 * Interpreta o corpo do webhook. NUNCA lança: payload malformado vira
 * `ignorados`, porque a alternativa é a Meta desativar a inscrição.
 */
export function interpretarPayload(body: any, agora: () => number = Date.now): PayloadInterpretado {
  const mensagens: MensagemRecebida[] = [];
  const statuses: StatusEntrega[] = [];
  let ignorados = 0;

  const entries = Array.isArray(body?.entry) ? body.entry : [];
  for (const entry of entries) {
    const changes = Array.isArray(entry?.changes) ? entry.changes : [];
    for (const change of changes) {
      const value = change?.value;
      if (!value) { ignorados++; continue; }

      const phoneNumberId = value?.metadata?.phone_number_id ?? null;

      for (const m of Array.isArray(value.messages) ? value.messages : []) {
        if (!m?.id || !m?.from) { ignorados++; continue; }
        mensagens.push({
          waMessageId: String(m.id),
          fromPhone: String(m.from),
          toPhoneId: phoneNumberId ? String(phoneNumberId) : null,
          tipo: String(m.type || 'text'),
          texto: extrairTexto(m),
          recebidaEm: epochParaIso(m.timestamp, agora),
          raw: m,
        });
      }

      for (const s of Array.isArray(value.statuses) ? value.statuses : []) {
        if (!s?.id || !s?.status) { ignorados++; continue; }
        const primeiroErro = Array.isArray(s.errors) && s.errors.length ? s.errors[0] : null;
        statuses.push({
          waMessageId: String(s.id),
          status: String(s.status),
          timestamp: epochParaIso(s.timestamp, agora),
          erro: primeiroErro
            ? `${primeiroErro.title || primeiroErro.message || 'erro'}${primeiroErro.code ? ` (${primeiroErro.code})` : ''}`
            : null,
          raw: s,
        });
      }

      // `value` sem messages nem statuses (ex.: mudança de qualidade do número,
      // atualização de template) — legítimo, e não é nosso caso de uso.
      if (!value.messages && !value.statuses) ignorados++;
    }
  }

  return { mensagens, statuses, ignorados };
}

/**
 * Colunas de `notification_deliveries` a atualizar para um status.
 *
 * A regra que importa: `delivered`/`read` NÃO mexem em `status`, que continua
 * significando "o provedor aceitou". São eixos diferentes — aceite e entrega —, e
 * fundi-los reproduziria a confusão que fez "155 enviados" virar 50 entregues.
 * Só `failed` marca `failed_at`, e ainda assim sem apagar o aceite: uma linha com
 * `status = sucesso` e `failed_at` preenchido é a descrição correta de "foi
 * aceito e depois não chegou".
 */
export function camposDoStatus(s: StatusEntrega): Record<string, unknown> {
  const campos: Record<string, unknown> = { provider_status: s.status };
  if (s.status === 'delivered') campos.delivered_at = s.timestamp;
  if (s.status === 'read') {
    campos.opened_at = s.timestamp;
    // `read` implica entregue. A Meta normalmente manda `delivered` antes, mas a
    // ordem dos webhooks não é garantida: sem isto, uma leitura que chega antes
    // deixaria a mensagem eternamente "não entregue".
    campos.delivered_at = s.timestamp;
  }
  if (s.status === 'failed') {
    campos.failed_at = s.timestamp;
    if (s.erro) campos.error = s.erro;
  }
  return campos;
}
