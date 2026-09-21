import { tenantDb } from '@/lib/tenant-db';
import { TRILHA } from '@/lib/status';
import { CONVERGENCIA, rotuloConvergencia, type Convergencia } from '@/lib/season-engine/convergencia';
import { nivelDaNota } from '@/lib/nivel-regua';
import { fechoDoRelatorio } from '@/lib/season-engine/resumo-avaliacao';
import { descritorParaHumano } from '@/lib/descritor-humano';

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

export type EvolucaoRecorteCargo = {
  cargo: string;
  /** Pessoas distintas com fechamento neste cargo. */
  pessoasMedidas: number;
  porCompetencia: EvolucaoAgregado[];
  porDescritor: EvolucaoAgregado[];
  pessoas: EvolucaoPessoa[];
  proximasAcoes: {
    precisamApoio: EvolucaoPessoa[];
    proximoCiclo: EvolucaoAgregado[];
  };
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
    /** Leituras por pessoa e competência. Uma pessoa em duas competências conta duas vezes. */
    confirmadas: number;
    parciais: number;
    estaveis: number;
    semVeredito: number;
    deltaMedio: number;
    descritoresMedidos: number;
  };
  porCompetencia: EvolucaoAgregado[];
  porDescritor: EvolucaoAgregado[];
  /** Recortes completos e independentes; nenhuma média atravessa cargos. */
  porCargo: EvolucaoRecorteCargo[];
  pessoas: EvolucaoPessoa[];
  proximasAcoes: {
    /** Leituras de pessoa + competência que terminaram sem evolução confirmada. */
    precisamApoio: EvolucaoPessoa[];
    /** Competências em que o grupo menos avançou — candidatas ao próximo ciclo. */
    proximoCiclo: EvolucaoAgregado[];
  };
  indisponivel: boolean;
};

const VAZIO: EvolucaoCentro = {
  cobertura: { participantes: 0, emJornada: 0, medidos: 0, percentual: 0 },
  resumo: { confirmadas: 0, parciais: 0, estaveis: 0, semVeredito: 0, deltaMedio: 0, descritoresMedidos: 0 },
  porCompetencia: [],
  porDescritor: [],
  porCargo: [],
  pessoas: [],
  proximasAcoes: { precisamApoio: [], proximoCiclo: [] },
  indisponivel: false,
};

function media(valores: number[]): number {
  if (!valores.length) return 0;
  return Number((valores.reduce((total, v) => total + v, 0) / valores.length).toFixed(2));
}

/**
 * O avanço é sempre a diferença entre as duas médias que aparecem no
 * relatório. Calcular depois do arredondamento impede combinações como
 * "1,52 para 1,72" acompanhadas de um valor diferente de +0,20.
 */
function avancoEntreMedias(mediaPre: number, mediaPos: number): number {
  return Number(Math.max(0, mediaPos - mediaPre).toFixed(2));
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
  const nivelPre = nivelDaNota(mediaPre);
  return {
    chave,
    competencia,
    n: new Set(linhas.map((l) => l.colaboradorId)).size,
    mediaPre,
    mediaPos,
    delta: avancoEntreMedias(mediaPre, mediaPos),
    nivelPre,
    // A régua não afirma regressão: uma oscilação da nota final não rebaixa o
    // nível já alcançado. É a mesma regra do relatório individual.
    nivelPos: Math.max(nivelPre, nivelDaNota(mediaPos)),
    confirmadas: linhas.filter((l) => l.convergencia === CONVERGENCIA.CONFIRMADA).length,
    parciais: linhas.filter((l) => l.convergencia === CONVERGENCIA.PARCIAL).length,
    estaveis: linhas.filter((l) => l.convergencia === CONVERGENCIA.ESTAVEL).length,
    semVeredito: linhas.filter((l) => !l.convergencia).length,
  };
}

