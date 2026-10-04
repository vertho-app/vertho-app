/**
 * Os NÚMEROS das frases que dizem o que cada veredito quer dizer (R-67, 04/10/2026).
 *
 * `DICA_VEREDITO` (`lib/season-engine/convergencia-dicas.ts`) escreve as três frases em
 * português, com os cortes da régua dentro do texto. A tela do gestor as quer nos 4 idiomas:
 * a frase vem do catálogo (`ManagerEvolution.verdictHints`) com `{min}`, `{from}`, `{to}` e
 * `{max}`, e ESTES são os valores. Eles saem das mesmas constantes da régua (`CORTE_CONFIRMADA`,
 * `CORTE_PARCIAL`), com a mesma conta de `DICA_VEREDITO` (o último avanço exibido antes do
 * corte), então mudar um corte muda a frase nos quatro idiomas. Um teste confere que, em
 * pt-BR, catálogo e `DICA_VEREDITO` escrevem igual.
 */
import { CORTE_CONFIRMADA, CORTE_PARCIAL } from '@/lib/season-engine/convergencia';

export type NumerosDasDicas = {
  /** Avanço mínimo da evolução confirmada. */
  min: string;
  /** Avanço mínimo da evolução parcial. */
  from: string;
  /** Último avanço exibido antes do corte da confirmada. */
  to: string;
  /** Último avanço exibido antes do corte da parcial. */
  max: string;
};

export function numerosDasDicas(locale: string): NumerosDasDicas {
  const casa = new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  // O avanço aparece com UMA casa: o último valor exibido antes do corte é o corte menos 0,1.
  const ate = (corte: number) => casa.format(Math.round((corte - 0.1) * 10) / 10);
  return {
    min: casa.format(CORTE_CONFIRMADA),
    from: casa.format(CORTE_PARCIAL),
    to: ate(CORTE_CONFIRMADA),
    max: ate(CORTE_PARCIAL),
  };
}
