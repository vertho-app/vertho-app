'use server';

import { createSupabaseAdmin } from '@/lib/supabase';
import { callAI, type AIConfig } from './ai-client';
import { extractJSON } from './utils';

const CHECK_SYSTEM = `Você é um auditor de qualidade de Assessment Comportamental da Vertho.
Sua tarefa: verificar se a avaliação gerada por uma IA é DEFENSÁVEL como produto Vertho.

═══ PRINCÍPIOS ═══

- Evidência concreta vale mais que texto bonito
- N3/N4 sem base concreta devem ser penalizados FORTEMENTE
- Feedback genérico é erro metodológico
- Recomendação sem base observável deve derrubar nota
- O auditor PROTEGE rigor, prática e baixo viés

═══ 6 CRITÉRIOS DE AUDITORIA (total 100 pontos) ═══

1. ANCORAGEM EM EVIDÊNCIA (20pts)
   Cada nota por descritor está ancorada em evidência textual real?
   N3+ sem trecho concreto = penalizar fortemente.

2. COERÊNCIA NÍVEL × NOTA (20pts)
   O nível geral é coerente com as notas por descritor?
   A nota decimal reflete corretamente a média?

3. COERÊNCIA DA CONSOLIDAÇÃO (15pts)
   Travas foram aplicadas corretamente?
   (descritor N1 → max N2; >3 N1 → N1; floor da média)
   GAP = 3 - nivel_geral correto?
   Matemática correta?

4. ESPECIFICIDADE DO FEEDBACK (15pts)
   O feedback menciona algo específico das respostas?
   Tom construtivo e personalizado?
   ERRO GRAVE: feedback 100% genérico que serviria para qualquer pessoa.

5. QUALIDADE DAS RECOMENDAÇÕES (15pts)
   Gaps prioritários são acionáveis?
   Recomendações são proporcionais à força da evidência?
   NÃO sugere recursos externos (livros, podcasts)?

6. PRUDÊNCIA METODOLÓGICA (15pts)
   A avaliação é prudente dado as evidências disponíveis?
   Inferiu fatos não mencionados? Extrapolou impactos?
   Na dúvida, escolheu o nível inferior?

═══ ERROS GRAVES (forçam nota máxima 60) ═══

- N3/N4 sem evidência concreta suficiente
- Feedback 100% genérico
- Recomendação sem base observável
- Consolidação contraditória (ex: média 1.5 com nível N3)
- Inferência/alucinação evidente
- Erro matemático claro (média ou travas)

═══ CLASSIFICAÇÃO ═══

90-100 = aprovado
80-89 = aprovado_com_ajustes
0-79 = revisar (mudancas_sugeridas obrigatório)

═══ FORMATO JSON (APENAS JSON, sem markdown) ═══

{
  "nota": 87,
  "status": "aprovado_com_ajustes",
  "erro_grave": false,
  "criterios": {
    "ancoragem_evidencia": 18,
    "coerencia_nivel_nota": 17,
    "coerencia_consolidacao": 13,
    "especificidade_feedback": 14,
    "qualidade_recomendacoes": 12,
    "prudencia_metodologica": 13
  },
  "ponto_mais_confiavel": "O que a avaliação fez melhor",
  "ponto_mais_fragil": "Onde a avaliação é mais vulnerável",
  "descritores_com_risco": ["descritores onde a nota parece frágil"],
  "tipo_de_erro_predominante": "extrapolacao|falta_prudencia|generico|matematica|nenhum",
  "justificativa": "Avaliação geral (2-3 frases concretas, não genéricas)",
  "mudancas_sugeridas": ["lista de correções específicas se status != aprovado"],
  "alertas": ["riscos residuais"]
}

REGRA: Prefira rigor metodológico a elegância. Se a avaliação for razoável
mas imprudente, penalize. Se for conservadora e bem ancorada, premie.`;

