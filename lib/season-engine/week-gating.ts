/**
 * Gating temporal das semanas da temporada.
 * Cada semana N libera em data_inicio + (N-1)*7 dias às 03:00 America/Sao_Paulo.
 * SP é UTC-3 sem DST → 03:00 BRT == 06:00 UTC.
 */

import { PROGRESSO } from '@/lib/status';

const SP_OFFSET_HOURS = 3; // BRT = UTC-3
const UNLOCK_HOUR_BRT = 3; // 03:00 BRT
const UNLOCK_HOUR_UTC = UNLOCK_HOUR_BRT + SP_OFFSET_HOURS; // 06:00 UTC

/**
 * Retorna a próxima segunda-feira (em SP) estritamente após `now`, formato 'YYYY-MM-DD'.
 * Se hoje é segunda, retorna a segunda da semana seguinte.
 */
export function nextMondayISO(now: Date = new Date()): string {
  // Converte "agora" pra data SP (subtrai 3h)
  const sp = new Date(now.getTime() - SP_OFFSET_HOURS * 3600 * 1000);
  const dow = sp.getUTCDay(); // 0=dom,1=seg,...
  const daysUntilNextMonday = ((1 - dow + 7) % 7) || 7; // sempre >=1
  const monday = new Date(Date.UTC(sp.getUTCFullYear(), sp.getUTCMonth(), sp.getUTCDate() + daysUntilNextMonday));
  return monday.toISOString().slice(0, 10);
}

/**
 * Momento de liberação da semana N (Date UTC).
 * @param {string} dataInicio 'YYYY-MM-DD' (a segunda da semana 1, em SP)
 * @param {number} n semana (1..14)
 */
export function semanaLiberadaEm(dataInicio: string | null | undefined, n: number | string): Date | null {
  if (!dataInicio) return null;
  const [y, m, d] = String(dataInicio).slice(0, 10).split('-').map(Number);
  const base = Date.UTC(y, m - 1, d, UNLOCK_HOUR_UTC, 0, 0);
  return new Date(base + (Number(n) - 1) * 7 * 24 * 3600 * 1000);
}

/**
 * @returns {boolean} true se a semana já liberou (data atual >= unlock).
 */
export function semanaLiberadaPorData(dataInicio: string | null | undefined, n: number | string, now: Date = new Date()): boolean {
  const unlock = semanaLiberadaEm(dataInicio, n);
  if (!unlock) return false;
  return now.getTime() >= unlock.getTime();
}

/**
 * A degradação desta semana representa uma ENTREGA REAL (e portanto deve ir para
 * o `degradacao_log`)?
 *
 * Só semana já liberada conta. O overlay roda sobre o plano INTEIRO — 14 semanas
 * por pessoa — em toda leitura e em toda varredura de admin, mas degradação em
 * semana que ninguém pode abrir não é experiência ruim de ninguém: é simulação.
 *
 * 🔴 Medido em 04/08: das **622 ocorrências** acumuladas de `kit-ausente-disc` +
 * `kit-cargo-divergente` em ibipeba, **zero** eram de semana acessível — a menor
 * semana já registrada era a **6** e a maior liberada era a **4**. O alarme
 * "578 fallbacks em 24h" media a tela `/admin/temporadas` varrendo o futuro, não
 * gente recebendo conteúdo pior. Alarme que não corresponde a experiência
 * treina a ignorar o alarme — o mesmo estrago do contador sem janela (28/07).
 *
 * Fail-closed sem `dataInicio`: os selects de admin (`listarTemporadasEmpresa`,
 * `carregarTrilhaAdmin`) não trazem o campo, então varredura administrativa
 * deixa de registrar por construção — a mesma disciplina que a prévia do
 * health-check já seguia ao não passar `colaboradorId`.
 */
export function entregaEhReal(dataInicio: string | null | undefined, semana: number | string): boolean {
  return semanaLiberadaPorData(dataInicio, semana);
}

// ── Conclusão da semana: quantos turnos de IA encerram a conversa ───────────
//
// Viviam dentro de `app/api/temporada/reflection/route.ts` (e o da semana 13
// dentro de `evaluation`), onde só o servidor enxergava. A tela precisa do MESMO
// número para dizer "faltam 3 respostas" — e número de régua repetido em dois
// arquivos é como a tela passa a prometer o que a rota nega.

