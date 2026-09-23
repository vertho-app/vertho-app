'use server';

import { requireAdminSupabase } from '@/lib/admin-supabase';
import { requireAdminAction } from '@/lib/auth/action-context';
import { gateEnvioDemo } from '@/lib/demo/envio-guard';
import { logAdminAction } from '@/lib/audit';
import { EMAIL_FROM_DEFAULT, ROOT_DOMAIN, tenantUrl } from '@/lib/domain';
import { emailConfigurationError, sendEmail, type SendEmailInput } from '@/lib/email-provider';
import { publicarTemplateCloudCis } from '@/lib/qstash-publish';
import { lerParametroAcesso, montarParametroAcesso } from '@/lib/auth/magic-link-whatsapp';
import { aplicarTetoLote, atrasosDoLote, duracaoEstimada } from '@/lib/whatsapp/cadencia';
import { idsDoEscopoOuFalhar, mensagemEscopoObrigatorio } from '@/lib/turmas/escopo';
import { TURMA_ENCERRADAS, TURMA_MEMBRO } from '@/lib/status';

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

const EMAIL_MIN_INTERVAL_MS = 250; // 4 req/s, abaixo das cotas atuais de ambos os provedores

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function enviarEmailComRetry(emailBody: SendEmailInput, throttle: { lastSentAt: number }) {
  let ultimoErro = '';

  for (let tentativa = 0; tentativa < 4; tentativa++) {
    const elapsed = Date.now() - throttle.lastSentAt;
    if (elapsed < EMAIL_MIN_INTERVAL_MS) await sleep(EMAIL_MIN_INTERVAL_MS - elapsed);
    throttle.lastSentAt = Date.now();

    const res = await sendEmail(emailBody);

    if (res.ok) return { ok: true };

    ultimoErro = res.error || 'Falha ao enviar e-mail';
    if (!res.retryable || tentativa === 3) break;
    await sleep(1500 * (tentativa + 1));
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

// Busca o PDF do relatório individual (buffer + nome) para anexar ao e-mail.
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
  return { buffer, filename };
}

/**
 * Disparo em lote de mensagem LIVRE, só por e-mail.
 *
 * 🔴 WhatsApp saiu desta action em 23/09/2026. O ramo mandava texto livre (e PDF
 * e anexo por `/send-document`) pela Z-API, desconectada desde 11/08, e a tela já
 * fixava `canal = 'email'`: era código morto que só um POST direto na action
 * alcançava, e que ensinava a quem lesse que o canal existia. Pela API oficial
 * da Meta não há texto livre fora da janela de 24h, e a Meta não aprova template
 * que seja só uma variável: WhatsApp em lote sai por TEMPLATE aprovado
 * (`dispararTemplateWhatsApp`, aba "WhatsApp Templates") ou não sai.
 *
 * @param {object} [anexoExtra] - anexo arbitrário enviado pelo gestor na UI
 *   { name: 'arquivo.pdf', mime: 'application/pdf', base64: '...' }
 *   Vai como anexo do e-mail, além do PDF do relatório (se comPDF=true).
 */
export async function dispararMensagemCustomizada(empresaId, template, canal, filtros: any = {}, assuntoTemplate = '', comPDF = false, anexoExtra: any = null) {
  const ctx = await requireAdminAction('assessments.dispatch');
  if (canal !== 'email') {
    return {
      success: false,
      error: 'Mensagem livre sai só por e-mail. No WhatsApp, use um template aprovado (aba WhatsApp Templates).',
      code: 'CANAL_INDISPONIVEL',
    };
  }
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
    // escolhida, recusa.
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

    colabs = colabs.filter(c => c.email);
    if (!colabs.length) return { success: false, error: 'Nenhum destinatário com email' };

    const domain = ROOT_DOMAIN;
    const fromEmail = EMAIL_FROM_DEFAULT;
    const emailConfigError = emailConfigurationError();
    const isRelatorio = comPDF;
    const resendThrottle = { lastSentAt: 0 };
    let enviados = 0, erros = 0, pulados = 0, erroDetalhe = '';

    for (const colab of colabs) {
      const nome = colab.nome_completo?.split(' ')[0] || '';
      const link = `https://${empresa.slug}.${domain}/login`;

      // Envio de relatório: sem PDF gerado, PULA o colaborador inteiro (não
      // manda e-mail órfão).
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

      if (emailConfigError) { erroDetalhe = emailConfigError; erros++; continue; }
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

        const res = await enviarEmailComRetry(emailBody, resendThrottle);
        if (res.ok) { enviados++; }
        else { erroDetalhe = res.error || 'Falha ao enviar e-mail'; erros++; }
      } catch (e) { erroDetalhe = e.message; erros++; }
    }

    const puladosTxt = pulados ? `, ${pulados} sem relatório (não enviados)` : '';
    const msg2 = `${enviados} emails enviados${erros ? `, ${erros} erros` : ''}${puladosTxt}${erroDetalhe ? `: ${erroDetalhe}` : ''}`;
    await logAdminAction({
      adminEmail: ctx.email, acao: 'whatsapp.broadcast', empresaId, empresaSlug: empresa.slug,
      alvo: `${colabs.length} colaboradores`,
      detalhes: { canal, via: 'direto', filtros, enviados, erros, pulados, comPDF, anexo: !!anexoExtra?.base64, erroDetalhe: erroDetalhe || undefined },
      resultado: enviados === 0 ? 'erro' : (erros > 0 || pulados > 0) ? 'parcial' : 'ok',
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

    // 🔴 CLOUD API, NÃO Z-API (22/09/2026). Até esta data o lote mandava o link em
    // TEXTO LIVRE pela Z-API, desconectada desde 11/08: o último envio com sucesso
    // foi em 13/08 e houve 113 falhas até 18/08, com o botão ainda na tela. Pela
    // API oficial o link de acesso só sai no BOTÃO do template aprovado (o link no
    // corpo é recusado; ver `lib/auth/magic-link-whatsapp.ts`), e o
    // `envio-template-lote` já dizia que o caminho do `acesso_vertho` era ESTE
    // botão. Mesmo template e mesmo `/entrar` do login individual e do Beto.
    const { contratoDoTemplate, templateAtivo } = await import('@/lib/notifications/pilula-template');
    const { cloudApiConfigurada } = await import('@/lib/whatsapp/cloud-api');
    const template = templateAtivo('acesso');
    const montar = contratoDoTemplate(template);
    if (!template || !montar || !cloudApiConfigurada()) {
      await logAdminAction({
        adminEmail: ctx.email, acao: 'whatsapp.magic_links', empresaId, empresaSlug: empresa.slug,
        alvo: `${colabs.length} colaboradores`,
        detalhes: { filtros, bloqueado: 'template_acesso_indisponivel', template: template || null },
        resultado: 'erro',
      });
      return {
        success: false,
        error: 'Template de acesso da API oficial do WhatsApp indisponível (WHATSAPP_TEMPLATE_ACESSO ou Cloud API não configurados). Nenhum link foi gerado.',
      };
    }
    // Sem QStash este disparo não tem como respeitar a cadência: 15s × N dentro
    // de uma server action estoura o timeout muito antes do fim do lote. Falhar
    // aqui é melhor que enviar rápido demais — foi a pressa que bloqueou o
    // número em 11/08/2026.
    if (!process.env.QSTASH_TOKEN) {
      return { success: false, error: 'QSTASH_TOKEN não configurado — disparo em lote indisponível.' };
    }

    const redirectUrl = tenantUrl(empresa.slug, '/dashboard');
    let enviados = 0, erros = 0, ultimoErro = '';
    // Chave de deduplicação por LOTE e pessoa: estável nas retentativas do QStash
    // (a mesma mensagem não duplica na conversa do inbox) e diferente num lote
    // novo. A chave padrão (`template:colaborador`) colidiria no índice único de
    // `whatsapp_mensagens_enviadas` e o segundo link sumiria da conversa.
    const loteId = Date.now().toString(36);

    // Teto de volume + cadência (política única), pelo QStash como os outros lotes.
    //
    // ⚠️ Trade-off assumido: o `<slug>~<token_hash>` fica no corpo da mensagem no
    // QStash até o seu atraso vencer (no pior caso ~30 min com o teto default).
    // É mais um custodiante de uma credencial de login. Aceito porque (a) o mesmo
    // valor trafega na URL do botão pelo WhatsApp, (b) é de uso único e expira, e
    // (c) a alternativa — envio síncrono — só funciona rápido demais ou não
    // funciona. Se um dia isso incomodar, o caminho é o webhook GERAR o link
    // (payload com colaboradorId, não com o token pronto).
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
        // Mesma regra de /api/auth/magic-link: `generateLink` NÃO cria usuário,
        // e quem foi importado por CSV está em `colaboradores` sem estar em
        // `auth.users`. Sem isto, o lote reporta "Falha ao gerar magic link"
        // pessoa a pessoa — e o escopo fail-closed acima já garantiu que quem
        // chega aqui é da turma escolhida. Idempotente: conta que já existe
        // volta como erro "already registered" e segue o fluxo.
        try {
          const { error: createErr } = await sb.auth.admin.createUser({
            email: colab.email,
            email_confirm: true,
          });
          if (createErr && !/already|registered|exists/i.test(createErr.message)) {
            console.warn('[magic-links] createUser:', createErr.message);
          }
        } catch (e: any) {
          console.warn('[magic-links] createUser:', e?.message || e);
        }

        const { data: linkData, error: linkErr } = await sb.auth.admin.generateLink({
          type: 'magiclink',
          email: colab.email,
          options: { redirectTo: redirectUrl },
        });
        const tokenHash = linkData?.properties?.hashed_token;
        if (linkErr || !tokenHash) {
          erros++;
          ultimoErro = linkErr?.message || 'Falha ao gerar magic link';
          return;
        }

        // `<slug>~<token_hash>`: o `/entrar` desempacota e manda para o
        // `/auth/callback` do tenant. Parâmetro que o `/entrar` não leria vira
        // erro desta pessoa, nunca um botão que leva a lugar nenhum.
        const acessoParam = montarParametroAcesso(empresa.slug, tokenHash);
        if (!lerParametroAcesso(acessoParam)) {
          erros++;
          ultimoErro = `slug "${empresa.slug}" não forma um link de acesso válido`;
          return;
        }

        const nome = colab.nome_completo?.split(' ')[0] || '';
        let phone = colab.telefone.replace(/\D/g, '');
        if (phone.length <= 11) phone = `55${phone}`;

        // Parâmetros pelo CONTRATO do template, como no `access-link-service`:
        // a ordem e a quantidade vêm de `CONTRATOS`, não deste call-site.
        const { params, botaoParam } = montar({
          telefone: phone, nome, semana: 1, tema: '',
          slug: '', baseUrl: '', formato: null, pilula: null,
          empresaId, colaboradorId: colab.id, acessoParam,
        });

        await publicarTemplateCloudCis({
          telefone: phone,
          template,
          templateParams: params,
          templateBotaoParam: botaoParam,
          templateDedupeKey: `magic_link:${loteId}:${colab.id}`,
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
      detalhes: { filtros, via: 'cloud-api', template, loteId, enviados, erros, adiadosPorTeto: adiados.length, ultimoErro: ultimoErro || undefined },
      resultado: enviados === 0 ? 'erro' : (erros > 0 || adiados.length > 0) ? 'parcial' : 'ok',
    });
    return { success: enviados > 0, message: msg2, error: enviados === 0 ? msg2 : undefined };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Turmas ATIVAS da empresa — o seletor de escopo desta tela.
 *
 * Existe porque o fail-closed de `idsDoEscopoOuFalhar` recusa lote sem turma
 * quando há 2+ safras, e até 21/08/2026 a tela não tinha ONDE escolher: o
 * operador via a recusa na prévia e não tinha ação correspondente — bloqueio
 * total do envio no tenant de Macaé.
 *
 * Gate `assessments.dispatch` (o mesmo das ações desta tela) em vez de reusar
 * `listarTurmas` de `@/actions/turmas`, que exige `content.manage`: emprestar a
 * permissão de outra área faria o seletor sumir justamente para quem opera o
 * envio, e o bloqueio voltaria sem sintoma novo.
 */
export async function loadTurmasEnvio(empresaId: string) {
  await requireAdminAction('assessments.dispatch');
  const sb = await requireAdminSupabase('assessments.dispatch');
  if (!empresaId) return { success: false, error: 'empresaId obrigatório' };
  const encerradas = `(${TURMA_ENCERRADAS.map((s) => `"${s}"`).join(',')})`;
  const { data, error } = await sb.from('turmas')
    .select('id, nome, status, data_inicio')
    .eq('empresa_id', empresaId)
    .not('status', 'in', encerradas)
    .order('created_at');
  if (error) return { success: false, error: error.message };
  return { success: true, data: data || [] };
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

  // Participação ATIVA (mig 210): sem ela a contagem da tela conta a empresa
  // inteira e promete um alvo que o servidor vai recortar por turma — o número
  // "17 destinatários" descrevendo um envio de 4. Só UMA participação ativa por
  // pessoa (índice parcial), então o Map basta.
  const { data: membros } = await sb.from('turma_membros')
    .select('colaborador_id, turma_id')
    .eq('empresa_id', empresaId)
    .eq('status', TURMA_MEMBRO.ATIVO);
  const turmaDe = new Map<string, string>((membros || []).map((m: any) => [m.colaborador_id, m.turma_id]));

  return data.map((c: any) => ({
    ...c,
    votou: votouSet.has(c.id),
    temDisc: !!c.perfil_dominante,
    temMapeamento: mapeouSet.has(c.id),
    turmaId: turmaDe.get(c.id) || null,
  }));
}

// ── Disparo por TEMPLATE (Cloud API) — a aba WhatsApp desde 20/08/2026 ───────

interface TemplateMetaCatalogo {
  template: string;
  status: string;
  categoria: string;
  idioma: string;
  corpo: string;
}

/**
 * Catálogo REAL da WABA. Leitura pura e best-effort: se a Meta estiver fora,
 * os templates manuais locais continuam aparecendo, mas a tela deixa claro que
 * não conseguiu atualizar o catálogo completo.
 */
async function consultarCatalogoMeta(): Promise<TemplateMetaCatalogo[] | null> {
  const token = process.env.META_WHATSAPPBUSINESS_API || '';
  const waba = process.env.WABA_ID || '';
  if (!token || !waba) return null;

  const graph = (process.env.META_GRAPH_URL || 'https://graph.facebook.com/v22.0').replace(/\/+$/, '');
  try {
    const r = await fetch(
      `${graph}/${waba}/message_templates?limit=200&fields=name,status,category,language,components`,
      {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
        signal: AbortSignal.timeout(8_000),
      },
    );
    const j: any = await r.json().catch(() => null);
    if (!r.ok || j?.error || !Array.isArray(j?.data)) return null;
    return j.data.map((tp: any) => ({
      template: String(tp.name || ''),
      status: String(tp.status || 'UNKNOWN'),
      categoria: String(tp.category || 'UNKNOWN'),
      idioma: String(tp.language || ''),
      corpo: String((tp.components || []).find((c: any) => c?.type === 'BODY')?.text || ''),
    })).filter((tp: TemplateMetaCatalogo) => tp.template);
  } catch {
    return null;
  }
}

/**
 * Templates que a tela pode disparar, com corpo e variáveis, mais o catálogo
 * completo da Meta para consulta.
 *
 * Os MANUAIS vêm do núcleo (`envio-template-lote`), não de uma lista na tela:
 * uma segunda cópia divergiria do `CONTRATOS`, e o sintoma seria a Meta
 * recusando o envio com os parâmetros na ordem errada. O restante aparece como
 * automático/credencial/legado, mas não é liberado para um lote sem contexto.
 */
export async function listarTemplatesDeEnvio() {
  await requireAdminAction('assessments.dispatch');
  const { listarTemplatesDisparaveis } = await import('@/lib/notifications/envio-template-lote');
  const locais = listarTemplatesDisparaveis();
  const meta = await consultarCatalogoMeta();
  const porNome = new Map((meta || []).map((tp) => [tp.template, tp]));
  const manuais = new Set(locais.map((tp) => tp.template));

  const data = locais.map((tp) => {
    const observado = porNome.get(tp.template);
    const indices = [...String(observado?.corpo || '').matchAll(/\{\{(\d+)\}\}/g)]
      .map((m) => Number(m[1]));
    const variaveisObservadas = indices.length ? Math.max(...indices) : 0;
    const contratoOk = !observado || variaveisObservadas === tp.variaveis.length;
    return {
      ...tp,
      status: observado?.status || null,
      categoria: observado?.categoria || tp.categoria,
      corpo: observado?.corpo || tp.corpo,
      disponivel: meta ? observado?.status === 'APPROVED' && contratoOk : true,
      motivoIndisponivel: !observado
        ? (meta ? 'Template não encontrado na Meta' : null)
        : observado.status !== 'APPROVED'
          ? `Status na Meta: ${observado.status}`
          : !contratoOk
            ? `Contrato divergente: a Meta espera ${variaveisObservadas} variável(is), o código mapeia ${tp.variaveis.length}`
            : null,
    };
  });

  const catalogo = (meta || data.map((tp) => ({
    template: tp.template,
    status: tp.status || 'LOCAL',
    categoria: tp.categoria,
    idioma: 'pt_BR',
    corpo: tp.corpo,
  }))).map((tp) => ({
    ...tp,
    manual: manuais.has(tp.template),
    uso: manuais.has(tp.template)
      ? 'manual'
      : tp.template === 'acesso_vertho' || tp.template === 'otp_acesso'
        ? 'credencial'
        : tp.template === 'recorte_demonstracao'
          ? 'comercial'
          : 'automatico',
  })).sort((a, b) => Number(b.manual) - Number(a.manual) || a.template.localeCompare(b.template));

  return {
    success: true,
    data,
    catalogo,
    catalogoFonte: meta ? 'meta' : 'local',
  };
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
    const lote = await prepararLoteTemplate(sb, {
      empresaId,
      template,
      colabs: colabs.escopo,
      idsRefinados: new Set(colabs.lista.map((c: any) => c.id)),
    });
    return {
      success: true,
      data: {
        template: lote.template,
        corpo: lote.corpo,
        total: lote.alvos.length,
        totalNoEscopo: lote.totalNoEscopo,
        elegiveisPeloTemplate: lote.elegiveisPeloTemplate,
        removidosPorFiltros: lote.removidosPorFiltros,
        aposRefinamentos: lote.aposRefinamentos,
        jaReceberam: lote.jaReceberam,
        excluidos: lote.excluidos,
        adiadosPorTeto: lote.adiadosPorTeto,
        avisoTeto: lote.avisoTeto,
        amostra: lote.alvos.slice(0, 5).map((a) => ({
          nome: a.nome,
          params: a.params,
          botaoParam: a.botaoParam,
        })),
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

    const lote = await prepararLoteTemplate(sb, {
      empresaId,
      template,
      colabs: colabs.escopo,
      idsRefinados: new Set(colabs.lista.map((c: any) => c.id)),
    });
    if (!lote.alvos.length) {
      return { success: false, error: 'Nenhuma pessoa elegível após a regra do template e os refinamentos (veja a prévia)' };
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
        totalNoEscopo: lote.totalNoEscopo,
        elegiveisPeloTemplate: lote.elegiveisPeloTemplate,
        removidosPorFiltros: lote.removidosPorFiltros,
        aposRefinamentos: lote.aposRefinamentos,
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
 * Separa o universo do escopo dos refinamentos opcionais da tela.
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

  let escopo = (data || []) as any[];
  if (permitidos) escopo = escopo.filter((c) => permitidos!.has(c.id));
  let lista = [...escopo];
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

  return { escopo, lista };
}
