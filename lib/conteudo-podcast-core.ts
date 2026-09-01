/**
 * Núcleo HEADLESS do áudio de micro-conteúdo (podcast com vinheta).
 *
 * Extraído de `actions/conteudos.ts::gerarPodcastAudio` (01/09/2026) no padrão
 * do projeto: a action `'use server'` aplica o gate e delega; script, seed de
 * demo e task usam este núcleo com o client service-role.
 *
 * Sem isto, quem precisa gerar áudio sem sessão (semear um ambiente de
 * demonstração, por exemplo) copiaria as quinze linhas de upload e update para
 * um script — e o gêmeo copiado é o que envelhece calado quando o caminho do
 * Storage ou o campo do conteúdo mudam.
 */
import 'server-only';

/**
 * ⚠️ NÃO é união discriminada, e isso é obrigatório aqui: o projeto roda com
 * `strict: false`, e nesse modo o TypeScript NÃO estreita união por
 * discriminante booleano. Escrita como `{success:true,...} | {success:false,...}`,
 * ela compila na definição e quebra em QUEM CONSOME — a tela do admin não
 * conseguia ler `r.url` dentro do próprio `if (r.success)`.
 */
export type PodcastAudioResult = {
  success: boolean;
  url?: string;
  message?: string;
  error?: string;
};

/**
 * Gera o MP3 a partir do roteiro já salvo em `conteudo_inline` e publica.
 *
 * `sb` deve ser um client com acesso de escrita ao Storage e à linha; quem
 * chama é responsável pelo gate (a action) ou por ser um caminho de servidor
 * (script/seed/task).
 */
export async function gerarPodcastAudioCore(
  sb: any,
  conteudo: { id: string; formato: string; titulo?: string | null; competencia?: string | null; conteudo_inline?: string | null; empresa_id?: string | null },
  atualizarLinha: (id: string, patch: Record<string, any>) => Promise<any>,
): Promise<PodcastAudioResult> {
  if (!conteudo?.id) return { success: false, error: 'conteúdo obrigatório' };
  if (conteudo.formato !== 'audio') {
    return { success: false, error: 'Áudio TTS disponível apenas para o formato áudio' };
  }
  if (!conteudo.conteudo_inline?.trim()) {
    return { success: false, error: 'Conteúdo sem roteiro inline para narrar' };
  }

  const { extractNarration, generatePodcastAudio } = await import('@/lib/gemini-tts');
  const narracao = extractNarration(conteudo.conteudo_inline);
  if (!narracao || narracao.length < 20) {
    return { success: false, error: 'Não foi possível extrair a narração do roteiro' };
  }

  const audio = await generatePodcastAudio(narracao, { feature: 'tts_podcast', empresaId: conteudo.empresa_id });

  const slug = String(conteudo.competencia || 'geral').replace(/[^a-zA-Z0-9]/g, '_');
  const path = `final/audio/${slug}/${conteudo.id}-${Date.now()}.${audio.extension}`;
  const { error: upErr } = await sb.storage.from('conteudos').upload(path, audio.buffer, {
    contentType: audio.contentType, upsert: true,
  });
  if (upErr) return { success: false, error: `Upload falhou: ${upErr.message}` };

  const { data: { publicUrl } } = sb.storage.from('conteudos').getPublicUrl(path);
  const atualizado = await atualizarLinha(conteudo.id, { url: publicUrl, storage_path: path, ativo: true });
  if (atualizado === null) return { success: false, error: 'Conteúdo não encontrado' };

  return { success: true, url: publicUrl, message: `Áudio com vinheta gerado para "${conteudo.titulo}"` };
}
