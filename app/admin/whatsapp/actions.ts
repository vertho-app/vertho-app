'use server';

import { requireAdminSupabase } from '@/lib/admin-supabase';
import { requireAdminAction } from '@/lib/auth/action-context';
import { logAdminAction } from '@/lib/audit';
import { APP_WEBHOOK_URL, EMAIL_FROM_DEFAULT, QSTASH_BASE_URL, ROOT_DOMAIN, tenantUrl } from '@/lib/domain';

/**
 * Colaboradores que CONCLUÍRAM o mapeamento de competências: responderam TODAS
 * as competências que têm cenário no seu cargo (mesma regra do assessment —
 * `pendentes.length === 0`). Esperado por cargo = competências distintas em
 * banco_cenarios; respondidas = competências distintas em `respostas`.
 */
async function colaboradoresMapeamentoCompleto(sb: any, empresaId: string): Promise<Set<string>> {
  const [{ data: respostas }, { data: cenarios }] = await Promise.all([
    sb.from('respostas').select('colaborador_id, competencia_id, cargo').eq('empresa_id', empresaId),
    sb.from('banco_cenarios').select('cargo, competencia_id').eq('empresa_id', empresaId),
  ]);
  const esperadoPorCargo = new Map<string, Set<string>>();
  for (const c of (cenarios || [])) {
    if (!c.competencia_id) continue;
    let s = esperadoPorCargo.get(c.cargo); if (!s) esperadoPorCargo.set(c.cargo, s = new Set());
    s.add(c.competencia_id);
  }
  const respByColab = new Map<string, { cargo: string; comps: Set<string> }>();
  for (const r of (respostas || [])) {
    if (!r.competencia_id) continue;
    let o = respByColab.get(r.colaborador_id); if (!o) respByColab.set(r.colaborador_id, o = { cargo: r.cargo, comps: new Set() });
    o.comps.add(r.competencia_id);
  }
  const completos = new Set<string>();
  for (const [colabId, o] of respByColab) {
    const esperado = esperadoPorCargo.get(o.cargo);
    if (!esperado || esperado.size === 0) continue;
    let todas = true;
    for (const cid of esperado) if (!o.comps.has(cid)) { todas = false; break; }
    if (todas) completos.add(colabId);
  }
  return completos;
}

const RESEND_MIN_INTERVAL_MS = 250; // 4 req/s, abaixo do limite atual de 5 req/s

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function retryAfterMs(res: Response, fallbackMs: number) {
  const raw = res.headers.get('retry-after');
  if (!raw) return fallbackMs;
  const seconds = Number(raw);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const dateMs = Date.parse(raw);
  return Number.isFinite(dateMs) ? Math.max(0, dateMs - Date.now()) : fallbackMs;
}

async function enviarEmailResendComRetry(emailBody: any, throttle: { lastSentAt: number }) {
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
    await sleep(retryAfterMs(res, 1500 * (tentativa + 1)));
  }

  return { ok: false, error: ultimoErro };
}

export async function loadEmpresas() {
  await requireAdminAction();
  const sb = await requireAdminSupabase();
  const { data, error } = await sb.from('empresas').select('id, nome').order('nome');
  if (error) return { success: false, error: error.message };
  return { success: true, data };
}

