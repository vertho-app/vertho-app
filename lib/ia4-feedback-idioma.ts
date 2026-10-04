/**
 * A devolutiva da IA4 no idioma da PESSOA (Onda F, 04/10/2026).
 *
 * A tela de resultado do mapeamento mostra `respostas.feedback_ia4`: os três textos de `avaliacao.feedback`
 * (`resumo_geral`, `mensagem_positiva`, `mensagem_construtiva`). Até aqui eles saíam no idioma do cookie de quem
 * disparou a avaliação (síncrono) ou em pt-BR (lote), e a pessoa de outro idioma lia a devolutiva noutro idioma.
 *
 * 🔴 POR QUE NÃO É `locale` NA CHAMADA DA IA4. O JSON da IA4 é de NOTA: o código consolida por NOME de descritor
 * (`consolidarNotasIA4`, `resolverNomeOficial`), o `trecho` das evidências é citação da resposta da pessoa e o
 * `racional` e os `limites` são lidos pelo admin e pelo auditor. Pedir "traduza" ali convida o modelo a traduzir o
 * nome do descritor junto com a prosa, e a nota se perderia sem erro. Aqui o desenho é o do `sem14_redacao`: a nota
 * sai SEMPRE em pt-BR (a chamada da IA4 fixa `locale: 'pt-BR'`), e uma segunda chamada, pequena, reescreve SÓ os três
 * textos que a pessoa lê. O resto do JSON não passa por ela: o que muda no objeto são três strings.
 *
 * Quem é pt-BR (o padrão, e quase todo mundo hoje) não gasta chamada nenhuma e o resultado é byte a byte o de
 * antes. Falha da redação NUNCA derruba a avaliação: o feedback fica em pt-BR e a degradação fica registrada.
 */
import { callAI } from '@/actions/ai-client';
import { extractJSON } from '@/actions/utils';
import { defaultLocale, type AppLocale } from '@/i18n/routing';
import { getModelForTask } from '@/lib/ai-tasks';
import { registrarDegradacao, DEGRADACAO } from '@/lib/degradacao';
import { idiomaDaPessoa } from '@/lib/pdf-locale';
import { maskColaborador, maskTextPII, unmaskPII } from '@/lib/pii-masker';

/** Os textos de `avaliacao.feedback` que formam `feedback_ia4`: o que a pessoa lê. Nenhum outro campo é reescrito. */
export const CAMPOS_DO_FEEDBACK = ['resumo_geral', 'mensagem_positiva', 'mensagem_construtiva'] as const;

const FEEDBACK_MAX_TOKENS = 2000;

export const SYSTEM_FEEDBACK_IA4 = `Você reescreve a devolutiva que um profissional lê sobre a avaliação das respostas dele.
Você recebe até três textos em português (resumo_geral, mensagem_positiva e mensagem_construtiva). Reescreva cada um no idioma indicado na seção "IDIOMA DA EXPERIÊNCIA", como uma tradução fiel: o mesmo sentido, a mesma intensidade, o mesmo tom de mentor e uma extensão parecida.
NÃO avalie de novo. NÃO acrescente nem retire elogio, crítica, fato, nota, nível ou recomendação.
Preserve exatamente: o identificador da pessoa (como COLAB_xxxx), as citações literais entre aspas, os nomes de competências e de descritores e os códigos.
Devolva SOMENTE um objeto JSON com as mesmas chaves que você recebeu, cada uma com o texto reescrito, sem markdown e sem texto antes ou depois.`;

export interface ContextoDoFeedback {
  empresaId?: string | null;
  colaboradorId?: string | null;
  /** O cadastro da pessoa: dele sai o identificador que mascara o nome na ida e o devolve na volta. */
  colab?: any;
  /** Para a chave da degradação (a resposta avaliada). */
  respostaId?: string | null;
}

export interface FeedbackNoIdioma {
  /** O `feedback` a gravar: o MESMO objeto de entrada quando nada foi reescrito, uma cópia com três strings trocadas quando foi. */
  feedback: any;
  locale: AppLocale;
  reescrito: boolean;
}

