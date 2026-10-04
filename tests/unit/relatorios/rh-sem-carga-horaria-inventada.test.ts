import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import React from 'react';
import { describe, expect, it } from 'vitest';
import { RELATORIO_RH_SYSTEM } from '@/lib/relatorios/prompts';
import { normalizeRhReportInsight } from '@/lib/relatorios/dashboard-insights';
import RelatorioRHPDF from '@/components/pdf/RelatorioRH';

/**
 * R-116 (03/10/2026): o relatório consolidado do RH imprimia a carga horária de
 * cada treinamento sugerido, número que a IA inventava (o prompt pedia
 * "carga_horaria": "texto curto" e não dava dado nenhum de onde tirá-lo), e os
 * horizontes do plano de ação (curto, médio, longo) eram impressos com janela de
 * tempo ("2 semanas", "1 a 2 meses", "próximo semestre") que o prompt nunca
 * definia para a IA.
 *
 * Aqui se prova as duas pontas: o prompt não pede mais o campo e define os
 * horizontes com as janelas do renderer; e o renderer não imprime mais a carga
 * horária nem de relatório JÁ GRAVADO, que ainda a carrega.
 */

const CARGA = '16h (4 encontros de 4h)';

// Relatório gravado antes da correção: traz `carga_horaria` em cada treinamento.
const CONTEUDO_LEGADO = {
  resumo_executivo: { leitura_geral: 'Leitura geral.', principal_forca_organizacional: 'Força.', principal_risco_organizacional: 'Risco.' },
  indicadores: { total_avaliados: 10, total_avaliacoes: 40, media_geral: 2.4, pct_nivel_1: 10, pct_nivel_2: 40, pct_nivel_3: 40, pct_nivel_4: 10 },
  competencias_criticas: [
    { competencia: 'Comunicação', criticidade: 'alta', justificativa: 'Gargalo.', impacto_organizacional: 'Retrabalho.' },
  ],
  treinamentos_sugeridos: [
    { titulo: 'Conversas difíceis', competencia: 'Comunicação', publico: 'Líderes', formato: 'presencial', carga_horaria: CARGA, custo: 'medio', prioridade: 'alta', justificativa: 'Treina a conversa.' },
    { titulo: 'Gestão do tempo', competencia: 'Organização', publico: 'Todos', formato: 'online', carga_horaria: CARGA, custo: 'baixo', prioridade: 'media', justificativa: 'Rotina.' },
  ],
  plano_acao: { curto_prazo: ['a'], medio_prazo: ['b'], longo_prazo: ['c'] },
};

/** Percorre a árvore React expandindo componentes de função (sem hooks) e junta todo o texto. */
function textoDaArvore(no: any, saida: string[] = []): string[] {
  if (no == null || typeof no === 'boolean') return saida;
  if (typeof no === 'string' || typeof no === 'number') { saida.push(String(no)); return saida; }
  if (Array.isArray(no)) { no.forEach((n) => textoDaArvore(n, saida)); return saida; }
  if (React.isValidElement(no)) {
    const { type, props } = no as any;
    if (typeof type === 'function') textoDaArvore((type as any)(props), saida);
    else textoDaArvore(props?.children, saida);
  }
  return saida;
}

describe('R-116: o prompt do relatório RH', () => {
  it('não pede mais carga horária no schema e a proíbe nas regras', () => {
    expect(RELATORIO_RH_SYSTEM).not.toContain('"carga_horaria"');
    expect(RELATORIO_RH_SYSTEM).toMatch(/NÃO informe carga horária/);
  });

  it('define os horizontes com as MESMAS janelas que o painel imprime (pt-BR)', () => {
    const msgs = JSON.parse(readFileSync(join(process.cwd(), 'messages', 'pt-BR.json'), 'utf-8'));
    const h = msgs.RhReports.dashboard.priorities.horizons;
    const prompt = RELATORIO_RH_SYSTEM.toLowerCase();
    expect(prompt).toContain(`curto_prazo = ${h.short.toLowerCase()}`);
    expect(prompt).toContain(`medio_prazo = ${h.medium.toLowerCase()}`);
    expect(prompt).toContain(`longo_prazo = ${h.long.toLowerCase()}`);
  });
});

describe('R-116: relatório gravado com carga horária não a mostra', () => {
  it('o painel do RH (normalizador) não expõe a carga do treinamento', () => {
    const insight = normalizeRhReportInsight(CONTEUDO_LEGADO)!;
    const treino = insight.criticalCompetencies[0].training!;
    expect(treino.title).toBe('Conversas difíceis');
    expect(treino.format).toBe('presencial');
    expect(JSON.stringify(insight)).not.toContain(CARGA);
  });

  it('o PDF do RH não imprime "Carga", nem a casada com a competência nem a avulsa', () => {
    const texto = textoDaArvore(RelatorioRHPDF({ data: { conteudo: CONTEUDO_LEGADO }, empresaNome: 'ACME' })).join(' ').replace(/\s+/g, ' ');
    // Sentinelas de que a árvore foi percorrida e as DUAS seções de formação aparecem.
    expect(texto).toContain('Conversas difíceis');
    expect(texto).toContain('Gestão do tempo');
    expect(texto).toContain('Formato: presencial');
    expect(texto).not.toMatch(/Carga/);
    expect(texto).not.toContain(CARGA);
  });
});

describe('R-116: nenhuma tela do relatório RH lê a carga horária', () => {
  // A tela admin lê o JSON cru (sem normalizador), então a prova é de fonte: a
  // chave não pode voltar a ser lida em nenhum dos consumidores do relatório.
  for (const arquivo of [
    'app/admin/empresas/[empresaId]/relatorios/page.tsx',
    'app/dashboard/relatorios/relatorios-rh-view.tsx',
    'components/pdf/RelatorioRH.tsx',
    'lib/relatorios/dashboard-insights.ts',
  ]) {
    it(`${arquivo} não lê carga_horaria`, () => {
      const fonte = readFileSync(join(process.cwd(), arquivo), 'utf-8');
      expect(fonte).not.toMatch(/carga_horaria/);
    });
  }
});
