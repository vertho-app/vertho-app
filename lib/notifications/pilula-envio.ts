/**
 * Builders + envio da PÍLULA semanal (conteúdo do dia da trilha), compartilhados
 * entre o cron `triggerDiario` (actions/cron-jobs.ts) e disparos manuais.
 *
 * A pílula NÃO carrega o arquivo do conteúdo — ela leva um DEEP-LINK que abre o
 * app no formato PREFERIDO do colaborador. Lá dentro ficam os formatos da semana:
 * desde 02/10/2026 o kit novo mostra só os 2 primeiros da preferência da pessoa,
 * então o e-mail não pode prometer "todos os formatos" (ver `emailPilula`).
 * O link usa a URL do TENANT (ex.: ibipeba.vertho.ai), não a genérica.
 *
 * Canais: WhatsApp (texto) + e-mail (SES/Resend). Ambos com o mesmo tema/formato.
 */

import type { AppLocale } from '@/i18n/routing';
import { EMAIL_FROM_DEFAULT } from '@/lib/domain';
import { emailConfigurationError, emailProviderName, sendEmail } from '@/lib/email-provider';
import { copiaEmail, preencher, primeiroNomeEmail } from '@/lib/i18n-email-templates';
import { registrarEntrega } from '@/lib/notifications/delivery-log';
import { rodapePrivacidadeHtml } from '@/lib/notifications/rodape-privacidade';
import { APLICACAO_VIDEO_ID } from '@/lib/season-engine/programa-config';
// O helper vive em `lib/descritor-humano.ts` (puro, sem imports) porque tela,
// PDF e envio precisam do MESMO texto — duplicar a régua faria as três divergirem
// na primeira correção. Reexportado aqui para não quebrar quem já importava.
import { descritorParaHumano } from '@/lib/descritor-humano';
export { descritorParaHumano };

const LABEL_FORMATO: Record<string, string> = {
  video: 'vídeo 🎬',
  audio: 'áudio 🎧',
  texto: 'texto 📖',
  case: 'estudo de caso 📋',
};

export function labelFormato(formato?: string | null): string {
  return LABEL_FORMATO[formato || ''] || 'conteúdo';
}

// O e-mail não leva emoji (R-123): o nome do formato sem o ícone do WhatsApp.
// O nome vem do idioma do DESTINATÁRIO (Onda D, 04/10/2026); sem locale sai em
// pt-BR, como sempre saiu. Os textos moram em `lib/i18n-email-templates.ts`.
export function labelFormatoEmail(formato?: string | null, locale?: AppLocale | null): string {
  const rotulos: Record<string, string> = copiaEmail(locale).formatos;
  const chave = formato || '';
  // `outro` é o texto de reserva, não um formato: "outro" vindo do banco cai nele
  // do mesmo jeito que um formato desconhecido.
  return chave !== 'outro' && Object.prototype.hasOwnProperty.call(rotulos, chave) ? rotulos[chave] : rotulos.outro;
}

/**
 * Tema do conteúdo ("competência · descritor") a partir de um item de conteudos_dia.
 *
 * `padrao` é o texto de quando o item não traz nada. O WhatsApp e o push seguem
 * com o default em pt-BR (fora desta onda); o e-mail passa o do idioma da pessoa.
 */
export function temaPilula(e: any, padrao: string = 'novo conteúdo da semana'): string {
  const comp = e?.competencia ? String(e.competencia).trim() : '';
  const desc = e?.descritor ? descritorParaHumano(String(e.descritor).trim()) : '';
  const titulo = e?.conteudo?.core_titulo || e?.conteudo?.titulo || '';
  return [comp, desc].filter(Boolean).join(' · ') || titulo || padrao;
}

/**
 * Deep-link da semana no tenant, já no formato preferido. `baseUrl` = ex.
 * https://ibipeba.vertho.ai. `pilula` (1|2) marca de qual pílula DUO veio o clique,
 * pra atribuição de abertura (`?p=`); ausente = abertura direta/navegação.
 */
/**
 * Canal por onde o link foi entregue. Vira `?o=` e, na chegada, um evento de
 * trilha `chegada_<canal>`.
 *
 * POR QUE ISTO EXISTE (08/09/2026). A alternativa seria pixel de abertura, que
 * mede se o cliente de e-mail carregou uma imagem — número que o Apple Mail
 * infla (pré-carrega tudo) e o bloqueio de imagens esvazia, nos dois sentidos ao
 * mesmo tempo. Chegada é sinal de AÇÃO, é dado nosso, e não precisa de pixel nem
 * de reescrever link. O preço é honesto: quem lê e não clica não aparece — e
 * para a trilha essa pessoa está no mesmo lugar de quem não leu.
 */
