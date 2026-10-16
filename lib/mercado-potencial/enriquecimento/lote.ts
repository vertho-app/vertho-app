import { enriquecerEscola, RESERVA_CREDITOS_HUNTER, type Dependencias } from './enriquecer';
import { criarClienteHunter, type ClienteHunter } from './hunter';
import { carregarSupressao, lerContatos, purgarVencidos, salvarContato } from './persistencia';
import {
  CREDITOS_HUNTER_POR_ESCOLA, CUSTO_BUSCA_USD, HUNTER_COMPLETAVEL, TAMANHO_LOTE, TETO_RODADA,
  type EscolaAlvo, type HunterStatus, type LinhaContato, type Nivel,
} from './tipos';
import type { BuscaPagina } from './verificar';
import type { ResultadoBusca } from './busca-web';

/**
 * Lote de enriquecimento: o que a tela dispara de 5 em 5 escolas. Núcleo SEM gate (quem chama já passou por
 * `requireAdminAction` + conta da equipe) e SEM cliente próprio de banco: o `sb` vem da action, porque o guard de
 * service-role só permite `createSupabaseAdmin` em lugares declarados.
 *
 * Por que lote pequeno e não uma task do Trigger.dev: o deploy da task é manual (e as envs dela faltam), e a
 * tela já precisa de resposta por escola. Cada escola é GRAVADA ao terminar, então fechar a aba no meio não
 * perde o que já saiu, e rodar de novo só refaz o que falta.
 */

// `TAMANHO_LOTE` e `TETO_RODADA` moram em `tipos.ts` (arquivo puro): a tela os importa e não pode puxar este módulo, que traz o servidor junto.
export { TAMANHO_LOTE, TETO_RODADA };
/** Freio de gasto: buscas web NOVAS por dia (BRT), somando todos os operadores. Retomar o Hunter não conta. */
export const TETO_DIARIO = 500;
/**
 * O lote inteiro roda de uma vez: o pior caso de UMA escola (busca web 170 s + leitura das páginas 12 s + até 4
 * chamadas ao Hunter de 20 s = 262 s) já enche a função de 300 s, então uma segunda leva de escolas, que começaria
 * depois de uma primeira lenta, estouraria o tempo no meio de uma busca paga. A conta é travada pelo teste da tela.
 */
const CONCORRENCIA = TAMANHO_LOTE;
/** Se mesmo assim uma escola ainda não começou depois disto, fica para a próxima chamada, sem gastar busca. */
const PRAZO_PARA_COMECAR_MS = 60_000;

const INEP = /^\d{8}$/;

/** Início do dia em Brasília (UTC-3, sem horário de verão desde 2019), em ISO. */
export function inicioDoDiaBRT(agora: Date): string {
  const dia = agora.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
  return new Date(`${dia}T00:00:00-03:00`).toISOString();
}

/** Buscas web novas de hoje: linhas com `coletado_em` de hoje (retomar o Hunter preserva o `coletado_em`). */
export async function contarBuscasDoDia(sb: any, agora: Date): Promise<{ n: number; erro?: string }> {
  const { count, error } = await sb.from('mercado_escola_contatos').select('codigo_inep', { count: 'exact', head: true }).gte('coletado_em', inicioDoDiaBRT(agora));
  if (error) return { n: 0, erro: error.message };
  return { n: count ?? 0 };
}

// ── Plano ───────────────────────────────────────────────────────────────────

/**
 * Separa as escolas da rodada em: já prontas (dado vigente e Hunter resolvido), só falta o Hunter (a busca web
 * vigente já está gravada) e a enriquecer (sem linha ou vencida). Sem Hunter configurado, quem só dependia dele
 * conta como pronta: rodar de novo não acharia nada e o aviso da tela já diz por quê.
 */
export function classificar(codigos: string[], mapa: ReadonlyMap<string, LinhaContato>, agora: Date, hunterDisponivel: boolean) {
  const prontas: string[] = [];
  const hunterPendente: string[] = [];
  const aEnriquecer: string[] = [];
  for (const c of codigos) {
    const l = mapa.get(c);
    const vigente = !!l && new Date(l.expira_em) > agora;
    if (!vigente) aEnriquecer.push(c);
    else if (HUNTER_COMPLETAVEL.includes(l!.hunter_status) && hunterDisponivel) hunterPendente.push(c);
    else prontas.push(c);
  }
  return { prontas, hunterPendente, aEnriquecer };
}

