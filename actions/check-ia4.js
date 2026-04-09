'use server';

import { createSupabaseAdmin } from '@/lib/supabase';
import { callAI } from './ai-client';
import { extractJSON } from './utils';

const CHECK_SYSTEM = `Voce e um auditor de qualidade de Assessment Comportamental.
Sua tarefa e verificar se a avaliacao gerada por uma IA e ACEITAVEL — nao perfeita.

FILOSOFIA DA AUDITORIA:
- Voce NAO esta refazendo a avaliacao. Esta verificando se ela e RAZOAVEL.
- Diferencas de +-1 nivel em descritores individuais sao ACEITAVEIS (margens de interpretacao).
- O foco e detectar ERROS GRAVES: nivel completamente errado, feedback generico, matematica errada.
- Se o nivel geral esta dentro de +-1 do que voce daria, a coerencia e BOA.
- Avaliacoes imperfeitas mas razoaveis devem receber nota 85-95.
- Reserve notas < 70 para avaliacoes com erros OBJETIVOS.

Avalie em 4 dimensoes (25pts cada = 100pts):

1. EVIDENCIAS E NIVEIS (25pts)
   - Descritores tem evidencia textual da resposta? (pode ser parafrase)
   - Nivel geral esta dentro de +-1 do que a regua indica? Se sim → 20-25pts
   - Penalize APENAS se: nivel N3+ sem NENHUMA evidencia concreta, ou resposta claramente N1 avaliada como N3+

2. COERENCIA DA CONSOLIDACAO (25pts)
   Verificacao matematica:
   - media_descritores → nivel_geral: arredondado para baixo? (2.6 → N2)
   - Travas: descritor critico N1 → max N2; mais de 3 N1 → N1
   - GAP = 3 - nivel_geral correto?
   - Matematica correta → 23-25pts. Erro leve → 18-22pts

3. FEEDBACK + ESPECIFICIDADE (25pts)
   - Feedback menciona algo especifico das respostas? (nao precisa citar literalmente)
   - Tom construtivo e personalizado?
   - ERRO GRAVE (→ nota max 60 TOTAL): feedback 100% generico que serviria para qualquer pessoa
   - Pontos fortes citam evidencias reais? Gaps sao relevantes?

4. DESENVOLVIMENTO / RECOMENDACOES (25pts)
   - Gaps prioritarios sao acionaveis?
   - Pontos de desenvolvimento fazem sentido para o nivel identificado?
   - NAO sugere recursos externos (livros, podcasts)? Se sim, penalize -5pts

Nota >= 90 = Aprovado | < 90 = Revisar
ERRO GRAVE = nota maxima 60 (feedback generico, nivel totalmente errado, alucinacao)

Retorne APENAS JSON valido:
{
  "nota": 87,
  "status": "aprovado|revisar",
  "erro_grave": false,
  "dimensoes": {
    "evidencias_niveis": 22,
    "consolidacao": 23,
    "feedback_especificidade": 21,
    "desenvolvimento": 21
  },
  "justificativa": "O que esta bom e o que precisa melhorar.",
  "revisao": "O que corrigir (vazio se aprovado).",
  "alertas": []
}`;

