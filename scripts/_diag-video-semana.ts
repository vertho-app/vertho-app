/* eslint-disable */
// READ-ONLY: "os vídeos da semana N estão ok?" pelo CONSUMIDOR.
//
// Replica a cadeia real da week page, por entrega (pessoa × pílula):
//   overlay do kit → core_id → modulo_base_id → célula (empresa × cargo × DISC)
//   → videos_personalizados (cell_video_id, colaborador_id) tem prioridade
//   → videoPronto = status 'done' E bunny_video_id E bunny_library
// (page.tsx:650 + gerar-video.ts:152-181; `gerar=false` na entrega: não dispara).
//
// ⚠️ `resolverCelulaVideo` filtra `.neq('status','error')` e NÃO exige 'done' —
// uma célula em 'processing' é "encontrada" mas a tela mostra "preparando", não o
// vídeo. Por isso aqui o veredito é o da TELA, não a existência da linha.
//
// Uso:  npx tsx scripts/_diag-video-semana.ts [semana]   (default 3)
process.loadEnvFile('.env.local');
import { createSupabaseAdmin } from '@/lib/supabase';
import { precarregarKits, overlayKitNaSemana, formatoPreferido } from '@/lib/season-engine/kit/entrega-semana';

const EMP = '0d99fed1-1710-40e3-b32e-7a95c7d023fe'; // ibipeba
const SEMANA = Number(process.argv[2]) || 3;
const PRONTO = ['processing', 'render_queued', 'rendering'];

