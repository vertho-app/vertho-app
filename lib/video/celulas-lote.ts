/**
 * Disparo das células de vídeo do Kit EM LOTE, com o avatar por grupo (30/09/2026).
 *
 * Por que existe: o avatar compartilhado (`VIDEO_AVATAR_GRUPO`) só vivia dentro do
 * `gerarKitSemanal`, e o caminho que produz o vídeo semanal é um script de lote que
 * chama `dispararVideoDoKit` célula a célula. Por ele, cada célula pagava o próprio
 * avatar (~US$ 0,51). `Medido`: desde 01/08, 32 células DISC distintas desse script
 * caíram em só 13 combinações de módulo × cargo, ou seja, ~19 avatares a mais.
 *
 * Três réguas, todas daqui:
 *   · um coletor e uma agenda para o lote inteiro (`./roteiro-lote`): os roteiros vão
 *     num lote só, e cada narração que começa ocupa uma VAGA da agenda;
 *   · um grupo por módulo × cargo (cargo ≠ `todos`); o despacho do grupo acontece
 *     depois que as células dele entraram no banco (o orquestrador as lê de lá);
 *   · o plano é recusado ANTES de disparar se a última vaga passar do teto: a célula
 *     que espera fica `processing` e a regra `video-stale` a acusaria.
 *
 * Headless: recebe o cliente de quem chama. `grupo` é explícito (quem chama lê a flag).
 */
import type { AIRun } from '@/lib/ai-batch';
import { AVATAR_GRUPO } from '@/lib/status';
import { coletorDeRoteiros, criarAgendaDeDisparo, TETO_ATRASO_DISPARO_S, type AgendaDeDisparo } from './roteiro-lote';
import { prepararGrupoAvatar, despacharGrupoAvatar, type GrupoAvatar } from './avatar-grupo-core';
import { INTERVALO_DISPARO_PADRAO_S, ETAPA_AGUARDANDO_AVATAR } from './avatar-grupo';

type Disc = 'D' | 'I' | 'S' | 'C';

export interface CelulaDoLote {
  moduloBaseId: string;
  cargo: string;
  disc: Disc;
  desafioTexto: string;
  kitId: string;
}

/** A combinação que divide o avatar. */
export const chaveCombinacao = (c: { moduloBaseId: string; cargo: string }) => `${c.moduloBaseId}::${c.cargo}`;

/** Sem cargo não há grupo: o texto do avatar fala da rotina do cargo. */
export const podeAgrupar = (cargo: string | null | undefined) => !!cargo && cargo !== 'todos';

/**
 * Quantas vagas da agenda o lote ocupa. Cada vaga é uma narração que começa:
 * 1 por célula sem grupo; 1 por grupo pendente (a mãe; as irmãs vêm depois dela,
 * espaçadas pelo orquestrador); k por grupo já pronto (as k irmãs saem direto).
 * `grupos = null` = o lote não agrupa.
 */
export function planoDeVagas(
  celulas: Array<{ moduloBaseId: string; cargo: string }>,
  grupos: Map<string, { status: string } | null> | null,
): number {
  let vagas = 0;
  const porCombinacao = new Map<string, number>();
  for (const c of celulas) {
    const g = grupos && podeAgrupar(c.cargo) ? grupos.get(chaveCombinacao(c)) ?? null : null;
    if (!g) { vagas++; continue; }
    const k = chaveCombinacao(c);
    porCombinacao.set(k, (porCombinacao.get(k) || 0) + 1);
  }
  for (const [k, n] of porCombinacao) vagas += grupos!.get(k)!.status === AVATAR_GRUPO.PRONTO ? n : 1;
  return vagas;
}

/** A última vaga sai `(vagas − 1) × intervalo` depois da primeira; acima do teto, recusa. */
export function passaDoTeto(vagas: number, intervaloS: number): boolean {
  return (vagas - 1) * intervaloS > TETO_ATRASO_DISPARO_S;
}

export interface ResultadoCelula { id?: string; reused?: boolean; status?: string; error?: string; adiado?: boolean }
export interface ResultadoGrupo {
  grupoId: string;
  combinacao: string;
  celulas: number;
  atrasoS: number;
  via: 'grupo' | 'celula' | null;
  erros: string[];
}

