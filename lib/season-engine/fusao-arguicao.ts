/**
 * FUSÃO da arguição na nota do fechamento (Fase B).
 *
 * Princípio (correção de design do usuário): o `±0,5` é regra de CÓDIGO, não
 * instrução de IA. Aqui vai além — o `ajuste_arguicao` NÃO vem de uma IA nova;
 * é DERIVADO da classificação que a extração da arguição (Fase A) já produziu
 * (`sustentou` × `forca`) por um mapa determinístico. A IA interpreta a defesa
 * (na extração, com citação); o código decide o impacto na nota. Auditável,
 * sem custo de IA, rastreável.
 *
 * Ordem no fechamento: scorer → FUSÃO (aqui) → trava piloto. A trava incide
 * sobre a nota FUNDIDA. Sem extração de arguição, é no-op (nota do cenário
 * intacta).
 */

import type { ArguicaoExtracao } from './arguicao';
import { classificacaoDoDelta, rubricaDaNota } from './prompts/evolution-scenario';

/**
 * Mapa `sustentou × forca → ajuste`. Todos os valores já vivem dentro de
 * [-0.5, +0.5]; o clamp final é a salvaguarda (se o mapa mudar, o bound fica).
 *   confirmou  = a defesa bateu com o escrito → sem mudança
 *   aprofundou = revelou profundidade que o texto não capturou → sobe
 *   fragilizou = não sustentou sob sondagem → desce
 *   sem_sinal  = a arguição não tocou o descritor → sem mudança
 */
export const AJUSTE_POR_SUSTENTACAO: Record<string, Record<string, number>> = {
  confirmou: { fraca: 0, moderada: 0, forte: 0 },
  aprofundou: { fraca: 0.2, moderada: 0.35, forte: 0.5 },
  fragilizou: { fraca: -0.2, moderada: -0.35, forte: -0.5 },
  sem_sinal: { fraca: 0, moderada: 0, forte: 0 },
};

export const LIMITE_AJUSTE = 0.5;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
/**
 * Uma casa decimal, meio para cima, SEM ruído de ponto flutuante (18/09/2026).
 * Todo ajuste de ±0,35 cai exatamente em x,x5, e o `Math.round(v * 10)` direto
 * decidia pelo ruído binário: `Medido:` 2,6 + 0,35 virava 3,0 e 3,3 − 0,35 virava
 * 2,9, o MESMO 2,95 para lados opostos, e o auditor apontou a inconsistência.
 * O `toFixed(10)` limpa o ruído antes de arredondar.
 */
const round1 = (v: number) => Math.round(Number(v.toFixed(10)) * 10) / 10;
const norm = (s: any) => String(s || '').trim().toLowerCase();

export interface FusaoResultado {
  parsed: any;
  /** Quantos descritores tiveram ajuste != 0 (para meta/auditoria). */
  ajustados: number;
}

/**
 * Aplica a arguição sobre a avaliação do scorer. Para cada descritor:
 *   nota_base_cenario = nota_pos (do scorer, já triangulada cenário+acumulada)
 *   ajuste_arguicao   = clamp(mapa[sustentou][forca], -0.5, +0.5)
 *   nota_pos (novo)   = clamp(base + ajuste, 1, 4)
 * Recalcula nota_media_pos e delta_medio. Sem extração → devolve intacto.
 */
