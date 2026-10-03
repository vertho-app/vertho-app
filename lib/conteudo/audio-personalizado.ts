/**
 * Podcast PERSONALIZADO (o episódio com "Olá, {nome}. Que bom ter você aqui."):
 * onde mora e como se entrega.
 *
 * Continuação do R-74 (revisão de 02/10/2026). O áudio é gerado POR PESSOA e
 * guardado como cache para o próximo play. Até 03/10/2026 ele ia para o bucket
 * `conteudos`, que é PÚBLICO, em `final/audio-personalizado/{conteudo}/{colab}.mp3`,
 * e a rota `/api/conteudo/[id]/podcast` autorizava quem pedia e então
 * redirecionava para a URL pública e PERMANENTE. A autorização valia para o
 * clique; o link que o player recebia valia para sempre e para qualquer um
 * (encaminhado, num histórico, na aba de rede). Medido em 03/10/2026: 288
 * objetos (1,5 GB) de 7 empresas, todos com o primeiro nome da pessoa na voz.
 *
 * A regra daqui em diante, a mesma dos relatórios organizacionais
 * (`lib/relatorios/relatorio-privado.ts`):
 *  · o escritor grava no bucket PRIVADO `relatorios-pdf`, em
 *    `{empresaId}/audio-personalizado/{conteudoId}/{colaboradorId}.mp3`, sendo
 *    `empresaId` a empresa da PESSOA (o dado é dela; o conteúdo pode ser do
 *    catálogo global);
 *  · o leitor autoriza antes (a rota do podcast já fazia isso) e só então pede
 *    um link ASSINADO; a aplicação não entrega mais URL permanente a ninguém;
 *  · enquanto o estoque antigo não for migrado
 *    (`scripts/_migrar-audio-personalizado.mjs`), a leitura procura também no
 *    formato antigo, e o antigo também sai por link assinado.
 *
 * Não há linha de banco apontando para esses arquivos (varredura de 03/10/2026
 * nas colunas de texto e JSON do schema `public`): o caminho é derivado de
 * (empresa, conteúdo, pessoa), nos dois formatos.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { BUCKET_LEGADO, BUCKET_RELATORIOS } from '@/lib/relatorios/relatorio-privado';

/** Bucket privado (sem URL pública). O mesmo dos relatórios e da devolutiva em áudio. */
export const BUCKET_AUDIO_PERSONALIZADO = BUCKET_RELATORIOS;
/** Bucket PÚBLICO onde o áudio morava até 03/10/2026. Só leitura, até a migração. */
export const BUCKET_AUDIO_LEGADO = BUCKET_LEGADO;
/** Pasta, dentro da pasta da empresa, no bucket privado. */
export const PASTA_AUDIO_PERSONALIZADO = 'audio-personalizado';

/**
 * Validade do link assinado. Mais longa que a do relatório (5 min) por causa do
 * PLAYER: o `<audio>` segue o 302 e depois pede pedaços do arquivo (Range) na
 * URL assinada enquanto a pessoa ouve, pausa e volta. O episódio mais longo
 * medido tem uns 11 minutos (7,8 MB a 96 kbps); com 5 minutos de validade, quem
 * pausasse no meio voltaria para um player quebrado. Uma hora cobre ouvir com
 * pausa e ainda é um link que expira, ao contrário do público, que não expira
 * nunca. Recarregar a página pede um link novo à rota.
 */
export const TTL_LINK_AUDIO_SEGUNDOS = 3600;

export type StorageClient = SupabaseClient['storage'];

export type ChaveAudioPersonalizado = {
  /** Empresa da PESSOA. */
  empresaId: string;
  conteudoId: string;
  colaboradorId: string;
};

export type RefAudioPersonalizado = {
  bucket: typeof BUCKET_AUDIO_PERSONALIZADO | typeof BUCKET_AUDIO_LEGADO;
  /** Caminho DENTRO do bucket. */
  caminho: string;
  legado: boolean;
};

/**
 * Segmento seguro de caminho. É a mesma troca que os escritores antigos faziam
 * (`[^a-zA-Z0-9_-]` vira `_`), então um id produz o MESMO segmento nos dois
 * formatos. Sem ponto e sem barra: um segmento nunca sobe nem desce de pasta.
 */
export const segmentoAudio = (valor: unknown) => String(valor ?? '').replace(/[^a-zA-Z0-9_-]/g, '_');

/**
 * Caminho NOVO, no bucket privado. Lança se a chave não identifica empresa,
 * conteúdo e pessoa: um arquivo sem empresa no caminho não teria dono, e um
 * segmento vazio colapsaria pastas (`a//b.mp3`).
 *
 * Os três segmentos passam pela mesma troca de caracteres: o caminho é
 * derivado no servidor (empresa e pessoa vêm do banco), e mesmo assim nenhum
 * segmento consegue carregar barra ou ponto.
 */
