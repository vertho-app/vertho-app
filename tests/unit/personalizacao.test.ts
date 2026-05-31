import { describe, it, expect } from 'vitest';
import { buildPersonalizacaoPrompt } from '@/lib/season-engine/prompts/personalizacao';
import { parseBlocks } from '@/lib/conteudo-layout-plan';
import { renderConteudoFinalPDF } from '@/lib/conteudo-final-pdf';
import type { EscolaBrief } from '@/lib/escola-brief';

const core = `# Núcleo
## Contexto
Texto curricular do núcleo, que NÃO deve ser repetido na camada.
`;

const brief: EscolaBrief = {
  etapas: 'Fundamental I', rede: 'Privada confessional', contexto: 'Urbana, SP',
  ambientes: 'pátio arborizado, biblioteca', identidade: 'protagonismo estudantil', tom: 'acolhedor',
};

describe('buildPersonalizacaoPrompt', () => {
  it('com brief: pede DUAS seções (DISC + PPP) e injeta o brief', () => {
    const { system, user } = buildPersonalizacaoPrompt({
      competencia: 'Pensamento Estratégico', descritor: 'Antecipação', conteudoCore: core,
      arquetipoNome: 'Comandante', arquetipoDesc: 'Direto, decidido', escolaBrief: brief,
    });
    expect(system).toContain('## Para o seu perfil: Comandante');
    expect(system).toContain('## No contexto da sua escola');
    expect(system).toMatch(/DUAS seções/);
    expect(user).toContain('pátio arborizado'); // brief injetado
    expect(user).toContain('NÃO repita');        // núcleo entra só como referência de não-repetir
  });

  it('sem brief: pede só a seção de perfil (DISC)', () => {
    const { system } = buildPersonalizacaoPrompt({
      competencia: 'X', descritor: 'Y', conteudoCore: core,
      arquetipoNome: 'Analista', arquetipoDesc: 'Preciso', escolaBrief: null,
    });
    expect(system).toContain('## Para o seu perfil: Analista');
    expect(system).not.toContain('## No contexto da sua escola');
    expect(system).toMatch(/UMA seção/);
  });
});

describe('camada anexada flui pelo pipeline (integridade do núcleo preservada)', () => {
  it('parseBlocks vê as seções novas como blocos e o render aceita o markdown completo', async () => {
    // Simula a saída da IA (camada). A action concatena núcleo + camada.
    const layer = `## Para o seu perfil: Comandante
Use sua decisão rápida a favor; cuidado com atropelar o time.

## No contexto da sua escola
No Fundamental I, traga o exemplo para a rotina de sala.`;
    const full = `${core}\n\n${layer}`;

    const blocks = parseBlocks(full, { skipFirstH1: true });
    const h2 = blocks.filter(b => b.kind === 'h2').map(b => (b as any).text);
    expect(h2).toContain('Para o seu perfil: Comandante');
    expect(h2).toContain('No contexto da sua escola');
    // núcleo intacto: o bloco original continua presente
    expect(h2).toContain('Contexto');

    const buf = await renderConteudoFinalPDF({
      titulo: 'Núcleo', conteudoMd: full, competencia: 'Pensamento Estratégico',
      formato: 'texto', coverBase64: null, plan: null, sectionImageBase64: null,
    });
    expect(buf.length).toBeGreaterThan(5000);
  });
});
