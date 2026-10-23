// Aviso de 60 dias sem movimentação (contrato do RC v6, cláusula 7.5): um
// e-mail por representante, uma vez por ciclo de proteção. Roda no cron diário
// `alerta_protecao_rc`. O aviso também aparece no painel do portal
// (`getOpportunityAlerts`), que não depende deste e-mail.
//
// Ciclo: `aviso_60_em` marca o e-mail enviado e volta a NULL a cada movimentação
// (`registrarMovimentacao`), então a mesma oportunidade só recebe outro aviso
// depois de se mover e parar de novo.
import type { createSupabaseAdmin } from '@/lib/supabase';
import { sendEmail } from '@/lib/email-provider';
import { APP_URL, EMAIL_FROM_DEFAULT } from '@/lib/domain';
import { escaparHtml } from '@/lib/i18n-email-templates';
import { dataBRT } from '@/lib/dre/semana';
import { AVISO_SEM_MOVIMENTO_DIAS, dataCurtaBRT } from './registro';

type Sb = ReturnType<typeof createSupabaseAdmin>;

const DIA_MS = 24 * 60 * 60 * 1000;

/**
 * RCs fictícios (seed de demonstração e exemplo dos documentos): as caixas não
 * existem, e o e-mail voltaria como bounce, que pesa na reputação do remetente.
 */
export function ehRcFicticio(email: string | null | undefined): boolean {
  return /^(demo-rc-[a-z0-9.-]+|exemplo-doc)@vertho\.ai$/i.test(String(email || '').trim());
}

type OppDoAviso = {
  id: string;
  representante_id: string;
  opportunity_name: string;
  last_movement_at: string;
  protection_end_date: string | null;
  account: { legal_name: string | null; trade_name: string | null } | { legal_name: string | null; trade_name: string | null }[] | null;
};

const dataBR = (valor: string | null | undefined) => (valor ? dataCurtaBRT(valor) : '');

/** Corpo do e-mail ao RC. Puro, para o teste ler o texto que sai. */
export function emailDoAviso(nome: string, opps: OppDoAviso[]): { subject: string; html: string; text: string } {
  const n = opps.length;
  const subject = n === 1
    ? 'Proteção comercial: 1 oportunidade sem movimentação há 60 dias'
    : `Proteção comercial: ${n} oportunidades sem movimentação há 60 dias`;
  const linhas = opps.map((o) => {
    const conta = Array.isArray(o.account) ? o.account[0] : o.account;
    const cliente = conta?.trade_name || conta?.legal_name || '';
    return {
      texto: `${o.opportunity_name}${cliente ? ` (${cliente})` : ''}: última movimentação em ${dataBR(o.last_movement_at)}, proteção até ${dataBR(o.protection_end_date)}`,
      href: `${APP_URL}/representante/crm/${o.id}`,
    };
  });
  const intro = `Olá, ${nome}. ${n === 1 ? 'Esta oportunidade está' : 'Estas oportunidades estão'} há 60 dias sem movimentação. `
    + 'Pelo contrato (cláusula 7.5), a proteção comercial acaba aos 90 dias sem movimentação, e o cliente fica livre para outro representante. '
    + 'Registre um contato com evidência, mude o estágio ou envie uma proposta para manter a proteção.';
  const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#0b2138;line-height:1.5">`
    + `<p>${escaparHtml(intro)}</p><ul>`
    + linhas.map((l) => `<li><a href="${escaparHtml(l.href)}">${escaparHtml(l.texto)}</a></li>`).join('')
    + `</ul><p style="color:#5b6b7f;font-size:12px">Portal do Representante vertho.ai</p></div>`;
  const text = `${intro}\n\n${linhas.map((l) => `- ${l.texto}\n  ${l.href}`).join('\n')}\n\nPortal do Representante vertho.ai`;
  return { subject, html, text };
}

export type ResultadoAvisoProtecao = { representantes: number; oportunidades: number; falhas: string[]; message: string };

/**
 * Envia o aviso a cada RC ativo com oportunidade aberta, validada, ainda
 * protegida e com 60 dias ou mais sem movimentação. Marca `aviso_60_em` só
 * depois do envio que deu certo. Erro de leitura lança (cron vira 500).
 */
export async function enviarAvisosDeProtecao(sb: Sb, agora: Date = new Date()): Promise<ResultadoAvisoProtecao> {
  const limite = new Date(agora.getTime() - AVISO_SEM_MOVIMENTO_DIAS * DIA_MS).toISOString();
  const hoje = dataBRT(agora);
  const { data, error } = await sb.from('sales_opportunities')
    .select('id, representante_id, opportunity_name, last_movement_at, protection_end_date, account:sales_accounts (legal_name, trade_name)')
    .eq('status', 'open').eq('attribution_status', 'validada')
    .is('aviso_60_em', null)
    .lte('last_movement_at', limite)
    .gte('protection_end_date', hoje);
  if (error) throw new Error(`alerta_protecao_rc: leitura das oportunidades falhou: ${error.message}`);
  const opps = (data || []) as OppDoAviso[];
  if (!opps.length) return { representantes: 0, oportunidades: 0, falhas: [], message: 'Nenhuma oportunidade com 60 dias sem movimentação' };

  const repIds = [...new Set(opps.map((o) => o.representante_id))];
  const { data: reps, error: erroReps } = await sb.from('sales_representatives')
    .select('id, name, email, status').in('id', repIds);
  if (erroReps) throw new Error(`alerta_protecao_rc: leitura dos representantes falhou: ${erroReps.message}`);
  // A equipe ativa do RC (21.4) recebe junto: quem opera o portal precisa saber.
  const { data: equipe, error: erroEquipe } = await sb.from('sales_representative_users')
    .select('representante_id, email').in('representante_id', repIds).eq('status', 'active');
  if (erroEquipe) throw new Error(`alerta_protecao_rc: leitura da equipe falhou: ${erroEquipe.message}`);

  const falhas: string[] = [];
  let enviados = 0;
  let marcadas = 0;
  for (const rep of (reps || []) as { id: string; name: string; email: string; status: string }[]) {
    if (rep.status !== 'active' || !rep.email || ehRcFicticio(rep.email)) continue;
    const doRep = opps.filter((o) => o.representante_id === rep.id);
    const email = emailDoAviso(rep.name.split(' ')[0] || rep.name, doRep);
    const destinatarios = [rep.email, ...((equipe || []) as { representante_id: string; email: string }[])
      .filter((m) => m.representante_id === rep.id && !ehRcFicticio(m.email)).map((m) => m.email)];
    const r = await sendEmail({ from: EMAIL_FROM_DEFAULT, to: destinatarios, ...email });
    if (!r.ok) { falhas.push(`${rep.id}: ${r.error || 'falha no envio'}`); continue; }
    enviados++;
    const { error: erroMarca } = await sb.from('sales_opportunities')
      .update({ aviso_60_em: agora.toISOString() }).in('id', doRep.map((o) => o.id));
    // Sem a marca, o aviso sai de novo amanhã: incômodo, não perda. Vai para as falhas.
    if (erroMarca) falhas.push(`${rep.id}: aviso enviado sem marcar (${erroMarca.message})`);
    else marcadas += doRep.length;
  }
  return {
    representantes: enviados,
    oportunidades: marcadas,
    falhas,
    message: `Aviso de 60 dias: ${enviados} representante(s), ${marcadas} oportunidade(s)${falhas.length ? `, ${falhas.length} falha(s)` : ''}`,
  };
}
