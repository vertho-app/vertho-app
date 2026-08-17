/**
 * Política de cadência dos disparos em LOTE de WhatsApp.
 *
 * Por que existe (medido em 11/08/2026): um broadcast de 155 professores
 * publicado com `Upstash-Delay: idx * 2s` (~30 msg/min) derrubou o número em
 * 1min47s — 50 entregues, 105 não. O intervalo estava escrito como literal em
 * DOIS call-sites (`app/admin/whatsapp/actions.ts` e `actions/whatsapp-lote.ts`),
 * então não havia um lugar onde corrigir a política: só dois números soltos.
 * Este módulo é esse lugar.
 *
 * Três decisões, e o motivo de cada uma:
 *
 * 1. **Intervalo maior** (hoje 6s ≈ 10/min; era 2s ≈ 30/min, e foi 15s enquanto
 *    o canal era o número QR). Ver a nota de 17/08 no fim deste bloco: o valor
 *    acompanha o canal, e o de agora é o único medido em produção.
 *
 * 2. **Jitter** (±30%). Uma mensagem a cada exatamente 2,000ms é assinatura de
 *    robô — o padrão perfeito é, por si só, um sinal. Note que o jitter é
 *    aplicado ao intervalo ACUMULADO, nunca reordenando: o atraso é monótono,
 *    senão duas mensagens colidiriam no mesmo segundo.
 *
 * 3. **Teto por disparo** (default 120). É um limite de VOLUME, independente da
 *    taxa: 500 destinatários a 15s ainda são 500 mensagens não solicitadas.
 *    O excedente é DEVOLVIDO ao chamador, nunca descartado em silêncio — quem
 *    dispara precisa ver "40 adiados" na tela, não descobrir depois que 40
 *    pessoas nunca receberam.
 *
 * Ajuste por env conforme o canal muda — e sempre pelas envs, nunca de volta ao
 * literal.
 *
 * ── 17/08/2026: default 15s → 6s, e a política virou de fato ÚNICA ───────────
 * O 15s foi calibrado para o número **não-oficial (QR) recém-bloqueado**. Essa
 * premissa morreu em 14/08, quando o canal passou para a **Cloud API oficial**,
 * cujo teto técnico é 80 msg/s — o limite que sobra é o tier de destinatários
 * únicos em 24h, que é VOLUME, não taxa.
 *
 * E o 15s nunca governou os lotes reais: os dois envios de Macaé rodaram por
 * literais próprios de 6s, um em `avisar-plano-pronto.ts` e outro em
 * `_boas-vindas-turma.ts`. Medido em 17/08: **38 boas-vindas a 7,0s de média e
 * 34 avisos de plano a 6,5s — 72 mensagens, 0 falhas**. Ou seja, o número
 * validado em produção é 6s; 15s era teoria de um canal que não existe mais.
 *
 * Manter 15s ao unificar teria QUEBRADO o caminho que acabou de funcionar: o
 * disparo pela tela roda numa server action, e 34 × 15s = 510s estoura o teto
 * (o envio real levou 215s e coube).
 */

/** Intervalo-base entre mensagens do lote, em ms. */
export function intervaloLoteMs(): number {
  const bruto = Number(process.env.WHATSAPP_LOTE_INTERVALO_MS);
  return Number.isFinite(bruto) && bruto > 0 ? bruto : 6_000;
}

/** Máximo de destinatários que UM disparo pode agendar. */
export function maxPorDisparo(): number {
  const bruto = Number(process.env.WHATSAPP_LOTE_MAX);
  return Number.isFinite(bruto) && bruto > 0 ? Math.floor(bruto) : 120;
}

/** Fração de jitter (0.3 = ±30%). 0 desliga — útil em teste. */
function jitterFrac(): number {
  const bruto = Number(process.env.WHATSAPP_LOTE_JITTER);
  return Number.isFinite(bruto) && bruto >= 0 && bruto < 1 ? bruto : 0.3;
}

export interface RelogioCadencia {
  /** Atraso da PRÓXIMA mensagem, em segundos. Monótono e já com jitter. */
  proximo(): number;
  /** Quantas mensagens este relógio já agendou. */
  agendadas(): number;
  /**
   * `true` quando o teto por disparo já foi consumido — o chamador NÃO deve
   * enfileirar mais nada. Perguntar ANTES de `proximo()`: um relógio que
   * devolvesse atraso para a mensagem 121 já teria autorizado o envio.
   */
  tetoAtingido(): boolean;
}

