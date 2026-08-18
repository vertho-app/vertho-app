/* eslint-disable */
/**
 * Reescreve a narração de um roteiro que o TTS RECUSA — e re-dispara a célula.
 *
 * 🔴 O MODO DE FALHA (medido em 17/08/2026, Macaé)
 * ────────────────────────────────────────────────
 * A célula `72b704c6 × Diretor(a) Escolar × I` falhou TRÊS vezes com
 * `TTS: resposta sem áudio após 4 tentativas` — às 20:56, 21:00 e 22:24, a
 * última rodando SOZINHA, com a fila vazia. No MESMO módulo-base, os DISC C, D e
 * S passaram no mesmo intervalo. Ou seja: não é saturação de fornecedor, é o
 * TEXTO daquele roteiro.
 *
 * O conteúdo explica: o tema é linguagem que acende conflito, e a narração
 * ENCENAVA os rótulos em discurso direto ("Ele é um egoísta que só pensa em
 * si"). Para um classificador de segurança, insulto continua parecendo insulto
 * mesmo quando o propósito é ensinar a não usá-lo — e um bloqueio do Gemini TTS
 * chega como resposta SEM bloco de áudio, não como exceção. Daí a mensagem
 * genérica, que parecia falha de rede.
 *
 * ⚠️ ISTO É UMA HIPÓTESE ATÉ O RENDER PASSAR. Se falhar de novo com o texto
 * limpo, a causa é outra e este script não deve virar receita.
 *
 * A regra da reescrita: **referir o rótulo, nunca pronunciá-lo**. O valor
 * pedagógico está em ensinar a trocar julgamento por descrição — e isso se
 * ensina dizendo "acusar o colega de falta de compromisso", não encenando a
 * acusação. Nenhuma cena perde conteúdo.
 *
 * Uso:
 *   npx tsx scripts/_reescrever-narracao-video.ts --video=<uuid>            → mostra o diff
 *   npx tsx scripts/_reescrever-narracao-video.ts --video=<uuid> --executar → cria a célula nova e dispara
 */
process.loadEnvFile('.env.local');
import { createSupabaseAdmin } from '@/lib/supabase';
import { tasks } from '@trigger.dev/sdk';
import { regionOpts } from '@/lib/trigger-region';

const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=')[1];
const VIDEO_ID = arg('video');
const EXECUTAR = process.argv.includes('--executar');

/**
 * Trocas literais, na ordem. Texto exato para não reescrever por regex frouxa —
 * uma substituição que "quase casa" produziria uma frase quebrada narrada para
 * gente real.
 */
const TROCAS: Array<[string, string]> = [
  [
    'Uma professora diz que o colega é descompromissado, na frente de todo mundo.',
    'Uma professora acusa o colega de falta de compromisso, na frente de todo mundo.',
  ],
  [
    'Rótulos de caráter: egoísta, irresponsável.',
    'Rótulos de caráter, que julgam quem a pessoa é em vez do que ela fez.',
  ],
  [
    'Você sempre chega atrasado não dá nada pra pessoa fazer amanhã.',
    'Dizer que alguém sempre chega atrasado não dá nada pra pessoa fazer amanhã.',
  ],
  [
    'E quando o rótulo explode na mediação? Ele é um egoísta que só pensa em si.',
    'E quando o rótulo explode na mediação, com alguém acusando o outro de só pensar em si mesmo?',
  ],
];

function reescrever(texto: string): { novo: string; aplicadas: string[] } {
  let novo = texto;
  const aplicadas: string[] = [];
  for (const [de, para] of TROCAS) {
    if (novo.includes(de)) { novo = novo.split(de).join(para); aplicadas.push(de.slice(0, 40) + '…'); }
  }
  return { novo, aplicadas };
}

async function main() {
  if (!VIDEO_ID) throw new Error('--video=<uuid> é obrigatório');
  const sb = createSupabaseAdmin();

  const { data: v, error } = await sb.from('videos_gerados')
    .select('id, modulo_base_id, empresa_id, cargo, disc_dominante, kit_id, roteiro, status')
    .eq('id', VIDEO_ID).maybeSingle();
  if (error) throw new Error(`videos_gerados: ${error.message}`);
  if (!v) throw new Error('vídeo não encontrado');

  const roteiro = JSON.parse(JSON.stringify((v as any).roteiro));
  const cenas = roteiro.scenes || [];
  let total = 0;

  for (const [i, c] of cenas.entries()) {
    const original = c.narration ?? c.narracao ?? '';
    if (!original) continue;
    const { novo, aplicadas } = reescrever(original);
    if (novo === original) continue;
    total += aplicadas.length;
    console.log(`\n── cena ${i + 1} (${aplicadas.length} troca(s))`);
    console.log(`   ANTES: ${original.slice(0, 150)}`);
    console.log(`   DEPOIS: ${novo.slice(0, 150)}`);
    if ('narration' in c) c.narration = novo; else c.narracao = novo;
  }

  console.log(`\n${total} troca(s) em ${cenas.length} cena(s).`);
  if (!total) { console.log('nada a reescrever — o texto já está limpo (ou as frases mudaram).'); return; }
  if (!EXECUTAR) { console.log('\ndry-run — rode com --executar para criar a célula e disparar.'); return; }

  // Célula NOVA: o índice único é parcial (`WHERE status <> 'error'`), então a
  // linha antiga em erro não bloqueia — e fica no histórico como o registro de
  // que o texto anterior foi recusado.
  const { data: novo, error: eI } = await sb.from('videos_gerados').insert({
    modulo_base_id: (v as any).modulo_base_id,
    empresa_id: (v as any).empresa_id,
    cargo: (v as any).cargo,
    disc_dominante: (v as any).disc_dominante,
    kit_id: (v as any).kit_id,
    status: 'processing',
    etapa: 'roteiro',
    roteiro,
    created_by: 'narracao-reescrita',
  }).select('id').maybeSingle();
  if (eI || !novo?.id) throw new Error(`insert: ${eI?.message || 'sem id'}`);

  try {
    await tasks.trigger('gerar-video-modulo', { videoId: (novo as any).id, roteiro }, regionOpts());
  } catch (e: any) {
    await sb.from('videos_gerados').update({ status: 'error', error: String(e?.message).slice(0, 500) }).eq('id', (novo as any).id);
    throw new Error(`dispatch: ${e?.message}`);
  }

  console.log(`\n✅ célula nova ${(novo as any).id} disparada com a narração reescrita`);
}

main().catch((e) => { console.error(e); process.exit(1); });