export async function dispararCelulasDoKitEmLote(sb: any, p: {
  empresaId: string;
  pppBrief: string | null;
  createdBy: string;
  celulas: CelulaDoLote[];
  /** Agrupar o avatar (quem chama resolve `VIDEO_AVATAR_GRUPO`). */
  grupo: boolean;
  intervaloS?: number;
  /** Espera máxima pelo lote dos roteiros (ver `coletorDeRoteiros`). */
  budgetMs?: number;
  /** Relógio da agenda (testes). */
  agora?: () => number;
  /** Coletor pronto (testes); sem ele, cria um `coletorDeRoteiros`. */
  aiRunRoteiro?: AIRun;
}): Promise<{ vagas: number; celulas: ResultadoCelula[]; grupos: ResultadoGrupo[] }> {
  const intervalo = p.intervaloS ?? INTERVALO_DISPARO_PADRAO_S;
  const agrupaveis = p.grupo ? p.celulas.filter((c) => podeAgrupar(c.cargo)) : [];
  const combinacoes = [...new Map(agrupaveis.map((c) => [chaveCombinacao(c), c])).values()];

  // 1) Pré-cheque otimista (1 vaga por combinação): recusa antes de gastar com textos.
  const minimo = (p.celulas.length - agrupaveis.length) + combinacoes.length;
  if (passaDoTeto(minimo, intervalo)) {
    throw new Error(`plano com ${minimo} vaga(s) × ${intervalo}s passa do teto de ${TETO_ATRASO_DISPARO_S}s de atraso: divida o lote`);
  }

  // 2) Um grupo por combinação, em série (cada um é uma chamada curta ao modelo).
  const grupos = new Map<string, GrupoAvatar | null>();
  for (const c of combinacoes) {
    grupos.set(chaveCombinacao(c), await prepararGrupoAvatar(sb, { empresaId: p.empresaId, moduloBaseId: c.moduloBaseId, cargo: c.cargo, pppBrief: p.pppBrief }));
  }

  // 3) Vagas exatas (grupo pronto reserva uma por irmã; grupo que não nasceu vira célula solta).
  const vagas = planoDeVagas(p.celulas, p.grupo ? grupos : null);
  if (passaDoTeto(vagas, intervalo)) {
    throw new Error(`plano com ${vagas} vaga(s) × ${intervalo}s passa do teto de ${TETO_ATRASO_DISPARO_S}s de atraso: divida o lote`);
  }

  // 4) Um coletor e uma agenda para tudo; as células entram juntas.
  const aiRunRoteiro = p.aiRunRoteiro ?? await coletorDeRoteiros(p.empresaId, { budgetMs: p.budgetMs });
  const agenda: AgendaDeDisparo = criarAgendaDeDisparo(intervalo, p.agora);
  const { dispararVideoDoKit } = await import('@/actions/gerar-video');
  const doGrupo = new Map<string, Promise<ResultadoCelula>[]>();
  const promessas = p.celulas.map((c) => {
    const k = chaveCombinacao(c);
    const g = p.grupo && podeAgrupar(c.cargo) ? grupos.get(k) ?? null : null;
    const pr: Promise<ResultadoCelula> = dispararVideoDoKit(sb, {
      moduloBaseId: c.moduloBaseId, empresaId: p.empresaId, cargo: c.cargo, disc: c.disc,
      desafioTexto: c.desafioTexto, kitId: c.kitId, pppBrief: p.pppBrief, createdBy: p.createdBy,
      avatarGrupo: g ? { grupoId: g.id, textos: g.textos } : null,
      aiRunRoteiro, agendaDisparo: agenda,
    }).catch((e: any) => ({ error: e?.message || String(e) }));
    if (g) doGrupo.set(k, [...(doGrupo.get(k) || []), pr]);
    return pr;
  });

  // 5) Cada grupo é despachado assim que as células DELE entraram (não espera o lote todo).
  const despachos = [...grupos.entries()].filter(([, g]) => !!g).map(async ([k, g]): Promise<ResultadoGrupo> => {
    const rs = await Promise.all(doGrupo.get(k) || []);
    const esperando = rs.filter((r) => !r.error && r.adiado).length;
    const base = { grupoId: g!.id, combinacao: k, celulas: esperando };
    if (!esperando) return { ...base, atrasoS: 0, via: null, erros: [] };
    let atrasoS = 0;
    try {
      atrasoS = agenda.proximoAtrasoS();
      const reservar = g!.status === AVATAR_GRUPO.PRONTO ? esperando : 1;
      for (let i = 1; i < reservar; i++) agenda.proximoAtrasoS();
    } catch (e: any) {
      // Sem vaga (teto): despacha mesmo assim, com aviso. Deixar o grupo sem despacho
      // prenderia as células em `aguardando_avatar`.
      console.warn(`[celulas-lote] grupo ${g!.id}: agenda recusou (${e?.message}); despacho sem atraso`);
    }
    const r = await despacharGrupoAvatar(sb, { grupoId: g!.id, empresaId: p.empresaId, atrasoS, intervaloS: intervalo });
    return { ...base, atrasoS, via: r.via, erros: r.erros };
  });

  const [celulas, gruposDespachados] = await Promise.all([Promise.all(promessas), Promise.all(despachos)]);
  return { vagas, celulas, grupos: gruposDespachados };
}

/**
 * Grupos com células esperando sem despacho: o processo morreu entre a inserção e o
 * despacho. Sem isto elas ficariam em `aguardando_avatar`, e a checagem de "já tem
 * deck" do script as esconderia nas rodadas seguintes. Despacha cada grupo uma vez,
 * espaçados pela agenda.
 */
export async function despacharGruposOrfaos(sb: any, p: {
  empresaId: string; intervaloS?: number; agora?: () => number;
}): Promise<{ grupos: string[]; erros: string[] }> {
  const { data, error } = await sb.from('videos_gerados').select('avatar_grupo_id')
    .eq('empresa_id', p.empresaId).eq('etapa', ETAPA_AGUARDANDO_AVATAR).eq('status', 'processing')
    .not('avatar_grupo_id', 'is', null);
  if (error) throw new Error(`células esperando: ${error.message}`);
  const ids = [...new Set((data || []).map((r: any) => r.avatar_grupo_id).filter(Boolean))] as string[];
  const intervalo = p.intervaloS ?? INTERVALO_DISPARO_PADRAO_S;
  const agenda = criarAgendaDeDisparo(intervalo, p.agora);
  const erros: string[] = [];
  for (const grupoId of ids) {
    const r = await despacharGrupoAvatar(sb, { grupoId, empresaId: p.empresaId, atrasoS: agenda.proximoAtrasoS(), intervaloS: intervalo });
    erros.push(...r.erros);
  }
  return { grupos: ids, erros };
}