export function caminhoAudioPersonalizado(chave: ChaveAudioPersonalizado): string {
  const empresa = segmentoAudio(chave?.empresaId);
  const conteudo = segmentoAudio(chave?.conteudoId);
  const colab = segmentoAudio(chave?.colaboradorId);
  if (!empresa) throw new Error('caminhoAudioPersonalizado: empresa obrigatória');
  if (!conteudo || !colab) throw new Error('caminhoAudioPersonalizado: conteúdo e colaborador são obrigatórios');
  return `${empresa}/${PASTA_AUDIO_PERSONALIZADO}/${conteudo}/${colab}.mp3`;
}

/** Caminho ANTIGO, no bucket público (formato de antes de 03/10/2026). Não leva empresa. */
export function caminhoAudioPersonalizadoLegado(chave: Pick<ChaveAudioPersonalizado, 'conteudoId' | 'colaboradorId'>): string {
  return `final/audio-personalizado/${segmentoAudio(chave.conteudoId)}/${segmentoAudio(chave.colaboradorId)}.mp3`;
}

// "Object not found" é ausência; "Bucket not found" é configuração quebrada, e
// tratá-la como ausência mandaria gerar (e pagar) um áudio que não teria onde morar.
const naoEncontrado = (msg: string) => /not.?found|não encontrad/i.test(msg) && !/bucket/i.test(msg);

/** Link assinado de UMA referência já autorizada. "Não existe" volta separado de "falhou". */
export async function assinarAudioPersonalizado(
  storage: StorageClient,
  ref: Pick<RefAudioPersonalizado, 'bucket' | 'caminho'>,
): Promise<{ url: string } | { ausente: true } | { erro: string }> {
  const { data, error } = await storage.from(ref.bucket).createSignedUrl(ref.caminho, TTL_LINK_AUDIO_SEGUNDOS);
  if (error || !data?.signedUrl) {
    const msg = error?.message || 'link não gerado';
    return naoEncontrado(msg) ? { ausente: true } : { erro: msg };
  }
  return { url: data.signedUrl };
}

/**
 * Procura o áudio já gerado de (empresa, conteúdo, pessoa) e devolve um link
 * assinado. Ordem: bucket privado primeiro, formato antigo depois.
 *
 * Três respostas, de propósito distintas:
 *  · `url`: existe, e o link é assinado e expira;
 *  · `ausente`: não existe em nenhum dos dois lugares (quem chama gera);
 *  · `erro`: o Storage não respondeu. Quem chama NÃO deve tratar isso como
 *    ausência: gerar de novo é pagar TTS e esperar minutos por um arquivo que
 *    provavelmente já existe.
 *
 * A existência é conferida pelo próprio pedido de assinatura (o Storage
 * recusa assinar objeto que não existe). Antes, a rota BAIXAVA o MP3 inteiro
 * (até 7,8 MB) só para saber se ele existia, a cada play.
 */
export async function localizarAudioPersonalizado(
  storage: StorageClient,
  chave: ChaveAudioPersonalizado,
): Promise<({ url: string } & RefAudioPersonalizado) | { ausente: true } | { erro: string }> {
  const novo: RefAudioPersonalizado = {
    bucket: BUCKET_AUDIO_PERSONALIZADO,
    caminho: caminhoAudioPersonalizado(chave),
    legado: false,
  };
  const noPrivado = await assinarAudioPersonalizado(storage, novo);
  if ('url' in noPrivado) return { ...novo, url: noPrivado.url };
  if ('erro' in noPrivado) return noPrivado;

  const antigo: RefAudioPersonalizado = {
    bucket: BUCKET_AUDIO_LEGADO,
    caminho: caminhoAudioPersonalizadoLegado(chave),
    legado: true,
  };
  const noLegado = await assinarAudioPersonalizado(storage, antigo);
  if ('url' in noLegado) return { ...antigo, url: noLegado.url };
  return noLegado;
}

/** Grava no bucket PRIVADO e devolve o caminho. Falha de upload volta como erro, não como sucesso. */
export async function salvarAudioPersonalizado(
  storage: StorageClient,
  chave: ChaveAudioPersonalizado,
  corpo: Buffer | Uint8Array,
  contentType: string,
): Promise<{ caminho: string } | { erro: string }> {
  const caminho = caminhoAudioPersonalizado(chave);
  const { error } = await storage.from(BUCKET_AUDIO_PERSONALIZADO).upload(caminho, corpo, {
    contentType: contentType || 'audio/mpeg',
    upsert: true,
  });
  if (error) return { erro: error.message };
  return { caminho };
}

