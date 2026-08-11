'use server';

import { requireAdminSupabase, requireEmpresaSupabase } from '@/lib/admin-supabase';
import { gateEnvioDemo } from '@/lib/demo/envio-guard';
import { getAuthenticatedEmailFromAction } from '@/lib/auth/action-context';
import { logAdminAction } from '@/lib/audit';
import { EMAIL_FROM_DEFAULT, tenantUrl } from '@/lib/domain';
import { assertFilaDoProvedorLimpa, whatsappHealth } from '@/lib/whatsapp';
import { publicarWhatsappCis } from '@/lib/qstash-publish';
import { criarRelogioCadencia, duracaoEstimada, maxPorDisparo } from '@/lib/whatsapp/cadencia';

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
  /** E-mails entregues + convites de WhatsApp ENFILEIRADOS (ver `enfileirados_whatsapp`). */
  enviados: number;
  ja_enviados: number;
  sem_telefone: number;
  sem_email: number;
  erros: number;
  /**
   * WhatsApp que entrou na FILA (QStash), não que chegou ao aparelho. A entrega
   * real fica em `notification_deliveries` (o webhook é quem chama o provedor).
   * Nome próprio porque "enviados" para um canal assíncrono é a mentira que já
   * custou caro aqui: em 11/08/2026 `sucesso` significava "a Z-API aceitou".
   */
  enfileirados_whatsapp: number;
  /**
   * Excedente do teto por disparo — NÃO enviados, e nunca cortados em silêncio.
   * Quem dispara precisa ver o número na tela e disparar o resto depois.
   */
  adiados: number;
  ultimo_erro?: string;
  aviso?: string;
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
  // Gate TENANT-SCOPED (auditoria 23/07): disparo real de WhatsApp/email — o
  // empresaId vem do client e precisa bater com o tenant da sessão.
  const sb = await requireEmpresaSupabase(empresaId, 'assessments.dispatch');
  const adminEmail = (await getAuthenticatedEmailFromAction()) || 'desconhecido';

  // Tenant de demonstração: bloqueia disparo real antes de tocar assignments.
  const gate = await gateEnvioDemo(empresaId);
  if (gate.blocked) return { ok: false, error: gate.motivo as string };

  const { data: empresa } = await sb.from('empresas')
    .select('id, nome, slug').eq('id', empresaId).single();
  if (!empresa) return { ok: false, error: 'Empresa não encontrada' };

  // Cross-check de tenant (auditoria 23/07): o cicloId vem do client e o gate
  // acima só prova que empresaId === sessão. Sem amarrar o ciclo ao empresaId,
  // um RH do tenant A passaria um cicloId do tenant B e dispararia convites
  // (magic links + WhatsApp/email) pros colaboradores de B. Espelha loadPulseDashboard.
  const { data: ciclo } = await sb.from('pulse_ciclos')
    .select('id, nome, status, empresa_id').eq('id', cicloId).single();
  if (!ciclo || (ciclo as any).empresa_id !== empresaId) return { ok: false, error: 'Ciclo não encontrado' };

  // Assignments do momento — escopados por empresa_id (defesa em profundidade)
  let { data: assignments } = await sb.from('pulse_assignments')
    .select('id, colaborador_id, status, pulse_moment')
    .eq('empresa_id', empresaId)
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
    enfileirados_whatsapp: 0, adiados: 0,
  };

  const enviarWa = opts.canal === 'whatsapp' || opts.canal === 'ambos';
  const enviarEmail = opts.canal === 'email' || opts.canal === 'ambos';

  // Pré-flight WhatsApp: basta UM provedor saudável (Z-API ou WaSender) para o lote.
  if (enviarWa) {
    const health = await whatsappHealth();
    if (!health.some((h) => h.configured)) return { ok: false, error: 'Nenhum provedor de WhatsApp configurado' };
    if (!health.some((h) => h.ok)) {
      const detail = health.filter((h) => h.configured).map((h) => `${h.label}: ${h.reason}`).join('; ');
      return { ok: false, error: `WhatsApp indisponível (${detail}). Reconecte uma instância antes de disparar em lote.` };
    }
    // Segunda trava: `connected` não basta. O provedor pode estar de pé com
    // mensagens presas da rodada anterior, que ele descarrega em rajada ao
    // estabilizar — empilhar um lote por cima é o caminho mais curto para o
    // segundo bloqueio. Aqui ABORTA (diferente do cron diário, que só desliga o
    // canal do dia): há um humano na tela lendo o motivo e podendo decidir.
    try {
      await assertFilaDoProvedorLimpa(0);
    } catch (e: any) {
      return { ok: false, error: e?.message || 'Fila do provedor de WhatsApp não está limpa' };
    }
    if (!process.env.QSTASH_TOKEN) {
      return { ok: false, error: 'QSTASH_TOKEN não configurado — o convite por WhatsApp sai pela fila, não direto.' };
    }
  }
  if (enviarEmail && !process.env.RESEND_API_KEY) return { ok: false, error: 'RESEND_API_KEY não configurada' };

  const emailThrottle = { lastSentAt: 0 };

  // ── Cadência do WhatsApp: política única (lib/whatsapp/cadencia) ────────────
  //
  // Era `setTimeout(1200)` dentro do loop — 1,2s por mensagem, ~50/min, o DOBRO
  // da taxa que bloqueou o número em 11/08/2026. E era síncrono: um ciclo de 40
  // pessoas segurava a lambda por 48s no melhor caso, com a entrega de cada uma
  // dependendo de a invocação sobreviver até o fim.
  //
  // Agora o convite entra na FILA (mesmo webhook do broadcast do admin) com o
  // atraso vindo do relógio da política. A action devolve na hora; quem entrega
  // é o webhook, um a um, no ritmo do `Upstash-Delay`.
  const relogio = criarRelogioCadencia();

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
      } else if (relogio.tetoAtingido()) {
        // Teto de VOLUME, independente da taxa: 500 convites a 15s ainda são 500
        // mensagens não solicitadas. O excedente volta na tela como `adiados`.
        stats.adiados++;
      } else {
        try {
          await publicarWhatsappCis(
            {
              telefone: colab.telefone as string,
              mensagem,
              colaboradorId: colab.id,
              empresaId: empresa.id,
              kindEnvio: 'pulse',
            },
            relogio.proximo(),
          );
          stats.enviados++;
          stats.enfileirados_whatsapp++;
          // ⚠️ O log entra no ENFILEIRAMENTO, e é ele que segura a idempotência
          // (`jaEnviadosSet`). Consequência assumida: se o webhook não entregar,
          // a pessoa não é reconvidada sem `force_resend`. A alternativa —
          // carimbar só na entrega — exigiria o webhook conhecer `pulse_audit_logs`,
          // e o registro REAL de entrega já existe em `notification_deliveries`
          // (kind='pulse'), que é onde se apura quem recebeu de verdade.
          await sb.from('pulse_audit_logs').insert({
            empresa_id: empresaId, actor_email: adminEmail,
            actor_role: 'admin', action_type: 'convite_enviado_whatsapp',
            ciclo_id: cicloId,
            metadata_json: {
              assignment_id: a.id,
              colaborador_id: colab.id,
              pulse_moment: opts.pulse_moment,
              via: 'fila',
            },
          } as any);
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

  if (stats.enfileirados_whatsapp > 0) {
    stats.aviso = `WhatsApp: ${stats.enfileirados_whatsapp} na fila, entrega em ${duracaoEstimada(stats.enfileirados_whatsapp)}.`;
  }
  if (stats.adiados > 0) {
    stats.aviso = `${stats.aviso ? stats.aviso + ' ' : ''}${stats.adiados} NÃO enviados: o teto de segurança por disparo é `
      + `${maxPorDisparo()} (protege o número contra bloqueio). Dispare o restante depois.`;
  }

  await logAdminAction({
    adminEmail,
    acao: 'pulse.envio', empresaId, empresaSlug: empresa.slug,
    alvo: `${stats.total_candidatos} convites · ${ciclo.nome} ${opts.pulse_moment}`,
    detalhes: { cicloId, pulse_moment: opts.pulse_moment, canal: opts.canal, ...stats },
    // `adiados` NÃO é erro — é a proteção funcionando. Somá-los faria um disparo
    // saudável de 200 pessoas parecer meio quebrado no log de auditoria.
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
