/**
 * Builders + envio da PÍLULA semanal (conteúdo do dia da trilha), compartilhados
 * entre o cron `triggerDiario` (actions/cron-jobs.ts) e disparos manuais.
 *
 * A pílula NÃO carrega o arquivo do conteúdo — ela leva um DEEP-LINK que abre o
 * app no formato PREFERIDO do colaborador (os demais formatos ficam disponíveis
 * lá dentro). O link usa a URL do TENANT (ex.: ibipeba.vertho.ai), não a genérica.
 *
 * Canais: WhatsApp (texto) + e-mail (Resend). Ambos com o mesmo tema/formato.
 */

import { EMAIL_FROM_DEFAULT } from '@/lib/domain';
import { registrarEntrega } from '@/lib/notifications/delivery-log';
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

/** Tema da pílula ("competência — descritor") a partir de um item de conteudos_dia. */
export function temaPilula(e: any): string {
  const comp = e?.competencia ? String(e.competencia).trim() : '';
  const desc = e?.descritor ? descritorParaHumano(String(e.descritor).trim()) : '';
  const titulo = e?.conteudo?.core_titulo || e?.conteudo?.titulo || '';
  return [comp, desc].filter(Boolean).join(' — ') || titulo || 'novo conteúdo da semana';
}

/**
 * Deep-link da semana no tenant, já no formato preferido. `baseUrl` = ex.
 * https://ibipeba.vertho.ai. `pilula` (1|2) marca de qual pílula DUO veio o clique,
 * pra atribuição de abertura (`?p=`); ausente = abertura direta/navegação.
 */
export function deepLinkSemana(baseUrl: string, semana: number, formato?: string | null, pilula?: number | null): string {
  const params = new URLSearchParams();
  if (formato) params.set('formato', formato);
  if (pilula) params.set('p', String(pilula));
  const qs = params.toString();
  return `${baseUrl}/dashboard/temporada/semana/${semana}${qs ? `?${qs}` : ''}`;
}

type PilulaOpts = { formato?: string | null; semana: number; baseUrl: string; pilula?: number | null };

/** Corpo (sem saudação) do texto WhatsApp da pílula, com deep-link no formato preferido. */
export function textoPilulaWhatsapp(e: any, opts: PilulaOpts): string {
  const link = deepLinkSemana(opts.baseUrl, opts.semana, opts.formato, opts.pilula);
  return `Seu ${labelFormato(opts.formato)} de hoje: *${temaPilula(e)}*.\n\n👉 ${link}`;
}

/** Assunto + HTML do e-mail da pílula (espelho do WhatsApp, com botão pro deep-link). */
export function emailPilula(nome: string, e: any, opts: PilulaOpts): { subject: string; html: string } {
  const tema = temaPilula(e);
  const link = deepLinkSemana(opts.baseUrl, opts.semana, opts.formato, opts.pilula);
  const primeiro = (nome || 'Colaborador').split(' ')[0];
  const subject = `Sua pílula da Semana ${opts.semana} — ${tema}`;
  const html = `<div style="font-family:system-ui,Arial,sans-serif;max-width:520px;margin:0 auto;color:#1a1a1a;line-height:1.55">
<p>Olá, ${primeiro}! 📚</p>
<p>Sua <strong>Pílula de Aprendizagem — Semana ${opts.semana}</strong> já está disponível.</p>
<p>Seu <strong>${labelFormato(opts.formato)}</strong> de hoje: <strong>${tema}</strong>.</p>
<p style="margin:24px 0"><a href="${link}" style="background:#4338ca;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">Acessar minha pílula →</a></p>
<p style="color:#666;font-size:14px">Todos os formatos ficam disponíveis na plataforma.</p>
<p style="color:#666;font-size:14px">— Equipe Vertho</p></div>`;
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
  opts: { semana: number; baseUrl: string },
): { subject: string; html: string } {
  const link = deepLinkSemana(opts.baseUrl, opts.semana);
  const primeiro = (nome || 'Colaborador').split(' ')[0];
  const subject = `Registro da Semana ${opts.semana} — pendente`;
  const html = `<div style="font-family:system-ui,Arial,sans-serif;max-width:520px;margin:0 auto;color:#1a1a1a;line-height:1.55">
<p>Olá, ${primeiro}.</p>
<p>Você está na <strong>semana ${opts.semana}</strong> da sua trilha de desenvolvimento.</p>
<p>O registro de evidências desta semana está <strong>pendente</strong>.</p>
<p style="margin:24px 0"><a href="${link}" style="background:#4338ca;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">Registrar minha evidência →</a></p>
<p style="color:#666;font-size:14px">As evidências registradas são usadas para ajustar as próximas semanas da sua trilha.</p>
<p style="color:#666;font-size:14px">— Equipe Vertho</p></div>`;
  return { subject, html };
}

