/**
 * Avaliação dos encontros do Simulador de liderança: o que cada encontro mede,
 * que fonte sustenta cada descritor, como uma avaliação é validada e gravada,
 * e como a devolutiva e a síntese da jornada são consolidadas.
 *
 * Núcleo puro (sem I/O): roda no servidor e na tela, com os mesmos números.
 */
import { EPISODIOS } from './episodios';
import {
  consolidarCompetencia,
  mediaGeral,
  REGRA_COBERTURA,
  type CompetenciaConsolidada,
  type MediaGeral,
  type RegraCobertura,
} from '@/lib/simuladores/cobertura';
import { contemCitacao, descarteTolerado } from '@/lib/simuladores/citacao';
import type { LinhaMatriz } from '@/lib/simuladores/lideranca/matriz-global';
import type { Nivel } from '@/lib/nivel-regua';
import type { Avaliacao, AvaliacaoGravada, Episodio } from './schema';

const COMUNICACAO = 'Comunicação e Conversas de Liderança';
const AUTOCONSCIENCIA = 'Autoconsciência e Aprendizagem Contínua';

/** O que a consolidação lê da matriz: nome da competência e códigos. */
export type LinhaMinima = Pick<LinhaMatriz, 'nome' | 'cod_desc' | 'cod_comp'>;

/**
 * Avaliações anteriores à regra de cobertura (jornada v1) mediam os 30
 * descritores sem mínimo. Continuam lidas como foram geradas.
 */
const REGRA_LEGADA: RegraCobertura = { versao: 'legado', minDescritores: 1, minCompetencias: 1 };

/** Competência em foco primeiro, depois as secundárias, por NOME (igual nas duas variantes). */
export function competenciasDoEncontro(indice: number): string[] {
  const e = EPISODIOS[indice];
  return e ? [e.nome, ...e.secundarias] : [];
}

/** Os descritores que o encontro avalia (18 = 3 competências x 6), na ordem da matriz. */
export function linhasDoEncontro<L extends LinhaMinima>(matriz: L[], indice: number): L[] {
  const nomes = competenciasDoEncontro(indice);
  return matriz.filter((d) => nomes.includes(d.nome));
}

export type FonteEvidencia = 'fala' | 'planejamento' | 'reflexao';

/**
 * A preparação só prova o descritor de preparação e propósito da conversa, e a
 * reflexão só prova autoconsciência. Sem isso (até 18/09) qualquer descritor
 * aceitava a preparação como evidência: dava para colar o texto do N4 no plano
 * e pontuar sem demonstrar na conversa.
 */
export function fontesPermitidas(linha: Pick<LinhaMatriz, 'nome' | 'cod_desc'>): FonteEvidencia[] {
  if (linha.nome === COMUNICACAO && /_D1$/.test(linha.cod_desc)) return ['fala', 'planejamento'];
  if (linha.nome === AUTOCONSCIENCIA) return ['fala', 'reflexao'];
  return ['fala'];
}

function citacaoValida(
  prova: Avaliacao['descritores'][number]['evidencias'][number],
  e: Pick<Episodio, 'mensagens' | 'plano' | 'reflexao'>,
  permitidas: FonteEvidencia[],
): boolean {
  if (!permitidas.includes(prova.fonte)) return false;
  const fonte =
    prova.fonte === 'fala'
      ? e.mensagens.find((m) => m.autor === 'lider' && m.turno === prova.turno)?.texto
      : prova.turno !== 0
        ? null
        : prova.fonte === 'planejamento'
          ? e.plano
          : e.reflexao;
  return contemCitacao(fonte, prova.trecho);
}

/**
 * Confere a saída do avaliador contra os descritores do encontro. Estrutura
 * errada (código faltando, repetido, nota sem evidência) LANÇA: o gerador
 * reenvia uma vez. Citação inválida em POUCOS descritores não lança: devolve a
 * lista, e `gravarAvaliacao` rebaixa só esses. Acima do limite, lança.
 */
export function diagnosticarAvaliacao(
  a: Avaliacao,
  e: Pick<Episodio, 'mensagens' | 'plano' | 'reflexao'>,
  linhas: LinhaMatriz[],
): { invalidos: string[] } {
  const porCodigo = new Map(linhas.map((d) => [d.cod_desc, d]));
  if (a.descritores.length !== porCodigo.size) throw new Error('Cobertura inválida');
  const vistos = new Set<string>();
  const invalidos: string[] = [];
  for (const d of a.descritores) {
    const linha = porCodigo.get(d.codigo);
    if (!linha || vistos.has(d.codigo)) throw new Error('Código repetido ou desconhecido');
    vistos.add(d.codigo);
    if ((d.nivel === null) !== (d.evidencias.length === 0))
      throw new Error('Nota sem evidência ou evidência sem nota');
    const permitidas = fontesPermitidas(linha);
    if (!d.evidencias.every((prova) => citacaoValida(prova, e, permitidas))) invalidos.push(d.codigo);
  }
  const avaliados = a.descritores.filter((d) => d.nivel !== null).length;
  if (!descarteTolerado(invalidos.length, avaliados)) throw new Error('Citação não encontrada na fonte');
  return { invalidos };
}

/** A avaliação como fica gravada no encontro: descartes aplicados e regra registrada. */
export function gravarAvaliacao(
  a: Avaliacao,
  e: Pick<Episodio, 'mensagens' | 'plano' | 'reflexao'>,
  linhas: LinhaMatriz[],
): AvaliacaoGravada {
  const { invalidos } = diagnosticarAvaliacao(a, e, linhas);
  return {
    ...structuredClone(a),
    descritores: a.descritores.map((d) =>
      invalidos.includes(d.codigo) ? { ...structuredClone(d), nivel: null, evidencias: [] } : structuredClone(d),
    ),
    descartados: invalidos,
    regraCobertura: REGRA_COBERTURA.versao,
  };
}

