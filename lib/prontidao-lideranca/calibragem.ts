/**
 * CALIBRAGEM COM LÍDERES DE REFERÊNCIA — o instrumento é aferido pelos
 * exemplares, nunca instruído por eles. Puro.
 *
 * O desenho, e por que é este e não o intuitivo:
 *
 * Os 3–5 líderes que a empresa reconhece como padrão respondem o instrumento
 * completo ANTES da turma. A pergunta não é que nota eles tiram — é ONDE o
 * instrumento os coloca. Um exemplar abaixo do corte num descritor que a casa
 * considera o padrão dela é sinal de rubrica mal escrita (N3/N4 daquele
 * descritor), não de pessoa fraca. A saída deste módulo é a lista de descritores
 * a revisar; o conserto é no TEXTO da régua, e depois reavalia.
 *
 * ⚠️ O que NÃO se faz é colocar as respostas dos exemplares como exemplo no
 * prompt do avaliador. Medido nesta base (docs/CUSTO-QUALIDADE.md): o exemplo
 * de um prompt vence a prosa do prompt — um literal usado como ilustração virou
 * 65,8% da base gerada. Exemplares no prompt não calibram a régua; imprimem o
 * vocabulário deles na avaliação de todo mundo.
 */
import { chaveDescritor, stripCodigoDescritor } from '@/lib/descritores';
import { chaveCompetencia } from './config';
import type { NotaDescritor } from './posicao';

export interface ExemplarAbaixo { colaboradorId: string; nome: string | null; nota: number }

export interface DescritorCalibragem {
  competencia: string;
  descritor: string;
  /** Exemplares que têm nota neste descritor. */
  avaliados: number;
  notas: number[];
  media: number | null;
  abaixoDoCorte: ExemplarAbaixo[];
}

export interface Calibragem {
  corte: number;
  exemplares: number;
  /** Exemplares com nota em TODAS as competências do programa. */
  comMapeamentoCompleto: number;
  /** Exemplares sem nenhuma nota ou com competência faltando (id → faltantes). */
  pendentes: { colaboradorId: string; nome: string | null; faltantes: string[] }[];
  /** Descritores em que ao menos um exemplar ficou abaixo do corte, do pior para o melhor. */
  descritoresParaRevisar: DescritorCalibragem[];
  /** Todos os descritores vistos, na ordem das competências do programa. */
  todos: DescritorCalibragem[];
  /** O que limita a leitura (poucos exemplares, exemplares sem nota). */
  avisos: string[];
}

/** Abaixo disto a calibragem descreve um ou dois líderes, não um padrão da casa. */
export const EXEMPLARES_MIN_CALIBRAGEM = 3;

const arred2 = (v: number) => Math.round(v * 100) / 100;

export function calibrarComExemplares(args: {
  notas: NotaDescritor[];
  exemplares: string[];
  competencias: string[];
  corte: number;
  nomes?: Map<string, string> | null;
}): Calibragem {
  const { corte } = args;
  const ids = new Set(args.exemplares);
  const ordem = args.competencias.map((c) => ({ nome: c, chave: chaveCompetencia(c) })).filter((c) => c.chave);
  const posComp = new Map(ordem.map((c, i) => [c.chave, i]));
  const nome = (id: string) => args.nomes?.get(id) ?? null;

  // (competência, descritor) → exemplar → notas
  type Celula = { competencia: string; descritor: string; porExemplar: Map<string, number[]> };
  const celulas = new Map<string, Celula>();
  const cobertura = new Map<string, Set<string>>(); // exemplar → competências cobertas
  for (const n of args.notas) {
    if (!ids.has(n.colaboradorId)) continue;
    const comp = chaveCompetencia(n.competencia);
    if (!posComp.has(comp)) continue;
    const nota = Number(n.nota);
    if (!Number.isFinite(nota)) continue;
    const desc = chaveDescritor(n.descritor) || '(sem descritor)';
    const key = `${comp}|${desc}`;
    const cel = celulas.get(key) || {
      competencia: ordem[posComp.get(comp)!].nome,
      descritor: stripCodigoDescritor(n.descritor) || n.descritor,
      porExemplar: new Map<string, number[]>(),
    };
    const arr = cel.porExemplar.get(n.colaboradorId) || [];
    arr.push(nota);
    cel.porExemplar.set(n.colaboradorId, arr);
    celulas.set(key, cel);
    const cob = cobertura.get(n.colaboradorId) || new Set<string>();
    cob.add(comp);
    cobertura.set(n.colaboradorId, cob);
  }

  const todos: DescritorCalibragem[] = [...celulas.entries()]
    .sort(([a], [b]) => {
      const [ca, da] = a.split('|'); const [cb, db] = b.split('|');
      return (posComp.get(ca)! - posComp.get(cb)!) || da.localeCompare(db, 'pt-BR');
    })
    .map(([, cel]) => {
      const porExemplar = [...cel.porExemplar.entries()].map(([id, arr]) => ({
        colaboradorId: id, nome: nome(id), nota: arred2(arr.reduce((x, y) => x + y, 0) / arr.length),
      }));
      const notas = porExemplar.map((e) => e.nota);
      return {
        competencia: cel.competencia,
        descritor: cel.descritor,
        avaliados: porExemplar.length,
        notas,
        media: notas.length ? arred2(notas.reduce((x, y) => x + y, 0) / notas.length) : null,
        abaixoDoCorte: porExemplar.filter((e) => e.nota < corte).sort((a, b) => a.nota - b.nota),
      };
    });

  const descritoresParaRevisar = todos
    .filter((d) => d.abaixoDoCorte.length > 0)
    .sort((a, b) => (b.abaixoDoCorte.length - a.abaixoDoCorte.length) || ((a.media ?? 9) - (b.media ?? 9)));

  const pendentes = args.exemplares
    .map((id) => {
      const cob = cobertura.get(id) || new Set<string>();
      const faltantes = ordem.filter((c) => !cob.has(c.chave)).map((c) => c.nome);
      return { colaboradorId: id, nome: nome(id), faltantes };
    })
    .filter((p) => p.faltantes.length > 0);

  const comMapeamentoCompleto = args.exemplares.length - pendentes.length;
  const avisos: string[] = [];
  if (args.exemplares.length < EXEMPLARES_MIN_CALIBRAGEM) {
    avisos.push(`Só ${args.exemplares.length} líder(es) de referência: abaixo de ${EXEMPLARES_MIN_CALIBRAGEM} a leitura descreve pessoas, não o padrão da casa.`);
  }
  if (comMapeamentoCompleto < args.exemplares.length) {
    avisos.push(`${args.exemplares.length - comMapeamentoCompleto} exemplar(es) ainda sem mapeamento completo — a lista de revisão está incompleta.`);
  }
  // "Abaixo do corte" aqui é `< corte` de propósito, sem a banda da matriz: a
  // calibragem procura rubrica frouxa, e um líder reconhecido a 2,9 num
  // descritor que a casa chama de padrão já é sinal. A banda protege a PESSOA
  // na classificação; a régua precisa de sinal mais sensível.
  return {
    corte,
    exemplares: args.exemplares.length,
    comMapeamentoCompleto,
    pendentes,
    descritoresParaRevisar,
    todos,
    avisos,
  };
}