export async function checkAvaliacoes(empresaId, aiConfig = {}) {
  const sb = createSupabaseAdmin();

  try {
    const { data: respostas, error: qErr } = await sb.from('respostas')
      .select('id, colaborador_id, competencia_id, cenario_id, r1, r2, r3, r4, avaliacao_ia, nivel_ia4')
      .eq('empresa_id', empresaId)
      .not('avaliacao_ia', 'is', null)
      .is('status_ia4', null);

    if (qErr) return { success: false, error: qErr.message };
    if (!respostas?.length) return { success: true, message: 'Nenhuma avaliação pendente de check' };

    // Buscar colaboradores
    const colabIds = [...new Set(respostas.map(r => r.colaborador_id).filter(Boolean))];
    const { data: colabs } = await sb.from('colaboradores')
      .select('id, nome_completo, cargo, d_natural, i_natural, s_natural, c_natural, perfil_dominante')
      .in('id', colabIds);
    const colabMap = {};
    (colabs || []).forEach(c => { colabMap[c.id] = c; });

    const model = aiConfig?.model || 'gemini-3-flash-preview';
    let checados = 0, erros = 0, ultimoErro = '';

    for (const resp of respostas) {
      try {
        const colab = colabMap[resp.colaborador_id] || {};

        // Cenário + perguntas
        let cenarioTexto = '', perguntasTexto = '';
        if (resp.cenario_id) {
          const { data: cen } = await sb.from('banco_cenarios')
            .select('titulo, descricao, alternativas')
            .eq('id', resp.cenario_id).maybeSingle();
          if (cen) {
            cenarioTexto = `${cen.titulo}\n${cen.descricao}`;
            const pergs = Array.isArray(cen.alternativas) ? cen.alternativas : [];
            perguntasTexto = pergs.map((p, i) => `P${p.numero || i + 1}: ${p.texto || ''}`).join('\n');
          }
        }

        // Competência + régua
        let compNome = '', reguaTexto = '';
        if (resp.competencia_id) {
          const { data: comp } = await sb.from('competencias')
            .select('nome, cod_comp').eq('id', resp.competencia_id).maybeSingle();
          compNome = comp?.nome || '';

          const { data: descs } = await sb.from('competencias')
            .select('cod_desc, nome_curto, n1_gap, n2_desenvolvimento, n3_meta, n4_referencia')
            .eq('empresa_id', empresaId).eq('cod_comp', comp?.cod_comp).not('cod_desc', 'is', null);

          if (descs?.length) {
            reguaTexto = descs.map((d, i) =>
              `D${i + 1} ${d.cod_desc}: ${d.nome_curto}\n  N1: ${d.n1_gap || '—'}\n  N2: ${d.n2_desenvolvimento || '—'}\n  N3: ${d.n3_meta || '—'}\n  N4: ${d.n4_referencia || '—'}`
            ).join('\n\n');
          }
        }

        // Perfil CIS
        let perfilCIS = '';
        if (colab.d_natural != null) {
          perfilCIS = `DISC: D=${colab.d_natural} I=${colab.i_natural} S=${colab.s_natural} C=${colab.c_natural} → ${colab.perfil_dominante || '—'}`;
        }

        const user = `COLABORADOR: ${colab.nome_completo || '—'} | CARGO: ${colab.cargo || '—'}
COMPETENCIA: ${compNome}
${perfilCIS ? `\n${perfilCIS}\n` : ''}
RESPOSTAS DO COLABORADOR:
R1: ${resp.r1 || '—'}
R2: ${resp.r2 || '—'}
R3: ${resp.r3 || '—'}
R4: ${resp.r4 || '—'}

${reguaTexto ? `REGUA DE MATURIDADE (N1-N4 por descritor):\n${reguaTexto}\n` : ''}
CENARIO:
${cenarioTexto}

PERGUNTAS:
${perguntasTexto}

AVALIACAO A AUDITAR:
${JSON.stringify(resp.avaliacao_ia, null, 2)}`;

        const resultado = await callAI(CHECK_SYSTEM, user, { model }, 8192);
        const check = await extractJSON(resultado);

        if (check?.nota !== undefined) {
          const { error: updErr } = await sb.from('respostas').update({
            status_ia4: check.nota >= 90 ? 'aprovado' : 'revisar',
            payload_ia4: check,
          }).eq('id', resp.id).select('id');

          if (!updErr) checados++;
          else { erros++; ultimoErro = updErr.message; }
        } else {
          erros++;
          ultimoErro = 'Check não retornou nota';
        }
      } catch (e) {
        erros++;
        ultimoErro = e.message;
      }
    }

    return {
      success: true,
      message: `Check IA4: ${checados} verificadas${erros ? `, ${erros} erros` : ''}${ultimoErro ? ` — ${ultimoErro}` : ''}`,
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ── Checar UMA resposta individual ──────────────────────────────────────────

export async function checarUmaResposta(respostaId, aiConfig = {}) {
  const sb = createSupabaseAdmin();
  try {
    const { data: resp } = await sb.from('respostas')
      .select('id, empresa_id, colaborador_id, competencia_id, cenario_id, r1, r2, r3, r4, avaliacao_ia, nivel_ia4')
      .eq('id', respostaId).single();
    if (!resp) return { success: false, error: 'Resposta não encontrada' };
    if (!resp.avaliacao_ia) return { success: false, error: 'Resposta não foi avaliada ainda' };

    // Limpar check anterior
    await sb.from('respostas').update({ status_ia4: null, payload_ia4: null }).eq('id', respostaId).select('id');

    // Buscar colaborador
    const { data: colab } = await sb.from('colaboradores')
      .select('id, nome_completo, cargo, d_natural, i_natural, s_natural, c_natural, perfil_dominante')
      .eq('id', resp.colaborador_id).maybeSingle();

    const model = aiConfig?.model || 'gemini-3-flash-preview';

    // Cenário + perguntas
    let cenarioTexto = '', perguntasTexto = '';
    if (resp.cenario_id) {
      const { data: cen } = await sb.from('banco_cenarios')
        .select('titulo, descricao, alternativas').eq('id', resp.cenario_id).maybeSingle();
      if (cen) {
        cenarioTexto = `${cen.titulo}\n${cen.descricao}`;
        const pergs = Array.isArray(cen.alternativas) ? cen.alternativas : [];
        perguntasTexto = pergs.map((p, i) => `P${p.numero || i + 1}: ${p.texto || ''}`).join('\n');
      }
    }

    // Competência + régua
    let compNome = '', reguaTexto = '';
    if (resp.competencia_id) {
      const { data: comp } = await sb.from('competencias')
        .select('nome, cod_comp').eq('id', resp.competencia_id).maybeSingle();
      compNome = comp?.nome || '';
      const { data: descs } = await sb.from('competencias')
        .select('cod_desc, nome_curto, n1_gap, n2_desenvolvimento, n3_meta, n4_referencia')
        .eq('empresa_id', resp.empresa_id).eq('cod_comp', comp?.cod_comp).not('cod_desc', 'is', null);
      if (descs?.length) {
        reguaTexto = descs.map((d, i) =>
          `D${i + 1} ${d.cod_desc}: ${d.nome_curto}\n  N1: ${d.n1_gap || '—'}\n  N2: ${d.n2_desenvolvimento || '—'}\n  N3: ${d.n3_meta || '—'}\n  N4: ${d.n4_referencia || '—'}`
        ).join('\n\n');
      }
    }

    let perfilCIS = '';
    if (colab?.d_natural != null) {
      perfilCIS = `DISC: D=${colab.d_natural} I=${colab.i_natural} S=${colab.s_natural} C=${colab.c_natural} → ${colab.perfil_dominante || '—'}`;
    }

    const user = `COLABORADOR: ${colab?.nome_completo || '—'} | CARGO: ${colab?.cargo || '—'}
COMPETENCIA: ${compNome}
${perfilCIS ? `\n${perfilCIS}\n` : ''}
RESPOSTAS:
R1: ${resp.r1 || '—'}
R2: ${resp.r2 || '—'}
R3: ${resp.r3 || '—'}
R4: ${resp.r4 || '—'}

${reguaTexto ? `REGUA DE MATURIDADE:\n${reguaTexto}\n` : ''}
CENARIO:\n${cenarioTexto}
PERGUNTAS:\n${perguntasTexto}

AVALIACAO A AUDITAR:
${JSON.stringify(resp.avaliacao_ia, null, 2)}`;

    const resultado = await callAI(CHECK_SYSTEM, user, { model }, 8192);
    const check = await extractJSON(resultado);

    if (check?.nota !== undefined) {
      const { error: updErr } = await sb.from('respostas').update({
        status_ia4: check.nota >= 90 ? 'aprovado' : 'revisar',
        payload_ia4: check,
      }).eq('id', respostaId).select('id');

      if (updErr) return { success: false, error: updErr.message };
      return { success: true, message: `Check: ${compNome} — ${check.nota}pts (${check.nota >= 90 ? 'aprovado' : 'revisar'})`, nota: check.nota };
    }
    return { success: false, error: 'Check não retornou nota' };
  } catch (err) {
    return { success: false, error: err.message };
  }
}
