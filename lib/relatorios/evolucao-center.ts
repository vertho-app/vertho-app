import { tenantDb } from '@/lib/tenant-db';
import { TRILHA } from '@/lib/status';
import { CONVERGENCIA, rotuloConvergencia, type Convergencia } from '@/lib/season-engine/convergencia';
import { nivelDaNota } from '@/lib/nivel-regua';

/**
 * Painel executivo de EVOLUÇÃO do RH — a resposta para "quem evoluiu, em quê e
 * quanto", separada do ritmo da jornada.
 *
 * TRÊS DECISÕES QUE ESTE ARQUIVO CARREGA:
 *
 * 1. **O veredito é LIDO, não recalculado.** Cada descritor já traz a
 *    `convergencia` que o motor gravou no fechamento. Reclassificar aqui criaria
 *    uma terceira régua sobre um dado já classificado, e o painel passaria a
 *    discordar do relatório que a própria pessoa recebeu. Descritor sem veredito
 *    gravado entra como `null` e é contado à parte, nunca chutado para
 *    "estável" — ausência de medição não é medição de estabilidade.
 *
 * 2. **Piloto fica de fora.** Duas semanas não medem evolução, e o relatório do
 *    piloto grava outra forma (`baseline`/`nota_avaliacao`). Misturá-lo aqui
 *    produziria delta a partir de campo ausente.
 *
 * 3. **Todo agregado carrega o próprio `n`.** "Delta médio +0,7" em cima de duas
 *    pessoas e em cima de duzentas são afirmações muito diferentes, e a tela não
 *    tem como saber qual é qual se o número de pessoas não vier junto. Não há
 *    supressão por piso: esta tela é do RH, que tem acesso nominal por direito
 *    (ele é o Admin da empresa) — suprimir aqui esconderia do dono do dado
 *    aquilo que a tabela nominal ao lado já mostra.
 */

export type EvolucaoVeredito = Convergencia | null;

export type EvolucaoDescritorLinha = {
  colaboradorId: string;
  competencia: string;
  descritor: string;
  notaPre: number;
  notaPos: number;
  convergencia: EvolucaoVeredito;
  /** A frase que sustenta a leitura. É o que o gestor usa na conversa. */
  evidencia: string | null;
};

export type EvolucaoAgregado = {
  chave: string;
  competencia: string | null;
  n: number;
  mediaPre: number;
  mediaPos: number;
  delta: number;
  nivelPre: number;
  nivelPos: number;
  confirmadas: number;
  parciais: number;
  estaveis: number;
  atencao: number;
  semVeredito: number;
};

export type EvolucaoPessoa = {
  colaboradorId: string;
  nome: string;
  cargo: string | null;
  area: string | null;
  competencia: string | null;
  n: number;
  mediaPre: number;
  mediaPos: number;
  delta: number;
  veredito: EvolucaoVeredito;
  vereditoRotulo: string;
  /** Quantas fontes sustentam a leitura desta pessoa. Ver `sustentacao`. */
  sustentacao: 'alta' | 'media' | 'baixa';
  insight: string | null;
  proximoPasso: string | null;
  concluidoEm: string | null;
  descritores: EvolucaoDescritorLinha[];
};

export type EvolucaoCentro = {
  cobertura: {
    participantes: number;
    emJornada: number;
    medidos: number;
    /** medidos ÷ participantes, em pontos percentuais inteiros. */
    percentual: number;
  };
  resumo: {
    confirmadas: number;
    parciais: number;
    estaveis: number;
    atencao: number;
    semVeredito: number;
    deltaMedio: number;
    descritoresMedidos: number;
  };
  porCompetencia: EvolucaoAgregado[];
  porDescritor: EvolucaoAgregado[];
  pessoas: EvolucaoPessoa[];
  proximasAcoes: {
    /** Quem terminou sem evolução confirmada em nenhum descritor. */
    precisamApoio: EvolucaoPessoa[];
    /** Descritores em que o grupo menos avançou — candidatos ao próximo ciclo. */
    proximoCiclo: EvolucaoAgregado[];
  };
  indisponivel: boolean;
};

