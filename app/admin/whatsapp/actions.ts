'use server';

import { requireAdminSupabase } from '@/lib/admin-supabase';
import { requireAdminAction } from '@/lib/auth/action-context';
import { gateEnvioDemo } from '@/lib/demo/envio-guard';
import { logAdminAction } from '@/lib/audit';
import { APP_WEBHOOK_URL, EMAIL_FROM_DEFAULT, QSTASH_BASE_URL, ROOT_DOMAIN, tenantUrl } from '@/lib/domain';
import { assertZapiConnected, getZapiConfig } from '@/lib/zapi';
import { assertFilaDoProvedorLimpa } from '@/lib/whatsapp';
import { publicarWhatsappCis } from '@/lib/qstash-publish';
import { aplicarTetoLote, atrasosDoLote, criarRelogioCadencia, duracaoEstimada, intervaloLoteMs, maxPorDisparo } from '@/lib/whatsapp/cadencia';
import { idsDoEscopoOuFalhar, mensagemEscopoObrigatorio } from '@/lib/turmas/escopo';

/**
 * Fila residual tolerada antes de um disparo em lote. Zero: qualquer mensagem
 * presa significa que a anterior não escoou, e empilhar lote em cima disso foi
 * o caminho do bloqueio de 11/08/2026.
 */
const MAX_FILA_ANTES_DO_LOTE = 0;

/**
 * Acima disto o envio vai pelo QStash (assíncrono), não pelo loop na request.
 *
 * Era 50, e o limiar nunca foi sobre segurança de envio: era o teto do que cabia
 * no timeout da lambda. O efeito colateral é que o caminho "pequeno" mandava a
 * 1 msg/s — o DOBRO da taxa que bloqueou o número em 11/08. Com a cadência real
 * (15s), 50 mensagens levariam 12 min e nenhuma lambda sobrevive a isso; então o
 * limiar tem que ser o que cabe na request, e todo o resto é assíncrono.
 *
 * **1, não 3** (revisão de 11/08, depois): com 3 o ramo direto passou a dormir
 * `intervaloLoteMs()` entre mensagens DENTRO da server action — 30s de request
 * num segmento sem `maxDuration` (e a page é `'use client'`, então não há onde
 * declará-lo). A request morreria depois de já ter enviado: o admin veria erro
 * sobre mensagem entregue. Com 1 não existe intervalo a cumprir (a cadência só
 * começa na 2ª mensagem), o sleep some da request e tudo que é lote é assíncrono.
 * Subir este número reintroduz o acoplamento "env de cadência × timeout de HTTP".
 */
const LIMIAR_ENVIO_DIRETO = 1;

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