/**
 * Relógio incremental da cadência, para quem NÃO conhece o total de antemão.
 *
 * O lote em lista sabe quantas mensagens vai mandar; o cron diário não — ele
 * descobre no loop, por pessoa e por canal (pílula, missão, nudge, evidência).
 * Sem esta forma, o cron teria que reimplementar o acúmulo com jitter, e
 * "duas implementações da mesma política" é exatamente a doença que este
 * módulo existe para curar: em 11/08 o intervalo estava escrito em dois lugares
 * e não havia onde corrigi-lo.
 *
 * `atrasosDoLote` é construído SOBRE este relógio pelo mesmo motivo.
 */
export function criarRelogioCadencia(rng: () => number = Math.random): RelogioCadencia {
  const base = intervaloLoteMs();
  const frac = jitterFrac();
  const teto = maxPorDisparo();
  let acumuladoMs = 0;
  let n = 0;

  return {
    proximo() {
      // 1ª mensagem sai imediatamente; as demais somam base ± jitter.
      if (n > 0) {
        const fator = 1 + (rng() * 2 - 1) * frac; // [1-frac, 1+frac]
        acumuladoMs += Math.max(1, Math.round(base * fator));
      }
      n++;
      return Math.floor(acumuladoMs / 1000);
    },
    agendadas: () => n,
    tetoAtingido: () => n >= teto,
  };
}

/**
 * Atrasos (em SEGUNDOS, que é a unidade do header `Upstash-Delay`) para um lote
 * de `total` mensagens, na ordem do índice.
 *
 * Devolve o array inteiro em vez de uma função por índice de propósito: assim a
 * monotonicidade é uma propriedade do resultado, verificável de fora, e não uma
 * promessa de quem chama em loop.
 *
 * `rng` é injetável só para teste — em produção é `Math.random`.
 */
export function atrasosDoLote(total: number, rng: () => number = Math.random): number[] {
  const relogio = criarRelogioCadencia(rng);
  const atrasos: number[] = [];
  for (let i = 0; i < total; i++) atrasos.push(relogio.proximo());
  return atrasos;
}

export interface PaceadorSincrono {
  /**
   * Segura a execução até a vez desta mensagem. Chamar ANTES do envio.
   * A espera desconta o tempo já gasto pela chamada anterior: o que a política
   * define é a TAXA no número, não quanto o processo dorme.
   */
  aguardarVez(): Promise<void>;
  /** Quantas mensagens este paceador já liberou. */
  liberadas(): number;
  /**
   * Não há mais espaço neste disparo — por VOLUME (teto de mensagens) ou por
   * TEMPO (o orçamento da invocação acabou). Perguntar ANTES de `aguardarVez()`:
   * um paceador que já esperou pela mensagem 121 autorizou o envio dela.
   */
  tetoAtingido(): boolean;
  /** Qual dos dois tetos fechou a porta — para a mensagem que o usuário lê. */
  motivoDoTeto(): 'volume' | 'tempo' | null;
}

/**
 * Orçamento de tempo de UM disparo síncrono, em ms.
 *
 * A 15s por mensagem, o teto de volume (120) levaria 30 minutos — e nenhuma
 * invocação serverless vive isso. Sem este segundo teto, aplicar a política num
 * loop síncrono trocaria "número bloqueado" por "lote cortado no meio, sem
 * ninguém saber onde parou": o pior dos dois, porque não deixa rastro.
 */
function orcamentoSincronoMs(): number {
  const bruto = Number(process.env.WHATSAPP_LOTE_SINCRONO_ORCAMENTO_MS);
  return Number.isFinite(bruto) && bruto > 0 ? bruto : 240_000; // 4 min
}

