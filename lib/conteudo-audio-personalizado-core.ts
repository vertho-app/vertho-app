/**
 * Núcleo HEADLESS do áudio NOMINAL do podcast ("Olá, {nome}" + roteiro), com cache por pessoa.
 *
 * Extraído de `actions/conteudos.ts::prepararAudioPersonalizado` (03/10/2026) no padrão do projeto: a action `'use server'`
 * aplica o gate de sessão e delega; o Kit, que roda numa task sem sessão, usa este núcleo para PRÉ-GERAR o áudio de quem tem
 * podcast entre os 2 primeiros formatos. Antes disso o áudio nominal só nascia na primeira audição (~2 min de espera,
 * US$ 0,06, medido na Boehringer em 03/10), enquanto o vídeo, que já vem com a saudação pronta, abria na hora.
 *
 * Quem chama é responsável pela AUTORIZAÇÃO (a action) ou por ser caminho de servidor (task/script). O núcleo, por sua vez,
 * não confia no que recebe: o NOME vem do banco, o tenant do conteúdo tem que ser o do pedido e o colaborador é lido DENTRO
 * desse tenant (um conteúdo do tenant A nunca ganha o nome de alguém do tenant B).
 */
import 'server-only';

export type AudioNominalResultado = { success: boolean; cached?: boolean; error?: string };

const sani = (v: string) => String(v || '').replace(/[^a-zA-Z0-9_-]/g, '_');

/** Onde o áudio nominal de uma pessoa fica no Storage. A rota `/api/conteudo/[id]/podcast` lê exatamente este caminho. */
export const caminhoAudioNominal = (contentId: string, colaboradorId: string) =>
  `final/audio-personalizado/${sani(contentId)}/${sani(colaboradorId)}.mp3`;

export async function prepararAudioNominalCore(
  sb: any,
  args: { empresaId: string; contentId: string; colaboradorId: string; prazoAteMs?: number },
): Promise<AudioNominalResultado> {
  const { empresaId, contentId, colaboradorId, prazoAteMs } = args;
  if (!empresaId || !contentId || !colaboradorId) return { success: false, error: 'empresa, conteúdo e colaborador são obrigatórios' };

  const { data: content, error: errContent } = await sb.from('micro_conteudos')
    .select('id, formato, conteudo_inline, empresa_id').eq('id', contentId).eq('empresa_id', empresaId).maybeSingle();
  if (errContent) return { success: false, error: `leitura do conteúdo: ${errContent.message}` };
  if (!content || content.formato !== 'audio') return { success: false, error: 'não é áudio (ou não é deste tenant)' };

  // O NOME vai para dentro do áudio e é o que a pessoa ouve: vem do BANCO, dentro do tenant do conteúdo.
  const { data: alvo, error: errAlvo } = await sb.from('colaboradores')
    .select('nome_completo, empresa_id').eq('id', colaboradorId).eq('empresa_id', empresaId).maybeSingle();
  if (errAlvo) return { success: false, error: `leitura do colaborador: ${errAlvo.message}` };
  const nome = alvo?.nome_completo?.trim();
  if (!nome) return { success: false, error: 'colaborador sem nome (ou de outro tenant)' };

  const caminho = caminhoAudioNominal(contentId, colaboradorId);
  const { data: emCache } = await sb.storage.from('conteudos').download(caminho);
  if (emCache) return { success: true, cached: true };

  const { extractNarration, generatePersonalizedPodcastAudio } = await import('@/lib/gemini-tts');
  const narracao = extractNarration(content.conteudo_inline || '');
  if (narracao.length < 20) return { success: false, error: 'narração curta' };
  const audio = await generatePersonalizedPodcastAudio(narracao, nome, {
    feature: 'tts_podcast_personalizado', empresaId, colaboradorId,
  }, prazoAteMs ? { prazoAteMs } : {});
  const { error } = await sb.storage.from('conteudos').upload(caminho, audio.buffer, { contentType: audio.contentType, upsert: true });
  if (error) return { success: false, error: error.message };
  return { success: true };
}
