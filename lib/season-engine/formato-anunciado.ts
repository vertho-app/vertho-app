/**
 * QUAL formato a mensagem pode prometer — a interseção entre o que a pessoa
 * prefere e o que a semana REALMENTE tem.
 *
 * 🔴 POR QUE ISTO EXISTE (medido em 17/08/2026, na véspera da abertura de Macaé)
 * ──────────────────────────────────────────────────────────────────────────────
 * O anúncio saía de `derivarPrioridadeFormatos(colab)[0]` — a preferência da
 * PESSOA, sem olhar o conteúdo do dia. E o default de quem nunca declarou
 * preferência é `video`. O pré-voo da entrega de 18/08 acusou **35 de 38
 * diretores** com *"promete video · tem case/texto"*: o e-mail diria "Seu vídeo
 * de hoje" e o link levaria a `?formato=video` numa semana sem vídeo nenhum.
 *
 * Não é um erro de cálculo: é uma promessa feita sem consultar o estoque. E cai
 * no primeiro contato do programa, que é onde a confiança se decide.
 *
 * ⚠️ `formatos_disponiveis` NUNCA CONTÉM VÍDEO. O vídeo vem do pipeline de
 * célula e é resolvido AO VIVO (`videos_gerados` com deck assistível). Filtrar
 * só pelo JSON do plano excluiria o vídeo mesmo quando ele existe — por isso a
 * checagem do deck está aqui, e não uma lista estática.
 *
 * Fonte ÚNICA de propósito: antes, o health calculava os formatos entregáveis de
 * um jeito (`coleta.ts`) e o envio prometia de outro. Duas implementações da
 * mesma ideia é a F-estrutural 10 do FMEA — e enquanto o health media certo, o
 * envio prometia errado.
 */
import { derivarPrioridadeFormatos } from './formato-preferido';

/** A célula de vídeo do core tem deck ASSISTÍVEL? (status done + id do Bunny) */
export async function temDeckPronto(
  sb: any,
  empresaId: string,
  coreId: string | null,
  cargo: string | null,
  disc: string | null,
): Promise<boolean> {
  const d1 = String(disc || '').charAt(0).toUpperCase();
  if (!coreId || !cargo || !['D', 'I', 'S', 'C'].includes(d1)) return false;
  const { data: mc } = await sb.from('micro_conteudos')
    .select('modulo_base_id').eq('id', coreId).eq('empresa_id', empresaId).maybeSingle();
  if (!(mc as any)?.modulo_base_id) return false;
  const { data: deck } = await sb.from('videos_gerados')
    .select('id').eq('modulo_base_id', (mc as any).modulo_base_id).eq('empresa_id', empresaId)
    .eq('cargo', cargo).eq('disc_dominante', d1).eq('status', 'done')
    .not('bunny_video_id', 'is', null).limit(1).maybeSingle();
  return !!deck;
}

/**
 * Os formatos que a pessoa consegue MESMO consumir naquele conteúdo.
 *
 * `cache` opcional evita repetir a consulta de deck para o mesmo
 * (core × cargo × DISC) dentro de um disparo — numa coorte, dezenas de pessoas
 * compartilham a mesma célula.
 */
export async function formatosEntregaveis(
  sb: any,
  args: {
    empresaId: string;
    conteudo: any;
    cargo: string | null;
    disc: string | null;
    cacheDeck?: Map<string, boolean>;
  },
): Promise<string[]> {
  const { empresaId, conteudo, cargo, disc, cacheDeck } = args;
  const formatos = Object.keys(conteudo?.formatos_disponiveis || {}).filter((f) => f !== 'video');

  // Kit NOVO (`por_preferencia`): o overlay marca `video_permitido: false` para quem
  // não tem o vídeo entre os 2 primeiros formatos, e a tela o esconde mesmo com o
  // deck pronto (R-88). Prometer vídeo a essa pessoa é prometer o que ela não vê, e
  // sem preferência declarada era TODO MUNDO: o default de `derivarPrioridadeFormatos`
  // é vídeo, e o kit novo trata quem não respondeu como texto + caso. Só `false`
  // fecha a porta: ausente (kit anterior, ou conteúdo que não passou pelo overlay)
  // segue como sempre foi.
  if (conteudo?.video_permitido === false) return formatos;

  const coreId = conteudo?.core_id ?? null;
  const chave = `${coreId}|${cargo}|${String(disc || '').charAt(0).toUpperCase()}`;
  let temVideo = cacheDeck?.get(chave);
  if (temVideo === undefined) {
    temVideo = await temDeckPronto(sb, empresaId, coreId, cargo, disc);
    cacheDeck?.set(chave, temVideo);
  }
  if (temVideo) formatos.push('video');

  return formatos;
}

/**
 * O formato a ANUNCIAR: a primeira preferência que existe de verdade.
 *
 * Sem interseção possível, devolve o primeiro entregável — anunciar um formato
 * que não é o favorito é uma decepção pequena; anunciar um que não existe manda
 * a pessoa procurar o que não está lá. E `null` quando não há formato nenhum:
 * quem chama decide se ainda vale mandar (a semana pode ter só o desafio).
 */
export function escolherFormatoAnunciado(
  colab: any,
  entregaveis: string[],
  opts: { semVideo?: boolean } = {},
): string | null {
  if (!entregaveis.length) return null;
  const preferidos = derivarPrioridadeFormatos(colab).filter((f) => !(opts.semVideo && f === 'video'));
  return preferidos.find((f) => entregaveis.includes(f)) ?? entregaveis[0];
}

/**
 * O que a mensagem diz quando NENHUM formato é entregável: a primeira preferência
 * da pessoa, sem o vídeo se o kit novo o esconde dela (R-88). É a reserva do envio
 * e do health, para que os dois afirmem a mesma coisa.
 */
export function formatoDeReserva(colab: any, opts: { semVideo?: boolean } = {}): string {
  const preferidos = derivarPrioridadeFormatos(colab).filter((f) => !(opts.semVideo && f === 'video'));
  return preferidos[0] ?? 'texto';
}
