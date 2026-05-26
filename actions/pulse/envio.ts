'use server';

import { requireAdminSupabase } from '@/lib/admin-supabase';
import { getAuthenticatedEmailFromAction } from '@/lib/auth/action-context';
import { logAdminAction } from '@/lib/audit';
import { EMAIL_FROM_DEFAULT, tenantUrl } from '@/lib/domain';

const RESEND_MIN_INTERVAL_MS = 250;

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function enviarEmailResend(emailBody: any, throttle: { lastSentAt: number }) {
  let ultimoErro = '';
  for (let tentativa = 0; tentativa < 4; tentativa++) {
    const elapsed = Date.now() - throttle.lastSentAt;
    if (elapsed < RESEND_MIN_INTERVAL_MS) await sleep(RESEND_MIN_INTERVAL_MS - elapsed);
    throttle.lastSentAt = Date.now();

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
      body: JSON.stringify(emailBody),
    });
    if (res.ok) return { ok: true };
    ultimoErro = await res.text();
    if (res.status !== 429 || tentativa === 3) break;
    await sleep(1500 * (tentativa + 1));
  }
  return { ok: false, error: ultimoErro || 'Falha ao enviar e-mail' };
}

export interface EnvioStats {
  total_candidatos: number;
  enviados: number;
  ja_enviados: number;
  sem_telefone: number;
  sem_email: number;
  erros: number;
  ultimo_erro?: string;
}

/**
 * Dispara convites do Pulso (T0 ou T2) por WhatsApp e/ou email.
 * Para cada assignment do ciclo+momento:
 *   - Gera magic link via Supabase Auth com redirectTo = /dashboard/pulso/{assignmentId}
 *   - Envia via Z-API (WhatsApp) ou Supabase (email magic link)
 *   - Registra envio em pulse_audit_logs (action_type='convite_enviado_*')
 *
 * Idempotente — pula assignments que já têm audit log de convite enviado,
 * a menos que `forceResend=true`.
 */
