/**
 * A cópia NOSSA das mídias que chegam pelo WhatsApp (foto, áudio, vídeo,
 * documento).
 *
 * 🔴 POR QUE EXISTE (17/09/2026)
 * ─────────────────────────────
 * O webhook gravava só o `media id` e a thread buscava o arquivo na Meta na
 * hora de mostrar. A Meta APAGA a mídia recebida em poucos dias. Medido: das 23
 * mídias recebidas desde 14/08, 19 respondiam `400 (#100/33) Object … does not
 * exist`, a mais nova com 7 dias e meio; as de 2 dias ou menos baixavam. Na caixa
 * isso era imagem quebrada e áudio "0:00" que não tocava, sem aviso de que o
 * arquivo tinha deixado de existir, e quem atendia respondia "não consegui abrir
 * a imagem que você me enviou".
 *
 * Um número na Cloud API não tem aplicativo: se a cópia não for feita aqui, o
 * arquivo não existe em lugar nenhum depois que a Meta o apaga.
 *
 * QUEM CHAMA
 * ──────────
 * 1. O webhook, via `after()`, no instante em que a mensagem chega.
 * 2. O proxy `/api/inbox/midia/[mediaId]`, na primeira vez que alguém abre uma
 *    mídia sem cópia (rede de segurança para falha do passo 1, enquanto a Meta
 *    ainda tiver o original).
 *
 * O caminho no Storage deriva do `media id`, então nenhuma coluna nova guarda
 * onde o arquivo está: quem tem o id acha a cópia.
 *
 * O client do Supabase vem de quem chama (o webhook já tem o dele; a rota passa
 * pelo gate de admin). Este módulo não cria client service-role próprio, para
 * não alargar a superfície vigiada pelo `service-role-guard`.
 */
import { urlDaMidia, baixarMidia } from '@/lib/whatsapp/cloud-api';

/** Bucket privado da mig 259. Separado de `inbox-anexos`, que é descartável. */
export const BUCKET_MIDIA_RECEBIDA = 'inbox-midia-recebida';

/**
 * Validade da URL assinada que a TELA recebe.
 *
 * Uma hora, e não os 5 minutos do anexo enviado, por causa do áudio: o player
 * busca os metadados ao abrir a conversa e o resto quando alguém aperta o play,
 * pela URL já redirecionada. Quem lê a conversa por 6 minutos antes de ouvir
 * encontraria o link vencido e o player mudo, que é o defeito que isto conserta.
 */
export const TTL_LEITURA_SEGUNDOS = 3600;

/**
 * O id da Meta é numérico. Validar antes de usar impede que um valor vindo da
 * URL vire caminho arbitrário no Storage ou chamada arbitrária na Graph.
 */
export function idDeMidiaValido(mediaId: string): boolean {
  return /^\d{5,25}$/.test(String(mediaId || ''));
}

export function caminhoDaMidia(mediaId: string): string {
  return `meta/${mediaId}`;
}

/**
 * `expirada`: a Meta já apagou e não há cópia, é definitivo.
 * `falhou`: rede, token ou Storage; pode dar certo numa próxima tentativa.
 */
export type EstadoGuarda = 'guardada' | 'ja-guardada' | 'expirada' | 'falhou';

/**
 * ⚠️ Interface achatada, não união discriminada: com `strict: false` no
 * `tsconfig` o TypeScript não estreita por literal (mesma razão de
 * `Classificacao` em `lib/inbox/anexos.ts`).
 */
export interface ResultadoGuarda {
  estado: EstadoGuarda;
  /**
   * O binário, quando chegou a ser baixado. Serve ao proxy quando o Storage
   * falha: melhor mostrar o arquivo sem guardar do que não mostrar.
   */
  body?: ArrayBuffer;
  mime?: string;
  reason?: string;
}

function jaExiste(error: any): boolean {
  const status = String(error?.statusCode ?? error?.status ?? '');
  return status === '409' || /already exists|duplicate/i.test(String(error?.message || ''));
}

/**
 * Baixa da Meta e grava no bucket. NUNCA lança: roda dentro do webhook, onde
 * exceção vira evento perdido.
 *
 * Idempotente: a Meta reentrega o mesmo evento, e a segunda gravação responde
 * `ja-guardada` sem sobrescrever (`upsert: false`).
 */
export async function guardarMidiaRecebida(mediaId: string, sb: any): Promise<ResultadoGuarda> {
  if (!idDeMidiaValido(mediaId)) return { estado: 'falhou', reason: 'id de mídia inválido' };

  try {
    const meta = await urlDaMidia(mediaId);
    if (!meta.ok || !meta.url) {
      return { estado: meta.expirada ? 'expirada' : 'falhou', reason: meta.reason };
    }

    const arquivo = await baixarMidia(meta.url);
    if (!arquivo.ok || !arquivo.body) return { estado: 'falhou', reason: arquivo.reason };

    // O `mime_type` da Graph é o mais específico ("audio/ogg; codecs=opus"); o
    // header do download fica de reserva.
    const mime = meta.mime || arquivo.mime || 'application/octet-stream';
    const { error } = await sb.storage
      .from(BUCKET_MIDIA_RECEBIDA)
      .upload(caminhoDaMidia(mediaId), arquivo.body, { contentType: mime, upsert: false });

    if (error) {
      if (jaExiste(error)) return { estado: 'ja-guardada', body: arquivo.body, mime };
      return { estado: 'falhou', body: arquivo.body, mime, reason: `storage: ${error.message}` };
    }
    return { estado: 'guardada', body: arquivo.body, mime };
  } catch (e: any) {
    return { estado: 'falhou', reason: `exceção: ${e?.message || String(e)}` };
  }
}

/** URL assinada da cópia, ou `null` se ainda não há cópia. */
export async function urlDaCopia(mediaId: string, sb: any): Promise<string | null> {
  if (!idDeMidiaValido(mediaId)) return null;
  const { data, error } = await sb.storage
    .from(BUCKET_MIDIA_RECEBIDA)
    .createSignedUrl(caminhoDaMidia(mediaId), TTL_LEITURA_SEGUNDOS);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

/** Frase para a TELA quando o arquivo não existe mais em lugar nenhum. */
export const MENSAGEM_MIDIA_EXPIRADA =
  'Este arquivo não está mais disponível: o WhatsApp apaga as mídias depois de alguns dias, e esta não teve cópia guardada no Vertho a tempo. Se ainda for importante, peça o reenvio.';
