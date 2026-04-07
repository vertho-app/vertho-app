'use server';

import { createSupabaseAdmin } from '@/lib/supabase';
import { callAI } from './ai-client';
import { extractJSON } from './utils';

// ── Reavaliação em lote ─────────────────────────────────────────────────────

export async function iniciarReavaliacaoLote(empresaId, aiConfig = {}) {
  const sb = createSupabaseAdmin();
  try {
    const { data: colaboradores } = await sb.from('colaboradores')
      .select('id, nome_completo, cargo, email')
      .eq('empresa_id', empresaId);

    if (!colaboradores?.length) return { success: false, error: 'Nenhum colaborador encontrado' };

    const crypto = await import('crypto');
    let criados = 0;

    for (const colab of colaboradores) {
      const { data: cenarios } = await sb.from('banco_cenarios')
        .select('id')
        .eq('empresa_id', empresaId)
        .eq('cargo', colab.cargo);

      if (!cenarios?.length) continue;

      const token = crypto.randomUUID();
      const { error } = await sb.from('envios_diagnostico').insert({
        empresa_id: empresaId,
        colaborador_id: colab.id,
        email: colab.email,
        token,
        status: 'pendente',
        tipo: 'reavaliacao',
        cenarios_ids: cenarios.map(c => c.id),
      });

      if (!error) criados++;
    }

    return { success: true, message: `Reavaliação iniciada: ${criados} envios criados` };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ── Relatórios de evolução em lote ──────────────────────────────────────────

export async function gerarRelatoriosEvolucaoLote(empresaId, aiConfig = {}) {
  const sb = createSupabaseAdmin();
  try {
    const { data: empresa } = await sb.from('empresas')
      .select('nome, segmento')
      .eq('id', empresaId).single();

    const { data: colaboradores } = await sb.from('colaboradores')
      .select('id, nome_completo, cargo')
      .eq('empresa_id', empresaId);

    if (!colaboradores?.length) return { success: false, error: 'Nenhum colaborador encontrado' };

    const system = `Você é um consultor sênior em desenvolvimento humano e organizacional.
Compare a avaliação inicial com a reavaliação e gere um relatório de evolução.
Responda APENAS com JSON válido.`;

    let gerados = 0;

    for (const colab of colaboradores) {
      // Buscar relatório inicial
      const { data: relInicial } = await sb.from('relatorios')
        .select('conteudo')
        .eq('empresa_id', empresaId)
        .eq('colaborador_id', colab.id)
        .eq('tipo', 'individual')
        .single();

      // Buscar respostas da reavaliação
      const { data: respostasReav } = await sb.from('respostas')
        .select('*, banco_cenarios!inner(competencias!inner(nome))')
        .eq('colaborador_id', colab.id)
        .not('avaliacao_ia', 'is', null)
        .order('created_at', { ascending: false });

      if (!relInicial || !respostasReav?.length) continue;

      const avaliacoesReav = respostasReav.map(r => ({
        competencia: r.banco_cenarios?.competencias?.nome,
        nivel: r.avaliacao_ia?.nivel_identificado,
      }));

      const user = `Empresa: ${empresa.nome} (${empresa.segmento})
Colaborador: ${colab.nome_completo} | Cargo: ${colab.cargo}

Avaliação Inicial:
${JSON.stringify(relInicial.conteudo?.competencias || [], null, 2)}

Reavaliação:
${JSON.stringify(avaliacoesReav, null, 2)}

Gere relatório de evolução:
{
  "colaborador": "${colab.nome_completo}",
  "evolucao_geral": "positiva|estavel|regressiva",
  "percentual_evolucao": 0-100,
  "competencias": [{"nome": "...", "nivel_antes": 1-5, "nivel_depois": 1-5, "delta": -4 a 4, "comentario": "..."}],
  "destaques_positivos": ["..."],
  "pontos_atencao": ["..."],
  "recomendacoes_proximos_passos": ["..."]
}`;

      const resultado = await callAI(system, user, aiConfig, 6000);
      const relatorio = await extractJSON(resultado);

      if (relatorio) {
        await sb.from('relatorios').upsert({
          empresa_id: empresaId,
          colaborador_id: colab.id,
          tipo: 'evolucao',
          conteudo: relatorio,
          gerado_em: new Date().toISOString(),
        }, { onConflict: 'empresa_id,colaborador_id,tipo' });
        gerados++;
      }
    }

    return { success: true, message: `${gerados} relatórios de evolução gerados` };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ── Plenária de evolução ────────────────────────────────────────────────────

export async function gerarPlenariaEvolucao(empresaId, aiConfig = {}) {
  const sb = createSupabaseAdmin();
  try {
    const { data: empresa } = await sb.from('empresas')
      .select('nome, segmento')
      .eq('id', empresaId).single();

    const { data: relatorios } = await sb.from('relatorios')
      .select('*, colaboradores(nome_completo, cargo)')
      .eq('empresa_id', empresaId)
      .eq('tipo', 'evolucao');

    if (!relatorios?.length) return { success: false, error: 'Nenhum relatório de evolução encontrado.' };

    const system = `Você é um facilitador de plenárias de desenvolvimento organizacional.
Gere um material para plenária de evolução da equipe.
Responda APENAS com JSON válido.`;

    const dados = relatorios.map(r => ({
      nome: r.colaboradores?.nome_completo,
      cargo: r.colaboradores?.cargo,
      evolucao: r.conteudo?.evolucao_geral,
      percentual: r.conteudo?.percentual_evolucao,
      destaques: r.conteudo?.destaques_positivos,
    }));

    const user = `Empresa: ${empresa.nome} (${empresa.segmento})
Equipe (${relatorios.length} pessoas):
${JSON.stringify(dados, null, 2)}

Gere material para plenária:
{
  "titulo": "...",
  "resumo_evolucao_equipe": "...",
  "percentual_medio_evolucao": 0-100,
  "maiores_evolucoes": [{"nome": "...", "destaque": "..."}],
  "temas_plenaria": ["..."],
  "dinamicas_sugeridas": ["..."],
  "proximos_passos": ["..."]
}`;

    const resultado = await callAI(system, user, aiConfig, 6000);
    const plenaria = await extractJSON(resultado);

    if (plenaria) {
      await sb.from('relatorios').upsert({
        empresa_id: empresaId,
        colaborador_id: null,
        tipo: 'plenaria_evolucao',
        conteudo: plenaria,
        gerado_em: new Date().toISOString(),
      }, { onConflict: 'empresa_id,colaborador_id,tipo' });
    }

    return { success: true, message: 'Material de plenária de evolução gerado' };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ── Relatório RH manual ─────────────────────────────────────────────────────

export async function gerarRelatorioRHManual(empresaId, aiConfig = {}) {
  const sb = createSupabaseAdmin();
  try {
    const { data: empresa } = await sb.from('empresas')
      .select('nome, segmento')
      .eq('id', empresaId).single();

    const { data: relEvolucao } = await sb.from('relatorios')
      .select('*, colaboradores(nome_completo, cargo)')
      .eq('empresa_id', empresaId)
      .eq('tipo', 'evolucao');

    const { data: relRHAnterior } = await sb.from('relatorios')
      .select('conteudo')
      .eq('empresa_id', empresaId)
      .eq('tipo', 'rh')
      .single();

    const system = `Você é um consultor estratégico de RH.
Gere um relatório analítico de RH pós-desenvolvimento, comparando com o diagnóstico inicial.
Responda APENAS com JSON válido.`;

    const user = `Empresa: ${empresa.nome} (${empresa.segmento})
Relatório RH anterior: ${JSON.stringify(relRHAnterior?.conteudo || {}, null, 2)}
Evolução da equipe: ${JSON.stringify((relEvolucao || []).map(r => ({ nome: r.colaboradores?.nome_completo, ...r.conteudo })), null, 2)}

Gere relatório RH pós-desenvolvimento:
{
  "resumo_executivo": "...",
  "roi_desenvolvimento": "...",
  "evolucao_organizacional": "...",
  "gaps_resolvidos": ["..."],
  "gaps_persistentes": ["..."],
  "recomendacoes_estrategicas": ["..."],
  "proximos_ciclos": ["..."]
}`;

    const resultado = await callAI(system, user, aiConfig, 8000);
    const relatorio = await extractJSON(resultado);

    if (relatorio) {
      await sb.from('relatorios').upsert({
        empresa_id: empresaId,
        colaborador_id: null,
        tipo: 'rh_manual',
        conteudo: relatorio,
        gerado_em: new Date().toISOString(),
      }, { onConflict: 'empresa_id,colaborador_id,tipo' });
    }

    return { success: true, message: 'Relatório RH manual gerado' };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ── Relatório Plenária ──────────────────────────────────────────────────────

export async function gerarRelatorioPlenaria(empresaId, aiConfig = {}) {
  const sb = createSupabaseAdmin();
  try {
    const { data: plenaria } = await sb.from('relatorios')
      .select('conteudo')
      .eq('empresa_id', empresaId)
      .eq('tipo', 'plenaria_evolucao')
      .single();

    if (!plenaria) return { success: false, error: 'Plenária de evolução não encontrada. Gere-a primeiro.' };

    const { data: empresa } = await sb.from('empresas')
      .select('nome')
      .eq('id', empresaId).single();

    const system = `Você é um consultor que elabora relatórios de plenária.
Transforme os dados da plenária em um relatório formatado.
Responda APENAS com JSON válido.`;

    const user = `Empresa: ${empresa.nome}
Dados da plenária: ${JSON.stringify(plenaria.conteudo, null, 2)}

Gere relatório formal da plenária:
{
  "titulo": "...",
  "data": "${new Date().toISOString().split('T')[0]}",
  "participantes_previstos": 0,
  "pauta": ["..."],
  "resultados_apresentados": "...",
  "deliberacoes": ["..."],
  "encaminhamentos": [{"acao": "...", "responsavel": "...", "prazo": "..."}]
}`;

    const resultado = await callAI(system, user, aiConfig, 4096);
    const relatorio = await extractJSON(resultado);

    if (relatorio) {
      await sb.from('relatorios').upsert({
        empresa_id: empresaId,
        colaborador_id: null,
        tipo: 'plenaria_relatorio',
        conteudo: relatorio,
        gerado_em: new Date().toISOString(),
      }, { onConflict: 'empresa_id,colaborador_id,tipo' });
    }

    return { success: true, message: 'Relatório da plenária gerado' };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ── Enviar links de perfil ──────────────────────────────────────────────────

export async function enviarLinksPerfil(empresaId) {
  const sb = createSupabaseAdmin();
  try {
    const { data: empresa } = await sb.from('empresas')
      .select('nome, slug')
      .eq('id', empresaId).single();

    const { data: colaboradores } = await sb.from('colaboradores')
      .select('id, nome_completo, email')
      .eq('empresa_id', empresaId);

    if (!colaboradores?.length) return { success: false, error: 'Nenhum colaborador encontrado' };

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://vertho.app';
    let enviados = 0;

    for (const colab of colaboradores) {
      const link = `${baseUrl}/${empresa.slug}/perfil/${colab.id}`;

      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: 'Vertho Mentor IA <noreply@vertho.app>',
          to: colab.email,
          subject: `[${empresa.nome}] Seu Perfil de Evolução`,
          html: `<p>Olá ${colab.nome_completo}!</p>
<p>Seu perfil com relatórios e trilha de desenvolvimento está disponível.</p>
<p><a href="${link}" style="background:#6366f1;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;">Acessar Perfil</a></p>`,
        }),
      });

      if (res.ok) enviados++;
    }

    return { success: true, message: `${enviados} links de perfil enviados` };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ── Dossiê do Gestor ────────────────────────────────────────────────────────

export async function gerarDossieGestor(empresaId, aiConfig = {}) {
  const sb = createSupabaseAdmin();
  try {
    const { data: empresa } = await sb.from('empresas')
      .select('nome, segmento')
      .eq('id', empresaId).single();

    // Fetch all report types
    const { data: todosRelatorios } = await sb.from('relatorios')
      .select('tipo, conteudo, colaboradores(nome_completo, cargo)')
      .eq('empresa_id', empresaId);

    const system = `Você é um consultor executivo.
Compile todos os dados em um dossiê completo para o gestor.
Responda APENAS com JSON válido.`;

    const porTipo = {};
    for (const r of todosRelatorios || []) {
      if (!porTipo[r.tipo]) porTipo[r.tipo] = [];
      porTipo[r.tipo].push({ colaborador: r.colaboradores?.nome_completo, resumo: r.conteudo?.resumo_executivo || r.conteudo?.evolucao_geral });
    }

    const user = `Empresa: ${empresa.nome} (${empresa.segmento})
Relatórios por tipo: ${JSON.stringify(porTipo, null, 2)}

Gere dossiê executivo:
{
  "titulo": "Dossiê Gestão — ${empresa.nome}",
  "sumario_executivo": "...",
  "diagnostico_inicial": "...",
  "evolucao_pos_desenvolvimento": "...",
  "analise_roi": "...",
  "mapa_talentos": "...",
  "recomendacoes_estrategicas": ["..."],
  "conclusao": "..."
}`;

    const resultado = await callAI(system, user, aiConfig, 8000);
    const dossie = await extractJSON(resultado);

    if (dossie) {
      await sb.from('relatorios').upsert({
        empresa_id: empresaId,
        colaborador_id: null,
        tipo: 'dossie_gestor',
        conteudo: dossie,
        gerado_em: new Date().toISOString(),
      }, { onConflict: 'empresa_id,colaborador_id,tipo' });
    }

    return { success: true, message: 'Dossiê do gestor gerado' };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ── Check cenários ──────────────────────────────────────────────────────────

export async function checkCenarios(empresaId, aiConfig = {}) {
  const sb = createSupabaseAdmin();
  try {
    const { data: cenarios } = await sb.from('banco_cenarios')
      .select('id, titulo, descricao, alternativas, competencias!inner(nome)')
      .eq('empresa_id', empresaId);

    if (!cenarios?.length) return { success: false, error: 'Nenhum cenário encontrado' };

    const system = `Você é um especialista em qualidade de avaliações comportamentais.
Verifique a qualidade dos cenários.
Responda APENAS com JSON válido.`;

    const user = `Verifique ${cenarios.length} cenários quanto a:
- Clareza das situações
- Qualidade das alternativas
- Cobertura dos níveis de proficiência

Cenários: ${JSON.stringify(cenarios.slice(0, 20), null, 2)}

Retorne:
{
  "total_verificados": ${Math.min(cenarios.length, 20)},
  "aprovados": 0,
  "com_ressalvas": 0,
  "reprovados": 0,
  "detalhes": [{"cenario_id": "...", "status": "aprovado|ressalva|reprovado", "observacao": "..."}]
}`;

    const resultado = await callAI(system, user, aiConfig, 6000);
    const verificacao = await extractJSON(resultado);

    return {
      success: true,
      message: `Verificação: ${verificacao?.aprovados || 0} aprovados, ${verificacao?.com_ressalvas || 0} com ressalvas, ${verificacao?.reprovados || 0} reprovados`,
      verificacao,
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}
