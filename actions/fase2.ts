'use server';

import { APP_WEBHOOK_URL, EMAIL_FROM_DEFAULT, QSTASH_BASE_URL, tenantUrl } from '@/lib/domain';
import crypto from 'crypto';
import { requireAdminSupabase } from '@/lib/admin-supabase';
import { gateEnvioDemo } from '@/lib/demo/envio-guard';
import { hasDiscMapeado } from '@/lib/disc-status';
import { assertWhatsappAvailable } from '@/lib/whatsapp';
import { criarRelogioCadencia, duracaoEstimada, maxPorDisparo } from '@/lib/whatsapp/cadencia';

// ── Disparar convites (email + WhatsApp unificado) ──────────────────────────

export async function dispararEmails(empresaId: string) {
  const sb = await requireAdminSupabase('assessments.dispatch');
  // Tenant de demonstração: bloqueia disparo real antes de tocar colaboradores.
  const gate = await gateEnvioDemo(empresaId);
  if (gate.blocked) return { success: false, error: gate.motivo };
  try {
    const { data: empresa } = await sb.from('empresas')
      .select('nome, slug')
      .eq('id', empresaId).single();
    if (!empresa) return { success: false, error: 'Empresa não encontrada' };

    // Buscar colaboradores (telefone pode não existir no schema). Campos DISC
    // entram para filtrar quem ainda não fez o mapeamento comportamental.
    const DISC_COLS = 'perfil_dominante, d_natural, i_natural, s_natural, c_natural';
    let colaboradores;
    const { data: c1, error: e1 } = await sb.from('colaboradores')
      .select(`id, nome_completo, email, cargo, telefone, ${DISC_COLS}`)
      .eq('empresa_id', empresaId);
    if (!e1) {
      colaboradores = c1;
    } else {
      const { data: c2 } = await sb.from('colaboradores')
        .select(`id, nome_completo, email, cargo, ${DISC_COLS}`)
        .eq('empresa_id', empresaId);
      colaboradores = c2;
    }
    if (!colaboradores?.length) return { success: false, error: 'Nenhum colaborador encontrado' };

    // PRÉ-REQUISITO: só despacha o diagnóstico para quem já fez o mapeamento
    // comportamental (DISC). Quem não fez é desconsiderado (não recebe convite
    // nem ganha envio_diagnostico criado).
    const puladosSemDisc = colaboradores.filter(c => !hasDiscMapeado(c)).length;
    colaboradores = colaboradores.filter(c => hasDiscMapeado(c));
    if (!colaboradores.length) {
      return { success: false, error: 'Nenhum colaborador com DISC mapeado. Conclua o mapeamento comportamental antes de disparar o diagnóstico.' };
    }

    // Buscar envios já existentes
    const { data: enviosExistentes } = await sb.from('envios_diagnostico')
      .select('id, colaborador_id, status, token')
      .eq('empresa_id', empresaId);
    const envioMap: Record<string, { id: string; status: string; token?: string }> = {};
    (enviosExistentes || []).forEach(e => {
      envioMap[e.colaborador_id] = { id: e.id, status: e.status, token: e.token };
    });

    let emailsEnviados = 0, whatsEnviados = 0, jaEnviados = 0, erros = 0, semCanal = 0, whatsAdiados = 0;
    let whatsappDisponivel = Boolean(process.env.QSTASH_TOKEN && colaboradores.some(c => c.telefone));
    if (whatsappDisponivel) {
      try {
        // maxFilaPendente: conectado não basta — fila residual do provedor sai em
        // rajada e empilhar um lote em cima dela foi o caminho do bloqueio de
        // 11/08/2026. Aqui a trava só DESLIGA o WhatsApp (o catch abaixo), sem
        // abortar o disparo: os convites por e-mail continuam saindo.
        await assertWhatsappAvailable({ maxFilaPendente: 0 });
      } catch (err: any) {
        whatsappDisponivel = false;
        console.warn('[fase2] WhatsApp via QStash bloqueado:', err?.message || err);
      }
    }
    // Cadência e teto pela política única (lib/whatsapp/cadencia) — este call-site
    // ficou de fora da correção de 11/08 e mantinha o literal de 2s, que é a taxa
    // que derrubou o número. O excedente NÃO é descartado em silêncio: vira
    // "N adiados" na mensagem, e como o envio só marca `status: 'enviado'` para
    // quem foi acionado, um segundo disparo alcança exatamente quem sobrou.
    const relogio = criarRelogioCadencia();

    for (const colab of colaboradores) {
      // Pular se já foi enviado ou respondido
      if (envioMap[colab.id]?.status === 'enviado' || envioMap[colab.id]?.status === 'respondido') {
        jaEnviados++;
        continue;
      }

      // Gerar token se ainda não tem envio
      let token;
      let envioId = envioMap[colab.id]?.id;
      if (envioMap[colab.id]?.status === 'pendente') {
        token = envioMap[colab.id]?.token;
      }

      if (!token) {
        token = crypto.randomUUID();
        const { data: envioCriado, error: envioErr } = await sb.from('envios_diagnostico').upsert({
          empresa_id: empresaId,
          colaborador_id: colab.id,
          email: colab.email,
          token,
          status: 'pendente',
          tipo: 'autoavaliacao',
        }, { onConflict: 'empresa_id,colaborador_id' }).select('id').single();
        if (envioErr || !envioCriado?.id) {
          console.error('[fase2] Falha ao criar envio_diagnostico:', envioErr?.message || 'sem id retornado');
          erros++;
          continue;
        }
        envioId = envioCriado.id;
      }

      const link = tenantUrl(empresa.slug, `/avaliacao/${token}`);
      let emailEntregue = false;
      let whatsappAgendado = false;

      // 1. Enviar email (se tem email e Resend configurado)
      if (colab.email && process.env.RESEND_API_KEY) {
        try {
          const fromEmail = EMAIL_FROM_DEFAULT;
          const emailRes = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
            },
            body: JSON.stringify({
              from: fromEmail,
              to: colab.email,
              subject: `[${empresa.nome}] Avaliação de Competências`,
              html: `<p>Olá${colab.nome_completo ? ` ${colab.nome_completo.split(' ')[0]}` : ''}!</p>
<p>Você foi convidado(a) para participar da avaliação de competências da <strong>${empresa.nome}</strong>.</p>
<p><a href="${link}" style="background:#0D9488;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;font-weight:bold;">Iniciar Avaliação</a></p>
<p style="color:#666;font-size:12px;">Ou acesse: ${link}</p>`,
            }),
          });
          if (emailRes.ok) {
            emailEntregue = true;
            emailsEnviados++;
          } else {
            const detail = await emailRes.text();
            console.error('[Email] Resend erro:', emailRes.status, detail);
            erros++;
          }
        } catch (e) { console.error('[Email] erro:', e.message); erros++; }
      }

      // 2. Enviar WhatsApp (se tem telefone e QStash configurado)
      if (colab.telefone && whatsappDisponivel && relogio.tetoAtingido()) {
        whatsAdiados++;
      } else if (colab.telefone && whatsappDisponivel) {
        try {
          const msg = `Olá${colab.nome_completo ? ` ${colab.nome_completo.split(' ')[0]}` : ''}! Você foi convidado(a) para a avaliação de competências da *${empresa.nome}*.\n\nAcesse: ${link}`;
          const webhookUrl = `${APP_WEBHOOK_URL}/api/webhooks/qstash/whatsapp-cis`;
          const qstashRes = await fetch(`${QSTASH_BASE_URL}/v2/publish/${webhookUrl}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${process.env.QSTASH_TOKEN}`,
              'Upstash-Delay': `${relogio.proximo()}s`,
            },
            // colaboradorId/empresaId: sem eles a entrega é gravada sem dono e
            // "quem recebeu" só existe na DLQ do QStash, que expira.
            body: JSON.stringify({
              telefone: colab.telefone, mensagem: msg, envioId,
              colaboradorId: colab.id, empresaId,
            }),
          });
          if (!qstashRes.ok) throw new Error(`QStash ${qstashRes.status}: ${(await qstashRes.text()).slice(0, 200)}`);
          whatsappAgendado = true;
          whatsEnviados++;
        } catch (err) {
          console.error('[fase2] WhatsApp QStash erro:', err instanceof Error ? err.message : String(err));
          erros++;
        }
      }

      if (emailEntregue) {
        await sb.from('envios_diagnostico')
          .update({
            status: 'enviado',
            enviado_em: new Date().toISOString(),
            canal: 'email',
          })
          .eq('empresa_id', empresaId)
          .eq('colaborador_id', colab.id);
      }

      if (!emailEntregue && !whatsappAgendado) {
        semCanal++;
      }
    }

    const parts = [];
    if (emailsEnviados) parts.push(`${emailsEnviados} emails`);
    if (whatsEnviados) parts.push(`${whatsEnviados} WhatsApp (entrega em ${duracaoEstimada(whatsEnviados)})`);
    // Teto silencioso é indistinguível de "mandei para todo mundo". A frase não
    // promete o que o código não faz: quem foi adiado E recebeu e-mail já está
    // convidado (o WhatsApp era redundância) e NÃO volta num segundo disparo,
    // porque o e-mail carimbou `status: 'enviado'`. Quem ficou sem os dois segue
    // pendente e está contado em "sem canal disponível".
    if (whatsAdiados) {
      parts.push(
        `${whatsAdiados} WhatsApp adiados pelo teto de ${maxPorDisparo()} por disparo (protege o número; quem também recebeu e-mail já está convidado)`,
      );
    }
    if (jaEnviados) parts.push(`${jaEnviados} já enviados`);
    if (puladosSemDisc) parts.push(`${puladosSemDisc} sem DISC (ignorados)`);
    if (semCanal) parts.push(`${semCanal} sem canal disponível`);
    if (erros) parts.push(`${erros} erros`);

    const acionados = emailsEnviados + whatsEnviados;
    if (acionados === 0 && jaEnviados === 0) {
      return {
        success: false,
        error: `Nenhum convite enviado ou agendado${parts.length ? ` (${parts.join(' · ')})` : ''}`,
      };
    }

    return { success: true, message: `Convites: ${parts.join(' · ')}` };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ── Ver status dos envios (com sync automático de respostas) ────────────────

export async function verStatusEnvios(empresaId: string) {
  const sb = await requireAdminSupabase();
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
