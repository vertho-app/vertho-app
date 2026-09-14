import { describe, expect, it } from 'vitest';
import {
  VARIANTES, varianteDe, linhasDaVariante, COMPETENCIAS_LIDERANCA, DESCRITORES_POR_COMPETENCIA,
  ehCargoAncoraLideranca,
} from '@/lib/simuladores/lideranca/matriz-global';

/**
 * A matriz é a fonte única do que o simulador de liderança mede em TODOS os
 * tenants. O arquivo é gerado de um XLSX, então as invariantes de forma são
 * verificadas aqui também: planilha editada à mão quebra em silêncio, e o
 * instalador confia nelas.
 */
describe('matriz global de liderança', () => {
  it('tem as 5 competências e 6 descritores em cada uma, nas duas variantes', () => {
    expect(COMPETENCIAS_LIDERANCA).toHaveLength(5);
    for (const v of Object.keys(VARIANTES) as (keyof typeof VARIANTES)[]) {
      const linhas = linhasDaVariante(v);
      expect(linhas).toHaveLength(5 * DESCRITORES_POR_COMPETENCIA);
      for (const comp of COMPETENCIAS_LIDERANCA) {
        expect(linhas.filter((l) => l.nome === comp)).toHaveLength(DESCRITORES_POR_COMPETENCIA);
      }
    }
  });

  /**
   * O ponto do desenho: régua idêntica é o que torna as notas comparáveis entre
   * gestor em exercício e potencial sucessor. Se um texto de âncora divergir,
   * são duas provas diferentes e a comparação passa a mentir.
   */
  it('a RÉGUA é idêntica entre as variantes; só o enquadramento das perguntas muda', () => {
    const gestor = linhasDaVariante('gestor');
    const potencial = linhasDaVariante('potencial');
    const ancoras = ['descritor_completo', 'n1_gap', 'n2_desenvolvimento', 'n3_meta', 'n4_referencia', 'evidencias_esperadas'] as const;

    let pares = 0;
    for (const g of gestor) {
      const p = potencial.find((x) => x.nome === g.nome && x.nome_curto === g.nome_curto);
      expect(p, `sem par em Futuro Líder: ${g.cod_desc}`).toBeTruthy();
      pares += 1;
      for (const c of ancoras) expect(p![c], `${g.cod_desc} / ${c}`).toBe(g[c]);
    }
    expect(pares).toBe(30);

    // E o que DEVE diferir, difere: o código e o cargo em todas, a pergunta em algumas.
    expect(gestor.every((g) => g.cod_comp.startsWith('GC'))).toBe(true);
    expect(potencial.every((p) => p.cod_comp.startsWith('FL'))).toBe(true);
    const perguntasDiferentes = gestor.filter((g) => {
      const p = potencial.find((x) => x.nome === g.nome && x.nome_curto === g.nome_curto)!;
      return p.perguntas_alvo !== g.perguntas_alvo;
    });
    expect(perguntasDiferentes.length).toBeGreaterThan(0);
  });

  it('o cargo de cada linha é o nome da variante: é por ele que competencias e cenários casam', () => {
    expect(linhasDaVariante('gestor').every((l) => l.cargo === VARIANTES.gestor)).toBe(true);
    expect(linhasDaVariante('potencial').every((l) => l.cargo === VARIANTES.potencial)).toBe(true);
  });

  it('(cod_comp, cod_desc) é único nas 60 linhas: é a chave de dedupe do instalador', () => {
    const todas = [...linhasDaVariante('gestor'), ...linhasDaVariante('potencial')];
    const chaves = todas.map((l) => `${l.cod_comp}||${l.cod_desc}`);
    expect(new Set(chaves).size).toBe(60);
  });

  it('nenhum campo que a IA3 e a IA4 leem vem vazio', () => {
    const todas = [...linhasDaVariante('gestor'), ...linhasDaVariante('potencial')];
    for (const l of todas) {
      for (const c of ['nome', 'cargo', 'cod_comp', 'cod_desc', 'nome_curto', 'n1_gap', 'n2_desenvolvimento', 'n3_meta', 'n4_referencia'] as const) {
        expect(l[c], `${l.cod_desc} / ${c}`).toBeTruthy();
      }
    }
  });

  it('quem OCUPA o cargo-alvo é gestor em exercício; quem não ocupa é potencial', () => {
    expect(varianteDe(true)).toBe('gestor');
    expect(varianteDe(false)).toBe('potencial');
  });

  /**
   * O instalador cria os dois cargos-âncora em `cargos_empresa`, e eles aparecem
   * em qualquer tela que liste cargos do tenant. Não são cargos de ninguém:
   * oferecê-los como cargo-alvo é oferecer o errado (visto na tela em 14/09).
   */
  it('reconhece os cargos-ÂNCORA, para as telas não os oferecerem como cargo real', () => {
    expect(ehCargoAncoraLideranca(VARIANTES.gestor)).toBe(true);
    expect(ehCargoAncoraLideranca(VARIANTES.potencial)).toBe(true);
    expect(ehCargoAncoraLideranca('  Gestor Comercial  ')).toBe(true);
    expect(ehCargoAncoraLideranca('Gerente Comercial')).toBe(false);
    expect(ehCargoAncoraLideranca('Coordenador de Operações')).toBe(false);
    expect(ehCargoAncoraLideranca(null)).toBe(false);
  });

  it('as linhas devolvidas são cópias: mexer no retorno não contamina a fixture', () => {
    const a = linhasDaVariante('gestor');
    a[0].n3_meta = 'ALTERADO';
    expect(linhasDaVariante('gestor')[0].n3_meta).not.toBe('ALTERADO');
  });
});