// Variante leve pro caminho QStash (>50 destinatários): só a signed URL, SEM
// baixar o buffer. O documento vai por URL no payload (não base64), então
// baixar o PDF de cada colab só pra descartar seria desperdício em lote.
// Expiry maior (2h) pra cobrir o atraso escalonado do QStash + retries.
async function buscarPDFUrlColaborador(sb, empresaId, colaboradorId) {
  const { data: rel } = await sb.from('relatorios')
    .select('pdf_path')
    .eq('empresa_id', empresaId)
    .eq('colaborador_id', colaboradorId)
    .eq('tipo', 'individual')
    .not('pdf_path', 'is', null)
    .maybeSingle();
  if (!rel?.pdf_path) return null;
  const filename = rel.pdf_path.split('/').pop();
  const { data: signed } = await sb.storage.from('relatorios-pdf')
    .createSignedUrl(rel.pdf_path, 60 * 60 * 2); // 2h
  if (!signed?.signedUrl) return null;
  return { url: signed.signedUrl, filename };
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
  // Tenant de demonstração: bloqueia disparo real antes de tocar colaboradores.
  const gate = await gateEnvioDemo(empresaId);
  if (gate.blocked) return { success: false, error: gate.motivo };
  try {
    const { data: empresa } = await sb.from('empresas')
      .select('nome, slug').eq('id', empresaId).single();
    if (!empresa) return { success: false, error: 'Empresa não encontrada' };

    // ESCOPO fail-closed (mig 210): disparo em lote é COMUNICAÇÃO REAL. Com duas
    // safras no mesmo tenant, "mandar para a empresa" atinge quem está no meio
    // da jornada e quem acabou de entrar com a mesma mensagem. Sem turma
    // escolhida, recusa — e o teto de WhatsApp torna o estrago pior: a turma
    // grande come a cota e a outra fica sem, em silêncio (11/08).
    let permitidos: Set<string> | null;
    try {
      permitidos = await idsDoEscopoOuFalhar(sb, empresaId, {
        turmaId: filtros.turmaId || null,
        empresaInteiraJustificativa: filtros.empresaInteiraJustificativa || null,
      });
    } catch (e) {
      const msg = mensagemEscopoObrigatorio(e);
      if (msg) return { success: false, error: msg, code: 'ESCOPO_OBRIGATORIO' };
      throw e;
    }

    // Buscar colaboradores
    let colabs;
    const { data: c1, error: e1 } = await sb.from('colaboradores')
      .select('id, nome_completo, email, cargo, telefone, perfil_dominante')
      .eq('empresa_id', empresaId);
    colabs = e1 ? (await sb.from('colaboradores').select('id, nome_completo, email, cargo, perfil_dominante').eq('empresa_id', empresaId)).data : c1;
    if (!colabs?.length) return { success: false, error: 'Nenhum colaborador encontrado' };

    if (permitidos) colabs = colabs.filter(c => permitidos!.has(c.id));
    if (!colabs.length) return { success: false, error: 'Nenhum colaborador na turma escolhida' };

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

    if (canal === 'whatsapp') {
      try {
        await assertZapiConnected();
        // Segunda trava: conectado NÃO basta. A Z-API pode estar de pé com
        // mensagens presas da rodada anterior, que ela descarrega em rajada.
        await assertFilaDoProvedorLimpa(MAX_FILA_ANTES_DO_LOTE);
      } catch (e: any) {
        await logAdminAction({
          adminEmail: ctx.email, acao: 'whatsapp.broadcast', empresaId, empresaSlug: empresa.slug,
          alvo: `${colabs.length} colaboradores`,
          detalhes: { canal, filtros, bloqueado: 'zapi_indisponivel', erro: e?.message },
          resultado: 'erro',
        });
        return {
          success: false,
          error: `${e?.message || 'Z-API desconectada'}. Reconecte a instância antes de disparar WhatsApp em lote.`,
        };
      }
    }

    // Log inicial: ajuda diagnosticar qual branch (direto vs QStash) será usado
    console.log(
      `[dispararMensagemCustomizada] empresa=${empresa.slug} canal=${canal} ` +
      `colabs=${colabs.length} hasQStashToken=${!!process.env.QSTASH_TOKEN} ` +
      `webhookUrl=${APP_WEBHOOK_URL}/api/webhooks/qstash/whatsapp-cis`,
    );

    // Atalho: WhatsApp em lote via QStash em PARALELO. Sem isso, publishes
    // sequenciais com latência transatlântica estouravam o timeout serverless
    // do Vercel (10s default Hobby, 60s Pro) — só 2 publicavam.
    if (
      canal === 'whatsapp' &&
      colabs.length > LIMIAR_ENVIO_DIRETO &&
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
      // Teto de VOLUME e cadência vêm de lib/whatsapp/cadencia (política única).
      // O excedente é devolvido na mensagem — nunca cortado em silêncio.
      const { enviar: alvos, adiados, aviso: avisoTeto } = aplicarTetoLote(colabs as any[]);
      const atrasos = atrasosDoLote(alvos.length);
      const results = await Promise.all(alvos.map(async (colab: any, idx: number) => {
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
        // Relatório: anexa o PDF individual via signed URL (o webhook envia o
        // documento depois do texto). URL em vez de base64 pra não inchar o
        // payload do QStash em lote. Sem relatório gerado, NÃO envia nada
        // (nem o texto) — pular em vez de mandar uma mensagem órfã.
        // colaboradorId/empresaId vão no payload para a entrega ser gravada COM
        // dono: sem eles, saber quem recebeu depende da DLQ do QStash (que
        // expira) e um novo disparo reenviaria para quem já recebeu.
        const body: any = {
          telefone: phone,
          mensagem: msg,
          kindEnvio: comPDF ? 'relatorio' : 'broadcast',
          ...(colab.id ? { colaboradorId: colab.id } : {}),
          empresaId,
        };
        if (comPDF) {
          const pdf = colab.id ? await buscarPDFUrlColaborador(sb, empresaId, colab.id) : null;
          if (!pdf?.url) return { ok: false, skip: true };
          body.documentoUrl = pdf.url;
          body.documentoNome = pdf.filename;
        }
        try {
          const rQ = await fetch(`${QSTASH_BASE_URL}/v2/publish/${webhookUrl}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${process.env.QSTASH_TOKEN}`,
              'Upstash-Delay': `${atrasos[idx]}s`,
            },
            body: JSON.stringify(body),
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
      const pulados = results.filter(r => (r as any).skip).length;
      const fail = results.filter(r => !r.ok && !(r as any).skip).length;
      const firstErr = results.find(r => !r.ok && !(r as any).skip)?.err || '';
      const puladosTxt = pulados ? `, ${pulados} sem relatório (não enviados)` : '';
      const tetoTxt = avisoTeto ? ` ⚠️ ${avisoTeto}` : '';
      const txt =
        `${ok} WhatsApp agendados via QStash (entrega em ${duracaoEstimada(ok)}), ` +
        `${fail} erros${puladosTxt}${firstErr ? ` — ${firstErr}` : ''}${tetoTxt}`;
      console.log(`[dispararMensagemCustomizada] paralelo: ${txt}`);
      await logAdminAction({
        adminEmail: ctx.email, acao: 'whatsapp.broadcast', empresaId, empresaSlug: empresa.slug,
        alvo: `${colabs.length} colaboradores`,
        detalhes: {
          canal, via: 'qstash_paralelo', filtros, agendados: ok, erros: fail, pulados, comPDF,
          anexo: !!anexoExtra?.base64,
          // Quantos ficaram para depois por causa do teto — precisa estar na
          // auditoria, senão "155 colaboradores" no alvo sugere 155 enviados.
          adiadosPorTeto: adiados.length,
        },
        resultado: ok === 0 ? 'erro' : (fail > 0 || pulados > 0 || adiados.length > 0) ? 'parcial' : 'ok',
      });
      return { success: ok > 0, message: txt, error: ok === 0 ? txt : undefined };
    }

    const domain = ROOT_DOMAIN;
    const fromEmail = EMAIL_FROM_DEFAULT;
    const hasResend = !!process.env.RESEND_API_KEY;
    const hasQStash = !!process.env.QSTASH_TOKEN;
    const isRelatorio = comPDF;
    const resendThrottle = { lastSentAt: 0 };
    let enviados = 0, erros = 0, pulados = 0, erroDetalhe = '';
    // Relógio da cadência para o loop sequencial (o ramo que roda quando o
    // paralelo não se aplica). Um por execução, criado FORA do loop: dentro dele,
    // cada mensagem começaria do zero e todas sairiam juntas.
    const relogioLoop = criarRelogioCadencia();
    let adiadosNoLoop = 0;

    // Anexo extra: usamos sempre base64 no endpoint /send-document/{ext}.
    // Essa abordagem resolve o problema de abertura (o WhatsApp usa a
    // extensão do path pra setar o mime e abrir com o app nativo) sem
    // depender de upload + signed URL (que já teve problemas).

    for (const colab of colabs) {
      const nome = colab.nome_completo?.split(' ')[0] || '';
      const link = `https://${empresa.slug}.${domain}/login`;

      // Envio de relatório: sem PDF gerado, PULA o colaborador inteiro (não
      // manda texto/e-mail órfão). Busca uma vez e reusa nos branches abaixo.
      let pdfRel: Awaited<ReturnType<typeof buscarPDFColaborador>> = null;
      if (isRelatorio) {
        pdfRel = colab.id ? await buscarPDFColaborador(sb, empresaId, colab.id) : null;
        if (!pdfRel) { pulados++; continue; }
      }

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

          // PDF do relatório (já resolvido no topo do loop; colabs sem PDF
          // nem chegam aqui).
          const attachments = [];
          if (pdfRel) {
            attachments.push({ filename: pdfRel.filename, content: pdfRel.buffer.toString('base64') });
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
        const zapi = getZapiConfig();
        if (!zapi.configured) { erroDetalhe = 'Z-API não configurado'; erros++; continue; }

        let phone = colab.telefone.replace(/\D/g, '');
        if (phone.length <= 11) phone = `55${phone}`;

        // Lote pequeno: Z-API direto na request. Acima do limiar: QStash.
        if (colabs.length <= LIMIAR_ENVIO_DIRETO) {
          try {
            // Inalcançável com LIMIAR_ENVIO_DIRETO = 1, e é de propósito que
            // fique aqui: se alguém subir o limiar, a cadência do ramo direto é a
            // mesma dos outros — não existe "poucos, então pode rápido". O que o
            // WhatsApp observa é o intervalo, não o tamanho do lote.
            if (enviados > 0) await new Promise(resolve => setTimeout(resolve, intervaloLoteMs()));

            // Enviar texto
            const res = await fetch(`${zapi.baseUrl}/send-text`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Client-Token': zapi.clientToken },
              body: JSON.stringify({ phone, message: msg }),
            });

            // Se relatório, enviar PDF do relatório individual via base64
            // no endpoint /send-document/pdf (mime correto). PDF já resolvido
            // no topo do loop.
            if (res.ok && pdfRel?.buffer) {
              await new Promise(resolve => setTimeout(resolve, 500));
              const rPdf = await fetch(`${zapi.baseUrl}/send-document/pdf`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Client-Token': zapi.clientToken },
                body: JSON.stringify({
                  phone,
                  document: `data:application/pdf;base64,${pdfRel.buffer.toString('base64')}`,
                  fileName: pdfRel.filename,
                }),
              });
              if (!rPdf.ok) {
                const txt = await rPdf.text();
                console.warn('[ZAPI send-document/pdf]', rPdf.status, txt.slice(0, 300));
                erroDetalhe = `PDF não enviado: ${rPdf.status} ${txt.slice(0, 120)}`;
              }
            }

            // Anexo extra — base64 no endpoint por extensão.
            if (res.ok && anexoExtra?.base64) {
              await new Promise(resolve => setTimeout(resolve, 500));
              const ext = extFromNameOrMime(anexoExtra.name, anexoExtra.mime);
              const mime = anexoExtra.mime || 'application/octet-stream';
              const rAnx = await fetch(`${zapi.baseUrl}/send-document/${ext}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Client-Token': zapi.clientToken },
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
        } else if (relogioLoop.tetoAtingido()) {
          // Teto de VOLUME também neste ramo. Ele usava `enviados * intervalo`:
          // a taxa certa, mas sem jitter (cadência exata é assinatura de robô) e
          // sem limite — 500 destinatários a 15s ainda são 500 mensagens não
          // solicitadas saindo de um número não-oficial.
          adiadosNoLoop++;
        } else if (process.env.QSTASH_TOKEN) {
          // Branch QStash (acima do limiar de envio direto)
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
            // Relatório: anexa o PDF individual via signed URL (webhook envia o
            // documento depois do texto). PDF já resolvido no topo do loop.
            const bodyQ: any = {
              telefone: phone,
              mensagem: msg,
              kindEnvio: isRelatorio ? 'relatorio' : 'broadcast',
              ...(colab.id ? { colaboradorId: colab.id } : {}),
              empresaId,
            };
            if (pdfRel?.url) { bodyQ.documentoUrl = pdfRel.url; bodyQ.documentoNome = pdfRel.filename; }
            // QStash exige URL raw no path (sem encodeURIComponent) — encoded dá "invalid scheme"
            const rQ = await fetch(`${QSTASH_BASE_URL}/v2/publish/${webhookUrl}`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${process.env.QSTASH_TOKEN}`,
                // Mesma política do ramo paralelo, e pelo MESMO relógio: acúmulo
                // com jitter, não `enviados * intervalo` (que dá cadência exata).
                'Upstash-Delay': `${relogioLoop.proximo()}s`,
              },
              body: JSON.stringify(bodyQ),
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

    const puladosTxt = pulados ? `, ${pulados} sem relatório (não enviados)` : '';
    // O teto deste ramo aparece na frase e na auditoria pelo mesmo motivo do ramo
    // paralelo: "155 colaboradores" no alvo sugere 155 enviados.
    const adiadoTxt = adiadosNoLoop
      ? ` ⚠️ ${adiadosNoLoop} NÃO enviados: teto de ${maxPorDisparo()} por disparo (protege o número). Dispare o restante depois.`
      : '';
    const msg2 = `${enviados} ${canal === 'email' ? 'emails' : 'WhatsApp'} enviados${erros ? `, ${erros} erros` : ''}${puladosTxt}${erroDetalhe ? ` — ${erroDetalhe}` : ''}${adiadoTxt}`;
    await logAdminAction({
      adminEmail: ctx.email, acao: 'whatsapp.broadcast', empresaId, empresaSlug: empresa.slug,
      alvo: `${colabs.length} colaboradores`,
      detalhes: { canal, via: 'direto', filtros, enviados, erros, pulados, comPDF, anexo: !!anexoExtra?.base64, adiadosPorTeto: adiadosNoLoop, erroDetalhe: erroDetalhe || undefined },
      resultado: enviados === 0 ? 'erro' : (erros > 0 || pulados > 0 || adiadosNoLoop > 0) ? 'parcial' : 'ok',
    });
    return { success: enviados > 0, message: msg2, error: enviados === 0 ? msg2 : undefined };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export async function enviarMagicLinksWhatsApp(empresaId: string, filtros: any = {}) {
  const ctx = await requireAdminAction('assessments.dispatch');
  const sb = await requireAdminSupabase('assessments.dispatch');
  // Tenant de demonstração: bloqueia disparo real antes de tocar colaboradores.
  const gate = await gateEnvioDemo(empresaId);
  if (gate.blocked) return { success: false, error: gate.motivo };
  try {
    const { data: empresa } = await sb.from('empresas')
      .select('nome, slug').eq('id', empresaId).single();
    if (!empresa) return { success: false, error: 'Empresa não encontrada' };

    // ESCOPO fail-closed (mig 210) — magic link é ACESSO: mandar para a safra
    // errada convida gente que ainda não devia entrar.
    let permitidos: Set<string> | null;
    try {
      permitidos = await idsDoEscopoOuFalhar(sb, empresaId, {
        turmaId: filtros.turmaId || null,
        empresaInteiraJustificativa: filtros.empresaInteiraJustificativa || null,
      });
    } catch (e) {
      const msg = mensagemEscopoObrigatorio(e);
      if (msg) return { success: false, error: msg, code: 'ESCOPO_OBRIGATORIO' };
      throw e;
    }

    let { data: colabs } = await sb.from('colaboradores')
      .select('id, nome_completo, email, cargo, telefone, perfil_dominante')
      .eq('empresa_id', empresaId);
    if (!colabs?.length) return { success: false, error: 'Nenhum colaborador encontrado' };

    if (permitidos) colabs = colabs.filter(c => permitidos!.has(c.id));
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

    const zapi = getZapiConfig();
    if (!zapi.configured) return { success: false, error: 'Z-API não configurado' };
    // Sem QStash este disparo não tem como respeitar a cadência: 15s × N dentro
    // de uma server action estoura o timeout muito antes do fim do lote. Falhar
    // aqui é melhor que enviar rápido demais — foi a pressa que bloqueou o
    // número em 11/08/2026.
    if (!process.env.QSTASH_TOKEN) {
      return { success: false, error: 'QSTASH_TOKEN não configurado — disparo em lote indisponível.' };
    }
    try {
      await assertZapiConnected();
      // Segunda trava: conectado não basta (fila residual sai em rajada).
      await assertFilaDoProvedorLimpa(MAX_FILA_ANTES_DO_LOTE);
    } catch (e: any) {
      await logAdminAction({
        adminEmail: ctx.email, acao: 'whatsapp.magic_links', empresaId, empresaSlug: empresa.slug,
        alvo: `${colabs.length} colaboradores`,
        detalhes: { filtros, bloqueado: 'zapi_indisponivel', erro: e?.message },
        resultado: 'erro',
      });
      return { success: false, error: `${e?.message || 'Z-API indisponível'}. Reconecte a instância antes de disparar WhatsApp em lote.` };
    }

    const redirectUrl = tenantUrl(empresa.slug, '/dashboard');
    let enviados = 0, erros = 0, ultimoErro = '';

    // Teto de volume + cadência (política única). Este disparo enviava DIRETO na
    // request com 1,2s entre mensagens — ~50/min, o DOBRO da taxa que bloqueou o
    // número. Agora vai pelo QStash como os outros lotes.
    //
    // ⚠️ Trade-off assumido: o magic link passa a ficar no CORPO da mensagem no
    // QStash até o seu atraso vencer (no pior caso ~30 min com o teto default).
    // É mais um custodiante de uma credencial de login. Aceito porque (a) o mesmo
    // link já trafega em claro pela Z-API e pelo WhatsApp, (b) é de uso único e
    // expira em 24h, e (c) a alternativa — manter o envio síncrono — só funciona
    // rápido demais ou não funciona. Se um dia isso incomodar, o caminho é o
    // webhook GERAR o link (payload com colaboradorId, não com o link pronto).
    const { enviar: alvos, adiados, aviso: avisoTeto } = aplicarTetoLote(colabs as any[]);
    const atrasos = atrasosDoLote(alvos.length);

    // Em BLOCOS, não em série: o `generateLink` é uma ida ao GoTrue por pessoa
    // (~300ms), e 120 delas em fila levariam ~36s DENTRO da server action — o
    // mesmo tipo de request longa que este arquivo acabou de deixar de ter. O
    // bloco de 10 encurta para ~4s sem martelar o rate limit do Auth. A cadência
    // NÃO depende desta ordem: quem espaça as mensagens é o `Upstash-Delay` de
    // cada publish, não o instante em que ele foi publicado.
    const BLOCO = 10;
    for (let inicio = 0; inicio < alvos.length; inicio += BLOCO) {
      const bloco = alvos.slice(inicio, inicio + BLOCO);
      await Promise.all(bloco.map(async (colab: any, i: number) => {
      const idx = inicio + i;
      try {
        const { data: linkData, error: linkErr } = await sb.auth.admin.generateLink({
          type: 'magiclink',
          email: colab.email,
          options: { redirectTo: redirectUrl },
        });
        if (linkErr || !linkData?.properties?.action_link) {
          erros++;
          ultimoErro = linkErr?.message || 'Falha ao gerar magic link';
          return;
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

        await publicarWhatsappCis({
          telefone: phone,
          mensagem: msg,
          kindEnvio: 'magic_link',
          colaboradorId: colab.id,
          empresaId,
        }, atrasos[idx]);
        enviados++;
      } catch (e: any) {
        erros++;
        ultimoErro = e.message;
      }
      }));
    }

    const tetoTxt = avisoTeto ? ` ⚠️ ${avisoTeto}` : '';
    const msg2 =
      `${enviados} magic links agendados por WhatsApp (entrega em ${duracaoEstimada(enviados)})` +
      `${erros ? `, ${erros} erros` : ''}${ultimoErro ? ` — ${ultimoErro}` : ''}${tetoTxt}`;
    await logAdminAction({
      adminEmail: ctx.email, acao: 'whatsapp.magic_links', empresaId, empresaSlug: empresa.slug,
      alvo: `${colabs.length} colaboradores`,
      // adiadosPorTeto na auditoria: "53 colaboradores" no alvo sugere 53 links.
      detalhes: { filtros, enviados, erros, adiadosPorTeto: adiados.length, ultimoErro: ultimoErro || undefined },
      resultado: enviados === 0 ? 'erro' : (erros > 0 || adiados.length > 0) ? 'parcial' : 'ok',
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

// ── Disparo por TEMPLATE (Cloud API) — a aba WhatsApp desde 20/08/2026 ───────

/**
 * Templates que a tela pode disparar, com corpo e variáveis.
 *
 * Vem do núcleo (`lib/notifications/envio-template-lote`), não de uma lista na
 * tela: uma segunda cópia divergiria do `CONTRATOS`, e o sintoma seria a Meta
 * recusando o envio com os parâmetros na ordem errada.
 */
export async function listarTemplatesDeEnvio() {
  await requireAdminAction('assessments.dispatch');
  const { listarTemplatesDisparaveis } = await import('@/lib/notifications/envio-template-lote');
  return { success: true, data: listarTemplatesDisparaveis() };
}

/**
 * Prévia do lote: quem recebe, com que parâmetros, e — o que a tela antiga não
 * mostrava — quem NÃO recebe e por quê.
 *
 * Não envia nada. É o `--dry-run` do script, na tela.
 */
export async function previewTemplateWhatsApp(empresaId: string, template: string, filtros: any = {}) {
  await requireAdminAction('assessments.dispatch');
  const sb = await requireAdminSupabase('assessments.dispatch');
  try {
    const { prepararLoteTemplate } = await import('@/lib/notifications/envio-template-lote');
    const colabs = await colaboradoresFiltrados(sb, empresaId, filtros);
    if ('erro' in colabs) return { success: false, error: colabs.erro, code: colabs.code };
    const lote = await prepararLoteTemplate(sb, { empresaId, template, colabs: colabs.lista });
    return {
      success: true,
      data: {
        template: lote.template,
        corpo: lote.corpo,
        total: lote.alvos.length,
        jaReceberam: lote.jaReceberam,
        excluidos: lote.excluidos,
        adiadosPorTeto: lote.adiadosPorTeto,
        avisoTeto: lote.avisoTeto,
        amostra: lote.alvos.slice(0, 5).map((a) => ({ nome: a.nome, params: a.params })),
      },
    };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Falha ao montar a prévia' };
  }
}

/**
 * Enfileira o disparo do template para o filtro atual.
 *
 * ⚠️ O retorno diz ENFILEIRADOS, não entregues — a confirmação vem do webhook
 * de status, em `notification_deliveries.delivered_at`. A tela antiga chamava o
 * enfileiramento de sucesso e por isso mentia num dia em que nada chegava.
 */
export async function dispararTemplateWhatsApp(empresaId: string, template: string, filtros: any = {}) {
  const ctx = await requireAdminAction('assessments.dispatch');
  const sb = await requireAdminSupabase('assessments.dispatch');
  const gate = await gateEnvioDemo(empresaId);
  if (gate.blocked) return { success: false, error: gate.motivo };
  try {
    const { prepararLoteTemplate, enfileirarLoteTemplate } = await import('@/lib/notifications/envio-template-lote');
    const colabs = await colaboradoresFiltrados(sb, empresaId, filtros);
    if ('erro' in colabs) return { success: false, error: colabs.erro, code: colabs.code };

    const lote = await prepararLoteTemplate(sb, { empresaId, template, colabs: colabs.lista });
    if (!lote.alvos.length) {
      return { success: false, error: 'Nenhum destinatário no filtro atual (veja os excluídos na prévia)' };
    }

    const r = await enfileirarLoteTemplate(lote, empresaId);
    const partes = [`${r.enfileirados} mensagem(ns) na fila (${r.duracao})`];
    if (r.falhas.length) partes.push(`${r.falhas.length} não enfileiradas`);
    if (lote.jaReceberam) partes.push(`${lote.jaReceberam} já haviam recebido este template`);
    if (r.adiadosPorTeto) partes.push(`${r.adiadosPorTeto} adiados pelo teto`);

    await logAdminAction({
      adminEmail: ctx.email,
      acao: 'whatsapp.template.disparo',
      alvo: empresaId,
      detalhes: {
        template, filtros,
        enfileirados: r.enfileirados,
        falhas: r.falhas.length,
        jaReceberam: lote.jaReceberam,
        adiadosPorTeto: r.adiadosPorTeto,
        excluidos: lote.excluidos,
      },
    });

    return {
      success: true,
      message: partes.join(' · '),
      data: { enfileirados: r.enfileirados, falhas: r.falhas, excluidos: lote.excluidos, avisoTeto: lote.avisoTeto },
    };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Falha ao disparar' };
  }
}

/**
 * Aplica escopo de turma + os filtros da tela e devolve os colaboradores.
 *
 * Helper local (não exportado): num arquivo `'use server'` todo export vira
 * endpoint HTTP, e esta função não tem gate próprio — quem gateia são as duas
 * actions acima. Ver CLAUDE.md §"Server Actions são endpoints HTTP".
 */
async function colaboradoresFiltrados(sb: any, empresaId: string, filtros: any) {
  let permitidos: Set<string> | null;
  try {
    permitidos = await idsDoEscopoOuFalhar(sb, empresaId, {
      turmaId: filtros.turmaId || null,
      empresaInteiraJustificativa: filtros.empresaInteiraJustificativa || null,
    });
  } catch (e) {
    const msg = mensagemEscopoObrigatorio(e);
    if (msg) return { erro: msg, code: 'ESCOPO_OBRIGATORIO' as const };
    throw e;
  }

  const { data, error } = await sb.from('colaboradores')
    .select('id, nome_completo, email, cargo, telefone, perfil_dominante')
    .eq('empresa_id', empresaId);
  if (error) throw new Error(`colaboradores: ${error.message}`);

  let lista = (data || []) as any[];
  if (permitidos) lista = lista.filter((c) => permitidos!.has(c.id));
  if (filtros.cargo) lista = lista.filter((c) => c.cargo === filtros.cargo);
  if (filtros.disc === 'sim') lista = lista.filter((c) => !!c.perfil_dominante);
  else if (filtros.disc === 'nao') lista = lista.filter((c) => !c.perfil_dominante);

  if (filtros.voto === 'nao_votou' || filtros.voto === 'votou') {
    const { data: votos, error: eV } = await sb.from('votacao_competencias')
      .select('colaborador_id').eq('empresa_id', empresaId);
    if (eV) throw new Error(`votacao_competencias: ${eV.message}`);
    const votou = new Set((votos || []).map((v: any) => v.colaborador_id));
    lista = lista.filter((c) => (filtros.voto === 'votou' ? votou.has(c.id) : !votou.has(c.id)));
  }

  // BOOLEANO, não string de status: `mapeamentoCompleto` em vez das palavras
  // que o guard de literais de status vigia. Ele trataria a string de filtro
  // como status de trilha — e tem razão em não distinguir: dois domínios usando
  // as mesmas palavras é justamente como um typo passa despercebido.
  if (typeof filtros.mapeamentoCompleto === 'boolean') {
    const completos = await colaboradoresMapeamentoCompleto(sb, empresaId);
    lista = lista.filter((c) => (filtros.mapeamentoCompleto ? completos.has(c.id) : !completos.has(c.id)));
  }

  return { lista };
}
