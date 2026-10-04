import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { semComentarios } from '../helpers/fonte';

/**
 * O Ranking de Adequação é PRODUTO, não o módulo de Seleção (R-34, decisão 2 do dono,
 * 04/10/2026). A Seleção de pessoas está off-line desde 31/08 e o ranking usava o
 * vocabulário dela na tela do RH e no PDF: "candidatos", "elegíveis", "não elegíveis
 * por requisito eliminatório", "psicólogo responsável", "entrevista", "vaga". Quem lê
 * é o RH de uma empresa em jornada de desenvolvimento, que não está recrutando.
 *
 * O guard varre o TEXTO que o usuário lê (comentários de código ficam de fora): as
 * duas telas, o PDF e a descrição do cartão na home do RH, nos 4 idiomas.
 */
const PROIBIDO = /candidat|candidate|psic[oó]log|psycholog|\bvagas?\b|vacante|elegív|eligib|elimin|edital|entrevista|interview|recrut/i;

const ARQUIVOS = [
  'components/ranking-adequacao-view.tsx',
  'lib/adequacao-cargo/ranking-pdf.tsx',
  'components/prontidao-cargo-view.tsx',
];

describe('vocabulário do Ranking de Adequação', () => {
  it.each(ARQUIVOS)('%s não fala em candidato, vaga, elegível, eliminatório nem entrevista', (arquivo) => {
    // Fora os identificadores em camelCase (`nCandidatos`): são código, não o texto da tela.
    const texto = semComentarios(readFileSync(arquivo, 'utf8')).replace(/\b[a-z]+Candidat\w*/g, '');
    const achados = texto.split('\n').filter((linha) => PROIBIDO.test(linha)).map((l) => l.trim().slice(0, 100));
    expect(achados, arquivo).toEqual([]);
  });

  it.each(['pt-BR', 'pt-PT', 'es-ES', 'en-US'])('%s: a descrição do cartão do RH não cita vaga', (loc) => {
    const d = JSON.parse(readFileSync(`messages/${loc}.json`, 'utf8')).DashboardHome.rh.rankingDescription;
    expect(d).not.toMatch(PROIBIDO);
  });

  // R-67 (04/10/2026): o texto da TELA mora no catálogo `RankingAdequacao` (4 idiomas); o PDF segue com o texto no arquivo.
  const catalogo = (loc: string) => JSON.parse(readFileSync(`messages/${loc}.json`, 'utf8')).RankingAdequacao;

  it('o aviso "apoio à decisão" não manda a decisão para um psicólogo, na tela nem no PDF', () => {
    expect(catalogo('pt-BR').decisionSupport).toContain('A decisão final cabe ao gestor ou ao RH.');
    expect(readFileSync('components/ranking-adequacao-view.tsx', 'utf8')).toContain("t.rich('decisionSupport'");
    expect(readFileSync('lib/adequacao-cargo/ranking-pdf.tsx', 'utf8')).toContain('A decisão final cabe ao gestor ou ao RH.');
    for (const arquivo of ARQUIVOS.slice(0, 2)) expect(readFileSync(arquivo, 'utf8'), arquivo).not.toContain('psicólogo');
  });

  it('a tela e o PDF dizem a mesma coisa sobre quem fica fora do ranking', () => {
    const pdf = readFileSync('lib/adequacao-cargo/ranking-pdf.tsx', 'utf8');
    expect(catalogo('pt-BR').gate.title).toContain('Fora do ranking por requisito essencial');
    expect(readFileSync('components/ranking-adequacao-view.tsx', 'utf8')).toContain("t('gate.title'");
    expect(pdf).toContain('Fora do ranking por requisito essencial');
  });

  it.each(['pt-BR', 'pt-PT', 'es-ES', 'en-US'])('%s: o catálogo da tela também não fala em candidato, vaga, elegível, eliminatório nem entrevista', (loc) => {
    const folhas = (o: any, p = ''): string[] => typeof o === 'string' ? [`${p}: ${o}`] : Object.entries(o).flatMap(([k, v]) => folhas(v, p ? `${p}.${k}` : k));
    expect(folhas(catalogo(loc)).filter((l) => PROIBIDO.test(l))).toEqual([]);
  });
});
