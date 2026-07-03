/**
 * Trava de piso do FECHAMENTO DO PILOTO — vive SÓ neste caminho.
 *
 * O piloto é uma degustação de 2 semanas: não há tempo hábil pra evolução
 * real, então a nota pós EXIBIDA nunca fica abaixo do baseline (nota_pre).
 * O fechamento demonstra a máquina de avaliação, não mede evolução.
 *
 * Regras inegociáveis (NUNCA mutação silenciosa):
 *   - nota_pos_bruto  = o que a IA realmente atribuiu (preservado no snapshot)
 *   - nota_pos        = max(bruto, baseline)  → o que a UI/relatório exibem
 *   - piso_aplicado   = true quando o piso agiu (por descritor e no agregado)
 *   - spec_version    = 'piloto-v1' — carimbo que torna este pós INconfundível
 *                       com um pós real (scorer dos outros modos intocado)
 */

export const PILOTO_SPEC_VERSION = 'piloto-v1';

// Menções de duração que invalidam a narrativa do piloto (o programa tem 2
// semanas — "14 semanas"/"13 semanas" é a régua do REGULAR vazando).
const DURACAO_ERRADA = /\b1[0-4]\s+semanas\b/i;
// Formas em que dá pra corrigir com segurança (frase de duração isolada).
const DURACAO_CORRIGIVEL = /\b(ao final de|ao longo de|após|depois de|durante|em)\s+1[0-4]\s+semanas\b/gi;
// (?<!\d\s) — NÃO corrigir quando há contagem antes ("11 das 13 semanas"):
// trocar a janela ali quebraria a frase; fica pro DURACAO_ERRADA invalidar.
const JANELA_CORRIGIVEL = /(?<!\d\s)\b(das?|nas?|pelas?)\s+1[0-4]\s+semanas\b/gi;

function corrigirTexto(t: string): string {
  return t
    .replace(DURACAO_CORRIGIVEL, (m, prep) => `${prep} 2 semanas`)
    .replace(JANELA_CORRIGIVEL, () => 'da degustação de 2 semanas');
}

/**
 * Sanitização CIRÚRGICA da narrativa do fechamento do piloto: corrige só as
 * frases de duração seguras ("ao final de 14 semanas" → "ao final de 2
 * semanas"; "das 13 semanas" → "da degustação de 2 semanas"). NÃO reescreve
 * conteúdo. Retorna `ok=false` se restou menção de duração errada que não
 * deu pra corrigir com segurança — o caller trata como narrativa inválida
 * (retry/erro recuperável), nunca publica.
 */
export function sanitizarNarrativaPiloto(parsed: any): { parsed: any; ok: boolean } {
  if (!parsed || typeof parsed !== 'object') return { parsed, ok: true };
  const out = { ...parsed };

  const campos: Array<[any, string]> = [];
  if (out.resumo_avaliacao && typeof out.resumo_avaliacao === 'object') {
    out.resumo_avaliacao = { ...out.resumo_avaliacao };
    for (const k of ['mensagem_geral', 'principal_avanco', 'principal_ponto_de_atencao']) {
      campos.push([out.resumo_avaliacao, k]);
    }
  }
  if (Array.isArray(out.avaliacao_por_descritor)) {
    out.avaliacao_por_descritor = out.avaliacao_por_descritor.map((d: any) => ({ ...d }));
    for (const d of out.avaliacao_por_descritor) campos.push([d, 'justificativa']);
  }

  let restou = false;
  for (const [obj, k] of campos) {
    if (typeof obj[k] !== 'string' || !obj[k]) continue;
    if (DURACAO_ERRADA.test(obj[k])) obj[k] = corrigirTexto(obj[k]);
    if (DURACAO_ERRADA.test(obj[k])) restou = true;
  }
  return { parsed: out, ok: !restou };
}

interface DescritorBaseline {
  descritor: string;
  nota_atual?: number | string;
}

/**
 * Aplica a trava de piso ao output validado do scorer
 * (validateEvolutionScenarioScore). Muta uma CÓPIA e a retorna.
 * Baseline por descritor = nota_atual fresh (a mesma que alimentou o prompt);
 * fallback = nota_pre que o próprio scorer ecoou.
 */
export function aplicarTravaPiloto(parsed: any, descritoresComRegua: DescritorBaseline[]): any {
  if (!parsed || !Array.isArray(parsed.avaliacao_por_descritor)) return parsed;

  const baselinePorDesc = new Map<string, number>();
  for (const d of descritoresComRegua || []) {
    const n = Number(d.nota_atual);
    if (d.descritor && Number.isFinite(n)) baselinePorDesc.set(d.descritor, n);
  }

  const out = { ...parsed };
  let pisoAgregado = false;

  out.avaliacao_por_descritor = parsed.avaliacao_por_descritor.map((d: any) => {
    const baseline = baselinePorDesc.get(d.descritor) ?? (typeof d.nota_pre === 'number' ? d.nota_pre : null);
    if (typeof d.nota_pos !== 'number' || typeof baseline !== 'number') {
      return { ...d, piso_aplicado: false };
    }
    const bruto = d.nota_pos;
    const exibido = Math.max(bruto, baseline);
    const piso = exibido > bruto;
    if (piso) pisoAgregado = true;
    return {
      ...d,
      nota_pos_bruto: bruto,
      nota_pos: exibido,
      piso_aplicado: piso,
      delta: typeof d.nota_pre === 'number' ? Math.round((exibido - d.nota_pre) * 10) / 10 : d.delta,
    };
  });

  // Médias: a exibida recalcula sobre o pós travado; a bruta é preservada.
  const media = (key: string) => {
    const vals = out.avaliacao_por_descritor
      .map((d: any) => d[key])
      .filter((v: any) => typeof v === 'number');
    return vals.length
      ? Math.round((vals.reduce((a: number, b: number) => a + b, 0) / vals.length) * 10) / 10
      : null;
  };
  out.nota_media_pos_bruto = typeof parsed.nota_media_pos === 'number' ? parsed.nota_media_pos : media('nota_pos_bruto');
  out.nota_media_pos = media('nota_pos');
  out.delta_medio = out.nota_media_pre != null && out.nota_media_pos != null
    ? Math.round((out.nota_media_pos - out.nota_media_pre) * 10) / 10
    : out.delta_medio;

  out.piso_aplicado = pisoAgregado;
  out.spec_version = PILOTO_SPEC_VERSION;
  return out;
}
