/**
 * R-128 (04/10/2026): o card "Praticar" da home caía, sem pílula na semana, num
 * título fixo ("Novas técnicas de liderança") igual para todas as pessoas e de
 * todos os cargos, sem relação com a trilha de ninguém. Sem pílula o card some.
 *
 * É guard de FONTE (a suíte não renderiza a página, que é um componente de
 * cliente com roteador e dezenas de hooks): prova o formato do código e a ausência
 * das chaves órfãs nos quatro idiomas. A imagem da home com e sem pílula é conferência
 * visual, fora daqui.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const CHAVES_DO_FALLBACK = ['dailyInsight', 'fallbackPillTitle', 'dailyInsightDescription'];
const pagina = readFileSync('app/dashboard/page.tsx', 'utf8');

describe('home: o card da pílula só existe com pílula', () => {
  it('o botão que leva a /dashboard/praticar fica dentro de `kpis?.pilula &&`', () => {
    const botao = pagina.indexOf("router.push('/dashboard/praticar')");
    expect(botao).toBeGreaterThan(-1);
    const guarda = pagina.lastIndexOf('{kpis?.pilula && (', botao);
    expect(guarda).toBeGreaterThan(-1);
    // nenhuma outra expressão abre entre a guarda e o botão
    expect(pagina.slice(guarda, botao).match(/\{kpis\?\.pilula && \(/g)).toHaveLength(1);
    expect(pagina.slice(guarda, botao)).not.toMatch(/<\/button>/);
  });

  it('a página não tem mais caminho para o título nem para o texto de fallback', () => {
    for (const chave of CHAVES_DO_FALLBACK) expect(pagina).not.toContain(`cards.${chave}`);
    expect(pagina).not.toMatch(/kpis\?\.pilula\?\.titulo\s*\|\|/);
  });

  it.each(['pt-BR', 'pt-PT', 'es-ES', 'en-US'])('%s: as chaves órfãs saíram do arquivo de mensagens', (locale) => {
    const cards = JSON.parse(readFileSync(`messages/${locale}.json`, 'utf8')).DashboardHome.cards;
    const texto = JSON.stringify(cards);
    for (const chave of CHAVES_DO_FALLBACK) expect(texto).not.toContain(`"${chave}"`);
    // e o que o card usa continua lá
    for (const chave of ['pill', 'pillDone', 'pillOpen']) expect(texto).toContain(`"${chave}"`);
  });
});