/** Quantas escolas, na ordem da tela, a rodada olha para separar o que falta (5 consultas de 200 códigos). */
export const JANELA_DO_PLANO = 1000;

export interface PlanoEnriquecimento {
  /** Escolas que o filtro devolveu (até o teto de leitura da exportação). */
  lidas: number;
  totalNoBanco: number | null;
  /** O filtro tem mais escolas do que a leitura alcança: refine por UF, região ou rede. */
  truncado: boolean;
  /** Quantas escolas o plano olhou (as primeiras `JANELA_DO_PLANO` na ordem da tela). Os três números abaixo são desta janela. */
  janela: number;
  prontas: number;
  hunterPendente: number;
  aEnriquecer: number;
  /** O que sobrou para as rodadas seguintes, depois das `TETO_RODADA` desta. */
  paraDepois: number;
  /** O que a tela manda ao lote nesta rodada (até `TETO_RODADA`), na ordem da tela. */
  codigos: string[];
  /** Da rodada: buscas novas, retomadas só do Hunter, custo e créditos estimados. */
  buscasNovas: number;
  soHunter: number;
  custoBuscaUsd: number;
  creditosHunterEstimados: number;
  hunterConfigurado: boolean;
  /** Créditos que restam no plano do Hunter; null = não deu para saber (ou sem chave). */
  creditosHunter: number | null;
  buscasRestantesHoje: number;
}

export async function montarPlano(
  sb: any, codigosNaOrdemDaTela: string[], meta: { totalNoBanco: number | null; truncado: boolean }, agora: Date,
  deps: { hunter?: ClienteHunter | null } = {},
): Promise<{ ok: true; plano: PlanoEnriquecimento } | { ok: false; error: string }> {
  const janela = codigosNaOrdemDaTela.slice(0, JANELA_DO_PLANO);
  const lidos = await lerContatos(sb, janela);
  if (lidos.erro) return { ok: false, error: `Não consegui ler os contatos já coletados: ${lidos.erro}` };
  const hunter = deps.hunter !== undefined ? deps.hunter : criarClienteHunter();
  const creditos = hunter ? await hunter.creditos() : null;
  const dia = await contarBuscasDoDia(sb, agora);
  if (dia.erro) return { ok: false, error: `Não consegui ler o teto do dia: ${dia.erro}` };

  const { prontas, hunterPendente, aEnriquecer } = classificar(janela, lidos.mapa, agora, !!hunter);
  const novas = new Set(aEnriquecer);
  const soHunter = new Set(hunterPendente);
  const pendentes = janela.filter((c) => novas.has(c) || soHunter.has(c));
  const codigos = pendentes.slice(0, TETO_RODADA);
  const buscasNovas = codigos.filter((c) => novas.has(c)).length;
  const retomadas = codigos.length - buscasNovas;
  return {
    ok: true,
    plano: {
      lidas: codigosNaOrdemDaTela.length, totalNoBanco: meta.totalNoBanco, truncado: meta.truncado, janela: janela.length,
      prontas: prontas.length, hunterPendente: hunterPendente.length, aEnriquecer: aEnriquecer.length,
      paraDepois: pendentes.length - codigos.length, codigos, buscasNovas, soHunter: retomadas,
      custoBuscaUsd: arredonda(buscasNovas * CUSTO_BUSCA_USD),
      creditosHunterEstimados: arredonda(codigos.length * CREDITOS_HUNTER_POR_ESCOLA),
      hunterConfigurado: !!hunter, creditosHunter: creditos,
      buscasRestantesHoje: Math.max(0, TETO_DIARIO - dia.n),
    },
  };
}

const arredonda = (n: number) => Math.round(n * 100) / 100;

// ── Lote ────────────────────────────────────────────────────────────────────

