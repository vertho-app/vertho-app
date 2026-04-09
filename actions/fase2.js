'use server';

import { createSupabaseAdmin } from '@/lib/supabase';
import crypto from 'crypto';

// ── Disparar convites (email + WhatsApp unificado) ──────────────────────────

export async function dispararEmails(empresaId) {
  const sb = createSupabaseAdmin();
  try {
    const { data: empresa } = await sb.from('empresas')
      .select('nome, slug')
      .eq('id', empresaId).single();
    if (!empresa) return { success: false, error: 'Empresa não encontrada' };

    // Buscar colaboradores (telefone pode não existir no schema)
    let colaboradores;
    const { data: c1, error: e1 } = await sb.from('colaboradores')
      .select('id, nome_completo, email, cargo, telefone')
      .eq('empresa_id', empresaId);
    if (!e1) {
      colaboradores = c1;
    } else {
      const { data: c2 } = await sb.from('colaboradores')
        .select('id, nome_completo, email, cargo')
        .eq('empresa_id', empresaId);
      colaboradores = c2;
    }
    if (!colaboradores?.length) return { success: false, error: 'Nenhum colaborador encontrado' };

    // Buscar envios já existentes
    const { data: enviosExistentes } = await sb.from('envios_diagnostico')
      .select('colaborador_id, status')
      .eq('empresa_id', empresaId);
    const envioMap = {};
    (enviosExistentes || []).forEach(e => { envioMap[e.colaborador_id] = e.status; });

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://vertho.app';
    let emailsEnviados = 0, whatsEnviados = 0, jaEnviados = 0, erros = 0;

    for (const colab of colaboradores) {
      // Pular se já foi enviado ou respondido
      if (envioMap[colab.id] === 'enviado' || envioMap[colab.id] === 'respondido') {
        jaEnviados++;
        continue;
      }

      // Gerar token se ainda não tem envio
      let token;
      if (envioMap[colab.id] === 'pendente') {
        const { data: envio } = await sb.from('envios_diagnostico')
          .select('token')
          .eq('empresa_id', empresaId)
          .eq('colaborador_id', colab.id)
          .single();
        token = envio?.token;
      }

      if (!token) {
        token = crypto.randomUUID();
        await sb.from('envios_diagnostico').upsert({
          empresa_id: empresaId,
          colaborador_id: colab.id,
          email: colab.email,
          token,
          status: 'pendente',
          tipo: 'autoavaliacao',
        }, { onConflict: 'empresa_id,colaborador_id' });
      }

      // Usar subdomínio da empresa: {slug}.vertho.com.br
      const domain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'vertho.com.br';
      const link = `https://${empresa.slug}.${domain}/avaliacao/${token}`;

      // 1. Enviar email (se tem email e Resend configurado)
      if (colab.email && process.env.RESEND_API_KEY) {
        try {
          const emailRes = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
            },
            body: JSON.stringify({
              from: 'Vertho Mentor IA <noreply@vertho.app>',
              to: colab.email,
              subject: `[${empresa.nome}] Avaliação de Competências`,
              html: `<p>Olá${colab.nome_completo ? ` ${colab.nome_completo.split(' ')[0]}` : ''}!</p>
<p>Você foi convidado(a) para participar da avaliação de competências da <strong>${empresa.nome}</strong>.</p>
<p><a href="${link}" style="background:#0D9488;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;font-weight:bold;">Iniciar Avaliação</a></p>
<p style="color:#666;font-size:12px;">Ou acesse: ${link}</p>`,
            }),
          });
          if (emailRes.ok) emailsEnviados++;
          else erros++;
        } catch { erros++; }
      }

      // 2. Enviar WhatsApp (se tem telefone e QStash configurado)
      if (colab.telefone && process.env.QSTASH_TOKEN) {
        try {
          const msg = `Olá${colab.nome_completo ? ` ${colab.nome_completo.split(' ')[0]}` : ''}! Você foi convidado(a) para a avaliação de competências da *${empresa.nome}*.\n\nAcesse: ${link}`;
          const webhookUrl = `${baseUrl}/api/webhooks/qstash/whatsapp-cis`;
          await fetch('https://qstash.upstash.io/v2/publish/' + encodeURIComponent(webhookUrl), {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${process.env.QSTASH_TOKEN}`,
              'Upstash-Delay': `${whatsEnviados * 2}s`,
            },
            body: JSON.stringify({ telefone: colab.telefone, mensagem: msg }),
          });
          whatsEnviados++;
        } catch { /* WhatsApp é best-effort */ }
      }

      // Marcar como enviado
      await sb.from('envios_diagnostico')
        .update({ status: 'enviado', enviado_em: new Date().toISOString() })
        .eq('empresa_id', empresaId)
        .eq('colaborador_id', colab.id);
    }

    const parts = [];
    if (emailsEnviados) parts.push(`${emailsEnviados} emails`);
    if (whatsEnviados) parts.push(`${whatsEnviados} WhatsApp`);
    if (jaEnviados) parts.push(`${jaEnviados} já enviados`);
    if (erros) parts.push(`${erros} erros`);

    return { success: true, message: `Convites: ${parts.join(' · ')}` };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ── Ver status dos envios (com sync automático de respostas) ────────────────

export async function verStatusEnvios(empresaId) {
  const sb = createSupabaseAdmin();
  try {
    // Auto-sync: marcar como respondido se sessão concluída
    const { data: enviados } = await sb.from('envios_diagnostico')
      .select('id, colaborador_id')
      .eq('empresa_id', empresaId)
      .eq('status', 'enviado');

    if (enviados?.length) {
      for (const envio of enviados) {
        const { count } = await sb.from('sessoes_avaliacao')
          .select('*', { count: 'exact', head: true })
          .eq('colaborador_id', envio.colaborador_id)
          .eq('empresa_id', empresaId)
          .eq('status', 'concluida');

        if (count && count > 0) {
          await sb.from('envios_diagnostico')
            .update({ status: 'respondido', respondido_em: new Date().toISOString() })
            .eq('id', envio.id);
        }
      }
    }

    // Buscar status atualizado
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