/**
 * Paceador para quem envia **em loop síncrono** (`await sendWhatsapp(...)` numa
 * iteração), sem passar pela fila do QStash.
 *
 * Por que existe (inventário de 11/08/2026, feito por grep em DOIS saltos): a
 * guarda de cadência só enxergava quem publica no webhook `whatsapp-cis`, e
 * havia quatro emissores que mandam direto — `actions/pulse/envio.ts` (1,2s, o
 * DOBRO da taxa do incidente), `actions/automacao-envios.ts` (1,5s, e enviando
 * documento), `actions/cron-jobs.ts::triggerSegunda/Quinta` (2s, a taxa exata do
 * incidente) e `lib/conarh/regua.ts` (sem intervalo NENHUM, num cron diário).
 * Nenhum deles aparecia num grep de `sendWhatsapp` — dois chegam lá pelos
 * wrappers de `actions/whatsapp.ts`.
 *
 * O `relogio` que já existia não serve para eles: ele devolve o atraso ACUMULADO
 * para o header `Upstash-Delay`, e quem entrega é a fila. Num loop síncrono o
 * mesmo número seria um sleep de 15s, 30s, 45s… — atraso quadrático, e a lambda
 * morre no meio do lote sem ninguém saber quem recebeu.
 *
 * ⚠️ **Limite de projeto, e a razão de o teto continuar valendo aqui:** um loop
 * síncrono roda dentro do tempo de UMA invocação. A 15s por mensagem, 20 já são
 * 5 minutos. Este paceador é para lote PEQUENO e de cauda tolerante (a régua do
 * CONARH, que reprocessa no dia seguinte). Lote grande vai para a fila — que é o
 * que o pulso passou a fazer na mesma rodada.
 *
 * `dormir` e `agora` são injetáveis só para teste; em produção são o relógio real.
 */
export function criarPaceadorSincrono(opts?: {
  rng?: () => number;
  dormir?: (ms: number) => Promise<void>;
  agora?: () => number;
  /** Orçamento de tempo deste disparo (default: `orcamentoSincronoMs()`). */
  orcamentoMs?: number;
}): PaceadorSincrono {
  const rng = opts?.rng ?? Math.random;
  const dormir = opts?.dormir ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const agora = opts?.agora ?? (() => Date.now());
  const base = intervaloLoteMs();
  const frac = jitterFrac();
  const teto = maxPorDisparo();
  const orcamento = opts?.orcamentoMs ?? orcamentoSincronoMs();
  const inicio = agora();
  let ultimoMs: number | null = null;
  let n = 0;

  // Sobra tempo para MAIS UMA mensagem (a espera dela + a chamada de rede)?
  // Medir a próxima, não a passada: o corte tem que acontecer ANTES de dormir.
  const cabeNoTempo = () => (agora() - inicio) + base <= orcamento;

  return {
    async aguardarVez() {
      if (ultimoMs !== null) {
        const fator = 1 + (rng() * 2 - 1) * frac; // [1-frac, 1+frac]
        const alvo = ultimoMs + Math.max(1, Math.round(base * fator));
        const espera = alvo - agora();
        // Nunca negativo: se a chamada anterior demorou MAIS que o intervalo, a
        // taxa já está abaixo do teto e não há nada a esperar.
        if (espera > 0) await dormir(espera);
      }
      n++;
      ultimoMs = agora();
    },
    liberadas: () => n,
    tetoAtingido: () => n >= teto || !cabeNoTempo(),
    motivoDoTeto: () => (n >= teto ? 'volume' : !cabeNoTempo() ? 'tempo' : null),
  };
}

export interface TetoAplicado<T> {
  /** Os que vão neste disparo. */
  enviar: T[];
  /** O excedente — NÃO enviado, devolvido para o chamador reportar. */
  adiados: T[];
  /** Frase pronta para a UI quando houve corte (string vazia se não houve). */
  aviso: string;
}

/**
 * Corta o lote no teto e devolve o excedente separado.
 *
 * Nunca corta calado: `aviso` é preenchido para o call-site concatenar na
 * mensagem de retorno. Um teto silencioso é indistinguível de "enviei para
 * todo mundo", que é exatamente o erro que este módulo existe para evitar.
 */
export function aplicarTetoLote<T>(itens: T[]): TetoAplicado<T> {
  const teto = maxPorDisparo();
  if (itens.length <= teto) return { enviar: itens, adiados: [], aviso: '' };

  const enviar = itens.slice(0, teto);
  const adiados = itens.slice(teto);
  return {
    enviar,
    adiados,
    aviso:
      `${adiados.length} NÃO enviados: o teto de segurança por disparo é ${teto} ` +
      `(protege o número contra bloqueio). Dispare o restante depois, ou ajuste WHATSAPP_LOTE_MAX.`,
  };
}

/** Duração estimada do lote, para a mensagem de retorno da UI. */
export function duracaoEstimada(total: number): string {
  if (total <= 1) return 'imediato';
  const minutos = Math.round(((total - 1) * intervaloLoteMs()) / 60_000);
  if (minutos < 1) return 'menos de 1 min';
  if (minutos < 60) return `~${minutos} min`;
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return m ? `~${h}h${String(m).padStart(2, '0')}` : `~${h}h`;
}
