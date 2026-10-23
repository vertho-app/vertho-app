import 'server-only';

/**
 * Envio do relatório por clínica (pacote de clínicas). Roda pelo cron de segunda às 07h (BRT,
 * `/api/cron?action=relatorio_clinicas`) e sob demanda pelo admin (semana de entrada: a lista de
 * pendentes não pode esperar a segunda).
 *
 * - Só empresas com `sys_config.pacote_clinicas` ligado; tenant de demonstração nunca envia.
 * - Destinatários: as contas de RH da empresa com e-mail REAL (o RH da onlabel só recebe relatórios).
 *   Sem nenhum, é falha: o relatório é o produto (mesma régua do `custo_ia_semanal`).
 * - Uma vez por dia por destinatário: a chave de deduplicação leva empresa, data de Brasília e e-mail,
 *   então o cron e o disparo sob demanda no mesmo dia não mandam em dobro.
 * - `envios_pausados` NÃO bloqueia: a pausa é das mensagens às secretárias, e este e-mail vai ao RH.
 */

import { tenantDb } from '@/lib/tenant-db';
import { excludeInternalEmails } from '@/lib/internal-emails';
import { isProxyEmail } from '@/lib/phone-otp';
import { pacoteClinicasLigado } from '@/lib/pacote-clinicas';
import { diaEmBrasilia } from '@/lib/notifications/envio-template-lote';
import { coletarDadosRelatorioClinicas } from './coletar';
import { montarRelatorioClinicas, htmlRelatorioClinicas, assuntoRelatorioClinicas, type ClinicaNoRelatorio } from './montar';

export const KIND_RELATORIO_CLINICAS = 'relatorio_clinicas';

const EMAIL_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i;

export interface ResultadoEmpresa {
  empresaId: string;
  empresa: string;
  clinicas: number;
  pessoas: number;
  pendentes: number;
  destinatarios: string[];
  enviados: string[];
  jaRecebidosHoje: string[];
  falhas: Array<{ para: string; motivo: string }>;
  erro?: string;
  /** Só na simulação: o e-mail montado, para conferir antes de enviar. */
  assunto?: string;
  html?: string;
  blocos?: ClinicaNoRelatorio[];
}

export function chaveDoEnvio(empresaId: string, hoje: string, para: string): string {
  return `${KIND_RELATORIO_CLINICAS}:${empresaId}:${hoje}:${para.toLowerCase()}`;
}

/**
 * @param sb cliente de servidor (o cron e a action passam o deles); só lê `empresas`, que é a
 *        própria linha do tenant. O resto é lido por `tenantDb`.
 * @param opts.empresaId restringe a uma empresa (disparo sob demanda).
 * @param opts.enviar false = simulação: monta e devolve o HTML, sem enviar nem registrar.
 */
export async function executarRelatorioClinicas(
  sb: any,
  opts: { empresaId?: string; agora?: Date; enviar?: boolean; enviarEmail?: (to: string, assunto: string, html: string, meta: any) => Promise<{ ok: boolean; reason?: string }> } = {},
): Promise<{ hoje: string; empresas: ResultadoEmpresa[] }> {
  const agora = opts.agora ?? new Date();
  const hoje = diaEmBrasilia(agora);
  const enviar = opts.enviar !== false;

  let q = sb.from('empresas').select('id, nome, is_demo, sys_config');
  if (opts.empresaId) q = q.eq('id', opts.empresaId);
  const { data: empresas, error } = await q;
  if (error) throw new Error(`relatório das clínicas: empresas: ${error.message}`);

  const resultados: ResultadoEmpresa[] = [];
  for (const emp of empresas || []) {
    if (!pacoteClinicasLigado(emp.sys_config) || emp.is_demo) continue;
    const r: ResultadoEmpresa = {
      empresaId: emp.id, empresa: emp.nome, clinicas: 0, pessoas: 0, pendentes: 0,
      destinatarios: [], enviados: [], jaRecebidosHoje: [], falhas: [],
    };
    resultados.push(r);
    try {
      const blocos = montarRelatorioClinicas(await coletarDadosRelatorioClinicas(emp.id), hoje);
      r.clinicas = blocos.length;
      r.pessoas = blocos.reduce((s, b) => s + b.totais.pessoas, 0);
      r.pendentes = blocos.reduce((s, b) => s + b.totais.pendentes, 0);
      const assunto = assuntoRelatorioClinicas(emp.nome, hoje);
      const html = htmlRelatorioClinicas(blocos, emp.nome, hoje);

      const tdb = tenantDb(emp.id);
      const { data: rh, error: eRh } = await excludeInternalEmails(tdb.from('colaboradores').select('email').eq('role', 'rh'));
      if (eRh) throw new Error(`contas de RH: ${eRh.message}`);
      const emails: string[] = ((rh || []) as any[])
        .map((c) => String(c.email || '').trim().toLowerCase())
        .filter((e) => EMAIL_VALIDO.test(e) && !isProxyEmail(e));
      r.destinatarios = [...new Set(emails)];

      if (!enviar) {
        Object.assign(r, { assunto, html, blocos });
        continue;
      }
      if (!r.destinatarios.length) {
        r.erro = 'nenhuma conta de RH com e-mail nesta empresa';
        continue;
      }

      const chaves = r.destinatarios.map((para) => chaveDoEnvio(emp.id, hoje, para));
      const { data: ja, error: eJa } = await tdb.from('notification_deliveries')
        .select('dedupe_key').eq('kind', KIND_RELATORIO_CLINICAS).eq('status', 'sucesso').in('dedupe_key', chaves);
      if (eJa) throw new Error(`envios de hoje: ${eJa.message}`);
      const recebidas = new Set((ja || []).map((d: any) => d.dedupe_key));

      const mandar = opts.enviarEmail ?? (await import('@/lib/notifications/pilula-envio')).enviarEmailPilula;
      for (const para of r.destinatarios) {
        const dedupeKey = chaveDoEnvio(emp.id, hoje, para);
        if (recebidas.has(dedupeKey)) { r.jaRecebidosHoje.push(para); continue; }
        const envio = await mandar(para, assunto, html, { kind: KIND_RELATORIO_CLINICAS, empresaId: emp.id, dedupeKey });
        if (envio.ok) r.enviados.push(para);
        else r.falhas.push({ para, motivo: envio.reason || 'falha no envio' });
      }
    } catch (e: any) {
      r.erro = e?.message || String(e);
    }
  }
  return { hoje, empresas: resultados };
}