export function fundirArguicao(parsed: any, extracao: ArguicaoExtracao | null | undefined): FusaoResultado {
  if (!parsed || !Array.isArray(parsed.avaliacao_por_descritor) || !extracao?.evidencias_por_descritor?.length) {
    return { parsed, ajustados: 0 };
  }

  // Índice das evidências da arguição por nome de descritor (normalizado).
  // A extração deve emitir 1 entrada por descritor; se emitir DUPLICATAS
  // conflitantes (visto no E2E), NÃO deixa a ordem decidir o ajuste — mantém a
  // mais CONSERVADORA (menor |ajuste|), pra um sinal contraditório não inflar
  // nem afundar a nota por sorte de ordenação.
  const magnitude = (ev: any) => Math.abs(AJUSTE_POR_SUSTENTACAO[norm(ev?.sustentou)]?.[norm(ev?.forca)] ?? 0);
  const evPorDescritor = new Map<string, any>();
  for (const ev of extracao.evidencias_por_descritor) {
    if (!ev?.descritor) continue;
    const chave = norm(ev.descritor);
    const atual = evPorDescritor.get(chave);
    if (!atual || magnitude(ev) < magnitude(atual)) evPorDescritor.set(chave, ev);
  }

  let ajustados = 0;
  parsed.avaliacao_por_descritor = parsed.avaliacao_por_descritor.map((d: any) => {
    const base = typeof d.nota_pos === 'number' ? d.nota_pos : null;
    const ev = evPorDescritor.get(norm(d.descritor));
    if (base == null || !ev) {
      // Sem base numérica ou sem sinal da arguição → sem modulação.
      return { ...d, nota_base_cenario: base, ajuste_arguicao: 0, sustentacao_arguicao: ev?.sustentou ?? 'sem_sinal' };
    }
    const bruto = AJUSTE_POR_SUSTENTACAO[norm(ev.sustentou)]?.[norm(ev.forca)] ?? 0;
    const ajuste = clamp(bruto, -LIMITE_AJUSTE, LIMITE_AJUSTE);
    const notaFinal = round1(clamp(base + ajuste, 1, 4));
    if (ajuste !== 0) ajustados++;
    const nota_pre = typeof d.nota_pre === 'number' ? d.nota_pre : null;
    const delta = nota_pre != null ? round1(notaFinal - nota_pre) : d.delta;
    return {
      ...d,
      nota_base_cenario: base,
      ajuste_arguicao: ajuste,
      sustentacao_arguicao: ev.sustentou,
      forca_arguicao: ev.forca ?? null,
      nota_pos: notaFinal,
      delta,
      // Classificação e nível do scorer foram calculados sobre a nota ANTES do
      // ajuste. Mantê-los seria a mesma contradição que a redação final corrige
      // no texto, só que em campos: "evoluiu" ao lado de um delta que já não
      // evolui, "em_desenvolvimento" ao lado de 3,0.
      ...(ajuste !== 0 && typeof delta === 'number' ? { classificacao: classificacaoDoDelta(delta) } : {}),
      ...(ajuste !== 0 ? { nivel_rubrica: rubricaDaNota(notaFinal) } : {}),
    };
  });

  // Recalcula as médias que dependem de nota_pos.
  const posVals = parsed.avaliacao_por_descritor.map((d: any) => d.nota_pos).filter((v: any) => typeof v === 'number');
  if (posVals.length) {
    parsed.nota_media_pos = round1(posVals.reduce((a: number, b: number) => a + b, 0) / posVals.length);
    if (typeof parsed.nota_media_pre === 'number') {
      parsed.delta_medio = round1(parsed.nota_media_pos - parsed.nota_media_pre);
    }
  }

  return { parsed, ajustados };
}

const decimal = (v: number) => v.toFixed(Math.round(v * 100) % 10 === 0 ? 1 : 2).replace('.', ',');
const comSinal = (v: number) => `${v > 0 ? '+' : '-'}${decimal(Math.abs(v))}`;

/**
 * Anota, na justificativa de cada descritor que a arguição ajustou, o ajuste e
 * a nota final (18/09/2026).
 *
 * A justificativa é escrita pelo scorer para a nota DELE e costuma citar essa
 * nota. Depois da fusão, a tela do admin e a visão do RH mostravam essa frase ao
 * lado de outra nota final, sem explicar a diferença. `Medido:` no ensaio da
 * Jornada, "Nota_pos em 3.3, o mais alto do conjunto" ao lado de 2,9.
 *
 * Determinística, sem IA: o texto do scorer fica intacto e ganha uma linha que
 * explica a diferença. Descritor sem ajuste não muda. Roda DEPOIS da trava do
 * piloto, para citar a nota que de fato vai para a tela.
 */
export function anotarAjusteArguicao(parsed: any): any {
  if (!parsed || !Array.isArray(parsed.avaliacao_por_descritor)) return parsed;
  return {
    ...parsed,
    avaliacao_por_descritor: parsed.avaliacao_por_descritor.map((d: any) => {
      const ajuste = typeof d.ajuste_arguicao === 'number' ? d.ajuste_arguicao : 0;
      if (ajuste === 0 || typeof d.nota_base_cenario !== 'number' || typeof d.nota_pos !== 'number') return d;
      const fundida = round1(clamp(d.nota_base_cenario + ajuste, 1, 4));
      const forca = d.forca_arguicao ? ` (${d.forca_arguicao})` : '';
      let linha = `Defesa oral: ${d.sustentacao_arguicao}${forca}. Ajuste de ${comSinal(ajuste)} sobre a nota antes da defesa (${decimal(d.nota_base_cenario)} → ${decimal(fundida)}); o texto acima trata da nota antes da defesa.`;
      if (d.piso_aplicado && d.nota_pos !== fundida) linha += ` Piso do piloto: nota exibida ${decimal(d.nota_pos)}.`;
      const texto = typeof d.justificativa === 'string' ? d.justificativa.trim() : '';
      return { ...d, justificativa: texto ? `${texto}\n\n${linha}` : linha };
    }),
  };
}