const ehTexto = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;

/**
 * Devolve o `feedback` da avaliação no idioma da pessoa (`colaboradores.locale`, senão `empresas.default_locale`,
 * senão pt-BR). Nunca lança. Só mexe nos campos de `CAMPOS_DO_FEEDBACK` que vierem como texto.
 */
export async function feedbackNoIdiomaDaPessoa(feedback: any, ctx: ContextoDoFeedback): Promise<FeedbackNoIdioma> {
  const intacto = (locale: AppLocale): FeedbackNoIdioma => ({ feedback, locale, reescrito: false });
  if (!feedback || typeof feedback !== 'object' || Array.isArray(feedback)) return intacto(defaultLocale);
  const campos = CAMPOS_DO_FEEDBACK.filter((c) => ehTexto(feedback[c]));
  if (campos.length === 0 || !ctx.empresaId || !ctx.colaboradorId) return intacto(defaultLocale);

  const locale = await idiomaDaPessoa(ctx.empresaId, ctx.colaboradorId);
  // pt-BR é o idioma da avaliação: nada a reescrever, e a chamada nem acontece.
  if (locale === defaultLocale) return intacto(locale);

  const falhou = async (motivo: string): Promise<FeedbackNoIdioma> => {
    console.warn(`[ia4_feedback] devolutiva fica em pt-BR (${locale}): ${motivo}`);
    await registrarDegradacao({
      fluxo: 'assessment', tipo: DEGRADACAO.FEEDBACK_IA4_SEM_IDIOMA,
      chave: ctx.respostaId || ctx.colaboradorId!, empresaId: ctx.empresaId, colaboradorId: ctx.colaboradorId,
      detalhe: { locale, motivo: String(motivo).slice(0, 300) },
    });
    return intacto(locale);
  };

  try {
    // O nome da pessoa vai como identificador, como em toda chamada de IA com dado dela: o feedback já voltou
    // com o nome (`consolidarEPersistirIA4` o devolve antes), então aqui ele é mascarado de novo na ida.
    const { map } = maskColaborador(ctx.colab);
    const entrada: Record<string, string> = {};
    for (const c of campos) entrada[c] = maskTextPII(feedback[c], map);

    const model = await getModelForTask(ctx.empresaId, 'ia4_feedback');
    const bruto = await callAI(SYSTEM_FEEDBACK_IA4, JSON.stringify(entrada, null, 2), { model }, FEEDBACK_MAX_TOKENS, {
      taskKey: 'ia4_feedback', empresaId: ctx.empresaId, colaboradorId: ctx.colaboradorId, locale,
    });
    const saida = await extractJSON(bruto);
    if (!saida || typeof saida !== 'object') return falhou('resposta sem JSON');

    // Troca SÓ o que voltou como texto; o que não voltou fica como estava (pt-BR), sem derrubar o resto.
    const novo = { ...feedback };
    let trocados = 0;
    for (const c of campos) {
      if (ehTexto((saida as any)[c])) { novo[c] = unmaskPII((saida as any)[c], map); trocados++; }
    }
    if (trocados === 0) return falhou('nenhum dos textos voltou');
    if (trocados < campos.length) {
      await registrarDegradacao({
        fluxo: 'assessment', tipo: DEGRADACAO.FEEDBACK_IA4_SEM_IDIOMA,
        chave: ctx.respostaId || ctx.colaboradorId, empresaId: ctx.empresaId, colaboradorId: ctx.colaboradorId,
        detalhe: { locale, motivo: `só ${trocados} de ${campos.length} textos voltaram` },
      });
    }
    return { feedback: novo, locale, reescrito: true };
  } catch (e: any) {
    return falhou(e?.message || String(e));
  }
}

/** O texto único que a tela lê (`feedback_ia4`), do objeto `feedback` já no idioma certo. */
export function textoDoFeedback(feedback: any): string {
  return typeof feedback === 'object' && feedback
    ? CAMPOS_DO_FEEDBACK.map((c) => feedback[c]).filter(Boolean).join('\n')
    : (feedback || '');
}
