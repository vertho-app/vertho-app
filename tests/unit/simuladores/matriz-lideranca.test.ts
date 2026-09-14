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
  it('a RÉGUA é idêntica entre as variantes; o que muda é a cláusula de aplicação', () => {
    const lider = linhasDaVariante('lider');
    const futuro = linhasDaVariante('futuro');
    const ancoras = ['descritor_completo', 'n1_gap', 'n2_desenvolvimento', 'n3_meta', 'n4_referencia', 'evidencias_esperadas'] as const;

    let pares = 0;
    for (const l of lider) {
      const f = futuro.find((x) => x.nome === l.nome && x.nome_curto === l.nome_curto);
      expect(f, `sem par em Futuro Líder: ${l.cod_desc}`).toBeTruthy();
      pares += 1;
      for (const c of ancoras) expect(f![c], `${l.cod_desc} / ${c}`).toBe(l[c]);
    }
    expect(pares).toBe(30);

    // O código e o cargo diferem em TODAS.
    expect(lider.every((l) => l.cod_comp.startsWith('LD'))).toBe(true);
    expect(futuro.every((f) => f.cod_comp.startsWith('FL'))).toBe(true);

    /**
     * `Medido: 14/09/2026` na matriz TRANSVERSAL a pergunta é a mesma nas duas
     * variantes (0 de 30 diferem; na matriz comercial anterior, 7 de 30). O que
     * separa os públicos passou a ser a cláusula de aplicação na `descricao`,
     * que entra no prompt da IA3: "liderança de pessoas, equipes ou projetos"
     * contra "preparação para a liderança". Se isso empatar também, as duas
     * variantes deixam de ter razão de existir, e o teste avisa.
     */
    const descricoesDiferentes = lider.filter((l) => {
      const f = futuro.find((x) => x.nome === l.nome && x.nome_curto === l.nome_curto)!;
      return f.descricao !== l.descricao;
    });
    expect(descricoesDiferentes).toHaveLength(30);
  });

  it('o cargo de cada linha é o nome da variante: é por ele que competencias e cenários casam', () => {
    expect(linhasDaVariante('lider').every((l) => l.cargo === VARIANTES.lider)).toBe(true);
    expect(linhasDaVariante('futuro').every((l) => l.cargo === VARIANTES.futuro)).toBe(true);
  });

  it('(cod_comp, cod_desc) é único nas 60 linhas: é a chave de dedupe do instalador', () => {
    const todas = [...linhasDaVariante('lider'), ...linhasDaVariante('futuro')];
    const chaves = todas.map((l) => `${l.cod_comp}||${l.cod_desc}`);
    expect(new Set(chaves).size).toBe(60);
  });

  it('nenhum campo que a IA3 e a IA4 leem vem vazio', () => {
    const todas = [...linhasDaVariante('lider'), ...linhasDaVariante('futuro')];
    for (const l of todas) {
      for (const c of ['nome', 'cargo', 'cod_comp', 'cod_desc', 'nome_curto', 'n1_gap', 'n2_desenvolvimento', 'n3_meta', 'n4_referencia'] as const) {
        expect(l[c], `${l.cod_desc} / ${c}`).toBeTruthy();
      }
    }
  });

  it('quem OCUPA o cargo-alvo é líder em exercício; quem não ocupa é futuro líder', () => {
    expect(varianteDe(true)).toBe('lider');
    expect(varianteDe(false)).toBe('futuro');
  });

  /**
   * O instalador cria os dois cargos-âncora em `cargos_empresa`, e eles aparecem
   * em qualquer tela que liste cargos do tenant. Não são cargos de ninguém:
   * oferecê-los como cargo-alvo é oferecer o errado (visto na tela em 14/09).
   */
  it('reconhece os cargos-ÂNCORA, para as telas não os oferecerem como cargo real', () => {
    expect(ehCargoAncoraLideranca(VARIANTES.lider)).toBe(true);
    expect(ehCargoAncoraLideranca(VARIANTES.futuro)).toBe(true);
    expect(ehCargoAncoraLideranca('  Líder  ')).toBe(true);
    expect(ehCargoAncoraLideranca('Gerente Comercial')).toBe(false);
    expect(ehCargoAncoraLideranca('Liderança')).toBe(false);
    expect(ehCargoAncoraLideranca('Coordenador de Operações')).toBe(false);
    expect(ehCargoAncoraLideranca(null)).toBe(false);
  });

  it('as linhas devolvidas são cópias: mexer no retorno não contamina a fixture', () => {
    const a = linhasDaVariante('lider');
    a[0].n3_meta = 'ALTERADO';
    expect(linhasDaVariante('lider')[0].n3_meta).not.toBe('ALTERADO');
  });
});
