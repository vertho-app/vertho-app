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