export async function enviarConvitesPulso(
  empresaId: string,
  cicloId: string,
  opts: {
    pulse_moment: 'T0' | 'T2';
    canal: 'whatsapp' | 'email' | 'ambos';
    mensagem_custom?: string;
    force_resend?: boolean;
    cargo_filter?: string;
    apenas_status?: 'pending' | 'started';
  },
): Promise<{ ok: true; stats: EnvioStats } | { ok: false; error: string }> {
  const sb = await requireAdminSupabase();
  const adminEmail = (await getAuthenticatedEmailFromAction()) || 'desconhecido';

  const { data: empresa } = await sb.from('empresas')
    .select('id, nome, slug').eq('id', empresaId).single();
  if (!empresa) return { ok: false, error: 'Empresa não encontrada' };

  const { data: ciclo } = await sb.from('pulse_ciclos')
    .select('id, nome, status').eq('id', cicloId).single();
  if (!ciclo) return { ok: false, error: 'Ciclo não encontrado' };

  // Assignments do momento
  let { data: assignments } = await sb.from('pulse_assignments')
    .select('id, colaborador_id, status, pulse_moment')
    .eq('ciclo_id', cicloId)
    .eq('pulse_moment', opts.pulse_moment);
  if (!assignments?.length) return { ok: false, error: 'Nenhum assignment no ciclo+momento' };

  if (opts.apenas_status) {
    assignments = (assignments as any[]).filter(a => a.status === opts.apenas_status);
  } else {
    // Default: não envia pros já completos
    assignments = (assignments as any[]).filter(a => a.status !== 'completed');
  }

  // Lookup colaboradores
  const colabIds = [...new Set(assignments.map((a: any) => a.colaborador_id))];
  const { data: colabs } = await sb.from('colaboradores')
    .select('id, nome_completo, email, telefone, cargo')
    .in('id', colabIds);
  const colabMap = new Map((colabs || []).map((c: any) => [c.id, c]));

  // Filtro por cargo
  if (opts.cargo_filter) {
    assignments = (assignments as any[]).filter(a => {
      const c = colabMap.get(a.colaborador_id);
      return c?.cargo === opts.cargo_filter;
    });
  }

  // Já enviados (via audit log)
  let jaEnviadosSet = new Set<string>();
  if (!opts.force_resend) {
    const { data: logs } = await sb.from('pulse_audit_logs')
      .select('action_type, metadata_json')
      .eq('ciclo_id', cicloId)
      .in('action_type', ['convite_enviado_whatsapp', 'convite_enviado_email']);
    jaEnviadosSet = new Set(
      (logs || [])
        .map((l: any) => {
          const aid = l.metadata_json?.assignment_id;
          if (!aid) return null;
          return `${aid}:${l.action_type === 'convite_enviado_whatsapp' ? 'whatsapp' : 'email'}`;
        })
        .filter(Boolean),
    );
  }

  const stats: EnvioStats = {
    total_candidatos: assignments.length,
    enviados: 0, ja_enviados: 0, sem_telefone: 0, sem_email: 0, erros: 0,
  };

  const zapiInstance = process.env.ZAPI_INSTANCE_ID;
  const zapiToken = process.env.ZAPI_TOKEN;
  const zapiClient = process.env.ZAPI_CLIENT_TOKEN || '';
  const zapiConfigured = !!(zapiInstance && zapiToken);

  const enviarWa = opts.canal === 'whatsapp' || opts.canal === 'ambos';
  const enviarEmail = opts.canal === 'email' || opts.canal === 'ambos';

  if (enviarWa && !zapiConfigured) return { ok: false, error: 'Z-API não configurado' };
  if (enviarEmail && !process.env.RESEND_API_KEY) return { ok: false, error: 'RESEND_API_KEY não configurada' };

  const emailThrottle = { lastSentAt: 0 };

  for (const a of assignments as any[]) {
    const colab = colabMap.get(a.colaborador_id);
    if (!colab) { stats.erros++; continue; }

    const redirectPath = `/dashboard/pulso/${a.id}`;
    const redirectUrl = tenantUrl(empresa.slug, redirectPath);

    let magicLink: string | null = null;
    try {
      const { data: linkData, error: linkErr } = await sb.auth.admin.generateLink({
        type: 'magiclink',
        email: colab.email,
        options: { redirectTo: redirectUrl },
      });
      if (linkErr) throw linkErr;
      magicLink = linkData?.properties?.action_link || null;
      if (!magicLink) throw new Error('Magic link vazio');
    } catch (e: any) {
      stats.erros++;
      stats.ultimo_erro = e.message;
      continue;
    }

    const nome = (colab.nome_completo || '').split(' ')[0] || '';
    const tituloT = opts.pulse_moment === 'T0' ? 'Pulso de Desenvolvimento' : 'Pulso Final de Desenvolvimento';

    const mensagemDefault =
      `Olá, ${nome}! 👋\n\n` +
      `Você foi convidado(a) a responder o *${tituloT}* da ${empresa.nome}.\n` +
      `São cerca de 3 minutos — 12 perguntas + 1 aberta.\n\n` +
      `Acesse pelo link pessoal abaixo (válido por 24h):\n${magicLink}\n\n` +
      `Sua resposta individual é privada. RH e gestores veem apenas análises agregadas, sem identificação.\n\n— Equipe Vertho`;

    const mensagem = opts.mensagem_custom
      ? opts.mensagem_custom
          .replace(/\{\{nome\}\}/g, nome)
          .replace(/\{\{empresa\}\}/g, empresa.nome)
          .replace(/\{\{link\}\}/g, magicLink)
          .replace(/\{\{link_pulso\}\}/g, magicLink)
      : mensagemDefault;

    // ── WhatsApp ──
    if (enviarWa) {
      if (jaEnviadosSet.has(`${a.id}:whatsapp`)) {
        stats.ja_enviados++;
      } else if (!colab.telefone) {
        stats.sem_telefone++;
      } else {
        try {
          if (stats.enviados > 0) await new Promise(r => setTimeout(r, 1200)); // throttle
          let phone = (colab.telefone as string).replace(/\D/g, '');
          if (phone.length <= 11) phone = `55${phone}`;
          const res = await fetch(`https://api.z-api.io/instances/${zapiInstance}/token/${zapiToken}/send-text`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Client-Token': zapiClient },
            body: JSON.stringify({ phone, message: mensagem }),
          });
          if (!res.ok) {
            stats.erros++;
            stats.ultimo_erro = (await res.text()).slice(0, 150);
          } else {
            stats.enviados++;
            await sb.from('pulse_audit_logs').insert({
              empresa_id: empresaId, actor_email: adminEmail,
              actor_role: 'admin', action_type: 'convite_enviado_whatsapp',
              ciclo_id: cicloId,
              metadata_json: {
                assignment_id: a.id,
                colaborador_id: colab.id,
                pulse_moment: opts.pulse_moment,
              },
            } as any);
          }
        } catch (e: any) {
          stats.erros++;
          stats.ultimo_erro = e.message;
        }
      }
    }

    // ── Email ──
    if (enviarEmail) {
      if (jaEnviadosSet.has(`${a.id}:email`)) {
        stats.ja_enviados++;
      } else if (!colab.email) {
        stats.sem_email++;
      } else {
        const subject = opts.pulse_moment === 'T0'
          ? `Pulso de Desenvolvimento · ${empresa.nome}`
          : `Pulso Final de Desenvolvimento · ${empresa.nome}`;
        const res = await enviarEmailResend({
          from: EMAIL_FROM_DEFAULT,
          to: colab.email,
          subject,
          text: mensagem,
          html: mensagem
            .split('\n')
            .map((line) => line.trim() ? `<p>${line.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>` : '<br />')
            .join(''),
        }, emailThrottle);
        if (!res.ok) {
          stats.erros++;
          stats.ultimo_erro = res.error?.slice(0, 150);
          continue;
        }
        stats.enviados++;
        await sb.from('pulse_audit_logs').insert({
          empresa_id: empresaId, actor_email: adminEmail,
          actor_role: 'admin', action_type: 'convite_enviado_email',
          ciclo_id: cicloId,
          metadata_json: {
            assignment_id: a.id,
            colaborador_id: colab.id,
            pulse_moment: opts.pulse_moment,
            provider: 'resend',
          },
        } as any);
      }
    }
  }

  await logAdminAction({
    adminEmail,
    acao: 'pulse.envio', empresaId, empresaSlug: empresa.slug,
    alvo: `${stats.total_candidatos} convites · ${ciclo.nome} ${opts.pulse_moment}`,
    detalhes: { cicloId, pulse_moment: opts.pulse_moment, canal: opts.canal, ...stats },
    resultado: stats.enviados === 0 ? 'erro' : stats.erros > 0 ? 'parcial' : 'ok',
  });

  return { ok: true, stats };
}

