/**
 * Resumo compacto do Development Blueprint para injetar no contexto dos
 * assistentes (Beto, Tira-Dúvidas). O blueprint inteiro é grande (geração usa
 * 64k tokens); aqui extraímos só o que personaliza a orientação: o foco geral +
 * os objetivos de 30 dias das competências. A trilha de 14 semanas fica de fora.
 *
 * Leitura SERVICE-ROLE por colaborador_id — SEM o gate de admin do `getBlueprint`.
 * Seguro porque os assistentes já resolveram e validaram o colaborador da sessão
 * (Beto por email autenticado; Tira-Dúvidas por assertColabAccess). Cada um lê o
 * PRÓPRIO blueprint.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { DevelopmentBlueprint } from '@/lib/blueprint/types';

/** Blueprint mais recente do colaborador, ou null se ainda não gerado. */
export async function carregarBlueprint(
  sb: SupabaseClient,
  colaboradorId: string,
): Promise<DevelopmentBlueprint | null> {
  const { data } = await sb.from('development_blueprints')
    .select('blueprint')
    .eq('colaborador_id', colaboradorId)
    .order('gerado_em', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.blueprint as DevelopmentBlueprint) || null;
}

const norm = (s: string) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

/**
 * Bloco de prompt com o plano de desenvolvimento do colaborador.
 *
 * `competenciaFoco`: quando informado (Tira-Dúvidas, escopo travado na semana),
 * restringe aos objetivos de 30 dias daquela competência — não despeja o plano
 * inteiro. Sem ele (Beto, mentor aberto), traz o foco geral + todas as competências.
 */
export function formatBlueprintResumo(
  bp: DevelopmentBlueprint | null,
  opts: { competenciaFoco?: string } = {},
): string {
  if (!bp) return '';

  const comps = opts.competenciaFoco
    ? bp.competencias.filter((c) => norm(c.nome) === norm(opts.competenciaFoco!))
    : bp.competencias;
  if (!bp.foco_geral && !comps.length) return '';

  const blocoComp = (c: DevelopmentBlueprint['competencias'][number]) => {
    const objs = (c.objetivos_30_dias || []).slice(0, 3).map((o) => {
      return `    · ${o.objetivo}${o.criterio_de_sucesso ? ` (sucesso: ${o.criterio_de_sucesso})` : ''}`;
    });
    return [
      `  ▸ ${c.nome} — nível atual ${c.nivel_atual}, prioridade ${c.prioridade}`,
      c.leitura ? `    ${c.leitura}` : '',
      objs.length ? `    Objetivos de 30 dias:` : '',
      ...objs,
    ].filter(Boolean).join('\n');
  };

  return `PLANO DE DESENVOLVIMENTO DO COLABORADOR (use para personalizar — conecte a orientação ao foco e aos objetivos de 30 dias dele; não recite o plano inteiro):
${bp.foco_geral ? `Foco: ${bp.foco_geral.tese_de_desenvolvimento}
${bp.foco_geral.mensagem_central ? `Mensagem central: ${bp.foco_geral.mensagem_central}` : ''}` : ''}
${comps.length ? `Competências em desenvolvimento:
${comps.map(blocoComp).join('\n')}` : ''}`.trim();
}

/** Atalho: carrega + formata. '' se não houver blueprint. */
export async function carregarBlueprintResumo(
  sb: SupabaseClient,
  colaboradorId: string,
  opts: { competenciaFoco?: string } = {},
): Promise<string> {
  try {
    return formatBlueprintResumo(await carregarBlueprint(sb, colaboradorId), opts);
  } catch (e: any) {
    console.warn('[blueprint-resumo] falhou:', e?.message);
    return '';
  }
}