export interface ResultadoEscola {
  codigo_inep: string;
  ok: boolean;
  nivel?: Nivel | null;
  hunter_status?: HunterStatus;
  /** Rodou uma busca web nova (cobra); false = só completou o Hunter ou já estava pronta. */
  busca?: boolean;
  /** A escola não começou (prazo ou teto do dia): a tela pode tentar de novo na chamada seguinte. */
  adiada?: boolean;
  /** Por que ficou para depois: o lote demorou (tenta de novo agora) ou o teto do dia acabou (só amanhã). */
  adiadaPor?: 'prazo' | 'teto_diario';
  erro?: string;
}

export interface ResultadoLote {
  resultados: ResultadoEscola[];
  buscas: number;
  custoUsd: number;
  hunterCreditosGastos: number;
  /** Saldo do Hunter ao fim do lote (estimado a partir do que a leitura inicial trouxe); null = desconhecido. */
  creditosHunter: number | null;
  hunterConfigurado: boolean;
  buscasRestantesHoje: number;
}

export interface DepsLote {
  hunter?: ClienteHunter | null;
  buscar?: (e: EscolaAlvo) => Promise<ResultadoBusca>;
  buscarPagina?: BuscaPagina;
  agora?: () => Date;
}

/** Pool com ordem de saída igual à de entrada. Cada tarefa captura o próprio erro: um worker não derruba os outros. */
async function emPool<T, R>(itens: T[], n: number, fn: (x: T, i: number) => Promise<R>): Promise<R[]> {
  const saida = new Array<R>(itens.length);
  let proximo = 0;
  await Promise.all(Array.from({ length: Math.min(n, itens.length) }, async () => {
    while (proximo < itens.length) {
      const i = proximo++;
      saida[i] = await fn(itens[i], i);
    }
  }));
  return saida;
}

export function normalizarCodigos(brutos: unknown): { ok: true; codigos: string[] } | { ok: false; error: string } {
  if (!Array.isArray(brutos) || !brutos.length) return { ok: false, error: 'Nenhuma escola informada.' };
  const codigos = [...new Set(brutos.map((x) => String(x ?? '').trim()))];
  if (codigos.some((c) => !INEP.test(c))) return { ok: false, error: 'Código INEP inválido (são 8 dígitos).' };
  if (codigos.length > TAMANHO_LOTE) return { ok: false, error: `No máximo ${TAMANHO_LOTE} escolas por chamada.` };
  return { ok: true, codigos };
}

