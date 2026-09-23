import { describe, expect, it } from 'vitest';
import { atribuirCodigosDaMatriz, preencherCelulasMescladas, prefixoDoCargo, separarLinhasDoImport } from '@/lib/matriz-import';

/**
 * CÓDIGOS DA MATRIZ GERADOS NO IMPORT (23/09/2026).
 *
 * Antes: `cod_comp` vazio virava as 10 primeiras letras do nome ("Gestão de
 * Pessoas" e "Gestão de Projetos" → "GESTÃO DE ", uma competência só) e
 * `cod_desc` vazio ficava nulo — descritor gravado que a tela e a régua ignoram.
 */

const COORD = 'Coordenador(a) de Equipe';
const regua = { n1_gap: 'n1', n2_desenvolvimento: 'n2', n3_meta: 'n3', n4_referencia: 'n4' };
const linha = (nome: string, cargo: string | null, nome_curto: string, extra: Record<string, string> = {}) =>
  ({ nome, cargo, nome_curto, ...regua, ...extra });
const codigos = (ls: { cod_comp?: string | null; cod_desc?: string | null }[]) => ls.map((l) => [l.cod_comp, l.cod_desc]);

describe('prefixoDoCargo', () => {
  it('3 primeiras letras do cargo, sem acento nem pontuação; sem cargo → CMP', () => {
    expect(prefixoDoCargo(COORD)).toBe('COO');
    expect(prefixoDoCargo('Ágil (líder)')).toBe('AGI');
    expect(prefixoDoCargo('TI')).toBe('TI');
    expect(prefixoDoCargo(null)).toBe('CMP');
    expect(prefixoDoCargo(' (-) ')).toBe('CMP');
  });
});

