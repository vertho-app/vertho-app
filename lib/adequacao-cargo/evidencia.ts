/**
 * Trava dura de evidência (Tarefa B) — knockout + narrativa.
 *
 * Regra: nenhuma frase de bloqueio (ou de déficit na narrativa) pode nomear um
 * construto/déficit sem o TRAÇO MEDIDO + seu PISO (lo) adjacentes na mesma
 * sentença. Rótulos interpretativos ("resiliência", "disciplina de CRM") só
 * sobrevivem como CONSEQUÊNCIA rotulada de um traço medido e quantificado —
 * nunca como o achado em si. Isto é o que separa "evidência" de "achismo".
 *
 * Forma canônica:
 *   «Persistência 18 (piso do cargo: 41) → resiliência a rejeição em risco, …»
 * O traço medido + valor + piso vêm ANTES; o construto vem como consequência.
 */

export interface KnockoutEvidencia {
  traco: string;              // rótulo do traço (ou bloco) medido
  bloco?: string;             // bloco de origem (Competencia/DISC/Mapeamento/Lideranca) — T4
  valorBruto: number | null;  // valor bruto do traço (null p/ knockout de bloco)
  piso: number | null;        // lo da faixa do cargo (null p/ knockout de bloco)
  consequencia: string;       // texto de negócio (consequência rotulada)
  ehBloco: boolean;
  medidoPct?: number;         // knockout de bloco: aderência medida (%)
  minPct?: number;            // knockout de bloco: mínimo exigido (%)
}

// Origem do bloqueio (T4) — rótulo FACTUAL da natureza do gate, sem alegar treinabilidade.
export type OrigemBloqueio = 'competencia' | 'comportamental' | 'misto';
export const LABEL_ORIGEM: Record<OrigemBloqueio, string> = {
  competencia: 'Bloqueio de competência',
  comportamental: 'Bloqueio comportamental',
  misto: 'Bloqueio de competência e comportamental',
};
export function origemBloqueio(evs: KnockoutEvidencia[]): OrigemBloqueio | null {
  const blocos = new Set(evs.map((e) => e.bloco).filter(Boolean));
  if (!blocos.size) return null;
  const temComp = blocos.has('Competencia');
  const temComportamental = blocos.has('DISC') || blocos.has('Mapeamento') || blocos.has('Lideranca');
  if (temComp && temComportamental) return 'misto';
  return temComp ? 'competencia' : 'comportamental';
}

/** Compõe a linha de bloqueio ancorada (traço + valor + piso → consequência). */
export function formatLinhaBloqueio(ev: KnockoutEvidencia): string {
  // Separador "—" (não "→": a subset Inter dos PDFs não cobre a seta → vira tofu).
  if (ev.ehBloco) {
    return `${ev.traco} ${ev.medidoPct}% (mínimo do cargo: ${ev.minPct}%) — ${ev.consequencia}`;
  }
  return `${ev.traco} ${ev.valorBruto} (piso do cargo: ${ev.piso}) — ${ev.consequencia}`;
}

const norm = (s: any) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * Valida que a frase está ANCORADA: contém o traço medido + valor + piso. Usado
 * como enforcement (teste/lint) — uma frase de déficit sem âncora NÃO passa.
 */
export function linhaAncorada(frase: string, ev: KnockoutEvidencia): boolean {
  const f = norm(frase);
  if (!f.includes(norm(ev.traco))) return false;
  if (ev.ehBloco) {
    return ev.medidoPct != null && ev.minPct != null
      && f.includes(String(ev.medidoPct)) && f.includes(String(ev.minPct));
  }
  return ev.valorBruto != null && ev.piso != null
    && f.includes(String(ev.valorBruto)) && f.includes(String(ev.piso));
}
