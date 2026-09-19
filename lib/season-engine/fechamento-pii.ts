/**
 * PII do fechamento: o que entra mascarado na IA e o que volta desmascarado.
 *
 * FONTE ÚNICA entre os dois chamadores de `pontuarFechamento`: o fechamento da
 * pessoa (`fechamento-core`) e a regeração do admin (`auditoria-sem14`). Até
 * 18/09/2026 cada um desmascarava uma lista própria de campos, e as listas não
 * batiam: a regeração devolvia o fecho (`mensagem_final`) e os próximos passos
 * com o alias `COLAB_…`, e nenhum dos dois cobria `principal_avanco`.
 *
 * A extração da arguição fica gravada SEM máscara (a pessoa relê a própria
 * conversa). Desde que a redação final e o auditor passaram a recebê-la, ela
 * precisa entrar mascarada como o resto.
 */
import { maskTextPII, unmaskPII } from '@/lib/pii-masker';
import type { ArguicaoExtracao } from './arguicao';

type Mapa = Record<string, string>;

/** Cópia mascarada da extração: resumo e citações. Classificação e descritor passam intactos. */
export function mascararExtracaoArguicao(ext: ArguicaoExtracao | null | undefined, map: Mapa): ArguicaoExtracao | null {
  if (!ext) return null;
  const m = (s: unknown) => (typeof s === 'string' ? maskTextPII(s, map) : (s as string));
  return {
    ...ext,
    resumo: ext.resumo
      ? {
          ...ext.resumo,
          leitura_geral: m(ext.resumo.leitura_geral),
          sustentacao_mais_forte: m(ext.resumo.sustentacao_mais_forte),
          fragilidade_mais_relevante: m(ext.resumo.fragilidade_mais_relevante),
        }
      : ext.resumo,
    evidencias_por_descritor: Array.isArray(ext.evidencias_por_descritor)
      ? ext.evidencias_por_descritor.map((e) => ({ ...e, citacao: m(e?.citacao) }))
      : ext.evidencias_por_descritor,
  };
}

const CAMPOS_DO_RESUMO = ['mensagem_geral', 'principal_avanco', 'principal_ponto_de_atencao', 'mensagem_final'] as const;
const LISTAS_DO_RESUMO = ['evidencias_citadas', 'proximos_passos'] as const;
const CAMPOS_DO_DESCRITOR = ['justificativa', 'trecho_cenario', 'evidencia_acumulada'] as const;
const CAMPOS_DA_AUDITORIA = ['resumo_auditoria', 'ponto_mais_confiavel', 'ponto_mais_fragil'] as const;

function desmascararResumo(r: any, map: Mapa) {
  if (!r || typeof r !== 'object') return;
  for (const k of CAMPOS_DO_RESUMO) if (typeof r[k] === 'string') r[k] = unmaskPII(r[k], map);
  for (const k of LISTAS_DO_RESUMO) {
    if (Array.isArray(r[k])) r[k] = r[k].map((p: unknown) => (typeof p === 'string' ? unmaskPII(p, map) : p));
  }
}

/**
 * Devolve o nome real a todo texto autoral do resultado. MUTA `parsed` e
 * `auditoria` (os dois chamadores gravam os mesmos objetos logo depois).
 */
export function desmascararResultadoFechamento(parsed: any, auditoria: any, map: Mapa): void {
  if (parsed && typeof parsed === 'object') {
    desmascararResumo(parsed.resumo_avaliacao, map);
    desmascararResumo(parsed.resumo_avaliacao_rascunho, map);
    if (Array.isArray(parsed.avaliacao_por_descritor)) {
      parsed.avaliacao_por_descritor = parsed.avaliacao_por_descritor.map((d: any) => {
        const out = { ...d };
        for (const k of CAMPOS_DO_DESCRITOR) if (typeof out[k] === 'string') out[k] = unmaskPII(out[k], map);
        // `Medido:` ensaio de 18/09, "Não há evidência de como COLAB_… comunica"
        // gravado num limite da leitura: a lista também é texto autoral.
        if (Array.isArray(out.limites_da_leitura)) {
          out.limites_da_leitura = out.limites_da_leitura.map((l: unknown) => (typeof l === 'string' ? unmaskPII(l, map) : l));
        }
        return out;
      });
    }
    if (Array.isArray(parsed.alertas_metodologicos)) {
      parsed.alertas_metodologicos = parsed.alertas_metodologicos.map((a: unknown) => (typeof a === 'string' ? unmaskPII(a, map) : a));
    }
  }
  if (auditoria && typeof auditoria === 'object') {
    for (const k of CAMPOS_DA_AUDITORIA) if (typeof auditoria[k] === 'string') auditoria[k] = unmaskPII(auditoria[k], map);
    if (Array.isArray(auditoria.alertas)) {
      auditoria.alertas = auditoria.alertas.map((a: unknown) => (typeof a === 'string' ? unmaskPII(a, map) : a));
    }
    if (Array.isArray(auditoria.ajustes_sugeridos)) {
      auditoria.ajustes_sugeridos = auditoria.ajustes_sugeridos.map((a: any) => (
        a && typeof a.motivo === 'string' ? { ...a, motivo: unmaskPII(a.motivo, map) } : a
      ));
    }
  }
}