async function main() {
  const sb = createSupabaseAdmin();
  const { data: envios } = await sb.from('fase4_envios')
    .select('colaborador_id, colaboradores!inner(id, nome_completo, perfil_dominante, cargo, pref_video_curto, pref_video_longo, pref_texto, pref_audio, pref_estudo_caso)')
    .eq('empresa_id', EMP).eq('status', 'ativo');
  const { data: trilhas } = await sb.from('trilhas')
    .select('colaborador_id, temporada_plano, competencia_foco, numero_temporada').eq('empresa_id', EMP);
  const trilhaPor = new Map<string, any>();
  for (const t of (trilhas as any[] || [])) {
    const p = trilhaPor.get(t.colaborador_id);
    if (!p || Number(t.numero_temporada) > Number(p.numero_temporada)) trilhaPor.set(t.colaborador_id, t);
  }

  const linhas: any[] = [];
  for (const e of (envios as any[] || [])) {
    const c = e.colaboradores;
    const disc1 = String(c.perfil_dominante || '').charAt(0).toUpperCase();
    const t = trilhaPor.get(e.colaborador_id);
    const plan = (t?.temporada_plano || []).find((s: any) => Number(s.semana) === SEMANA);
    if (!plan || plan.tipo !== 'conteudo') continue;

    const semana = JSON.parse(JSON.stringify(plan));
    const kitsCache = await precarregarKits(sb, { empresaId: EMP, disc: c.perfil_dominante, cargo: c.cargo }).catch(() => undefined);
    await overlayKitNaSemana(sb, semana, {
      empresaId: EMP, disc: c.perfil_dominante, cargo: c.cargo,
      formatoPref: formatoPreferido(c), competenciaFoco: t?.competencia_foco || null, kitsCache,
    });
    const itens = Array.isArray(semana.conteudos_dia) && semana.conteudos_dia.length
      ? semana.conteudos_dia : [{ conteudo: semana.conteudo, descritor: semana.descritor }];

    for (let i = 0; i < itens.length; i++) {
      const cont = itens[i]?.conteudo || {};
      // A pílula do WhatsApp anuncia o formato PREFERIDO (cron-jobs.ts usa
      // derivarPrioridadeFormatos[0] no texto), não o formato disponível. Preferir
      // vídeo sem haver vídeo = a mensagem promete o que a semana não entrega.
      const linha: any = { nome: c.nome_completo, disc: disc1, cargo: c.cargo, pilula: i + 1, descritor: itens[i]?.descritor, veredito: '', prefereVideo: formatoPreferido(c) === 'video' };

      if (!cont.core_id) { linha.veredito = 'sem core_id'; linhas.push(linha); continue; }
      const { data: mc } = await sb.from('micro_conteudos').select('modulo_base_id').eq('id', cont.core_id).eq('empresa_id', EMP).maybeSingle();
      if (!(mc as any)?.modulo_base_id) { linha.veredito = 'core sem módulo-base'; linhas.push(linha); continue; }

      // Célula: mesma query da entrega (exclui 'error', pega a mais recente).
      const { data: cel } = await sb.from('videos_gerados')
        .select('id, status, bunny_video_id, bunny_library')
        .eq('modulo_base_id', (mc as any).modulo_base_id).eq('empresa_id', EMP)
        .eq('cargo', c.cargo).eq('disc_dominante', disc1).neq('status', 'error')
        .order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (!cel) {
        // Sem célula servível. Mas `resolverCelulaVideo` filtra `.neq('status','error')`:
        // uma tentativa que FALHOU fica invisível para a entrega e parece "nunca gerada".
        // Distinguir importa — falha é re-disparo, ausência é geração do zero.
        const { data: falha } = await sb.from('videos_gerados')
          .select('error, created_at').eq('modulo_base_id', (mc as any).modulo_base_id).eq('empresa_id', EMP)
          .eq('cargo', c.cargo).eq('disc_dominante', disc1).eq('status', 'error')
          .order('created_at', { ascending: false }).limit(1).maybeSingle();
        linha.veredito = falha ? 'célula FALHOU (invisível p/ entrega)' : 'célula NÃO gerada';
        linha.erro = (falha as any)?.error ? String((falha as any).error).slice(0, 80) : null;
        linhas.push(linha); continue;
      }

      const { data: perso } = await sb.from('videos_personalizados')
        .select('status, bunny_video_id, bunny_library')
        .eq('cell_video_id', (cel as any).id).eq('colaborador_id', c.id)
        .order('created_at', { ascending: false }).limit(1).maybeSingle();

      const usarPerso = (perso as any)?.status === 'done' && (perso as any).bunny_video_id;
      const efetivo = usarPerso ? perso : cel;
      const pronto = (efetivo as any).status === 'done' && (efetivo as any).bunny_video_id && (efetivo as any).bunny_library;
      linha.personalizado = usarPerso;
      linha.persoStatus = (perso as any)?.status || '—';
      linha.celStatus = (cel as any).status;
      linha.veredito = pronto
        ? (usarPerso ? 'OK · com nome' : 'OK · genérico')
        : (PRONTO.includes((efetivo as any).status) ? 'preparando' : `quebrado (${(efetivo as any).status})`);
      linhas.push(linha);
    }
  }

  const cont = new Map<string, number>();
  for (const l of linhas) cont.set(l.veredito, (cont.get(l.veredito) || 0) + 1);
  console.log(`=== VÍDEO · semana ${SEMANA} · ibipeba · ${linhas.length} entregas (pessoa × pílula) ===\n`);
  for (const [v, n] of [...cont].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(3)}  ${v}`);

  const prometido = linhas.filter((l) => l.prefereVideo && !l.veredito.startsWith('OK'));
  if (prometido.length) {
    console.log(`\n🔴 pílula anuncia VÍDEO e a semana não tem: ${prometido.length} entrega(s)`);
    for (const l of prometido) console.log(`     ${l.nome} · p${l.pilula} · ${l.descritor}`);
  }
  const persoPresos = linhas.filter((l) => l.persoStatus && !['done', '—'].includes(l.persoStatus));
  if (persoPresos.length) {
    console.log(`\n⚠️  personalizados NÃO concluídos (a pessoa cai no genérico): ${persoPresos.length}`);
    for (const l of persoPresos) console.log(`     ${l.nome} · p${l.pilula} · perso=${l.persoStatus} · célula=${l.celStatus}`);
  }
  const falhadas = linhas.filter((l) => l.veredito.startsWith('célula FALHOU'));
  if (falhadas.length) {
    const porErro = new Map<string, number>();
    for (const l of falhadas) porErro.set(l.erro || '(sem detalhe)', (porErro.get(l.erro || '(sem detalhe)') || 0) + 1);
    console.log(`\n── células que FALHARAM (re-disparar, não gerar do zero) ──`);
    for (const [k, n] of [...porErro].sort((a, b) => b[1] - a[1])) console.log(`     ${n}× ${k}`);
  }
  const semCelula = linhas.filter((l) => l.veredito === 'célula NÃO gerada');
  if (semCelula.length) {
    const porCelula = new Map<string, number>();
    for (const l of semCelula) porCelula.set(`${l.cargo} · ${l.disc} · ${l.descritor}`, (porCelula.get(`${l.cargo} · ${l.disc} · ${l.descritor}`) || 0) + 1);
    console.log(`\n── células a gerar (${porCelula.size} distintas, ${semCelula.length} entregas) ──`);
    for (const [k, n] of [...porCelula].sort((a, b) => b[1] - a[1])) console.log(`     ${n}× ${k}`);
  }
}
main().catch((e) => { console.error('ERRO FATAL:', e?.message || e); process.exit(1); });
