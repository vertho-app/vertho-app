/* eslint-disable */
/**
 * Vídeo da semana para quem DECLAROU vídeo como preferência.
 *
 * POR QUE SÓ DESSES
 * ─────────────────
 * `derivarPrioridadeFormatos` devolve `['video', …]` para quem não declarou nada
 * — e em Macaé isso é **30 de 38**. "35 preferem vídeo" é o default falando, não
 * as pessoas: só **5** têm nota em `pref_*` com vídeo no topo. Gerar para os 35
 * seria pagar render (~US$ 0,64 cada, ~40 min por célula) por uma preferência
 * que ninguém expressou.
 *
 * 🔑 O VÍDEO É POR CÉLULA, NÃO POR PESSOA: (módulo-base × empresa × cargo ×
 * 1ª letra do DISC). Os 5 caem em menos células que isso — quem compartilha
 * célula compartilha render. A saudação nominal é outra camada
 * (`videos_personalizados`), gerada por pessoa em cima do deck.
 *
 * ⚠️ A ÂNCORA É O MÓDULO DO CONTEÚDO PÓS-OVERLAY, não o do plano cru nem o do
 * brief do kit: é `core_id` que `resolverVideoDaSemana` usa para achar a célula.
 * Ancorar no brief já produziu 4 vídeos que nunca apareceram para o cargo certo.
 *
 * ⚠️ SEM RISCO DE PROMESSA FALSA se o render não terminar a tempo: o formato
 * anunciado é decidido no INSTANTE do envio, consultando o deck ao vivo
 * (`formatosEntregaveis`). Vídeo pronto → anuncia vídeo; não pronto → anuncia
 * texto. Por isso dá para disparar sem travar a cadência.
 *
 * Uso:
 *   npx tsx scripts/_video-semana-preferentes.ts --empresa=macae            → dry-run
 *   npx tsx scripts/_video-semana-preferentes.ts --empresa=macae --executar
 *   ... --data=2026-08-18
 */
process.loadEnvFile('.env.local');
import { createSupabaseAdmin } from '@/lib/supabase';
import { coletarEntregasPrevistas } from '@/lib/pipeline-health/coleta';
import { precarregarKits, overlayKitNaSemana, formatoPreferido } from '@/lib/season-engine/kit/entrega-semana';
import { getProgramaConfigDaTrilha } from '@/lib/season-engine/programa-config';
import { derivarPrioridadeFormatos } from '@/lib/season-engine/formato-preferido';
import { resolverContextoEmpresa } from '@/lib/season-engine/kit/contexto-empresa';
import { dispararCelulasDoKitEmLote, despacharGruposOrfaos, podeAgrupar, chaveCombinacao, passaDoTeto } from '@/lib/video/celulas-lote';
import { avatarGrupoLigado } from '@/lib/video/avatar-grupo-core';
import { TETO_ATRASO_DISPARO_S } from '@/lib/video/roteiro-lote';

/**
 * `--sem-grupo`: não divide o avatar entre as células DISC do mesmo módulo × cargo,
 * mesmo com `VIDEO_AVATAR_GRUPO=on` no `.env.local`. Com o grupo (30/09/2026), só a
 * 1ª célula de cada combinação paga a HeyGen (~US$ 0,51); medido desde 01/08: 32
 * células em 13 combinações. Detalhe em `lib/video/celulas-lote.ts`.
 */
const SEM_GRUPO = process.argv.includes('--sem-grupo');

/**
 * Espera máxima pelo lote dos roteiros antes de cair no síncrono (decisão do dono,
 * 30/09/2026: 2 h). Se estourar, o coletor cancela o lote, aproveita o que saiu e
 * só o resto vai ao síncrono, então o pior caso custa o mesmo que antes.
 */
const ORCAMENTO_ROTEIRO_MS = 2 * 3600_000;

