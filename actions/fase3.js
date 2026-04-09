'use server';

import { createSupabaseAdmin } from '@/lib/supabase';
import { callAI } from './ai-client';
import { extractJSON } from './utils';

// ── IA4: Avaliar respostas (fiel ao GAS — modelo temático) ──────────────────

const IA4_SYSTEM = `Voce e o Motor de Avaliacao de Competencias da Vertho Mentor IA.
Sua tarefa e avaliar as 4 respostas de um profissional a um cenario situacional,
classificando-o nos 4 niveis de maturidade usando a regua fornecida,
e gerar feedback personalizado.

=== FILOSOFIA DA AVALIACAO ===
Esta avaliacao usa o MODELO TEMATICO:
- O profissional recebeu UM cenario padronizado e respondeu 4 perguntas tematicas
- Cada pergunta cobre descritores especificos da competencia
- Nivel 3 e o IDEAL (META). Qualquer nota abaixo de 3 e GAP
- O perfil CIS NAO influencia a nota — influencia APENAS o feedback

=== REGRAS DE AVALIACAO — INVIOLAVEIS ===
1. AVALIE SOMENTE COM BASE NA REGUA FORNECIDA. Nao invente criterios.
2. EVIDENCIA OU NAO CONTA. Intencao nao e evidencia. "Eu faria..." generico nao e evidencia. Acao concreta descrita e evidencia.
3. REGRA DE EVIDENCIA MINIMA: Resposta vaga, curta ou generica → maximo N1.
4. NA DUVIDA ENTRE DOIS NIVEIS → ESCOLHER O INFERIOR. Sempre.
5. RESPOSTA PERFEITA DEMAIS: Sem acoes concretas para o cenario → tende a N2-N3, nao N4.
6. RESPOSTA QUE MISTURA NIVEIS: Priorizar o comportamento predominante. Limitacoes graves pesam mais.
7. CONFIANCA: 0-100 por descritor. Abaixo de 70 = evidencia insuficiente.

=== REGRA CRITICA — AUSENCIA DE MENCAO NAO E NIVEL 1 ===
N1 significa postura EXCLUDENTE, PASSIVA ou que IGNORA a competencia.
Se a resposta demonstra acoes concretas e intencionais em QUALQUER descritor, o nivel minimo e N2.
NUNCA atribua N1 a quem demonstrou acao concreta — mesmo que outros descritores nao tenham sido mencionados.
TRAVA ANTI-REBAIXAMENTO: Se demonstrou acoes de N3 em qualquer resposta, nivel geral MINIMO e N2.

=== PROCESSO DE AVALIACAO — 2 ETAPAS ===

ETAPA 1 — AVALIACAO POR RESPOSTA (R1, R2, R3, R4):
a) Identifique os descritores cobertos por aquela pergunta
b) Extraia evidencias textuais da resposta
c) Compare com a regua de maturidade (N1, N2, N3, N4)
d) Atribua nota_decimal com 2 casas (1.00 a 4.00) para cada descritor
   1.00 = inicio N1, 2.00 = inicio N2, 3.00 = META, 4.00 = Referencia
   Valores intermediarios = transicao (ex: 1.67 = comportamentos parciais de N2)
e) Atribua confianca (0-100)

ETAPA 2 — CONSOLIDACAO + FEEDBACK:
a) nota_decimal final por descritor = media quando aparece em multiplas respostas
   "nivel" = inteiro arredondado para BAIXO (1.67 → N1, 2.33 → N2)
b) media_descritores = media aritmetica das nota_decimal de todos os descritores
c) TRAVAS:
   - Descritor critico com nivel N1 → nivel geral MAXIMO N2
   - Mais de 3 descritores N1 → nivel geral N1
   - Arredondar para baixo (2.6 = N2, nao N3)
d) nivel_geral: 1, 2, 3 ou 4
e) GAP = 3 - nivel_geral (se positivo, senao 0)
f) Feedback: positivo e construtivo, sem jargao tecnico.
   ABRIR com o que o profissional fez bem, depois gaps com tom de mentor.

=== REGRA ANTI-ALUCINACAO (CRITICA) ===
PROIBIDO inventar dados que nao estejam nas respostas:
- NAO inventar nomes de pessoas ou situacoes
- Use APENAS: nome do profissional, cargo, competencia e trechos reais das respostas

CAMPOS OBRIGATORIOS (JSON invalido se vazio):
- feedback: NUNCA vazio ou generico
- pontos_fortes: pelo menos 1 item
- gaps_prioritarios: todos os descritores com nivel < 3

Retorne APENAS JSON valido:
{
  "profissional": "nome",
  "cargo": "cargo",
  "competencia": {"codigo": "COD", "nome": "Nome"},
  "avaliacao_por_resposta": {
    "R1": {"descritores_avaliados": [{"numero": 1, "nome": "desc", "nota_decimal": 2.33, "nivel": 2, "confianca": 85, "evidencia": "trecho literal"}]},
    "R2": {"descritores_avaliados": []},
    "R3": {"descritores_avaliados": []},
    "R4": {"descritores_avaliados": []}
  },
  "consolidacao": {
    "notas_por_descritor": {"D1": {"nome": "", "nota_decimal": 1.67, "nivel": 1, "confianca": 85}},
    "media_descritores": 2.25,
    "nivel_geral": 2,
    "gap": 1,
    "confianca_geral": 77,
    "travas_aplicadas": ["Nenhuma"]
  },
  "descritores_destaque": {
    "pontos_fortes": [{"descritor": "", "nivel": 3, "evidencia_resumida": ""}],
    "gaps_prioritarios": [{"descritor": "", "nivel": 1, "o_que_faltou": ""}]
  },
  "feedback": "Paragrafo construtivo e especifico."
}`;

