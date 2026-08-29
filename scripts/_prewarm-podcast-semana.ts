/* eslint-disable */
// Pré-aquece o PODCAST PERSONALIZADO (saudação nominal) de uma semana, por pessoa.
//
// Por que existe: o áudio ENTREGUE é o do KIT (o overlay troca o formato), e kit
// gerado com `renderAudio:false` fica com `url=null`. A rota /api/conteudo/[id]/podcast
// então faz TTS ON-DEMAND no 1º play (~150 s de espera, dentro do maxDuration 300) e
// cacheia em `final/audio-personalizado/{conteudoId}/{colabId}.mp3`. Pré-aquecer paga
// essa espera antes da semana abrir.
//
// Roda contra a ROTA em produção de propósito: `lamejs` não funciona sob tsx
// (ver docs/KIT-SEMANAL.md), então o MP3 tem de ser encodado na Vercel.
//
// Pares derivados do overlay REAL (mesma régua da week page), nunca do plano cru.
// Idempotente: confere o cache no Storage antes de chamar (a rota NÃO confere — ela
// re-gera e paga TTS de novo).
//
// Uso: npx tsx scripts/_prewarm-podcast-semana.ts [semana]            → DRY-RUN
//      npx tsx scripts/_prewarm-podcast-semana.ts [semana] --executar → pré-aquece
process.loadEnvFile('.env.local');
import { createSupabaseAdmin } from '@/lib/supabase';
import { precarregarKits, overlayKitNaSemana, formatoPreferido } from '@/lib/season-engine/kit/entrega-semana';

const EMP = '0d99fed1-1710-40e3-b32e-7a95c7d023fe'; // ibipeba
const SEMANA = Number(process.argv[2]) || 5;
const EXECUTAR = process.argv.includes('--executar');
// Cada chamada é um TTS de ~3 mil chars (~150 s). Com 72 pares, a concorrência é o
// que decide se o lote cabe numa janela: medido 12/08 com CONC=3 → ~0,4/min. Teto
// prático é a quota do Vertex, não a rota (maxDuration 300 cobre cada chamada).
const CONC = Number(process.env.PREWARM_CONC) || 3;
const BASE = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://app.vertho.ai';
const SEGREDO = process.env.INTERNAL_API_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const sani = (v: string) => String(v || '').replace(/[^a-zA-Z0-9_-]/g, '_');

async function main() {
  if (!SEGREDO) throw new Error('sem INTERNAL_API_KEY nem SUPABASE_SERVICE_ROLE_KEY');
  const sb = createSupabaseAdmin();
  const { data: emp } = await sb.from('empresas').select('slug, is_demo').eq('id', EMP).single();
  if (!emp || emp.is_demo) throw new Error('ABORT: empresa inválida ou is_demo');

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

  type Par = { conteudoId: string; colabId: string; nome: string; descritor: string };
  const pares: Par[] = [];
  const jaQuente: Par[] = [];
  const listagem = new Map<string, Set<string>>();

  for (const e of (envios as any[] || [])) {
    const c = e.colaboradores;
    const t = trilhaPor.get(e.colaborador_id);
    const plan = (t?.temporada_plano || []).find((s: any) => Number(s.semana) === SEMANA);
    if (!plan || plan.tipo !== 'conteudo') continue;

    const semana = JSON.parse(JSON.stringify(plan));
    const kitsCache = await precarregarKits(sb, { empresaId: EMP, disc: c.perfil_dominante, cargo: c.cargo }).catch(() => undefined);
    await overlayKitNaSemana(sb, semana, {
      empresaId: EMP, disc: c.perfil_dominante, cargo: c.cargo,
      formatoPref: formatoPreferido(c), competenciaFoco: t?.competencia_foco || null, kitsCache,
    } as any);
    const itens = Array.isArray(semana.conteudos_dia) && semana.conteudos_dia.length
      ? semana.conteudos_dia : [{ conteudo: semana.conteudo, descritor: semana.descritor }];

    for (const it of itens) {
      const audioId = it?.conteudo?.formatos_disponiveis?.audio?.id;
      if (!audioId) continue;
      const dir = `final/audio-personalizado/${sani(audioId)}`;
      if (!listagem.has(dir)) {
        const { data: objs } = await sb.storage.from('conteudos').list(dir, { limit: 300 });
        listagem.set(dir, new Set((objs || []).map((o: any) => o.name)));
      }
      const par = { conteudoId: audioId, colabId: c.id, nome: c.nome_completo, descritor: it.descritor };
      if (listagem.get(dir)!.has(`${sani(c.id)}.mp3`)) jaQuente.push(par); else pares.push(par);
    }
  }

  console.log(`=== PREWARM PODCAST · semana ${SEMANA} · ibipeba ===`);
  console.log(`pares a aquecer: ${pares.length} · já em cache: ${jaQuente.length} · alvo: ${BASE}`);
  if (!EXECUTAR) { console.log('\n>>> DRY-RUN — use --executar <<<'); return; }

  let ok = 0, falhou = 0, i = 0;
  const fila = [...pares];
  async function worker(w: number) {
    while (fila.length) {
      const par = fila.shift()!;
      const n = ++i;
      const t0 = Date.now();
      try {
        const r = await fetch(`${BASE}/api/internal/pregerar-podcast`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-internal-secret': SEGREDO },
          body: JSON.stringify({ id: par.conteudoId, colaboradorId: par.colabId }),
        });
        const txt = await r.text();
        if (!r.ok) { falhou++; console.log(`  ❌ [${n}/${pares.length}] ${par.nome} · ${par.descritor}: HTTP ${r.status} ${txt.slice(0, 160)}`); }
        else { ok++; console.log(`  ✅ [${n}/${pares.length}] ${par.nome} · ${par.descritor} (${Math.round((Date.now() - t0) / 1000)}s)`); }
      } catch (err: any) {
        falhou++;
        console.log(`  ❌ [${n}/${pares.length}] ${par.nome}: ${err?.message || err}`);
      }
    }
  }
  await Promise.all(Array.from({ length: CONC }, (_, w) => worker(w)));
  console.log(`\nRESUMO: ${ok} aquecido(s) · ${falhou} falha(s) · ${jaQuente.length} já estavam quentes`);
  console.log('Re-rodar é seguro: quem já tem cache é pulado.');
}

main().catch((e) => { console.error('ERRO FATAL:', e?.message || e); process.exit(1); });
