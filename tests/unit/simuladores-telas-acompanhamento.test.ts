import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { semComentarios } from '../helpers/fonte';

/**
 * As telas dos simuladores de atendimento e de vendas para quem só acompanha
 * (gestor e RH, 17/09/2026): abrem na aba da equipe e escondem a de treino.
 *
 * Estático de propósito: os componentes são client-side e dependem de fetch
 * autenticado. O que a API decide (podeTreinar, soAcompanha) está provado nos
 * testes dos serviços; aqui fica preso que a TELA usa a marca.
 */
const ler = (arquivo: string) => semComentarios(readFileSync(path.resolve(__dirname, '../..', arquivo), 'utf8'));

describe('telas dos simuladores para quem só acompanha', () => {
  it('atendimento: abre na equipe e esconde "Meu treino"', () => {
    const fonte = ler('components/recepcao/treino.tsx');
    expect(fonte).toContain("const soAcompanha = !admin && dados?.soAcompanha === true;");
    expect(fonte).toMatch(/if \(soAcompanha && aba === 'treino'\) setAba\('equipe'\);/);
    // o botão "Meu treino" só existe para quem treina
    const inicioBotao = fonte.indexOf('Meu treino</button>');
    expect(inicioBotao).toBeGreaterThan(-1);
    const trechoAntes = fonte.slice(Math.max(0, inicioBotao - 400), inicioBotao);
    expect(trechoAntes).toContain('{!soAcompanha&&<button');
  });

  it('simulador de liderança: quem só lidera não recebe o "Voltar ao mapeamento do cargo"', () => {
    // A action diz `trilhoCargo.disponivel` (assessment-trilho-lideranca.test.ts);
    // aqui fica preso que o card do trilho usa a marca antes de desenhar o botão.
    const fonte = ler('app/dashboard/assessment/page.tsx');
    const inicio = fonte.indexOf("if (trilho === 'lideranca') {");
    expect(inicio).toBeGreaterThan(-1);
    const trecho = fonte.slice(inicio, fonte.indexOf("t('lideranca.backToCargo')", inicio));
    expect(trecho).toContain('if (data?.trilhoCargo?.disponivel === false) return null;');
  });

  it('vendas: a aba de treino só aparece para quem treina (ou para quem administra a plataforma)', () => {
    const fonte = ler('components/simulador-vendas/treino.tsx');
    const inicio = fonte.indexOf("{t('trainTab')}");
    expect(inicio).toBeGreaterThan(-1);
    const trechoAntes = fonte.slice(Math.max(0, inicio - 500), inicio);
    expect(trechoAntes).toContain('(admin || !dados.soAcompanha) && (');
  });
});
