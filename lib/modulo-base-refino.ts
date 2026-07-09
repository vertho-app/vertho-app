/**
 * Refino de Módulo-Base: a IA-autora reescreve consumindo o feedback da
 * IA-auditora, e uma nova auditoria fecha o loop Dual-IA.
 *
 * Vive em `lib/` pelo mesmo motivo das libs irmãs: um `'use server'` não pode ser
 * importado por tasks/scripts sem virar endpoint HTTP. Sem guard — quem expõe é
 * `refinarComFeedback` em `actions/modulos-base.ts`.
 *
 * GUARDA ANTI-REGRESSÃO: se o refino BAIXA a nota, reverte para o snapshot
 * anterior. Refinar nunca piora o módulo.
 */
import { createSupabaseAdmin } from '@/lib/supabase';
import { getModelForTask } from '@/lib/ai-tasks';
import { SYSTEM_AUTOR, chamarIAComRetry } from '@/lib/modulo-base-autor';
import { COLS_MODULO, auditarModuloCore, carregarCompetenciaDoModulo } from '@/lib/modulo-base-auditor';

export function montarPromptRefinador(m: any, comp: any, a: any): string {
  const nivelTextos: Record<string, string> = {
    N1: comp?.n1_gap || '',
    N2: comp?.n2_desenvolvimento || '',
    N3: comp?.n3_meta || '',
    N4: comp?.n4_referencia || '',
  };

  const problemasOrdenados = [...(Array.isArray(a.problemas) ? a.problemas : [])]
    .sort((x: any, y: any) => {
      const ord: Record<string, number> = { alta: 0, media: 1, baixa: 2 };
      return (ord[x.gravidade] ?? 3) - (ord[y.gravidade] ?? 3);
    });

  const problemasTexto = problemasOrdenados
    .map((p: any, i: number) =>
      `${i + 1}. [${String(p.gravidade || '').toUpperCase()}] ${p.categoria}: ${p.descricao}${p.campo_afetado ? ` (campo: ${p.campo_afetado})` : ''}`)
    .join('\n');

  const recomendacoesTexto = (Array.isArray(a.recomendacoes) ? a.recomendacoes : [])
    .map((r: any) => `- ${r}`)
    .join('\n');

  return `## COMPETÊNCIA CANÔNICA
- Nome: ${comp?.nome || '—'} (${comp?.segmento || '—'})
- Descritor: ${comp?.descritor_completo || comp?.descricao || '—'}
- Transição: ${m.nivel_entrada} → ${m.nivel_destino}
  - ${m.nivel_entrada}: ${nivelTextos[m.nivel_entrada]}
  - ${m.nivel_destino}: ${nivelTextos[m.nivel_destino]}
- Contexto pedagógico: ${m.contexto_pedagogico || 'transversal'}
- Locale: ${m.locale}

## VERSÃO ATUAL DO MÓDULO (v${m.versao}) — a IA-auditora **${(a.veredito || '').replace(/_/g, ' ')}**:
${JSON.stringify({
  conteudo_central: m.conteudo_central,
  conteudo_aplicavel: m.conteudo_aplicavel,
  guarda_corpos: m.guarda_corpos,
  adaptacao_por_formato: m.adaptacao_por_formato,
}, null, 2)}

## FEEDBACK DA IA-AUDITORA (confiança ${Math.round((a.confianca || 0) * 100)}%)

### Problemas apontados (${problemasOrdenados.length}):
${problemasTexto || '(nenhum problema listado)'}

### Recomendações da auditora:
${recomendacoesTexto || '(nenhuma recomendação)'}

## SUA TAREFA — REFINAR (não regerar do zero)
Você é a MESMA IA-autora que produziu a versão atual. A IA-auditora avaliou e devolveu o feedback acima. Sua tarefa é PRODUZIR UMA VERSÃO REFINADA que:

1. **CORRIGE** todos os problemas de gravidade ALTA (obrigatório).
2. **AJUSTA** os de gravidade média/baixa quando viável (fortemente recomendado).
3. **PRESERVA** tudo que não foi apontado como problema — não regere o que está bom.
4. **MANTÉM** consistência conceitual com a versão atual (a auditora vai re-avaliar a comparação).
5. **RESPEITA** o spec original do Módulo-Base (4 blocos completos com os mínimos: ≥5 princípios, ≥4 situações, ≥4 erros, ≥4 boas práticas).
6. **NÃO PIORE o que já passou** — a meta é melhora MONOTÔNICA: a próxima auditoria deve SUBIR, não cair. Não troque exemplos por outros mais específicos pra "consertar universalidade" — GENERALIZE os existentes. Não reescreva blocos que a auditora não apontou. Cada mudança deve atacar um problema listado — nada de reescrita cosmética que abre flancos novos.

Retorne APENAS JSON válido com a estrutura completa dos 4 blocos. Sem markdown, sem comentários.`;
}

