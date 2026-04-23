'use server';

import { createSupabaseAdmin } from '@/lib/supabase';
import { tenantDb } from '@/lib/tenant-db';
import { callAI, type AIConfig } from './ai-client';
import { extractJSON } from './utils';

// ── IA4: Avaliar respostas (fiel ao GAS — modelo temático) ──────────────────

const IA4_SYSTEM = `Você é o Motor de Avaliação de Competências da Vertho Mentor IA.

═══ TAREFA ═══
Avaliar as 4 respostas de um profissional a um cenário situacional.
Gerar INSUMOS DE AVALIAÇÃO auditáveis — a consolidação final (média, travas, nível geral) será feita em código, NÃO por você.

═══ FILOSOFIA ═══
- Modelo temático: 1 cenário, 4 perguntas, cada pergunta cobre descritores específicos
- N3 = META (proficiente). Abaixo de N3 = gap. N4 = referência
- Perfil CIS/DISC NÃO altera nota — influencia APENAS o tom do feedback

═══ REGRAS DE AVALIAÇÃO — INVIOLÁVEIS ═══

1. AVALIE COM BASE EXCLUSIVA NA RÉGUA FORNECIDA. Não invente critérios.
2. EVIDÊNCIA OU NÃO CONTA:
   - Intenção não é evidência ("eu faria..." genérico)
   - Linguagem bonita não é evidência
   - Ação concreta descrita é evidência
3. RESPOSTA VAGA / CURTA / GENÉRICA → máximo N1
4. NA DÚVIDA ENTRE DOIS NÍVEIS → escolher o INFERIOR
5. N3 e N4 EXIGEM evidência robusta e consistente
   - N3: ação demonstrada com contexto + resultado esperado
   - N4: ação + visão sistêmica + impacto além do imediato
6. LIMITAÇÕES GRAVES pesam mais que pontos positivos isolados
7. AUSÊNCIA DE MENÇÃO NÃO É N1:
   - N1 = postura excludente/passiva/ignora
   - Se demonstrou ação concreta em QUALQUER descritor → mínimo N2

═══ REGRA ANTI-ALUCINAÇÃO ═══
PROIBIDO inventar dados não presentes nas respostas.
Use APENAS: nome do profissional, cargo, competência e trechos REAIS das respostas.

═══ PROCESSO OBRIGATÓRIO ═══

ETAPA 1 — AVALIAÇÃO POR RESPOSTA (R1, R2, R3, R4):
Para cada resposta:
a) Identifique descritores cobertos pela pergunta
b) Extraia evidências textuais (trechos ou paráfrases fiéis)
c) Identifique limites da evidência (o que faltou, o que ficou vago)
d) Sugira nota_decimal (1.00 a 4.00, 2 casas) por descritor
e) Atribua confiança (0.0 a 1.0) por descritor

ETAPA 2 — AVALIAÇÃO POR DESCRITOR (consolidação dos insumos):
Para cada descritor:
a) Reúna evidências de todas as respostas onde apareceu
b) Sugira nota_decimal final e nível sugerido (1, 2, 3 ou 4)
c) Classifique a sustentação: forte / fraca / insuficiente
d) Atribua confiança

ETAPA 3 — FEEDBACK:
a) Tom adaptado ao perfil CIS (se fornecido) — MAS nota NÃO muda
b) Abrir com pontos positivos (sandwich)
c) Gaps com tom de mentor (construtivo, não punitivo)
d) Recomendações práticas

═══ FORMATO JSON (APENAS JSON, sem markdown) ═══

{
  "profissional": "nome",
  "cargo": "cargo",
  "competencia": {"codigo": "COD", "nome": "Nome"},
  "avaliacao_por_resposta": {
    "R1": {
      "descritores_avaliados": [
        {"numero": 1, "nome": "desc", "nota_decimal": 2.33, "confianca": 0.85, "evidencia": "trecho literal", "limites": "o que faltou"}
      ]
    },
    "R2": {"descritores_avaliados": []},
    "R3": {"descritores_avaliados": []},
    "R4": {"descritores_avaliados": []}
  },
  "avaliacao_por_descritor": [
    {
      "numero": 1,
      "nome": "nome do descritor",
      "nota_decimal": 2.33,
      "nivel_sugerido": 2,
      "confianca": 0.80,
      "sustentacao": "forte",
      "evidencias": [
        {"resposta": "R1", "trecho": "trecho literal ou paráfrase fiel", "forca_evidencia": "fraca|moderada|forte"}
      ],
      "limites_da_evidencia": ["o que não foi demonstrado"],
      "racional": "Por que este nível e não outro (1 frase)"
    }
  ],
  "insumos_consolidacao": {
    "descritores_com_evidencia_forte": ["D1", "D3"],
    "descritores_com_evidencia_fraca": ["D2"],
    "descritores_sem_sustentacao": ["D5"],
    "alertas_metodologicos": ["alerta se houver"]
  },
  "descritores_destaque": {
    "pontos_fortes": [{"descritor": "nome", "nivel": 3, "evidencia_resumida": ""}],
    "gaps_prioritarios": [{"descritor": "nome", "nivel": 1, "o_que_faltou": ""}]
  },
  "feedback": {
    "tom_base": "acolhedor / direto / técnico (baseado no perfil CIS)",
    "resumo_geral": "2-3 frases de visão geral",
    "mensagem_positiva": "O que fez bem (específico)",
    "mensagem_construtiva": "Onde melhorar (específico, tom mentor)",
    "recomendacoes": ["ação prática 1", "ação prática 2"]
  },
  "recomendacoes_pdi": [
    {
      "descritor_foco": "D1",
      "nivel_atual_sugerido": 2,
      "nivel_meta": 3,
      "acao": "ação prática sugerida",
      "por_que_importa": "frase curta",
      "barreira_provavel": "frase curta"
    }
  ]
}

REGRAS DO JSON:
- nota_decimal: 1.00 a 4.00
- confianca: 0.0 a 1.0
- sustentacao: "forte" | "fraca" | "insuficiente"
- NÃO calcule media_descritores, nivel_geral, gap ou travas — isso é feito em código`;

