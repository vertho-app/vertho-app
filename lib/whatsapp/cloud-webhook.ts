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

/**
 * Mudança de status ou de CATEGORIA de um template.
 *
 * A categoria devolvida na criação é provisória: em 14/08/2026, 4 de 8
 * templates submetidos como UTILITY viraram MARKETING durante a revisão — e
 * MARKETING custa ~6× mais. Sem estes eventos, a única forma de saber era
 * consultar a Graph API na mão, template por template.
 */
export interface EventoTemplate {
  tipoEvento: 'status_update' | 'category_update' | 'quality_update';
  templateId: string | null;
  templateNome: string;
  templateIdioma: string | null;
  /** APPROVED | REJECTED | FLAGGED | PAUSED … — cru, sem tradução. */
  evento: string | null;
  categoriaAnterior: string | null;
  categoriaNova: string | null;
  motivo: string | null;
  wabaId: string | null;
  raw: unknown;
}

/**
 * Aviso sobre a CONTA (WABA), não sobre um template.
 *
 * Chega em `account_update` (advertência/punição por categorização),
 * `account_alerts` e `account_review_update`. Nenhum deles tem nome de template
 * — por isso não cabe em `EventoTemplate`, e por isso o alarme é por
 * `registrarDegradacao`, não por linha em `whatsapp_template_eventos`.
 */
export interface AvisoConta {
  campo: string;
  /** ACCOUNT_RESTRICTION, ACCOUNT_VIOLATION, … — cru, sem tradução. */
  evento: string | null;
  /** UTILITY_TEMPLATE_ABUSE, … quando a Meta diz qual foi a violação. */
  violacao: string | null;
  /** RESTRICTED_UTILITY_TEMPLATES, RATE_LIMITED_… — presente só quando há punição ATIVA. */
  restricoes: string[];
  /** Texto legível quando vem (`alert_description`). */
  descricao: string | null;
  wabaId: string | null;
  raw: unknown;
}

export interface PayloadInterpretado {
  mensagens: MensagemRecebida[];
  statuses: StatusEntrega[];
  /** Status/categoria de template (assinar os campos no app da Meta). */
  templates: EventoTemplate[];
  /** Advertências/punições sobre a CONTA. Ver `AvisoConta`. */
  avisosConta: AvisoConta[];
  /** Eventos que não sabemos ler — contados para não sumirem em silêncio. */
  ignorados: number;
}

/**
 * A mudança encareceu o canal?
 *
 * Só `UTILITY → MARKETING` conta como piora de custo. `PENDING → MARKETING` não
 * é piora: nunca houve preço bom para perder. Tratar os dois igual encheria o
 * alarme de ruído no dia em que vários templates novos são submetidos — que é
 * exatamente quando ele precisa ser lido.
 */
export function encareceu(anterior: string | null, nova: string | null): boolean {
  return anterior === 'UTILITY' && nova === 'MARKETING';
}

/**
 * Campos de webhook que carregam evento de template.
 *
 * Conferidos em `GET /{app-id}/subscriptions` — a lista do que a Meta assina de
 * verdade, não do que se supõe pelo padrão de nomes. `message_template_*` e
 * `template_*` convivem, e a assimetria não é erro de digitação da Meta: é como
 * está publicado.
 */
const CAMPOS_TEMPLATE = new Set([
  'message_template_status_update',
  'template_category_update',
  'template_correct_category_detection',
  // Aceito por segurança: aparece em documentação de terceiros com este nome, e
  // um alias a mais custa nada perto de perder o evento.
  'message_template_category_update',
  // 🔴 ASSINADO DESDE SEMPRE E NUNCA LIDO (medido 16/08/2026): caía em
  // `ignorados`. A Meta pausa o envio de um template cuja qualidade cai o
  // bastante — e o sintoma seria a cadência ficar muda sem ninguém saber por quê.
  'message_template_quality_update',
]);

/**
 * Avisos sobre a CONTA, não sobre um template.
 *
 * `account_alerts` já é assinado e caía em `ignorados`. `account_update` **não
 * está assinado** (medido em `GET /{app-id}/subscriptions`, 16/08/2026) — é
 * tratado aqui mesmo assim, para que assinar depois seja só apertar o botão, e
 * não uma mudança de código no meio de um incidente.
 *
 * É por `account_update` que chega a advertência por classificar marketing como
 * utility. Depois dela, UTILITY→MARKETING passa a ser INSTANTÂNEO (sem as 24h de
 * aviso), e a escada segue para rate limit e para recategorizar TODOS os UTILITY
 * da WABA por 7-30 dias.
 */