const VAZIO: EvolucaoCentro = {
  cobertura: { participantes: 0, emJornada: 0, medidos: 0, percentual: 0 },
  resumo: { confirmadas: 0, parciais: 0, estaveis: 0, atencao: 0, semVeredito: 0, deltaMedio: 0, descritoresMedidos: 0 },
  porCompetencia: [],
  porDescritor: [],
  pessoas: [],
  proximasAcoes: { precisamApoio: [], proximoCiclo: [] },
  indisponivel: false,
};

function media(valores: number[]): number {
  if (!valores.length) return 0;
  return Number((valores.reduce((total, v) => total + v, 0) / valores.length).toFixed(2));
}

/**
 * Quantas fontes independentes sustentam a leitura de uma pessoa.
 *
 * ⚠️ O TETO REAL HOJE É **MÉDIA**, e isso é deliberado. O fechamento cruza duas
 * fontes: a leitura qualitativa da semana 13 (`antes`/`depois`, dito pela
 * pessoa) e o cenário avaliado da semana 14. Missões e checkpoint do gestor não
 * gravam nota, então não há terceira fonte para nenhum tenant. Criar um nível
 * "alta" que exigisse três seria inventar um degrau que ninguém alcança — a
 * mesma armadilha do pré-requisito impossível que já tornou o mapeamento
 * inalcançável num cliente inteiro. Quando uma terceira fonte existir, ela entra
 * aqui e o nível passa a ser atingível de verdade.
 */
function sustentacaoDe(descritores: EvolucaoDescritorLinha[]): 'alta' | 'media' | 'baixa' {
  const comEvidencia = descritores.filter((d) => !!d.evidencia).length;
  if (!descritores.length) return 'baixa';
  return comEvidencia >= Math.ceil(descritores.length / 2) ? 'media' : 'baixa';
}

function agregar(chave: string, competencia: string | null, linhas: EvolucaoDescritorLinha[]): EvolucaoAgregado {
  const mediaPre = media(linhas.map((l) => l.notaPre));
  const mediaPos = media(linhas.map((l) => l.notaPos));
  return {
    chave,
    competencia,
    n: new Set(linhas.map((l) => l.colaboradorId)).size,
    mediaPre,
    mediaPos,
    delta: Number((mediaPos - mediaPre).toFixed(2)),
    nivelPre: nivelDaNota(mediaPre),
    nivelPos: nivelDaNota(mediaPos),
    confirmadas: linhas.filter((l) => l.convergencia === CONVERGENCIA.CONFIRMADA).length,
    parciais: linhas.filter((l) => l.convergencia === CONVERGENCIA.PARCIAL).length,
    estaveis: linhas.filter((l) => l.convergencia === CONVERGENCIA.ESTAVEL).length,
    atencao: linhas.filter((l) => l.convergencia === CONVERGENCIA.ATENCAO).length,
    semVeredito: linhas.filter((l) => !l.convergencia).length,
  };
}

/**
 * O veredito da PESSOA a partir dos descritores dela. Não é média de rótulo: é
 * a pior classificação que ainda descreve o conjunto, com prioridade para o que
 * exige ação. Alguém com três confirmadas e uma em atenção não é "confirmada" —
 * a que precisa de apoio é a informação acionável.
 */
function vereditoDaPessoa(descritores: EvolucaoDescritorLinha[]): EvolucaoVeredito {
  const vereditos = descritores.map((d) => d.convergencia).filter(Boolean) as Convergencia[];
  if (!vereditos.length) return null;
  if (vereditos.includes(CONVERGENCIA.ATENCAO)) return CONVERGENCIA.ATENCAO;
  if (vereditos.some((v) => v === CONVERGENCIA.CONFIRMADA)) {
    const confirmadas = vereditos.filter((v) => v === CONVERGENCIA.CONFIRMADA).length;
    return confirmadas >= vereditos.length / 2 ? CONVERGENCIA.CONFIRMADA : CONVERGENCIA.PARCIAL;
  }
  if (vereditos.includes(CONVERGENCIA.PARCIAL)) return CONVERGENCIA.PARCIAL;
  return CONVERGENCIA.ESTAVEL;
}