export type CanalDoLink = 'email' | 'whatsapp' | 'push';

export function deepLinkSemana(
  baseUrl: string,
  semana: number,
  formato?: string | null,
  pilula?: number | null,
  canal?: CanalDoLink | null,
): string {
  const params = new URLSearchParams();
  if (formato) params.set('formato', formato);
  if (pilula) params.set('p', String(pilula));
  if (canal) params.set('o', canal);
  const qs = params.toString();
  return `${baseUrl}/dashboard/temporada/semana/${semana}${qs ? `?${qs}` : ''}`;
}

/**
 * `locale` é o idioma do DESTINATÁRIO do e-mail (Onda D): só os builders de e-mail
 * o leem; o texto do WhatsApp segue em pt-BR por decisão da onda. Ausente, pt-BR.
 */
type PilulaOpts = { formato?: string | null; semana: number; baseUrl: string; pilula?: number | null; locale?: AppLocale | null };

/** Corpo (sem saudação) do texto WhatsApp da pílula, com deep-link no formato preferido. */
export function textoPilulaWhatsapp(e: any, opts: PilulaOpts): string {
  const link = deepLinkSemana(opts.baseUrl, opts.semana, opts.formato, opts.pilula, 'whatsapp');
  return `Seu ${labelFormato(opts.formato)} de hoje: *${temaPilula(e)}*.\n\n👉 ${link}`;
}

/** Assunto + HTML do e-mail da pílula (espelho do WhatsApp, com botão pro deep-link). */
export function emailPilula(nome: string, e: any, opts: PilulaOpts): { subject: string; html: string } {
  const c = copiaEmail(opts.locale);
  const tema = temaPilula(e, c.temaPadrao);
  const link = deepLinkSemana(opts.baseUrl, opts.semana, opts.formato, opts.pilula, 'email');
  const primeiro = primeiroNomeEmail(nome, c);
  const v = { semana: opts.semana, tema };
  // Assunto é texto (sem escape); o corpo é HTML e o `preencher` escapa o que vem do banco.
  const subject = preencher(c.pilula.assunto, v, 'texto');
  const html = `<div style="font-family:system-ui,Arial,sans-serif;max-width:520px;margin:0 auto;color:#1a1a1a;line-height:1.55">
<p>${preencher(c.saudacao, { nome: primeiro })}</p>
<p>${preencher(c.pilula.intro, v)}</p>
<p>${preencher(c.pilula.formatoDoDia, { ...v, formato: labelFormatoEmail(opts.formato, opts.locale) })}</p>
<p style="margin:24px 0"><a href="${link}" style="background:#4338ca;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">${c.pilula.cta}</a></p>
<p style="color:#666;font-size:14px">${c.pilula.nota}</p>
<p style="color:#666;font-size:14px">${c.assinatura}</p>
${rodapePrivacidadeHtml(opts.baseUrl, opts.locale)}</div>`;
  return { subject, html };
}

/**
 * Assunto + HTML do e-mail da EVIDÊNCIA de quinta.
 *
 * Existe desde 14/08/2026, quando a quinta deixou de ser monocanal. Até ali a
 * evidência só saía por WhatsApp — e no dia 13 a instância caiu no meio do
 * disparo, deixando 30 de 36 pessoas sem nada, todas com e-mail cadastrado.
 *
 * A copy é a mesma do template aprovado da Meta (`lib/whatsapp/templates.ts`,
 * `evidencia_semanal`), em tom factual: afirma o que está pendente na conta da
 * pessoa e para que serve. Isso não é só coerência de marca — é o que mantém a
 * mensagem na categoria UTILITY quando ela sai pelo WhatsApp oficial, e canal
 * diferente com promessa diferente é como o produto começa a se contradizer.
 */
export function emailEvidencia(
  nome: string,
  opts: { semana: number; baseUrl: string; locale?: AppLocale | null },
): { subject: string; html: string } {
  const c = copiaEmail(opts.locale);
  const link = deepLinkSemana(opts.baseUrl, opts.semana);
  const primeiro = primeiroNomeEmail(nome, c);
  const v = { semana: opts.semana };
  const subject = preencher(c.evidencia.assunto, v, 'texto');
  const html = `<div style="font-family:system-ui,Arial,sans-serif;max-width:520px;margin:0 auto;color:#1a1a1a;line-height:1.55">
<p>${preencher(c.saudacaoPonto, { nome: primeiro })}</p>
<p>${preencher(c.evidencia.intro, v)}</p>
<p>${c.evidencia.pendente}</p>
<p style="margin:24px 0"><a href="${link}" style="background:#4338ca;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">${c.evidencia.cta}</a></p>
<p style="color:#666;font-size:14px">${c.evidencia.nota}</p>
<p style="color:#666;font-size:14px">${c.assinatura}</p>
${rodapePrivacidadeHtml(opts.baseUrl, opts.locale)}</div>`;
  return { subject, html };
}