/**
 * Status agregado de envios pra um ciclo+momento — usado pela UI.
 */
export async function statusEnviosCiclo(
  empresaId: string,
  cicloId: string,
  pulseMoment: 'T0' | 'T2',
): Promise<{ total: number; enviados_wa: number; enviados_email: number; completos: number; pending: number }> {
  const sb = await requireAdminSupabase();

  const [{ data: assignments }, { data: logs }] = await Promise.all([
    sb.from('pulse_assignments')
      .select('id, status').eq('ciclo_id', cicloId).eq('pulse_moment', pulseMoment),
    sb.from('pulse_audit_logs')
      .select('action_type, metadata_json')
      .eq('ciclo_id', cicloId)
      .in('action_type', ['convite_enviado_whatsapp', 'convite_enviado_email']),
  ]);

  const enviadosWa = new Set<string>();
  const enviadosEmail = new Set<string>();
  for (const l of (logs || []) as any[]) {
    if (l.metadata_json?.pulse_moment !== pulseMoment) continue;
    const aid = l.metadata_json?.assignment_id;
    if (!aid) continue;
    if (l.action_type === 'convite_enviado_whatsapp') enviadosWa.add(aid);
    else enviadosEmail.add(aid);
  }

  const ass = (assignments || []) as any[];
  return {
    total: ass.length,
    enviados_wa: enviadosWa.size,
    enviados_email: enviadosEmail.size,
    completos: ass.filter(a => a.status === 'completed').length,
    pending: ass.filter(a => a.status === 'pending').length,
  };
}
