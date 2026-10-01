/**
 * Elegibilidade de cenário A para o colaborador — UMA régua, usada por todo caminho que serve cenário.
 *
 * Antes desta função a regra "PPP do colaborador > rede > mais recente" estava escrita em quatro lugares
 * (`app/api/assessment/route.ts`, duas vezes em `assessment-actions.ts` e em `app/api/chat/route.ts`), e
 * NADA filtrava por nota: um cenário com nota 58 chegava à pessoa igual a um com 90 (medido em 01/10/2026).
 *
 * NOTA MÍNIMA (opt-in por empresa, decisão do dono 01/10/2026: "todos >= 80", sem reavaliar o passado):
 *   `empresas.sys_config.cenario_nota_minima = 80` liga o filtro NAQUELA empresa. Sem a chave, nada muda —
 *   e é de propósito: as outras empresas têm cenários antigos medidos por auditores de outra régua
 *   (mig 228), e ligar um corte global os esconderia todos de uma vez.
 *   Com a chave ligada o corte é FAIL-CLOSED: cenário sem nota (ainda não checado) ou abaixo do corte não é
 *   servido. O caminho para satisfazer o corte existe e é automático: a escada de geração do IA3 regenera
 *   até >= 80 (`regenerarAteLimiarIA3`); a tela de detalhes da Fase 1 mostra o que falta.
 *
 * ⚠️ A nota gravada pode vir de auditores diferentes (Terra ou, no degrau do GPT, o Sonnet — ver
 * `alertas_check.auditor`). Ambas valem como ">= 80 na régua de quem mediu"; a do Sonnet é a mais dura.
 */

export const CHAVE_NOTA_MINIMA = 'cenario_nota_minima';

/** Lê o corte do `sys_config` da empresa. Ausente, inválido ou <= 0 → null (filtro desligado). */
export function notaMinimaDoTenant(sysConfig: any): number | null {
  const v = sysConfig?.[CHAVE_NOTA_MINIMA];
  const n = typeof v === 'number' ? v : (typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN);
  return Number.isFinite(n) && n > 0 && n <= 100 ? n : null;
}

/** O cenário atende o corte? Sem corte (null) sempre atende. Com corte, nota ausente NÃO atende. */
export function cenarioAtendeNotaMinima(cenario: { nota_check?: unknown } | null | undefined, notaMinima: number | null): boolean {
  if (notaMinima == null) return true;
  const nota = cenario?.nota_check;
  return typeof nota === 'number' && nota >= notaMinima;
}

/**
 * UM cenário para a competência: entre os que atendem o corte, PPP do colaborador > rede (sem PPP) > o
 * primeiro da lista (a ordem de entrada decide o "mais recente"). Nenhum atende → null (não serve).
 */
export function escolherCenarioDaCompetencia<T extends { ppp_escola_id?: string | null; nota_check?: unknown }>(
  rows: T[] | null | undefined,
  pppEscolaId: string | null,
  notaMinima: number | null = null,
): T | null {
  const aptos = (rows || []).filter((r) => cenarioAtendeNotaMinima(r, notaMinima));
  if (!aptos.length) return null;
  return (pppEscolaId && aptos.find((r) => r.ppp_escola_id === pppEscolaId))
    || aptos.find((r) => !r.ppp_escola_id)
    || aptos[0];
}

/** Um cenário por competência (agrupa por `competencia_id`); competência sem cenário apto sai da lista. */
export function selecionarCenariosElegiveis<T extends { competencia_id?: string | null; ppp_escola_id?: string | null; nota_check?: unknown }>(
  cenariosRaw: T[] | null | undefined,
  pppEscolaId: string | null,
  notaMinima: number | null = null,
): T[] {
  const porComp: Record<string, T[]> = {};
  (cenariosRaw || []).forEach((c) => {
    const k = String(c.competencia_id ?? '');
    (porComp[k] = porComp[k] || []).push(c);
  });
  return Object.values(porComp)
    .map((rows) => escolherCenarioDaCompetencia(rows, pppEscolaId, notaMinima))
    .filter((c): c is T => c != null);
}

/** Lê o corte da empresa. Falha de leitura NÃO desliga o filtro em silêncio: devolve o erro para o chamador. */
export async function notaMinimaDaEmpresa(sb: any, empresaId: string): Promise<{ notaMinima: number | null; error?: string }> {
  const { data, error } = await sb.from('empresas').select('sys_config').eq('id', empresaId).maybeSingle();
  if (error) return { notaMinima: null, error: `Falha ao ler a nota mínima da empresa: ${error.message}` };
  return { notaMinima: notaMinimaDoTenant(data?.sys_config) };
}
