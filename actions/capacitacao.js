'use server';

import { createSupabaseAdmin } from '@/lib/supabase';
import {
  moodleCreateUser, moodleGetUser, moodleEnrollBatch, moodleGetCompletion,
} from '@/lib/moodle';
import { callAI } from './ai-client';

// ── Constantes ──────────────────────────────────────────────────────────────
const TOTAL_SEMANAS = 14;
const SEMANAS_IMPL = [4, 8, 12]; // semanas de prática (sem conteúdo novo)
const NUDGE_THRESHOLD_DAYS = 14; // 2 semanas sem atividade

// ── Provisionar Moodle em Lote ──────────────────────────────────────────────
// Cria usuário no Moodle + matricula nos cursos da trilha

export async function provisionarMoodleLote(empresaId) {
  const sb = createSupabaseAdmin();
  try {
    // Buscar trilhas com cursos
    const { data: trilhas } = await sb.from('trilhas')
      .select('colaborador_id, cursos')
      .eq('empresa_id', empresaId);

    if (!trilhas?.length) return { success: false, error: 'Nenhuma trilha encontrada. Monte as trilhas primeiro.' };

    // Buscar colaboradores
    const colabIds = trilhas.map(t => t.colaborador_id).filter(Boolean);
    const { data: colabs } = await sb.from('colaboradores')
      .select('id, nome_completo, email')
      .in('id', colabIds);
    const colabMap = {};
    (colabs || []).forEach(c => { colabMap[c.id] = c; });

    // Buscar progresso existente (para não reprovisionar)
    const { data: progressos } = await sb.from('fase4_progresso')
      .select('colaborador_id, moodle_user_id')
      .eq('empresa_id', empresaId);
    const jaProvisionados = {};
    (progressos || []).forEach(p => { if (p.moodle_user_id) jaProvisionados[p.colaborador_id] = p.moodle_user_id; });

    let criados = 0, matriculados = 0, erros = 0, jaExistentes = 0;
    const detalhes = [];

    for (const trilha of trilhas) {
      const colab = colabMap[trilha.colaborador_id];
      if (!colab?.email) { detalhes.push(`Skip: colaborador sem email`); continue; }

      // Pular se já provisionado
      if (jaProvisionados[trilha.colaborador_id]) {
        jaExistentes++;
        continue;
      }

      try {
        // Criar ou encontrar usuário no Moodle
        let moodleUser = await moodleGetUser(colab.email);
        if (!moodleUser) {
          const created = await moodleCreateUser(colab.email, colab.nome_completo);
          moodleUser = Array.isArray(created) ? created[0] : created;
          criados++;
        }

        if (!moodleUser?.id) {
          erros++;
          detalhes.push(`${colab.nome_completo}: Moodle user sem ID`);
          continue;
        }

        // Matricular nos cursos da trilha
        const cursos = Array.isArray(trilha.cursos) ? trilha.cursos : [];
        const courseIds = [...new Set(cursos.map(c => Number(c.course_id)).filter(id => id > 0))];

        if (courseIds.length) {
          try {
            const enrollments = courseIds.map(cid => ({
              userId: moodleUser.id,
              courseId: cid,
            }));
            await moodleEnrollBatch(enrollments);
            matriculados += courseIds.length;
          } catch (enrollErr) {
            detalhes.push(`${colab.nome_completo}: matrícula falhou — ${enrollErr.message}`);
          }
        } else {
          detalhes.push(`${colab.nome_completo}: trilha sem course_ids válidos`);
        }

        // Salvar moodle_user_id no progresso
        await sb.from('fase4_progresso').upsert({
          empresa_id: empresaId,
          colaborador_id: trilha.colaborador_id,
          moodle_user_id: moodleUser.id,
          semana_atual: 1,
          status: 'aguardando_inicio',
          cursos_progresso: cursos.map(c => ({
            course_id: c.course_id,
            nome: c.nome,
            pct: 0,
            concluido: false,
          })),
          criado_em: new Date().toISOString(),
        }, { onConflict: 'empresa_id,colaborador_id' });

      } catch (err) {
        erros++;
        detalhes.push(`${colab?.nome_completo || '?'}: ${err.message}`);
      }
    }

    const msg = `Moodle: ${criados} users criados, ${matriculados} matrículas, ${jaExistentes} já existentes${erros ? `, ${erros} erros` : ''}`;
    return { success: true, message: msg + (detalhes.length ? ' — ' + detalhes.join('; ') : '') };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ── Sync Progresso Moodle ───────────────────────────────────────────────────
// Busca completion status de cada curso via API Moodle

export async function syncProgressoMoodle(empresaId) {
  const sb = createSupabaseAdmin();
  try {
    const { data: progressos } = await sb.from('fase4_progresso')
      .select('id, colaborador_id, moodle_user_id, cursos_progresso')
      .eq('empresa_id', empresaId)
      .not('moodle_user_id', 'is', null);

    if (!progressos?.length) return { success: false, error: 'Nenhum colaborador provisionado no Moodle. Rode "Provisionar Moodle" primeiro.' };

    let atualizados = 0, erros = 0;

    for (const prog of progressos) {
      const cursos = Array.isArray(prog.cursos_progresso) ? prog.cursos_progresso : [];
      if (!cursos.length) continue;

      let totalPct = 0;
      const cursosAtualizados = [];

      for (const curso of cursos) {
        try {
          const completion = await moodleGetCompletion(prog.moodle_user_id, curso.course_id);
          // completion.completionstatus.completions[] → each has {type, status, complete, timecompleted}
          const completions = completion?.completionstatus?.completions || [];
          const total = completions.length;
          const done = completions.filter(c => c.complete === true).length;
          const pct = total > 0 ? Math.round((done / total) * 100) : 0;

          cursosAtualizados.push({
            ...curso,
            pct,
            concluido: pct >= 80,
            atividades_total: total,
            atividades_concluidas: done,
          });
          totalPct += pct;
        } catch {
          // Moodle API pode falhar para cursos sem completion tracking
          cursosAtualizados.push({ ...curso });
          totalPct += (curso.pct || 0);
        }
      }

      const pctGeral = cursos.length > 0 ? Math.round(totalPct / cursos.length) : 0;
      const todosConcluidos = cursosAtualizados.every(c => c.concluido);

      const { error } = await sb.from('fase4_progresso')
        .update({
          cursos_progresso: cursosAtualizados,
          pct_conclusao: pctGeral,
          ultimo_sync: new Date().toISOString(),
          ultimo_acesso: new Date().toISOString(),
          ...(todosConcluidos ? { status: 'concluido' } : {}),
        })
        .eq('id', prog.id);

      if (!error) atualizados++;
      else erros++;
    }

    return { success: true, message: `Progresso sync: ${atualizados} colaboradores atualizados${erros ? `, ${erros} erros` : ''}` };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ── Iniciar Capacitação ─────────────────────────────────────────────────────
// Atualiza status para em_andamento + gera contrato pedagógico

export async function iniciarCapacitacao(empresaId) {
  const sb = createSupabaseAdmin();
  try {
    // Buscar colaboradores com trilha e progresso aguardando
    const { data: progressos } = await sb.from('fase4_progresso')
      .select('id, colaborador_id')
      .eq('empresa_id', empresaId)
      .eq('status', 'aguardando_inicio');

    if (!progressos?.length) return { success: false, error: 'Nenhum colaborador aguardando início' };

    // Buscar trilhas para contrato
    const colabIds = progressos.map(p => p.colaborador_id);
    const { data: trilhas } = await sb.from('trilhas')
      .select('colaborador_id, competencia_foco, cursos')
      .eq('empresa_id', empresaId)
      .in('colaborador_id', colabIds);
    const trilhaMap = {};
    (trilhas || []).forEach(t => { trilhaMap[t.colaborador_id] = t; });

    let iniciados = 0;
    for (const prog of progressos) {
      const trilha = trilhaMap[prog.colaborador_id];
      const cursos = Array.isArray(trilha?.cursos) ? trilha.cursos : [];

      const contrato = {
        competencia: trilha?.competencia_foco || 'N/D',
        total_cursos: cursos.length,
        duracao_semanas: TOTAL_SEMANAS,
        criterio_conclusao: 'Completar 80% das atividades de cada curso',
        checkins_gestor: [1, 7, 14],
      };

      await sb.from('fase4_progresso')
        .update({
          status: 'em_andamento',
          competencia_foco: trilha?.competencia_foco || null,
          contrato,
          iniciado_em: new Date().toISOString(),
        })
        .eq('id', prog.id);
      iniciados++;
    }

    return { success: true, message: `Capacitação iniciada para ${iniciados} colaboradores` };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ── Avançar Semana ──────────────────────────────────────────────────────────

export async function avancarSemana(empresaId) {
  const sb = createSupabaseAdmin();
  try {
    const { data: progressos } = await sb.from('fase4_progresso')
      .select('id, semana_atual')
      .eq('empresa_id', empresaId)
      .eq('status', 'em_andamento');

    if (!progressos?.length) return { success: false, error: 'Nenhum colaborador em andamento' };

    let avancados = 0;
    for (const p of progressos) {
      if (p.semana_atual >= TOTAL_SEMANAS) continue;
      await sb.from('fase4_progresso')
        .update({ semana_atual: p.semana_atual + 1 })
        .eq('id', p.id);
      avancados++;
    }

    return { success: true, message: `${avancados} colaboradores avançaram de semana` };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ── Nudge de Inatividade ────────────────────────────────────────────────────

export async function enviarNudgesInatividade(empresaId) {
  const sb = createSupabaseAdmin();
  try {
    const { data: progressos } = await sb.from('fase4_progresso')
      .select('id, colaborador_id, ultimo_acesso, nudge_enviado_em, semana_atual')
      .eq('empresa_id', empresaId)
      .eq('status', 'em_andamento');

    if (!progressos?.length) return { success: false, error: 'Nenhum colaborador em andamento' };

    const agora = new Date();
    const threshold = new Date(agora.getTime() - NUDGE_THRESHOLD_DAYS * 24 * 60 * 60 * 1000);
    let enviados = 0;

    // Buscar colaboradores + gestores
    const colabIds = progressos.map(p => p.colaborador_id);
    const { data: colabs } = await sb.from('colaboradores')
      .select('id, nome_completo, email, whatsapp, gestor_nome, gestor_email, gestor_whatsapp')
      .in('id', colabIds);
    const colabMap = {};
    (colabs || []).forEach(c => { colabMap[c.id] = c; });

    // Buscar config da empresa (para remetente)
    const { data: empresa } = await sb.from('empresas')
      .select('nome, slug')
      .eq('id', empresaId).single();

    for (const prog of progressos) {
      const ultimoAcesso = prog.ultimo_acesso ? new Date(prog.ultimo_acesso) : null;
      const nudgeAnterior = prog.nudge_enviado_em ? new Date(prog.nudge_enviado_em) : null;

      // Inativo: sem acesso há 2+ semanas
      const inativo = !ultimoAcesso || ultimoAcesso < threshold;
      // Não reenviar nudge se já enviou nos últimos 7 dias
      const jaNudgeou = nudgeAnterior && nudgeAnterior > new Date(agora.getTime() - 7 * 24 * 60 * 60 * 1000);

      if (!inativo || jaNudgeou) continue;

      const colab = colabMap[prog.colaborador_id];
      if (!colab?.email) continue;

      // Enviar email ao colaborador
      try {
        const { Resend } = await import('resend');
        const resend = new Resend(process.env.RESEND_API_KEY);

        await resend.emails.send({
          from: `Vertho Mentor <noreply@${empresa?.slug || 'app'}.vertho.com.br>`,
          to: colab.email,
          subject: `${colab.nome_completo}, sentimos sua falta! 🎯`,
          html: `
            <div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:20px">
              <h2 style="color:#0F2B54">Olá, ${colab.nome_completo.split(' ')[0]}!</h2>
              <p>Notamos que você está há algum tempo sem acessar sua trilha de desenvolvimento.</p>
              <p>Você está na <strong>semana ${prog.semana_atual}</strong> de ${TOTAL_SEMANAS}. Cada passo conta!</p>
              <p>Que tal retomar hoje? Mesmo 15 minutos fazem diferença.</p>
              <p style="margin-top:20px">
                <a href="https://${empresa?.slug || 'app'}.vertho.com.br/dashboard/jornada"
                   style="background:#34c5cc;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold">
                  Acessar minha trilha →
                </a>
              </p>
              <p style="color:#666;font-size:12px;margin-top:30px">Vertho Mentor IA</p>
            </div>
          `,
        });

        // Alerta ao gestor (se configurado)
        if (colab.gestor_email) {
          await resend.emails.send({
            from: `Vertho Mentor <noreply@${empresa?.slug || 'app'}.vertho.com.br>`,
            to: colab.gestor_email,
            subject: `[Atenção] ${colab.nome_completo} está inativo na capacitação`,
            html: `
              <div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:20px">
                <h2 style="color:#0F2B54">Alerta de Inatividade</h2>
                <p><strong>${colab.nome_completo}</strong> não acessa a trilha de desenvolvimento há mais de 2 semanas.</p>
                <p>Semana atual: <strong>${prog.semana_atual}/${TOTAL_SEMANAS}</strong></p>
                <p>Sugerimos agendar uma conversa rápida para entender se há alguma dificuldade.</p>
                <p style="color:#666;font-size:12px;margin-top:30px">Vertho Mentor IA — Alerta automático</p>
              </div>
            `,
          });
        }

        // Marcar nudge enviado
        await sb.from('fase4_progresso')
          .update({ nudge_enviado_em: new Date().toISOString() })
          .eq('id', prog.id);
        enviados++;
      } catch {
        // Silenciar erros de envio individual
      }
    }

    return { success: true, message: `${enviados} nudges enviados (${progressos.length - enviados} não precisavam)` };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ── Status Capacitação (Dashboard) ──────────────────────────────────────────

export async function loadProgressoCapacitacao(empresaId) {
  const sb = createSupabaseAdmin();
  try {
    const { data: progressos } = await sb.from('fase4_progresso')
      .select('*, colaboradores!inner(nome_completo, cargo, email, gestor_nome)')
      .eq('empresa_id', empresaId)
      .order('criado_em', { ascending: false });

    if (!progressos?.length) return { success: true, data: [], resumo: null };

    const resumo = {
      total: progressos.length,
      aguardando: progressos.filter(p => p.status === 'aguardando_inicio').length,
      em_andamento: progressos.filter(p => p.status === 'em_andamento').length,
      concluido: progressos.filter(p => p.status === 'concluido').length,
      pct_medio: Math.round(progressos.reduce((s, p) => s + (p.pct_conclusao || 0), 0) / progressos.length),
      semana_media: Math.round(progressos.reduce((s, p) => s + (p.semana_atual || 0), 0) / progressos.length),
      provisionados: progressos.filter(p => p.moodle_user_id).length,
      total_semanas: TOTAL_SEMANAS,
    };

    // Meta coletiva por gestor
    const porGestor = {};
    progressos.forEach(p => {
      const gestor = p.colaboradores.gestor_nome || 'Sem gestor';
      if (!porGestor[gestor]) porGestor[gestor] = { total: 0, acima75: 0 };
      porGestor[gestor].total++;
      if ((p.pct_conclusao || 0) >= 75) porGestor[gestor].acima75++;
    });

    const metaColetiva = Object.entries(porGestor).map(([gestor, v]) => ({
      gestor,
      total: v.total,
      acima75: v.acima75,
      pct: v.total ? Math.round((v.acima75 / v.total) * 100) : 0,
    }));

    return {
      success: true,
      data: progressos.map(p => ({
        id: p.id,
        colaborador_id: p.colaborador_id,
        nome: p.colaboradores.nome_completo,
        cargo: p.colaboradores.cargo,
        email: p.colaboradores.email,
        gestor: p.colaboradores.gestor_nome,
        status: p.status,
        semana_atual: p.semana_atual,
        pct_conclusao: p.pct_conclusao || 0,
        moodle_ok: !!p.moodle_user_id,
        cursos_progresso: p.cursos_progresso || [],
        competencia_foco: p.competencia_foco,
        ultimo_sync: p.ultimo_sync,
        ultimo_acesso: p.ultimo_acesso,
        nudge_enviado_em: p.nudge_enviado_em,
        iniciado_em: p.iniciado_em,
      })),
      resumo,
      metaColetiva,
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ── Tutor IA ────────────────────────────────────────────────────────────────
// Chatbot para dúvidas sobre a trilha/curso da semana

const TUTOR_SYSTEM = `Você é um tutor virtual da plataforma Vertho Mentor IA.
Seu papel é ajudar o colaborador a entender e aplicar o conteúdo da semana.

REGRAS:
1. Máximo 3 parágrafos curtos
2. Sempre cite o conteúdo da semana ("como vimos no curso...")
3. Sempre termine perguntando: "O que você já tentou aplicar disso?"
4. Use linguagem prática e exemplos do dia a dia profissional
5. Dê exemplos concretos e aplicáveis
6. Se a pergunta fugir do escopo: "Ótima pergunta! Isso foge do nosso foco desta semana, mas sugiro anotar e trazer no check-in com seu gestor."
7. Nunca avalie, julgue ou dê notas
8. Nunca mencione nível, PDI, DISC ou dados internos
9. Se não souber responder: "Vou verificar melhor esse ponto. Por enquanto, sugiro focar em..."`;

export async function chatTutor(empresaId, colaboradorId, mensagem, historico = []) {
  const sb = createSupabaseAdmin();
  try {
    // Buscar contexto do colaborador
    const { data: prog } = await sb.from('fase4_progresso')
      .select('semana_atual, competencia_foco, cursos_progresso, colaboradores!inner(nome_completo, cargo)')
      .eq('empresa_id', empresaId)
      .eq('colaborador_id', colaboradorId)
      .single();

    if (!prog) return { success: false, error: 'Colaborador sem progresso na capacitação' };

    const cursos = Array.isArray(prog.cursos_progresso) ? prog.cursos_progresso : [];
    const cursoAtual = cursos.find(c => !c.concluido) || cursos[0];

    const contexto = `
Colaborador: ${prog.colaboradores.nome_completo} | Cargo: ${prog.colaboradores.cargo}
Semana: ${prog.semana_atual}/${TOTAL_SEMANAS}
Competência foco: ${prog.competencia_foco || 'N/D'}
Curso atual: ${cursoAtual?.nome || 'N/D'}
Progresso geral: ${cursos.length ? Math.round(cursos.reduce((s, c) => s + (c.pct || 0), 0) / cursos.length) : 0}%`;

    const systemPrompt = TUTOR_SYSTEM + '\n\nCONTEXTO:\n' + contexto;

    // Montar mensagens (últimas 5 trocas = 10 msgs)
    const msgs = (historico || []).slice(-10);
    msgs.push({ role: 'user', content: mensagem });

    const resposta = await callAI(systemPrompt, msgs, { model: 'claude-haiku-4-5-20251001' }, 600);

    // Log
    await sb.from('tutor_log').insert({
      empresa_id: empresaId,
      colaborador_id: colaboradorId,
      semana: prog.semana_atual,
      competencia: prog.competencia_foco,
      pergunta: mensagem.slice(0, 500),
      resposta: (resposta || '').slice(0, 1000),
      modelo: 'claude-haiku-4-5-20251001',
    });

    // Atualizar último acesso
    await sb.from('fase4_progresso')
      .update({ ultimo_acesso: new Date().toISOString() })
      .eq('empresa_id', empresaId)
      .eq('colaborador_id', colaboradorId);

    return { success: true, reply: resposta };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ── Carregar histórico do tutor ─────────────────────────────────────────────

export async function loadTutorHistorico(empresaId, colaboradorId) {
  const sb = createSupabaseAdmin();
  const { data } = await sb.from('tutor_log')
    .select('pergunta, resposta, criado_em')
    .eq('empresa_id', empresaId)
    .eq('colaborador_id', colaboradorId)
    .order('criado_em', { ascending: false })
    .limit(20);

  return (data || []).reverse();
}
