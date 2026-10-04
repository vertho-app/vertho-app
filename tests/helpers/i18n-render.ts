/**
 * Apoio dos testes de i18n das telas do RH (R-67): renderiza um componente num idioma,
 * lê o texto que a pessoa vê, procura português que sobra em en-US e varre a FONTE por
 * texto fixo em português (AST, sem comentário).
 */
import { expect, describe, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import ts from 'typescript';
import ptBR from '@/messages/pt-BR.json';
import ptPT from '@/messages/pt-PT.json';
import esES from '@/messages/es-ES.json';
import enUS from '@/messages/en-US.json';

export type Idioma = 'pt-BR' | 'pt-PT' | 'es-ES' | 'en-US';
export const IDIOMAS: Idioma[] = ['pt-BR', 'pt-PT', 'es-ES', 'en-US'];
export const CATALOGOS: Record<Idioma, any> = { 'pt-BR': ptBR, 'pt-PT': ptPT, 'es-ES': esES, 'en-US': enUS };

export function renderizar(idioma: Idioma, elemento: any): string {
  return renderToStaticMarkup(createElement(NextIntlClientProvider as any, { locale: idioma, messages: CATALOGOS[idioma] }, elemento));
}

/** O texto que a pessoa lê: sem marcação, sem entidade, sem o que é nome próprio de produto. */
export function textoDe(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[#\w]+;/g, ' ')
    .replace(/\s+/g, ' ');
}

/** Todos os textos (valores, não nomes de campo) de um objeto: o que o modelo entrega à tela e ao PDF. */
export function valoresTexto(o: any, saida: string[] = []): string[] {
  if (typeof o === 'string') saida.push(o);
  else if (Array.isArray(o)) o.forEach((v) => valoresTexto(v, saida));
  else if (o && typeof o === 'object') Object.values(o).forEach((v) => valoresTexto(v, saida));
  return saida;
}

/** Português que sobra num texto de en-US: letra acentuada ou palavra que só existe em português. */
export function portuguesEmIngles(html: string): string[] {
  const t = textoDe(html).replace(/Tira-Dúvidas|Vertho\.ai|Vertho/g, '');
  const achados = new Set<string>();
  for (const m of t.matchAll(/[A-Za-z]*[áàâãéêíóôõúç][A-Za-z]*/gi)) achados.add(m[0]);
  for (const m of t.matchAll(/\b(não|pessoas?|semanas?|jornada|etapas?|conteúdos?|ainda|sem|para|com|uma|dos|das|de|em|nenhum|nenhuma|cargo|coordenação|elegíveis|inscritos|acompanhar|enviado|registro)\b/gi)) achados.add(m[0]);
  return [...achados];
}

export function folhas(o: any, prefixo = '', saida: Array<[string, string]> = []): Array<[string, string]> {
  for (const [k, v] of Object.entries(o)) {
    const c = prefixo ? `${prefixo}.${k}` : k;
    if (typeof v === 'string') saida.push([c, v]); else folhas(v, c, saida);
  }
  return saida;
}

const ACENTO = /[áàâãéêíóôõúçÁÀÂÃÉÊÍÓÔÕÚÇ]/;
const PALAVRAS_PT = /\b(de|do|da|dos|das|para|não|com|que|uma|em|os|as|por|sem|mais|sua|seu|ainda|quando|sobre|entre|pessoas?|semana|jornada|relatório|empresa|cargo|erro|falha)\b/i;
export function textosEmPortugues(arquivo: string): string[] {
  const fonte = readFileSync(arquivo, 'utf8');
  const sf = ts.createSourceFile(arquivo, fonte, ts.ScriptTarget.Latest, true, arquivo.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const achados: string[] = [];
  const ehPt = (s: string) => {
    const t = s.trim();
    if (t.length < 2 || !/[A-Za-zÀ-ÿ]/.test(t) || /@media|@page/.test(t)) return false;
    return ACENTO.test(t) || (t.split(/\s+/).length >= 2 && PALAVRAS_PT.test(t));
  };
  (function visita(n: ts.Node) {
    if (ts.isImportDeclaration(n) || ts.isTypeAliasDeclaration(n) || ts.isInterfaceDeclaration(n)) return;
    if (ts.isJsxText(n)) { const t = n.getText(sf).replace(/\s+/g, ' ').trim(); if (t && ehPt(t)) achados.push(t); }
    else if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) {
      const p = n.parent;
      if (!(p && (ts.isLiteralTypeNode(p) || ts.isImportDeclaration(p) || ts.isExportDeclaration(p))) && ehPt(n.text)) achados.push(n.text);
    } else if (ts.isTemplateExpression(n)) {
      const partes = [n.head.text, ...n.templateSpans.map((s) => s.literal.text)].join(' ');
      if (ehPt(partes)) achados.push(partes);
    }
    ts.forEachChild(n, visita);
  })(sf);
  return achados;
}

export type Esperado = Record<Idioma, string[]>;
export function conferir(nome: string, fazer: (idioma: Idioma) => any, esperado: Esperado) {
  describe(nome, () => {
    it.each(IDIOMAS)('%s renderiza o texto do idioma', (idioma) => {
      const html = renderizar(idioma, fazer(idioma));
      const texto = textoDe(html);
      for (const trecho of esperado[idioma]) expect(texto, `${idioma}: ${trecho}`).toContain(trecho);
    });
    it('en-US sem português', () => {
      expect(portuguesEmIngles(renderizar('en-US', fazer('en-US')))).toEqual([]);
    });
  });
}
