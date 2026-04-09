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

// Buscar PDF do relatório individual de um colaborador
async function buscarPDFColaborador(sb, empresaId, colaboradorId) {
  const { data: rel } = await sb.from('relatorios')
    .select('pdf_path')
    .eq('empresa_id', empresaId)
    .eq('colaborador_id', colaboradorId)
    .eq('tipo', 'individual')
    .not('pdf_path', 'is', null)
    .maybeSingle();
  if (!rel?.pdf_path) return null;

  const { data: fileData } = await sb.storage.from('relatorios-pdf').download(rel.pdf_path);
  if (!fileData) return null;

  const buffer = Buffer.from(await fileData.arrayBuffer());
  return { buffer, filename: rel.pdf_path.split('/').pop() };
}

export async function dispararMensagemCustomizada(empresaId, template, canal, filtros = {}, assuntoTemplate = '') {
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
    const hasResend = !!process.env.RESEND_API_KEY;
    const hasQStash = !!process.env.QSTASH_TOKEN;
    const isRelatorio = assuntoTemplate.includes('Relatório') || template.includes('relatório');
    let enviados = 0, erros = 0, erroDetalhe = '';

    for (const colab of colabs) {
      const nome = colab.nome_completo?.split(' ')[0] || '';
      const link = `https://${empresa.slug}.${domain}/login`;

      // Substituir variáveis no template
      const msg = template
        .replace(/\{\{nome\}\}/g, nome)
        .replace(/\{\{cargo\}\}/g, colab.cargo || '')
        .replace(/\{\{empresa\}\}/g, empresa.nome)
        .replace(/\{\{link\}\}/g, link);

      if (canal === 'email' && colab.email) {
        if (!hasResend) { erroDetalhe = 'RESEND_API_KEY não configurada'; erros++; continue; }
        try {
          const htmlMsg = msg.replace(/\n/g, '<br>').replace(/\*([^*]+)\*/g, '<strong>$1</strong>').replace(/_([^_]+)_/g, '<em>$1</em>');

          // Buscar PDF se envio de relatório
          let attachments;
          if (isRelatorio && colab.id) {
            const pdf = await buscarPDFColaborador(sb, empresaId, colab.id);
            if (pdf) {
              attachments = [{ filename: pdf.filename, content: pdf.buffer.toString('base64') }];
            }
          }

          const emailBody = {
            from: fromEmail,
            to: colab.email,
            subject: (assuntoTemplate || `[${empresa.nome}] Avaliação`)
              .replace(/\{\{nome\}\}/g, nome)
              .replace(/\{\{cargo\}\}/g, colab.cargo || '')
              .replace(/\{\{empresa\}\}/g, empresa.nome),
            html: htmlMsg,
          };
          if (attachments) emailBody.attachments = attachments;

          const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
            body: JSON.stringify(emailBody),
          });
          if (res.ok) { enviados++; }
          else { erroDetalhe = await res.text(); erros++; }
        } catch (e) { erroDetalhe = e.message; erros++; }
      }

      if (canal === 'whatsapp' && colab.telefone) {
        const zapiInstance = process.env.ZAPI_INSTANCE_ID;
        const zapiToken = process.env.ZAPI_TOKEN;
        const zapiClient = process.env.ZAPI_CLIENT_TOKEN || '';
        if (!zapiInstance || !zapiToken) { erroDetalhe = 'Z-API não configurado'; erros++; continue; }

        let phone = colab.telefone.replace(/\D/g, '');
        if (phone.length <= 11) phone = `55${phone}`;

        // <= 50 destinatários: Z-API direto | > 50: QStash (async com retry)
        if (colabs.length <= 50) {
          try {
            if (enviados > 0) await new Promise(resolve => setTimeout(resolve, 1000));

            // Enviar texto
            const res = await fetch(`https://api.z-api.io/instances/${zapiInstance}/token/${zapiToken}/send-text`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Client-Token': zapiClient },
              body: JSON.stringify({ phone, message: msg }),
            });

            // Se relatório, enviar PDF como documento
            if (res.ok && isRelatorio && colab.id) {
              const pdf = await buscarPDFColaborador(sb, empresaId, colab.id);
              if (pdf) {
                await new Promise(resolve => setTimeout(resolve, 500));
                const pdfUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://vertho.com.br'}/api/relatorios/pdf?id=${colab.id}`;
                // Z-API send-document com base64
                await fetch(`https://api.z-api.io/instances/${zapiInstance}/token/${zapiToken}/send-document/base64`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', 'Client-Token': zapiClient },
                  body: JSON.stringify({
                    phone,
                    document: `data:application/pdf;base64,${pdf.buffer.toString('base64')}`,
                    fileName: pdf.filename,
                  }),
                });
              }
            }

            if (res.ok) { enviados++; }
            else { erroDetalhe = await res.text(); erros++; }
          } catch (e) { erroDetalhe = e.message; erros++; }
        } else if (process.env.QSTASH_TOKEN) {
          try {
            const appUrl = process.env.NEXT_PUBLIC_APP_URL || `https://vertho.com.br`;
            const webhookUrl = `${appUrl}/api/webhooks/qstash/whatsapp-cis`;
            await fetch('https://qstash.upstash.io/v2/publish/' + encodeURIComponent(webhookUrl), {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${process.env.QSTASH_TOKEN}`,
                'Upstash-Delay': `${enviados * 2}s`,
              },
              body: JSON.stringify({ telefone: phone, mensagem: msg }),
            });
            enviados++;
          } catch (e) { erroDetalhe = e.message; erros++; }
        }
      }
    }

    const msg2 = `${enviados} ${canal === 'email' ? 'emails' : 'WhatsApp'} enviados${erros ? `, ${erros} erros` : ''}${erroDetalhe ? ` — ${erroDetalhe}` : ''}`;
    return { success: enviados > 0, message: msg2, error: enviados === 0 ? msg2 : undefined };
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