function buildCheckUser(colab: any, compNome: string, perfilCIS: string, resp: any, reguaTexto: string, cenarioTexto: string, perguntasTexto: string): string {
  const blocks: string[] = [];

  blocks.push(`═══ PROFISSIONAL ═══
${colab?.nome_completo || '—'} · ${colab?.cargo || '—'}`);

  blocks.push(`═══ COMPETÊNCIA ═══\n${compNome}`);

  if (perfilCIS) blocks.push(`═══ PERFIL CIS ═══\n${perfilCIS}`);

  blocks.push(`═══ RESPOSTAS DO PROFISSIONAL ═══
R1: ${resp.r1 || '—'}
R2: ${resp.r2 || '—'}
R3: ${resp.r3 || '—'}
R4: ${resp.r4 || '—'}`);

  if (reguaTexto) blocks.push(`═══ RÉGUA DE MATURIDADE ═══\n${reguaTexto}`);
  if (cenarioTexto) blocks.push(`═══ CENÁRIO ═══\n${cenarioTexto}`);
  if (perguntasTexto) blocks.push(`═══ PERGUNTAS ═══\n${perguntasTexto}`);

  // Avaliação a auditar — incluir campos enriquecidos se disponíveis
  const av = typeof resp.avaliacao_ia === 'string' ? JSON.parse(resp.avaliacao_ia) : resp.avaliacao_ia;
  blocks.push(`═══ AVALIAÇÃO A AUDITAR ═══\n${JSON.stringify(av, null, 2)}`);

  blocks.push(`═══ INSTRUÇÃO ═══
Verifique se esta avaliação é DEFENSÁVEL como produto Vertho.
Se for bem escrita mas metodologicamente fraca, PENALIZE.
Prefira rigor a elegância.`);

  return blocks.join('\n\n');
}

function processCheckResult(check: any): { status: string; check: any } {
  if (!check || check.nota === undefined) return { status: 'erro', check: null };

  // Validação: erro_grave força max 60
  if (check.erro_grave && check.nota > 60) {
    check.nota = 60;
  }

  // Status
  const status = check.nota >= 90 ? 'aprovado'
    : check.nota >= 80 ? 'aprovado_com_ajustes'
    : 'revisar';
  check.status = status;

  return { status, check };
}