/**
 * Envia e-mail via Resend. NUNCA lança — devolve {ok, reason}.
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
  const registrar = async (ok: boolean, reason?: string) => {
    await registrarEntrega({
      canal: 'email',
      status: ok ? 'sucesso' : 'falha',
      kind: meta?.kind ?? null,
      empresaId: meta?.empresaId ?? null,
      colaboradorId: meta?.colaboradorId ?? null,
      provider: 'resend',
      error: ok ? null : (reason ?? null),
      dedupeKey: meta?.dedupeKey ?? null,
    });
  };

  const key = process.env.RESEND_API_KEY;
  if (!key) {
    await registrar(false, 'sem RESEND_API_KEY');
    return { ok: false, reason: 'sem RESEND_API_KEY' };
  }
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ from: EMAIL_FROM_DEFAULT, to, subject, html }),
    });
    if (!r.ok) {
      const reason = `${r.status} ${(await r.text()).slice(0, 120)}`;
      await registrar(false, reason);
      return { ok: false, reason };
    }
    await registrar(true);
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
  const link = deepLinkSemana(opts.baseUrl, opts.semana);
  const video = videoUrlMissao(opts.baseUrl);
  const thumb = `${opts.baseUrl}/api/bunny-thumb/${APLICACAO_VIDEO_ID}`;
  const primeiro = (nome || 'Colaborador').split(' ')[0];
  const subject = `Semana ${opts.semana} — sua Missão de Aplicação`;
  const resumo = opts.acaoPrincipal
    ? `<p>Sua missão, em resumo: <em>${opts.acaoPrincipal}</em></p>` : '';
  const html = `<div style="font-family:system-ui,Arial,sans-serif;max-width:520px;margin:0 auto;color:#1a1a1a;line-height:1.55">
<p>Olá, ${primeiro}!</p>
<p>Chegou a <strong>Semana ${opts.semana} — Missão de Aplicação</strong>.</p>
<p>Esta semana não tem pílula nova: é hora de colocar em prática o que você vem aprendendo, com uma <strong>missão</strong> feita para o seu dia a dia.</p>
${resumo}
<p style="margin:24px 0"><a href="${link}" style="background:#4338ca;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">Ver minha missão →</a></p>
<p>E este vídeo explica como a semana funciona:</p>
<p style="margin:16px 0"><a href="${video}"><img src="${thumb}" alt="Vídeo explicativo da semana" width="480" style="width:100%;max-width:480px;border-radius:8px;display:block" /></a></p>
<p style="color:#666;font-size:14px">Na quinta a Mentora IA vai querer saber como foi. Boa prática!</p>
<p style="color:#666;font-size:14px">— Equipe Vertho</p></div>`;
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
  const tema = temaPilula(e);
  const link = deepLinkSemana(opts.baseUrl, opts.semana, opts.formato, opts.pilula);
  const primeiro = (nome || 'Colaborador').split(' ')[0];
  const subject = `Semana ${opts.semana} — ${tema} (pendente)`;
  const html = `<div style="font-family:system-ui,Arial,sans-serif;max-width:520px;margin:0 auto;color:#1a1a1a;line-height:1.55">
<p>Olá, ${primeiro}.</p>
<p>O conteúdo da <strong>semana ${opts.semana}</strong> da sua trilha está disponível.</p>
<p>Tema: <strong>${tema}</strong>.</p>
<p>Esta semana continua <strong>pendente</strong>: ela somente é concluída na <strong>conversa de evidências</strong> — abrir o conteúdo não conclui a semana.</p>
<p style="margin:24px 0"><a href="${link}" style="background:#4338ca;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">Abrir a semana ${opts.semana} →</a></p>
<p style="color:#666;font-size:14px">— Equipe Vertho</p></div>`;
  return { subject, html };
}

export function emailSemanaPendente(
  nome: string,
  opts: SemanaPendenteOpts,
): { subject: string; html: string } {
  const link = deepLinkSemana(opts.baseUrl, opts.semanaPendente);
  const primeiro = (nome || 'Colaborador').split(' ')[0];
  const subject = `Semana ${opts.semanaPendente} — pendente na sua trilha`;
  const html = `<div style="font-family:system-ui,Arial,sans-serif;max-width:520px;margin:0 auto;color:#1a1a1a;line-height:1.55">
<p>Olá, ${primeiro}.</p>
<p>Sua trilha está na <strong>semana ${opts.semana}</strong>, e a <strong>semana ${opts.semanaPendente}</strong> continua pendente.</p>
<p>Ela somente é concluída na <strong>conversa de evidências</strong> — abrir o conteúdo não conclui a semana. A explicação em vídeo está na página da semana.</p>
<p style="margin:24px 0"><a href="${link}" style="background:#4338ca;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">Abrir a semana ${opts.semanaPendente} →</a></p>
<p style="color:#666;font-size:14px">— Equipe Vertho</p></div>`;
  return { subject, html };
}