export type TrilhaConcluida = {
  colaborador_id: string;
  competencia_foco: string | null;
  evolution_report: any;
  evolution_generated_at: string | null;
};

export type ParticipanteEvolucao = {
  id: string;
  nome_completo: string | null;
  cargo: string | null;
  area_depto: string | null;
};

/**
 * NÚCLEO PURO — recebe o que já foi lido do banco e devolve o painel. Separado
 * da leitura para poder ser exercitado sem Supabase, inclusive nos casos que
 * importam: relatório de piloto no meio, descritor sem veredito, pessoa cuja
 * trilha concluiu mas que não está mais na lista de participantes.
 */
export function agregarEvolucao(
  trilhas: TrilhaConcluida[],
  participantes: ParticipanteEvolucao[],
  totalEmJornada: number,
): EvolucaoCentro {
  const porId = new Map(participantes.map((p) => [p.id, p]));

  const pessoas: EvolucaoPessoa[] = [];
  const todasLinhas: EvolucaoDescritorLinha[] = [];

  for (const trilha of trilhas) {
    const report = trilha.evolution_report;
    if (!report || !Array.isArray(report.descritores) || report.descritores.length === 0) continue;
    // Piloto não mede evolução (ver o cabeçalho). Ele grava `baseline`, e não
    // `nota_pre`: entrar aqui viraria delta sobre campo ausente.
    if (report.modo === 'piloto') continue;

    const linhas: EvolucaoDescritorLinha[] = report.descritores.map((d: any) => {
      const notaPre = Number(d.nota_pre ?? 0);
      const notaPos = Number(d.nota_pos ?? notaPre);
      return {
        colaboradorId: trilha.colaborador_id,
        competencia: d.competencia || trilha.competencia_foco || 'Competência',
        descritor: d.descritor || 'Descritor',
        notaPre,
        notaPos,
        convergencia: (d.convergencia as Convergencia) || null,
        // `depois` é o relato da pessoa; a justificativa é a leitura do
        // avaliador. Os dois servem à conversa, e o relato vem primeiro
        // porque é a evidência que o gestor consegue confirmar.
        evidencia: d.depois || d.justificativa_cenario || null,
      };
    });

    const pessoa = porId.get(trilha.colaborador_id);
    const mediaPre = media(linhas.map((l) => l.notaPre));
    const mediaPos = media(linhas.map((l) => l.notaPos));
    const veredito = vereditoDaPessoa(linhas);

    pessoas.push({
      colaboradorId: trilha.colaborador_id,
      // Pessoa fora da lista de participantes (desligada, ou fora do recorte de
      // turma) ainda tem jornada concluída: some do nome, não do número.
      nome: pessoa?.nome_completo || 'Participante',
      cargo: pessoa?.cargo || null,
      area: pessoa?.area_depto || null,
      competencia: trilha.competencia_foco || linhas[0]?.competencia || null,
      n: linhas.length,
      mediaPre,
      mediaPos,
      delta: Number((mediaPos - mediaPre).toFixed(2)),
      veredito,
      vereditoRotulo: rotuloConvergencia(veredito),
      sustentacao: sustentacaoDe(linhas),
      insight: report.insight_geral || null,
      proximoPasso: report.proximo_passo || null,
      concluidoEm: trilha.evolution_generated_at || null,
      descritores: linhas,
    });
    todasLinhas.push(...linhas);
  }

  if (!pessoas.length) {
    return { ...VAZIO, cobertura: { participantes: participantes.length, emJornada: totalEmJornada, medidos: 0, percentual: 0 } };
  }

  const agruparPor = (chaveDe: (l: EvolucaoDescritorLinha) => string, compDe: (l: EvolucaoDescritorLinha) => string | null) => {
    const grupos = new Map<string, EvolucaoDescritorLinha[]>();
    for (const linha of todasLinhas) {
      const chave = chaveDe(linha);
      grupos.set(chave, [...(grupos.get(chave) || []), linha]);
    }
    return [...grupos.entries()]
      .map(([chave, linhas]) => agregar(chave, compDe(linhas[0]), linhas))
      .sort((a, b) => b.delta - a.delta);
  };

  const porCompetencia = agruparPor((l) => l.competencia, () => null);
  const porDescritor = agruparPor((l) => l.descritor, (l) => l.competencia);

  const precisamApoio = pessoas
    .filter((p) => p.veredito === CONVERGENCIA.ATENCAO || p.veredito === CONVERGENCIA.ESTAVEL || p.veredito === null)
    .sort((a, b) => a.delta - b.delta);

  return {
    cobertura: {
      participantes: participantes.length,
      emJornada: totalEmJornada,
      medidos: pessoas.length,
      percentual: participantes.length ? Math.round((pessoas.length / participantes.length) * 100) : 0,
    },
    resumo: {
      confirmadas: pessoas.filter((p) => p.veredito === CONVERGENCIA.CONFIRMADA).length,
      parciais: pessoas.filter((p) => p.veredito === CONVERGENCIA.PARCIAL).length,
      estaveis: pessoas.filter((p) => p.veredito === CONVERGENCIA.ESTAVEL).length,
      atencao: pessoas.filter((p) => p.veredito === CONVERGENCIA.ATENCAO).length,
      semVeredito: pessoas.filter((p) => p.veredito === null).length,
      deltaMedio: media(pessoas.map((p) => p.delta)),
      descritoresMedidos: todasLinhas.length,
    },
    porCompetencia,
    porDescritor,
    pessoas: pessoas.sort((a, b) => b.delta - a.delta),
    proximasAcoes: {
      precisamApoio,
      // Os três em que o grupo menos avançou. `slice` do fim da lista ordenada
      // por delta decrescente, e não um filtro por corte fixo: com todo mundo
      // indo bem, o corte devolveria lista vazia e a tela não teria o que
      // recomendar para o próximo ciclo.
      proximoCiclo: [...porDescritor].reverse().slice(0, 3),
    },
    indisponivel: false,
  };
}

