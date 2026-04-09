'use server';

import { createSupabaseAdmin } from '@/lib/supabase';

export async function loadEmpresas() {
  const sb = createSupabaseAdmin();
  const { data, error } = await sb.from('empresas').select('id, nome').order('nome');
  if (error) return { success: false, error: error.message };
  return { success: true, data };
}

export async function loadWhatsappStatus(empresaId) {
  const sb = createSupabaseAdmin();
  try {
    const [enviosRes, relatoriosRes] = await Promise.all([
      sb.from('envios_diagnostico')
        .select('id, status', { count: 'exact' })
        .eq('empresa_id', empresaId)
        .eq('status', 'pendente'),
      sb.from('relatorios')
        .select('id', { count: 'exact' })
        .eq('empresa_id', empresaId)
        .eq('tipo', 'individual'),
    ]);

    return {
      success: true,
      data: {
        pendingCIS: enviosRes.count || 0,
        totalRelatorios: relatoriosRes.count || 0,
      },
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export async function dispararMensagemCustomizada(empresaId, template, canal, filtros = {}) {
  const sb = createSupabaseAdmin();
  try {
    const { data: empresa } = await sb.from('empresas')
      .select('nome, slug').eq('id', empresaId).single();
    if (!empresa) return { success: false, error: 'Empresa não encontrada' };

    // Buscar colaboradores
    let colabs;
    const { data: c1, error: e1 } = await sb.from('colaboradores')
      .select('id, nome_completo, email, cargo, telefone')
      .eq('empresa_id', empresaId);
    colabs = e1 ? (await sb.from('colaboradores').select('id, nome_completo, email, cargo').eq('empresa_id', empresaId)).data : c1;
    if (!colabs?.length) return { success: false, error: 'Nenhum colaborador encontrado' };

    // Filtrar por cargo
    if (filtros.cargo) colabs = colabs.filter(c => c.cargo === filtros.cargo);

    // Filtrar por canal
    if (canal === 'whatsapp') colabs = colabs.filter(c => c.telefone);
    else colabs = colabs.filter(c => c.email);

    if (!colabs.length) return { success: false, error: `Nenhum destinatário com ${canal === 'whatsapp' ? 'WhatsApp' : 'email'}` };

    const domain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'vertho.com.br';
    const fromEmail = process.env.EMAIL_FROM || 'Vertho <noreply@vertho.com.br>';
    let enviados = 0, erros = 0;

    for (const colab of colabs) {
      const nome = colab.nome_completo?.split(' ')[0] || '';
      const link = `https://${empresa.slug}.${domain}/login`;

      // Substituir variáveis no template
      const msg = template
        .replace(/\{\{nome\}\}/g, nome)
        .replace(/\{\{cargo\}\}/g, colab.cargo || '')
        .replace(/\{\{empresa\}\}/g, empresa.nome)
        .replace(/\{\{link\}\}/g, link);

      if (canal === 'email' && colab.email && process.env.RESEND_API_KEY) {
        try {
          const htmlMsg = msg.replace(/\n/g, '<br>').replace(/\*([^*]+)\*/g, '<strong>$1</strong>').replace(/_([^_]+)_/g, '<em>$1</em>');
          const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
            body: JSON.stringify({
              from: fromEmail,
              to: colab.email,
              subject: `[${empresa.nome}] Avaliação de Competências`,
              html: htmlMsg,
            }),
          });
          if (res.ok) enviados++;
          else { console.error('[Email]', await res.text()); erros++; }
        } catch { erros++; }
      }

      if (canal === 'whatsapp' && colab.telefone && process.env.QSTASH_TOKEN) {
        try {
          const webhookUrl = `https://${empresa.slug}.${domain}/api/webhooks/qstash/whatsapp-cis`;
          await fetch('https://qstash.upstash.io/v2/publish/' + encodeURIComponent(webhookUrl), {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${process.env.QSTASH_TOKEN}`,
              'Upstash-Delay': `${enviados * 2}s`,
            },
            body: JSON.stringify({ telefone: colab.telefone, mensagem: msg }),
          });
          enviados++;
        } catch { erros++; }
      }
    }

    return { success: true, message: `${enviados} ${canal === 'email' ? 'emails' : 'WhatsApp'} enviados${erros ? `, ${erros} erros` : ''}` };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export async function loadColaboradoresEnvio(empresaId) {
  const sb = createSupabaseAdmin();
  // Tentar com telefone, fallback sem
  let data;
  const { data: d1, error: e1 } = await sb.from('colaboradores')
    .select('id, nome_completo, email, cargo, telefone')
    .eq('empresa_id', empresaId)
    .order('nome_completo');
  if (!e1) {
    data = d1;
  } else {
    const { data: d2 } = await sb.from('colaboradores')
      .select('id, nome_completo, email, cargo')
      .eq('empresa_id', empresaId)
      .order('nome_completo');
    data = (d2 || []).map(c => ({ ...c, telefone: null }));
  }
  return data || [];
}