export async function rodarIA4(empresaId, aiConfig = {}) {
  const sb = createSupabaseAdmin();
  try {
    // Buscar respostas pendentes
    const { data: respostas, error: respErr } = await sb.from('respostas')
      .select('*')
      .eq('empresa_id', empresaId)
      .is('avaliacao_ia', null)
      .not('r1', 'is', null);

    if (respErr) return { success: false, error: respErr.message };
    if (!respostas?.length) return { success: true, message: 'Nenhuma resposta pendente de avaliação' };

    const { data: empresa } = await sb.from('empresas')
      .select('nome, segmento').eq('id', empresaId).single();

    // Buscar colaboradores com perfil CIS
    const colabIds = [...new Set(respostas.map(r => r.colaborador_id).filter(Boolean))];
    const { data: colabs } = await sb.from('colaboradores')
      .select('id, nome_completo, cargo, d_natural, i_natural, s_natural, c_natural, lid_executivo, lid_motivador, lid_metodico, lid_sistematico, perfil_dominante, comp_ousadia, comp_comando, comp_objetividade, comp_assertividade, comp_persuasao, comp_extroversao, comp_entusiasmo, comp_sociabilidade, comp_empatia, comp_paciencia, comp_persistencia, comp_planejamento, comp_organizacao, comp_detalhismo, comp_prudencia, comp_concentracao')
      .in('id', colabIds);
    const colabMap = {};
    (colabs || []).forEach(c => { colabMap[c.id] = c; });

    // Buscar PPP
    let contextoPPP = '';
    try {
      const { data: ppp } = await sb.from('ppp_escolas')
        .select('extracao').eq('empresa_id', empresaId).eq('status', 'extraido')
        .order('extracted_at', { ascending: false }).limit(1).maybeSingle();
      if (ppp?.extracao) {
        const ext = typeof ppp.extracao === 'string' ? JSON.parse(ppp.extracao) : ppp.extracao;
        contextoPPP = JSON.stringify(ext).slice(0, 2000);
      }
    } catch {}

    let avaliadas = 0, erros = 0, ultimoErro = '';

    for (const resp of respostas) {
      try {
        const colab = colabMap[resp.colaborador_id] || {};

        // Buscar cenário com perguntas
        let cenarioTexto = '', perguntasTexto = '';
        if (resp.cenario_id) {
          const { data: cen } = await sb.from('banco_cenarios')
            .select('titulo, descricao, alternativas')
            .eq('id', resp.cenario_id).maybeSingle();
          if (cen) {
            cenarioTexto = `${cen.titulo}\n${cen.descricao}`;
            const pergs = Array.isArray(cen.alternativas) ? cen.alternativas : [];
            perguntasTexto = pergs.map((p, i) => {
              const num = p.numero || i + 1;
              return `P${num}: ${p.texto || ''}\nDescritores primarios: ${Array.isArray(p.descritores_primarios) ? p.descritores_primarios.map(d => `D${d}`).join(', ') : ''}\nDiferenciacao: ${p.o_que_diferencia_niveis || ''}`;
            }).join('\n\n');
          }
        }

        // Buscar competência com descritores N1-N4
        let compNome = '', compCod = '', descritoresTexto = '';
        if (resp.competencia_id) {
          const { data: comp } = await sb.from('competencias')
            .select('nome, cod_comp, descricao').eq('id', resp.competencia_id).maybeSingle();
          compNome = comp?.nome || '';
          compCod = comp?.cod_comp || '';

          // Buscar descritores com régua N1-N4
          const { data: descs } = await sb.from('competencias')
            .select('cod_desc, nome_curto, descritor_completo, n1_gap, n2_desenvolvimento, n3_meta, n4_referencia')
            .eq('empresa_id', empresaId)
            .eq('cod_comp', comp?.cod_comp)
            .not('cod_desc', 'is', null);

          if (descs?.length) {
            descritoresTexto = descs.map((d, i) => {
              return `DESCRITOR ${i + 1}: ${d.cod_desc} — ${d.nome_curto || d.descritor_completo || ''}
N1 (Emergente): ${d.n1_gap || 'Não definido'}
N2 (Em desenvolvimento): ${d.n2_desenvolvimento || 'Não definido'}
N3 (Proficiente/META): ${d.n3_meta || 'Não definido'}
N4 (Referência): ${d.n4_referencia || 'Não definido'}`;
            }).join('\n\n');
          }
        }

        // Perfil CIS formatado
        let perfilCIS = '';
        if (colab.d_natural != null) {
          perfilCIS = `PERFIL CIS:
DISC: D=${colab.d_natural} | I=${colab.i_natural} | S=${colab.s_natural} | C=${colab.c_natural}
Dominante: ${colab.perfil_dominante || '—'}
Lideranca: Executor=${colab.lid_executivo || 0}% | Motivador=${colab.lid_motivador || 0}% | Metodico=${colab.lid_metodico || 0}% | Sistematico=${colab.lid_sistematico || 0}%`;
        }

        const user = `=== DADOS DO PROFISSIONAL ===
NOME: ${colab.nome_completo || '—'}
CARGO: ${colab.cargo || '—'}
EMPRESA: ${empresa.nome} (${empresa.segmento})

${perfilCIS}

${contextoPPP ? `=== CONTEXTO DA EMPRESA ===\n${contextoPPP}\n` : ''}
=== COMPETENCIA AVALIADA ===
CODIGO: ${compCod}
NOME: ${compNome}

=== DESCRITORES (REGUA N1-N4) ===
${descritoresTexto || '(descritores não disponíveis)'}

=== CENARIO APRESENTADO ===
${cenarioTexto}

=== PERGUNTAS E MAPEAMENTO ===
${perguntasTexto}

=== RESPOSTAS DO PROFISSIONAL ===
PERGUNTA 1: ${resp.r1 || '(sem resposta)'}
PERGUNTA 2: ${resp.r2 || '(sem resposta)'}
PERGUNTA 3: ${resp.r3 || '(sem resposta)'}
PERGUNTA 4: ${resp.r4 || '(sem resposta)'}`;

        const resultado = await callAI(IA4_SYSTEM, user, aiConfig, 16000);
        const avaliacao = await extractJSON(resultado);

        if (avaliacao) {
          const nivelGeral = avaliacao.consolidacao?.nivel_geral || avaliacao.nivel_geral || null;
          const notaDecimal = avaliacao.consolidacao?.media_descritores || avaliacao.nota_decimal || null;

          const { error: updErr } = await sb.from('respostas').update({
            avaliacao_ia: avaliacao,
            nivel_ia4: nivelGeral,
            nota_ia4: notaDecimal,
            pontos_fortes: avaliacao.descritores_destaque?.pontos_fortes?.map(p => p.descritor || p).join('; ') || null,
            pontos_atencao: avaliacao.descritores_destaque?.gaps_prioritarios?.map(g => g.descritor || g).join('; ') || null,
            feedback_ia4: avaliacao.feedback || null,
            avaliado_em: new Date().toISOString(),
          }).eq('id', resp.id).select('id');

          if (!updErr) avaliadas++;
          else { erros++; ultimoErro = updErr.message; }
        } else {
          erros++;
          ultimoErro = 'IA não retornou JSON válido';
        }
      } catch (e) {
        erros++;
        ultimoErro = e.message;
      }
    }

    return { success: true, message: `IA4 concluída: ${avaliadas} avaliadas${erros ? `, ${erros} erros` : ''}${ultimoErro ? ` — ${ultimoErro}` : ''}` };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ── Re-avaliar resposta (com feedback do check) ─────────────────────────────

export async function reavaliarResposta(respostaId, aiConfig = {}) {
  const sb = createSupabaseAdmin();
  try {
    // Buscar resposta com check anterior
    const { data: resp } = await sb.from('respostas')
      .select('id, empresa_id, colaborador_id, competencia_id, cenario_id, r1, r2, r3, r4, payload_ia4')
      .eq('id', respostaId).single();
    if (!resp) return { success: false, error: 'Resposta não encontrada' };

    // Extrair feedback do check
    const check = typeof resp.payload_ia4 === 'string' ? JSON.parse(resp.payload_ia4) : resp.payload_ia4;
    const feedbackCheck = [check?.justificativa, check?.revisao].filter(Boolean).join('\n');

    // Limpar avaliação anterior (manter status_ia4 null para re-check)
    const { error: clearErr } = await sb.from('respostas').update({
      avaliacao_ia: null, nivel_ia4: null, nota_ia4: null,
      status_ia4: null, payload_ia4: null,
      pontos_fortes: null, pontos_atencao: null, feedback_ia4: null, avaliado_em: null,
    }).eq('id', respostaId).select('id');
    if (clearErr) return { success: false, error: `Limpar avaliação falhou: ${clearErr.message}` };

    // Buscar dados necessários (mesmo fluxo do rodarIA4)
    const { data: empresa } = await sb.from('empresas')
      .select('nome, segmento').eq('id', resp.empresa_id).single();

    const { data: colab } = await sb.from('colaboradores')
      .select('id, nome_completo, cargo, d_natural, i_natural, s_natural, c_natural, perfil_dominante, lid_executivo, lid_motivador, lid_metodico, lid_sistematico')
      .eq('id', resp.colaborador_id).single();

    let cenarioTexto = '', perguntasTexto = '';
    if (resp.cenario_id) {
      const { data: cen } = await sb.from('banco_cenarios')
        .select('titulo, descricao, alternativas').eq('id', resp.cenario_id).maybeSingle();
      if (cen) {
        cenarioTexto = `${cen.titulo}\n${cen.descricao}`;
        const pergs = Array.isArray(cen.alternativas) ? cen.alternativas : [];
        perguntasTexto = pergs.map((p, i) => `P${p.numero || i + 1}: ${p.texto || ''}\nDescritores: ${Array.isArray(p.descritores_primarios) ? p.descritores_primarios.map(d => `D${d}`).join(', ') : ''}\nDiferenciacao: ${p.o_que_diferencia_niveis || ''}`).join('\n\n');
      }
    }

    let compNome = '', compCod = '', descritoresTexto = '';
    if (resp.competencia_id) {
      const { data: comp } = await sb.from('competencias')
        .select('nome, cod_comp').eq('id', resp.competencia_id).maybeSingle();
      compNome = comp?.nome || ''; compCod = comp?.cod_comp || '';
      const { data: descs } = await sb.from('competencias')
        .select('cod_desc, nome_curto, descritor_completo, n1_gap, n2_desenvolvimento, n3_meta, n4_referencia')
        .eq('empresa_id', resp.empresa_id).eq('cod_comp', comp?.cod_comp).not('cod_desc', 'is', null);
      if (descs?.length) {
        descritoresTexto = descs.map((d, i) => `DESCRITOR ${i + 1}: ${d.cod_desc} — ${d.nome_curto || ''}\nN1: ${d.n1_gap || ''}\nN2: ${d.n2_desenvolvimento || ''}\nN3: ${d.n3_meta || ''}\nN4: ${d.n4_referencia || ''}`).join('\n\n');
      }
    }

    let perfilCIS = '';
    if (colab?.d_natural != null) {
      perfilCIS = `DISC: D=${colab.d_natural} | I=${colab.i_natural} | S=${colab.s_natural} | C=${colab.c_natural}\nDominante: ${colab.perfil_dominante || '—'}`;
    }

    // Montar prompt com feedback do check
    let user = `=== DADOS DO PROFISSIONAL ===\nNOME: ${colab?.nome_completo || '—'}\nCARGO: ${colab?.cargo || '—'}\nEMPRESA: ${empresa?.nome || '—'}\n\n${perfilCIS}\n\n=== COMPETENCIA ===\n${compCod} — ${compNome}\n\n=== DESCRITORES ===\n${descritoresTexto || '(não disponíveis)'}\n\n=== CENARIO ===\n${cenarioTexto}\n\n=== PERGUNTAS ===\n${perguntasTexto}\n\n=== RESPOSTAS ===\nR1: ${resp.r1 || '—'}\nR2: ${resp.r2 || '—'}\nR3: ${resp.r3 || '—'}\nR4: ${resp.r4 || '—'}`;

    if (feedbackCheck) {
      user += `\n\n=== FEEDBACK DA AUDITORIA ANTERIOR (CORRIJA ESTES PONTOS) ===\n${feedbackCheck}`;
    }

    const resultado = await callAI(IA4_SYSTEM, user, aiConfig, 16000);
    const avaliacao = await extractJSON(resultado);

    if (!avaliacao) return { success: false, error: 'IA não retornou avaliação válida' };

    const nivelGeral = avaliacao.consolidacao?.nivel_geral || avaliacao.nivel_geral || null;
    const notaDecimal = avaliacao.consolidacao?.media_descritores || avaliacao.nota_decimal || null;

    const { data: updated, error: updErr } = await sb.from('respostas').update({
      avaliacao_ia: avaliacao,
      nivel_ia4: nivelGeral,
      nota_ia4: notaDecimal,
      pontos_fortes: avaliacao.descritores_destaque?.pontos_fortes?.map(p => p.descritor || p).join('; ') || null,
      pontos_atencao: avaliacao.descritores_destaque?.gaps_prioritarios?.map(g => g.descritor || g).join('; ') || null,
      feedback_ia4: avaliacao.feedback || null,
      avaliado_em: new Date().toISOString(),
    }).eq('id', respostaId).select('id');

    if (updErr) return { success: false, error: `Re-avaliação UPDATE falhou: ${updErr.message}` };
    if (!updated?.length) return { success: false, error: 'Re-avaliação: 0 linhas atualizadas' };

    return { success: true, message: `Re-avaliado: ${compNome} — N${nivelGeral}` };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ── Re-checar UMA resposta ───────────────────────────────────────────────────

export async function rechecarResposta(respostaId, aiConfig = {}) {
  const { checarUmaResposta } = await import('./check-ia4');
  return checarUmaResposta(respostaId, aiConfig);
}

// ── Ver fila de IA4 ─────────────────────────────────────────────────────────

export async function verFilaIA4(empresaId) {
  const sb = createSupabaseAdmin();
  try {
    const { count: pendentes } = await sb.from('respostas')
      .select('id', { count: 'exact', head: true })
      .eq('empresa_id', empresaId)
      .is('avaliacao_ia', null)
      .not('r1', 'is', null);

    const { count: avaliadas } = await sb.from('respostas')
      .select('id', { count: 'exact', head: true })
      .eq('empresa_id', empresaId)
      .not('avaliacao_ia', 'is', null);

    return {
      success: true,
      message: `Fila IA4: ${pendentes || 0} pendentes, ${avaliadas || 0} avaliadas`,
      pendentes: pendentes || 0,
      avaliadas: avaliadas || 0,
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ── Carregar respostas com avaliação ─────────────────────────────────────────

export async function loadRespostasAvaliadas(empresaId) {
  const sb = createSupabaseAdmin();
  const { data, error } = await sb.from('respostas')
    .select('id, colaborador_id, competencia_id, cenario_id, r1, r2, r3, r4, nivel_simulado, avaliacao_ia, nivel_ia4, nota_ia4, status_ia4, payload_ia4, pontos_fortes, pontos_atencao, feedback_ia4, created_at')
    .eq('empresa_id', empresaId)
    .not('r1', 'is', null)
    .order('created_at', { ascending: false });

  if (error || !data?.length) return [];

  const colabIds = [...new Set(data.map(r => r.colaborador_id).filter(Boolean))];
  const colabMap = {};
  if (colabIds.length) {
    const { data: colabs } = await sb.from('colaboradores').select('id, nome_completo, cargo').in('id', colabIds);
    (colabs || []).forEach(c => { colabMap[c.id] = c; });
  }

  const compIds = [...new Set(data.map(r => r.competencia_id).filter(Boolean))];
  const compMap = {};
  if (compIds.length) {
    const { data: comps } = await sb.from('competencias').select('id, nome, cod_comp').in('id', compIds);
    (comps || []).forEach(c => { compMap[c.id] = c; });
  }

  const cenIds = [...new Set(data.map(r => r.cenario_id).filter(Boolean))];
  const cenMap = {};
  if (cenIds.length) {
    const { data: cens } = await sb.from('banco_cenarios').select('id, titulo, alternativas').in('id', cenIds);
    (cens || []).forEach(c => { cenMap[c.id] = c; });
  }

  return data.map(r => ({
    ...r,
    colaborador_nome: colabMap[r.colaborador_id]?.nome_completo || '—',
    colaborador_cargo: colabMap[r.colaborador_id]?.cargo || '—',
    competencia_nome: compMap[r.competencia_id]?.nome || '—',
    competencia_cod: compMap[r.competencia_id]?.cod_comp || '',
    cenario_titulo: cenMap[r.cenario_id]?.titulo || '—',
    cenario_perguntas: cenMap[r.cenario_id]?.alternativas || [],
  }));
}

// ── Relatórios ──────────────────────────────────────────────────────────────

export async function gerarRelatoriosIndividuais(empresaId, aiConfig = {}) {
  return { success: true, message: 'Relatórios individuais: funcionalidade em desenvolvimento' };
}

export async function gerarRelatorioGestor(empresaId, aiConfig = {}) {
  return { success: true, message: 'Relatório gestor: funcionalidade em desenvolvimento' };
}

export async function gerarRelatorioRH(empresaId, aiConfig = {}) {
  return { success: true, message: 'Relatório RH: funcionalidade em desenvolvimento' };
}

export async function enviarRelIndividuais(empresaId) {
  return { success: true, message: 'Envio individuais: funcionalidade em desenvolvimento' };
}

export async function enviarRelGestor(empresaId) {
  return { success: true, message: 'Envio gestor: funcionalidade em desenvolvimento' };
}

export async function enviarRelRH(empresaId) {
  return { success: true, message: 'Envio RH: funcionalidade em desenvolvimento' };
}