export type AudioPersonalizadoListado = RefAudioPersonalizado & {
  /** Nome do arquivo sem `.mp3`: o id (segmento) do colaborador. */
  colaboradorId: string;
};

/**
 * Lista os áudios personalizados de UM conteúdo de UMA empresa, nos dois
 * lugares. Serve ao reset da demo, que reaponta o cache das personas para o id
 * novo delas. Na pasta antiga não há empresa no caminho: quem chama filtra
 * pelas pessoas que reconhece (o reset casa pelo id da persona).
 *
 * Erro de listagem volta como erro: um snapshot que "não achou nada" porque o
 * Storage falhou faria o reset pagar TTS de novo em silêncio.
 */
export async function listarAudiosPersonalizadosDoConteudo(
  storage: StorageClient,
  empresaId: string,
  conteudoId: string,
): Promise<{ audios: AudioPersonalizadoListado[]; erros: string[] }> {
  const segmento = segmentoAudio(conteudoId);
  const pastaNova = `${segmentoAudio(empresaId)}/${PASTA_AUDIO_PERSONALIZADO}/${segmento}`;
  const pastaAntiga = `final/audio-personalizado/${segmento}`;
  const [novos, antigos] = await Promise.all([
    storage.from(BUCKET_AUDIO_PERSONALIZADO).list(pastaNova, { limit: 1000 }),
    storage.from(BUCKET_AUDIO_LEGADO).list(pastaAntiga, { limit: 1000 }),
  ]);

  const erros: string[] = [];
  const audios: AudioPersonalizadoListado[] = [];
  const coletar = (bucket: RefAudioPersonalizado['bucket'], pasta: string, itens: any[] | null, legado: boolean) => {
    for (const item of itens || []) {
      const nome = String(item?.name || '');
      if (!nome.endsWith('.mp3') || Number(item?.metadata?.size || 0) <= 0) continue;
      audios.push({ bucket, caminho: `${pasta}/${nome}`, legado, colaboradorId: nome.slice(0, -4) });
    }
  };

  if (novos.error) erros.push(`${BUCKET_AUDIO_PERSONALIZADO}/${pastaNova}: ${novos.error.message}`);
  else coletar(BUCKET_AUDIO_PERSONALIZADO, pastaNova, novos.data, false);
  if (antigos.error) erros.push(`${BUCKET_AUDIO_LEGADO}/${pastaAntiga}: ${antigos.error.message}`);
  else coletar(BUCKET_AUDIO_LEGADO, pastaAntiga, antigos.data, true);

  return { audios, erros };
}

/**
 * Move um áudio já existente (de qualquer um dos dois lugares) para o caminho
 * NOVO de `destino`. O que vem do formato antigo atravessa para o bucket
 * privado: mover a cópia antiga para outro caminho do bucket público seria
 * renovar a exposição.
 *
 * A travessia é download, upload e remoção, e não o `move` entre buckets do
 * Storage: são as três operações que a base já usa em produção, e um `move`
 * cruzado que o servidor recusasse derrubaria o reset inteiro da demo. Se a
 * remoção do antigo falhar, a cópia nova já vale (a leitura prefere o
 * privado) e o antigo vira resto que a migração recolhe: volta como `aviso`.
 */
export async function moverAudioPersonalizado(
  storage: StorageClient,
  origem: Pick<RefAudioPersonalizado, 'bucket' | 'caminho'>,
  destino: ChaveAudioPersonalizado,
): Promise<{ caminho: string; aviso?: string } | { erro: string }> {
  const caminho = caminhoAudioPersonalizado(destino);
  if (origem.bucket === BUCKET_AUDIO_PERSONALIZADO) {
    if (origem.caminho === caminho) return { caminho };
    const { error } = await storage.from(BUCKET_AUDIO_PERSONALIZADO).move(origem.caminho, caminho);
    if (error) return { erro: error.message };
    return { caminho };
  }

  const baixado = await storage.from(origem.bucket).download(origem.caminho);
  if (baixado.error || !baixado.data) return { erro: `download ${origem.caminho}: ${baixado.error?.message || 'vazio'}` };
  const corpo = Buffer.from(await baixado.data.arrayBuffer());
  const { error: upErr } = await storage.from(BUCKET_AUDIO_PERSONALIZADO).upload(caminho, corpo, {
    contentType: 'audio/mpeg',
    upsert: true,
  });
  if (upErr) return { erro: `upload ${caminho}: ${upErr.message}` };
  const { error: rmErr } = await storage.from(origem.bucket).remove([origem.caminho]);
  return rmErr ? { caminho, aviso: `remover ${origem.caminho}: ${rmErr.message}` } : { caminho };
}