/**
 * Assunto + HTML do e-mail da semana da AVALIAÇÃO FINAL (Cenário B), nos dois
 * momentos da cadência: `abertura` (segunda) e `cobranca` (quinta). R-89,
 * 03/10/2026.
 *
 * Até aqui a quinta dessa semana mandava o `emailEvidencia`, que diz "o
 * registro de evidências desta semana está pendente" e promete ajustar "as
 * próximas semanas da sua trilha", que não existem: a semana do Cenário B é a
 * última. A copy segue a do template `avaliacao_final_pendente` (os nomes são
 * os da TELA: "avaliação final" e "Relatório de Evolução"), em tom factual.
 *
 * Só sai para quem tem a avaliação final como semana acessível, ou seja, com
 * as semanas de conteúdo concluídas: é isso que torna a primeira frase
 * verdadeira.
 */
export function emailAvaliacaoFinal(
  nome: string,
  opts: { semana: number; baseUrl: string; momento: 'abertura' | 'cobranca'; locale?: AppLocale | null },
): { subject: string; html: string } {
  const c = copiaEmail(opts.locale);
  const link = deepLinkSemana(opts.baseUrl, opts.semana);
  const primeiro = primeiroNomeEmail(nome, c);
  const abertura = opts.momento === 'abertura';
  const subject = abertura ? c.avaliacaoFinal.assuntoAbertura : c.avaliacaoFinal.assuntoCobranca;
  // As duas frases são inteiras em cada idioma (não um começo comum mais um
  // final): a ordem das palavras muda de língua para língua.
  const estado = abertura ? c.avaliacaoFinal.introAbertura : c.avaliacaoFinal.introCobranca;
  const html = `<div style="font-family:system-ui,Arial,sans-serif;max-width:520px;margin:0 auto;color:#1a1a1a;line-height:1.55">
<p>${preencher(c.saudacaoPonto, { nome: primeiro })}</p>
<p>${estado}</p>
<p style="margin:24px 0"><a href="${link}" style="background:#4338ca;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">${c.avaliacaoFinal.cta}</a></p>
<p style="color:#666;font-size:14px">${c.avaliacaoFinal.nota}</p>
<p style="color:#666;font-size:14px">${c.assinatura}</p>
${rodapePrivacidadeHtml(opts.baseUrl, opts.locale)}</div>`;
  return { subject, html };
}

/**
 * Envia e-mail pelo provedor configurado. NUNCA lança — devolve {ok, reason}.
 *
 * `meta` é o contexto de negócio para a telemetria de entrega (mig 198) e não
 * afeta o envio. Sem ele a linha ainda é gravada, com `kind` nulo — lacuna
 * contável (`WHERE kind IS NULL`), nunca ausência silenciosa. Ver
 * `lib/notifications/delivery-log.ts`.
 */
