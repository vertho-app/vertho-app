/**
 * Contexto/PPP da EMPRESA para o Kit Semanal (que é por EMPRESA, não por escola).
 *
 * Empresa-rede (município, ex.: Ibipeba) tem VÁRIOS PPPs (1 por escola). Pegar o
 * "mais recente" aplicaria o PPP de uma escola qualquer na rede inteira — errado.
 * Aqui consolidamos: 1 PPP → usa direto; N PPPs → SÍNTESE MUNICIPAL (o que é
 * COMPARTILHADO pela rede) via IA, cacheada em empresas.kit_contexto (invalida
 * quando entra um PPP mais novo). Ver docs/KIT-SEMANAL.md.
 */
import { callAI } from '@/actions/ai-client';

export async function resolverContextoEmpresa(sb: any, empresaId: string, aiConfig: any = {}): Promise<string | null> {
  const { data: ppps } = await sb.from('ppp_escolas')
    .select('extracao, extracted_at')
    .eq('empresa_id', empresaId).eq('status', 'extraido')
    .order('extracted_at', { ascending: false });
  if (!ppps?.length) return null;

  const { extracaoParaTexto } = await import('@/lib/escola-brief');

  // 1 PPP → usa direto (sem síntese).
  if (ppps.length === 1) return extracaoParaTexto(ppps[0].extracao).slice(0, 2500);

  // N PPPs → contexto MUNICIPAL consolidado (cacheado; invalida se houver PPP mais novo).
  const maxAt = ppps[0].extracted_at;
  const { data: emp } = await sb.from('empresas').select('kit_contexto, kit_contexto_at').eq('id', empresaId).maybeSingle();
  if (emp?.kit_contexto && emp.kit_contexto_at && new Date(emp.kit_contexto_at) >= new Date(maxAt)) {
    return emp.kit_contexto;
  }

  const textos = ppps.slice(0, 20)
    .map((p: any, i: number) => `--- ESCOLA ${i + 1} ---\n${extracaoParaTexto(p.extracao).slice(0, 1200)}`)
    .join('\n\n');
  const system = `Você consolida o CONTEXTO PEDAGÓGICO MUNICIPAL de uma rede de ensino a partir dos PPPs de várias escolas.

Extraia o que é COMPARTILHADO pela rede — prioridades, valores e contexto recorrentes que valem para o MUNICÍPIO como um todo —, ignorando idiossincrasias de escolas específicas.

Saída: um brief conciso (≤2000 caracteres), em texto corrido, usável como LENTE de aplicação de conteúdos. NÃO cite nomes de escolas. Sem markdown, sem listas longas.`;
  const user = `PPPs da rede (${ppps.length} escolas):\n\n${textos}`;

  let consolidado: string;
  try {
    consolidado = (await callAI(system, user, aiConfig, 1200)).trim().slice(0, 2500);
  } catch {
    // Falha na síntese: cai no PPP mais recente (melhor que nada), sem cachear.
    return extracaoParaTexto(ppps[0].extracao).slice(0, 2500);
  }

  await sb.from('empresas').update({ kit_contexto: consolidado, kit_contexto_at: new Date().toISOString() }).eq('id', empresaId).then(() => {}, () => {});
  return consolidado;
}
