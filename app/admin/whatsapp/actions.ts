'use server';

import { createSupabaseAdmin } from '@/lib/supabase';
import { requireAdminAction } from '@/lib/auth/action-context';

export async function loadEmpresas() {
  await requireAdminAction();
  const sb = createSupabaseAdmin();
  const { data, error } = await sb.from('empresas').select('id, nome').order('nome');
  if (error) return { success: false, error: error.message };
  return { success: true, data };
}

export async function loadWhatsappStatus(empresaId) {
  await requireAdminAction();
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

// ── Helpers de anexo ────────────────────────────────────────────────────────

// Mapa mime → extensão simples pro Z-API (endpoint /send-document/{ext})
function extFromNameOrMime(name = '', mime = '') {
  const m = /\.([a-z0-9]+)$/i.exec(name);
  if (m) return m[1].toLowerCase();
  const map = {
    'application/pdf': 'pdf',
    'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png',
    'application/msword': 'doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/vnd.ms-excel': 'xls',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
    'application/vnd.ms-powerpoint': 'ppt',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
    'application/zip': 'zip', 'application/x-zip-compressed': 'zip',
  };
  return map[mime] || 'bin';
}

// Busca o PDF do relatório individual + devolve tanto buffer (email) quanto
// signed URL pública temporária (WhatsApp via /send-document/pdf).
async function buscarPDFColaborador(sb, empresaId, colaboradorId) {
  const { data: rel } = await sb.from('relatorios')
    .select('pdf_path')
    .eq('empresa_id', empresaId)
    .eq('colaborador_id', colaboradorId)
    .eq('tipo', 'individual')
    .not('pdf_path', 'is', null)
    .maybeSingle();
  if (!rel?.pdf_path) return null;

  const filename = rel.pdf_path.split('/').pop();
  const { data: fileData } = await sb.storage.from('relatorios-pdf').download(rel.pdf_path);
  if (!fileData) return null;

  const buffer = Buffer.from(await fileData.arrayBuffer());
  const { data: signed } = await sb.storage.from('relatorios-pdf')
    .createSignedUrl(rel.pdf_path, 60 * 60); // 1h — tempo suficiente pro envio em lote
  return { buffer, filename, url: signed?.signedUrl || null };
}

// Sobe o anexo extra (que veio em base64 da UI) como arquivo temporário
// pra obter uma signed URL. O arquivo fica no bucket; limpamos no fim.
async function subirAnexoTemporario(sb, empresaId, anexoExtra) {
  if (!anexoExtra?.base64) return null;
  const ext = extFromNameOrMime(anexoExtra.name, anexoExtra.mime);
  const path = `temp-envios/${empresaId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const buffer = Buffer.from(anexoExtra.base64, 'base64');
  const { error } = await sb.storage.from('relatorios-pdf').upload(path, buffer, {
    contentType: anexoExtra.mime || 'application/octet-stream',
    upsert: false,
  });
  if (error) return null;
  const { data: signed } = await sb.storage.from('relatorios-pdf')
    .createSignedUrl(path, 60 * 60);
  return { path, url: signed?.signedUrl || null, ext, filename: anexoExtra.name };
}

async function deletarAnexoTemporario(sb, path) {
  if (!path) return;
  try { await sb.storage.from('relatorios-pdf').remove([path]); } catch {}
}

/**
 * @param {object} [anexoExtra] - anexo arbitrário enviado pelo gestor na UI
 *   { name: 'arquivo.pdf', mime: 'application/pdf', base64: '...' }
 *   É enviado adicionalmente ao PDF do relatório (se comPDF=true) para todos
 *   os destinatários, em email (Resend attachments) e WhatsApp (send-document).
 */
export async function dispararMensagemCustomizada(empresaId, template, canal, filtros: any = {}, assuntoTemplate = '', comPDF = false, anexoExtra: any = null) {
  await requireAdminAction();
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
    const isRelatorio = comPDF;
    let enviados = 0, erros = 0, erroDetalhe = '';

    // Anexo extra: usamos sempre base64 no endpoint /send-document/{ext}.
    // Essa abordagem resolve o problema de abertura (o WhatsApp usa a
    // extensão do path pra setar o mime e abrir com o app nativo) sem
    // depender de upload + signed URL (que já teve problemas).

    for (const colab of colabs) {
      const nome = colab.nome_completo?.split(' ')[0] || '';
      const link = `https://${empresa.slug}.${domain}/login`;

      // Substituir variáveis no template
      const linkDisc = `https://${empresa.slug}.${domain}/dashboard/perfil-comportamental/mapeamento`;
      const msg = template
        .replace(/\{\{nome\}\}/g, nome)
        .replace(/\{\{cargo\}\}/g, colab.cargo || '')
        .replace(/\{\{empresa\}\}/g, empresa.nome)
        .replace(/\{\{link\}\}/g, link)
        .replace(/\{\{link_disc\}\}/g, linkDisc);

      if (canal === 'email' && colab.email) {
        if (!hasResend) { erroDetalhe = 'RESEND_API_KEY não configurada'; erros++; continue; }
        try {
          const htmlMsg = msg.replace(/\n/g, '<br>').replace(/\*([^*]+)\*/g, '<strong>$1</strong>').replace(/_([^_]+)_/g, '<em>$1</em>');

          // Buscar PDF se envio de relatório
          const attachments = [];
          if (isRelatorio && colab.id) {
            const pdf = await buscarPDFColaborador(sb, empresaId, colab.id);
            if (pdf) {
              attachments.push({ filename: pdf.filename, content: pdf.buffer.toString('base64') });
            }
          }
          // Anexo adicional enviado pelo gestor na UI
          if (anexoExtra?.base64) {
            attachments.push({
              filename: anexoExtra.name || 'anexo',
              content: anexoExtra.base64,
            });
          }

          const emailBody: any = {
            from: fromEmail,
            to: colab.email,
            subject: (assuntoTemplate || `[${empresa.nome}] Avaliação`)
              .replace(/\{\{nome\}\}/g, nome)
              .replace(/\{\{cargo\}\}/g, colab.cargo || '')
              .replace(/\{\{empresa\}\}/g, empresa.nome),
            html: htmlMsg,
          };
          if (attachments.length > 0) emailBody.attachments = attachments;

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

            // Se relatório, enviar PDF do relatório individual via base64
            // no endpoint /send-document/pdf (mime correto).
            if (res.ok && isRelatorio && colab.id) {
              const pdf = await buscarPDFColaborador(sb, empresaId, colab.id);
              if (pdf?.buffer) {
                await new Promise(resolve => setTimeout(resolve, 500));
                const rPdf = await fetch(`https://api.z-api.io/instances/${zapiInstance}/token/${zapiToken}/send-document/pdf`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', 'Client-Token': zapiClient },
                  body: JSON.stringify({
                    phone,
                    document: `data:application/pdf;base64,${pdf.buffer.toString('base64')}`,
                    fileName: pdf.filename,
                  }),
                });
                if (!rPdf.ok) {
                  const txt = await rPdf.text();
                  console.warn('[ZAPI send-document/pdf]', rPdf.status, txt.slice(0, 300));
                  erroDetalhe = `PDF não enviado: ${rPdf.status} ${txt.slice(0, 120)}`;
                }
              }
            }

            // Anexo extra — base64 no endpoint por extensão.
            if (res.ok && anexoExtra?.base64) {
              await new Promise(resolve => setTimeout(resolve, 500));
              const ext = extFromNameOrMime(anexoExtra.name, anexoExtra.mime);
              const mime = anexoExtra.mime || 'application/octet-stream';
              const rAnx = await fetch(`https://api.z-api.io/instances/${zapiInstance}/token/${zapiToken}/send-document/${ext}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Client-Token': zapiClient },
                body: JSON.stringify({
                  phone,
                  document: `data:${mime};base64,${anexoExtra.base64}`,
                  fileName: anexoExtra.name || `anexo.${ext}`,
                }),
              });
              if (!rAnx.ok) {
                const txt = await rAnx.text();
                console.warn('[ZAPI send-document anexo]', rAnx.status, txt.slice(0, 300));
                erroDetalhe = `Anexo não enviado: ${rAnx.status} ${txt.slice(0, 120)}`;
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
  await requireAdminAction();
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
