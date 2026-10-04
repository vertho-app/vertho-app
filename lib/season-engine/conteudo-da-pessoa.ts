/**
 * O conteúdo do dia COMO A PESSOA O VÊ, para a mensagem da cadência decidir o que
 * pode prometer (R-88, 04/10/2026).
 *
 * 🔴 POR QUE ISTO EXISTE. O cron lia o `conteudo` do PLANO gravado, sem o overlay do
 * kit, enquanto a tela aplica o overlay com os 2 primeiros formatos da pessoa. No kit
 * novo (`por_preferencia`) quem não tem o vídeo entre os 2 primeiros não o vê, mesmo
 * com o deck pronto; e quem nunca declarou preferência (o default de
 * `derivarPrioridadeFormatos` é vídeo) é tratado como texto + estudo de caso. O e-mail
 * dizia "Seu vídeo de hoje" a essa gente e o link abria outro formato. O health
 * (`coleta.ts`) já aplicava o overlay, mas sem os 2 formatos, então também não via.
 *
 * Aqui o cron passa pelo MESMO `overlayKitNaSemana` da tela, com os mesmos 2 formatos
 * (`formatosTop2DaPessoa`), e `formatosEntregaveis` lê o `video_permitido` que o
 * overlay deixa no conteúdo. Kit anterior não marca nada: a pessoa continua vendo
 * tudo, e a mensagem continua prometendo pela preferência.
 *
 * Fora de `'use server'` de propósito (export ali vira endpoint).
 */
import { precarregarKits, overlayKitNaSemana, formatoPreferido, type KitsCache } from './kit/entrega-semana';
import { formatosTop2DaPessoa } from './kit/formatos-por-preferencia';

/**
 * Pré-carrega os kits de uma (cargo × DISC) UMA vez por disparo, e devolve a MESMA
 * promessa para quem pedir a mesma célula: dezenas de pessoas dividem poucos pares.
 *
 * `undefined` quando o pré-carregamento falha. O overlay então cai no resolvedor
 * live, que consulta por semana, e `aoFalhar` deixa o chamador registrar: um kit que
 * não se consegue ler é a mensagem voltando a prometer pela preferência, e isso não
 * pode ser silencioso.
 */
export function criarCacheDeKits(
  sb: any,
  empresaId: string,
  aoFalhar?: (motivo: string, cargo: string | null, disc: string | null) => void | Promise<void>,
): (cargo: string | null, disc: string | null) => Promise<KitsCache | undefined> {
  const porCelula = new Map<string, Promise<KitsCache | undefined>>();
  return (cargo, disc) => {
    const chave = `${String(cargo ?? '').trim().toLowerCase()}|${String(disc ?? '').trim().charAt(0).toUpperCase()}`;
    let pronta = porCelula.get(chave);
    if (!pronta) {
      pronta = precarregarKits(sb, { empresaId, disc, cargo }).catch(async (e: any) => {
        await aoFalhar?.(String(e?.message || e), cargo, disc);
        return undefined;
      });
      porCelula.set(chave, pronta);
    }
    return pronta;
  };
}

/**
 * Cópia do conteúdo de UMA entrega com o overlay do kit aplicado para esta pessoa.
 * Nunca muta o `item` (ele é o plano em memória do cron, que ainda alimenta o tema e
 * o link). `item` tem o formato de `conteudos_dia` (`{ competencia, descritor,
 * conteudo }`); sem `conteudo`, o próprio item é o conteúdo (o formato legado que
 * `formatosEntregaveis` também aceita).
 */
export async function conteudoComoAPessoaVe(
  sb: any,
  args: {
    item: any;
    semana: number;
    colab: any;
    empresaId: string;
    competenciaFoco: string | null;
    kitsCache?: KitsCache;
  },
): Promise<any> {
  const { item, semana, colab, empresaId, competenciaFoco, kitsCache } = args;
  const original = item?.conteudo || item || {};
  const copia = JSON.parse(JSON.stringify(original));
  const disc = String(colab?.perfil_dominante || '').trim().charAt(0).toUpperCase() || null;
  await overlayKitNaSemana(sb, {
    tipo: 'conteudo',
    semana,
    conteudos_dia: [{ competencia: item?.competencia ?? null, descritor: item?.descritor ?? null, conteudo: copia }],
  }, {
    empresaId,
    disc,
    cargo: colab?.cargo ?? null,
    formatoPref: formatoPreferido(colab),
    formatosTop2: formatosTop2DaPessoa(colab),
    competenciaFoco,
    kitsCache,
    // Sem `colaboradorId`: é a PREVISÃO do que a pessoa vê, não a entrega dela. Com ele,
    // o overlay registraria `kit-ausente-disc` de novo, e a leitura de página já o faz.
  });
  return copia;
}