const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=')[1];
const SLUG = arg('empresa');
const EXECUTAR = process.argv.includes('--executar');
/**
 * Uma ou mais datas (`--datas=2026-08-18,2026-08-19`).
 *
 * 🔴 POR QUE ACEITAR VÁRIAS DE UMA VEZ, e não rodar o script por dia: a célula de
 * vídeo é `(módulo-base × empresa × cargo × 1ª letra do DISC)` — **o kit não
 * entra**. Medido em 17/08/2026: das células da P1 e da P2 da mesma semana, **10
 * são a mesma célula com kits diferentes** (dois descritores que caem no mesmo
 * módulo-base). Rodando dia a dia, `dispararVideoDoKit` — que procura por
 * `kit_id` — não veria o vídeo do outro dia e criaria um SEGUNDO para a mesma
 * célula: render pago duas vezes e, pior, `resolverCelulaVideo` serve o MAIS
 * RECENTE para as duas pílulas, ou seja, o desafio de um descritor aparecendo no
 * outro. É a `celula-video-duplicada` que o health estrutural acusa.
 *
 * Com as datas juntas, a união é deduplicada ANTES de disparar.
 */
const DATAS = (arg('datas') || arg('data') || new Date(Date.now() + 24 * 3600_000).toISOString().slice(0, 10))
  .split(',').map((d) => new Date(d.trim() + 'T12:00:00Z'));
/** `--todos`: ignora a preferência e cobre a coorte inteira daquele dia. */
const TODOS = process.argv.includes('--todos');
/**
 * Espaçamento entre disparos, em segundos.
 *
 * 🔴 NÃO é polidez com o servidor, é a diferença entre gerar e perder render. O
 * roteiro sai inline, mas a NARRAÇÃO de cada célula corre na task — disparar em
 * sequência rápida põe N TTS concorrentes no mesmo fornecedor. Medido em
 * 17/08/2026: 4 células disparadas em 4 minutos, 1 morreu em "TTS: resposta sem
 * áudio após 4 tentativas"; a mesma célula sozinha passou de primeira. O lote de
 * 42 (28/07) perdeu ~15% pelo mesmo motivo.
 *
 * Desde 30/09/2026 o espaçamento é feito pelo `delay` do Trigger (agenda de
 * `lib/video/roteiro-lote.ts`), e não mais dormindo aqui entre um disparo e outro.
 * O padrão subiu de 150 para 210 s porque o espaçamento REAL era 150 s de espera
 * mais ~65 s do roteiro síncrono de cada célula, que agora sai em lote.
 */
const INTERVALO_S = Number(arg('intervalo')) || 210;
/**
 * Teto de disparos por execução (`--limite`).
 *
 * 🔴 Medido em 17/08/2026: um disparo de 19 células com espaçamento de 150s leva
 * ~50 min, e o processo foi MORTO duas vezes antes de terminar (10 de 19 e
 * depois 3 de 8). O trabalho não se perdeu porque a checagem de "já tem deck" é
 * por célula — mas retomar na mão é um passo que só existe porque a execução era
 * longa demais. Blocos pequenos rodam do começo ao fim.
 */
const LIMITE = Number(arg('limite')) || 0;
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Declarou preferência DE VERDADE (não é o default de quem deixou tudo em branco). */
function declarouPreferencia(c: any): boolean {
  return [c.pref_video_curto, c.pref_video_longo, c.pref_texto, c.pref_audio, c.pref_estudo_caso]
    .some((v) => Number(v || 0) > 0);
}

