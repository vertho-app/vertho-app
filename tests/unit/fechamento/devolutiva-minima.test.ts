/**
 * Devolutiva mínima (19/09/2026): o texto que a pessoa lê quando a nota mudou
 * depois do scorer e a redação final não saiu. Montada das NOTAS FINAIS, sem IA:
 * tem que ser coerente com elas por construção e seguir as regras do texto para
 * a pessoa (segunda pessoa, sem termo interno, sem código da matriz, sem
 * travessão, sem falar em avanço no piloto).
 */
import { describe, it, expect } from 'vitest';
import { devolutivaMinima } from '@/lib/season-engine/devolutiva-minima';

const RASCUNHO = {
  mensagem_geral: 'COLAB_X, rascunho que citava a nota de antes.',
  evidencias_citadas: ['"eu ouviria as duas partes"', '  '],
  principal_avanco: 'rascunho: registro',
  principal_ponto_de_atencao: 'rascunho: escuta',
  mensagem_final: 'rascunho',
  proximos_passos: ['Registre o combinado', 'Ouça antes de propor', 'Retome na sexta', 'Quarto passo sobra'],
};

const d = (descritor: string, nota_pre: number | null, nota_final: number | null) => ({ descritor, nota_pre, nota_final });

const base = {
  nomeColab: 'COLAB_X',
  competencia: 'Gestão de Conflitos',
  isPiloto: false,
  rascunho: RASCUNHO,
  descritores: [
    d('Escuta ativa', 2.6, 3.7),      // +1,1
    d('Registro da conversa', 2.6, 2.8), // +0,2
    d('Combinados claros', 2.6, 3.2), // +0,6
  ],
};

const INSTRUMENTO = /\b(conversa|microcaso|entrevista|evidência|descritor|avaliação|nota|relatório|IA|simulador)\b/i;
const INTERNO = /\b(N[1-4]|acumulado|régua|triangulação|arguição)\b/;

describe('devolutivaMinima', () => {
  it('ordena pelo avanço final: dois maiores no destaque, o menor na atenção', () => {
    const r = devolutivaMinima(base)!;
    expect(r.mensagem_geral).toBe(
      'COLAB_X, este é o resultado do fechamento da sua jornada em Gestão de Conflitos. '
      + 'Os pontos em que você mais avançou foram Escuta ativa e Combinados claros. '
      + 'O que mais pede atenção agora é Registro da conversa.',
    );
    expect(r.principal_avanco).toBe('Escuta ativa: foi onde você mais avançou.');
    expect(r.principal_ponto_de_atencao).toBe('Registro da conversa: é o que mais pede atenção agora.');
    expect(r.mensagem_final).toBe(
      'Você leva desta jornada o que praticou em Escuta ativa. O próximo passo é continuar trabalhando '
      + 'Registro da conversa, que é onde está o maior espaço para crescer.',
    );
  });

  it('do rascunho ficam só as evidências citadas e os próximos passos (até 3, sem vazio)', () => {
    const r = devolutivaMinima(base)!;
    expect(r.evidencias_citadas).toEqual(['"eu ouviria as duas partes"']);
    expect(r.proximos_passos).toEqual(['Registre o combinado', 'Ouça antes de propor', 'Retome na sexta']);
    expect(JSON.stringify(r)).not.toContain('rascunho');
  });

  it('segue as regras do texto para a pessoa: sem instrumento no fecho, sem termo interno, sem travessão', () => {
    // A regra vale para o texto do MODELO: o nome de um aspecto ("Registro da
    // conversa") é conteúdo da matriz e pode conter qualquer palavra.
    const semNomes = (t: string) => base.descritores.reduce((s, x) => s.split(x.descritor).join('<ASPECTO>'), t);
    for (const isPiloto of [false, true]) {
      const r = devolutivaMinima({ ...base, isPiloto })!;
      expect(semNomes(r.mensagem_final)).not.toMatch(INSTRUMENTO);
      for (const campo of [r.mensagem_geral, r.principal_avanco, r.principal_ponto_de_atencao, r.mensagem_final]) {
        expect(semNomes(campo)).not.toMatch(INTERNO);
        expect(campo).not.toMatch(/[—–]/);
      }
    }
  });

  it('sem avanço positivo em ninguém: fala dos pontos mais sólidos, pela nota final', () => {
    const r = devolutivaMinima({ ...base, descritores: [d('A', 3, 3), d('B', 3.2, 3.1), d('C', 2.5, 2.5)] })!;
    expect(r.mensagem_geral).toContain('Os pontos mais sólidos foram B e A.');
    expect(r.mensagem_geral).toContain('O que mais pede atenção agora é C.');
    expect(r.principal_avanco).toBe('B: é o seu ponto mais sólido.');
  });

  it('piloto: nunca fala em avanço (a janela não mede evolução) e ordena pela nota final', () => {
    const r = devolutivaMinima({ ...base, isPiloto: true })!;
    const tudo = [r.mensagem_geral, r.principal_avanco, r.principal_ponto_de_atencao, r.mensagem_final].join(' ');
    expect(tudo).not.toMatch(/avan[çc]|evolu/i);
    expect(r.mensagem_geral).toBe(
      'COLAB_X, este é o resultado da demonstração em Gestão de Conflitos. '
      + 'Os pontos mais sólidos foram Escuta ativa e Combinados claros. '
      + 'O que mais pede atenção agora é Registro da conversa.',
    );
    expect(r.mensagem_final).toBe(
      'Você leva desta demonstração um retrato do seu ponto de partida em Gestão de Conflitos. '
      + 'O maior espaço para crescer está em Registro da conversa.',
    );
  });

  it('dois aspectos: um no destaque e o outro na atenção; um só: sem atenção', () => {
    const dois = devolutivaMinima({ ...base, descritores: [d('A', 2, 3), d('B', 2, 2.2)] })!;
    expect(dois.mensagem_geral).toContain('O ponto em que você mais avançou foi A.');
    expect(dois.principal_ponto_de_atencao).toBe('B: é o que mais pede atenção agora.');
    const um = devolutivaMinima({ ...base, descritores: [d('A', 2, 3)] })!;
    expect(um.principal_ponto_de_atencao).toBe('');
    expect(um.mensagem_geral).not.toContain('atenção');
    expect(um.mensagem_final).toBe('Você leva desta jornada o que praticou em A.');
  });

  it('código da matriz nunca aparece para a pessoa', () => {
    const r = devolutivaMinima({ ...base, descritores: [d('COO03_D1 — Escuta ativa', 2, 3), d('COO03_D2 — Registro', 2, 2.1)] })!;
    expect(JSON.stringify(r)).not.toMatch(/COO03_D/);
    expect(r.principal_avanco).toBe('Escuta ativa: foi onde você mais avançou.');
  });

  it('empate no avanço: maior nota final primeiro; empate total, ordem alfabética', () => {
    const r = devolutivaMinima({ ...base, descritores: [d('Zeta', 2, 3), d('Alfa', 2, 3), d('Beta', 2.5, 3.5), d('Gama', 2, 2.1)] })!;
    expect(r.mensagem_geral).toContain('foram Beta e Alfa.');
  });

  it('sem nenhum aspecto com nota final: null (o caller mantém o rascunho)', () => {
    expect(devolutivaMinima({ ...base, descritores: [d('A', 2, null)] })).toBeNull();
    expect(devolutivaMinima({ ...base, descritores: [] })).toBeNull();
  });
});
