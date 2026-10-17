import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * A task do Trigger roda fora do vitest. O que se trava aqui é a FIAÇÃO: a etapa existe no executor e a task entrega a ela as
 * dependências reais (fila de conteúdos com o escopo certo e o gerador de verdade), não um stub. Dependência declarada e
 * nunca ligada é como a trilha chegou a abortar sem biblioteca.
 */
describe('trigger/fluxo-completo.ts liga a etapa de conteúdos', () => {
  const fonte = readFileSync('trigger/fluxo-completo.ts', 'utf-8');
  it('lê a fila de conteúdos com permitidos, cargos e a exceção de internos', () => {
    expect(fonte).toContain('filaConteudoEscopo(tdb, {');
    expect(fonte).toMatch(/filaConteudoEscopo\(tdb, \{[^}]*permitidos[^}]*\}\)/);
    expect(fonte).toContain('incluirInternos: params.excecaoInternos');
  });
  it('gera com o cliente do job e o tenant do pedido (não um stub)', () => {
    expect(fonte).toContain('gerarConteudo: (item) => gerarConteudoDaBiblioteca(sb, empresaId, item)');
  });
});

describe('trigger/fluxo-completo.ts liga as correções (17/10/2026)', () => {
  const fonte = readFileSync('trigger/fluxo-completo.ts', 'utf-8');
  it('auditoria corrige o reprovado; IA4 e PDI têm as correções reais', () => {
    expect(fonte).toContain('auditar: (colaboradorId) => auditarECorrigirBlueprint(sb, empresaId, colaboradorId)');
    expect(fonte).toContain('corrigirIA4: (respostaId) => corrigirIA4(sb, empresaId, respostaId)');
    expect(fonte).toContain('refazerPdi: (colaboradorId, aiConfig) => refazerPdiGuardandoMelhor(sb, empresaId, colaboradorId, aiConfig)');
  });
  it('contas internas fora da IA4, do blueprint e do PDI (antes só a trilha filtrava)', () => {
    expect(fonte).toContain('filaIA4Escopo(tdb, permitidos, internos)');
    expect(fonte).toContain('filaBlueprintEscopo(tdb, permitidos, internos)');
    expect(fonte).toContain('filaPdiEscopo(tdb, permitidos, internos)');
  });
  it('o passado e a cascata só com a empresa pausada (lida a cada fila) e nunca para quem já recebeu o PDI', () => {
    expect(fonte).toMatch(/revisitar: await pausada\(\), entregues/);
    expect(fonte).toContain('(await pausada()) ? await filaPdiDesatualizado(tdb, dentro, entregues)');
    expect(fonte).toContain('(await pausada()) ? await filaTrilhaDesatualizada(tdb, dentro, entregues)');
    expect(fonte).toContain('pausaDeEnvios(emp?.sys_config)');
    expect(fonte).toContain('const entregues = await idsComPdiEntregue(tdb)');
  });
});
