import { describe, expect, it } from 'vitest';
import { montarRelatorioClinicas, htmlRelatorioClinicas, situacaoDaPessoa, SEM_CLINICA, type DadosRelatorioClinicas } from '@/lib/relatorio-clinicas/montar';

/**
 * Relatório por clínica do pacote de clínicas (onlabel, 23/10/2026). A primeira versão serve a SEMANA
 * DE ENTRADA: a onlabel (no papel de RH) cobra o perfil e o diagnóstico, e a regra é "quem não fizer em
 * 1 semana não começa". O que se guarda aqui: o RH lê o que falta pelo NOME da competência, o prazo é a
 * véspera do início da turma, quem perdeu o prazo aparece como "não começa", ninguém some do relatório,
 * e o texto digitado (nome de pessoa e de clínica) sai escapado no HTML.
 */

const C1 = { nome: 'Experiência e Continuidade', ids: ['c1a', 'c1b'] };
const C2 = { nome: 'Condução e Conversão', ids: ['c2a'] };
const C3 = { nome: 'Gestão e Resultados', ids: ['c3a'] };

function dados(over: Partial<DadosRelatorioClinicas> = {}): DadosRelatorioClinicas {
  return {
    clinicas: [{ id: 'k1', nome: 'Clínica Sol' }, { id: 'k2', nome: 'Clínica Lua' }],
    pessoas: [
      { id: 'a', nome: 'Ana', cargo: 'Secretária', escolaId: 'k1', temPerfil: false },
      { id: 'b', nome: 'Bia', cargo: 'Secretária', escolaId: 'k1', temPerfil: true },
      { id: 'c', nome: 'Cris', cargo: 'Secretária', escolaId: 'k2', temPerfil: true },
      { id: 'd', nome: 'Dani', cargo: 'Secretária', escolaId: null, temPerfil: true },
    ],
    competenciasPorCargo: new Map([['Secretária', [C1, C2, C3]]]),
    respostasPorPessoa: new Map([
      // Bia: as 3 (uma pela id, outra pela outra id da mesma competência, outra pelo nome)
      ['b', [{ competencia_id: 'c1b' }, { competencia_id: 'c2a' }, { competencia_nome: 'GESTÃO E RESULTADOS' }]],
      // Cris: só a 1
      ['c', [{ competencia_id: 'c1a' }]],
    ]),
    inicioDaTurmaPorPessoa: new Map([['a', '2026-11-10'], ['b', '2026-11-10'], ['c', '2026-11-10']]),
    trilhaPorPessoa: new Map(),
    ...over,
  };
}

describe('montarRelatorioClinicas', () => {
  it('diz o que falta pelo nome da competência e o prazo (véspera do início)', () => {
    const blocos = montarRelatorioClinicas(dados(), '2026-11-04');
    const sol = blocos.find((b) => b.nome === 'Clínica Sol')!;
    const ana = sol.pessoas.find((p) => p.nome === 'Ana')!;
    expect(situacaoDaPessoa(ana)).toBe(
      'Falta: perfil comportamental e diagnóstico de Experiência e Continuidade, Condução e Conversão, Gestão e Resultados. Prazo: 09/11 (a turma começa em 10/11)',
    );
    const cris = blocos.find((b) => b.nome === 'Clínica Lua')!.pessoas[0];
    expect(situacaoDaPessoa(cris)).toBe('Falta: diagnóstico de Condução e Conversão, Gestão e Resultados. Prazo: 09/11 (a turma começa em 10/11)');
  });

  it('conta a competência pela id de qualquer linha dela ou pelo nome (a régua da tela do diagnóstico)', () => {
    const bia = montarRelatorioClinicas(dados(), '2026-11-04').find((b) => b.nome === 'Clínica Sol')!.pessoas.find((p) => p.nome === 'Bia')!;
    expect(bia.respondidas).toBe(3);
    expect(situacaoDaPessoa(bia)).toBe('Tudo feito; começa em 10/11');
  });

  it('passado o prazo sem diagnóstico completo, a pessoa não começa com a turma', () => {
    const cris = montarRelatorioClinicas(dados(), '2026-11-10').find((b) => b.nome === 'Clínica Lua')!.pessoas[0];
    expect(cris.naoComeca).toBe(true);
    expect(situacaoDaPessoa(cris)).toMatch(/O prazo venceu em 09\/11: não começa com a turma de 10\/11/);
    // No próprio dia do prazo ainda dá tempo.
    expect(montarRelatorioClinicas(dados(), '2026-11-09').find((b) => b.nome === 'Clínica Lua')!.pessoas[0].naoComeca).toBe(false);
  });

  it('quem já está na trilha aparece com a temporada e a semana, e não conta como pendência', () => {
    const blocos = montarRelatorioClinicas(dados({ trilhaPorPessoa: new Map([['c', { numeroTemporada: 1, semanaAtual: 2, ativa: true }]]) }), '2026-11-17');
    const lua = blocos.find((b) => b.nome === 'Clínica Lua')!;
    expect(situacaoDaPessoa(lua.pessoas[0])).toBe('Na trilha: temporada 1, semana 2');
    expect(lua.totais.pendentes).toBe(0);
    expect(lua.totais.naTrilha).toBe(1);
  });

  it('ninguém some: quem não tem clínica sai no bloco "Sem clínica", por último', () => {
    const blocos = montarRelatorioClinicas(dados(), '2026-11-04');
    expect(blocos.at(-1)!.nome).toBe(SEM_CLINICA);
    expect(blocos.at(-1)!.pessoas.map((p) => p.nome)).toEqual(['Dani']);
    expect(situacaoDaPessoa(blocos.at(-1)!.pessoas[0])).toMatch(/ainda sem turma/);
    expect(blocos.reduce((s, b) => s + b.totais.pessoas, 0)).toBe(4);
  });

  it('clínicas com mais pendências primeiro (empate pelo nome); dentro dela, as pendentes primeiro', () => {
    // Empate (1 pendência em cada): ordem pelo nome.
    expect(montarRelatorioClinicas(dados(), '2026-11-04').map((b) => b.nome)).toEqual(['Clínica Lua', 'Clínica Sol', SEM_CLINICA]);
    // Sol com 2 pendências passa à frente da Lua, com 1.
    const d = dados();
    d.pessoas = d.pessoas.map((p) => (p.id === 'b' ? { ...p, temPerfil: false } : p));
    const blocos = montarRelatorioClinicas(d, '2026-11-04');
    expect(blocos.map((b) => b.nome)).toEqual(['Clínica Sol', 'Clínica Lua', SEM_CLINICA]);
    // Dentro da clínica: pendente antes de quem já fez tudo.
    const sol = montarRelatorioClinicas(dados(), '2026-11-04').find((b) => b.nome === 'Clínica Sol')!;
    expect(sol.pessoas.map((p) => p.nome)).toEqual(['Ana', 'Bia']);
  });
});

describe('htmlRelatorioClinicas', () => {
  it('escapa o texto digitado e não leva contato das secretárias', () => {
    const d = dados({
      clinicas: [{ id: 'k1', nome: 'Clínica <b>Sol</b>' }],
      pessoas: [{ id: 'a', nome: '<script>alert(1)</script>', cargo: 'Secretária', escolaId: 'k1', temPerfil: false }],
    });
    const html = htmlRelatorioClinicas(montarRelatorioClinicas(d, '2026-11-04'), 'onlabel', '2026-11-04');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('Clínica &lt;b&gt;Sol&lt;/b&gt;');
    expect(html).not.toMatch(/@|\+55|whatsapp/i);
  });
});
