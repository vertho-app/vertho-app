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
const round1 = (v: number) => Math.round(v * 10) / 10;
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
    return {
      ...d,
      nota_base_cenario: base,
      ajuste_arguicao: ajuste,
      sustentacao_arguicao: ev.sustentou,
      nota_pos: notaFinal,
      delta: nota_pre != null ? round1(notaFinal - nota_pre) : d.delta,
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
