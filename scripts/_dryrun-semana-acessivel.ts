/* eslint-disable */
/**
 * O QUE A PÍLULA VAI ANUNCIAR — calendário × semana acessível, por pessoa.
 *
 * Roda a MESMA régua do envio (`avaliarAcessoSemana`) sobre a coorte ativa e
 * imprime o de-para. Existe porque a mudança de 23/08 altera o que 74 pessoas
 * recebem e o pré-voo não a enxerga: `coletarEntregasPrevistas` resolve a semana
 * pelo `fase4_envios.semana_atual` e continuaria medindo a régua antiga — o
 * "gêmeo que não roda" desta base.
 *
 * Imprime o OBSERVADO (a semana que sai para cada pessoa), não um veredito:
 * um check que só diz "ok" não prova que olhou.
 *
 * Uso:  npx tsx scripts/_dryrun-semana-acessivel.ts --empresa=ibipeba
 */
process.loadEnvFile('.env.local');
import { createSupabaseAdmin } from '@/lib/supabase';
import { avaliarAcessoSemana, primeiraSemanaAcessivel } from '@/lib/season-engine/week-gating';

const SLUG = process.argv.find((a) => a.startsWith('--empresa='))?.split('=')[1] || 'ibipeba';

/**
 * Instante simulado (`--em=2026-08-24T11:00:00Z`), default agora.
 *
 * Não é luxo: o gate tem um ramo TEMPORAL, e rodar no domingo responde outra
 * pergunta. A semana 2 de Macaé libera 24/08 às 06:00 UTC — hoje ela aparece
 * bloqueada por DATA para as 38, e o de-para real (34 indo para a semana 1) só
 * se enxerga no horário do disparo, 11:00 UTC.
 */
const EM = process.argv.find((a) => a.startsWith('--em='))?.split('=')[1];
const NOW = EM ? new Date(EM) : new Date();
if (Number.isNaN(NOW.getTime())) throw new Error(`--em inválido: ${EM}`);

async function main() {
  const sb = createSupabaseAdmin();
  const { data: emp, error: eE } = await sb.from('empresas')
    .select('id, slug, nome').eq('slug', SLUG).maybeSingle();
  if (eE) throw new Error(`empresas: ${eE.message}`);
  if (!emp) throw new Error(`empresa ${SLUG} não encontrada`);

  const { data: envios, error: eEnv } = await sb.from('fase4_envios')
    .select('colaborador_id, semana_atual, colaboradores!inner(nome_completo)')
    .eq('empresa_id', emp.id).eq('status', 'ativo');
  if (eEnv) throw new Error(`fase4_envios: ${eEnv.message}`);
  if (!envios?.length) { console.log('coorte vazia'); return; }

  const colabIds = [...new Set((envios as any[]).map((e) => e.colaborador_id))];
  const { data: trilhas, error: eT } = await sb.from('trilhas')
    .select('id, colaborador_id, numero_temporada, temporada_plano, data_inicio')
    .eq('empresa_id', emp.id).in('colaborador_id', colabIds)
    .order('numero_temporada', { ascending: false });
  if (eT) throw new Error(`trilhas: ${eT.message}`);

  const trilhaPor = new Map<string, any>();
  for (const t of (trilhas || []) as any[]) {
    if (!trilhaPor.has(t.colaborador_id)) trilhaPor.set(t.colaborador_id, t);
  }

  const { data: progs, error: eP } = await sb.from('temporada_semana_progresso')
    .select('colaborador_id, semana, status, reflexao, feedback')
    .in('trilha_id', [...trilhaPor.values()].map((t) => t.id));
  if (eP) throw new Error(`progresso: ${eP.message}`);
  const progPor = new Map<string, any[]>();
  for (const p of (progs || []) as any[]) {
    const l = progPor.get(p.colaborador_id) || []; l.push(p); progPor.set(p.colaborador_id, l);
  }

  const linhas: string[] = [];
  let iguais = 0, redirecionados = 0, porData = 0;
  for (const e of (envios as any[])) {
    const t = trilhaPor.get(e.colaborador_id);
    const cal = e.semana_atual || 1;
    const acesso = avaliarAcessoSemana({
      dataInicio: t?.data_inicio,
      plano: t?.temporada_plano,
      progresso: progPor.get(e.colaborador_id) || [],
      semana: cal,
      now: NOW,
    });
    const nome = e.colaboradores?.nome_completo || '(sem nome)';
    if (acesso.liberada) { iguais++; continue; }
    if (acesso.motivo === 'data') {
      porData++;
      linhas.push(`  ⏳ ${nome}: semana ${cal} bloqueada por DATA (libera ${acesso.liberaEm}) — mantém ${cal}`);
      continue;
    }
    redirecionados++;
    const falta = acesso.turnosFeitos === null || acesso.turnosFeitos === undefined
      ? 'conversa não começou'
      : `${acesso.turnosFeitos}/${acesso.turnosNecessarios} turnos`;
    // O que o ENVIO usa é o ponto fixo, não o primeiro degrau: imprimir
    // `semanaPendente` aqui mostraria um número que a mensagem não vai levar.
    const alvo = primeiraSemanaAcessivel({
      dataInicio: t?.data_inicio, plano: t?.temporada_plano,
      progresso: progPor.get(e.colaborador_id) || [], semana: cal, now: NOW,
    });
    const degraus = acesso.semanaPendente && alvo !== acesso.semanaPendente
      ? ` [1 degrau daria ${acesso.semanaPendente}]` : '';
    linhas.push(`  ↩ ${nome}: calendário ${cal} → anuncia ${alvo} (${falta})${degraus}`);
  }

  console.log(`=== ${emp.nome} (${SLUG}) · ${envios.length} ativos ===\n`);
  console.log(`  recebem a semana do calendário : ${iguais}`);
  console.log(`  redirecionados p/ a pendente   : ${redirecionados}`);
  console.log(`  bloqueados por DATA (sem troca): ${porData}\n`);
  for (const l of linhas) console.log(l);

  // Distribuição das semanas que efetivamente saem — é isto que vai no WhatsApp.
  const dist = new Map<number, number>();
  for (const e of (envios as any[])) {
    const t = trilhaPor.get(e.colaborador_id);
    const cal = e.semana_atual || 1;
    // MESMA chamada do envio — a distribuição só serve se for a real.
    const s = primeiraSemanaAcessivel({
      dataInicio: t?.data_inicio, plano: t?.temporada_plano,
      progresso: progPor.get(e.colaborador_id) || [], semana: cal, now: NOW,
    });
    dist.set(s, (dist.get(s) || 0) + 1);
  }
  console.log('\n  semana anunciada → pessoas');
  for (const [s, n] of [...dist.entries()].sort((x, y) => x[0] - y[0])) {
    console.log(`    semana ${s}: ${n}`);
  }
}

main().catch((e) => { console.error('ERRO:', e?.message || e); process.exit(1); });