describe('atribuirCodigosDaMatriz', () => {
  it('competência sem código ganha COO01, os descritores COO01-D01..., a seguinte COO02', () => {
    const r = atribuirCodigosDaMatriz([
      linha('Feedback', COORD, 'A'), linha('Feedback', COORD, 'B'), linha('Delegação', COORD, 'C'),
    ], []);
    expect(codigos(r.linhas)).toEqual([['COO01', 'COO01-D01'], ['COO01', 'COO01-D02'], ['COO02', 'COO02-D01']]);
    expect(r.gerados).toBe(5);
    expect(r.conflitos).toEqual([]);
  });

  it('"Gestão de Pessoas" e "Gestão de Projetos" são competências DIFERENTES (a regra antiga dava "GESTÃO DE " às duas)', () => {
    const r = atribuirCodigosDaMatriz([linha('Gestão de Pessoas', COORD, 'A'), linha('Gestão de Projetos', COORD, 'B')], []);
    expect(r.linhas[0].cod_comp).not.toBe(r.linhas[1].cod_comp);
  });

  it('nome com outra caixa, acento ou espaço é a MESMA competência', () => {
    const r = atribuirCodigosDaMatriz([linha('Gestão de Pessoas', COORD, 'A'), linha('  gestao  de PESSOAS', COORD, 'B')], []);
    expect(codigos(r.linhas)).toEqual([['COO01', 'COO01-D01'], ['COO01', 'COO01-D02']]);
  });

  it('continua a numeração do banco para o prefixo e não repete código usado em outro cargo', () => {
    const r = atribuirCodigosDaMatriz([linha('Nova', COORD, 'A')], [
      { nome: 'X', cargo: COORD, cod_comp: 'COO03' },
      { nome: 'Y', cargo: 'Coordenação Pedagógica', cod_comp: 'COO07' },
    ]);
    expect(r.linhas[0].cod_comp).toBe('COO08');
  });

  it('reimportar o mesmo arquivo sem códigos devolve os MESMOS códigos (é o que faz o dedup funcionar)', () => {
    const arquivo = [linha('Feedback', COORD, 'A'), linha('Feedback', COORD, 'B'), linha('Delegação', COORD, 'C')];
    const primeira = atribuirCodigosDaMatriz(arquivo, []);
    const segunda = atribuirCodigosDaMatriz(arquivo, primeira.linhas);
    expect(codigos(segunda.linhas)).toEqual(codigos(primeira.linhas));
    expect(segunda.gerados).toBe(0);
  });

  it('descritor novo numa competência que já existe entra com o próximo número, mesmo com os antigos em outro formato', () => {
    const banco = [1, 2, 3, 4, 5, 6].map((i) => ({ nome: 'Feedback', cargo: COORD, cod_comp: 'COO01', cod_desc: `COO01_D${i}`, nome_curto: `Antigo ${i}` }));
    const r = atribuirCodigosDaMatriz([linha('Feedback', COORD, 'Antigo 2'), linha('Feedback', COORD, 'Novo')], banco);
    expect(codigos(r.linhas)).toEqual([['COO01', 'COO01_D2'], ['COO01', 'COO01-D07']]);
  });

  it('a mesma matriz em 2 cargos sai com os MESMOS códigos (cópias idênticas, um módulo-base), mesmo em outra ordem', () => {
    const PROF = 'Professor(a)';
    // 2º cargo com os descritores INVERTIDOS: numerar pela ordem acertaria por coincidência na mesma ordem.
    const r = atribuirCodigosDaMatriz([
      linha('Feedback', COORD, 'A'), linha('Feedback', COORD, 'B'),
      linha('Feedback', PROF, 'B'), linha('Feedback', PROF, 'A'),
    ], []);
    expect(codigos(r.linhas)).toEqual([
      ['COO01', 'COO01-D01'], ['COO01', 'COO01-D02'],
      ['COO01', 'COO01-D02'], ['COO01', 'COO01-D01'],
    ]);
  });

  it('nome que já existe com 2 códigos diferentes (réguas diferentes) não escolhe um deles: gera novo', () => {
    const r = atribuirCodigosDaMatriz([linha('Autocuidado', 'Professor', 'A')], [
      { nome: 'Autocuidado', cargo: 'Coordenação', cod_comp: 'COO03' },
      { nome: 'Autocuidado', cargo: 'Direção', cod_comp: 'DIR02' },
    ]);
    expect(r.linhas[0].cod_comp).toBe('PRO01');
  });

  it('código digitado é respeitado, e as linhas sem código da mesma competência o seguem', () => {
    const r = atribuirCodigosDaMatriz([
      linha('Feedback', COORD, 'A', { cod_comp: 'LID01', cod_desc: 'LID01-D01' }),
      linha('Feedback', COORD, 'B'),
    ], []);
    expect(codigos(r.linhas)).toEqual([['LID01', 'LID01-D01'], ['LID01', 'LID01-D02']]);
    expect(r.gerados).toBe(1);
  });

  it('código gerado não pisa em código digitado mais abaixo no arquivo', () => {
    const r = atribuirCodigosDaMatriz([linha('A', COORD, 'x'), linha('B', COORD, 'y', { cod_comp: 'COO01' })], []);
    expect(r.linhas.map((l) => l.cod_comp)).toEqual(['COO02', 'COO01']);
  });

  it('linha-cabeçalho da competência (sem nenhum campo da régua) fica sem cod_desc', () => {
    const r = atribuirCodigosDaMatriz([{ nome: 'Feedback', cargo: COORD }, linha('Feedback', COORD, 'A')], []);
    expect(codigos(r.linhas)).toEqual([['COO01', null], ['COO01', 'COO01-D01']]);
  });

  it('sem cargo: prefixo CMP', () => {
    expect(atribuirCodigosDaMatriz([linha('Feedback', null, 'A')], []).linhas[0].cod_comp).toBe('CMP01');
  });

  it('mesmo código digitado para 2 competências no MESMO cargo é conflito; em cargos diferentes, não', () => {
    const noMesmo = atribuirCodigosDaMatriz([
      linha('Feedback', COORD, 'A', { cod_comp: 'LID01' }), linha('Delegação', COORD, 'B', { cod_comp: 'lid01' }),
    ], []);
    expect(noMesmo.conflitos).toEqual([`lid01 (${COORD}): "Feedback" e "Delegação"`]);

    const emOutro = atribuirCodigosDaMatriz([
      linha('Feedback', COORD, 'A', { cod_comp: 'LID01' }), linha('Delegação', 'Diretor', 'B', { cod_comp: 'LID01' }),
    ], []);
    expect(emOutro.conflitos).toEqual([]);
  });

  it('código digitado que no banco é de OUTRA competência do cargo é conflito', () => {
    const r = atribuirCodigosDaMatriz([linha('Delegação', COORD, 'A', { cod_comp: 'COO01' })], [
      { nome: 'Feedback', cargo: COORD, cod_comp: 'COO01' },
    ]);
    expect(r.conflitos).toEqual([`COO01 (${COORD}): "Feedback" e "Delegação"`]);
  });
});