export interface CompetenciaDoEncontro extends CompetenciaConsolidada {
  codigo: string;
  nome: string;
  foco: boolean;
  descritores: string[];
}

export interface ResumoEncontro {
  competencias: CompetenciaDoEncontro[];
  media: MediaGeral;
  regra: RegraCobertura;
}

/**
 * Devolutiva de UM encontro. Avaliação nova (com `regraCobertura`) mostra só as
 * competências avaliadas, foco primeiro, com a regra de 4 descritores; a legada
 * (30 descritores, sem mínimo) é lida como foi gerada.
 */
export function resumoAvaliacao(a: AvaliacaoGravada, matriz: LinhaMinima[], indice?: number): ResumoEncontro {
  const nova = !!a.regraCobertura && a.regraCobertura !== 'legado';
  const regra = nova ? REGRA_COBERTURA : REGRA_LEGADA;
  const codigosAvaliados = new Set(a.descritores.map((d) => d.codigo));
  const foco = indice === undefined ? null : EPISODIOS[indice]?.nome ?? null;
  const ordem = nova && indice !== undefined ? competenciasDoEncontro(indice) : EPISODIOS.map((c) => c.nome);
  const competencias = ordem
    .map((nome) => {
      const linhas = matriz.filter((d) => d.nome === nome && codigosAvaliados.has(d.cod_desc));
      const niveis = linhas.map((l) => a.descritores.find((d) => d.codigo === l.cod_desc)?.nivel ?? null);
      return {
        codigo: linhas[0]?.cod_comp ?? matriz.find((d) => d.nome === nome)?.cod_comp ?? nome,
        nome,
        foco: nome === foco,
        descritores: linhas.map((l) => l.cod_desc),
        ...consolidarCompetencia(niveis, regra),
      };
    })
    .filter((c) => c.descritores.length > 0);
  return { competencias, media: mediaGeral(competencias, regra), regra };
}

export interface CompetenciaNaJornada {
  nome: string;
  /** Em quantos encontros concluídos a competência foi avaliada. */
  avaliada: number;
  /** Em quantos teve evidência suficiente para receber nível. */
  comNivel: number;
  primeiroNivel: Nivel | null;
  /** Maior nível demonstrado na jornada (a devolutiva não mostra regressão). */
  nivelAlcancado: Nivel | null;
  notaAlcancada: number | null;
  subiu: boolean;
}

export interface SinteseJornada {
  competencias: CompetenciaNaJornada[];
  media: MediaGeral;
  encontrosConcluidos: number;
  concluida: boolean;
  /** Encontro sugerido para repetir: onde a competência mais fraca é o foco. */
  sugestaoRepetir: number | null;
}

/**
 * Síntese da jornada, a partir de todos os encontros concluídos (originais e
 * repetições), em ordem cronológica. Por competência: o primeiro nível e o
 * MAIOR nível demonstrado, como no restante do produto (nível que cai não é
 * mostrado como queda). A média exige 3 competências com nível.
 */
export function sinteseDaJornada(
  episodios: Array<Pick<Episodio, 'indice' | 'encerradoEm' | 'avaliacao' | 'repeticao'>>,
  matriz: LinhaMinima[],
  encontrosOriginais: number,
): SinteseJornada {
  const ordenados = episodios
    .filter((e) => e.avaliacao && e.encerradoEm)
    .sort((x, y) => Date.parse(x.encerradoEm!) - Date.parse(y.encerradoEm!));
  const nomes = EPISODIOS.map((c) => c.nome);
  const competencias = nomes.map((nome) => {
    let avaliada = 0,
      comNivel = 0;
    let primeiro: Nivel | null = null,
      alcancado: Nivel | null = null,
      notaAlcancada: number | null = null;
    for (const e of ordenados) {
      const r = resumoAvaliacao(e.avaliacao!, matriz, e.indice).competencias.find((c) => c.nome === nome);
      if (!r) continue;
      avaliada += 1;
      if (r.nivel === null || r.nota === null) continue;
      comNivel += 1;
      if (primeiro === null) primeiro = r.nivel;
      if (alcancado === null || r.nivel > alcancado || (r.nivel === alcancado && r.nota > (notaAlcancada ?? 0))) {
        alcancado = r.nivel;
        notaAlcancada = r.nota;
      }
    }
    return {
      nome,
      avaliada,
      comNivel,
      primeiroNivel: primeiro,
      nivelAlcancado: alcancado,
      notaAlcancada,
      subiu: primeiro !== null && alcancado !== null && alcancado > primeiro,
    };
  });
  const media = mediaGeral(competencias.map((c) => ({ nota: c.notaAlcancada })));
  // Repetir onde o foco é a competência com menos evidência (sem nível) ou com o menor nível.
  const fraca = [...competencias]
    .filter((c) => c.avaliada > 0)
    .sort((x, y) => (x.nivelAlcancado ?? 0) - (y.nivelAlcancado ?? 0) || x.comNivel - y.comNivel)[0];
  const sugestaoRepetir =
    encontrosOriginais >= EPISODIOS.length && fraca && (fraca.nivelAlcancado ?? 0) < 3
      ? EPISODIOS.findIndex((e) => e.nome === fraca.nome)
      : null;
  return {
    competencias,
    media,
    encontrosConcluidos: encontrosOriginais,
    concluida: encontrosOriginais >= EPISODIOS.length,
    sugestaoRepetir,
  };
}