export async function enriquecerLote(
  sb: any, solicitadoPor: string, codigosBrutos: unknown, deps: DepsLote = {},
): Promise<({ ok: true } & ResultadoLote) | { ok: false; error: string }> {
  const norm = normalizarCodigos(codigosBrutos);
  if (norm.ok === false) return { ok: false, error: norm.error };
  const codigos = norm.codigos;
  const agora = (deps.agora ?? (() => new Date()))();
  const inicio = Date.now();

  // Dado pessoal vencido (180 dias) sai a cada lote: dispensa um cron só para isso.
  const purga = await purgarVencidos(sb, agora);
  if (purga) return { ok: false, error: `Não consegui apagar os contatos vencidos: ${purga}` };

  // Só entra escola que existe na base (o código vem do navegador) e o endereço do Censo separa unidades e homônimos.
  const escolas = await sb.from('diag_mv_mercado_escola').select('codigo_inep, nome, municipio, uf').in('codigo_inep', codigos);
  if (escolas.error) return { ok: false, error: `Não consegui ler as escolas: ${escolas.error.message}` };
  const enderecos = await sb.from('diag_censo_infra').select('codigo_inep, endereco, bairro, cep').in('codigo_inep', codigos);
  if (enderecos.error) return { ok: false, error: `Não consegui ler os endereços: ${enderecos.error.message}` };
  const endPorInep = new Map<string, any>((enderecos.data || []).map((x: any) => [x.codigo_inep, x]));
  const alvos = new Map<string, EscolaAlvo>((escolas.data || []).map((e: any) => [e.codigo_inep, {
    codigo_inep: e.codigo_inep, nome: e.nome, municipio: e.municipio, uf: e.uf,
    endereco: endPorInep.get(e.codigo_inep)?.endereco ?? null, bairro: endPorInep.get(e.codigo_inep)?.bairro ?? null, cep: endPorInep.get(e.codigo_inep)?.cep ?? null,
  }]));

  const lidos = await lerContatos(sb, codigos);
  if (lidos.erro) return { ok: false, error: `Não consegui ler os contatos: ${lidos.erro}` };
  // Sem a lista de quem pediu para sair, não dá para garantir que nenhum e-mail dela seja gravado: falha fechada.
  const supressao = await carregarSupressao(sb);
  if (supressao.erro) return { ok: false, error: `Não consegui ler a lista de e-mails bloqueados: ${supressao.erro}` };
  const dia = await contarBuscasDoDia(sb, agora);
  if (dia.erro) return { ok: false, error: `Não consegui ler o teto do dia: ${dia.erro}` };

  const hunter = deps.hunter !== undefined ? deps.hunter : criarClienteHunter();
  const creditosIniciais = hunter ? await hunter.creditos() : null;
  const orcamento = { creditos: creditosIniciais, reserva: RESERVA_CREDITOS_HUNTER };
  const dependencias: Dependencias = {
    buscar: deps.buscar, buscarPagina: deps.buscarPagina, hunter, orcamento, supressao: supressao.set, agora: () => agora,
  };

  let buscasRestantes = Math.max(0, TETO_DIARIO - dia.n);
  let buscas = 0;
  let custoUsd = 0;
  let hunterCreditosGastos = 0;

  const resultados = await emPool(codigos, CONCORRENCIA, async (inep): Promise<ResultadoEscola> => {
    const alvo = alvos.get(inep);
    if (!alvo) return { codigo_inep: inep, ok: false, erro: 'Escola não encontrada na base.' };
    const previo = lidos.mapa.get(inep) ?? null;
    const vigente = !!previo && new Date(previo.expira_em) > agora;
    const vaiBuscar = !vigente;
    if (Date.now() - inicio > PRAZO_PARA_COMECAR_MS) return { codigo_inep: inep, ok: false, adiada: true, adiadaPor: 'prazo', erro: 'Fica para a próxima chamada (o lote demorou).' };
    // Reserva a busca ANTES do await: duas escolas em paralelo não furam o teto juntas.
    if (vaiBuscar) {
      if (buscasRestantes <= 0) return { codigo_inep: inep, ok: false, adiada: true, adiadaPor: 'teto_diario', erro: `Teto de ${TETO_DIARIO} buscas por dia atingido. Continue amanhã.` };
      buscasRestantes--;
    }
    try {
      const { linha, rodouBusca } = await enriquecerEscola(alvo, solicitadoPor, dependencias, previo);
      // Já estava pronta (vigente e com o Hunter resolvido): nada a gravar, e o `atualizado_em` não mexe.
      if (linha === previo) return { codigo_inep: inep, ok: true, nivel: linha.nivel, hunter_status: linha.hunter_status, busca: false };
      const falhou = await salvarContato(sb, linha);
      if (falhou) {
        // A busca foi paga e não ficou gravada: a tela precisa ver, e o custo entra na conta.
        if (rodouBusca) { buscas++; custoUsd += linha.custo_usd; }
        return { codigo_inep: inep, ok: false, busca: rodouBusca, erro: `Não consegui gravar o resultado: ${falhou}` };
      }
      if (rodouBusca) { buscas++; custoUsd += linha.custo_usd; }
      hunterCreditosGastos += Math.max(0, linha.hunter_creditos - (vigente ? previo!.hunter_creditos : 0));
      return { codigo_inep: inep, ok: true, nivel: linha.nivel, hunter_status: linha.hunter_status, busca: rodouBusca };
    } catch (e) {
      // Sem nome nem e-mail no log: só o código da escola e a classe do erro.
      console.error('[mercado-enriquecer] falha na escola', inep, e instanceof Error ? e.name : typeof e);
      if (vaiBuscar) buscasRestantes++;
      return { codigo_inep: inep, ok: false, erro: e instanceof Error && e.message ? e.message.slice(0, 160) : 'Falha ao enriquecer esta escola.' };
    }
  });

  return {
    ok: true, resultados, buscas, custoUsd: arredonda(custoUsd), hunterCreditosGastos: arredonda(hunterCreditosGastos),
    creditosHunter: orcamento.creditos, hunterConfigurado: !!hunter, buscasRestantesHoje: buscasRestantes,
  };
}