export async function rodarIA4(empresaId: string, aiConfig: AIConfig = {}) {
  if (!empresaId) return { success: false, error: 'empresaId obrigatório' };
  const sbRaw = createSupabaseAdmin();
  const tdb = tenantDb(empresaId);
  try {
    // Buscar respostas pendentes
    const { data: respostas, error: respErr } = await tdb.from('respostas')
      .select('*')
      .is('avaliacao_ia', null)
      .not('r1', 'is', null);

    if (respErr) return { success: false, error: respErr.message };
    if (!respostas?.length) return { success: true, message: 'Nenhuma resposta pendente de avaliação' };

    // empresas: id é o tenant — sem empresa_id; usar raw
    const { data: empresa } = await sbRaw.from('empresas')
      .select('nome, segmento').eq('id', empresaId).single();

    // Buscar colaboradores com perfil CIS
    const colabIds = [...new Set(respostas.map((r: any) => r.colaborador_id).filter(Boolean))];
    const { data: colabs } = await tdb.from('colaboradores')
      .select('id, nome_completo, cargo, d_natural, i_natural, s_natural, c_natural, lid_executivo, lid_motivador, lid_metodico, lid_sistematico, perfil_dominante, comp_ousadia, comp_comando, comp_objetividade, comp_assertividade, comp_persuasao, comp_extroversao, comp_entusiasmo, comp_sociabilidade, comp_empatia, comp_paciencia, comp_persistencia, comp_planejamento, comp_organizacao, comp_detalhismo, comp_prudencia, comp_concentracao')
      .in('id', colabIds);
    const colabMap: Record<string, any> = {};
    (colabs || []).forEach((c: any) => { colabMap[c.id] = c; });

    // Buscar PPP
    let contextoPPP = '';
    try {
      const { data: ppp } = await tdb.from('ppp_escolas')
        .select('extracao').eq('status', 'extraido')
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

        // Buscar cenário com perguntas — banco_cenarios é misto (global + tenant);
        // busca por id usa raw pra cobrir ambos os casos.
        let cenarioTexto = '', perguntasTexto = '';
        if (resp.cenario_id) {
          const { data: cen } = await sbRaw.from('banco_cenarios')
            .select('titulo, descricao, alternativas')
            .eq('id', resp.cenario_id).maybeSingle();
          if (cen) {
            cenarioTexto = `${cen.titulo}\n${cen.descricao}`;
            const altObj = typeof cen.alternativas === 'object' && !Array.isArray(cen.alternativas) ? cen.alternativas : {};
            const pergs = altObj.perguntas || (Array.isArray(cen.alternativas) ? cen.alternativas : []);
            perguntasTexto = pergs.map((p: any, i: number) => {
              const num = p.numero || i + 1;
              return `P${num}: ${p.texto || ''}\nDescritores primarios: ${Array.isArray(p.descritores_primarios) ? p.descritores_primarios.map((d: any) => `D${d}`).join(', ') : ''}\nDiferenciacao: ${p.o_que_diferencia_niveis || ''}`;
            }).join('\n\n');
          }
        }

        // Buscar competência com descritores N1-N4
        let compNome = '', compCod = '', descritoresTexto = '';
        if (resp.competencia_id) {
          const { data: comp } = await tdb.from('competencias')
            .select('nome, cod_comp, descricao').eq('id', resp.competencia_id).maybeSingle();
          compNome = comp?.nome || '';
          compCod = comp?.cod_comp || '';

          // Buscar descritores com régua N1-N4
          const { data: descs } = await tdb.from('competencias')
            .select('cod_desc, nome_curto, descritor_completo, n1_gap, n2_desenvolvimento, n3_meta, n4_referencia')
            .eq('cod_comp', comp?.cod_comp)
            .not('cod_desc', 'is', null);

          if (descs?.length) {
            descritoresTexto = descs.map((d: any, i: number) => {
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

        const userBlocks: string[] = [];

        userBlocks.push(`═══ PROFISSIONAL ═══
Nome: ${colab.nome_completo || '—'}
Cargo: ${colab.cargo || '—'}`);

        userBlocks.push(`═══ EMPRESA ═══
${empresa.nome} (${empresa.segmento})`);

        if (contextoPPP) {
          userBlocks.push(`═══ CONTEXTO INSTITUCIONAL ═══\n${contextoPPP}`);
        }

        if (perfilCIS) {
          userBlocks.push(`═══ PERFIL COMPORTAMENTAL ═══\n${perfilCIS}\nNOTA: O perfil NÃO altera a nota. Influencia APENAS o tom do feedback.`);
        }

        userBlocks.push(`═══ COMPETÊNCIA AVALIADA ═══
Código: ${compCod}
Nome: ${compNome}`);

        userBlocks.push(`═══ RÉGUA DE MATURIDADE ═══\n${descritoresTexto || '(descritores não disponíveis)'}`);

        if (cenarioTexto) {
          userBlocks.push(`═══ CENÁRIO APRESENTADO ═══\n${cenarioTexto}`);
        }

        if (perguntasTexto) {
          userBlocks.push(`═══ PERGUNTAS E MAPEAMENTO ═══\n${perguntasTexto}`);
        }

        userBlocks.push(`═══ RESPOSTAS DO PROFISSIONAL ═══
R1: ${resp.r1 || '(sem resposta)'}
R2: ${resp.r2 || '(sem resposta)'}
R3: ${resp.r3 || '(sem resposta)'}
R4: ${resp.r4 || '(sem resposta)'}`);

        userBlocks.push(`═══ INSTRUÇÃO DE AVALIAÇÃO ═══
1. Leia cada resposta SEPARADAMENTE antes de avaliar
2. Extraia evidências textuais REAIS (não invente)
3. Compare com a régua — cada nível tem critérios específicos
4. NÃO assuma comportamento não dito
5. NÃO trate intenção como evidência suficiente
6. Descritors sem evidência suficiente: declare como "insuficiente"
7. Gere insumos — a consolidação matemática é feita depois`);

        const user = userBlocks.join('\n\n');

        let resultado = await callAI(IA4_SYSTEM, user, aiConfig, 8192);
        let avaliacao = await extractJSON(resultado);

        // Retry 1x se IA não retornou JSON válido na primeira tentativa
        if (!avaliacao) {
          console.warn(`[IA4] retry para ${resp.nome_colaborador}: primeira resposta sem JSON (${(resultado || '').slice(0, 200)}...)`);
          const userRetry = `${user}\n\n=== ATENÇÃO ===\nSua resposta anterior não foi um JSON válido. Retorne APENAS o JSON, sem texto antes ou depois, sem markdown.`;
          resultado = await callAI(IA4_SYSTEM, userRetry, aiConfig, 8192);
          avaliacao = await extractJSON(resultado);
        }

        if (avaliacao) {
          // ── Consolidação em código (não mais no prompt) ──
          const descPorDescritor = avaliacao.avaliacao_por_descritor || [];

          // Calcular notas consolidadas
          const notasPorDesc: Record<string, any> = {};
          for (const d of descPorDescritor) {
            const key = `D${d.numero}`;
            const nota = Math.max(1.0, Math.min(4.0, d.nota_decimal || 1.0));
            const nivel = Math.floor(nota); // floor = arredondar pra baixo
            notasPorDesc[key] = {
              nome: d.nome,
              nota_decimal: Math.round(nota * 100) / 100,
              nivel,
              confianca: d.confianca || 0,
              sustentacao: d.sustentacao || 'insuficiente',
            };
          }

          // Média
          const notas = Object.values(notasPorDesc).map((d: any) => d.nota_decimal);
          const mediaDescritores = notas.length
            ? Math.round((notas.reduce((a: number, b: number) => a + b, 0) / notas.length) * 100) / 100
            : 0;

          // Nível geral (floor da média)
          let nivelGeral = Math.floor(mediaDescritores);

          // Travas
          const travasAplicadas: string[] = [];
          const niveisN1 = Object.values(notasPorDesc).filter((d: any) => d.nivel === 1).length;
          if (niveisN1 > 3) {
            nivelGeral = Math.min(nivelGeral, 1);
            travasAplicadas.push(`${niveisN1} descritores N1 → nível geral máximo N1`);
          } else if (niveisN1 > 0 && nivelGeral > 2) {
            nivelGeral = Math.min(nivelGeral, 2);
            travasAplicadas.push(`Descritor N1 presente → nível geral máximo N2`);
          }

          // Anti-rebaixamento: se tem evidência N3 em algum descritor, mínimo N2
          const temN3 = Object.values(notasPorDesc).some((d: any) => d.nivel >= 3);
          if (temN3 && nivelGeral < 2) {
            nivelGeral = 2;
            travasAplicadas.push('Evidência N3 presente → nível mínimo N2');
          }

          nivelGeral = Math.max(1, Math.min(4, nivelGeral));
          const gap = Math.max(0, 3 - nivelGeral);

          // Confiança geral = média das confianças
          const confs = Object.values(notasPorDesc).map((d: any) => d.confianca || 0).filter((c: number) => c > 0);
          const confiancaGeral = confs.length ? Math.round((confs.reduce((a, b) => a + b, 0) / confs.length) * 100) / 100 : 0;

          // Montar consolidação (adicionada ao JSON da IA)
          avaliacao.consolidacao = {
            notas_por_descritor: notasPorDesc,
            media_descritores: mediaDescritores,
            nivel_geral: nivelGeral,
            gap,
            confianca_geral: confiancaGeral,
            travas_aplicadas: travasAplicadas.length ? travasAplicadas : ['Nenhuma'],
          };

          // recomendacoes_pdi pode estar dentro de feedback (legado) ou top-level (novo)
          if (avaliacao.recomendacoes_pdi) {
            // já está no top-level — ok
          } else if (avaliacao.feedback?.recomendacoes_pdi) {
            avaliacao.recomendacoes_pdi = avaliacao.feedback.recomendacoes_pdi;
          }

          // Feedback como string (compatibilidade com consumers)
          const feedbackStr = typeof avaliacao.feedback === 'object'
            ? [avaliacao.feedback.resumo_geral, avaliacao.feedback.mensagem_positiva, avaliacao.feedback.mensagem_construtiva].filter(Boolean).join('\n')
            : (avaliacao.feedback || '');

          const { error: updErr } = await tdb.from('respostas').update({
            avaliacao_ia: avaliacao,
            nivel_ia4: nivelGeral,
            nota_ia4: mediaDescritores,
            pontos_fortes: avaliacao.descritores_destaque?.pontos_fortes?.map((p: any) => p.descritor || p).join('; ') || null,
            pontos_atencao: avaliacao.descritores_destaque?.gaps_prioritarios?.map((g: any) => g.descritor || g).join('; ') || null,
            feedback_ia4: feedbackStr || null,
            avaliado_em: new Date().toISOString(),
          }).eq('id', resp.id).select('id');

          if (!updErr) {
            avaliadas++;
            // Popula descriptor_assessments com as notas IA4 por descritor
            // (alimenta o motor de temporadas — select-descriptors usa essas notas)
            try {
              // Resolve competencia_nome se vazio (comum em rows antigas)
              let competenciaNome = resp.competencia_nome;
              if (!competenciaNome && resp.competencia_id) {
                const { data: cc } = await tdb.from('competencias')
                  .select('nome').eq('id', resp.competencia_id).maybeSingle();
                if (cc?.nome) {
                  competenciaNome = cc.nome;
                  // persiste de volta na resposta
                  await tdb.from('respostas').update({ competencia_nome: cc.nome }).eq('id', resp.id);
                }
              }
              if (!competenciaNome || !resp.colaborador_id) {
                console.warn('[IA4] descriptor_assessments: sem competencia_nome/colab_id', resp.id);
              } else {
                const rows = descPorDescritor
                  .filter((d: any) => d.nome && typeof d.nota_decimal === 'number')
                  .map((d: any) => ({
                    colaborador_id: resp.colaborador_id,
                    cargo: resp.cargo,
                    competencia: competenciaNome,
                    descritor: d.nome,
                    nota: Math.max(1.0, Math.min(4.0, d.nota_decimal)),
                    origem: 'ia4',
                    assessment_date: new Date().toISOString(),
                  }));
                if (rows.length > 0) {
                  await tdb.from('descriptor_assessments').upsert(rows, {
                    onConflict: 'colaborador_id,competencia,descritor',
                  });
                }
              }
            } catch (e: any) {
              console.warn('[IA4] descriptor_assessments upsert falhou:', e.message);
            }
          }
          else { erros++; ultimoErro = updErr.message; }
        } else {
          erros++;
          ultimoErro = `IA não retornou JSON válido (${resp.nome_colaborador} / ${resp.competencia_nome})`;
          console.error(`[IA4] FALHA mesmo após retry: ${resp.nome_colaborador}`, resultado?.slice(0, 500));
        }
      } catch (e: any) {
        erros++;
        ultimoErro = e.message;
        console.error(`[IA4] ERRO no colab ${resp.colaborador_id?.slice(0,8)} / comp ${resp.competencia_nome}:`, e.message, e.stack?.split('\n').slice(0, 3).join(' '));
      }
    }

    return { success: true, message: `IA4 concluída: ${avaliadas} avaliadas${erros ? `, ${erros} erros` : ''}${ultimoErro ? ` — ${ultimoErro}` : ''}` };
  } catch (err: any) {
    console.error('[IA4] ERRO GERAL:', err.message, err.stack?.split('\n').slice(0, 3).join(' '));
    return { success: false, error: err.message };
  }
}

// ── Re-avaliar resposta (revisão controlada com feedback do check) ──────────

const IA4_REVIEW_SYSTEM = `Você é o Motor de Revisão de Avaliações da Vertho Mentor IA.

═══ TAREFA ═══
REVISAR uma avaliação anterior com base no feedback de uma auditoria (2ª IA).
Isto NÃO é uma reavaliação do zero — é uma REVISÃO CONTROLADA.

═══ PRINCÍPIOS DA REVISÃO ═══

1. PRESERVE o que já era defensável na avaliação anterior
2. CORRIJA apenas os pontos onde a auditoria aponta problema real E as evidências sustentam a correção
3. Se a auditoria sugerir algo que NÃO se sustenta nas evidências das respostas, MANTENHA a avaliação anterior e EXPLIQUE por quê
4. O feedback da auditoria é IMPORTANTE, mas NÃO substitui a régua nem as evidências
5. Toda mudança de nota/nível DEVE ter justificativa explícita

═══ REGRAS (mesmas da IA4 original) ═══
- Evidência ou não conta
- Intenção não é evidência
- Na dúvida → nível inferior
- N3/N4 exigem evidência robusta
- Perfil CIS NÃO altera nota
- NUNCA inventar dados não presentes nas respostas

═══ PROCESSO OBRIGATÓRIO ═══

1. Ler o feedback da auditoria (cada ponto)
2. Para cada ponto: verificar se as evidências das respostas sustentam a correção
3. Decidir: corrigir | corrigir_parcialmente | manter | nao_aplicavel
4. Gerar avaliação revisada com as correções aceitas
5. Documentar o que mudou e o que foi preservado

═══ FORMATO JSON ═══

{
  "avaliacao_revisada": {
    "avaliacao_por_descritor": [
      {
        "numero": 1,
        "nome": "nome do descritor",
        "nota_decimal": 2.33,
        "nivel_sugerido": 2,
        "confianca": 0.80,
        "sustentacao": "forte",
        "evidencias": ["trecho 1"],
        "limites_da_evidencia": ["o que não foi demonstrado"],
        "racional": "Por que este nível"
      }
    ],
    "descritores_destaque": {
      "pontos_fortes": [{"descritor": "", "nivel": 3, "evidencia_resumida": ""}],
      "gaps_prioritarios": [{"descritor": "", "nivel": 1, "o_que_faltou": ""}]
    },
    "feedback": {
      "tom_base": "acolhedor / direto / técnico",
      "resumo_geral": "2-3 frases",
      "mensagem_positiva": "O que fez bem",
      "mensagem_construtiva": "Onde melhorar",
      "recomendacoes": ["ação 1", "ação 2"]
    }
  },
  "tratamento_do_feedback": {
    "itens": [
      {
        "ponto_auditoria": "O que a auditoria apontou",
        "decisao": "corrigir",
        "justificativa": "Por que aceitou/rejeitou este ponto"
      }
    ],
    "mudancas_relevantes": ["D2: nota 1.67→2.33 (auditoria identificou evidência não computada)"],
    "pontos_preservados": ["D1: nota mantida em 2.00 (auditoria sugeriu N3 mas sem evidência suficiente)"]
  }
}

REGRAS DO JSON:
- decisao: "corrigir" | "corrigir_parcialmente" | "manter" | "nao_aplicavel"
- nota_decimal: 1.00 a 4.00
- confianca: 0.0 a 1.0
- tratamento_do_feedback.itens: pelo menos 1 item (não pode ignorar a auditoria)
- mudancas_relevantes e pontos_preservados: obrigatórios (podem ser arrays vazios)`;

export async function reavaliarResposta(respostaId: string, aiConfig: AIConfig = {}) {
  const sbRaw = createSupabaseAdmin();
  try {
    const { data: resp } = await sbRaw.from('respostas')
      .select('id, empresa_id, colaborador_id, competencia_id, cenario_id, r1, r2, r3, r4, avaliacao_ia, payload_ia4')
      .eq('id', respostaId).single();
    if (!resp) return { success: false, error: 'Resposta não encontrada' };

    const tdb = tenantDb(resp.empresa_id);

    // Preservar avaliação anterior
    const avaliacaoAnterior = typeof resp.avaliacao_ia === 'string' ? JSON.parse(resp.avaliacao_ia) : resp.avaliacao_ia;

    // Extrair feedback do check
    const check = typeof resp.payload_ia4 === 'string' ? JSON.parse(resp.payload_ia4) : resp.payload_ia4;
    const feedbackCheck = check ? JSON.stringify(check, null, 2) : '';

    const { data: empresa } = await sbRaw.from('empresas')
      .select('nome, segmento').eq('id', resp.empresa_id).single();

    const { data: colab } = await tdb.from('colaboradores')
      .select('id, nome_completo, cargo, d_natural, i_natural, s_natural, c_natural, perfil_dominante')
      .eq('id', resp.colaborador_id).single();

    let cenarioTexto = '', perguntasTexto = '';
    if (resp.cenario_id) {
      const { data: cen } = await sbRaw.from('banco_cenarios')
        .select('titulo, descricao, alternativas').eq('id', resp.cenario_id).maybeSingle();
      if (cen) {
        cenarioTexto = `${cen.titulo}\n${cen.descricao}`;
        const altObj2 = typeof cen.alternativas === 'object' && !Array.isArray(cen.alternativas) ? cen.alternativas : {};
        const pergs = altObj2.perguntas || (Array.isArray(cen.alternativas) ? cen.alternativas : []);
        perguntasTexto = pergs.map((p: any, i: number) => `P${p.numero || i + 1}: ${p.texto || ''}`).join('\n');
      }
    }

    let compNome = '', compCod = '', descritoresTexto = '';
    if (resp.competencia_id) {
      const { data: comp } = await tdb.from('competencias')
        .select('nome, cod_comp').eq('id', resp.competencia_id).maybeSingle();
      compNome = comp?.nome || ''; compCod = comp?.cod_comp || '';
      const { data: descs } = await tdb.from('competencias')
        .select('cod_desc, nome_curto, n1_gap, n2_desenvolvimento, n3_meta, n4_referencia')
        .eq('cod_comp', comp?.cod_comp).not('cod_desc', 'is', null);
      if (descs?.length) {
        descritoresTexto = descs.map((d: any, i: number) =>
          `D${i + 1}: ${d.cod_desc} — ${d.nome_curto || ''}\nN1: ${d.n1_gap || ''}\nN2: ${d.n2_desenvolvimento || ''}\nN3: ${d.n3_meta || ''}\nN4: ${d.n4_referencia || ''}`
        ).join('\n\n');
      }
    }

    // ── User prompt estruturado ──
    const userBlocks: string[] = [];

    userBlocks.push(`═══ PROFISSIONAL ═══\n${colab?.nome_completo || '—'} · ${colab?.cargo || '—'} · ${empresa?.nome || '—'}`);
    userBlocks.push(`═══ COMPETÊNCIA ═══\n${compCod} — ${compNome}`);
    userBlocks.push(`═══ RÉGUA DE MATURIDADE ═══\n${descritoresTexto || '(não disponíveis)'}`);
    if (cenarioTexto) userBlocks.push(`═══ CENÁRIO ═══\n${cenarioTexto}`);
    if (perguntasTexto) userBlocks.push(`═══ PERGUNTAS ═══\n${perguntasTexto}`);

    userBlocks.push(`═══ RESPOSTAS DO PROFISSIONAL ═══
R1: ${resp.r1 || '—'}
R2: ${resp.r2 || '—'}
R3: ${resp.r3 || '—'}
R4: ${resp.r4 || '—'}`);

    // Avaliação anterior (resumida)
    if (avaliacaoAnterior) {
      const descAnterior = avaliacaoAnterior.avaliacao_por_descritor || [];
      const resumoAnterior = descAnterior.map((d: any) =>
        `${d.nome}: nota ${d.nota_decimal} (N${d.nivel_sugerido}) conf ${d.confianca} — ${d.racional || ''}`
      ).join('\n');
      const consol = avaliacaoAnterior.consolidacao || {};
      userBlocks.push(`═══ AVALIAÇÃO ANTERIOR ═══
Nível geral: N${consol.nivel_geral || '?'} (média: ${consol.media_descritores || '?'})
Travas: ${(consol.travas_aplicadas || []).join('; ')}

Por descritor:
${resumoAnterior || '(formato legado — sem detalhamento por descritor)'}`);
    }

    if (feedbackCheck) {
      userBlocks.push(`═══ FEEDBACK DA AUDITORIA (2ª IA) ═══\n${feedbackCheck}`);
    }

    userBlocks.push(`═══ INSTRUÇÃO DE REVISÃO ═══
1. Leia CADA ponto da auditoria
2. Para cada ponto: verifique se as EVIDÊNCIAS das respostas sustentam a correção
3. Se sustentam → corrija a nota/nível e explique
4. Se NÃO sustentam → mantenha a avaliação anterior e explique por quê
5. NÃO refaça tudo do zero — revise cirurgicamente
6. Documente mudanças E preservações no tratamento_do_feedback`);

    const user = userBlocks.join('\n\n');
    const resultado = await callAI(IA4_REVIEW_SYSTEM, user, aiConfig, 8192);
    let revisao = await extractJSON(resultado);

    if (!revisao) return { success: false, error: 'IA não retornou revisão válida' };

    // ── Consolidação em código (mesmo padrão da IA4 original) ──
    const descPorDescritor = revisao.avaliacao_revisada?.avaliacao_por_descritor || [];
    const notasPorDesc: Record<string, any> = {};
    for (const d of descPorDescritor) {
      const key = `D${d.numero}`;
      const nota = Math.max(1.0, Math.min(4.0, d.nota_decimal || 1.0));
      notasPorDesc[key] = {
        nome: d.nome,
        nota_decimal: Math.round(nota * 100) / 100,
        nivel: Math.floor(nota),
        confianca: d.confianca || 0,
        sustentacao: d.sustentacao || 'insuficiente',
      };
    }

    const notas = Object.values(notasPorDesc).map((d: any) => d.nota_decimal);
    const mediaDescritores = notas.length
      ? Math.round((notas.reduce((a: number, b: number) => a + b, 0) / notas.length) * 100) / 100 : 0;
    let nivelGeral = Math.floor(mediaDescritores);

    const travasAplicadas: string[] = [];
    const niveisN1 = Object.values(notasPorDesc).filter((d: any) => d.nivel === 1).length;
    if (niveisN1 > 3) { nivelGeral = Math.min(nivelGeral, 1); travasAplicadas.push(`${niveisN1} descritores N1 → max N1`); }
    else if (niveisN1 > 0 && nivelGeral > 2) { nivelGeral = Math.min(nivelGeral, 2); travasAplicadas.push('Descritor N1 → max N2'); }
    const temN3 = Object.values(notasPorDesc).some((d: any) => d.nivel >= 3);
    if (temN3 && nivelGeral < 2) { nivelGeral = 2; travasAplicadas.push('Evidência N3 → mínimo N2'); }
    nivelGeral = Math.max(1, Math.min(4, nivelGeral));

    const confs = Object.values(notasPorDesc).map((d: any) => d.confianca || 0).filter((c: number) => c > 0);
    const confiancaGeral = confs.length ? Math.round((confs.reduce((a, b) => a + b, 0) / confs.length) * 100) / 100 : 0;

    // Montar avaliação final com histórico de revisão
    const avaliacaoFinal = {
      ...(revisao.avaliacao_revisada || {}),
      consolidacao: {
        notas_por_descritor: notasPorDesc,
        media_descritores: mediaDescritores,
        nivel_geral: nivelGeral,
        gap: Math.max(0, 3 - nivelGeral),
        confianca_geral: confiancaGeral,
        travas_aplicadas: travasAplicadas.length ? travasAplicadas : ['Nenhuma'],
      },
      _revisao: {
        avaliacao_anterior: avaliacaoAnterior,
        auditoria: check,
        tratamento_do_feedback: revisao.tratamento_do_feedback || null,
        revisado_em: new Date().toISOString(),
      },
    };

    const feedbackObj = revisao.avaliacao_revisada?.feedback;
    const feedbackStr = typeof feedbackObj === 'object'
      ? [feedbackObj.resumo_geral, feedbackObj.mensagem_positiva, feedbackObj.mensagem_construtiva].filter(Boolean).join('\n')
      : (feedbackObj || '');

    const { data: updated, error: updErr } = await tdb.from('respostas').update({
      avaliacao_ia: avaliacaoFinal,
      nivel_ia4: nivelGeral,
      nota_ia4: mediaDescritores,
      pontos_fortes: avaliacaoFinal.descritores_destaque?.pontos_fortes?.map((p: any) => p.descritor || p).join('; ') || null,
      pontos_atencao: avaliacaoFinal.descritores_destaque?.gaps_prioritarios?.map((g: any) => g.descritor || g).join('; ') || null,
      feedback_ia4: feedbackStr || null,
      status_ia4: null,
      payload_ia4: null,
      avaliado_em: new Date().toISOString(),
    }).eq('id', respostaId).select('id');

    if (updErr) return { success: false, error: `Re-avaliação UPDATE falhou: ${updErr.message}` };
    if (!updated?.length) return { success: false, error: 'Re-avaliação: 0 linhas atualizadas' };

    const mudancas = revisao.tratamento_do_feedback?.mudancas_relevantes?.length || 0;
    const preservados = revisao.tratamento_do_feedback?.pontos_preservados?.length || 0;
    return {
      success: true,
      message: `Revisado: ${compNome} — N${nivelGeral} (${mudancas} mudanças, ${preservados} preservados)`,
    };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// ── Re-checar UMA resposta ───────────────────────────────────────────────────

export async function rechecarResposta(respostaId: string, aiConfig: AIConfig = {}) {
  const { checarUmaResposta } = await import('./check-ia4');
  return checarUmaResposta(respostaId, aiConfig);
}

// ── Ver fila de IA4 ─────────────────────────────────────────────────────────

export async function verFilaIA4(empresaId: string) {
  if (!empresaId) return { success: false, error: 'empresaId obrigatório' };
  const tdb = tenantDb(empresaId);
  try {
    const { count: pendentes } = await tdb.from('respostas')
      .select('id', { count: 'exact', head: true })
      .is('avaliacao_ia', null)
      .not('r1', 'is', null);

    const { count: avaliadas } = await tdb.from('respostas')
      .select('id', { count: 'exact', head: true })
      .not('avaliacao_ia', 'is', null);

    return {
      success: true,
      message: `Fila IA4: ${pendentes || 0} pendentes, ${avaliadas || 0} avaliadas`,
      pendentes: pendentes || 0,
      avaliadas: avaliadas || 0,
    };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// ── Carregar respostas com avaliação ─────────────────────────────────────────

export async function loadRespostasAvaliadas(empresaId: string) {
  if (!empresaId) return [];
  const sbRaw = createSupabaseAdmin();
  const tdb = tenantDb(empresaId);
  const { data, error } = await tdb.from('respostas')
    .select('id, colaborador_id, competencia_id, cenario_id, r1, r2, r3, r4, nivel_simulado, avaliacao_ia, nivel_ia4, nota_ia4, status_ia4, payload_ia4, pontos_fortes, pontos_atencao, feedback_ia4, created_at')
    .not('r1', 'is', null)
    .order('created_at', { ascending: false });

  if (error || !data?.length) return [];

  const colabIds = [...new Set(data.map((r: any) => r.colaborador_id).filter(Boolean))];
  const colabMap: Record<string, any> = {};
  if (colabIds.length) {
    const { data: colabs } = await tdb.from('colaboradores').select('id, nome_completo, cargo').in('id', colabIds);
    (colabs || []).forEach((c: any) => { colabMap[c.id] = c; });
  }

  const compIds = [...new Set(data.map((r: any) => r.competencia_id).filter(Boolean))];
  const compMap: Record<string, any> = {};
  if (compIds.length) {
    const { data: comps } = await tdb.from('competencias').select('id, nome, cod_comp').in('id', compIds);
    (comps || []).forEach((c: any) => { compMap[c.id] = c; });
  }

  const cenIds = [...new Set(data.map((r: any) => r.cenario_id).filter(Boolean))];
  const cenMap: Record<string, any> = {};
  if (cenIds.length) {
    // banco_cenarios é misto → raw
    const { data: cens } = await sbRaw.from('banco_cenarios').select('id, titulo, alternativas').in('id', cenIds);
    (cens || []).forEach((c: any) => { cenMap[c.id] = c; });
  }

  return data.map((r: any) => ({
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

export async function gerarRelatoriosIndividuais(_empresaId: string, _aiConfig: AIConfig = {}) {
  return { success: true, message: 'Relatórios individuais: funcionalidade em desenvolvimento' };
}

export async function gerarRelatorioGestor(_empresaId: string, _aiConfig: AIConfig = {}) {
  return { success: true, message: 'Relatório gestor: funcionalidade em desenvolvimento' };
}

export async function gerarRelatorioRH(_empresaId: string, _aiConfig: AIConfig = {}) {
  return { success: true, message: 'Relatório RH: funcionalidade em desenvolvimento' };
}

export async function enviarRelIndividuais(_empresaId: string) {
  return { success: true, message: 'Envio individuais: funcionalidade em desenvolvimento' };
}

export async function enviarRelGestor(_empresaId: string) {
  return { success: true, message: 'Envio gestor: funcionalidade em desenvolvimento' };
}

export async function enviarRelRH(_empresaId: string) {
  return { success: true, message: 'Envio RH: funcionalidade em desenvolvimento' };
}