export async function enviarEmailPilula(
  to: string,
  subject: string,
  html: string,
  meta?: { kind?: string | null; empresaId?: string | null; colaboradorId?: string | null; dedupeKey?: string | null },
): Promise<{ ok: boolean; reason?: string }> {
  const registrar = async (ok: boolean, reason?: string, providerMessageId?: string) => {
    await registrarEntrega({
      canal: 'email',
      status: ok ? 'sucesso' : 'falha',
      kind: meta?.kind ?? null,
      empresaId: meta?.empresaId ?? null,
      colaboradorId: meta?.colaboradorId ?? null,
      provider: emailProviderName(),
      error: ok ? null : (reason ?? null),
      dedupeKey: meta?.dedupeKey ?? null,
      providerMessageId: providerMessageId ?? null,
    });
  };

  const configError = emailConfigurationError();
  if (configError) {
    await registrar(false, configError);
    return { ok: false, reason: configError };
  }
  try {
    const r = await sendEmail({ from: EMAIL_FROM_DEFAULT, to, subject, html });
    if (!r.ok) {
      const reason = String(r.error || 'Falha ao enviar e-mail').slice(0, 160);
      await registrar(false, reason);
      return { ok: false, reason };
    }
    await registrar(true, undefined, r.messageId);
    return { ok: true };
  } catch (e: any) {
    const reason = String(e?.message || e);
    await registrar(false, reason);
    return { ok: false, reason };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MISSÃO (semana de aplicação 4/8/12): envio de SEGUNDA.
//
// A semana de aplicação não tem pílula — até 03/08/2026 a coorte ficava sem
// contato nenhum até a evidência de quinta e descobria a missão por conta
// (medido: 36/36 "sem envio" na segunda da semana 4 da Ibipeba). Agora a
// segunda abre a semana: texto padrão + vídeo explicativo (o MESMO tutorial
// do week page) + deep-link para a missão.
// ═══════════════════════════════════════════════════════════════════════════════

export type MissaoOpts = {
  semana: number;
  baseUrl: string;
  /** `missao.acao_principal` (já normalizada) — entra como resumo quando existe. */
  acaoPrincipal?: string | null;
  /** Idioma do destinatário do E-MAIL (o WhatsApp da missão segue em pt-BR). */
  locale?: AppLocale | null;
};

/** Página pública do vídeo tutorial da missão (preview rico no WhatsApp via OG). */
export function videoUrlMissao(baseUrl: string): string {
  return `${baseUrl}/v/${APLICACAO_VIDEO_ID}`;
}

/** Texto padrão do WhatsApp da missão: link da semana + vídeo explicativo. */
export function templateWhatsAppMissao(nome: string, opts: MissaoOpts): string {
  const link = deepLinkSemana(opts.baseUrl, opts.semana);
  const resumo = opts.acaoPrincipal ? `\n\nSua missão, em resumo: _${opts.acaoPrincipal}_` : '';
  return `Olá, ${nome}!

*Semana ${opts.semana} — Missão de Aplicação*

Esta semana não tem pílula nova: é hora de colocar em prática o que você vem aprendendo, com uma *missão* feita para o seu dia a dia.${resumo}

Sua missão completa está na plataforma:
${link}

E este vídeo explica como a semana funciona:
${videoUrlMissao(opts.baseUrl)}

Na quinta a Mentora IA vai querer saber como foi. Boa prática!
— Equipe Vertho`;
}

/** Assunto + HTML do e-mail da missão (botão pro deep-link + thumbnail do vídeo). */
export function emailMissao(nome: string, opts: MissaoOpts): { subject: string; html: string } {
  const c = copiaEmail(opts.locale);
  const link = deepLinkSemana(opts.baseUrl, opts.semana);
  const video = videoUrlMissao(opts.baseUrl);
  const thumb = `${opts.baseUrl}/api/bunny-thumb/${APLICACAO_VIDEO_ID}`;
  const primeiro = primeiroNomeEmail(nome, c);
  const v = { semana: opts.semana };
  const subject = preencher(c.missao.assunto, v, 'texto');
  // O resumo vem do plano (IA/banco): fica no idioma em que foi gerado e é escapado.
  const resumo = opts.acaoPrincipal
    ? `<p>${preencher(c.missao.resumo, { acao: opts.acaoPrincipal })}</p>` : '';
  const html = `<div style="font-family:system-ui,Arial,sans-serif;max-width:520px;margin:0 auto;color:#1a1a1a;line-height:1.55">
<p>${preencher(c.saudacao, { nome: primeiro })}</p>
<p>${preencher(c.missao.intro, v)}</p>
<p>${c.missao.semConteudoNovo}</p>
${resumo}
<p style="margin:24px 0"><a href="${link}" style="background:#4338ca;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">${c.missao.cta}</a></p>
<p>${c.missao.videoIntro}</p>
<p style="margin:16px 0"><a href="${video}"><img src="${thumb}" alt="${c.missao.videoAlt}" width="480" style="width:100%;max-width:480px;border-radius:8px;display:block" /></a></p>
<p style="color:#666;font-size:14px">${c.missao.nota}</p>
<p style="color:#666;font-size:14px">${c.assinatura}</p>
${rodapePrivacidadeHtml(opts.baseUrl, opts.locale)}</div>`;
  return { subject, html };
}

// ═══════════════════════════════════════════════════════════════════════════════
// SEMANA PENDENTE: o e-mail que acompanha o template `semana_pendente_v2`.
//
// 🔴 POR QUE O E-MAIL TAMBÉM MUDA, e não só o WhatsApp. Nas duas coortes,
// 74/74 têm e-mail (medido 25/08/2026). Se o WhatsApp dissesse "a semana 1
// continua pendente" e o e-mail do mesmo dia dissesse "o conteúdo da semana 1
// está disponível", o segundo REFORÇARIA a crença que trava essas pessoas — a
// de que abrir o conteúdo conclui a semana. Um canal desfazendo o outro é pior
// que os dois calados.
//
// A substância é a MESMA das três copies (WhatsApp, e-mail, push), de propósito:
// a pessoa recebe a mesma coisa por caminhos diferentes e reconhece que é uma
// coisa só. Onde elas divergem é no que o meio permite — o WhatsApp leva botão
// pelo `app.vertho.ai/ir/…` (a Meta só aceita variável no fim de URL fixa), o
// e-mail leva o link do TENANT direto.
// ═══════════════════════════════════════════════════════════════════════════════

export type SemanaPendenteOpts = {
  /** Semana do CALENDÁRIO — onde a trilha está. */
  semana: number;
  /** Semana que precisa ser concluída para destravar — o destino do link. */
  semanaPendente: number;
  baseUrl: string;
  /** Idioma do destinatário do e-mail. */
  locale?: AppLocale | null;
};

/**
 * Assunto + HTML do e-mail da semana pendente.
 *
 * 🔴 O LINK VAI PARA A PENDENTE, NUNCA PARA A DO CALENDÁRIO. Mandar para a
 * semana trancada é o defeito que esta mensagem existe para corrigir: a pessoa
 * cairia na mesma porta fechada, agora vinda de um e-mail que acabou de dizer
 * que ela está travada.
 */
/**
 * SEGUNDA de quem está travado: o conteúdo da semana E a pendência dela.
 *
 * Espelha o corpo do template `conteudo_semana_pendente` (mesma ordem, mesmas
 * afirmações). Não é coerência de marca apenas: canal dizendo uma coisa e
 * template dizendo outra é como o produto se contradiz na mesma manhã, e é a
 * razão de a chave única ligar os três canais de uma vez.
 *
 * A frase "abrir o conteúdo não conclui a semana" existe SÓ no e-mail e no push
 * (o template do WhatsApp não a traz) porque aqui não há revisão da Meta nem
 * limite de corpo — e é ela que ataca de frente a crença que trava essas
 * pessoas. Mesmo precedente do `emailSemanaPendente`.
 */
export function emailPilulaPendente(
  nome: string,
  e: any,
  opts: PilulaOpts,
): { subject: string; html: string } {
  const c = copiaEmail(opts.locale);
  const tema = temaPilula(e, c.temaPadrao);
  const link = deepLinkSemana(opts.baseUrl, opts.semana, opts.formato, opts.pilula);
  const primeiro = primeiroNomeEmail(nome, c);
  const v = { semana: opts.semana, tema };
  const subject = preencher(c.pilulaPendente.assunto, v, 'texto');
  const html = `<div style="font-family:system-ui,Arial,sans-serif;max-width:520px;margin:0 auto;color:#1a1a1a;line-height:1.55">
<p>${preencher(c.saudacaoPonto, { nome: primeiro })}</p>
<p>${preencher(c.pilulaPendente.intro, v)}</p>
<p>${preencher(c.pilulaPendente.tema, v)}</p>
<p>${c.pilulaPendente.explicacao}</p>
<p style="margin:24px 0"><a href="${link}" style="background:#4338ca;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">${preencher(c.pilulaPendente.cta, v)}</a></p>
<p style="color:#666;font-size:14px">${c.assinatura}</p>
${rodapePrivacidadeHtml(opts.baseUrl, opts.locale)}</div>`;
  return { subject, html };
}

export function emailSemanaPendente(
  nome: string,
  opts: SemanaPendenteOpts,
): { subject: string; html: string } {
  const c = copiaEmail(opts.locale);
  const link = deepLinkSemana(opts.baseUrl, opts.semanaPendente);
  const primeiro = primeiroNomeEmail(nome, c);
  const v = { semana: opts.semana, semanaPendente: opts.semanaPendente };
  const subject = preencher(c.semanaPendente.assunto, v, 'texto');
  const html = `<div style="font-family:system-ui,Arial,sans-serif;max-width:520px;margin:0 auto;color:#1a1a1a;line-height:1.55">
<p>${preencher(c.saudacaoPonto, { nome: primeiro })}</p>
<p>${preencher(c.semanaPendente.intro, v)}</p>
<p>${c.semanaPendente.explicacao}</p>
<p style="margin:24px 0"><a href="${link}" style="background:#4338ca;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">${preencher(c.semanaPendente.cta, v)}</a></p>
<p style="color:#666;font-size:14px">${c.assinatura}</p>
${rodapePrivacidadeHtml(opts.baseUrl, opts.locale)}</div>`;
  return { subject, html };
}