/** Evidências de 1 descritor: 6 IA + 6 colab. */
export const MAX_TURNS_SOCRATIC = 12;
/** Cenário escrito, 3 descritores: 10 IA + 10 colab. */
export const MAX_TURNS_ANALYTIC = 20;
/** Relato de missão prática, 3 descritores: 10 IA + 10 colab. */
export const MAX_TURNS_MISSAO_FEEDBACK = 20;
/** Semana 13 (qualitativa) conta turnos de IA DIRETO, sem dividir por 2. */
export const TURNOS_IA_AVALIACAO_QUALITATIVA = 12;

/** Slot do JSONB onde a conversa daquela semana mora. */
export function slotDaConversa(semana: number | string, tipoSemana?: string | null): 'reflexao' | 'feedback' {
  return tipoSemana === 'aplicacao' || Number(semana) === 14 ? 'feedback' : 'reflexao';
}

/**
 * Turnos de IA necessários para a semana ser dada por concluída — a mesma conta
 * que as rotas fazem para virar `finished`.
 */
export function turnosIaNecessarios(
  semana: number | string,
  tipoSemana?: string | null,
  modoAplicacao?: string | null,
  /**
   * Onde fica a conversa qualitativa e quanto ela custa. Sem isto, a régua caía
   * em `semana === 13` — verdade só no formato de 14 semanas.
   *
   * 🔴 Medido 03/09/2026, Ibipeba: a qualitativa foi para a semana **8** e o
   * `=== 13` deixou de casar, então a tela passou a prometer 6 turnos onde a
   * rota exigia 12. Régua duplicada não diverge um dia — nasce divergente.
   *
   * `turnos` existe porque 12 turnos foi calibrado para fechar 14 semanas. Num
   * encerramento de 7, cobrir 12 descritores em 12 turnos vira pedágio na frente
   * do Cenário B, que é o instrumento que de fato mede.
   */
  qualitativa?: { semana: number; turnos?: number } | null,
): number {
  const semQualitativa = qualitativa?.semana ?? 13;
  if (Number(semana) === semQualitativa) {
    return qualitativa?.turnos ?? TURNOS_IA_AVALIACAO_QUALITATIVA;
  }
  if (tipoSemana === 'aplicacao') {
    return (modoAplicacao === 'pratica' ? MAX_TURNS_MISSAO_FEEDBACK : MAX_TURNS_ANALYTIC) / 2;
  }
  return MAX_TURNS_SOCRATIC / 2;
}

/** Turnos de IA já gravados no transcript de um registro de progresso. */
export function contarTurnosIa(progresso: any, semana: number | string, tipoSemana?: string | null): number {
  const slot = slotDaConversa(semana, tipoSemana);
  const transcript = progresso?.[slot]?.transcript_completo;
  if (!Array.isArray(transcript)) return 0;
  return transcript.filter((m: any) => m?.role === 'assistant').length;
}

export interface AcessoSemana {
  liberada: boolean;
  /** 'data' = calendário ainda não chegou · 'anterior' = semana N-1 não concluída. */
  motivo?: 'data' | 'anterior';
  /** Semana que precisa ser concluída antes (motivo 'anterior'). */
  semanaPendente?: number;
  /** Rótulo da liberação (motivo 'data'), ex. "seg 12/05". */
  liberaEm?: string;
  /** Progresso da conversa pendente — `null` quando o chamador não trouxe o transcript. */
  turnosFeitos?: number | null;
  turnosNecessarios?: number;
}

/**
 * A pessoa pode abrir esta semana? Régua ÚNICA — o servidor decide com ela
 * (`checarGatesSemana`) e a tela explica com ela.
 *
 * 🔴 Por que ela existe (medido 20/08/2026, Ibipeba): a régua morava só nas
 * rotas de conversa, e a PÁGINA da semana não tinha gate nenhum. A cadência
 * manda o link da semana do CALENDÁRIO (`fase4_envios.semana_atual`), então quem
 * atrasou abria a semana 6, via o conteúdo e tomava 403 mudo ao tentar
 * conversar. 19 de 36 pessoas estavam sem nenhuma semana concluída, e a que mais
 * perto chegou parou a 1 turno — 36 dias parada. A régua sequencial é
 * deliberada; o que faltava era ela ser DITA.
 *
 * `progresso` aceita array (como vem de `loadTemporadaPorEmail`) ou mapa por
 * semana. Sem transcript no registro, `turnosFeitos` sai `null` — a decisão de
 * liberar não muda, só o detalhe da explicação.
 */
