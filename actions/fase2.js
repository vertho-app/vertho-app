'use server';

import { createSupabaseAdmin } from '@/lib/supabase';
import crypto from 'crypto';

// ── Gerar formulários (envios_diagnostico) ──────────────────────────────────

export async function gerarForms(empresaId) {
  const sb = createSupabaseAdmin();
  try {
    const { data: colaboradores } = await sb.from('colaboradores')
      .select('id, nome_completo, email, cargo')
      .eq('empresa_id', empresaId);

    if (!colaboradores?.length) return { success: false, error: 'Nenhum colaborador encontrado' };

    const { data: cenarios } = await sb.from('banco_cenarios')
      .select('id, cargo')
      .eq('empresa_id', empresaId);

    if (!cenarios?.length) return { success: false, error: 'Nenhum cenário encontrado. Rode Fase 1 primeiro.' };

    let totalEnvios = 0;

    for (const colab of colaboradores) {
      const cenariosDosCargo = cenarios.filter(c => c.cargo === colab.cargo);
      if (!cenariosDosCargo.length) continue;

      const token = crypto.randomUUID();

      const { error } = await sb.from('envios_diagnostico').insert({
        empresa_id: empresaId,
        colaborador_id: colab.id,
        email: colab.email,
        token,
        status: 'pendente',
        tipo: 'autoavaliacao',
        cenarios_ids: cenariosDosCargo.map(c => c.id),
      });

      if (!error) totalEnvios++;
    }

    return { success: true, message: `${totalEnvios} formulários gerados para ${colaboradores.length} colaboradores` };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ── Disparar e-mails de convite ─────────────────────────────────────────────

export async function dispararEmails(empresaId) {
  const sb = createSupabaseAdmin();
  try {
    const { data: envios } = await sb.from('envios_diagnostico')
      .select('id, email, token, colaborador_id')
      .eq('empresa_id', empresaId)
      .eq('status', 'pendente')
      .is('enviado_em', null);

    if (!envios?.length) return { success: false, error: 'Nenhum envio pendente encontrado' };

    const { data: empresa } = await sb.from('empresas')
      .select('nome, slug')
      .eq('id', empresaId).single();

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://vertho.app';
    let enviados = 0;
    let erros = 0;

    for (const envio of envios) {
      const link = `${baseUrl}/${empresa.slug}/avaliacao/${envio.token}`;

      try {
        // Send via Resend or similar email service
        const emailRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          },
          body: JSON.stringify({
            from: 'Vertho Mentor IA <noreply@vertho.app>',
            to: envio.email,
            subject: `[${empresa.nome}] Avaliação de Competências`,
            html: `<p>Olá! Você foi convidado(a) para participar da avaliação de competências da <strong>${empresa.nome}</strong>.</p>
<p><a href="${link}" style="background:#6366f1;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;">Iniciar Avaliação</a></p>
<p>Ou acesse: ${link}</p>`,
          }),
        });

        if (emailRes.ok) {
          await sb.from('envios_diagnostico')
            .update({ status: 'enviado', enviado_em: new Date().toISOString() })
            .eq('id', envio.id);
          enviados++;
        } else {
          erros++;
        }
      } catch (_) {
        erros++;
      }
    }

    return { success: true, message: `${enviados} e-mails enviados, ${erros} erros` };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ── Coletar respostas ───────────────────────────────────────────────────────

export async function coletarRespostas(empresaId) {
  const sb = createSupabaseAdmin();
  try {
    const { data: envios } = await sb.from('envios_diagnostico')
      .select('id, colaborador_id, status, respondido_em')
      .eq('empresa_id', empresaId)
      .eq('status', 'enviado');

    if (!envios?.length) return { success: true, message: 'Nenhum envio aguardando resposta' };

    let respondidos = 0;

    for (const envio of envios) {
      const { count } = await sb.from('respostas')
        .select('*', { count: 'exact', head: true })
        .eq('colaborador_id', envio.colaborador_id)
        .eq('empresa_id', empresaId);

      if (count && count > 0) {
        await sb.from('envios_diagnostico')
          .update({ status: 'respondido', respondido_em: new Date().toISOString() })
          .eq('id', envio.id);
        respondidos++;
      }
    }

    return {
      success: true,
      message: `${respondidos} novos respondidos de ${envios.length} pendentes`,
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ── Ver status dos envios ───────────────────────────────────────────────────

export async function verStatusEnvios(empresaId) {
  const sb = createSupabaseAdmin();
  try {
    const { data: envios } = await sb.from('envios_diagnostico')
      .select('id, email, status, enviado_em, respondido_em, tipo')
      .eq('empresa_id', empresaId)
      .order('created_at', { ascending: false });

    const resumo = {
      total: envios?.length || 0,
      pendente: envios?.filter(e => e.status === 'pendente').length || 0,
      enviado: envios?.filter(e => e.status === 'enviado').length || 0,
      respondido: envios?.filter(e => e.status === 'respondido').length || 0,
    };

    return { success: true, message: `Total: ${resumo.total} | Pendente: ${resumo.pendente} | Enviado: ${resumo.enviado} | Respondido: ${resumo.respondido}`, resumo, envios };
  } catch (err) {
    return { success: false, error: err.message };
  }
}
