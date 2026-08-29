/* eslint-disable */
/**
 * Passos 2 e 3 do fechamento do gap de áudio de "Autocuidado e resiliência emocional"
 * no Ibipeba (o passo 1 é `_gerar-audio-autocuidado-ibipeba.ts`).
 *
 *  (2) ATIVAR os áudios core (nascem `ativo=false`).
 *  (3) REFRESCAR o snapshot `formatos_disponiveis` dos planos — `temporada_plano` é
 *      tirado no build, então conteúdo criado DEPOIS não aparece sozinho (pegadinha 2
 *      do docs/FMEA-PIPELINE.md §7).
 *
 * O refresh é **ADITIVO e CARGO-SAFE**: só ACRESCENTA a chave `audio` a slots que já
 * apontam para um core de autocuidado, e só com áudio do MESMO cargo do colaborador (ou
 * `todos`). NÃO re-seleciona o core — trocar `core_id` aqui mudaria o conteúdo principal
 * da semana de quem já está na trilha, o que não é o pedido (isso é `regerarSemana`).
 *
 * Uso: npx tsx --env-file=.env.local scripts/_ativar-refrescar-audio-autocuidado.ts
 *      npx tsx --env-file=.env.local scripts/_ativar-refrescar-audio-autocuidado.ts --apply
 */
import { createSupabaseAdmin } from '@/lib/supabase';
import { chaveDescritor } from '@/lib/descritores';

const EMP = '0d99fed1-1710-40e3-b32e-7a95c7d023fe';
const COMP_LIKE = 'autocuidado';
const APPLY = process.argv.includes('--apply');

/**
 * Chave de comparação. Usa `chaveDescritor` do motor de propósito: o descritor no plano
 * vem com o CÓDIGO ("COO03_D6 — Busca de apoio") e em micro_conteudos vem só o nome
 * ("Busca de apoio"). Uma normalização caseira aqui não tirava o código e 79 slots
 * ficavam sem casar — é a armadilha das "3 normalizações no mesmo domínio" do FMEA.
 */
function chave(s: string): string {
  return chaveDescritor(String(s || ''));
}

async function main() {
  const sb = createSupabaseAdmin();
  console.log(APPLY ? '🔥 APPLY\n' : '🔍 DRY RUN\n');

  // ── (2) Ativar os áudios core de autocuidado ────────────────────────────────
  const { data: audios } = await sb.from('micro_conteudos')
    .select('id, cargo, descritor, competencia, ativo, url, storage_path, titulo')
    .eq('empresa_id', EMP).eq('formato', 'audio').is('kit_id', null)
    .ilike('competencia', `%${COMP_LIKE}%`);

  const inativos = (audios || []).filter((a: any) => !a.ativo);
  console.log(`(2) áudios core de autocuidado: ${audios?.length || 0} · inativos: ${inativos.length}`);
  for (const a of inativos) console.log(`    → ativar ${String(a.id).slice(0, 8)} ${a.cargo} | ${a.descritor}`);
  if (APPLY && inativos.length) {
    const { error } = await sb.from('micro_conteudos')
      .update({ ativo: true }).in('id', inativos.map((a: any) => a.id)).eq('empresa_id', EMP);
    if (error) throw new Error(`ativar: ${error.message}`);
  }

  const semMp3 = (audios || []).filter((a: any) => !a.url && !a.storage_path);
  if (semMp3.length) {
    console.log(`    ⚠️ ${semMp3.length} sem MP3-base — rodar _pregerar-audio-base-autocuidado.ts`);
    console.log('       (sem base, uma falha no TTS on-demand devolve 404 na tela)');
  }

  // Índice (cargo normalizado, descritor normalizado) → áudio
  const porCargoDesc = new Map<string, any>();
  for (const a of (audios || [])) {
    porCargoDesc.set(`${chave(a.cargo)}::${chave(a.descritor)}`, a);
  }

  // ── (3) Refrescar o snapshot dos planos ─────────────────────────────────────
  const { data: trilhas } = await sb.from('trilhas')
    .select('id, colaborador_id, temporada_plano').eq('empresa_id', EMP).eq('status', 'ativa');
  const { data: colabs } = await sb.from('colaboradores')
    .select('id, nome_completo, cargo').eq('empresa_id', EMP);
  const colabMap = Object.fromEntries((colabs || []).map((c: any) => [c.id, c]));

  // Cores de autocuidado: para saber se o slot é da competência certa.
  const { data: cores } = await sb.from('micro_conteudos')
    .select('id, competencia, descritor, cargo').eq('empresa_id', EMP).is('kit_id', null)
    .ilike('competencia', `%${COMP_LIKE}%`);
  const coreAutocuidado = new Map((cores || []).map((c: any) => [c.id, c]));

  let addRefresh = 0, jaTinha = 0, semAudioDoCargo = 0, trilhasTocadas = 0;

  for (const t of (trilhas || [])) {
    const colab = colabMap[(t as any).colaborador_id];
    if (!colab) continue;
    const plano = JSON.parse(JSON.stringify((t as any).temporada_plano || []));
    let mudou = false;

    for (const s of plano) {
      if (s?.tipo !== 'conteudo') continue;
      for (const [i, e] of (s.conteudos_dia || []).entries()) {
        const coreId = e?.conteudo?.core_id;
        if (!coreId || !coreAutocuidado.has(coreId)) continue;   // só slots de autocuidado

        const fmts = e.conteudo.formatos_disponiveis || (e.conteudo.formatos_disponiveis = {});
        if (fmts.audio) { jaTinha++; continue; }

        // CARGO-SAFE: áudio do cargo do colaborador (ou 'todos'), nunca de outro cargo.
        const desc = e.descritor || coreAutocuidado.get(coreId)?.descritor;
        const audio = porCargoDesc.get(`${chave(colab.cargo)}::${chave(desc)}`)
          || porCargoDesc.get(`todos::${chave(desc)}`);
        if (!audio) {
          semAudioDoCargo++;
          console.log(`    ⚠️ sem áudio p/ ${colab.cargo} | "${desc}" (sem${s.semana} P${i + 1})`);
          continue;
        }

        fmts.audio = { id: audio.id, url: audio.url || null, titulo: audio.titulo || null };
        addRefresh++; mudou = true;
      }
    }

    if (mudou) {
      trilhasTocadas++;
      if (APPLY) {
        const { error } = await sb.from('trilhas').update({ temporada_plano: plano })
          .eq('id', (t as any).id).eq('empresa_id', EMP);
        if (error) throw new Error(`trilha ${(t as any).id}: ${error.message}`);
      }
    }
  }

  console.log(`\n(3) ${APPLY ? 'gravado' : 'seria adicionado'}: audio em ${addRefresh} slot(s) de ${trilhasTocadas} trilha(s)`);
  console.log(`    já tinham audio: ${jaTinha} · sem áudio do cargo: ${semAudioDoCargo}`);
  if (!APPLY) console.log('\n→ rode com --apply');
}
main().then(() => process.exit(0)).catch((e) => { console.error('FALHOU:', e?.message || e); process.exit(1); });
