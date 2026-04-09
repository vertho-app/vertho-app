'use server';

import { createSupabaseAdmin } from '@/lib/supabase';
import { callAI } from './ai-client';
import { extractJSON } from './utils';
import { getOrCreatePromptVersion } from '@/lib/versioning';

// ── IA4: Avaliar respostas com IA ───────────────────────────────────────────

export async function rodarIA4(empresaId, aiConfig = {}) {
  const sb = createSupabaseAdmin();
  try {
    // Buscar respostas pendentes de avaliação
    const { data: respostas, error: respErr } = await sb.from('respostas')
      .select('*')
      .eq('empresa_id', empresaId)
      .is('avaliacao_ia', null)
      .not('r1', 'is', null);

    if (respErr) return { success: false, error: respErr.message };
    if (!respostas?.length) return { success: true, message: 'Nenhuma resposta pendente de avaliação' };

    const { data: empresa } = await sb.from('empresas')
      .select('nome, segmento')
      .eq('id', empresaId).single();

    // Buscar colaboradores
    const colabIds = [...new Set(respostas.map(r => r.colaborador_id).filter(Boolean))];
    const { data: colabs } = await sb.from('colaboradores')
      .select('id, nome_completo, cargo')
      .in('id', colabIds);
    const colabMap = {};
    (colabs || []).forEach(c => { colabMap[c.id] = c; });

    const model = aiConfig?.model || 'claude-sonnet-4-6';
    const system = `Você é um avaliador especialista em competências comportamentais.
Avalie as 4 respostas do colaborador ao cenário situacional.
Para cada resposta (R1-R4), identifique o nível de maturidade (N1-N4).
Compare com os descritores de cada pergunta.

Responda APENAS com JSON válido:
{
  "nivel_geral": 1-4,
  "nota_decimal": 1.0-4.0,
  "por_pergunta": [
    {"pergunta": 1, "nivel": 1-4, "justificativa": "..."},
    {"pergunta": 2, "nivel": 1-4, "justificativa": "..."},
    {"pergunta": 3, "nivel": 1-4, "justificativa": "..."},
    {"pergunta": 4, "nivel": 1-4, "justificativa": "..."}
  ],
  "pontos_fortes": ["..."],
  "pontos_desenvolvimento": ["..."],
  "feedback": "Parágrafo com feedback construtivo."
}`;

    let avaliadas = 0, erros = 0, ultimoErro = '';

    for (const resp of respostas) {
      try {
        const colab = colabMap[resp.colaborador_id] || {};

        // Buscar cenário e perguntas
        let cenarioTexto = '';
        let perguntasTexto = '';
        if (resp.cenario_id) {
          const { data: cen } = await sb.from('banco_cenarios')
            .select('titulo, descricao, alternativas')
            .eq('id', resp.cenario_id).maybeSingle();
          if (cen) {
            cenarioTexto = `Cenário: ${cen.titulo}\n${cen.descricao}`;
            const pergs = Array.isArray(cen.alternativas) ? cen.alternativas : [];
            perguntasTexto = pergs.map((p, i) =>
              `P${p.numero || i + 1}: ${p.texto || ''}\nDiferenciação: ${p.o_que_diferencia_niveis || ''}`
            ).join('\n\n');
          }
        }

        // Buscar competência
        let compNome = '';
        if (resp.competencia_id) {
          const { data: comp } = await sb.from('competencias')
            .select('nome').eq('id', resp.competencia_id).maybeSingle();
          compNome = comp?.nome || '';
        }

        const user = `Empresa: ${empresa.nome} (${empresa.segmento})
Colaborador: ${colab.nome_completo || '—'} | Cargo: ${colab.cargo || '—'}
Competência: ${compNome}

${cenarioTexto}

PERGUNTAS E DESCRITORES:
${perguntasTexto}

RESPOSTAS DO COLABORADOR:
R1: ${resp.r1 || '(sem resposta)'}
R2: ${resp.r2 || '(sem resposta)'}
R3: ${resp.r3 || '(sem resposta)'}
R4: ${resp.r4 || '(sem resposta)'}`;

        const resultado = await callAI(system, user, aiConfig, 4096);
        const avaliacao = await extractJSON(resultado);

        if (avaliacao) {
          const { error: updErr } = await sb.from('respostas').update({
            avaliacao_ia: avaliacao,
            nivel_ia4: avaliacao.nivel_geral || null,
            avaliado_em: new Date().toISOString(),
          }).eq('id', resp.id).select('id');

          if (!updErr) avaliadas++;
          else erros++;
        } else {
          erros++;
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
    .select('id, colaborador_id, competencia_id, cenario_id, r1, r2, r3, r4, nivel_simulado, avaliacao_ia, nivel_ia4, status_ia4, payload_ia4, created_at')
    .eq('empresa_id', empresaId)
    .not('r1', 'is', null)
    .order('created_at', { ascending: false });

  if (error || !data?.length) return [];

  // Buscar colaboradores
  const colabIds = [...new Set(data.map(r => r.colaborador_id).filter(Boolean))];
  const colabMap = {};
  if (colabIds.length) {
    const { data: colabs } = await sb.from('colaboradores').select('id, nome_completo, cargo').in('id', colabIds);
    (colabs || []).forEach(c => { colabMap[c.id] = c; });
  }

  // Buscar competências
  const compIds = [...new Set(data.map(r => r.competencia_id).filter(Boolean))];
  const compMap = {};
  if (compIds.length) {
    const { data: comps } = await sb.from('competencias').select('id, nome, cod_comp').in('id', compIds);
    (comps || []).forEach(c => { compMap[c.id] = c; });
  }

  // Buscar cenários (titulo)
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

// ── Check avaliações ────────────────────────────────────────────────────────

export async function checkAvaliacoes(empresaId, aiConfig = {}) {
  const sb = createSupabaseAdmin();
  try {
    const { count: total } = await sb.from('respostas')
      .select('*, colaboradores!inner(empresa_id)', { count: 'exact', head: true })
      .eq('colaboradores.empresa_id', empresaId);

    const { count: avaliadas } = await sb.from('respostas')
      .select('*, colaboradores!inner(empresa_id)', { count: 'exact', head: true })
      .eq('colaboradores.empresa_id', empresaId)
      .not('avaliacao_ia', 'is', null);

    const completo = total > 0 && avaliadas === total;

    return {
      success: true,
      message: `${avaliadas || 0}/${total || 0} avaliadas${completo ? ' — Todas concluídas!' : ''}`,
      total: total || 0,
      avaliadas: avaliadas || 0,
      completo,
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ── Relatórios Individuais ──────────────────────────────────────────────────

export async function gerarRelatoriosIndividuais(empresaId, aiConfig = {}) {
  const sb = createSupabaseAdmin();
  try {
    const { data: colaboradores } = await sb.from('colaboradores')
      .select('id, nome_completo, cargo, email')
      .eq('empresa_id', empresaId);

    if (!colaboradores?.length) return { success: false, error: 'Nenhum colaborador encontrado' };

    const { data: empresa } = await sb.from('empresas')
      .select('nome, segmento')
      .eq('id', empresaId).single();

    const system = `Voce e um consultor senior de desenvolvimento humano da Vertho.
Gere um relatorio individual de competencias comportamentais completo e personalizado.
Use os dados das avaliacoes para produzir insights especificos — NUNCA genere conteudo generico.
Responda APENAS com JSON valido.`;

    let gerados = 0;

    for (const colab of colaboradores) {
      // Buscar avaliações (sessões conversacionais + respostas escritas)
      const { data: sessoes } = await sb.from('sessoes_avaliacao')
        .select('competencia_nome, nivel, nota_decimal, lacuna, avaliacao_final')
        .eq('colaborador_id', colab.id)
        .eq('status', 'concluido');

      const { data: respostas } = await sb.from('respostas')
        .select('*, banco_cenarios!inner(titulo, competencia_id, competencias!inner(nome))')
        .eq('colaborador_id', colab.id)
        .not('avaliacao_ia', 'is', null);

      if (!sessoes?.length && !respostas?.length) continue;

      // Buscar perfil DISC
      const { data: perfil } = await sb.from('colaboradores')
        .select('perfil_dominante, d_natural, i_natural, s_natural, c_natural')
        .eq('id', colab.id).single();

      const dadosSessoes = (sessoes || []).map(s => ({
        competencia: s.competencia_nome,
        nivel: s.nivel,
        nota: s.nota_decimal,
        lacuna: s.lacuna,
        pontos_fortes: s.avaliacao_final?.descritores_destaque?.pontos_fortes,
        gaps: s.avaliacao_final?.descritores_destaque?.gaps_prioritarios,
        feedback: s.avaliacao_final?.feedback,
        pdi: s.avaliacao_final?.recomendacoes_pdi,
      }));

      const dadosRespostas = (respostas || []).map(r => ({
        competencia: r.banco_cenarios?.competencias?.nome,
        nivel: r.avaliacao_ia?.nivel_identificado,
        pontos_fortes: r.avaliacao_ia?.pontos_fortes,
        pontos_desenvolvimento: r.avaliacao_ia?.pontos_desenvolvimento,
      }));

      const user = `Empresa: ${empresa.nome} (${empresa.segmento})
Colaborador: ${colab.nome_completo} | Cargo: ${colab.cargo}
Perfil DISC: ${perfil?.perfil_dominante || 'N/A'} (D=${perfil?.d_natural || 0} I=${perfil?.i_natural || 0} S=${perfil?.s_natural || 0} C=${perfil?.c_natural || 0})

Avaliacoes conversacionais (Fase 3):
${JSON.stringify(dadosSessoes, null, 2)}

Avaliacoes escritas:
${JSON.stringify(dadosRespostas, null, 2)}

Gere o relatorio individual com TODAS estas secoes:
{
  "colaborador": "${colab.nome_completo}",
  "cargo": "${colab.cargo}",
  "perfil_disc": "${perfil?.perfil_dominante || 'N/A'}",
  "resumo_executivo": "1 paragrafo sintetizando o perfil geral do colaborador",
  "competencias": [
    {
      "nome": "nome da competencia",
      "nivel": 1-4,
      "nota_decimal": 0.00-4.99,
      "classificacao": "Gap|Em Desenvolvimento|Proficiente|Referencia",
      "pontos_fortes": ["comportamento observado 1", "comportamento observado 2"],
      "gaps_identificados": ["lacuna 1", "lacuna 2"],
      "feedback_personalizado": "2-3 frases especificas para esta competencia",
      "recomendacao_pdi": "1 acao concreta de desenvolvimento"
    }
  ],
  "pontos_fortes_gerais": ["forca 1 transversal", "forca 2"],
  "areas_desenvolvimento": ["area 1", "area 2"],
  "plano_desenvolvimento": [
    {
      "prioridade": 1,
      "competencia_foco": "nome",
      "acao": "acao concreta e pratica",
      "prazo": "30|60|90 dias",
      "indicador_sucesso": "como medir o progresso"
    }
  ],
  "recomendacoes_disc": "2-3 frases conectando o perfil DISC ao desenvolvimento (sem usar jargao tecnico)",
  "proximos_passos": ["passo 1", "passo 2", "passo 3"]
}`;

      const resultado = await callAI(system, user, aiConfig, 64000);
      const relatorio = await extractJSON(resultado);

      if (relatorio) {
        await sb.from('relatorios').upsert({
          empresa_id: empresaId,
          colaborador_id: colab.id,
          tipo: 'individual',
          conteudo: relatorio,
          gerado_em: new Date().toISOString(),
        }, { onConflict: 'empresa_id,colaborador_id,tipo' });
        gerados++;
      }
    }

    return { success: true, message: `${gerados} relatórios individuais gerados` };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ── Relatório do Gestor ─────────────────────────────────────────────────────

export async function gerarRelatorioGestor(empresaId, aiConfig = {}) {
  const sb = createSupabaseAdmin();
  try {
    const { data: empresa } = await sb.from('empresas')
      .select('nome, segmento')
      .eq('id', empresaId).single();

    const { data: relatorios } = await sb.from('relatorios')
      .select('*, colaboradores!inner(nome_completo, cargo)')
      .eq('empresa_id', empresaId)
      .eq('tipo', 'individual');

    if (!relatorios?.length) return { success: false, error: 'Nenhum relatório individual encontrado. Gere-os primeiro.' };

    const system = `Voce e um consultor estrategico de gestao de pessoas da Vertho.
Gere um relatorio consolidado para o gestor da equipe com insights acionaveis.
Use dados reais — NUNCA gere conteudo generico. Responda APENAS com JSON valido.`;

    const resumos = relatorios.map(r => ({
      colaborador: r.colaboradores?.nome_completo,
      cargo: r.colaboradores?.cargo,
      resumo: r.conteudo?.resumo_executivo,
      competencias: r.conteudo?.competencias?.map(c => ({ nome: c.nome, nivel: c.nivel, nota: c.nota_decimal })),
      areas_dev: r.conteudo?.areas_desenvolvimento,
      perfil_disc: r.conteudo?.perfil_disc,
    }));

    const user = `Empresa: ${empresa.nome} (${empresa.segmento})
Equipe (${relatorios.length} colaboradores):
${JSON.stringify(resumos, null, 2)}

Gere relatorio do gestor com TODAS estas secoes:
{
  "resumo_executivo": "1 paragrafo sintetico sobre o estado da equipe",
  "tabela_equipe": [
    {"colaborador": "nome", "cargo": "cargo", "nivel_medio": 0, "competencia_mais_forte": "nome", "competencia_gap": "nome"}
  ],
  "ranking_atencao": [
    {"colaborador": "nome", "motivo": "por que precisa de atencao", "urgencia": "alta|media|baixa"}
  ],
  "competencias_fortes_equipe": ["competencia que a equipe domina"],
  "gaps_criticos": ["competencia que a equipe mais precisa desenvolver"],
  "padroes_identificados": "2-3 frases sobre padroes transversais na equipe",
  "perfil_disc_equipe": "distribuicao e implicacoes do mix DISC na equipe",
  "recomendacoes_gestao": [
    {"acao": "acao concreta para o gestor", "impacto": "resultado esperado", "prazo": "curto|medio|longo"}
  ],
  "acoes_prioritarias": ["top 3 acoes imediatas"]
}`;

    const resultado = await callAI(system, user, aiConfig, 64000);
    const relatorio = await extractJSON(resultado);

    if (relatorio) {
      await sb.from('relatorios').upsert({
        empresa_id: empresaId,
        colaborador_id: null,
        tipo: 'gestor',
        conteudo: relatorio,
        gerado_em: new Date().toISOString(),
      }, { onConflict: 'empresa_id,colaborador_id,tipo' });
    }

    return { success: true, message: 'Relatório do gestor gerado com sucesso' };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ── Relatório RH ────────────────────────────────────────────────────────────

export async function gerarRelatorioRH(empresaId, aiConfig = {}) {
  const sb = createSupabaseAdmin();
  try {
    const { data: empresa } = await sb.from('empresas')
      .select('nome, segmento')
      .eq('id', empresaId).single();

    const { data: relatorios } = await sb.from('relatorios')
      .select('*, colaboradores(nome_completo, cargo)')
      .eq('empresa_id', empresaId)
      .eq('tipo', 'individual');

    if (!relatorios?.length) return { success: false, error: 'Nenhum relatório individual encontrado.' };

    const system = `Voce e um consultor estrategico de RH da Vertho.
Gere um relatorio analitico organizacional com indicadores quantitativos e recomendacoes estrategicas.
Use TODOS os dados fornecidos — NUNCA gere conteudo generico. Responda APENAS com JSON valido.`;

    const dadosEquipe = relatorios.map(r => ({
      nome: r.colaboradores?.nome_completo,
      cargo: r.colaboradores?.cargo,
      competencias: r.conteudo?.competencias?.map(c => ({ nome: c.nome, nivel: c.nivel, nota: c.nota_decimal })),
      pontos_fortes: r.conteudo?.pontos_fortes_gerais,
      areas_dev: r.conteudo?.areas_desenvolvimento,
      perfil_disc: r.conteudo?.perfil_disc,
    }));

    // Calcular indicadores
    const totalColabs = dadosEquipe.length;
    const todasNotas = dadosEquipe.flatMap(d => (d.competencias || []).map(c => c.nota || c.nivel || 0));
    const mediaGeral = todasNotas.length ? (todasNotas.reduce((a, b) => a + b, 0) / todasNotas.length).toFixed(2) : 0;

    const user = `Empresa: ${empresa.nome} (${empresa.segmento})
Total colaboradores avaliados: ${totalColabs}
Media geral: ${mediaGeral}

Dados completos:
${JSON.stringify(dadosEquipe, null, 2)}

Gere relatorio RH com TODAS estas secoes (baseado no GAS RelatorioRHFase3):
{
  "resumo_executivo": "1 paragrafo: a organizacao evoluiu? Quais foram os principais achados?",
  "indicadores_quantitativos": {
    "total_avaliados": ${totalColabs},
    "media_geral": ${mediaGeral},
    "competencias_acima_meta": 0,
    "competencias_abaixo_meta": 0,
    "desvio_padrao": 0
  },
  "mapa_competencias": [
    {"competencia": "nome", "media": 0, "min": 0, "max": 0, "desvio": 0, "classificacao": "forte|adequado|critico"}
  ],
  "visao_por_cargo": [
    {"cargo": "nome", "n_colaboradores": 0, "media": 0, "competencia_forte": "nome", "gap_principal": "nome"}
  ],
  "competencias_criticas": ["competencias que precisam de investimento urgente"],
  "talentos_destaque": [
    {"colaborador": "nome", "motivo": "por que se destaca"}
  ],
  "riscos": [
    {"tipo": "retencao|desempenho|engajamento", "descricao": "descricao do risco", "colaboradores_afetados": 0}
  ],
  "sugestao_formacoes": [
    {"tema": "nome do treinamento", "publico": "quem deve participar", "impacto_esperado": "resultado", "prioridade": "alta|media|baixa"}
  ],
  "perfil_disc_organizacional": "distribuicao e implicacoes do mix DISC na organizacao",
  "plano_acao_rh": [
    {"acao": "acao estrategica", "responsavel": "RH|gestor|diretoria", "prazo": "30|60|90 dias", "kpi": "como medir"}
  ]
}`;

    const resultado = await callAI(system, user, aiConfig, 64000);
    const relatorio = await extractJSON(resultado);

    if (relatorio) {
      await sb.from('relatorios').upsert({
        empresa_id: empresaId,
        colaborador_id: null,
        tipo: 'rh',
        conteudo: relatorio,
        gerado_em: new Date().toISOString(),
      }, { onConflict: 'empresa_id,colaborador_id,tipo' });
    }

    return { success: true, message: 'Relatório RH gerado com sucesso' };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ── Enviar relatórios ───────────────────────────────────────────────────────

export async function enviarRelIndividuais(empresaId) {
  const sb = createSupabaseAdmin();
  try {
    const { data: relatorios } = await sb.from('relatorios')
      .select('*, colaboradores!inner(nome_completo, email)')
      .eq('empresa_id', empresaId)
      .eq('tipo', 'individual');

    if (!relatorios?.length) return { success: false, error: 'Nenhum relatório individual para enviar' };

    const { data: empresa } = await sb.from('empresas')
      .select('nome, slug')
      .eq('id', empresaId).single();

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://vertho.app';
    let enviados = 0;

    for (const rel of relatorios) {
      const link = `${baseUrl}/${empresa.slug}/relatorio/${rel.id}`;

      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: 'Vertho Mentor IA <noreply@vertho.app>',
          to: rel.colaboradores.email,
          subject: `[${empresa.nome}] Seu Relatório de Competências`,
          html: `<p>Olá ${rel.colaboradores.nome_completo}!</p>
<p>Seu relatório individual de competências está disponível.</p>
<p><a href="${link}" style="background:#6366f1;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;">Ver Relatório</a></p>`,
        }),
      });

      if (res.ok) enviados++;
    }

    return { success: true, message: `${enviados} relatórios individuais enviados por e-mail` };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export async function enviarRelGestor(empresaId) {
  const sb = createSupabaseAdmin();
  try {
    const { data: empresa } = await sb.from('empresas')
      .select('nome, slug, email_gestor')
      .eq('id', empresaId).single();

    if (!empresa?.email_gestor) return { success: false, error: 'E-mail do gestor não configurado' };

    const { data: relatorio } = await sb.from('relatorios')
      .select('id')
      .eq('empresa_id', empresaId)
      .eq('tipo', 'gestor')
      .single();

    if (!relatorio) return { success: false, error: 'Relatório do gestor não encontrado' };

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://vertho.app';
    const link = `${baseUrl}/${empresa.slug}/relatorio/${relatorio.id}`;

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: 'Vertho Mentor IA <noreply@vertho.app>',
        to: empresa.email_gestor,
        subject: `[${empresa.nome}] Relatório de Gestão da Equipe`,
        html: `<p>Olá! O relatório consolidado da sua equipe está disponível.</p>
<p><a href="${link}" style="background:#6366f1;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;">Ver Relatório</a></p>`,
      }),
    });

    return res.ok
      ? { success: true, message: 'Relatório do gestor enviado' }
      : { success: false, error: 'Falha ao enviar e-mail' };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export async function enviarRelRH(empresaId) {
  const sb = createSupabaseAdmin();
  try {
    const { data: empresa } = await sb.from('empresas')
      .select('nome, slug, email_rh')
      .eq('id', empresaId).single();

    if (!empresa?.email_rh) return { success: false, error: 'E-mail do RH não configurado' };

    const { data: relatorio } = await sb.from('relatorios')
      .select('id')
      .eq('empresa_id', empresaId)
      .eq('tipo', 'rh')
      .single();

    if (!relatorio) return { success: false, error: 'Relatório RH não encontrado' };

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://vertho.app';
    const link = `${baseUrl}/${empresa.slug}/relatorio/${relatorio.id}`;

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: 'Vertho Mentor IA <noreply@vertho.app>',
        to: empresa.email_rh,
        subject: `[${empresa.nome}] Relatório Analítico de RH`,
        html: `<p>O relatório analítico de RH da ${empresa.nome} está disponível.</p>
<p><a href="${link}" style="background:#6366f1;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;">Ver Relatório</a></p>`,
      }),
    });

    return res.ok
      ? { success: true, message: 'Relatório RH enviado' }
      : { success: false, error: 'Falha ao enviar e-mail' };
  } catch (err) {
    return { success: false, error: err.message };
  }
}