describe('preencherCelulasMescladas', () => {
  it('descritores da competência herdam nome, código, cargo e descrição da linha de cima', () => {
    const r = preencherCelulasMescladas([
      { nome: 'Feedback', cod_comp: 'LID01', cargo: COORD, descricao: 'D', nome_curto: 'A' },
      { nome: '', cod_comp: '', cargo: '', descricao: '', nome_curto: 'B' },
    ]);
    expect(r[1]).toMatchObject({ nome: 'Feedback', cod_comp: 'LID01', cargo: COORD, descricao: 'D', nome_curto: 'B' });
  });

  it('competência NOVA não herda o código nem a descrição da de cima (herdava e se fundia com ela); o cargo, sim', () => {
    const r = preencherCelulasMescladas([
      { nome: 'Feedback', cod_comp: 'LID01', cargo: COORD, descricao: 'D', nome_curto: 'A' },
      { nome: 'Delegação', cod_comp: '', cargo: '', descricao: '', nome_curto: 'B' },
    ]);
    expect(r[1]).toMatchObject({ nome: 'Delegação', cod_comp: '', cargo: COORD, descricao: '' });
  });

  it('linha sem nome, nem herdado, sai', () => {
    expect(preencherCelulasMescladas([{ nome: '', nome_curto: 'órfã' }])).toEqual([]);
  });
});

describe('separarLinhasDoImport', () => {
  const completa = { nome: 'Feedback', descricao: 'D', n1_gap: '1', n2_desenvolvimento: '2', n4_referencia: '4' };

  it('linha sem cargo sai À PARTE (a IA1 descarta competência sem cargo: seria gravada e nunca usada)', () => {
    const ok = { ...completa, cargo: COORD };
    const semCargo = { ...completa, cargo: '' };
    const soEspaco = { ...completa, cargo: '   ' };
    const r = separarLinhasDoImport([ok, semCargo, soEspaco]);
    expect(r.validas).toEqual([ok]);
    expect(r.semCargo).toEqual([semCargo, soEspaco]);
    expect(r.semObrigatorios).toEqual([]);
  });

  it('linha sem obrigatório conta só como sem obrigatório, mesmo sem cargo (um aviso por linha)', () => {
    const semN1 = { ...completa, n1_gap: '', cargo: '' };
    const r = separarLinhasDoImport([semN1]);
    expect(r.semObrigatorios).toEqual([semN1]);
    expect(r.semCargo).toEqual([]);
    expect(r.validas).toEqual([]);
  });

  it('cargo herdado da linha de cima (célula mesclada) conta como preenchido', () => {
    const linhas = preencherCelulasMescladas([{ ...completa, cargo: COORD }, { ...completa, nome: '', cargo: '' }]);
    expect(separarLinhasDoImport(linhas).validas).toHaveLength(2);
  });
});
