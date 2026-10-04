import type { EmpresaConfig, GateResult } from './types';

/**
 * Ordem da jornada POR PESSOA: o Perfil comportamental vem antes do mapeamento de
 * cenários. `canAccessMapeamentoCenarios` só olha a config da empresa/turma (as
 * duas flags liberadas); ele nunca perguntou se ESTA pessoa já fez o Perfil, então
 * quem estava com os dois liberados abria os cenários sem ter feito o DISC.
 *
 * Régua de "tem perfil": `perfil_dominante` (a mesma de todo gate do app, nunca
 * `disc_resultados`).
 *
 * Duas exceções, ambas para não criar beco:
 * - empresa com FONTE EXTERNA de perfil (OPQ32, Hogan…): o DISC nativo nunca será
 *   feito ali, exigir seria tornar os cenários inalcançáveis;
 * - quem JÁ respondeu algum cenário: não se tranca no meio do caminho quem
 *   começou antes desta trava existir.
 */
export type PessoaOrdem = {
  perfil_dominante?: string | null;
};

export function canAccessDiagnosticoNaOrdem(
  config: EmpresaConfig | null | undefined,
  pessoa: PessoaOrdem | null | undefined,
  jaRespondeuCenario: boolean,
): GateResult {
  if (config?.perfil_externo_fonte) return { allowed: true };
  if (pessoa?.perfil_dominante) return { allowed: true };
  if (jaRespondeuCenario) return { allowed: true };
  return {
    allowed: false,
    code: 'PERFIL_PESSOAL_PENDENTE',
    message: 'Faça o seu Perfil comportamental antes do Mapeamento.',
    remediation: 'Conclua o Perfil comportamental em /dashboard/perfil-comportamental e volte ao Mapeamento.',
  };
}

/**
 * Versão que lê o que falta (perfil da pessoa e se já respondeu). Falha de leitura
 * NÃO libera em silêncio: sem saber, não se decide a favor de quem está pulando a
 * ordem — devolve bloqueio com código próprio para a tela dizer que é instabilidade.
 */
export async function gateDiagnosticoDaPessoa(
  sb: any,
  empresaId: string,
  colaboradorId: string,
  config: EmpresaConfig | null | undefined,
): Promise<GateResult> {
  if (config?.perfil_externo_fonte) return { allowed: true };

  const { data: colab, error: erroColab } = await sb.from('colaboradores')
    .select('perfil_dominante')
    .eq('id', colaboradorId)
    .eq('empresa_id', empresaId)
    .maybeSingle();
  if (erroColab) return indisponivel();
  if (colab?.perfil_dominante) return { allowed: true };

  const { count, error: erroResp } = await sb.from('respostas')
    .select('id', { count: 'exact', head: true })
    .eq('colaborador_id', colaboradorId)
    .eq('empresa_id', empresaId);
  if (erroResp) return indisponivel();

  return canAccessDiagnosticoNaOrdem(config, colab, (count || 0) > 0);
}

function indisponivel(): GateResult {
  return {
    allowed: false,
    code: 'ORDEM_INDISPONIVEL',
    message: 'Não foi possível verificar o seu Perfil agora. Tente de novo em instantes.',
  };
}
