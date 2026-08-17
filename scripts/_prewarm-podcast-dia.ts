/* eslint-disable */
/**
 * Pré-aquece o PODCAST de quem vai receber ÁUDIO como formato anunciado no dia.
 *
 * POR QUE SÓ DESSES
 * ─────────────────
 * O áudio da trilha é gerado sob demanda e **personalizado por pessoa** ("Olá,
 * {nome}. Que bom ter você aqui."), com cache em
 * `final/audio-personalizado/<conteudo>/<colaborador>.mp3`. Quem clica primeiro
 * paga a espera do TTS. Pré-aquecer TODO MUNDO seria uma geração por pessoa —
 * caro e, em geral, para quem nem vai abrir a aba de áudio. Quem recebe a
 * PROMESSA de áudio na mensagem é outra história: para essa pessoa, a espera
 * acontece exatamente no momento em que ela atendeu ao que pedimos.
 *
 * 🔑 O ALVO SAI DO MESMO CÓDIGO DA ENTREGA: `coletarEntregasPrevistas` (o
 * pré-voo) diz quem tem `formatoAnunciado === 'audio'`, e o id do conteúdo vem
 * do overlay de kit — as mesmas funções que montam a semana da pessoa. Resolver
 * "qual áudio é o dela" por consulta própria seria um gêmeo que diverge no
 * primeiro ajuste do resolvedor.
 *
 * ⚠️ O TTS NÃO RODA NO tsx (o encoder MP3 só funciona no runtime da Vercel), por
 * isso o script CHAMA a rota interna `/api/internal/pregerar-podcast` em vez de
 * gerar aqui. O segredo sai do `.env.local` e nunca do argv.
 *
 * Uso:
 *   npx tsx scripts/_prewarm-podcast-dia.ts --empresa=macae            → dry-run
 *   npx tsx scripts/_prewarm-podcast-dia.ts --empresa=macae --executar
 *   ... --data=2026-08-18   (default: amanhã)
 *   ... --base=https://app.vertho.ai
 */
process.loadEnvFile('.env.local');
import { createSupabaseAdmin } from '@/lib/supabase';
import { coletarEntregasPrevistas } from '@/lib/pipeline-health/coleta';
import { precarregarKits, overlayKitNaSemana, formatoPreferido } from '@/lib/season-engine/kit/entrega-semana';
import { getProgramaConfigDaTrilha } from '@/lib/season-engine/programa-config';

const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=')[1];
const SLUG = arg('empresa');
const BASE = arg('base') || 'https://app.vertho.ai';
const EXECUTAR = process.argv.includes('--executar');
const DATA = new Date((arg('data') || new Date(Date.now() + 24 * 3600_000).toISOString().slice(0, 10)) + 'T12:00:00Z');

