// "A pílula de hoje saiu?" — respondido pelos CARIMBOS por canal + cron_execucoes,
// que são a prova de entrega (notification_deliveries.status='sucesso' só diz que o
// provedor ACEITOU). Ver project_jornada_quinta_perdida.
//
// Uso: node --env-file=.env.local scripts/_check-envios-dia.mjs --empresa=macae [--dia=YYYY-MM-DD]
import { createClient } from '@supabase/supabase-js';

const args = process.argv.slice(2);
const slug = args.find((a) => a.startsWith('--empresa='))?.split('=')[1] || 'macae';
const DIA = args.find((a) => a.startsWith('--dia='))?.split('=')[1]
  || new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10); // hoje em BRT

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

/** Data BRT (YYYY-MM-DD) de um timestamptz. */
const diaBRT = (ts) => (ts ? new Date(new Date(ts).getTime() - 3 * 3600_000).toISOString().slice(0, 10) : null);
const horaBRT = (ts) => (ts ? new Date(new Date(ts).getTime() - 3 * 3600_000).toISOString().slice(11, 16) : '—');

const { data: emp, error: eEmp } = await sb.from('empresas').select('id, nome, slug, sys_config').eq('slug', slug).maybeSingle();
if (eEmp) throw new Error(`empresas: ${eEmp.message}`);
if (!emp) throw new Error(`empresa ${slug} não encontrada`);

const cad = emp.sys_config?.cadencia || {};
const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const dowAlvo = new Date(DIA + 'T12:00:00Z').getUTCDay();
console.log(`\n=== ${emp.nome} (${slug}) · ${DIA} (${DIAS[dowAlvo]}) ===`);
console.log(`cadência: P1=${DIAS[cad.fase4_dia_pilula ?? 1]} · P2=${DIAS[cad.fase4_dia_pilula2 ?? 2]} · evidência=${DIAS[cad.fase4_dia_evidencia ?? 4]}`);

// ── 1. O cron rodou? (ausência de linha = não rodou)
const { data: crons, error: eCron } = await sb.from('cron_execucoes')
  .select('job, dia, iniciado_em, concluido_em, resultado')
  .gte('dia', new Date(Date.parse(DIA) - 6 * 86400_000).toISOString().slice(0, 10))
  .order('dia', { ascending: false });
if (eCron) throw new Error(`cron_execucoes: ${eCron.message}`);
console.log(`\n── cron_execucoes (7 dias) ──`);
for (const c of crons || []) {
  console.log(`  ${c.dia} ${c.job.padEnd(22)} ${horaBRT(c.iniciado_em)}→${horaBRT(c.concluido_em)}  ${String(c.resultado || '(sem resultado)').slice(0, 150)}`);
}
if (!(crons || []).some((c) => c.dia === DIA)) console.log(`  🔴 NENHUMA execução registrada em ${DIA}`);

// ── 2. Carimbos por canal em fase4_envios
const COLS = ['ultima_pilula1_whatsapp_em', 'ultima_pilula1_email_em', 'ultima_pilula1_push_em',
  'ultima_pilula2_whatsapp_em', 'ultima_pilula2_email_em', 'ultima_pilula2_push_em',
  'ultima_evidencia_whatsapp_em', 'ultima_evidencia_email_em', 'ultima_evidencia_push_em'];
const { data: envios, error: eEnv } = await sb.from('fase4_envios')
  .select(`colaborador_id, status, semana_atual, data_inicio, ultima_pilula1_em, ultima_pilula2_em, ultima_evidencia_em, ${COLS.join(', ')}, colaboradores!inner(nome_completo, email, whatsapp, telefone)`)
  .eq('empresa_id', emp.id);
if (eEnv) throw new Error(`fase4_envios: ${eEnv.message}`);

const ativos = (envios || []).filter((e) => e.status === 'ativo');
console.log(`\n── fase4_envios: ${envios.length} linhas (${ativos.length} ativas) ──`);
const porSemana = {};
for (const e of ativos) porSemana[e.semana_atual] = (porSemana[e.semana_atual] || 0) + 1;
console.log(`  semana_atual: ${Object.entries(porSemana).map(([s, n]) => `S${s}=${n}`).join(' · ') || '(nenhuma)'}`);

