/* eslint-disable */
// DISPARO PONTUAL (03/08/2026): anúncio da MISSÃO da semana 4 de Ibipeba.
//
// Por que existe: o envio de segunda da semana de aplicação entrou no
// triggerDiario DEPOIS do cron das 11:00 UTC de hoje já ter rodado (e o lock
// diário bloqueia re-execução). Este script faz UMA vez o que o cron fará
// toda segunda de semana 4/8/12 — espelha o branch de missão do
// triggerDiario: mesmos templates, mesmo carimbo por canal (idempotente).
//
// Uso:  npx tsx scripts/_enviar-missao-semana4-ibipeba.ts            (dry-run)
//       npx tsx scripts/_enviar-missao-semana4-ibipeba.ts --executar
process.loadEnvFile('.env.local');
import { createSupabaseAdmin } from '@/lib/supabase';
import { normalizeTemporadaPlano } from '@/lib/season-engine/normalize-temporada-plano';
import { templateWhatsAppMissao, emailMissao, enviarEmailPilula } from '@/lib/notifications/pilula-envio';
import { mesmoDiaUTC } from '@/lib/notifications/carimbo-canal';
import { APP_WEBHOOK_URL, QSTASH_BASE_URL, tenantUrl } from '@/lib/domain';
import { assertWhatsappAvailable } from '@/lib/whatsapp';
import { atrasosDoLote } from '@/lib/whatsapp/cadencia';

const EMP = '0d99fed1-1710-40e3-b32e-7a95c7d023fe'; // ibipeba
const SEMANA = 4;
const EXECUTAR = process.argv.includes('--executar');

async function publishToQStash(payload: any, delaySec: number) {
  const token = process.env.QSTASH_TOKEN;
  if (!token) throw new Error('QSTASH_TOKEN não configurado');
  const res = await fetch(`${QSTASH_BASE_URL}/v2/publish/${APP_WEBHOOK_URL}/api/webhooks/qstash/whatsapp-cis`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'Upstash-Delay': `${delaySec}s` },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`QStash ${res.status}: ${(await res.text()).slice(0, 120)}`);
}

async function main() {
  const sb = createSupabaseAdmin();
  const hojeUTC = new Date().toISOString().slice(0, 10);
  const baseUrl = tenantUrl('ibipeba');

  const { data: envios } = await sb.from('fase4_envios')
    .select('id, colaborador_id, semana_atual, ultima_pilula1_whatsapp_em, ultima_pilula1_email_em, colaboradores!inner(nome_completo, whatsapp, telefone, email)')
    .eq('empresa_id', EMP).eq('status', 'ativo');
  const { data: trilhas } = await sb.from('trilhas')
    .select('colaborador_id, temporada_plano, numero_temporada').eq('empresa_id', EMP);
  const ultima = new Map<string, any>();
  for (const t of (trilhas as any[]) || []) {
    const p = ultima.get(t.colaborador_id);
    if (!p || Number(t.numero_temporada) > Number(p.numero_temporada)) ultima.set(t.colaborador_id, t);
  }

  let zap = 0, mail = 0, erros = 0, pulados = 0;
  const falhas: string[] = [];
  if (EXECUTAR) await assertWhatsappAvailable();

  // Atrasos pela política única. Aqui estava `i * 2` — 2s por mensagem, a taxa
  // exata que derrubou o número em 11/08. O `atrasosDoLote` aplica intervalo,
  // jitter e ordem monótona a partir de um lugar só.
  const atrasos = atrasosDoLote(((envios as any[]) || []).length);
  for (const [i, envio] of ((envios as any[]) || []).entries()) {
    const c = envio.colaboradores;
    const nome = c.nome_completo || 'Colaborador';
    if (Number(envio.semana_atual) !== SEMANA) { pulados++; continue; }
    const plano = ultima.get(envio.colaborador_id)?.temporada_plano || [];
    const plan = plano.find((s: any) => Number(s.semana) === SEMANA) || plano[SEMANA - 1];
    if (plan?.tipo !== 'aplicacao') { pulados++; console.log(`  pulado (semana não é aplicação): ${nome}`); continue; }

    let acaoPrincipal: string | null = null;
    try {
      const planoNorm = normalizeTemporadaPlano(plano);
      const planNorm = planoNorm.find((s: any) => Number(s.semana) === SEMANA) || planoNorm[SEMANA - 1];
      acaoPrincipal = planNorm?.missao?.acao_principal || null;
    } catch { /* sem resumo, segue o texto padrão */ }
    const opts = { semana: SEMANA, baseUrl, acaoPrincipal };
    const telefone = c.whatsapp || c.telefone;
    const agora = new Date().toISOString();
    const stamp: Record<string, string> = {};

    if (telefone && !mesmoDiaUTC(envio.ultima_pilula1_whatsapp_em, hojeUTC)) {
      if (EXECUTAR) {
        try {
          await publishToQStash({ telefone, mensagem: templateWhatsAppMissao(nome.split(' ')[0], opts) }, atrasos[i]);
          zap++; stamp.ultima_pilula1_whatsapp_em = agora;
        } catch (e: any) { erros++; falhas.push(`${nome} · zap · ${e?.message}`); }
      } else zap++;
    }
    if (c.email && !mesmoDiaUTC(envio.ultima_pilula1_email_em, hojeUTC)) {
      if (EXECUTAR) {
        const { subject, html } = emailMissao(nome, opts);
        const r = await enviarEmailPilula(c.email, subject, html);
        if (r.ok) { mail++; stamp.ultima_pilula1_email_em = agora; }
        else { erros++; falhas.push(`${nome} · email · ${r.reason}`); }
      } else mail++;
    }
    if (EXECUTAR && Object.keys(stamp).length) {
      await sb.from('fase4_envios').update({ ...stamp, ultima_pilula1_em: agora }).eq('id', envio.id);
    }
  }

  console.log(`\n${EXECUTAR ? 'ENVIADO' : 'DRY-RUN'} · semana ${SEMANA} · ibipeba`);
  console.log(`WhatsApp: ${zap} · e-mail: ${mail} · erros: ${erros} · pulados: ${pulados} · total envios: ${envios?.length}`);
  for (const f of falhas) console.log('  ❌', f);
}

main().catch((e) => { console.error('ERRO FATAL:', e?.message || e); process.exit(1); });
