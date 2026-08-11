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
 * 1. **Intervalo maior** (default 15s ≈ 4/min, era 2s ≈ 30/min). Número
 *    não-oficial (QR) sem aquecimento não sustenta dezenas por minuto para
 *    gente que nunca trocou mensagem com o remetente.
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
 * Os defaults valem para número não-oficial recém-bloqueado. Ajuste por env
 * conforme o número aquece — e sempre pelas envs, nunca de volta ao literal.
 */

/** Intervalo-base entre mensagens do lote, em ms. */
export function intervaloLoteMs(): number {
  const bruto = Number(process.env.WHATSAPP_LOTE_INTERVALO_MS);
  return Number.isFinite(bruto) && bruto > 0 ? bruto : 15_000;
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