/**
 * O veredito da PESSOA a partir dos descritores dela. Não é média de rótulo: a
 * confirmação exige que a MAIORIA dos comportamentos medidos a sustente. Quem
 * avançou em um de quatro entra como parcial, porque é isso que aconteceu.
 */
function vereditoDaPessoa(descritores: EvolucaoDescritorLinha[]): EvolucaoVeredito {
  const vereditos = descritores.map((d) => d.convergencia).filter(Boolean) as Convergencia[];
  if (!vereditos.length) return null;
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

    const linhasDaTrilha: EvolucaoDescritorLinha[] = report.descritores.map((d: any) => {
      const notaPre = Number(d.nota_pre ?? 0);
      const notaPosInformada = Number(d.nota_pos ?? notaPre);
      // A régua registra o nível conquistado: uma medição posterior menor
      // mantém a nota anterior e produz avanço zero em toda projeção do dado.
      const notaPos = Math.max(notaPre, notaPosInformada);
      return {
        colaboradorId: trilha.colaborador_id,
        competencia: d.competencia || trilha.competencia_foco || 'Competência',
        // Este centro é uma projeção de leitura: o código interno segue intacto
        // no evolution_report, mas não vaza para tela ou PDF executivo.
        descritor: descritorParaHumano(d.descritor || 'Descritor'),
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
    const fecho = fechoDoRelatorio(report);
    const linhasPorCompetencia = new Map<string, EvolucaoDescritorLinha[]>();
    for (const linha of linhasDaTrilha) {
      linhasPorCompetencia.set(linha.competencia, [...(linhasPorCompetencia.get(linha.competencia) || []), linha]);
    }

    // Uma linha nominal representa UMA competência. A trilha DUO traz duas no
    // mesmo evolution_report; mediá-las apagava qual competência de fato mudou.
    for (const [competencia, linhas] of linhasPorCompetencia) {
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
        competencia,
        n: linhas.length,
        mediaPre,
        mediaPos,
        delta: avancoEntreMedias(mediaPre, mediaPos),
        veredito,
        vereditoRotulo: rotuloConvergencia(veredito),
        sustentacao: sustentacaoDe(linhas),
        // O fecho pela régua única: texto novo do fechamento quando existe,
        // `insight_geral`/`proximo_passo` nos relatórios anteriores a 17/09/2026.
        insight: fecho.mensagemFinal,
        proximoPasso: fecho.proximosPassos.join(' ') || null,
        concluidoEm: trilha.evolution_generated_at || null,
        descritores: linhas,
      });
    }
    todasLinhas.push(...linhasDaTrilha);
  }

  if (!pessoas.length) {
    return { ...VAZIO, cobertura: { participantes: participantes.length, emJornada: totalEmJornada, medidos: 0, percentual: 0 } };
  }

  /**
   * `chaveDe` é a chave de AGRUPAMENTO e `rotuloDe` é o que aparece na tela.
   * Elas são diferentes de propósito no caso do descritor.
   *
   * 🔴 O DESCRITOR NÃO É ÚNICO ENTRE COMPETÊNCIAS. Numa régua onde os mesmos
   * comportamentos ("Comunicação com stakeholders", "Execução com método") se
   * repetem em várias competências — que é o caso da régua padrão —, agrupar só
   * pelo nome funde linhas de competências diferentes num grupo só. O efeito é
   * duplo e passa despercebido: a média sai de uma mistura que ninguém pediu, e
   * o grupo herda a competência da PRIMEIRA linha, então todos os
   * comportamentos ficam pendurados numa competência e as outras aparecem sem
   * nenhum. Foi assim que a tela mostrou uma única competência expansível.
   */
  const agruparPor = (
    fonte: EvolucaoDescritorLinha[],
    chaveDe: (l: EvolucaoDescritorLinha) => string,
    rotuloDe: (l: EvolucaoDescritorLinha) => string,
    compDe: (l: EvolucaoDescritorLinha) => string | null,
  ) => {
    const grupos = new Map<string, EvolucaoDescritorLinha[]>();
    for (const linha of fonte) {
      const chave = chaveDe(linha);
      grupos.set(chave, [...(grupos.get(chave) || []), linha]);
    }
    return [...grupos.values()]
      .map((linhas) => agregar(rotuloDe(linhas[0]), compDe(linhas[0]), linhas))
      .sort((a, b) => b.delta - a.delta);
  };

  const porCompetencia = agruparPor(todasLinhas, (l) => l.competencia, (l) => l.competencia, () => null);
  const porDescritor = agruparPor(
    todasLinhas,
    (l) => [l.competencia, l.descritor].join(' :: '),
    (l) => l.descritor,
    (l) => l.competencia,
  );

  const precisamApoio = pessoas
    .filter((p) => p.veredito === CONVERGENCIA.ESTAVEL || p.veredito === null)
    .sort((a, b) => a.delta - b.delta);

  const rotuloCargo = (cargo: string | null) => cargo?.trim() || 'Cargo não informado';
  const cargos = [...new Set(pessoas.map((p) => rotuloCargo(p.cargo)))]
    .sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const porCargo: EvolucaoRecorteCargo[] = cargos.map((cargo) => {
    const pessoasDoCargo = pessoas.filter((p) => rotuloCargo(p.cargo) === cargo);
    const idsDoCargo = new Set(pessoasDoCargo.map((p) => p.colaboradorId));
    const linhasDoCargo = todasLinhas.filter((linha) => idsDoCargo.has(linha.colaboradorId));
    const competenciasDoCargo = agruparPor(
      linhasDoCargo,
      (l) => l.competencia,
      (l) => l.competencia,
      () => null,
    );
    const descritoresDoCargo = agruparPor(
      linhasDoCargo,
      (l) => [l.competencia, l.descritor].join(' :: '),
      (l) => l.descritor,
      (l) => l.competencia,
    );
    return {
      cargo,
      pessoasMedidas: idsDoCargo.size,
      porCompetencia: competenciasDoCargo,
      porDescritor: descritoresDoCargo,
      pessoas: [...pessoasDoCargo].sort((a, b) => b.delta - a.delta),
      proximasAcoes: {
        precisamApoio: pessoasDoCargo
          .filter((p) => p.veredito === CONVERGENCIA.ESTAVEL || p.veredito === null)
          .sort((a, b) => a.delta - b.delta),
        proximoCiclo: [...competenciasDoCargo].reverse().slice(0, 3),
      },
    };
  });

  const pessoasMedidas = new Set(pessoas.map((p) => p.colaboradorId)).size;

  return {
    cobertura: {
      participantes: participantes.length,
      emJornada: totalEmJornada,
      medidos: pessoasMedidas,
      percentual: participantes.length ? Math.round((pessoasMedidas / participantes.length) * 100) : 0,
    },
    resumo: {
      confirmadas: pessoas.filter((p) => p.veredito === CONVERGENCIA.CONFIRMADA).length,
      parciais: pessoas.filter((p) => p.veredito === CONVERGENCIA.PARCIAL).length,
      estaveis: pessoas.filter((p) => p.veredito === CONVERGENCIA.ESTAVEL).length,
      semVeredito: pessoas.filter((p) => p.veredito === null).length,
      deltaMedio: media(pessoas.map((p) => p.delta)),
      descritoresMedidos: todasLinhas.length,
    },
    porCompetencia,
    porDescritor,
    porCargo,
    pessoas: pessoas.sort((a, b) => b.delta - a.delta),
    proximasAcoes: {
      precisamApoio,
      // Jornada é de competência, não de descritor: o próximo ciclo escolhe
      // entre competências. O comportamento continua como diagnóstico para
      // orientar a abordagem dentro da competência escolhida.
      proximoCiclo: [...porCompetencia].reverse().slice(0, 3),
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
