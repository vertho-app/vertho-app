/**
 * "A empresa contratou o módulo?": leitura mínima para o `/api/me` decidir se
 * o item de menu aparece. Fail-closed: falha de leitura vira "não habilitado"
 * (o menu esconde; a página, se aberta por URL, aplica o gate real).
 */
import { MODULOS, canUseModulo } from '@/lib/access-gates/modulos';

export async function prontidaoLiderancaHabilitada(sb: any, empresaId: string | null | undefined): Promise<boolean> {
  if (!empresaId) return false;
  try {
    const { data, error } = await sb.from('empresas').select('sys_config').eq('id', empresaId).maybeSingle();
    if (error || !data) return false;
    return canUseModulo(data.sys_config, MODULOS.PRONTIDAO_LIDERANCA).allowed;
  } catch {
    return false;
  }
}
