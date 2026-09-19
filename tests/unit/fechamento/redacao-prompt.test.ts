/**
 * Peças puras da redação final (18/09/2026): o prompt, o validador, a ordem dos
 * aspectos e a linha anotada na justificativa.
 */
import { describe, it, expect } from 'vitest';
import { ordenarPorAvancoFinal, promptRedacaoFechamento, validarRedacao } from '@/lib/season-engine/prompts/fechamento-redacao';
import { anotarAjusteArguicao } from '@/lib/season-engine/fusao-arguicao';
import { regrasDaDevolutiva, tomDevolutivaPorPerfil } from '@/lib/season-engine/prompts/evolution-scenario';

const RASCUNHO = {
  mensagem_geral: 'COLAB_X, rascunho.',
  evidencias_citadas: ['trecho do rascunho'],
  principal_avanco: 'a',
  principal_ponto_de_atencao: 'b',
  mensagem_final: 'c',
  proximos_passos: ['d'],
};

const base = {
  competencia: 'Comp',
  nomeColab: 'COLAB_X',
  perfilDominante: 'D',
  semanasEvidencia: 6,
  notaPrograma: '',
  rascunho: RASCUNHO,
  descritores: [
    { descritor: 'Baixo', nota_pre: 2, nota_rascunho: 3, nota_final: 2.5, sustentacao_arguicao: 'fragilizou', forca_arguicao: 'forte', citacao_arguicao: 'não sei', justificativa: 'jb' },
    { descritor: 'Alto', nota_pre: 2, nota_rascunho: 3, nota_final: 3.5, sustentacao_arguicao: 'aprofundou', forca_arguicao: 'forte', citacao_arguicao: 'eu faria', justificativa: 'ja' },
    { descritor: 'Sem nota', nota_pre: null, nota_rascunho: null, nota_final: null, justificativa: null },
  ],
  arguicao: { leitura_geral: 'consistente', sustentacao_mais_forte: 'x', fragilidade_mais_relevante: 'y' },
};

describe('promptRedacaoFechamento', () => {
  const { system, user } = promptRedacaoFechamento(base as any);

  it('herda as regras da devolutiva do scorer, sem o travessão delas', () => {
    const regras = regrasDaDevolutiva({ nomeColab: 'COLAB_X', semanasEvidencia: 6, notaPrograma: '', tomDevol: tomDevolutivaPorPerfil('D') });
    expect(regras).toContain(' — '); // o bloco do scorer usa travessão...
    expect(system).toContain('FECHO (mensagem_final): a ÚLTIMA coisa que COLAB_X lê no relatório:');
    expect(system).toContain('PROIBIDO citar o INSTRUMENTO');
    expect(system).not.toMatch(/[—–]/); // ...e o prompt da redação não tem nenhum
    expect(user).not.toMatch(/[—–]/);
  });

  it('proíbe número de nota e termo interno no texto', () => {
    expect(system).toContain('não escreva números de nota nem níveis no texto');
    expect(system).toContain('"acumulado"');
    expect(system).toContain('"N3"');
  });

  it('lista do maior para o menor avanço final, sem nota por último', () => {
    expect(user.indexOf('1. Alto: início 2,0, final 3,5 (avanço final +1,5)')).toBeGreaterThan(-1);
    expect(user.indexOf('2. Baixo: início 2,0, final 2,5 (avanço final +0,5)')).toBeGreaterThan(-1);
    expect(user).toContain('3. Sem nota: início sem nota, final sem nota');
  });

  it('leva a defesa oral e o rascunho', () => {
    expect(user).toContain('Na defesa oral, fragilizou, força forte: "não sei".');
    expect(user).toContain('- Leitura geral: consistente');
    expect(user).toContain('"principal_avanco": "a"');
  });

  it('evidências das semanas: presentes quando há, aviso explícito quando não há', () => {
    expect(user).toContain('EVIDÊNCIAS DAS 6 SEMANAS (o que COLAB_X registrou na jornada):\n(sem evidências registradas nas semanas)');
    const com = promptRedacaoFechamento({ ...base, evidenciasSemanas: '  Sem 2: fechou o combinado.  ' } as any);
    expect(com.user).toContain('EVIDÊNCIAS DAS 6 SEMANAS (o que COLAB_X registrou na jornada):\nSem 2: fechou o combinado.\n');
  });

  it('piloto: carrega as proibições de falar em evolução', () => {
    const p = promptRedacaoFechamento({ ...base, notaPrograma: 'Este é um PILOTO de 2 semanas.' } as any);
    expect(p.system).toContain('Nesta janela curta o fecho NÃO afirma evolução');
  });
});

