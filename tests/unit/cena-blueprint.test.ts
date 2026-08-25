// A cena consegue OBSERVAR este descritor, ou o avaliado só consegue prometer?
//
// 🔴 A pergunta nasceu de uma medição, não de teoria. Desagregando as 5 cenas
// do braço N3 da fase 0e, quatro descritores chegaram ao nível-meta e dois
// ficaram parados — e os dois são exatamente aqueles cujo N3 exige a outra
// parte na sala. Sem D2 e D4, o braço fecha em 3,00: o nível-meta cravado.
//
// ⚠️ Este detector é RELATÓRIO, não gate, e a razão está no §5 do registro: um
// classificador de "natureza de descritor" já foi tentado aqui e removido,
// porque lia `perguntas_alvo` (retrospectivo para todo descritor) e porque os
// testes dele foram alimentados com os mesmos exemplos de onde os padrões
// saíram. Aqui a fonte é o texto do N3 e o veredito é humano.
import { describe, expect, it } from 'vitest';
import { auditarAlcancabilidade } from '@/lib/season-engine/cena/blueprint';
import type { DescritorDaRegua } from '@/lib/season-engine/cena/prompts';

const d = (indice: number, nomeCurto: string, n3: string): DescritorDaRegua => ({
  indice, nomeCurto, descritorCompleto: '', n1: '', n2: '', n3, n4: '',
  evidenciasEsperadas: '', perguntasAlvo: '',
});

// Os seis do piloto, com o texto REAL da régua do Ibipeba.
const DIR08 = [
  d(1, 'Desescalada', 'Intervém rapidamente com técnicas que reduzem a tensão e abrem espaço para diálogo.'),
  d(2, 'Escuta imparcial', 'Escuta todas as partes com neutralidade genuína; investiga antes de concluir.'),
  d(3, 'Identificação de causas', 'Investiga causas subjacentes, identifica padrões recorrentes e age sobre a raiz.'),
  d(4, 'Mediação', 'Facilita mediação com método: escuta, reformula, constrói acordo com compromissos de ambos.'),
  d(5, 'Reparação', 'Promove reparação genuína: reconhecimento do impacto, responsabilização e restauração do vínculo.'),
  d(6, 'Prevenção de recorrência', 'Cria combinados claros, rotinas de convivência e espaços de diálogo que previnem padrões.'),
];

describe('o eixo OUTRA PARTE — corroborado pela medição', () => {
  it('marca D2 e D4, e só eles', () => {
    // Assinatura medida: D2 assistido 2,44 e D4 2,24 (N3 em 1 de 8 evidências),
    // contra D1 3,00 · D3 3,00 · D5 3,20 · D6 2,80.
    const bilaterais = auditarAlcancabilidade(DIR08)
      .filter((s) => s.risco === 'exige_outra_parte').map((s) => s.indice).sort();
    expect(bilaterais).toEqual([2, 4]);
  });

  it('o marcador que disparou vem junto, para o humano julgar em vez de engolir', () => {
    const s = auditarAlcancabilidade(DIR08).find((x) => x.indice === 4 && x.risco === 'exige_outra_parte')!;
    expect(s.marcador).toBe('de ambos');
    expect(s.trecho).toContain('de ambos');
  });

  it('N3 francamente unilateral NÃO é marcado', () => {
    const limpo = [d(1, 'x', 'Intervém rapidamente com técnicas que reduzem a tensão e abrem espaço para diálogo.')];
    expect(auditarAlcancabilidade(limpo)).toEqual([]);
  });
});

describe('o eixo TEMPO — mais fraco, e a medição diz onde ele erra', () => {
  it('marca D3 e D6', () => {
    const temporais = auditarAlcancabilidade(DIR08)
      .filter((s) => s.risco === 'exige_tempo').map((s) => s.indice).sort();
    expect(temporais).toEqual([3, 6]);
  });

  it('🔴 D3 é FALSO POSITIVO conhecido, e fica pinado aqui de propósito', () => {
    // "identifica padrões RECORRENTES" — o marcador descreve o OBJETO que a
    // pessoa identifica, não a cadência do comportamento dela. E a medição
    // concorda: D3 fechou em 3,00, o nível-meta, na mesma rodada em que D2 e D4
    // ficaram em 2,44 e 2,24.
    //
    // Fica pinado para ninguém "consertar" o detector em silêncio achando que
    // acertou: o eixo TEMPO tem 1 falso positivo confirmado em 2 marcações
    // nesta competência, e é por isso que a saída é relatório com humano na
    // frente, não gate.
    const s = auditarAlcancabilidade(DIR08).find((x) => x.indice === 3);
    expect(s?.risco).toBe('exige_tempo');
    expect(s?.marcador).toBe('recorrência');
  });
});

describe('o DENOMINADOR — um detector que marca quase tudo não separa nada', () => {
  it('sobre a régua inteira do cargo, marca uma minoria', () => {
    // Medido sobre as 13 competências de Gestão Escolar do Ibipeba, 78
    // descritores: 4 de outra parte (5%) e 8 de tempo (10%). É o oposto do que
    // aconteceu com a flag `provocado`, que marcava 76% das evidências e por
    // isso não carregava informação nenhuma.
    //
    // Aqui a suíte exercita a propriedade com uma amostra sintética larga: se
    // alguém alargar os marcadores até marcarem tudo, este teste cai.
    const muitos = Array.from({ length: 20 }, (_, i) =>
      d(i + 1, `D${i + 1}`, 'Define metas claras com o time e acompanha a execução até o resultado.'));
    expect(auditarAlcancabilidade(muitos)).toEqual([]);
  });

  it('descritor sem texto de nível-meta é ignorado, não marcado', () => {
    expect(auditarAlcancabilidade([d(1, 'x', ''), d(2, 'y', '   ')])).toEqual([]);
  });
});