/**
 * Leitura + agregação. `colaboradorIds` vem do recorte de turma da central.
 */
export async function carregarEvolucaoRH(
  empresaId: string,
  opts?: { colaboradorIds?: string[] | null },
): Promise<EvolucaoCentro> {
  const tdb = tenantDb(empresaId);
  const ids = opts?.colaboradorIds || null;

  const recortar = <T>(query: T, coluna: string): T =>
    ids ? ((query as any).in(coluna, ids) as T) : query;

  const [trilhasRes, participantesRes, emJornadaRes] = await Promise.all([
    recortar(
      tdb.from('trilhas')
        .select('colaborador_id, competencia_foco, evolution_report, evolution_generated_at')
        .eq('status', TRILHA.CONCLUIDA)
        .not('evolution_report', 'is', null)
        .order('evolution_generated_at', { ascending: false }),
      'colaborador_id',
    ),
    recortar(
      tdb.from('colaboradores').select('id, nome_completo, cargo, area_depto').neq('role', 'rh'),
      'id',
    ),
    recortar(
      tdb.from('trilhas').select('colaborador_id').eq('status', TRILHA.ATIVA),
      'colaborador_id',
    ),
  ]);

  // O supabase-js RETORNA `{ error }`. Sem checar, uma falha de leitura vira
  // "ninguém evoluiu" — que é exatamente a conclusão errada mais cara desta
  // tela, porque ela parece um resultado do programa e não uma falha nossa.
  const erro = trilhasRes.error || participantesRes.error || emJornadaRes.error;
  if (erro) {
    console.error('[evolucao-rh] leitura falhou:', erro.message);
    return { ...VAZIO, indisponivel: true };
  }

  const emJornada = new Set((emJornadaRes.data || []).map((t: any) => t.colaborador_id)).size;
  return agregarEvolucao(
    (trilhasRes.data || []) as TrilhaConcluida[],
    (participantesRes.data || []) as ParticipanteEvolucao[],
    emJornada,
  );
}
