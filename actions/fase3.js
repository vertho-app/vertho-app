'use server';

import { createSupabaseAdmin } from '@/lib/supabase';
import { callAI } from './ai-client';
import { extractJSON } from './utils';

// ── IA4: Avaliar respostas com IA ───────────────────────────────────────────

export async function rodarIA4(empresaId, aiConfig = {}) {
  const sb = createSupabaseAdmin();
  try {
    const { data: respostas } = await sb.from('respostas')
      .select('*, colaboradores!inner(nome_completo, cargo, empresa_id)')
      .eq('colaboradores.empresa_id', empresaId)
      .is('avaliacao_ia', null);

    if (!respostas?.length) return { success: true, message: 'Nenhuma resposta pendente de avaliação' };

    const { data: empresa } = await sb.from('empresas')
      .select('nome, segmento')
      .eq('id', empresaId).single();

    const system = `Você é um avaliador especialista em competências comportamentais.
Avalie a resposta do colaborador comparando com o gabarito.
Responda APENAS com JSON válido.`;

    let avaliadas = 0;

    for (const resp of respostas) {
      const { data: cenario } = await sb.from('banco_cenarios')
        .select('*, competencias!inner(nome, descricao, gabarito)')
        .eq('id', resp.cenario_id).single();

      if (!cenario) continue;

      const user = `Empresa: ${empresa.nome} (${empresa.segmento})
Colaborador: ${resp.colaboradores.nome_completo} | Cargo: ${resp.colaboradores.cargo}
Competência: ${cenario.competencias.nome} — ${cenario.competencias.descricao}
Cenário: ${cenario.descricao}
Resposta escolhida: ${resp.resposta}
Gabarito: ${JSON.stringify(cenario.competencias.gabarito)}

Avalie e retorne:
{"nivel_identificado": 1-5, "justificativa": "...", "pontos_fortes": ["..."], "pontos_desenvolvimento": ["..."]}`;

      const resultado = await callAI(system, user, aiConfig, 2048);
      const avaliacao = await extractJSON(resultado);

      if (avaliacao) {
        await sb.from('respostas')
          .update({ avaliacao_ia: avaliacao, avaliado_em: new Date().toISOString() })
          .eq('id', resp.id);
        avaliadas++;
      }
    }

    return { success: true, message: `IA4 concluída: ${avaliadas} respostas avaliadas` };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ── Ver fila de IA4 ─────────────────────────────────────────────────────────

export async function verFilaIA4(empresaId) {
  const sb = createSupabaseAdmin();
  try {
    const { count: pendentes } = await sb.from('respostas')
      .select('*, colaboradores!inner(empresa_id)', { count: 'exact', head: true })
      .eq('colaboradores.empresa_id', empresaId)
      .is('avaliacao_ia', null);

    const { count: avaliadas } = await sb.from('respostas')
      .select('*, colaboradores!inner(empresa_id)', { count: 'exact', head: true })
      .eq('colaboradores.empresa_id', empresaId)
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

    const system = `Você é um consultor sênior de desenvolvimento humano.
Gere um relatório individual de competências comportamentais.
Responda APENAS com JSON válido.`;

    let gerados = 0;

    for (const colab of colaboradores) {
      const { data: respostas } = await sb.from('respostas')
        .select('*, banco_cenarios!inner(titulo, competencia_id, competencias!inner(nome))')
        .eq('colaborador_id', colab.id)
        .not('avaliacao_ia', 'is', null);

      if (!respostas?.length) continue;

      const resumoAvaliacoes = respostas.map(r => ({
        competencia: r.banco_cenarios?.competencias?.nome,
        nivel: r.avaliacao_ia?.nivel_identificado,
        pontos_fortes: r.avaliacao_ia?.pontos_fortes,
        pontos_desenvolvimento: r.avaliacao_ia?.pontos_desenvolvimento,
      }));

      const user = `Empresa: ${empresa.nome} (${empresa.segmento})
Colaborador: ${colab.nome_completo} | Cargo: ${colab.cargo}

Avaliações:
${JSON.stringify(resumoAvaliacoes, null, 2)}

Gere o relatório individual:
{
  "colaborador": "${colab.nome_completo}",
  "cargo": "${colab.cargo}",
  "resumo_executivo": "...",
  "competencias": [{"nome": "...", "nivel": 1-5, "classificacao": "...", "feedback": "..."}],
  "pontos_fortes_gerais": ["..."],
  "areas_desenvolvimento": ["..."],
  "recomendacoes": ["..."]
}`;

      const resultado = await callAI(system, user, aiConfig, 6000);
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

    const system = `Você é um consultor estratégico de gestão de pessoas.
Gere um relatório consolidado para o gestor da equipe.
Responda APENAS com JSON válido.`;

    const resumos = relatorios.map(r => ({
      colaborador: r.colaboradores?.nome_completo,
      cargo: r.colaboradores?.cargo,
      resumo: r.conteudo?.resumo_executivo,
      areas_dev: r.conteudo?.areas_desenvolvimento,
    }));

    const user = `Empresa: ${empresa.nome} (${empresa.segmento})
Equipe (${relatorios.length} colaboradores):
${JSON.stringify(resumos, null, 2)}

Gere relatório do gestor:
{
  "resumo_executivo": "...",
  "visao_geral_equipe": "...",
  "competencias_fortes_equipe": ["..."],
  "gaps_criticos": ["..."],
  "recomendacoes_gestao": ["..."],
  "acoes_prioritarias": ["..."]
}`;

    const resultado = await callAI(system, user, aiConfig, 6000);
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

    const system = `Você é um consultor estratégico de RH.
Gere um relatório analítico para o departamento de RH com visão organizacional.
Responda APENAS com JSON válido.`;

    const dadosEquipe = relatorios.map(r => ({
      nome: r.colaboradores?.nome_completo,
      cargo: r.colaboradores?.cargo,
      competencias: r.conteudo?.competencias,
    }));

    const user = `Empresa: ${empresa.nome} (${empresa.segmento})
Dados completos da equipe:
${JSON.stringify(dadosEquipe, null, 2)}

Gere relatório RH:
{
  "resumo_executivo": "...",
  "mapa_competencias_organizacional": {"competencia": {"media": 0, "desvio": 0}},
  "talentos_destaque": ["..."],
  "riscos_retencao": ["..."],
  "gaps_organizacionais": ["..."],
  "plano_acao_rh": ["..."],
  "investimentos_sugeridos": ["..."]
}`;

    const resultado = await callAI(system, user, aiConfig, 8000);
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