async function main() {
  if (!SLUG) throw new Error('--empresa=<slug> é obrigatório');
  const sb = createSupabaseAdmin();

  const { data: emp } = await sb.from('empresas').select('id, nome').eq('slug', SLUG).maybeSingle();
  if (!emp) throw new Error(`empresa ${SLUG} não encontrada`);
  const empresaId = (emp as any).id as string;

  // Célula → quem cai nela. Dedup por (módulo × cargo × DISC) ATRAVÉS das datas:
  // é essa a chave que a entrega usa, e é ela que evita render duplo.
  const celulas = new Map<string, {
    moduloBaseId: string; disc: string; cargo: string; kitId: string; desafio: string;
    pessoas: string[]; conteudoId: string; jaTem?: string | null; dias: Set<string>;
  }>();

  const entregas: any[] = [];
  for (const data of DATAS) {
    const r = await coletarEntregasPrevistas(sb, empresaId, data);
    console.log(`${(emp as any).nome} · ${data.toISOString().slice(0, 10)} · pílula ${r.pilulaAlvo ?? '-'} · ${r.entregas.length} pessoa(s)`);
    for (const e of r.entregas) entregas.push({ ...e, _dia: data.toISOString().slice(0, 10) });
  }
  console.log('');

  for (const e of entregas) {
    const { data: colab, error: eC } = await sb.from('colaboradores')
      .select('id, nome_completo, perfil_dominante, cargo, pref_video_curto, pref_video_longo, pref_texto, pref_audio, pref_estudo_caso')
      .eq('id', e.colaboradorId).eq('empresa_id', empresaId).maybeSingle();
    if (eC) { console.log(`⚠️ ${e.nome}: ${eC.message}`); continue; }
    if (!colab) continue;
    if (!TODOS) {
      if (!declarouPreferencia(colab)) continue;                     // default não conta
      if (derivarPrioridadeFormatos(colab)[0] !== 'video') continue; // vídeo tem de ser o topo
    }

    const { data: trilha, error: eT } = await sb.from('trilhas')
      .select('temporada_plano, competencia_foco, programa_modo, programa_config')
      .eq('colaborador_id', e.colaboradorId).eq('empresa_id', empresaId).eq('status', 'ativa')
      .order('criado_em', { ascending: false }).limit(1).maybeSingle();
    if (eT) { console.log(`⚠️ ${e.nome}: trilhas: ${eT.message}`); continue; }
    const plan = (((trilha as any)?.temporada_plano || []) as any[]).find((s: any) => Number(s.semana) === Number(e.semana));
    if (!plan) { console.log(`⚠️ ${e.nome}: semana ${e.semana} fora do plano`); continue; }

    const copia = JSON.parse(JSON.stringify(plan));
    await overlayKitNaSemana(sb, copia, {
      empresaId, disc: (colab as any).perfil_dominante, cargo: (colab as any).cargo,
      formatoPref: formatoPreferido(colab as any),
      competenciaFoco: (trilha as any).competencia_foco || null,
      kitsCache: await precarregarKits(sb, { empresaId, disc: (colab as any).perfil_dominante, cargo: (colab as any).cargo }),
      desafioUnicoPorCompetencia: getProgramaConfigDaTrilha(trilha as any).desafioUnicoPorCompetencia,
    });

    const itens = Array.isArray(copia.conteudos_dia) && copia.conteudos_dia.length
      ? copia.conteudos_dia : [{ conteudo: copia.conteudo }];
    const cont = itens[(e.pilula || 1) - 1]?.conteudo || {};
    const coreId = cont?.core_id;
    const kitId = cont?.kit_id;
    if (!coreId || !kitId) { console.log(`⚠️ ${e.nome}: conteúdo sem core/kit pós-overlay`); continue; }

    // A ÂNCORA: módulo-base do conteúdo que a pessoa recebe.
    const { data: mc } = await sb.from('micro_conteudos')
      .select('modulo_base_id').eq('id', coreId).eq('empresa_id', empresaId).maybeSingle();
    const moduloBaseId = (mc as any)?.modulo_base_id;
    if (!moduloBaseId) { console.log(`⚠️ ${e.nome}: core ${coreId} sem módulo-base`); continue; }

    const { data: kit } = await sb.from('kits').select('desafio, disc').eq('id', kitId).maybeSingle();
    const disc = String((colab as any).perfil_dominante || '').charAt(0).toUpperCase();
    const chave = `${moduloBaseId}|${(colab as any).cargo}|${disc}`;

    if (!celulas.has(chave)) {
      celulas.set(chave, {
        moduloBaseId, disc, cargo: (colab as any).cargo, kitId,
        desafio: (kit as any)?.desafio?.desafio_texto || '',
        pessoas: [], conteudoId: coreId, dias: new Set(),
      });
    }
    const cel = celulas.get(chave)!;
    // Mesma célula em dois dias: UM vídeo atende os dois (o kit não entra na
    // resolução). Quem chegou primeiro define o desafio costurado no roteiro.
    if (!cel.pessoas.includes((colab as any).nome_completo)) cel.pessoas.push((colab as any).nome_completo);
    cel.dias.add(e._dia);
  }

  // Célula que JÁ tem deck (ou está a caminho) não conta como trabalho: o
  // `dispararVideoDoKit` reusa, mas contar tudo esconderia quanto falta de fato.
  for (const [chave, c] of celulas) {
    // ⚠️ A checagem é por CÉLULA, não por kit — é assim que `resolverCelulaVideo`
    // procura. Conferir por `kit_id` (como `dispararVideoDoKit` faz) diria "não
    // existe" para uma célula que já tem deck de outro descritor, e o segundo
    // render sobrescreveria a entrega do primeiro.
    const { data: existente } = await sb.from('videos_gerados')
      .select('id, status').eq('modulo_base_id', c.moduloBaseId).eq('empresa_id', empresaId)
      .eq('cargo', c.cargo).eq('disc_dominante', c.disc).neq('status', 'error')
      .order('created_at', { ascending: false }).limit(1).maybeSingle();
    c.jaTem = existente ? String((existente as any).status) : null;
  }

  const todasPendentes = [...celulas.values()].filter((c) => !c.jaTem);
  const pendentes = LIMITE > 0 ? todasPendentes.slice(0, LIMITE) : todasPendentes;
  if (pendentes.length < todasPendentes.length) {
    console.log(`⚠️ teto de ${LIMITE}: ${todasPendentes.length - pendentes.length} célula(s) ficam para a próxima execução\n`);
  }
  const pessoas = [...celulas.values()].reduce((n, c) => n + c.pessoas.length, 0);
  console.log(`${TODOS ? 'coorte' : 'declararam vídeo'}: ${pessoas} pessoa(s) · ${celulas.size} célula(s) · ${pendentes.length} sem deck\n`);
  for (const c of celulas.values()) {
    const dias = [...c.dias].sort().join(' + ');
    console.log(`── DISC ${c.disc} · ${c.pessoas.length} pessoa(s) · ${dias}${c.dias.size > 1 ? ' (MESMA célula nos dois dias)' : ''} · ${c.jaTem ? `♻️ ${c.jaTem}` : '⬜ a gerar'}`);
    console.log(`   módulo-base ${c.moduloBaseId} · kit ${c.kitId}`);
  }

  // A flag vale a da MÁQUINA (`.env.local`): o grupo é decidido aqui, não no Trigger.
  const GRUPO = !SEM_GRUPO && avatarGrupoLigado();
  console.log(`avatar por grupo: ${GRUPO ? 'LIGADO' : 'desligado'} (VIDEO_AVATAR_GRUPO=${process.env.VIDEO_AVATAR_GRUPO || '(não definida)'}${SEM_GRUPO ? ', --sem-grupo' : ''})`);

  // Grupo com célula esperando sem despacho (uma rodada anterior morreu entre a inserção
  // e o despacho): sai ANTES, senão a checagem de "já tem deck" acima o esconde para sempre.
  if (EXECUTAR) {
    const orfas = await despacharGruposOrfaos(sb, { empresaId, intervaloS: INTERVALO_S });
    if (orfas.grupos.length) console.log(`♻️ ${orfas.grupos.length} grupo(s) com célula esperando despachado(s)${orfas.erros.length ? ` · erros: ${orfas.erros.join(' | ')}` : ''}`);
  }

  if (!pendentes.length) { console.log('\nnada a gerar — todas as células já têm deck.'); return; }
  const agrupaveis = GRUPO ? pendentes.filter((c) => podeAgrupar(c.cargo)) : [];
  const combinacoes = new Set(agrupaveis.map((c) => chaveCombinacao(c))).size;
  // Avatares pagos, no máximo: 1 por combinação (a mãe; grupo já pronto de semana anterior
  // não paga nenhum) + 1 por célula que não agrupa.
  const avatares = (pendentes.length - agrupaveis.length) + combinacoes;
  const vagasMinimas = avatares;
  if (passaDoTeto(vagasMinimas, INTERVALO_S)) {
    throw new Error(`${vagasMinimas} disparo(s) × ${INTERVALO_S}s passa do teto de ${TETO_ATRASO_DISPARO_S}s de atraso: use --limite`);
  }
  if (!EXECUTAR) {
    // ~US$ 0,28 por célula sem o avatar (roteiro em lote, narração, render) + ~0,51 por avatar.
    console.log(`\ndry-run — rode com --executar.`);
    console.log(`  ${pendentes.length} render(s) em ${GRUPO ? `${combinacoes} combinação(ões) de módulo × cargo` : 'células sem grupo'} · até ${avatares} avatar(es) · ~US$ ${(pendentes.length * 0.28 + avatares * 0.51).toFixed(2)} (sem grupo seria ~US$ ${(pendentes.length * 0.79).toFixed(2)}) · roteiros num lote só (espera de até ${ORCAMENTO_ROTEIRO_MS / 60000} min) · disparos espaçados em ${INTERVALO_S}s pelo Trigger`);
    return;
  }

  const pppBrief = await resolverContextoEmpresa(sb, empresaId).catch(() => null);
  console.log(`roteiros: ${pendentes.length} num lote só; esperando o lote (até ${ORCAMENTO_ROTEIRO_MS / 60000} min)…`);
  const lote = await dispararCelulasDoKitEmLote(sb, {
    empresaId, pppBrief,
    createdBy: TODOS ? 'kit:coorte' : 'kit:preferencia-video',
    celulas: pendentes.map((c) => ({ moduloBaseId: c.moduloBaseId, cargo: c.cargo, disc: c.disc as any, desafioTexto: c.desafio, kitId: c.kitId })),
    grupo: GRUPO, intervaloS: INTERVALO_S, budgetMs: ORCAMENTO_ROTEIRO_MS,
  });
  console.log(`vagas na agenda: ${lote.vagas}`);
  for (const [i, c] of pendentes.entries()) {
    const r = lote.celulas[i];
    /*
     * 🔑 `23505` AQUI É REUSO, NÃO FALHA — e a distinção não é cosmética.
     *
     * `uq_videos_gerados_celula` é UNIQUE PARCIAL em
     * (módulo × empresa × cargo × DISC) `WHERE status <> 'error'`: o banco admite
     * uma célula viva só. Como este script lê o estado no início e dispara
     * minutos depois, o snapshot envelhece — outro processo (ou o disparo
     * anterior deste mesmo lote) pode ter criado a linha nesse intervalo.
     *
     * Medido em 17/08/2026: a colisão apareceu, e ela é o índice fazendo o
     * trabalho que a minha leitura não podia fazer. Reportar como ❌ mandaria
     * alguém investigar um render que não foi perdido — e, pior, tentar de novo.
     */
    const jaExistia = /duplicate key|23505|uq_videos_gerados_celula/i.test(String(r.error || ''));
    const desfecho = r.error
      ? (jaExistia ? '♻️ já existia (outra execução criou)' : `❌ ${r.error}`)
      : `${r.reused ? '♻️ reusado' : r.adiado ? '⏳ no grupo (espera a mãe)' : '✅ disparado'} ${r.id} status=${r.status}`;
    console.log(`▶ ${i + 1}/${pendentes.length} DISC ${c.disc} (${c.pessoas.length}p): ${desfecho}`);
  }
  for (const g of lote.grupos) {
    console.log(`◆ grupo ${g.grupoId} (${g.combinacao}): ${g.celulas} célula(s) · despacho ${g.via ?? 'nenhum'} em +${g.atrasoS}s${g.erros.length ? ` · erros: ${g.erros.join(' | ')}` : ''}`);
  }

  console.log('\nAcompanhe: select status, etapa, error from videos_gerados where empresa_id = ... order by created_at desc;');
}

main().catch((e) => { console.error(e); process.exit(1); });
