/**
 * Idioma dos PDFs (onda D, 04/10/2026): o texto FIXO do papel (rótulos, títulos,
 * legendas, cabeçalhos, rodapés) sai no idioma de quem lê, nos quatro idiomas do
 * produto.
 *
 * POR QUE UM TRADUTOR PRÓPRIO, e não `getTranslations`: o `@react-pdf/renderer`
 * roda no servidor, mas também dentro de task do Trigger e de script, onde não há
 * request. O `getTranslations({ locale })` do next-intl passa pelo
 * `i18n/request.ts`, que lê cookie e header: fora de uma request ele falha. O
 * `createTranslator` é o mesmo motor de mensagens (ICU, plural, mesmos arquivos
 * `messages/*.json`, namespace `Pdf`) sem depender do ambiente de request. É o
 * desenho que `lib/temporada-concluida-pdf.tsx` já usa para o pt-BR.
 *
 * O que NÃO se traduz aqui: nome de competência, descritor, cargo, nome de pessoa
 * e todo texto que veio do banco ou da IA. Texto de IA fica no idioma em que foi
 * gerado (os prompts do PDI, do gestor e do RH ainda não recebem locale: lacuna
 * declarada no relatório da onda).
 *
 * Chave ausente NÃO imprime o caminho da chave no papel: cai no pt-BR e deixa um
 * `console.error`. O teste `tests/unit/pdf-i18n-catalogo.test.ts` reprova chave
 * usada no código e ausente em qualquer dos quatro idiomas, então o fallback é
 * só a rede de segurança de uma chave nova que alguém esqueceu de traduzir.
 */
import { createTranslator } from 'next-intl';
import { resolveAppLocale } from '@/lib/i18n';
import type { AppLocale } from '@/i18n/routing';
import ptBR from '@/messages/pt-BR.json';
import ptPT from '@/messages/pt-PT.json';
import esES from '@/messages/es-ES.json';
import enUS from '@/messages/en-US.json';

export type PdfT = (chave: string, valores?: Record<string, string | number>) => string;

const CATALOGOS: Record<AppLocale, unknown> = {
  'pt-BR': (ptBR as any).Pdf,
  'pt-PT': (ptPT as any).Pdf,
  'es-ES': (esES as any).Pdf,
  'en-US': (enUS as any).Pdf,
};

const cache = new Map<AppLocale, PdfT>();

function criar(locale: AppLocale): PdfT {
  const base = createTranslator({
    locale,
    messages: { Pdf: CATALOGOS[locale] } as any,
    namespace: 'Pdf',
    // Erro de formatação (valor que o texto pede e o código não passou) vira log, não texto no papel.
    onError: (erro: { message?: string }) => console.error(`[pdf-i18n] ${locale}: ${erro?.message}`),
    getMessageFallback: () => '',
  }) as any;
  return (chave, valores) => {
    if (base.has(chave)) return base(chave, valores);
    // Rede de segurança: nunca imprime o caminho da chave. O pt-BR cobre.
    console.error(`[pdf-i18n] chave "${chave}" ausente em ${locale}`);
    if (locale === 'pt-BR') return '';
    return tradutorDoPdf('pt-BR')(chave, valores);
  };
}

/** O tradutor do namespace `Pdf` no idioma pedido (padrão e valor inválido: pt-BR). */
export function tradutorDoPdf(locale?: string | null): PdfT {
  const resolvido = resolveAppLocale(locale);
  let t = cache.get(resolvido);
  if (!t) {
    t = criar(resolvido);
    cache.set(resolvido, t);
  }
  return t;
}

/** O idioma que o PDF vai usar, para quem precisa dele além do texto (número, data, collator). */
export function idiomaDoPdf(locale?: string | null): AppLocale {
  return resolveAppLocale(locale);
}

/**
 * O PDF é um documento para a organização inteira, e a data de um relatório é
 * a de Brasília (a mesma régua da rota de engajamento): o servidor roda em UTC e
 * uma medição das 22h de São Paulo cairia no dia seguinte.
 */
const FUSO_DO_PRODUTO = 'America/Sao_Paulo';

/** Arredondamento convencional em `casas`, sem o ruído de ponto flutuante (15,83 + 4,17 = 20,000000000000004). */
export function arredondarParaPdf(valor: number, casas = 1): number {
  const fator = 10 ** casas;
  const limpo = Number((Number(valor) || 0).toFixed(10));
  return Math.round(limpo * fator) / fator;
}

/** Número com `casas` decimais pelo `Intl` do idioma (3,5 em pt/es, 3.5 em en), sem separador de milhar. */
export function numeroNoPdf(valor: number, locale?: string | null, casas = 1): string {
  return new Intl.NumberFormat(idiomaDoPdf(locale), {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
    useGrouping: false,
  }).format(arredondarParaPdf(valor, casas));
}

/** Percentual (0 a 100) pelo `Intl` do idioma, com até uma casa: "60%" em pt/en e "60 %" em es-ES. */
export function percentualNoPdf(valor: number, locale?: string | null): string {
  return new Intl.NumberFormat(idiomaDoPdf(locale), {
    style: 'percent',
    maximumFractionDigits: 1,
  }).format(arredondarParaPdf(valor, 1) / 100);
}

/** Data numérica curta (dd/mm/aaaa em pt e es, mm/dd/aaaa em en), no fuso de Brasília. Vazio para data inválida. */
export function dataNoPdf(iso: string | Date | null | undefined, locale?: string | null): string {
  if (!iso) return '';
  const d = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(idiomaDoPdf(locale), { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: FUSO_DO_PRODUTO });
}

/** Data por extenso curta ("4 de out. de 2026", "Oct 4, 2026"), no fuso de Brasília. */
export function dataLongaNoPdf(iso: string | Date | null | undefined, locale?: string | null): string {
  const d = !iso ? new Date() : iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(idiomaDoPdf(locale), { day: '2-digit', month: 'long', year: 'numeric', timeZone: FUSO_DO_PRODUTO });
}

/** Ordem alfabética pelo collator do idioma de quem lê, sem acento nem caixa. */
export function compararNomes(a: unknown, b: unknown, locale?: string | null): number {
  return String(a ?? '').localeCompare(String(b ?? ''), idiomaDoPdf(locale), { sensitivity: 'base' });
}