async function main() {
  if (!SLUG) throw new Error('--empresa=<slug> é obrigatório');
  const segredo = process.env.INTERNAL_API_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!segredo) throw new Error('sem INTERNAL_API_KEY nem SUPABASE_SERVICE_ROLE_KEY no .env.local');

  const sb = createSupabaseAdmin();
  const { data: emp } = await sb.from('empresas').select('id, nome').eq('slug', SLUG).maybeSingle();
  if (!emp) throw new Error(`empresa ${SLUG} não encontrada`);
  const empresaId = (emp as any).id as string;

  const { entregas, pilulaAlvo } = await coletarEntregasPrevistas(sb, empresaId, DATA);
  const alvos = entregas.filter((e) => e.formatoAnunciado === 'audio');
  console.log(`${(emp as any).nome} · ${DATA.toISOString().slice(0, 10)} · pílula ${pilulaAlvo ?? '-'}`);
  console.log(`  ${entregas.length} pessoa(s) no dia · ${alvos.length} com ÁUDIO anunciado\n`);
  if (!alvos.length) { console.log('nada a pré-aquecer.'); return; }

  for (const alvo of alvos) {
    // O conteúdo de áudio DELA — pelo mesmo overlay que monta a semana na tela.
    const { data: colab, error: eC } = await sb.from('colaboradores')
      .select('id, nome_completo, perfil_dominante, cargo, pref_video_curto, pref_video_longo, pref_texto, pref_audio, pref_estudo_caso')
      .eq('id', alvo.colaboradorId).eq('empresa_id', empresaId).maybeSingle();
    // ⚠️ supabase-js RETORNA `{error}` — sem este check, uma coluna inexistente no
    // select viraria "sem colaborador/trilha" e o alvo sumiria em silêncio.
    if (eC) { console.log(`  ⚠️ ${alvo.nome}: colaboradores: ${eC.message}`); continue; }
    const { data: trilha, error: eT } = await sb.from('trilhas')
      .select('temporada_plano, competencia_foco, programa_modo, programa_config')
      .eq('colaborador_id', alvo.colaboradorId).eq('empresa_id', empresaId).eq('status', 'ativa')
      .order('criado_em', { ascending: false }).limit(1).maybeSingle();
    if (eT) { console.log(`  ⚠️ ${alvo.nome}: trilhas: ${eT.message}`); continue; }
    if (!colab || !trilha) { console.log(`  ⚠️ ${alvo.nome}: sem colaborador/trilha`); continue; }

    const plano = ((trilha as any).temporada_plano || []) as any[];
    const plan = plano.find((s: any) => Number(s.semana) === Number(alvo.semana));
    if (!plan) { console.log(`  ⚠️ ${alvo.nome}: semana ${alvo.semana} fora do plano`); continue; }

    const copia = JSON.parse(JSON.stringify(plan));
    await overlayKitNaSemana(sb, copia, {
      empresaId,
      disc: (colab as any).perfil_dominante,
      cargo: (colab as any).cargo,
      formatoPref: formatoPreferido(colab as any),
      competenciaFoco: (trilha as any).competencia_foco || null,
      kitsCache: await precarregarKits(sb, {
        empresaId, disc: (colab as any).perfil_dominante, cargo: (colab as any).cargo,
      }),
      desafioUnicoPorSemana: getProgramaConfigDaTrilha(trilha as any).desafioUnicoPorSemana,
    });

    const itens = Array.isArray(copia.conteudos_dia) && copia.conteudos_dia.length
      ? copia.conteudos_dia : [{ conteudo: copia.conteudo }];
    const cont = itens[(alvo.pilula || 1) - 1]?.conteudo || {};
    const audioId = cont?.formatos_disponiveis?.audio?.id || null;

    console.log(`  ${alvo.nome} · DISC ${(colab as any).perfil_dominante} · semana ${alvo.semana}/p${alvo.pilula}`);
    console.log(`    conteúdo de áudio: ${audioId ?? '🔴 NENHUM (o áudio anunciado não existe no overlay)'}`);
    if (!audioId || !EXECUTAR) continue;

    const r = await fetch(`${BASE}/api/internal/pregerar-podcast`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-internal-secret': segredo },
      body: JSON.stringify({ id: audioId, colaboradorId: alvo.colaboradorId }),
    });
    const j: any = await r.json().catch(() => null);
    console.log(`    → ${r.status} ${JSON.stringify(j)}`);

    // Prova do EFEITO, não do 200: o arquivo tem que estar no path que a rota de
    // leitura consulta. Sem isto, "ok: true" seria só a promessa do servidor.
    const path = `final/audio-personalizado/${audioId}/${alvo.colaboradorId}.mp3`;
    const { data: lista } = await sb.storage.from('conteudos')
      .list(path.split('/').slice(0, -1).join('/'), { search: path.split('/').pop()!, limit: 1 });
    const arquivo = lista?.[0];
    console.log(`    cache: ${arquivo ? `✅ ${((arquivo as any).metadata?.size / 1024).toFixed(0)} KB` : '🔴 não encontrado'}`);
  }

  if (!EXECUTAR) console.log('\ndry-run — rode com --executar.');
}

main().catch((e) => { console.error(e); process.exit(1); });
