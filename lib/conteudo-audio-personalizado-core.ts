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
import { localizarAudioPersonalizado, salvarAudioPersonalizado } from '@/lib/conteudo/audio-personalizado';

export type AudioNominalResultado = { success: boolean; cached?: boolean; error?: string };

// ONDE o áudio nominal mora é decisão de privacidade (R-74, 03/10/2026) e vive em UM lugar:
// `lib/conteudo/audio-personalizado.ts`. O áudio diz "Olá, {nome}", é dado DA PESSOA e vai para o bucket PRIVADO,
// na pasta da empresa dela; a rota `/api/conteudo/[id]/podcast` o entrega por link assinado. Este núcleo não monta
// caminho nem escolhe bucket: o Kit, que o chama em lote, não pode recriar o arquivo no bucket público.

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

  // Empresa da PESSOA (lida acima, dentro do tenant do pedido): é a pasta do arquivo no bucket privado.
  const chave = { empresaId, conteudoId: contentId, colaboradorId };
  const achado = await localizarAudioPersonalizado(sb.storage, chave);
  if ('url' in achado) return { success: true, cached: true };
  // Storage fora do ar não é "sem cache": gerar às cegas é pagar TTS por um arquivo que provavelmente já existe.
  if ('erro' in achado) return { success: false, error: `cache do áudio indisponível: ${achado.erro}` };

  const { extractNarration, generatePersonalizedPodcastAudio } = await import('@/lib/gemini-tts');
  const narracao = extractNarration(content.conteudo_inline || '');
  if (narracao.length < 20) return { success: false, error: 'narração curta' };
  const audio = await generatePersonalizedPodcastAudio(narracao, nome, {
    feature: 'tts_podcast_personalizado', empresaId, colaboradorId,
  }, prazoAteMs ? { prazoAteMs } : {});
  const salvo = await salvarAudioPersonalizado(sb.storage, chave, audio.buffer, audio.contentType);
  if ('erro' in salvo) return { success: false, error: salvo.erro };
  return { success: true };
}