export async function loadWhatsappStatus(empresaId) {
  await requireAdminAction();
  const sb = await requireAdminSupabase();
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
  const ctx = await requireAdminAction('assessments.dispatch');
  const sb = await requireAdminSupabase('assessments.dispatch');
  try {
    const { data: empresa } = await sb.from('empresas')
      .select('nome, slug').eq('id', empresaId).single();
    if (!empresa) return { success: false, error: 'Empresa não encontrada' };

    // Buscar colaboradores
    let colabs;
    const { data: c1, error: e1 } = await sb.from('colaboradores')
      .select('id, nome_completo, email, cargo, telefone, perfil_dominante')
      .eq('empresa_id', empresaId);
    colabs = e1 ? (await sb.from('colaboradores').select('id, nome_completo, email, cargo, perfil_dominante').eq('empresa_id', empresaId)).data : c1;
    if (!colabs?.length) return { success: false, error: 'Nenhum colaborador encontrado' };

    // Filtrar por cargo
    if (filtros.cargo) colabs = colabs.filter(c => c.cargo === filtros.cargo);

    // Filtrar por presença de perfil comportamental (sim/nao)
    if (filtros.disc === 'sim') colabs = colabs.filter(c => !!c.perfil_dominante);
    else if (filtros.disc === 'nao') colabs = colabs.filter(c => !c.perfil_dominante);

    // Filtrar por status de voto (votou/nao_votou) — útil pra disparo de
    // lembrete só pra quem ainda não votou na votação de competências.
    if (filtros.voto === 'nao_votou' || filtros.voto === 'votou') {
      const { data: votos } = await sb
        .from('votacao_competencias')
        .select('colaborador_id')
        .eq('empresa_id', empresaId);
      const votouSet = new Set((votos || []).map((v: any) => v.colaborador_id));
      colabs = filtros.voto === 'nao_votou'
        ? colabs.filter(c => !votouSet.has(c.id))
        : colabs.filter(c => votouSet.has(c.id));
    }

    // Filtrar por mapeamento de competências (diagnóstico Fase 2): 'completo'
    // (sessão de avaliação concluída) vs 'pendente' (sem sessão concluída).
    if (filtros.mapeamento === 'completo' || filtros.mapeamento === 'pendente') {
      const mapeouSet = await colaboradoresMapeamentoCompleto(sb, empresaId);
      colabs = filtros.mapeamento === 'completo'
        ? colabs.filter(c => mapeouSet.has(c.id))
        : colabs.filter(c => !mapeouSet.has(c.id));
    }

    // Filtrar por canal
    if (canal === 'whatsapp') colabs = colabs.filter(c => c.telefone);
    else colabs = colabs.filter(c => c.email);

    if (!colabs.length) return { success: false, error: `Nenhum destinatário com ${canal === 'whatsapp' ? 'WhatsApp' : 'email'}` };

    // Log inicial: ajuda diagnosticar qual branch (direto vs QStash) será usado
    console.log(
      `[dispararMensagemCustomizada] empresa=${empresa.slug} canal=${canal} ` +
      `colabs=${colabs.length} hasQStashToken=${!!process.env.QSTASH_TOKEN} ` +
      `webhookUrl=${APP_WEBHOOK_URL}/api/webhooks/qstash/whatsapp-cis`,
    );

    // Atalho: WhatsApp em lote (>50) via QStash em PARALELO. Sem isso, 53
    // publishes sequenciais com latência transatlântica estouravam o timeout
    // serverless do Vercel (10s default Hobby, 60s Pro) — só 2 publicavam.
    if (
      canal === 'whatsapp' &&
      colabs.length > 50 &&
      process.env.QSTASH_TOKEN &&
      process.env.ZAPI_INSTANCE_ID &&
      process.env.ZAPI_TOKEN
    ) {
      const webhookUrl = `${APP_WEBHOOK_URL}/api/webhooks/qstash/whatsapp-cis`;
      if (!/^https?:\/\//i.test(webhookUrl)) {
        return {
          success: false,
          error: `URL de webhook inválida (sem https://): ${webhookUrl}. Verifique env NEXT_PUBLIC_APP_WEBHOOK_URL no Vercel.`,
        };
      }
      const dom = ROOT_DOMAIN;
      const results = await Promise.all(colabs.map(async (colab: any, idx: number) => {
        const nome = colab.nome_completo?.split(' ')[0] || '';
        const link = `https://${empresa.slug}.${dom}/login`;
        const linkDisc = `https://${empresa.slug}.${dom}/dashboard/perfil-comportamental/mapeamento`;
        const msg = template
          .replace(/\{\{nome\}\}/g, nome)
          .replace(/\{\{cargo\}\}/g, colab.cargo || '')
          .replace(/\{\{empresa\}\}/g, empresa.nome)
          .replace(/\{\{link\}\}/g, link)
          .replace(/\{\{link_disc\}\}/g, linkDisc);
        let phone = colab.telefone.replace(/\D/g, '');
        if (phone.length <= 11) phone = `55${phone}`;
        try {
          const rQ = await fetch(`${QSTASH_BASE_URL}/v2/publish/${webhookUrl}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${process.env.QSTASH_TOKEN}`,
              'Upstash-Delay': `${idx * 2}s`,
            },
            body: JSON.stringify({ telefone: phone, mensagem: msg }),
          });
          if (!rQ.ok) {
            const detail = await rQ.text();
            return { ok: false, err: `QStash ${rQ.status}: ${detail.slice(0, 120)}` };
          }
          return { ok: true };
        } catch (e: any) {
          return { ok: false, err: e.message };
        }
      }));
      const ok = results.filter(r => r.ok).length;
      const fail = results.filter(r => !r.ok).length;
      const firstErr = results.find(r => !r.ok)?.err || '';
      const txt = `${ok} WhatsApp agendados via QStash, ${fail} erros${firstErr ? ` — ${firstErr}` : ''}`;
      console.log(`[dispararMensagemCustomizada] paralelo: ${txt}`);
      await logAdminAction({
        adminEmail: ctx.email, acao: 'whatsapp.broadcast', empresaId, empresaSlug: empresa.slug,
        alvo: `${colabs.length} colaboradores`,
        detalhes: { canal, via: 'qstash_paralelo', filtros, agendados: ok, erros: fail, comPDF, anexo: !!anexoExtra?.base64 },
        resultado: ok === 0 ? 'erro' : fail > 0 ? 'parcial' : 'ok',
      });
      return { success: ok > 0, message: txt, error: ok === 0 ? txt : undefined };
    }

    const domain = ROOT_DOMAIN;
    const fromEmail = EMAIL_FROM_DEFAULT;
    const hasResend = !!process.env.RESEND_API_KEY;
    const hasQStash = !!process.env.QSTASH_TOKEN;
    const isRelatorio = comPDF;
    const resendThrottle = { lastSentAt: 0 };
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

          const res = await enviarEmailResendComRetry(emailBody, resendThrottle);
          if (res.ok) { enviados++; }
          else { erroDetalhe = res.error || 'Falha ao enviar e-mail'; erros++; }
        } catch (e) { erroDetalhe = e.message; erros++; }
      }

      if (canal === 'whatsapp' && colab.telefone) {
        const zapiInstance = process.env.ZAPI_INSTANCE_ID;
        const zapiToken = process.env.ZAPI_TOKEN;
        const zapiClient = process.env.ZAPI_CLIENT_TOKEN || '';
        if (!zapiInstance || !zapiToken) { erroDetalhe = 'Z-API não configurado'; erros++; continue; }

        let phone = colab.telefone.replace(/\D/g, '');
        if (phone.length <= 11) phone = `55${phone}`;

        // <= 50 destinatários: Z-API direto. > 50: QStash (async com retry).
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
          // Branch QStash (>50 destinatários)
          try {
            // Usa APP_WEBHOOK_URL (app.{ROOT_DOMAIN}) — APP_URL pode apontar
            // pra raiz vertho.ai que está servida pelo Gamma e retorna 405.
            const webhookUrl = `${APP_WEBHOOK_URL}/api/webhooks/qstash/whatsapp-cis`;
            // Validação: QStash exige URL absoluta com https://
            if (!/^https?:\/\//i.test(webhookUrl)) {
              const detail = `URL de webhook inválida (sem https://): ${webhookUrl}. Verifique env NEXT_PUBLIC_APP_WEBHOOK_URL no Vercel.`;
              console.error(`[dispararMensagemCustomizada] ${detail}`);
              erroDetalhe = detail;
              erros++;
              continue;
            }
            // Log do que está sendo enviado (útil pra diagnosticar)
            if (enviados === 0) {
              console.log(`[dispararMensagemCustomizada] QStash base=${QSTASH_BASE_URL} webhook=${webhookUrl}`);
            }
            // QStash exige URL raw no path (sem encodeURIComponent) — encoded dá "invalid scheme"
            const rQ = await fetch(`${QSTASH_BASE_URL}/v2/publish/${webhookUrl}`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${process.env.QSTASH_TOKEN}`,
                'Upstash-Delay': `${enviados * 2}s`,
              },
              body: JSON.stringify({ telefone: phone, mensagem: msg }),
            });
            if (!rQ.ok) {
              const detail = await rQ.text();
              const fullErr = `QStash ${rQ.status} (base=${QSTASH_BASE_URL}): ${detail.slice(0, 200)}`;
              console.error(`[dispararMensagemCustomizada] ${fullErr}`);
              erroDetalhe = fullErr.slice(0, 200);
              erros++;
            } else {
              enviados++;
            }
          } catch (e) {
            console.error('[dispararMensagemCustomizada] QStash falhou:', e.message);
            erroDetalhe = `QStash: ${e.message}`;
            erros++;
          }
        }
      }
    }

    const msg2 = `${enviados} ${canal === 'email' ? 'emails' : 'WhatsApp'} enviados${erros ? `, ${erros} erros` : ''}${erroDetalhe ? ` — ${erroDetalhe}` : ''}`;
    await logAdminAction({
      adminEmail: ctx.email, acao: 'whatsapp.broadcast', empresaId, empresaSlug: empresa.slug,
      alvo: `${colabs.length} colaboradores`,
      detalhes: { canal, via: 'direto', filtros, enviados, erros, comPDF, anexo: !!anexoExtra?.base64, erroDetalhe: erroDetalhe || undefined },
      resultado: enviados === 0 ? 'erro' : erros > 0 ? 'parcial' : 'ok',
    });
    return { success: enviados > 0, message: msg2, error: enviados === 0 ? msg2 : undefined };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export async function enviarMagicLinksWhatsApp(empresaId: string, filtros: any = {}) {
  const ctx = await requireAdminAction('assessments.dispatch');
  const sb = await requireAdminSupabase('assessments.dispatch');
  try {
    const { data: empresa } = await sb.from('empresas')
      .select('nome, slug').eq('id', empresaId).single();
    if (!empresa) return { success: false, error: 'Empresa não encontrada' };

    let { data: colabs } = await sb.from('colaboradores')
      .select('id, nome_completo, email, cargo, telefone, perfil_dominante')
      .eq('empresa_id', empresaId);
    if (!colabs?.length) return { success: false, error: 'Nenhum colaborador encontrado' };

    colabs = colabs.filter(c => c.telefone && c.email);
    if (filtros.cargo) colabs = colabs.filter(c => c.cargo === filtros.cargo);
    if (filtros.disc === 'sim') colabs = colabs.filter(c => !!c.perfil_dominante);
    else if (filtros.disc === 'nao') colabs = colabs.filter(c => !c.perfil_dominante);
    if (filtros.voto === 'nao_votou' || filtros.voto === 'votou') {
      const { data: votos } = await sb
        .from('votacao_competencias')
        .select('colaborador_id')
        .eq('empresa_id', empresaId);
      const votouSet = new Set((votos || []).map((v: any) => v.colaborador_id));
      colabs = filtros.voto === 'nao_votou'
        ? colabs.filter(c => !votouSet.has(c.id))
        : colabs.filter(c => votouSet.has(c.id));
    }
    if (filtros.mapeamento === 'completo' || filtros.mapeamento === 'pendente') {
      const mapeouSet = await colaboradoresMapeamentoCompleto(sb, empresaId);
      colabs = filtros.mapeamento === 'completo'
        ? colabs.filter(c => mapeouSet.has(c.id))
        : colabs.filter(c => !mapeouSet.has(c.id));
    }
    if (!colabs.length) return { success: false, error: 'Nenhum colaborador com telefone e email' };

    const zapiInstance = process.env.ZAPI_INSTANCE_ID;
    const zapiToken = process.env.ZAPI_TOKEN;
    const zapiClient = process.env.ZAPI_CLIENT_TOKEN || '';
    if (!zapiInstance || !zapiToken) return { success: false, error: 'Z-API não configurado' };

    const redirectUrl = tenantUrl(empresa.slug, '/dashboard');
    let enviados = 0, erros = 0, ultimoErro = '';

    for (const colab of colabs) {
      try {
        if (enviados > 0) await new Promise(r => setTimeout(r, 1200));

        const { data: linkData, error: linkErr } = await sb.auth.admin.generateLink({
          type: 'magiclink',
          email: colab.email,
          options: { redirectTo: redirectUrl },
        });
        if (linkErr || !linkData?.properties?.action_link) {
          erros++;
          ultimoErro = linkErr?.message || 'Falha ao gerar magic link';
          continue;
        }

        const magicLink = linkData.properties.action_link;
        const nome = colab.nome_completo?.split(' ')[0] || '';
        let phone = colab.telefone.replace(/\D/g, '');
        if (phone.length <= 11) phone = `55${phone}`;

        const msg = `Olá, ${nome}! 👋

Seu acesso à plataforma *${empresa.nome}* está pronto.

Clique no link abaixo para entrar direto (sem precisar de senha):
${magicLink}

⚠️ Este link é pessoal e expira em 24h.

— Equipe Vertho`;

        const res = await fetch(`https://api.z-api.io/instances/${zapiInstance}/token/${zapiToken}/send-text`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Client-Token': zapiClient },
          body: JSON.stringify({ phone, message: msg }),
        });

        if (res.ok) enviados++;
        else { erros++; ultimoErro = await res.text(); }
      } catch (e: any) {
        erros++;
        ultimoErro = e.message;
      }
    }

    const msg2 = `${enviados} magic links enviados por WhatsApp${erros ? `, ${erros} erros` : ''}${ultimoErro ? ` — ${ultimoErro}` : ''}`;
    await logAdminAction({
      adminEmail: ctx.email, acao: 'whatsapp.magic_links', empresaId, empresaSlug: empresa.slug,
      alvo: `${colabs.length} colaboradores`,
      detalhes: { filtros, enviados, erros, ultimoErro: ultimoErro || undefined },
      resultado: enviados === 0 ? 'erro' : erros > 0 ? 'parcial' : 'ok',
    });
    return { success: enviados > 0, message: msg2, error: enviados === 0 ? msg2 : undefined };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function loadColaboradoresEnvio(empresaId) {
  await requireAdminAction();
  const sb = await requireAdminSupabase();
  // Tentar com telefone, fallback sem
  let data;
  const { data: d1, error: e1 } = await sb.from('colaboradores')
    .select('id, nome_completo, email, cargo, telefone, perfil_dominante')
    .eq('empresa_id', empresaId)
    .order('nome_completo');
  if (!e1) {
    data = d1;
  } else {
    const { data: d2 } = await sb.from('colaboradores')
      .select('id, nome_completo, email, cargo, perfil_dominante')
      .eq('empresa_id', empresaId)
      .order('nome_completo');
    data = (d2 || []).map(c => ({ ...c, telefone: null }));
  }
  if (!data?.length) return [];

  // Marca quem já votou na votação de competências (lookup por colaborador_id).
  // Usado pra filtrar disparo só pra quem ainda não votou (ex: lembrete).
  const { data: votos } = await sb
    .from('votacao_competencias')
    .select('colaborador_id')
    .eq('empresa_id', empresaId);
  const votouSet = new Set((votos || []).map((v: any) => v.colaborador_id));

  // "Completou o mapeamento" = respondeu TODAS as competências com cenário do
  // seu cargo (regra do assessment: pendentes==0).
  const mapeouSet = await colaboradoresMapeamentoCompleto(sb, empresaId);

  return data.map((c: any) => ({ ...c, votou: votouSet.has(c.id), temDisc: !!c.perfil_dominante, temMapeamento: mapeouSet.has(c.id) }));
}
