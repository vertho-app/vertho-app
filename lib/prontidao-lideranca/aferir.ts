/**
 * AFERIÇÃO DO INSTRUMENTO (test-retest) — quanto a nota muda quando a MESMA
 * resposta é reavaliada com entrada idêntica. Puro: recebe as avaliações
 * repetidas; quem chama (script) é quem paga a IA.
 *
 * Por que existe: o mapeamento por cenários nunca foi aferido assim. O único
 * test-retest desta base é o do AUDITOR (5 respostas × 3 rodadas, 12/08/2026),
 * e `RUIDO_MEDIDO` (dp 0,07 · amplitude 0,33) é do extrator de CONVERSA da
 * semana 13 — outro instrumento. Sem este número, "calibragem para aumentar a
 * consistência" é promessa sem denominador, e a `banda` da matriz é emprestada.
 *
 * O formato de saída espelha `RUIDO_MEDIDO` de propósito, para os dois números
 * serem comparáveis lado a lado no relatório.
 */
import { nivelDaNota, type Nivel } from '@/lib/nivel-regua';
import { chaveDescritor } from '@/lib/descritores';

export interface AvaliacaoRepetida {
  respostaId: string;
  rodada: number;
  /** descritor → nota decimal (1–4), como a IA4 devolve em `avaliacao_por_descritor`. */
  notasPorDescritor: Record<string, number>;
}

export interface ParAferido {
  respostaId: string;
  descritor: string;
  notas: number[];
  dp: number;
  amplitude: number;
  niveis: Nivel[];
  nivelInstavel: boolean;
}

export interface RespostaAferida {
  respostaId: string;
  repeticoes: number;
  /** Média da resposta (sobre os descritores) em cada repetição. */
  medias: number[];
  dpDaMedia: number;
  amplitudeDaMedia: number;
}

export interface Afericao {
  respostas: number;
  repeticoes: number;
  pares: number;
  /** Média, sobre os pares, do dp da nota de um descritor entre releituras. */
  dpPorDescritor: number;
  /** Média, sobre as respostas, do dp da MÉDIA da resposta entre releituras. */
  dpPorResposta: number;
  /** Maior amplitude da média de uma resposta entre releituras. */
  amplitudeMaximaPorResposta: number;
  paresComNivelInstavel: number;
  /**
   * Banda sugerida para a matriz = a amplitude máxima da média (o pior caso
   * observado). Conservador de propósito: a banda existe para NÃO classificar
   * por máquina o que a releitura sozinha consegue mover.
   */
  bandaSugerida: number;
  detalhePares: ParAferido[];
  detalheRespostas: RespostaAferida[];
}

const arred = (v: number, casas = 3) => { const f = 10 ** casas; return Math.round(v * f) / f; };
const media = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
/** Desvio-padrão AMOSTRAL (n − 1): K releituras são uma amostra do que o modelo pode devolver. */
const dpAmostral = (xs: number[]) => {
  if (xs.length < 2) return 0;
  const m = media(xs);
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
};
const amplitude = (xs: number[]) => (xs.length ? Math.max(...xs) - Math.min(...xs) : 0);

export function aferir(avaliacoes: AvaliacaoRepetida[]): Afericao {
  // resposta → descritor(chave) → [{rodada, nota}]
  const porResposta = new Map<string, Map<string, { rodada: number; nota: number }[]>>();
  const rotulo = new Map<string, string>();
  for (const av of avaliacoes) {
    const descs = porResposta.get(av.respostaId) || new Map<string, { rodada: number; nota: number }[]>();
    for (const [descritor, notaRaw] of Object.entries(av.notasPorDescritor || {})) {
      const nota = Number(notaRaw);
      if (!Number.isFinite(nota)) continue;
      const chave = chaveDescritor(descritor) || descritor;
      if (!rotulo.has(chave)) rotulo.set(chave, descritor);
      const arr = descs.get(chave) || [];
      arr.push({ rodada: av.rodada, nota });
      descs.set(chave, arr);
    }
    porResposta.set(av.respostaId, descs);
  }

  const detalhePares: ParAferido[] = [];
  const detalheRespostas: RespostaAferida[] = [];
  let repeticoesMax = 0;

  for (const [respostaId, descs] of porResposta) {
    // Só descritores presentes em TODAS as rodadas da resposta entram no par:
    // um descritor que o modelo omitiu numa rodada não mede ruído, mede omissão.
    const rodadas = new Set<number>();
    for (const arr of descs.values()) for (const r of arr) rodadas.add(r.rodada);
    const k = rodadas.size;
    repeticoesMax = Math.max(repeticoesMax, k);
    if (k < 2) continue;

    const porRodada = new Map<number, number[]>();
    for (const [chave, arr] of descs) {
      const porR = new Map<number, number[]>();
      for (const r of arr) porR.set(r.rodada, [...(porR.get(r.rodada) || []), r.nota]);
      if (porR.size !== k) continue;
      const notas = [...rodadas].sort((a, b) => a - b).map((r) => media(porR.get(r)!));
      const niveis = notas.map(nivelDaNota);
      detalhePares.push({
        respostaId, descritor: rotulo.get(chave) || chave,
        notas: notas.map((n) => arred(n, 2)),
        dp: arred(dpAmostral(notas)), amplitude: arred(amplitude(notas), 2),
        niveis, nivelInstavel: new Set(niveis).size > 1,
      });
      for (const r of rodadas) porRodada.set(r, [...(porRodada.get(r) || []), media(porR.get(r)!)]);
    }
    const medias = [...rodadas].sort((a, b) => a - b).map((r) => media(porRodada.get(r) || []));
    if (medias.some((m) => !Number.isFinite(m)) || !porRodada.size) continue;
    detalheRespostas.push({
      respostaId, repeticoes: k,
      medias: medias.map((m) => arred(m, 2)),
      dpDaMedia: arred(dpAmostral(medias)), amplitudeDaMedia: arred(amplitude(medias), 2),
    });
  }

  const amplitudeMax = detalheRespostas.length ? Math.max(...detalheRespostas.map((r) => r.amplitudeDaMedia)) : 0;
  return {
    respostas: detalheRespostas.length,
    repeticoes: repeticoesMax,
    pares: detalhePares.length,
    dpPorDescritor: arred(media(detalhePares.map((p) => p.dp))),
    dpPorResposta: arred(media(detalheRespostas.map((r) => r.dpDaMedia))),
    amplitudeMaximaPorResposta: arred(amplitudeMax, 2),
    paresComNivelInstavel: detalhePares.filter((p) => p.nivelInstavel).length,
    bandaSugerida: arred(amplitudeMax, 2),
    detalhePares,
    detalheRespostas,
  };
}
