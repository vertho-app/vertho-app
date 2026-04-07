'use server';

import { createSupabaseAdmin } from '@/lib/supabase';
import { templateWhatsAppPilula, templateWhatsAppEvidencia } from '@/lib/notifications';

const TIMEOUT_ABANDONO_HORAS = 48;
const TOTAL_SEMANAS = 14;
const SEMANAS_IMPL = [4, 8, 12]; // Semanas de implementação (sem pílula nova)

// ═══════════════════════════════════════════════════════════════════════════════
// CLEANUP: Resetar sessões abandonadas (>48h de inatividade)
// Equivalente ao GAS: LimpezaSessoes.js → limparSessoesAbandonadas()
// ═══════════════════════════════════════════════════════════════════════════════

export async function cleanupSessoes() {
  const sb = createSupabaseAdmin();
  const cutoff = new Date(Date.now() - TIMEOUT_ABANDONO_HORAS * 60 * 60 * 1000).toISOString();

  // Buscar sessões ativas com updated_at > 48h
  const { data: abandonadas } = await sb.from('sessoes_avaliacao')
    .select('id, colaborador_id, competencia_id, updated_at')
    .eq('status', 'em_andamento')
    .lt('updated_at', cutoff);

  if (!abandonadas?.length) return { resetadas: 0, message: 'Nenhuma sessão abandonada' };

  let resetadas = 0;

  for (const sessao of abandonadas) {
    // Resetar sessão para estado inicial
    const { error } = await sb.from('sessoes_avaliacao')
      .update({
        status: 'em_andamento',
        fase: 'cenario',
        aprofundamentos: 0,
        confianca: 0,
        evidencias: [],
        rascunho_avaliacao: null,
        validacao_audit: null,
        avaliacao_final: null,
        nivel: null,
        nota_decimal: null,
        lacuna: null,
      })
      .eq('id', sessao.id);

    if (!error) {
      // Limpar mensagens do chat (histórico)
      await sb.from('mensagens_chat').delete().eq('sessao_id', sessao.id);

      // Registrar motivo do reset
      await sb.from('mensagens_chat').insert({
        sessao_id: sessao.id,
        role: 'system',
        content: `Sessão resetada por inatividade (>${TIMEOUT_ABANDONO_HORAS}h)`,
        metadata: { motivo: 'timeout_abandono', cutoff },
      });

      resetadas++;
    }
  }

  return { resetadas, message: `${resetadas} sessões resetadas por inatividade` };
}

// ═══════════════════════════════════════════════════════════════════════════════
// TRIGGER SEGUNDA: Enviar pílula semanal (conteúdo de aprendizado)
// Equivalente ao GAS: Fase4.js → triggerSegundaFase4()
// ═══════════════════════════════════════════════════════════════════════════════

export async function triggerSegunda() {
  const sb = createSupabaseAdmin();

  // Buscar todas as empresas com fase 4 ativa
  const { data: empresas } = await sb.from('empresas')
    .select('id, nome, slug, sys_config');

  if (!empresas?.length) return { enviados: 0, message: 'Nenhuma empresa encontrada' };

  let totalEnviados = 0;
  let totalErros = 0;

  for (const empresa of empresas) {
    const cadencia = empresa.sys_config?.cadencia || {};
    const horaConfig = cadencia.fase4_hora || 8;

    // Buscar colaboradores com fase4 ativa
    const { data: envios } = await sb.from('fase4_envios')
      .select('id, colaborador_id, semana_atual, sequencia, status, colaboradores!inner(nome_completo, email, whatsapp)')
      .eq('empresa_id', empresa.id)
      .eq('status', 'ativo');

    if (!envios?.length) continue;

    for (const envio of envios) {
      const semana = envio.semana_atual || 1;
      const nome = envio.colaboradores.nome_completo || 'Colaborador';
      const email = envio.colaboradores.email;
      const telefone = envio.colaboradores.whatsapp;

      // Verificar se concluiu
      if (semana > TOTAL_SEMANAS) {
        await sb.from('fase4_envios')
          .update({ status: 'concluido' })
          .eq('id', envio.id);
        continue;
      }

      const ehImpl = SEMANAS_IMPL.includes(semana);
      let sequencia = [];
      try { sequencia = typeof envio.sequencia === 'string' ? JSON.parse(envio.sequencia) : envio.sequencia || []; }
      catch { continue; }

      const pilula = (!ehImpl && semana <= sequencia.length) ? sequencia[semana - 1] : null;
      const titulo = pilula?.titulo || `Semana ${semana}`;
      const conteudo = ehImpl
        ? `Esta é uma semana de implementação. Aplique o que aprendeu nas últimas semanas e registre suas evidências.`
        : (pilula?.resumo || titulo);

      // Registrar envio na capacitação
      await sb.from('capacitacao').insert({
        empresa_id: empresa.id,
        colaborador_id: envio.colaborador_id,
        semana: semana,
        tipo: ehImpl ? 'implementacao' : 'pilula',
        pilula_ok: false,
        pontos: 0,
      }).then(() => {}).catch(() => {}); // Ignora se já existe

      // Enviar WhatsApp via QStash (se tiver telefone)
      if (telefone) {
        const mensagem = templateWhatsAppPilula(nome, semana, conteudo);
        try {
          await publishToQStash({ telefone, mensagem }, totalEnviados * 2);
          totalEnviados++;
        } catch { totalErros++; }
      }

      // Atualizar último envio
      await sb.from('fase4_envios')
        .update({ ultimo_envio: new Date().toISOString() })
        .eq('id', envio.id);
    }
  }

  return { enviados: totalEnviados, erros: totalErros, message: `Segunda: ${totalEnviados} pílulas enviadas` };
}

