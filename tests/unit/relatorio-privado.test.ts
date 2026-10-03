import { describe, expect, it } from 'vitest';
import {
  caminhoRelatorio,
  hrefRelatorio,
  interpretarRefRelatorio,
  podeLerRelatorio,
  rotuloCargo,
} from '@/lib/relatorios/relatorio-privado';

/**
 * As peças puras do R-74: o formato do caminho (quem escreve) e o parser (quem
 * lê). Os dois têm que concordar, senão o escritor grava um arquivo que a rota
 * recusa, ou a rota aceita um caminho que não sabe atribuir a uma empresa.
 */
const EMP = '11111111-1111-4111-8111-111111111111';

describe('caminho e referência dos relatórios organizacionais', () => {
  it('o caminho que o escritor monta é lido de volta como bucket privado, da mesma empresa', () => {
    const caminho = caminhoRelatorio(EMP, 'adequacao-cargo', `${rotuloCargo('Coordenação (Manhã)')}-1759500000000.json`);
    expect(interpretarRefRelatorio(caminho)).toEqual({
      bucket: 'relatorios-pdf', caminho, empresaId: EMP, tipo: 'adequacao-cargo',
      nome: 'CoordenaC3A7C3A3o20(ManhC3A3)-1759500000000.json', legado: false,
    });
  });

  it('o escritor recusa o que o leitor não saberia ler', () => {
    expect(() => caminhoRelatorio('empresa-123', 'dna', '1.pdf')).toThrow(/empresaId/);
    expect(() => caminhoRelatorio(EMP, 'perso' as any, '1.pdf')).toThrow(/tipo/);
    expect(() => caminhoRelatorio(EMP, 'dna', '../1.pdf')).toThrow(/nome/);
    expect(() => caminhoRelatorio(EMP, 'dna', '.pdf')).toThrow(/nome/);
  });

  it('formato antigo: caminho e URL pública (inclusive com escape) apontam para o bucket antigo', () => {
    const antigo = `final/ranking-adequacao/${EMP}-Professor-200.pdf`;
    expect(interpretarRefRelatorio(antigo)).toMatchObject({ bucket: 'conteudos', empresaId: EMP, tipo: 'ranking-adequacao', nome: 'Professor-200.pdf', legado: true });
    const url = `https://xyz.supabase.co/storage/v1/object/public/conteudos/${encodeURIComponent(antigo).replace(/%2F/g, '/')}?download=`;
    expect(interpretarRefRelatorio(url)).toMatchObject({ bucket: 'conteudos', caminho: antigo });
  });

  it('recusa o que não diz de quem é', () => {
    for (const ref of [
      null, 123, '', ' ',
      'AAAAAAAA-BBBB-4CCC-8DDD-EEEEEEEEEEEE/dna/1.pdf', // id é sempre minúsculo no banco
      `${EMP}/dna/sub/1.pdf`,
      `final/dna/${EMP}/1.pdf`,
      `final/perso/${EMP}-1.pdf`,
      `https://xyz.supabase.co/storage/v1/object/sign/conteudos/final/dna/${EMP}-1.pdf`,
      'javascript:alert(1)',
    ]) expect(interpretarRefRelatorio(ref), String(ref)).toBeNull();
  });

  it('o link da tela é a rota, com o caminho codificado', () => {
    expect(hrefRelatorio(`${EMP}/dna/1.pdf`)).toBe(`/api/relatorios/organizacional?ref=${EMP}%2Fdna%2F1.pdf`);
    expect(hrefRelatorio(`${EMP}/dna/1.pdf`, { download: true })).toMatch(/&download=1$/);
  });

  it('régua de leitura: RH da própria empresa ou platform admin, e mais ninguém', () => {
    expect(podeLerRelatorio({ role: 'rh', empresaId: EMP }, EMP)).toBe(true);
    expect(podeLerRelatorio({ role: 'colaborador', empresaId: null, isPlatformAdmin: true }, EMP)).toBe(true);
    expect(podeLerRelatorio({ role: 'rh', empresaId: 'outra' }, EMP)).toBe(false);
    expect(podeLerRelatorio({ role: 'rh', empresaId: null }, EMP)).toBe(false);
    expect(podeLerRelatorio({ role: 'gestor', empresaId: EMP }, EMP)).toBe(false);
    expect(podeLerRelatorio({ role: 'colaborador', empresaId: EMP }, EMP)).toBe(false);
    expect(podeLerRelatorio(null, EMP)).toBe(false);
    expect(podeLerRelatorio({ role: 'rh', empresaId: EMP }, '')).toBe(false);
  });
});
