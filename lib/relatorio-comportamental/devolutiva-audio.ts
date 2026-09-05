import 'server-only';

import { callAI } from '@/actions/ai-client';
import { storageSlug } from '@/lib/storage-slug';

export const DEVOLUTIVA_AUDIO_BUCKET = 'relatorios-pdf';

/**
 * Núcleo da devolutiva em voz: roteiro (IA) → TTS → MP3 no bucket privado.
 *
 * POR QUE EM `lib/`, E NÃO NA ACTION. Este trabalho tem DOIS chamadores: o botão
 * "Ouvir devolutiva" (sob demanda, com a sessão da pessoa) e a pré-geração que
 * roda no `after()` do DISC (sem sessão, com o colaborador já resolvido). Uma
 * segunda implementação para o segundo caso é como nasce o gêmeo que diverge —
 * o modo de falha que esta base já pagou três vezes num único dia.
 *
 * ⚠️ Este núcleo NÃO autoriza ninguém: recebe o colaborador já resolvido. Quem
 * chama é que aplica o gate. A action que o expõe nunca pode aceitar `colabId`
 * do cliente sem filtro de empresa — foi exatamente esse o IDOR corrigido em
 * `gerarEsalvarDevolutivaComportamental` (cross-tenant + abuso de TTS).
 */
export async function gerarDevolutivaEmAudioCore({ colab, raw, texts, sb, sobDemanda = false }: {
  colab: any;
  raw: any;
  texts: any;
  /** `true` no botão "Ouvir devolutiva" (a pessoa espera; o portão refaz em paralelo);
   *  `false` na pré-geração do `after()` do DISC (fundo; refaz em série, custa menos). */
  sobDemanda?: boolean;
  /** Client admin do CHAMADOR. Injetado, e não criado aqui: os dois chamadores
   *  já têm o seu, e um `createSupabaseAdmin()` a mais neste arquivo faria a
   *  allowlist de service-role CRESCER — ela só encolhe. */
  sb: any;
}): Promise<{ success: true; path: string } | { error: string }> {

  // Contexto do cargo + empresa, para ancorar os exemplos. Best-effort: a
  // devolutiva sem o contexto é pior, mas sem a devolutiva é pior ainda.
  let cargo: any = null;
  let empresaNome: string | null = null;
  try {
    if (colab.cargo) {
      // `ilike` aqui é intencional e sem curinga: casa o nome do cargo sem
      // depender de caixa. O `{ error }` é CHECADO — o supabase-js retorna em
      // vez de lançar, então sem isto uma falha de query viraria "cargo não
      // encontrado" e a devolutiva sairia sem o contexto, calada.
      const { data, error } = await sb.from('cargos_empresa')
        .select('nome, area_depto, descricao, principais_entregas, stakeholders, decisoes_recorrentes, tensoes_comuns, contexto_cultural, eh_lideranca')
        .eq('empresa_id', colab.empresa_id).ilike('nome', colab.cargo).limit(1).maybeSingle();
      if (error) console.warn('[devolutiva-audio] contexto do cargo:', error.message);
      cargo = data || { nome: colab.cargo };
    }
    const { data: emp, error: empErr } = await sb.from('empresas')
      .select('nome').eq('id', colab.empresa_id).maybeSingle();
    if (empErr) console.warn('[devolutiva-audio] nome da empresa:', empErr.message);
    empresaNome = emp?.nome || null;
  } catch (e: any) {
    // best-effort DECLARADO: a devolutiva sem contexto é pior, mas sem a
    // devolutiva é pior ainda. O que não pode é falhar em silêncio.
    console.warn('[devolutiva-audio] contexto indisponível:', e?.message || e);
  }

  const { derivarArquetipo } = await import('@/lib/disc-arquetipos');
  const { promptDevolutivaComportamental } = await import('@/lib/prompts/devolutiva-comportamental');
  const { getModelForTask } = await import('@/lib/ai-tasks');
  const arquetipo = derivarArquetipo(colab.perfil_dominante);
  const primeiroNome = String(colab.nome_completo || 'você').split(' ')[0];
  const { system, user } = promptDevolutivaComportamental({ primeiroNome, arquetipo, raw, texts, cargo, empresaNome });
  const model = await getModelForTask(colab.empresa_id, 'devolutiva_comportamental');
  const roteiro = await callAI(system, user, { model }, 1500, {
    taskKey: 'devolutiva_comportamental',
    empresaId: colab.empresa_id,
  });
  if (!roteiro?.trim()) return { error: 'Roteiro vazio' };

  // TTS → MP3. Voz Iapetus = a voz do BETO (masculina) desde 05/09/2026, a mesma
  // persona que assina o roteiro acima (era Achird no modelo 3.1; o 2.5 muda o
  // timbre de todo nome de voz, e o Iapetus foi escolhido às cegas e medido —
  // ver PLANO-DERIVA-PODCAST-2026-09-04.md §6b). Override por env
  // GEMINI_TTS_DEVOLUTIVA_VOICE. ⚠️ Voz e estilo andam JUNTOS: o prompt de estilo
  // dirige a prosódia, então trocar só o `voice` deixa a prosódia do gênero anterior.
  //
  // `segmentar: false` = UMA chamada, sem costura. As 8 fatias paralelas de antes
  // saíam cada uma num registro (5,2 st de variação no 3.1; 2,8-3,7 no 2.5), e a
  // pessoa ouvia o Beto trocar de voz a cada 30 segundos. A chamada única passa
  // pelo portão de deriva com alvo de F0 (Iapetus 144 Hz ± 1 st, ~21% de retake).
  const { extractNarration, generateNarrationAudio } = await import('@/lib/gemini-tts');
  const narracao = extractNarration(roteiro);
  const audio = await generateNarrationAudio(narracao, {
    voice: process.env.GEMINI_TTS_DEVOLUTIVA_VOICE || 'Iapetus',
    style: 'Narre em português do Brasil, com voz masculina brasileira acolhedora, segura e íntima, ritmo moderado e pausas reflexivas naturais, como um mentor falando diretamente com a pessoa',
    ledger: { feature: 'tts_devolutiva', empresaId: colab.empresa_id, colaboradorId: colab.id },
    segmentar: false,
    retakeParalelo: sobDemanda,
  });
  if (audio.qa && !audio.qa.ok) console.warn(`[devolutiva-audio] publicada com ressalva do portão de deriva: ${audio.qa.motivos.join('; ')}`);

  const slug = storageSlug(colab.nome_completo, 'colab');
  const path = `${colab.empresa_id}/devolutiva-${slug}-${Date.now()}.mp3`;
  const { error: upErr } = await sb.storage.from(DEVOLUTIVA_AUDIO_BUCKET)
    .upload(path, audio.buffer, { contentType: audio.contentType, upsert: true });
  if (upErr) return { error: `Falha ao salvar áudio: ${upErr.message}` };

  const { error: updErr } = await sb.from('colaboradores')
    .update({ comportamental_audio_path: path, comportamental_audio_at: new Date().toISOString() })
    .eq('id', colab.id).eq('empresa_id', colab.empresa_id);
  if (updErr) return { error: `Falha ao registrar o áudio: ${updErr.message}` };

  return { success: true, path };
}
