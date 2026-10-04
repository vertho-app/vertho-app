/**
 * Guard (onda D, R-67 item 2): nenhum texto fixo em português fica ESCRITO no código dos PDFs
 * que o produto entrega nos quatro idiomas.
 *
 * Lê a fonte pela AST do TypeScript (literal de string, parte de template e texto de JSX; comentário
 * nunca entra) e reprova literal com letra acentuada do português ou palavra típica dele. O texto
 * fixo mora no catálogo `Pdf` (`messages/*.json`); o código só chama `t('chave')`.
 *
 * O que NÃO é texto fixo e por isso passa: nome de campo, código de enum que o relatório carrega
 * (`media` com acento vindo do legado), chave de catálogo e glifo. Cada exceção tem o motivo ao lado,
 * e a lista só pode ENCOLHER (uma exceção cujo alvo sumiu reprova).
 *
 * Validado por mutação: um literal em português inserido em qualquer dos arquivos faz este teste falhar.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const ARQUIVOS = [
  'components/pdf/RelatorioIndividual.tsx',
  'components/pdf/CompetencyBlock.tsx',
  'components/pdf/ChecklistBox.tsx',
  'components/pdf/StatusBadge.tsx',
  'components/pdf/PdfReportCover.tsx',
  'components/pdf/PdfCover.tsx',
  'components/pdf/RelatorioGestor.tsx',
  'components/pdf/RelatorioRH.tsx',
  'components/pdf/RelatorioEngajamento.tsx',
  'components/pdf/RelatorioEvolucao.tsx',
];

/** Literais que são DADO ou CÓDIGO, não texto do papel. Arquivo -> literal -> motivo. */
const EXCECOES: Record<string, Record<string, string>> = {
  'components/pdf/RelatorioGestor.tsx': {
    'média': 'código de urgência que o relatório antigo grava com acento (`urgenciaChave` aceita as duas grafias); é entrada, nunca é impresso',
  },
  'components/pdf/RelatorioEngajamento.tsx': {
    'gestor': 'código do público do relatório (`Audience`: gestor ou rh), escolhe o rótulo; não é impresso',
    'pessoas': 'âncora do link para a lista de pessoas na plataforma (`#pessoas`): contrato da URL, não texto do papel',
  },
  'components/pdf/RelatorioEvolucao.tsx': {
    'pessoas-': 'prefixo da `key` React da página de pessoas: identificador interno, não é impresso',
  },
};

const ACENTO = /[àáâãçéêíóôõúüÀÁÂÃÇÉÊÍÓÔÕÚ]/;
const PALAVRA_PT = /(^|[^\w])(não|para|com|sem|uma|dos|das|pelo|pela|você|seu|sua|ainda|pessoas?|semanas?|jornada|equipe|competência|nível|relatório|plano|ação|evidência|desafio|conteúdo|confidencial|cargo|avanço|gestor|inscritos|elegíveis)([^\w]|$)/i;

function literais(arquivo: string): string[] {
  const fonte = readFileSync(arquivo, 'utf8');
  const sf = ts.createSourceFile(arquivo, fonte, ts.ScriptTarget.Latest, true, arquivo.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const achados: string[] = [];
  const visita = (no: ts.Node) => {
    // caminho de import/export não é texto do papel
    const ehModulo = ts.isStringLiteral(no) && (ts.isImportDeclaration(no.parent) || ts.isExportDeclaration(no.parent) || ts.isImportTypeNode(no.parent?.parent as ts.Node));
    if (ehModulo) return;
    if (ts.isStringLiteral(no) || ts.isNoSubstitutionTemplateLiteral(no) || ts.isTemplateHead(no) || ts.isTemplateMiddle(no) || ts.isTemplateTail(no) || ts.isJsxText(no)) {
      const texto = no.text.replace(/\s+/g, ' ').trim();
      if (texto.length >= 3) achados.push(texto);
    }
    ts.forEachChild(no, visita);
  };
  visita(sf);
  return achados;
}

/** Chave de catálogo (`gestor.thisWeek`, `engajamento.series.`): é identificador, não frase. */
const ehChaveDeCatalogo = (t: string) => /^[A-Za-z]+(\.[A-Za-z0-9_$]*)+$/.test(t);
const ehPortugues = (t: string) => !ehChaveDeCatalogo(t) && (ACENTO.test(t) || PALAVRA_PT.test(t));

describe('PDFs: nenhum texto fixo em português escrito no código', () => {
  it.each(ARQUIVOS)('%s', (arquivo) => {
    const permitidos = EXCECOES[arquivo] ?? {};
    const sobras = literais(arquivo).filter((t) => ehPortugues(t) && !(t in permitidos));
    expect(sobras, `${arquivo}: texto em português no código (vai para o catálogo Pdf)`).toEqual([]);
  });

  it('o detector enxerga o que procura (controle: texto em português e texto neutro)', () => {
    expect(ehPortugues('Pontos de Atenção')).toBe(true);
    expect(ehPortugues('Sua jornada tem')).toBe(true);
    expect(ehPortugues('nenhuma pendência')).toBe(true);
    expect(ehPortugues('individual.weeksRange')).toBe(false);
    expect(ehPortugues('gestor.thisWeek')).toBe(false);
    expect(ehPortugues('proximas_semanas')).toBe(false);
    expect(ehPortugues('NotoSans')).toBe(false);
    expect(ehPortugues('Journey 1')).toBe(false);
  });

  it('cada exceção declarada ainda existe no arquivo (lista que só encolhe)', () => {
    for (const [arquivo, mapa] of Object.entries(EXCECOES)) {
      const existentes = literais(arquivo);
      for (const literal of Object.keys(mapa)) expect(existentes, `${arquivo}: "${literal}" sumiu, tire da lista`).toContain(literal);
    }
  });

  it('os arquivos listados existem e têm literais (o guard não pode olhar para o vazio)', () => {
    for (const a of ARQUIVOS) expect(literais(a).length, a).toBeGreaterThan(3);
  });
});