const CAMPOS_CONTA = new Set(['account_update', 'account_alerts', 'account_review_update']);

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
  const templates: EventoTemplate[] = [];
  const avisosConta: AvisoConta[] = [];
  let ignorados = 0;

  const entries = Array.isArray(body?.entry) ? body.entry : [];
  for (const entry of entries) {
    const changes = Array.isArray(entry?.changes) ? entry.changes : [];
    for (const change of changes) {
      const value = change?.value;
      if (!value) { ignorados++; continue; }

      // ── Eventos de TEMPLATE ────────────────────────────────────────────────
      // Vêm no MESMO webhook das mensagens, distinguidos pelo `field` — e não
      // por ter `messages`/`statuses`. Sem tratá-los aqui, cairiam no balde de
      // "ignorados" junto com o ruído legítimo, e o alarme de reclassificação
      // nunca dispararia.
      // ⚠️ OS NOMES NÃO SÃO SIMÉTRICOS, e supor que fossem foi um bug real
      // (14/08/2026): o de status é `message_template_status_update`, mas o de
      // categoria é `template_category_update` — SEM o prefixo `message_`. A
      // verificação veio de `GET /{app-id}/subscriptions`, que lista o que a
      // Meta realmente assina; deduzir pela simetria produziu um campo que não
      // existe, e o alarme nunca teria disparado.
      //
      // `template_correct_category_detection` é o aviso PRÉVIO: a Meta detectou
      // que a categoria declarada está errada, antes de reclassificar. Chega
      // antes do prejuízo, então vale tanto quanto o outro.
      const field = change?.field;

      // Conta antes de template: `account_*` não tem nome de template, e cair no
      // ramo de template o descartaria por `!nome`.
      if (CAMPOS_CONTA.has(field)) {
        const restr = Array.isArray(value.restriction_info) ? value.restriction_info : [];
        avisosConta.push({
          campo: String(field),
          evento: value.event ? String(value.event) : null,
          violacao: value.violation_info?.violation_type
            ? String(value.violation_info.violation_type) : null,
          // `restriction_info` só existe com punição ATIVA — é omitido em
          // advertência e em recuperação. Lista vazia é informação, não lacuna.
          restricoes: restr.map((r: any) => String(r?.restriction_type ?? '')).filter(Boolean),
          descricao: value.alert_description ? String(value.alert_description) : null,
          wabaId: entry?.id ? String(entry.id) : null,
          raw: value,
        });
        continue;
      }

      if (CAMPOS_TEMPLATE.has(field)) {
        const nome = value.message_template_name;
        if (!nome) { ignorados++; continue; }
        templates.push({
          tipoEvento: field === 'message_template_status_update'
            ? 'status_update'
            : (field === 'message_template_quality_update' ? 'quality_update' : 'category_update'),
          templateId: value.message_template_id != null ? String(value.message_template_id) : null,
          templateNome: String(nome),
          templateIdioma: value.message_template_language ? String(value.message_template_language) : null,
          // Em `quality_update` não vem `event`: o que muda é o par de scores
          // (GREEN/YELLOW/RED). Guardar o novo score aqui mantém uma coluna só
          // para "o que aconteceu", em vez de espalhar por tipo de evento.
          evento: value.event
            ? String(value.event)
            : (value.new_quality_score ? String(value.new_quality_score) : null),
          // `correct_category` aparece quando a Meta reclassifica na aprovação;
          // `new_category`, quando muda depois. Os dois significam a mesma coisa
          // para quem paga a conta.
          categoriaAnterior: value.previous_category ? String(value.previous_category) : null,
          categoriaNova: value.new_category
            ? String(value.new_category)
            : (value.correct_category ? String(value.correct_category) : null),
          motivo: value.reason && value.reason !== 'NONE' ? String(value.reason) : null,
          wabaId: entry?.id ? String(entry.id) : null,
          raw: value,
        });
        continue;
      }

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

      // `value` sem messages nem statuses (ex.: mudança de qualidade do número)
      // — legítimo, e não é nosso caso de uso.
      if (!value.messages && !value.statuses) ignorados++;
    }
  }

  return { mensagens, statuses, templates, avisosConta, ignorados };
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
