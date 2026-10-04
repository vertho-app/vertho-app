/**
 * R-114 (03/10/2026): "Observações comerciais" e "Escopo incluído" do formulário
 * da proposta do representante vão ao cliente exatamente como escritos (tela da
 * proposta e PDF: `notasComerciais` e `escopoItens` em `buildProposalDocument`),
 * e o formulário não dizia isso: o campo parecia anotação interna.
 */
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ProposalForm from '@/components/sales/proposal-form';

const html = renderToStaticMarkup(
  createElement(ProposalForm, { onSubmit: () => {}, submitting: false }),
);

describe('formulário da proposta: avisa o que vai ao cliente', () => {
  it('"Observações comerciais" diz que aparece na proposta do cliente', () => {
    const trecho = html.slice(html.indexOf('Observações comerciais'));
    expect(trecho).toMatch(/Aparece na proposta que o cliente lê \(tela e PDF\)/);
    expect(trecho).toMatch(/Anotação interna não vai aqui/);
  });

  it('"Escopo incluído" diz que vira a lista de itens da proposta', () => {
    const trecho = html.slice(html.indexOf('Escopo incluído'), html.indexOf('Condições comerciais'));
    expect(trecho).toMatch(/Aparece na proposta que o cliente lê, uma linha por item incluído/);
  });
});
