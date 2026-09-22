import 'server-only';

import { isAssessmentDeDegustacao, isEmailDeConvidadoDemo } from '@/lib/demo/convidado-demo';
import { registrarDegradacao, DEGRADACAO } from '@/lib/degradacao';

/**
 * O mapeamento de competências desta pessoa é o da degustação?
 *
 * É a MESMA régua do assessment (`isAssessmentDeDegustacao`), para quem só tem o
 * colaborador na mão: home, jornada e PDI. Até 22/09/2026 só o assessment a
 * aplicava, e as outras três telas contavam o Top 5 inteiro. Um convidado real
 * respondeu a única competência da degustação, leu "1 de 1 competências com
 * análise concluída" no resultado, e mandou o print da jornada, que dizia "Fase
 * 2 em curso", "Iniciar mapeamento de competências" e "Concluir avaliação".
 *
 * Três regras:
 *   - quem não PODE ser convidado (persona do elenco, staff, e-mail vazio) não
 *     paga consulta;
 *   - `empresaIsDemo` já conhecido (a home pré-busca junto com a config) dispensa
 *     a consulta;
 *   - falha de leitura conta como NÃO degustação, que é a contagem de sempre e a
 *     certa para cliente real, e fica registrada: para o convidado ela devolve a
 *     jornada contraditória.
 */
export async function colaboradorEmDegustacao(
  sb: any,
  colab: { id?: string | null; email?: string | null; empresa_id?: string | null } | null | undefined,
  empresaIsDemo?: boolean,
): Promise<boolean> {
  if (!isEmailDeConvidadoDemo(colab?.email)) return false;
  if (empresaIsDemo !== undefined) return isAssessmentDeDegustacao(empresaIsDemo, colab?.email);
  if (!colab?.empresa_id) return false;

  const { data, error } = await sb.from('empresas')
    .select('is_demo')
    .eq('id', colab.empresa_id)
    .maybeSingle();
  if (error) {
    console.warn('[degustacao] is_demo indisponível, contando o Top 5 inteiro:', error.message);
    await registrarDegradacao({
      fluxo: 'demo',
      tipo: DEGRADACAO.DEGUSTACAO_REGUA_INDISPONIVEL,
      chave: String(colab.id || colab.email || colab.empresa_id),
      empresaId: colab.empresa_id,
      colaboradorId: colab.id || null,
      severidade: 'aviso',
      detalhe: { erro: error.message },
    });
    return false;
  }
  return isAssessmentDeDegustacao((data as any)?.is_demo, colab.email);
}