export async function checkAvaliacoes(empresaId: string, aiConfig: AIConfig = {}) {
  const sb = createSupabaseAdmin();

  try {
    const { data: respostas, error: qErr } = await sb.from('respostas')
      .select('id, colaborador_id, competencia_id, cenario_id, r1, r2, r3, r4, avaliacao_ia, nivel_ia4')
      .eq('empresa_id', empresaId)
      .not('avaliacao_ia', 'is', null)
      .is('status_ia4', null);

    if (qErr) return { success: false, error: qErr.message };
    if (!respostas?.length) return { success: true, message: 'Nenhuma avaliação pendente de check' };

    const colabIds = [...new Set(respostas.map((r: any) => r.colaborador_id).filter(Boolean))];
    const { data: colabs } = await sb.from('colaboradores')
      .select('id, nome_completo, cargo, d_natural, i_natural, s_natural, c_natural, perfil_dominante')
      .in('id', colabIds);
    const colabMap: Record<string, any> = {};
    (colabs || []).forEach((c: any) => { colabMap[c.id] = c; });

    const model = aiConfig?.model || 'gemini-3-flash-preview';
    let checados = 0, erros = 0, ultimoErro = '';

    for (const resp of respostas) {
      try {
        const colab = colabMap[resp.colaborador_id] || {};

        let cenarioTexto = '', perguntasTexto = '';
        if (resp.cenario_id) {
          const { data: cen } = await sb.from('banco_cenarios')
            .select('titulo, descricao, alternativas')
            .eq('id', resp.cenario_id).maybeSingle();
          if (cen) {
            cenarioTexto = `${cen.titulo}\n${cen.descricao}`;
            const altObj = typeof cen.alternativas === 'object' && !Array.isArray(cen.alternativas) ? cen.alternativas : {};
            const pergs = altObj.perguntas || (Array.isArray(cen.alternativas) ? cen.alternativas : []);
            perguntasTexto = pergs.map((p: any, i: number) => `P${p.numero || i + 1}: ${p.texto || ''}`).join('\n');
          }
        }

        let compNome = '', reguaTexto = '';
        if (resp.competencia_id) {
          const { data: comp } = await sb.from('competencias')
            .select('nome, cod_comp').eq('id', resp.competencia_id).maybeSingle();
          compNome = comp?.nome || '';
          const { data: descs } = await sb.from('competencias')
            .select('cod_desc, nome_curto, n1_gap, n2_desenvolvimento, n3_meta, n4_referencia')
            .eq('empresa_id', empresaId).eq('cod_comp', comp?.cod_comp).not('cod_desc', 'is', null);
          if (descs?.length) {
            reguaTexto = descs.map((d: any, i: number) =>
              `D${i + 1} ${d.cod_desc}: ${d.nome_curto}\n  N1: ${d.n1_gap || '—'}\n  N2: ${d.n2_desenvolvimento || '—'}\n  N3: ${d.n3_meta || '—'}\n  N4: ${d.n4_referencia || '—'}`
            ).join('\n\n');
          }
        }

        let perfilCIS = '';
        if (colab.d_natural != null) {
          perfilCIS = `DISC: D=${colab.d_natural} I=${colab.i_natural} S=${colab.s_natural} C=${colab.c_natural} → ${colab.perfil_dominante || '—'}`;
        }

        const user = buildCheckUser(colab, compNome, perfilCIS, resp, reguaTexto, cenarioTexto, perguntasTexto);
        const resultado = await callAI(CHECK_SYSTEM, user, { model }, 8192);
        const raw = await extractJSON(resultado);
        const { status, check } = processCheckResult(raw);

        if (check) {
          const { error: updErr } = await sb.from('respostas').update({
            status_ia4: status,
            payload_ia4: check,
          }).eq('id', resp.id).select('id');

          if (!updErr) checados++;
          else { erros++; ultimoErro = updErr.message; }
        } else {
          erros++;
          ultimoErro = 'Check não retornou nota';
        }
      } catch (e: any) {
        erros++;
        ultimoErro = e.message;
      }
    }

    return {
      success: true,
      message: `Check IA4: ${checados} verificadas${erros ? `, ${erros} erros` : ''}${ultimoErro ? ` — ${ultimoErro}` : ''}`,
    };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function checarUmaResposta(respostaId: string, aiConfig: AIConfig = {}) {
  const sb = createSupabaseAdmin();
  try {
    const { data: resp } = await sb.from('respostas')
      .select('id, empresa_id, colaborador_id, competencia_id, cenario_id, r1, r2, r3, r4, avaliacao_ia, nivel_ia4')
      .eq('id', respostaId).single();
    if (!resp) return { success: false, error: 'Resposta não encontrada' };
    if (!resp.avaliacao_ia) return { success: false, error: 'Resposta não foi avaliada ainda' };

    await sb.from('respostas').update({ status_ia4: null, payload_ia4: null }).eq('id', respostaId).select('id');

    const { data: colab } = await sb.from('colaboradores')
      .select('id, nome_completo, cargo, d_natural, i_natural, s_natural, c_natural, perfil_dominante')
      .eq('id', resp.colaborador_id).maybeSingle();

    const model = aiConfig?.model || 'gemini-3-flash-preview';

    let cenarioTexto = '', perguntasTexto = '';
    if (resp.cenario_id) {
      const { data: cen } = await sb.from('banco_cenarios')
        .select('titulo, descricao, alternativas').eq('id', resp.cenario_id).maybeSingle();
      if (cen) {
        cenarioTexto = `${cen.titulo}\n${cen.descricao}`;
        const altObj = typeof cen.alternativas === 'object' && !Array.isArray(cen.alternativas) ? cen.alternativas : {};
        const pergs = altObj.perguntas || (Array.isArray(cen.alternativas) ? cen.alternativas : []);
        perguntasTexto = pergs.map((p: any, i: number) => `P${p.numero || i + 1}: ${p.texto || ''}`).join('\n');
      }
    }

    let compNome = '', reguaTexto = '';
    if (resp.competencia_id) {
      const { data: comp } = await sb.from('competencias')
        .select('nome, cod_comp').eq('id', resp.competencia_id).maybeSingle();
      compNome = comp?.nome || '';
      const { data: descs } = await sb.from('competencias')
        .select('cod_desc, nome_curto, n1_gap, n2_desenvolvimento, n3_meta, n4_referencia')
        .eq('empresa_id', resp.empresa_id).eq('cod_comp', comp?.cod_comp).not('cod_desc', 'is', null);
      if (descs?.length) {
        reguaTexto = descs.map((d: any, i: number) =>
          `D${i + 1} ${d.cod_desc}: ${d.nome_curto}\n  N1: ${d.n1_gap || '—'}\n  N2: ${d.n2_desenvolvimento || '—'}\n  N3: ${d.n3_meta || '—'}\n  N4: ${d.n4_referencia || '—'}`
        ).join('\n\n');
      }
    }

    let perfilCIS = '';
    if (colab?.d_natural != null) {
      perfilCIS = `DISC: D=${colab.d_natural} I=${colab.i_natural} S=${colab.s_natural} C=${colab.c_natural} → ${colab.perfil_dominante || '—'}`;
    }

    const user = buildCheckUser(colab, compNome, perfilCIS, resp, reguaTexto, cenarioTexto, perguntasTexto);
    const resultado = await callAI(CHECK_SYSTEM, user, { model }, 8192);
    const raw = await extractJSON(resultado);
    const { status, check } = processCheckResult(raw);

    if (check) {
      const { error: updErr } = await sb.from('respostas').update({
        status_ia4: status,
        payload_ia4: check,
      }).eq('id', respostaId).select('id');

      if (updErr) return { success: false, error: updErr.message };
      return { success: true, message: `Check: ${compNome} — ${check.nota}pts (${status})`, nota: check.nota, status };
    }
    return { success: false, error: 'Check não retornou nota' };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}