describe('ordenarPorAvancoFinal', () => {
  it('empate no avanço: maior nota final primeiro', () => {
    const o = ordenarPorAvancoFinal([
      { descritor: 'A', nota_pre: 1, nota_rascunho: 1, nota_final: 2 },
      { descritor: 'B', nota_pre: 2, nota_rascunho: 2, nota_final: 3 },
    ]);
    expect(o.map((d) => d.descritor)).toEqual(['B', 'A']);
  });
});

describe('validarRedacao', () => {
  const ok = { mensagem_geral: 'm', principal_avanco: 'a', principal_ponto_de_atencao: 'p', mensagem_final: 'f', proximos_passos: ['1', '2', '3', '4', ''] };

  it('aceita com ou sem o envelope resumo_avaliacao; passos no teto de 3', () => {
    expect(validarRedacao({ resumo_avaliacao: ok }, RASCUNHO)!.proximos_passos).toEqual(['1', '2', '3']);
    expect(validarRedacao(ok, RASCUNHO)!.mensagem_final).toBe('f');
  });

  it.each(['mensagem_geral', 'principal_avanco', 'principal_ponto_de_atencao', 'mensagem_final'])('sem %s: null (o caller mantém o rascunho inteiro)', (campo) => {
    expect(validarRedacao({ resumo_avaliacao: { ...ok, [campo]: '  ' } }, RASCUNHO)).toBeNull();
  });

  it('evidências ausentes vêm do rascunho', () => {
    expect(validarRedacao({ resumo_avaliacao: ok }, RASCUNHO)!.evidencias_citadas).toEqual(['trecho do rascunho']);
  });

  it('lixo: null', () => {
    expect(validarRedacao(null, RASCUNHO)).toBeNull();
    expect(validarRedacao('texto', RASCUNHO)).toBeNull();
  });
});

describe('anotarAjusteArguicao', () => {
  it('piloto: cita o ajuste e o piso quando a nota exibida difere da fundida', () => {
    const out = anotarAjusteArguicao({
      avaliacao_por_descritor: [{
        descritor: 'D1', justificativa: 'j', nota_base_cenario: 1.5, ajuste_arguicao: -0.5,
        sustentacao_arguicao: 'fragilizou', forca_arguicao: 'forte', nota_pos: 2.0, piso_aplicado: true,
      }],
    });
    expect(out.avaliacao_por_descritor[0].justificativa).toBe(
      'j\n\nDefesa oral: fragilizou (forte). Ajuste de -0,5 sobre a nota antes da defesa (1,5 → 1,0); o texto acima trata da nota antes da defesa. Piso do piloto: nota exibida 2,0.',
    );
  });

  it('sem justificativa, a linha vira a justificativa; sem ajuste, nada muda', () => {
    const out = anotarAjusteArguicao({
      avaliacao_por_descritor: [
        { descritor: 'A', nota_base_cenario: 3, ajuste_arguicao: 0.2, sustentacao_arguicao: 'aprofundou', forca_arguicao: 'fraca', nota_pos: 3.2 },
        { descritor: 'B', justificativa: 'intacta', nota_base_cenario: 3, ajuste_arguicao: 0, nota_pos: 3 },
      ],
    });
    expect(out.avaliacao_por_descritor[0].justificativa).toBe('Defesa oral: aprofundou (fraca). Ajuste de +0,2 sobre a nota antes da defesa (3,0 → 3,2); o texto acima trata da nota antes da defesa.');
    expect(out.avaliacao_por_descritor[1].justificativa).toBe('intacta');
  });
});