export async function refinarModuloCore(sb: ReturnType<typeof createSupabaseAdmin>, id: string) {
  const { data: m } = await sb.from('modulos_base_conteudo').select(COLS_MODULO).eq('id', id).maybeSingle();
  if (!m) return { error: 'Módulo não encontrado' };
  if (!m.auditoria_ia) return { error: 'Sem auditoria pra refinar. Submeta pra revisão primeiro pra disparar a IA-auditora.' };

  const a = m.auditoria_ia as any;
  if (a.veredito === 'aprovado') {
    return { error: 'A IA-auditora já aprovou esta versão. Nada a refinar.' };
  }
  if (m.auditado_em_versao !== m.versao) {
    return { error: 'A auditoria não corresponde à versão atual do módulo. Reauditar antes de refinar.' };
  }

  const comp = await carregarCompetenciaDoModulo(m);
  const userPrompt = montarPromptRefinador(m, comp, a);

  // IA-autora (Claude Sonnet por default — mesmo modelo da geração inicial,
  // pra manter consistência de estilo).
  const model = await getModelForTask(null as any, 'modulo_base_autor');
  const corpo = await chamarIAComRetry(SYSTEM_AUTOR, userPrompt, model);
  if (!corpo) return { error: 'A IA-autora não conseguiu produzir uma versão refinada. Tente novamente.' };

  const versaoAnterior = m.versao || 1;
  const novaVersao = versaoAnterior + 1;
  const notaAnterior = typeof a?.nota === 'number' ? a.nota : null;

  // Snapshot da versão atual ANTES de sobrescrever — o refino é destrutivo (não
  // mantém histórico), então sem isto uma versão refinada PIOR apagaria a melhor.
  const snapshotAnterior = {
    conteudo_central: m.conteudo_central,
    conteudo_aplicavel: m.conteudo_aplicavel,
    guarda_corpos: m.guarda_corpos,
    adaptacao_por_formato: m.adaptacao_por_formato,
    versao: versaoAnterior,
    auditoria_ia: m.auditoria_ia,
    auditado_em: m.auditado_em,
    auditado_por_modelo: m.auditado_por_modelo,
    auditado_em_versao: m.auditado_em_versao,
  };

  const { error: upErr } = await sb.from('modulos_base_conteudo').update({
    conteudo_central:      corpo.conteudo_central      || m.conteudo_central,
    conteudo_aplicavel:    corpo.conteudo_aplicavel    || m.conteudo_aplicavel,
    guarda_corpos:         corpo.guarda_corpos         || m.guarda_corpos,
    adaptacao_por_formato: corpo.adaptacao_por_formato || m.adaptacao_por_formato,
    versao: novaVersao,
  }).eq('id', id);
  if (upErr) return { error: upErr.message };

  // Dispara nova auditoria sobre a versão refinada (fecha o loop dual-IA).
  const auditResult = await auditarModuloCore(sb, id);
  if ('error' in auditResult && auditResult.error) {
    return { ok: true, versaoAnterior, versaoNova: novaVersao, aviso_auditoria: auditResult.error };
  }
  const novaAuditoria = (auditResult as any).auditoria;
  const notaNova = typeof novaAuditoria?.nota === 'number' ? novaAuditoria.nota : null;

  // Guarda anti-regressão: se o refino BAIXOU a nota, reverte pra versão anterior.
  // Garante que clicar "Refinar com IA" nunca piora o módulo (melhora monotônica
  // do ponto de vista do humano). Variância da auditora não pode destruir uma boa versão.
  if (notaAnterior != null && notaNova != null && notaNova < notaAnterior) {
    await sb.from('modulos_base_conteudo').update(snapshotAnterior).eq('id', id);
    return {
      ok: true,
      revertido: true,
      versaoAnterior,
      notaAnterior,
      notaNova,
      auditoria: snapshotAnterior.auditoria_ia,
    };
  }

  return {
    ok: true,
    versaoAnterior,
    versaoNova: novaVersao,
    notaAnterior,
    notaNova,
    auditoria: novaAuditoria,
  };
}
