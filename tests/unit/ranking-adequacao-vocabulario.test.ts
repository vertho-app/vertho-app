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

  it('o aviso "apoio à decisão" não manda a decisão para um psicólogo, na tela nem no PDF', () => {
    for (const arquivo of ARQUIVOS.slice(0, 2)) {
      const texto = readFileSync(arquivo, 'utf8');
      expect(texto, arquivo).toContain('A decisão final cabe ao gestor ou ao RH.');
      expect(texto, arquivo).not.toContain('psicólogo');
    }
  });

  it('a tela e o PDF dizem a mesma coisa sobre quem fica fora do ranking', () => {
    const tela = readFileSync('components/ranking-adequacao-view.tsx', 'utf8');
    const pdf = readFileSync('lib/adequacao-cargo/ranking-pdf.tsx', 'utf8');
    expect(tela).toContain('Fora do ranking por requisito essencial');
    expect(pdf).toContain('Fora do ranking por requisito essencial');
  });
});