console.log(`\n── carimbos com data ${DIA} (BRT) ──`);
for (const col of COLS) {
  const n = ativos.filter((e) => diaBRT(e[col]) === DIA).length;
  const marca = n === 0 ? '   ' : n === ativos.length ? ' ✅' : ' ⚠️';
  console.log(`  ${col.padEnd(32)} ${String(n).padStart(3)}/${ativos.length}${marca}`);
}

// ── 3. Quem ficou de fora da P2 de hoje (qualquer canal)
const p2Cols = ['ultima_pilula2_whatsapp_em', 'ultima_pilula2_email_em', 'ultima_pilula2_push_em'];
const semP2 = ativos.filter((e) => !p2Cols.some((c) => diaBRT(e[c]) === DIA));
console.log(`\n── SEM P2 hoje em NENHUM canal: ${semP2.length}/${ativos.length} ──`);
for (const e of semP2.slice(0, 40)) {
  console.log(`  · ${e.colaboradores.nome_completo} (S${e.semana_atual}) — último P2: ${e.ultima_pilula2_em ? diaBRT(e.ultima_pilula2_em) : 'NUNCA'} · último P1: ${e.ultima_pilula1_em ? diaBRT(e.ultima_pilula1_em) : 'NUNCA'}`);
}
if (semP2.length > 40) console.log(`  ... +${semP2.length - 40}`);

// ── 4. Tentativas registradas hoje (inclui FALHAS, que o carimbo não conta)
const ini = new Date(DIA + 'T03:00:00Z').toISOString();
const fim = new Date(Date.parse(DIA + 'T03:00:00Z') + 86400_000).toISOString();
const { data: dels, error: eDel } = await sb.from('notification_deliveries')
  .select('channel, status, kind, error, sent_at, provider_status, delivered_at, opened_at, failed_at')
  .eq('empresa_id', emp.id).gte('sent_at', ini).lt('sent_at', fim);
if (eDel) throw new Error(`notification_deliveries: ${eDel.message}`);
console.log(`\n── notification_deliveries em ${DIA}: ${dels.length} linhas ──`);
const agg = {};
for (const d of dels) {
  const k = `${d.channel}/${d.kind || 'sem-kind'}/${d.status}`;
  agg[k] = (agg[k] || 0) + 1;
}
for (const [k, n] of Object.entries(agg).sort()) console.log(`  ${k.padEnd(40)} ${n}`);
const falhas = dels.filter((d) => d.status === 'falha');
for (const f of falhas.slice(0, 10)) console.log(`  🔴 falha ${f.channel}/${f.kind}: ${String(f.error || '').slice(0, 160)}`);

// ── 5. ENTREGA REAL do WhatsApp (carimbo = a Meta ACEITOU; quem prova entrega é o webhook de status)
const wpp = dels.filter((d) => d.channel === 'whatsapp' && d.kind === 'pilula');
if (wpp.length) {
  const ps = {};
  for (const d of wpp) ps[d.provider_status || '(sem status da Meta)'] = (ps[d.provider_status || '(sem status da Meta)'] || 0) + 1;
  console.log(`\n── WhatsApp/pílula: ${wpp.length} aceitas · status REAL da Meta ──`);
  for (const [k, n] of Object.entries(ps).sort()) console.log(`  ${k.padEnd(26)} ${n}`);
  console.log(`  entregues (delivered_at): ${wpp.filter((d) => d.delivered_at).length}/${wpp.length}`);
  console.log(`  lidas     (opened_at):    ${wpp.filter((d) => d.opened_at).length}/${wpp.length}`);
  console.log(`  falhadas  (failed_at):    ${wpp.filter((d) => d.failed_at).length}/${wpp.length}`);
}

// ── 6. Push: denominador é quem TEM endpoint ativo
const { data: eps } = await sb.from('notification_endpoints').select('colaborador_id').eq('empresa_id', emp.id).eq('enabled', true);
const comPush = new Set((eps || []).map((e) => e.colaborador_id));
const pushHoje = ativos.filter((e) => diaBRT(e.ultima_pilula2_push_em) === DIA).length;
console.log(`\n── push: ${comPush.size} endpoints ativos na empresa · ${ativos.filter((e) => comPush.has(e.colaborador_id)).length} entre os ativos da jornada · P2 hoje: ${pushHoje}`);