// ═══════════════════════════════════════════════════════════════════════════════
// TRIGGER QUINTA: Solicitar evidência de aplicação
// Equivalente ao GAS: Fase4.js → triggerQuintaFase4()
// ═══════════════════════════════════════════════════════════════════════════════

export async function triggerQuinta() {
  const sb = createSupabaseAdmin();

  const { data: empresas } = await sb.from('empresas')
    .select('id, nome, slug, sys_config');

  if (!empresas?.length) return { enviados: 0, message: 'Nenhuma empresa encontrada' };

  let totalEnviados = 0;
  let totalErros = 0;
  let nudges = 0;

  for (const empresa of empresas) {
    const { data: envios } = await sb.from('fase4_envios')
      .select('id, colaborador_id, semana_atual, sequencia, status, ultimo_envio, colaboradores!inner(nome_completo, email, whatsapp)')
      .eq('empresa_id', empresa.id)
      .eq('status', 'ativo');

    if (!envios?.length) continue;

    for (const envio of envios) {
      const semana = envio.semana_atual || 1;
      const nome = envio.colaboradores.nome_completo || 'Colaborador';
      const telefone = envio.colaboradores.whatsapp;

      if (semana > TOTAL_SEMANAS) continue;

      // Verificar inatividade (2+ semanas sem envio)
      if (envio.ultimo_envio) {
        const ultimoEnvio = new Date(envio.ultimo_envio);
        const diasSemEnvio = (Date.now() - ultimoEnvio.getTime()) / (1000 * 60 * 60 * 24);
        if (diasSemEnvio >= 14) {
          // Nudge de inatividade
          if (telefone) {
            const nudgeMsg = `Olá, ${nome}! 👋\n\nNotamos que você está há mais de 2 semanas sem interagir com sua trilha de desenvolvimento.\n\nSua evolução é importante para nós. Que tal retomar hoje?\n\n— Vertho Mentor IA`;
            try {
              await publishToQStash({ telefone, mensagem: nudgeMsg }, (totalEnviados + nudges) * 2);
              nudges++;
            } catch {}
          }
          continue;
        }
      }

      // Enviar pedido de evidência
      if (telefone) {
        const mensagem = templateWhatsAppEvidencia(nome, semana);
        try {
          await publishToQStash({ telefone, mensagem }, totalEnviados * 2);
          totalEnviados++;
        } catch { totalErros++; }
      }

      // Avançar semana
      await sb.from('fase4_envios')
        .update({ semana_atual: semana + 1 })
        .eq('id', envio.id);
    }
  }

  return { enviados: totalEnviados, erros: totalErros, nudges, message: `Quinta: ${totalEnviados} evidências solicitadas, ${nudges} nudges` };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Helper: Publicar no QStash (reutilizado de whatsapp-lote.js)
// ═══════════════════════════════════════════════════════════════════════════════

async function publishToQStash(payload, delaySec = 0) {
  const qstashToken = process.env.QSTASH_TOKEN;
  if (!qstashToken) {
    console.warn('[cron-jobs] QSTASH_TOKEN não configurado, pulando envio WhatsApp');
    return;
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://vertho.com.br');
  const webhookUrl = `${appUrl}/api/webhooks/qstash/whatsapp-cis`;

  const res = await fetch('https://qstash.upstash.io/v2/publish/' + encodeURIComponent(webhookUrl), {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${qstashToken}`,
      'Content-Type': 'application/json',
      'Upstash-Delay': `${delaySec}s`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`QStash ${res.status}: ${detail}`);
  }
}
