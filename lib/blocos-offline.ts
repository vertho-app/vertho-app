/**
 * Blocos do produto que estão OFF-LINE — desligados do acesso, com o código
 * preservado no repositório.
 *
 * Decisão de 31/08/2026, depois de um levantamento de uso que mediu duas coisas
 * por bloco: quanto dado ele produziu em produção e quem no código ainda aponta
 * para ele. Os cinco abaixo não passaram no primeiro teste — nenhum deles é uma
 * hipótese sobre desuso, cada `evidencia` é uma contagem feita no banco.
 *
 * ── Por que desligar em vez de apagar ───────────────────────────────────────
 * Apagar exigiria desemaranhar o que é compartilhado (o Radar vivo divide
 * `lib/radar/` com o RadarBett; o CONARH divide a cadência de WhatsApp) e
 * jogaria fora trabalho que pode voltar — o Portal do Representante, por
 * exemplo, está parado mas não morto, e não entra nesta lista. Off-line é
 * reversível: tirar a entrada daqui religa o bloco inteiro.
 *
 * ── Onde este registro é aplicado ───────────────────────────────────────────
 * Em DOIS lugares, porque um só não fecha a porta:
 *   1. **Tela** — `notFound()` no layout (ou na page, quando não há layout).
 *      É o que o operador encontra.
 *   2. **Server Action / rota de API** — `assertBlocoOnline()` no topo. Num
 *      arquivo `'use server'` todo export é um endpoint HTTP: esconder a tela
 *      não desliga a action, que continua chamável por quem tem o action id.
 *
 * O menu é consequência, não gate: a entrada some de `nav-items.ts` porque
 * apontar para uma tela que responde 404 é pior do que não apontar.
 *
 * ⚠️ Fail-closed ao contrário do gate de módulo: aqui a AUSÊNCIA de entrada
 * significa "ligado". É intencional — este registro descreve a exceção, e um
 * bloco novo não pode nascer desligado por esquecimento de alguém.
 */

export type BlocoOffline = {
  /** Rótulo humano — aparece na mensagem de erro da action. */
  rotulo: string;
  /** Quando saiu do ar (ISO, America/Sao_Paulo). */
  desde: string;
  /** O que a medição encontrou. Obrigatório: é a justificativa da decisão. */
  evidencia: string;
};

export const BLOCOS_OFFLINE = {
  pulso: {
    rotulo: 'Pulso',
    desde: '2026-08-31',
    evidencia:
      'As 5 tabelas de execução (assignments, responses, classifications, triangulations, audit_logs) com 0 linhas. O único ciclo criado — "Ibipeba Ciclo1", 01/06/2026 — ficou em draft e nunca teve t0_aberto_em.',
  },
  selecao: {
    rotulo: 'Seleção de pessoas',
    desde: '2026-08-31',
    evidencia:
      'O fluxo tem 3 passos e nunca passou do primeiro: 2 vagas criadas (Macaé MEI, 01/07/2026), 0 com fit_perfil_ideal fechado e 0 candidatos avaliados contra vaga, em nenhum tenant.',
  },
  radarempresas: {
    rotulo: 'Radar Empresas',
    desde: '2026-08-31',
    evidencia:
      'Última ingestão em 16/05/2026 — nada em 90 dias. O recurso de listas nunca foi usado (radarempresas_listas, lista_itens e insights com 0 linhas). O acervo de 92 mil empresas permanece no banco.',
  },
  radarbett: {
    rotulo: 'RadarBett',
    desde: '2026-08-31',
    evidencia:
      'Descontinuado após a feira. Nenhuma das 7 rotas é referenciada por link em lugar nenhum do código — só eram alcançáveis por URL direta.',
  },
  conarh: {
    rotulo: 'CONARH 52',
    desde: '2026-08-31',
    evidencia:
      'Evento sazonal com prazo 17/08/2026, encerrado. 7 leads capturados. Os dois crons da régua de follow-up (T+1→T+5 e reenvio de T+0) seguiam armados contra uma feira que já acabou.',
  },
} as const satisfies Record<string, BlocoOffline>;

export type NomeBloco = keyof typeof BLOCOS_OFFLINE;

/** O bloco está desligado? Lookup por `hasOwnProperty`, nunca `in`. */
export function blocoEstaOffline(bloco: string): boolean {
  return Object.prototype.hasOwnProperty.call(BLOCOS_OFFLINE, bloco);
}

/** Erro de bloco desligado — tipado para o call-site poder distinguir. */
export class BlocoOfflineError extends Error {
  readonly bloco: string;
  constructor(bloco: string, mensagem: string) {
    super(mensagem);
    this.name = 'BlocoOfflineError';
    this.bloco = bloco;
  }
}

/**
 * Gate para Server Action / rota de API. LANÇA quando o bloco está off-line.
 *
 * ⚠️ Lança em vez de devolver `{ ok:false, error }` de propósito. As 41 funções
 * gatadas têm assinaturas de retorno diferentes — `listarVagas` promete
 * `{ vagas: [] }`, `loadPulseDashboard` promete o agregado — e devolver um
 * objeto de erro no lugar exigiria um `as any` em cada uma. O chamador que
 * fizesse `r.vagas.map(...)` receberia `undefined` e quebraria com "cannot read
 * properties of undefined", que é o sintoma errado para a causa certa: o
 * problema não é a resposta malformada, é que o bloco está desligado.
 *
 * Lançar mantém a assinatura honesta e produz um erro legível no log.
 *
 * O motivo entra na mensagem porque gate que nega sem dizer o que falta manda a
 * próxima pessoa procurar bug onde há decisão.
 */
export function assertBlocoOnline(bloco: NomeBloco): void {
  const reg = BLOCOS_OFFLINE[bloco];
  if (!reg) return;
  throw new BlocoOfflineError(
    bloco,
    `O bloco ${reg.rotulo} está off-line desde ${reg.desde} e não aceita operações. `
    + `Motivo: ${reg.evidencia} `
    + `Para religar, remova a entrada "${bloco}" de lib/blocos-offline.ts.`,
  );
}
