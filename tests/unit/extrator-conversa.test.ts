/**
 * O extrator de conversa é o instrumento que produz a nota de T1 — o número que
 * o painel de evolução compara com o mapeamento. Este arquivo cobre as quatro
 * coisas dele que, ao quebrar, quebram em SILÊNCIO: a lista de descritores que
 * entra no prompt, o rótulo de quem fala na transcrição, o rótulo de modo e o
 * grampo da nota.
 *
 * Por que importa: a medição de ruído de 09/09/2026 (docs/CUSTO-QUALIDADE.md)
 * trata este módulo como o instrumento de produção. Se ele passar a montar outro
 * prompt, o número medido deixa de descrever o que roda, e nada na tela acusa.
 */
import { describe, it, expect } from 'vitest';
import {
  EXTRATOR_CORE_SYSTEM,
  montarTranscript,
  montarUserExtracaoAnalytic,
  parseExtracaoResponse,
  validateExtracaoAnalytic,
} from '@/lib/season-engine/prompts/extrator-conversa';

const HISTORICO = [
  { role: 'assistant', content: 'O que você combinou com a escola?' },
  { role: 'user', content: 'Combinei a devolutiva do 5º ano.' },
  { role: 'assistant', content: 'E o que aconteceu?' },
  { role: 'user', content: 'Saiu um plano com 3 ações.' },
];

describe('montarTranscript', () => {
  it('rotula o colaborador como COLAB e a IA como IA, separando por linha vazia', () => {
    const t = montarTranscript(HISTORICO);
    expect(t).toBe(
      'IA: O que você combinou com a escola?\n\n'
      + 'COLAB: Combinei a devolutiva do 5º ano.\n\n'
      + 'IA: E o que aconteceu?\n\n'
      + 'COLAB: Saiu um plano com 3 ações.',
    );
  });

  it('trata qualquer role diferente de "user" como IA — o histórico tem system em trilhas antigas', () => {
    expect(montarTranscript([{ role: 'system', content: 'x' }])).toBe('IA: x');
  });
});

describe('montarUserExtracaoAnalytic', () => {
  const transcript = montarTranscript(HISTORICO);

  it('pede um item do JSON para CADA descritor coberto', () => {
    const descritores = ['Definição de metas', 'Gestão de riscos', 'Entrega de resultados'];
    const user = montarUserExtracaoAnalytic({ transcript, descritores, tipoConversa: 'analytic' });

    // A semana cobre N descritores e a extração tem que devolver N leituras: a
    // versão que devolvia UMA deixou 136 de 364 pares de macae chegarem ao
    // fechamento como "(sem evidência registrada)".
    for (const d of descritores) {
      expect(user).toContain(`"descritor": "${d}"`);
    }
    expect(user.match(/"descritor":/g)).toHaveLength(descritores.length);
    expect(user).toContain(`DESCRITORES A AVALIAR: ${descritores.join(', ')}`);
  });

  it('carrega a transcrição inteira — é a única fonte que o extrator tem', () => {
    const user = montarUserExtracaoAnalytic({ transcript, descritores: ['X'], tipoConversa: 'analytic' });
    expect(user).toContain(transcript);
  });

  it('diz ao modelo QUAL conversa ele está lendo (cenário escrito × relato prático)', () => {
    const escrito = montarUserExtracaoAnalytic({ transcript, descritores: ['X'], tipoConversa: 'analytic' });
    const pratico = montarUserExtracaoAnalytic({ transcript, descritores: ['X'], tipoConversa: 'missao_feedback' });
    expect(escrito).toContain('MODO: analytic (resposta a cenário escrito)');
    expect(pratico).toContain('MODO: missao_feedback (evidência prática real)');
    expect(escrito).not.toBe(pratico);
  });

  it('mantém a régua de nota e a proibição de inflar', () => {
    const user = montarUserExtracaoAnalytic({ transcript, descritores: ['X'], tipoConversa: 'analytic' });
    expect(user).toContain('nota entre 1.0 e 4.0 — não infle sem sustentação');
    expect(user).toContain('NÃO transforme intenção em evidência de execução');
  });
});

describe('EXTRATOR_CORE_SYSTEM', () => {
  it('proíbe completar lacunas e exige JSON cru (o parser não tolera prosa)', () => {
    expect(EXTRATOR_CORE_SYSTEM).toContain('Você NÃO está completando lacunas.');
    expect(EXTRATOR_CORE_SYSTEM).toContain('RETORNE APENAS JSON VÁLIDO');
  });
});

describe('parseExtracaoResponse', () => {
  it('tolera a cerca de markdown que o modelo insiste em emitir', () => {
    expect(parseExtracaoResponse('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(parseExtracaoResponse('  {"a":2}  ')).toEqual({ a: 2 });
  });
});

describe('validateExtracaoAnalytic', () => {
  it('grampeia a nota na faixa da régua e arredonda em 1 decimal', () => {
    const out = validateExtracaoAnalytic({
      avaliacao_por_descritor: [
        { descritor: 'a', nota: 9.9 },
        { descritor: 'b', nota: -3 },
        { descritor: 'c', nota: 2.77 },
      ],
    }, ['a', 'b', 'c']);
    expect(out.avaliacao_por_descritor.map((d: any) => d.nota)).toEqual([4, 1, 2.8]);
  });

  it('nota ausente ou não-numérica cai em 2.0, não em zero nem em NaN', () => {
    // 2.0 é o meio da régua: o lado que não promove nem reprova por dado faltando.
    const out = validateExtracaoAnalytic({
      avaliacao_por_descritor: [{ descritor: 'a' }, { descritor: 'b', nota: 'alta' }],
    }, ['a', 'b']);
    expect(out.avaliacao_por_descritor.map((d: any) => d.nota)).toEqual([2, 2]);
  });

  it('força de evidência inválida cai em "fraca" — o lado que NÃO vota na convergência', () => {
    // `qualitativaSustenta` exclui 'fraca'. Um default diferente faria um item
    // malformado virar evidência positiva no relatório do gestor.
    const out = validateExtracaoAnalytic({
      avaliacao_por_descritor: [{ descritor: 'a', nota: 3, forca_evidencia: 'altíssima' }],
    }, ['a']);
    expect(out.avaliacao_por_descritor[0].forca_evidencia).toBe('fraca');
  });

  it('resposta sem o array não explode: vira lista vazia e campos vazios', () => {
    const out = validateExtracaoAnalytic({}, ['a']);
    expect(out.avaliacao_por_descritor).toEqual([]);
    expect(out.sintese_bloco).toBe('');
    expect(out.alertas_metodologicos).toEqual([]);
  });
});