export function avaliarAcessoSemana(input: {
  dataInicio: string | null | undefined;
  plano: any[] | null | undefined;
  progresso: any[] | Record<string | number, any> | null | undefined;
  semana: number | string;
  now?: Date;
}): AcessoSemana {
  const semana = Number(input.semana);
  const plano = Array.isArray(input.plano) ? input.plano : [];
  const slotPlano = plano.find((s: any) => Number(s?.semana) === semana);
  const semanaCal = slotPlano?.calendario_semana ?? semana;

  if (!semanaLiberadaPorData(input.dataInicio, semanaCal, input.now ?? new Date())) {
    return { liberada: false, motivo: 'data', liberaEm: formatarLiberacao(input.dataInicio, semanaCal) };
  }

  if (semana <= 1) return { liberada: true };

  const progressos = Array.isArray(input.progresso)
    ? input.progresso
    : Object.values(input.progresso || {});
  const anteriorNum = semana - 1;
  const anterior = progressos.find((p: any) => Number(p?.semana) === anteriorNum);
  if (anterior?.status === PROGRESSO.CONCLUIDO) return { liberada: true };

  const tipoAnterior = plano.find((s: any) => Number(s?.semana) === anteriorNum)?.tipo;
  const temTranscript = anterior?.[slotDaConversa(anteriorNum, tipoAnterior)]?.transcript_completo;
  return {
    liberada: false,
    motivo: 'anterior',
    semanaPendente: anteriorNum,
    turnosFeitos: Array.isArray(temTranscript) ? contarTurnosIa(anterior, anteriorNum, tipoAnterior) : null,
    turnosNecessarios: turnosIaNecessarios(anteriorNum, tipoAnterior, anterior?.feedback?.modo),
  };
}

/**
 * A primeira semana que a pessoa REALMENTE consegue abrir, a partir de `semana`.
 *
 * 🔴 POR QUE NÃO BASTA `avaliarAcessoSemana(...).semanaPendente` (medido
 * 23/08/2026). Aquele gate anda UM passo: se a semana 6 está travada pela 5, ele
 * devolve 5 — mesmo quando a 5 também está travada pela 4, e assim por diante.
 * Na TELA isso é aceitável, porque a pessoa clica de novo e desce mais um degrau.
 * Numa MENSAGEM, não: o dry-run da coorte de Ibipeba mostrou as 32 pessoas
 * bloqueadas apontando todas para a semana 5, sendo que 28 delas estavam presas
 * bem antes (18 na semana 1). O link levaria a outra porta fechada — trocando o
 * defeito de lugar em vez de corrigi-lo.
 *
 * Isto NÃO é uma régua nova: é `avaliarAcessoSemana` aplicada até o ponto fixo.
 * Reimplementar o critério aqui recriaria a divergência entre portas que a F-I21
 * documenta.
 *
 * `motivo: 'data'` interrompe a descida e devolve a semana corrente — não existe
 * semana anterior a oferecer, e continuar desceria por engano.
 */
export function primeiraSemanaAcessivel(input: {
  dataInicio: string | null | undefined;
  plano: any[] | null | undefined;
  progresso: any[] | Record<string | number, any> | null | undefined;
  semana: number | string;
  now?: Date;
}): number {
  let atual = Number(input.semana);
  if (!Number.isFinite(atual) || atual < 1) return 1;
  // Teto de iterações: o gate desce no máximo uma semana por volta, então o
  // número de semanas basta. Guarda contra plano/progresso inconsistente virar
  // laço infinito DENTRO do cron — que roda sem ninguém olhando.
  for (let i = 0; i < 20 && atual > 1; i++) {
    const acesso = avaliarAcessoSemana({ ...input, semana: atual });
    if (acesso.liberada) return atual;
    if (acesso.motivo !== 'anterior' || !acesso.semanaPendente) return atual;
    if (acesso.semanaPendente >= atual) return atual; // nunca subir/estagnar
    atual = acesso.semanaPendente;
  }
  return atual;
}

/**
 * Formata a data de liberação para exibição (ex.: "seg 12/05").
 * Horário (03:00) não é exibido — é detalhe de implementação.
 */
export function formatarLiberacao(dataInicio: string | null | undefined, n: number | string): string {
  const unlock = semanaLiberadaEm(dataInicio, n);
  if (!unlock) return '';
  const sp = new Date(unlock.getTime() - SP_OFFSET_HOURS * 3600 * 1000);
  const dd = String(sp.getUTCDate()).padStart(2, '0');
  const mm = String(sp.getUTCMonth() + 1).padStart(2, '0');
  return `seg ${dd}/${mm}`;
}
